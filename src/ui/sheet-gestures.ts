import './sheet-gestures.css';

const SHEETS='.ui-glass-sheet,.arcade-sheet,body.in-game .mp-card';
const FORM_CONTROL='input,select,textarea,a[href],[contenteditable]:not([contenteditable=false]),.icon-button,[aria-label^="Close"],.mp-close,.ff-close,.ms-close';
const HEADER='.sheet-grabber,.dialog-head,.movies-drawer-head,.ms-menu-heading,.mp-title';
const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches||document.documentElement.classList.contains('reduce-motion');
const offset=(sheet:HTMLElement)=>parseFloat(getComputedStyle(sheet).translate.split(' ')[1])||0;
type Pull={id:number;x:number;y:number;base:number;distance:number;velocity:number;lastY:number;lastTime:number;active:boolean;header:boolean};

/** Enhance the existing sheet, retaining its native cancel/close/focus owner. */
function ensureGrabber(sheet:HTMLElement):void{
  const existing=sheet.querySelector<HTMLElement>(':scope>.sheet-grabber,:scope>.ui-drawer-handle');
  if(existing){if(!existing.classList.contains('sheet-grabber'))existing.classList.add('sheet-grabber');return;}
  const grabber=document.createElement('span');grabber.className='sheet-grabber';grabber.setAttribute('aria-hidden','true');sheet.prepend(grabber);
}
function enhance(sheet:HTMLElement):void{
  ensureGrabber(sheet);
  sheet.dataset.sheetGestures='';
  let pull:Pull|undefined,animation:Animation|undefined,blockClick=false,ownerClosing=false;
  const scrollers=new Set<HTMLElement>();
  const dim=sheet instanceof HTMLDialogElement?sheet:sheet.parentElement!;
  const originalScrim=getComputedStyle(dim).backgroundColor;
  if(dim!==sheet){dim.dataset.sheetScrim='';dim.style.setProperty('--sheet-original-scrim',originalScrim);}
  const setDim=(progress:number)=>dim.style.setProperty('--sheet-backdrop-opacity',String(Math.max(0,1-progress)));
  const policy=()=>sheet.toggleAttribute('data-sheet-at-top',sheet.scrollTop<=0&&![...scrollers].some(e=>sheet.contains(e)&&e.scrollTop>0));
  const clear=()=>{
    const id=pull?.id;pull=undefined;
    if(id!==undefined&&sheet.hasPointerCapture(id))sheet.releasePointerCapture(id);
    animation?.cancel();animation=undefined;
    sheet.removeAttribute('data-sheet-dragging');sheet.removeAttribute('data-sheet-settling');
    sheet.style.removeProperty('translate');dim.style.removeProperty('--sheet-backdrop-opacity');
  };
  const close=()=>{
    if(sheet instanceof HTMLDialogElement){
      sheet.dataset.sheetDragDismissed='';
      const allowed=sheet.dispatchEvent(new Event('cancel',{cancelable:true}));
      if(allowed)sheet.close();
      if(sheet.open)sheet.removeAttribute('data-sheet-drag-dismissed');
      // Accounts can cancel dismissal while a request is in progress.
      return !sheet.open;
    }
    const button=sheet.querySelector<HTMLButtonElement>('.ff-close,.mp-close,.ms-close,[aria-label^="Close"],[data-action=close]');
    if(!button||button.disabled)return false;
    // A reduced-motion dismissal is synchronous with pointerup. Do not suppress
    // the owner's close action along with the synthetic post-drag click.
    ownerClosing=true;try{button.click();}finally{ownerClosing=false;}
    return !!sheet.closest('[hidden]')||getComputedStyle(sheet).display==='none';
  };
  const settle=(to:number,velocity:number,dismiss:boolean)=>{
    const from=offset(sheet);animation?.cancel();
    sheet.removeAttribute('data-sheet-dragging');sheet.dataset.sheetSettling='';
    const finish=()=>{animation?.cancel();animation=undefined;if(dismiss&&!close()){settle(0,0,false);return;}clear();};
    setDim(dismiss?1:0);
    if(reduced()){if(dismiss)sheet.dataset.sheetDragDismissed='';finish();return;}
    // Damped spring: mass1/stiffness100/damping10, sampled for compositor-only
    // WAAPI translation. 500ms/bounce≈.2 matches the existing gesture motion.
    const frames:Keyframe[]=[],x=from-to,w=Math.sqrt(75),v=velocity*500;
    for(let i=0;i<=30;i++){
      const t=i/30,y=i===30?0:Math.exp(-5*t)*(x*Math.cos(w*t)+(v+5*x)/w*Math.sin(w*t));
      frames.push({translate:`0 ${to+y}px`,offset:i/30});
    }
    sheet.style.translate=`0 ${to}px`;
    animation=sheet.animate(frames,{duration:500,easing:'linear',fill:'both'});animation.onfinish=finish;
  };
  const scrolled=(event:Event)=>{if(event.target instanceof HTMLElement)scrollers.add(event.target);policy();};
  sheet.addEventListener('scroll',scrolled,true);policy();
  sheet.addEventListener('pointerdown',event=>{
    if(pull||!event.isPrimary||event.button!==0||!(event.target instanceof Element)||event.target.closest(FORM_CONTROL))return;
    const heading=sheet.querySelector(':scope>h1,:scope>h2');
    const header=!!event.target.closest(HEADER)||!!heading&&heading.contains(event.target);
    if(!header){
      for(let e:HTMLElement|null=event.target as HTMLElement;e&&sheet.contains(e);e=e.parentElement)if(e.scrollTop>0)return;
    }
    const base=offset(sheet);animation?.cancel();animation=undefined;sheet.removeAttribute('data-sheet-settling');
    // Keep the current compositor position when an interrupted spring is grabbed.
    if(base)sheet.style.translate=`0 ${base}px`;
    pull={id:event.pointerId,x:event.clientX,y:event.clientY,base,distance:0,velocity:0,lastY:event.clientY,lastTime:event.timeStamp,active:false,header};
  });
  sheet.addEventListener('pointermove',event=>{
    const p=pull;if(!p||p.id!==event.pointerId)return;
    const dx=event.clientX-p.x,dy=event.clientY-p.y;
    if(!p.active){
      if(Math.max(Math.abs(dx),Math.abs(dy))<5)return;
      if(Math.abs(dx)>Math.abs(dy)||!p.header&&dy<0){pull=undefined;return;}
      p.active=true;sheet.dataset.sheetDragging='';sheet.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    // Input timestamps retain the finger's velocity when painting/main-thread
    // work delays delivery; handler execution time would slow a genuine flick.
    const now=event.timeStamp,elapsed=now-p.lastTime;
    if(elapsed>0)p.velocity=(event.clientY-p.lastY)/elapsed;
    p.lastY=event.clientY;p.lastTime=now;p.distance=dy;
    const distance=dy<0?(reduced()?0:dy*.22):dy;
    sheet.style.translate=`0 ${p.base+distance}px`;setDim(Math.max(0,distance)/sheet.offsetHeight);
  },{passive:false});
  const release=(event:PointerEvent,cancelled=false)=>{
    const p=pull;if(!p||p.id!==event.pointerId)return;pull=undefined;
    if(sheet.hasPointerCapture(event.pointerId))sheet.releasePointerCapture(event.pointerId);
    if(!p.active)return;
    blockClick=true;setTimeout(()=>{blockClick=false;},0);
    const velocity=event.timeStamp-p.lastTime>100?0:p.velocity;
    const dismiss=!cancelled&&(p.distance>sheet.offsetHeight*.3||p.distance>32&&velocity>.5);
    settle(dismiss?innerHeight-sheet.getBoundingClientRect().top+offset(sheet)+24:0,velocity,dismiss);
  };
  sheet.addEventListener('pointerup',event=>release(event));
  sheet.addEventListener('pointercancel',event=>release(event,true));
  sheet.addEventListener('lostpointercapture',event=>{if(pull?.active)release(event,true);});
  sheet.addEventListener('click',event=>{if(blockClick&&!ownerClosing){event.preventDefault();event.stopImmediatePropagation();} },true);
  sheet.addEventListener('close',clear);
  // Owners may close/hide a panel during a drag, or reopen the same DOM node.
  new MutationObserver(()=>{
    if(sheet instanceof HTMLDialogElement){if(!sheet.open)clear();else sheet.removeAttribute('data-sheet-drag-dismissed');}
    else if(sheet.hidden||sheet.parentElement?.hidden)clear();
    policy();
  }).observe(sheet instanceof HTMLDialogElement?sheet:sheet.parentElement!,{attributes:true,attributeFilter:['open','hidden']});
}

/** One installer for shell, Movies and asynchronously mounted game sheets. */
export function installSheetGestures():void{
  const bound=new WeakSet<HTMLElement>();
  const scan=()=>{for(const sheet of document.querySelectorAll<HTMLElement>(SHEETS)){
    if(!bound.has(sheet)){bound.add(sheet);enhance(sheet);}
    else ensureGrabber(sheet); // Movie season redraws replace children in place.
  }};
  new MutationObserver(records=>{if(records.some(r=>r.target instanceof Element&&r.target.matches(SHEETS)
    ||r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(node=>node instanceof Element&&(node.matches(SHEETS)||node.querySelector(SHEETS)))))scan();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  scan();
}
