// Liquid Glass sheets for the shell's menu, rules, accounts and leaderboards dialogs. sheetOrigin is the rule the unit
// tests cover. openSheet opens a dialog and points its transform origin at the control that opened it, so the sheet
// grows from there (the .ui-glass-sheet rules in theme.css).
import {bindGlass} from './glass';
import {bindSheetLens} from './webgl-glass';
import {syncSheetIconInk,bindGlassInk} from './glass-ink';
const closeControls=new WeakMap<HTMLDialogElement,()=>void>();

function bindCloseControls(dialog:HTMLDialogElement):void{
  closeControls.get(dialog)?.();
  const disposers=new Map<HTMLElement,()=>void>();
  const disposeInk=bindGlassInk(dialog);
  const disposeLens=bindSheetLens(dialog);
  const disposeDismiss=bindDismiss(dialog);
  const sync=()=>{
    syncSheetIconInk(dialog);
    const controls=new Set(dialog.querySelectorAll<HTMLElement>('.dialog-head .icon-button,.movies-drawer-head [data-action=close-drawer]'));
    for(const [button,dispose] of disposers)if(!controls.has(button)){dispose();disposers.delete(button);}
    for(const button of controls)if(!disposers.has(button)){
      button.classList.add('ui-tab','arcade-glass','glass-control','sheet-close-glass');
      disposers.set(button,bindGlass(button).dispose);
    }
  };
  const dispose=()=>{
    observer.disconnect();disposeInk();disposeLens();disposeDismiss();dialog.removeEventListener('close',dispose);
    disposers.forEach(dispose=>dispose());disposers.clear();closeControls.delete(dialog);
  };
  // A Movies re-render can detach an open drawer without firing close.
  const observer=new MutationObserver(records=>{
    if(!dialog.isConnected)dispose();
    else if(records.some(record=>dialog.contains(record.target)))sync();
  });
  sync();
  observer.observe(document.body,{childList:true,subtree:true});
  dialog.addEventListener('close',dispose,{once:true});
  closeControls.set(dialog,dispose);
}
/** Close a sheet the way Escape does: its cancel handlers run first and may keep it open. */
export function requestSheetClose(dialog:HTMLDialogElement):void{
  if(dialog.open&&dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
}

/** Whether a pull of this distance and speed dismisses a sheet: a third of its height, or a quick downward flick. */
function pullDismisses(distance:number,velocity:number,height:number):boolean{
  return distance>Math.min(140,height/3)||(distance>24&&velocity>0.5);
}

const outside=(dialog:HTMLDialogElement,x:number,y:number)=>{
  const r=dialog.getBoundingClientRect();
  return x<r.left||x>r.right||y<r.top||y>r.bottom;
};
// Inside a sheet these keep their own touch gestures.
const OWN_GESTURES='input,textarea,select,[contenteditable="true"]';
// A list inside the sheet that has scrolled keeps a downward drag to scroll back up.
const innerScrolled=(target:EventTarget|null,dialog:HTMLDialogElement)=>{
  for(let node=target instanceof Element?target:null;node&&node!==dialog;node=node.parentElement)if(node.scrollTop>0)return true;
  return false;
};

// Sheets close like native ones: a tap on the dimmed area (as Escape does), and on phones a pull down from the top of the sheet.
function bindDismiss(dialog:HTMLDialogElement):()=>void{
  const events=new AbortController(),options={signal:events.signal};
  let pressedOutside=false;
  dialog.addEventListener('pointerdown',event=>{pressedOutside=event.target===dialog&&outside(dialog,event.clientX,event.clientY);},options);
  dialog.addEventListener('click',event=>{
    if(pressedOutside&&event.target===dialog&&outside(dialog,event.clientX,event.clientY))requestSheetClose(dialog);
    pressedOutside=false;
  },options);
  const phone=matchMedia('(max-width:639px)');
  let start:{x:number;y:number;t:number}|undefined,pulling=false,last={y:0,t:0},velocity=0;
  const reset=()=>{dialog.style.removeProperty('translate');dialog.style.removeProperty('transition');};
  dialog.addEventListener('touchstart',event=>{
    start=undefined;pulling=false;
    if(!phone.matches||event.touches.length!==1||dialog.scrollTop>0)return;
    if(event.target instanceof Element&&event.target.closest(OWN_GESTURES)||innerScrolled(event.target,dialog))return;
    const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY,t:event.timeStamp};last={y:touch.clientY,t:event.timeStamp};velocity=0;
  },{...options,passive:true});
  dialog.addEventListener('touchmove',event=>{
    if(!start||event.touches.length!==1)return;
    const touch=event.touches[0],dy=touch.clientY-start.y,dx=touch.clientX-start.x;
    if(!pulling){
      // Hold the page still from the first downward pixel, so iOS does not start its own bounce first.
      if(dy>0&&dy>=Math.abs(dx)&&dialog.scrollTop<=0&&event.cancelable)event.preventDefault();
      if(Math.abs(dy)<8&&Math.abs(dx)<8)return;
      // Up, sideways or a sheet that has scrolled: the sheet's own scrolling keeps the gesture.
      if(dy<=0||Math.abs(dx)>dy||dialog.scrollTop>0){start=undefined;return;}
      pulling=true;dialog.style.transition='none';
    }
    if(event.cancelable)event.preventDefault();
    const dt=Math.max(1,event.timeStamp-last.t);velocity=(touch.clientY-last.y)/dt;last={y:touch.clientY,t:event.timeStamp};
    dialog.style.translate=`0 ${Math.max(0,dy)}px`;
  },{...options,passive:false});
  const finish=(event:TouchEvent)=>{
    if(!start)return;
    const was=pulling,distance=last.y-start.y;start=undefined;pulling=false;
    // A pull held still before release is not a flick.
    if(event.timeStamp-last.t>100)velocity=0;
    if(!was)return;
    dialog.style.removeProperty('transition');
    if(event.type==='touchend'&&pullDismisses(distance,velocity,dialog.offsetHeight)){
      dialog.style.translate='0 100%';
      requestSheetClose(dialog);
      // Cancel handlers can keep the sheet open (a sign-in in progress); it then springs back.
      if(dialog.open)reset();else setTimeout(()=>{if(!dialog.open)reset();},240);
    }else reset();
  };
  dialog.addEventListener('touchend',finish,options);
  dialog.addEventListener('touchcancel',finish,options);
  // A sheet that a pull just closed keeps its offset until its exit has played; finish() and openSheet clear it.
  return ()=>{events.abort();if(dialog.open)reset();};
}

type Box=Pick<DOMRectReadOnly,'left'|'top'|'width'|'height'>;

// The trigger's centre measured from the sheet's top-left corner, clamped to the sheet's box and rounded to whole pixels.
export function sheetOrigin(trigger:Box,sheet:Box):string{
  const inside=(offset:number,size:number)=>Math.round(Math.min(Math.max(offset,0),size));
  const x=trigger.left+trigger.width/2-sheet.left;
  const y=trigger.top+trigger.height/2-sheet.top;
  return `${inside(x,sheet.width)}px ${inside(y,sheet.height)}px`;
}

// Opens the dialog as a modal, then sets where it grows from. The sheet's box comes from its offset values, which ignore
// the transform of the entry animation, so the origin is measured against the layout the sheet settles into.
export function openSheet(dialog:HTMLDialogElement,trigger?:Element|null):void{
  // Shared app dialogs opt in. Movies-specific sheets retain their material.
  if(['menu','game-options','rules-dialog','accounts-dialog','leaderboard-dialog','apps-dialog','social-compose','social-post-menu','social-shortcuts','apps-report','apps-confirm','chat-info','chat-send-photo','chat-message-menu','predictions-trade'].includes(dialog.id)){
    dialog.classList.add('arcade-sheet');
    dialog.dataset.glassTone=document.body.classList.contains('study-active')?'light':document.querySelector<HTMLElement>('.game-view')?.dataset.glassTone??(document.body.classList.contains('movies-active')||document.body.classList.contains('social-active')||document.body.classList.contains('chat-active')||document.body.classList.contains('predictions-active')?'dark':'light');
  }
  // A pull that closed this sheet a moment ago must not leave it offset.
  dialog.style.removeProperty('translate');dialog.style.removeProperty('transition');
  dialog.showModal();
  bindCloseControls(dialog);
  if(!trigger){dialog.style.removeProperty('--sheet-origin');return;}
  const sheet={left:dialog.offsetLeft,top:dialog.offsetTop,width:dialog.offsetWidth,height:dialog.offsetHeight};
  dialog.style.setProperty('--sheet-origin',sheetOrigin(trigger.getBoundingClientRect(),sheet));
}
