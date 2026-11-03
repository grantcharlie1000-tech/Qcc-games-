// Swipe down to dismiss for the shared sheets. A drag from the grab handle or the sheet header always moves the sheet; a drag in the
// body moves it only when the body is scrolled to the top and the finger is going down. The sheet follows the finger, rubber-bands a
// little upward, and on release either springs back or leaves and runs the same close path as Escape (a cancelable cancel event, then
// close(), so each owner's cancel handler, focus return and state stay in charge). dismissDecision and rubberBand are what the unit tests cover.

/** Fraction of the sheet's height that dismisses on release. */
export const DISMISS_FRACTION=.28;
/** Downward speed, in px per ms, that dismisses a shorter flick. */
export const FLICK_VELOCITY=.5;
const FLICK_MIN_DISTANCE=24;
const RUBBER_MAX=14;
const SLOP=6;

export function dismissDecision(distance:number,height:number,velocity:number):boolean{
  if(distance<=0)return false;
  return distance>=height*DISMISS_FRACTION||(velocity>=FLICK_VELOCITY&&distance>=FLICK_MIN_DISTANCE);
}

/** Downward travel is followed 1:1. Upward travel resists and never passes RUBBER_MAX. */
export function rubberBand(delta:number):number{
  return delta>=0?delta:-RUBBER_MAX*(1-Math.exp(delta/(RUBBER_MAX*3)));
}

const INTERACTIVE='button,a[href],input,select,textarea,label,summary,[contenteditable],[role=slider],[role=button]';
const ZONE='.sheet-grabber,.dialog-head';
/** The handle, the header row, or a sheet's own leading title (the accounts sheet has no header row). */
function inZone(target:Element,sheet:HTMLElement):boolean{
  if(target.closest(ZONE))return true;
  const title=target.closest('h1,h2');
  return !!title&&title.parentElement===sheet&&sheet.querySelector(':scope>h1,:scope>h2')===title;
}

function reducedMotion():boolean{
  return document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Runs the sheet's own Escape path. Returns whether the sheet closed. */
export function requestSheetDismiss(dialog:HTMLDialogElement):boolean{
  if(!dialog.open)return true;
  if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
  return !dialog.open;
}

/** True when nothing between target and sheet (inclusive) is scrolled down. */
function atTop(target:Element,sheet:HTMLElement):boolean{
  for(let node:Element|null=target;node;node=node.parentElement){
    if(node instanceof HTMLElement&&node.scrollTop>0)return false;
    if(node===sheet)break;
  }
  return true;
}

export function bindSheetSwipe(dialog:HTMLDialogElement):()=>void{
  const abort=new AbortController(),signal=abort.signal;
  // A real element under the decorative ::before handle, so it can take touch-action:none. Invisible; the handle look is unchanged.
  const grabber=dialog.querySelector<HTMLElement>(':scope>.sheet-grabber')??Object.assign(document.createElement('div'),{className:'sheet-grabber'});
  grabber.setAttribute('aria-hidden','true');
  const ensureGrabber=()=>{if(grabber.parentElement!==dialog)dialog.prepend(grabber);};
  ensureGrabber();
  // A re-render that replaces the sheet's children would take the hit area with it.
  const children=new MutationObserver(ensureGrabber);children.observe(dialog,{childList:true});
  signal.addEventListener('abort',()=>children.disconnect());
  // The handle (and so the gesture) shows only in the phone layout, matching the ::before rule.
  const handleShown=()=>getComputedStyle(grabber).display!=='none';
  let drag:{id:number|'touch';startY:number;startX:number;engaged:boolean;samples:{y:number;t:number}[];height:number}|null=null;
  let timer=0;
  const setOffset=(y:number|null)=>{
    if(y===null){dialog.style.removeProperty('translate');dialog.removeAttribute('data-sheet-dragging');return;}
    dialog.style.translate=`0 ${y}px`;
  };
  const begin=(id:number|'touch',x:number,y:number,engaged:boolean)=>{
    clearTimeout(timer);
    drag={id,startX:x,startY:y,engaged,samples:[{y,t:performance.now()}],height:dialog.getBoundingClientRect().height||1};
    if(engaged)engage();
  };
  const engage=()=>{
    if(!drag)return;
    drag.engaged=true;dialog.setAttribute('data-sheet-dragging','');
    dialog.style.transition='none';
  };
  const move=(y:number)=>{
    if(!drag?.engaged)return;
    const t=performance.now();drag.samples.push({y,t});
    while(drag.samples.length>2&&t-drag.samples[0].t>100)drag.samples.shift();
    setOffset(rubberBand(y-drag.startY));
  };
  const end=(y:number|null)=>{
    const current=drag;drag=null;
    if(!current?.engaged)return;
    const distance=y===null?0:y-current.startY;
    const first=current.samples[0],last=current.samples[current.samples.length-1];
    const velocity=last.t>first.t?(last.y-first.y)/(last.t-first.t):0;
    const quick=reducedMotion();
    if(y!==null&&dismissDecision(distance,current.height,velocity)){
      const gone=()=>{if(!requestSheetDismiss(dialog))springBack(quick);};
      if(quick){gone();return;}
      const remaining=Math.max(0,current.height+16-distance);
      const ms=Math.round(Math.min(220,Math.max(120,velocity>0?remaining/velocity:220)));
      dialog.style.transition=`translate ${ms}ms cubic-bezier(.2,.7,.3,1)`;
      setOffset(current.height+16);
      timer=window.setTimeout(gone,ms);
    }else springBack(quick);
  };
  const springBack=(quick:boolean)=>{
    dialog.removeAttribute('data-sheet-dragging');
    if(quick){dialog.style.removeProperty('transition');setOffset(null);return;}
    dialog.style.transition='translate 260ms cubic-bezier(.2,1.1,.3,1)';
    setOffset(0);
    timer=window.setTimeout(()=>{if(!drag){dialog.style.removeProperty('transition');setOffset(null);}},280);
  };
  // Handle and header: Pointer Events, captured, with touch-action:none in CSS so iOS never claims the pan.
  dialog.addEventListener('pointerdown',event=>{
    if(drag||!event.isPrimary||event.button>0||!handleShown())return;
    const target=event.target instanceof Element?event.target:null;
    if(!target||!inZone(target,dialog)||target.closest(INTERACTIVE))return;
    // Mouse drags only from the handle itself; touch and pen from the whole header.
    if(event.pointerType==='mouse'&&!target.closest('.sheet-grabber'))return;
    begin(event.pointerId,event.clientX,event.clientY,true);
    try{(event.target as Element).setPointerCapture(event.pointerId);}catch{/* Synthetic pointers cannot be captured. */}
  },{signal});
  dialog.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId)move(event.clientY);},{signal});
  dialog.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId)end(event.clientY);},{signal});
  dialog.addEventListener('pointercancel',event=>{if(drag?.id===event.pointerId)end(null);},{signal});
  // Body: Touch Events, because the body keeps native scrolling (pan-y) and only a touchmove can take the gesture over at the top.
  dialog.addEventListener('touchstart',event=>{
    if(drag||event.touches.length!==1||!handleShown())return;
    const target=event.target instanceof Element?event.target:null;
    if(!target||inZone(target,dialog)||target.closest(INTERACTIVE)||!atTop(target,dialog))return;
    const touch=event.touches[0];begin('touch',touch.clientX,touch.clientY,false);
  },{signal,passive:true});
  dialog.addEventListener('touchmove',event=>{
    if(drag?.id!=='touch')return;
    const touch=event.touches[0];if(!touch)return;
    if(!drag.engaged){
      const dy=touch.clientY-drag.startY,dx=touch.clientX-drag.startX;
      if(Math.abs(dy)<SLOP&&Math.abs(dx)<SLOP)return;
      // Upward or sideways: the body scrolls as usual.
      if(dy<=0||Math.abs(dx)>Math.abs(dy)||dialog.scrollTop>0){drag=null;return;}
      engage();drag.startY=touch.clientY;
    }
    if(event.cancelable)event.preventDefault();
    move(touch.clientY);
  },{signal,passive:false});
  dialog.addEventListener('touchend',event=>{if(drag?.id==='touch')end(event.changedTouches[0]?.clientY??null);},{signal});
  dialog.addEventListener('touchcancel',()=>{if(drag?.id==='touch')end(null);},{signal});
  return()=>{
    abort.abort();clearTimeout(timer);drag=null;
    // The exit transition starts from wherever the sheet was let go; the next open resets it.
    dialog.removeAttribute('data-sheet-dragging');
  };
}

/** Called before showModal, so the entry animation starts from the sheet's own resting place. */
export function resetSheetSwipe(dialog:HTMLDialogElement):void{
  dialog.style.removeProperty('translate');dialog.style.removeProperty('transition');dialog.removeAttribute('data-sheet-dragging');
}
