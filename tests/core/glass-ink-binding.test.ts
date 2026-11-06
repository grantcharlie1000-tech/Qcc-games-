import {afterEach,describe,expect,it,vi} from 'vitest';
import {bindGlassInk} from '../../src/ui/glass-ink';

// Node-only DOM boundary: layout, hit testing and browser scheduling are supplied
// here; the real binding, sampler, contrast calculation and ink writes all run.
class TestElement extends EventTarget {
  parentElement:TestElement|null=null;
  children:TestElement[]=[];
  childNodes: {nodeType:number;textContent:string}[]=[];
  dataset:Record<string,string>={};
  attributes=new Set<string>();
  classes=new Set<string>();
  properties=new Map<string,string>();
  classList={contains:(name:string)=>this.classes.has(name),add:(name:string)=>{this.classes.add(name);},remove:(name:string)=>{this.classes.delete(name);}};
  style={getPropertyValue:(name:string)=>this.properties.get(name)??'',setProperty:(name:string,value:string)=>{this.properties.set(name,value);},removeProperty:(name:string)=>{this.properties.delete(name);}};
  constructor(readonly tagName:string,classes=''){super();for(const name of classes.split(' ').filter(Boolean))this.classes.add(name);}
  append(...nodes:TestElement[]){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  matches(selector:string):boolean{
    return selector.split(/,(?![^()]*\))/).some(part=>{
      let rule=part.trim();
      if(rule.includes(':scope')||rule.includes(':has')||rule.includes('['))return false;
      const excluded=[...rule.matchAll(/:not\(([^)]+)\)/g)];
      rule=rule.replace(/:not\([^)]+\)/g,'');
      if(excluded.some(match=>this.matches(match[1])))return false;
      const tag=rule.match(/^[a-z]+/i)?.[0];
      return (!tag||tag===this.tagName)&&[...rule.matchAll(/\.([\w-]+)/g)].every(match=>this.classes.has(match[1]));
    });
  }
  closest(selector:string):TestElement|null{return this.matches(selector)?this:this.parentElement?.closest(selector)??null;}
  querySelectorAll(selector:string):TestElement[]{return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector:string):TestElement|null{return this.querySelectorAll(selector)[0]??null;}
  hasAttribute(name:string){return this.attributes.has(name);}
  removeAttribute(name:string){this.attributes.delete(name);}
  toggleAttribute(name:string,on:boolean){if(on)this.attributes.add(name);else this.attributes.delete(name);}
  getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:100,bottom:100,width:100,height:100};}
}

let dispose:(()=>void)|undefined;
afterEach(()=>{dispose?.();dispose=undefined;vi.unstubAllGlobals();});
function fixture(){
  const bar=new TestElement('div','arcade-glass floating-glass-group');
  const button=new TestElement('button'),svg=new TestElement('svg'),chevrons=new TestElement('span','nc-chevrons glass-ink'),label=new TestElement('span');
  button.append(svg,chevrons,label);bar.append(button);
  const background=new TestElement('div');
  const document=Object.assign(new EventTarget(),{
    hidden:false,documentElement:new TestElement('html'),
    querySelector:()=>null,
    querySelectorAll:(selector:string)=>selector.startsWith('html,body')?[background]:[],
    elementsFromPoint:()=>[background]
  });
  const media={matches:false,addEventListener(){},removeEventListener(){}};
  let brightness=0,accessible=false,frame:FrameRequestCallback|undefined;
  const matchMedia=(query:string)=>({...media,matches:accessible&&query==='(prefers-contrast: more)'});
  vi.stubGlobal('document',document);
  vi.stubGlobal('window',Object.assign(new EventTarget(),{matchMedia}));
  vi.stubGlobal('matchMedia',matchMedia);
  vi.stubGlobal('innerWidth',100);vi.stubGlobal('innerHeight',100);
  vi.stubGlobal('Element',TestElement);
  vi.stubGlobal('Node',{TEXT_NODE:3,DOCUMENT_POSITION_FOLLOWING:4});
  for(const name of ['HTMLImageElement','HTMLCanvasElement','HTMLVideoElement','HTMLIFrameElement'])vi.stubGlobal(name,class {});
  vi.stubGlobal('DOMRect',class {constructor(public x:number,public y:number,public width:number,public height:number){}get left(){return this.x;}get top(){return this.y;}get right(){return this.x+this.width;}get bottom(){return this.y+this.height;}});
  vi.stubGlobal('MutationObserver',class {observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});
  vi.stubGlobal('cancelAnimationFrame',()=>{frame=undefined;});
  vi.stubGlobal('getComputedStyle',(element:TestElement)=>({
    display:'block',visibility:'visible',opacity:'1',clip:'auto',color:'rgb(255,255,255)',
    backgroundColor:element===background?`rgb(${brightness},${brightness},${brightness})`:'rgba(0,0,0,0)',backgroundImage:'none',
    borderTopWidth:'0',borderBottomWidth:'0',borderLeftWidth:'0',borderRightWidth:'0',
    isolation:'auto',transform:'none',zIndex:'auto',position:'static'
  }));
  const flush=()=>{const callback=frame;frame=undefined;expect(callback,'binding schedules an update').toBeDefined();callback!(0);};
  dispose=bindGlassInk(bar as unknown as HTMLElement);
  return {bar,svg,chevrons,label,flush,change(value:number,contrast=false,textured=false){
    brightness=value;accessible=contrast;background.childNodes=textured?[{nodeType:3,textContent:'Backdrop text'}]:[];
    document.dispatchEvent(new Event('scroll'));flush();
  }};
}
const ink=(element:TestElement)=>element.style.getPropertyValue('--glass-adaptive-ink');
const expectNoAdaptiveInk=(element:TestElement)=>{
  expect.soft(ink(element)).toBe('');
  expect.soft(element.style.getPropertyValue('--glass-local-halo')).toBe('');
  expect.soft(element.hasAttribute('data-glass-halo')).toBe(false);
};

describe('glass ink binding',()=>{
  it('leaves SVG and CSS icons untouched while labels stay white across changing backdrops',()=>{
    const view=fixture();view.flush();
    for(const [brightness,color,textured] of [[0,'#fff',false],[255,'#fff',false],[0,'#fff',true]] as const){
      view.change(brightness,false,textured);
      expect(ink(view.label)).toBe(color);
      expect(view.label.hasAttribute('data-glass-halo')).toBe(textured||brightness===255);
      expect(view.label.style.getPropertyValue('--glass-local-halo')).toBe(textured||brightness===255?'rgb(0 0 0 / .8)':'transparent');
      expectNoAdaptiveInk(view.svg);expectNoAdaptiveInk(view.chevrons);
    }
  });
  it.each(['off','contrast'])('clears adaptive label colors in %s accessibility mode',mode=>{
    const view=fixture();view.flush();view.change(255);
    expect(ink(view.label)).toBe('#fff');
    if(mode==='off')view.bar.dataset.glass='off';
    view.change(255,mode==='contrast');
    expectNoAdaptiveInk(view.label);expectNoAdaptiveInk(view.svg);expectNoAdaptiveInk(view.chevrons);
  });
});
