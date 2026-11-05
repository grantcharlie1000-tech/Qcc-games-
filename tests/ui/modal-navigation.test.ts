import {afterEach,expect,it,vi} from 'vitest';
import {suppressNavigationUnderSheets} from '../../src/ui/modal-navigation';

// The controller runs unchanged. This small DOM boundary lets each test choose
// exactly when focus moves relative to MutationObserver delivery and the next
// animation frame, rather than relying on a browser winning the same race.
function harness(native=true){
  const listeners=new Map<string,((event:{target:Node})=>void)[]>();
  const frames:FrameRequestCallback[]=[];
  let mutations!:(records:unknown[])=>void;
  class Node{
    isConnected=true;
    inert=false;
    visible=true;
    attributes=new Set<string>();
    children:Node[]=[];
    constructor(readonly kind:string,readonly parent:Node|null=null){parent?.children.push(this);}
    matches(selector:string):boolean{
      return selector.split(',').some(part=>part==='[inert]'?this.inert:part==='dialog'?this instanceof Dialog:part==='[role="dialog"]'?this.kind==='panel':part==='.game-dock'?this.kind==='chrome':part==='.section-navigation'?false:part==='a[href]'||part==='[tabindex]'?false:part===this.kind);
    }
    closest(selector:string):Node|null{return this.matches(selector)?this:this.parent?.closest(selector)??null;}
    querySelector(selector:string):Node|null{return this.children.find(child=>child.matches(selector))??null;}
    hasAttribute(name:string){return this.attributes.has(name);}
    toggleAttribute(name:string,value:boolean){if(value)this.attributes.add(name);else this.attributes.delete(name);}
    getClientRects(){return this.visible?[{}]:[];}
    focus(){if(!this.isConnected||this.closest('[inert]'))return;doc.activeElement=this;emit('focusin',this);}
  }
  class Dialog extends Node{open=false;}
  const body=new Node('body'),html=new Node('html'),chrome=new Node('chrome'),menu=new Node('button',chrome),otherMenu=new Node('button',chrome);
  const panel=native?new Dialog('dialog'):new Node('panel');panel.visible=false;
  const close=new Node('button',panel),canvas=new Node('canvas'),tube=new Node('button');
  const doc={body,documentElement:html,activeElement:body,addEventListener(name:string,listener:(event:{target:Node})=>void){listeners.set(name,[...(listeners.get(name)??[]),listener]);},querySelectorAll(selector:string){return [chrome,panel].filter(node=>node.matches(selector));}};
  const emit=(name:string,target:Node)=>{for(const listener of listeners.get(name)??[])listener({target});};
  const sync=()=>mutations([{type:'attributes',target:panel}]);
  vi.stubGlobal('document',doc);vi.stubGlobal('Element',Node);vi.stubGlobal('HTMLElement',Node);vi.stubGlobal('HTMLDialogElement',Dialog);
  vi.stubGlobal('getComputedStyle',(node:Node)=>({display:node.visible?'block':'none',visibility:'visible'}));
  vi.stubGlobal('MutationObserver',class{constructor(callback:typeof mutations){mutations=callback;}observe(){}});
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.push(callback);return frames.length;});
  suppressNavigationUnderSheets();
  return {doc,body,html,chrome,menu,otherMenu,panel,close,canvas,tube,
    open(trigger=menu){trigger.focus();panel.visible=true;if(panel instanceof Dialog){panel.open=true;close.focus();}sync();},
    closePanel(active=body){panel.visible=false;if(panel instanceof Dialog)panel.open=false;doc.activeElement=active;sync();},
    flush(){for(const callback of frames.splice(0))callback(0);},
  };
}
afterEach(()=>vi.unstubAllGlobals());

it.each([true,false])('restores unclaimed focus after closing a %s native panel',native=>{
  const h=harness(native);h.open();expect(h.chrome.inert).toBe(true);expect(h.doc.activeElement).toBe(h.close);
  h.closePanel();h.flush();expect(h.chrome.inert).toBe(false);expect(h.doc.activeElement).toBe(h.menu);
});

for(const control of ['canvas','tube'] as const)it(`keeps newly claimed ${control} focus when the deferred restoration runs`,()=>{
  const h=harness();h.open();h.closePanel();h[control].focus();h.flush();
  expect(h.doc.activeElement===h[control]).toBe(true);
});

it('keeps new game focus even when the controller moved focus into a non-native panel',()=>{
  const h=harness(false);h.open();h.closePanel();h.canvas.focus();h.flush();
  expect(h.doc.activeElement===h.canvas).toBe(true);
});

it('does not restore navigation while another panel has reopened',()=>{
  const h=harness();h.open();h.closePanel();h.open();h.flush();
  expect(h.chrome.inert).toBe(true);expect(h.doc.activeElement).toBe(h.close);
});

it.each(['removed','inert'] as const)('does not focus a %s return target',state=>{
  const h=harness();h.open();h.closePanel();if(state==='removed')h.menu.isConnected=false;else h.chrome.inert=true;
  h.flush();expect(h.doc.activeElement).toBe(h.body);
});

it('only restores the latest trigger after close, reopen and close before a frame',()=>{
  const h=harness();h.open();h.closePanel();h.open(h.otherMenu);h.closePanel();h.flush();
  expect(h.doc.activeElement===h.otherMenu).toBe(true);
});

it('preserves game focus claimed before close synchronization after moving focus into a panel',()=>{
  const h=harness(false);h.open();h.closePanel(h.canvas);h.flush();
  expect(h.doc.activeElement===h.canvas).toBe(true);
});

it('restores the trigger when focus still belongs to the closing panel',()=>{
  const h=harness();h.open();h.closePanel(h.close);h.flush();
  expect(h.doc.activeElement===h.menu).toBe(true);
});
