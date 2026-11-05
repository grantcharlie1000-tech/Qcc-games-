import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {observeSettledResize} from '../../src/ui/settled-resize';

// A DOM-free event target supplies only the platform boundaries. The real
// scheduler decides when the expensive settled-size work may run.
class Surface extends EventTarget{
  width=320;
  animations:{transitionProperty:string;playState:string}[]=[];
  getAnimations(){return this.animations;}
}
let notify:()=>void,disconnect:ReturnType<typeof vi.fn>,frames:Map<number,FrameRequestCallback>,nextFrame:number;
beforeEach(()=>{
  frames=new Map();nextFrame=0;disconnect=vi.fn();
  vi.stubGlobal('ResizeObserver',class{
    constructor(callback:()=>void){notify=callback;}
    observe(){}
    disconnect=disconnect;
  });
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++nextFrame,cb);return nextFrame;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
});
afterEach(()=>vi.unstubAllGlobals());
const tick=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(0));};
function transition(surface:Surface,type:string,propertyName='width'){
  const event=new Event(type);Object.defineProperty(event,'propertyName',{value:propertyName});surface.dispatchEvent(event);
}
const setup=()=>{
  const surface=new Surface(),built:number[]=[],live:number[]=[];
  const dispose=observeSettledResize(surface as unknown as HTMLElement,()=>built.push(surface.width),()=>live.push(surface.width));
  return {surface,built,live,dispose};
};

test('a width morph builds once at its final size, not once for each animation frame',()=>{
  const {surface,built,live}=setup();notify();expect(built).toEqual([320]);
  surface.animations=[{transitionProperty:'width',playState:'running'}];
  for(let width=300;width>=60;width-=20){surface.width=width;notify();}
  expect(built).toEqual([320]);expect(live.length).toBe(13);
  surface.width=56;surface.animations=[];
  transition(surface,'transitionend');tick();
  expect(built).toEqual([320,56]);
  // ResizeObserver may report the same final size afterward; the consumer's
  // normal dimension cache still handles that redundant notification.
});

test('reversing an unfinished morph never builds its interrupted size',()=>{
  const {surface,built}=setup();
  surface.animations=[{transitionProperty:'width',playState:'running'}];surface.width=140;notify();
  transition(surface,'transitioncancel');
  surface.animations=[{transitionProperty:'width',playState:'running'}];tick();expect(built).toEqual([]);
  surface.width=320;surface.animations=[];transition(surface,'transitionend');tick();expect(built).toEqual([320]);
});

test('turning reduced motion on during a morph flushes its final size after cancellation',()=>{
  const {surface,built}=setup();
  surface.animations=[{transitionProperty:'height',playState:'running'}];surface.width=150;notify();
  surface.width=56;surface.animations=[];transition(surface,'transitioncancel','height');tick();expect(built).toEqual([56]);
});

test('ordinary resizes and opacity-only fades do not delay the map',()=>{
  const {surface,built}=setup();
  surface.animations=[{transitionProperty:'opacity',playState:'running'}];notify();
  surface.width=390;notify();expect(built).toEqual([320,390]);
});

test('a detached route disposes pending work and transition listeners',()=>{
  const {surface,built,dispose}=setup();
  surface.animations=[{transitionProperty:'width',playState:'running'}];notify();
  surface.animations=[];transition(surface,'transitionend');dispose();tick();transition(surface,'transitionend');tick();notify();
  expect(built).toEqual([]);expect(disconnect).toHaveBeenCalledOnce();
});

test('canceling directly back to the starting size still notifies the settled consumer',()=>{
  const {surface,built,live}=setup();notify();
  surface.animations=[{transitionProperty:'width',playState:'running'}];surface.width=140;notify();
  surface.width=320;surface.animations=[];
  transition(surface,'transitioncancel');tick();
  expect(live).toEqual([140]);
  // The settled callback must run even if expensive content at this size is
  // already cached: its live display geometry may have changed in between.
  expect(built).toEqual([320,320]);
});
