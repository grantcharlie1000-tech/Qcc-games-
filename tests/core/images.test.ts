import {expect,test} from 'vitest';
import {markImages,watchImages} from '../../src/ui/images';

type Handler=(e:Event)=>void;
type Reg={type:string;fn:Handler;capture:unknown};
// Fake element: classList is backed by a Set, and matches() understands the helper's selector list.
const el=(tag:string,cls:string[],state:{complete?:boolean;naturalWidth?:number}={})=>{
  const classes=new Set(cls);
  return {
    complete:state.complete??false,naturalWidth:state.naturalWidth??0,classes,
    classList:{add:(c:string)=>{classes.add(c);},remove:(c:string)=>{classes.delete(c);}},
    matches:(sel:string)=>sel.split(',').some(part=>{const [t,...rest]=part.trim().split('.');return t===tag&&rest.every(c=>classes.has(c));}),
  };
};
// Fake root: records listeners with their capture flag and answers querySelectorAll from its children.
const root=(children:ReturnType<typeof el>[]=[])=>{
  const classes=new Set<string>();
  const regs:Reg[]=[];
  return {
    classes,regs,
    classList:{add:(c:string)=>{classes.add(c);},remove:(c:string)=>{classes.delete(c);}},
    addEventListener:(type:string,fn:Handler,capture?:unknown)=>{regs.push({type,fn,capture});},
    removeEventListener:(type:string,fn:Handler,capture?:unknown)=>{const i=regs.findIndex(r=>r.type===type&&r.fn===fn&&r.capture===capture);if(i>=0)regs.splice(i,1);},
    querySelectorAll:(sel:string)=>children.filter(c=>c.matches(sel)),
  };
};
const fire=(r:ReturnType<typeof root>,type:string,target:unknown)=>{for(const reg of r.regs.filter(x=>x.type===type))reg.fn({target} as unknown as Event);};
const asRoot=(r:ReturnType<typeof root>)=>r as unknown as HTMLElement;

test('watchImages marks the root and listens for load and error in the capture phase',()=>{
  const r=root();
  watchImages(asRoot(r));
  expect(r.classes.has('ui-images')).toBe(true);
  expect(r.regs.map(x=>[x.type,x.capture])).toEqual([['load',true],['error',true]]);
});

test('a load event marks card and hero images loaded and clears failed',()=>{
  const r=root();watchImages(asRoot(r));
  const card=el('img',['ui-card-img','is-failed']);const hero=el('img',['ui-hero-backdrop']);
  fire(r,'load',card);fire(r,'load',hero);
  expect([...card.classes]).toEqual(['ui-card-img','is-loaded']);
  expect([...hero.classes]).toEqual(['ui-hero-backdrop','is-loaded']);
});

test('an error event marks images failed and clears loaded',()=>{
  const r=root();watchImages(asRoot(r));
  const card=el('img',['ui-card-img','is-loaded']);
  fire(r,'error',card);
  expect([...card.classes]).toEqual(['ui-card-img','is-failed']);
});

test('events from other images and from non-images are ignored',()=>{
  const r=root();watchImages(asRoot(r));
  const thumb=el('img',['game-thumb']);const div=el('div',['ui-card-img']);
  fire(r,'load',thumb);fire(r,'error',div);
  expect([...thumb.classes]).toEqual(['game-thumb']);
  expect([...div.classes]).toEqual(['ui-card-img']);
});

test('the disposer removes both listeners and the ui-images class',()=>{
  const r=root();const dispose=watchImages(asRoot(r));
  dispose();
  expect(r.regs).toEqual([]);
  expect(r.classes.has('ui-images')).toBe(false);
  const card=el('img',['ui-card-img']);fire(r,'load',card);
  expect([...card.classes]).toEqual(['ui-card-img']);
});

test('markImages marks complete images loaded or failed by natural width',()=>{
  const ok=el('img',['ui-card-img'],{complete:true,naturalWidth:300});
  const broken=el('img',['ui-card-img'],{complete:true,naturalWidth:0});
  const pending=el('img',['ui-hero-backdrop'],{complete:false,naturalWidth:0});
  const other=el('img',['game-thumb'],{complete:true,naturalWidth:300});
  const r=root([ok,broken,pending,other]);
  markImages(r as unknown as ParentNode);
  expect([...ok.classes]).toEqual(['ui-card-img','is-loaded']);
  expect([...broken.classes]).toEqual(['ui-card-img','is-failed']);
  expect([...pending.classes]).toEqual(['ui-hero-backdrop']);
  expect([...other.classes]).toEqual(['game-thumb']);
});

test('markImages replaces a stale state with the known one',()=>{
  const img=el('img',['ui-card-img','is-failed'],{complete:true,naturalWidth:120});
  markImages(root([img]) as unknown as ParentNode);
  expect([...img.classes]).toEqual(['ui-card-img','is-loaded']);
});

test('watchImages classifies images that finished before it attached',()=>{
  const done=el('img',['ui-card-img'],{complete:true,naturalWidth:300});
  const broken=el('img',['ui-card-img','is-loaded'],{complete:true,naturalWidth:0});
  const r=root([done,broken]);
  watchImages(asRoot(r));
  expect([...done.classes]).toEqual(['ui-card-img','is-loaded']);
  expect([...broken.classes]).toEqual(['ui-card-img','is-failed']);
});
