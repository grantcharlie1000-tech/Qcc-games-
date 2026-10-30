// Input mode for focus rings. data-input on <html> is 'keyboard' after keyboard use and 'pointer' after any press, and
// the stylesheets draw a focus ring only in keyboard mode. Safari matches :focus-visible on a tapped field and on a control a
// script focuses, so the attribute decides instead. isKeyboardKey is the rule the unit tests cover.
export type InputMode='keyboard'|'pointer';

// The parts of an event target that decide whether a key is typing: its tag, its input type and whether it takes edits.
export interface KeyTarget{tag:string;type:string;editable:boolean}

// Inputs that take a key as a control rather than as text.
const CONTROL_INPUTS=new Set(['checkbox','radio','range','button','submit']);
const MODIFIERS=new Set(['Alt','AltGraph','CapsLock','Control','Fn','FnLock','Hyper','Meta','NumLock','OS','ScrollLock','Shift','Super','Symbol','SymbolLock']);

// Tab is always keyboard use. Any other key is, unless it is a lone modifier or it goes to a field that takes typed text.
export function isKeyboardKey(key:string,target:KeyTarget):boolean{
  if(key==='Tab')return true;
  if(MODIFIERS.has(key))return false;
  const typing=target.tag==='TEXTAREA'||target.tag==='SELECT'||target.editable||(target.tag==='INPUT'&&!CONTROL_INPUTS.has(target.type));
  return !typing;
}

function keyTarget(target:EventTarget|null):KeyTarget{
  if(!(target instanceof HTMLElement))return {tag:'',type:'',editable:false};
  return {tag:target.tagName,type:target instanceof HTMLInputElement?target.type:'',editable:target.isContentEditable};
}

// Wired once at startup. Both listeners run in the capture phase, so a click's handlers and a key's handlers see the new mode.
export function trackInputMode(root:HTMLElement=document.documentElement):void{
  const set=(mode:InputMode)=>{if(root.dataset.input!==mode)root.dataset.input=mode;};
  set('pointer');
  window.addEventListener('pointerdown',()=>set('pointer'),{capture:true,passive:true});
  window.addEventListener('keydown',event=>{if(isKeyboardKey(event.key,keyTarget(event.target)))set('keyboard');},{capture:true});
}
