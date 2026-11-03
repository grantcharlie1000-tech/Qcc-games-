// Liquid Glass sheets for the shell's menu, rules, accounts and leaderboards dialogs. sheetOrigin is the rule the unit
// tests cover. openSheet opens a dialog and points its transform origin at the control that opened it, so the sheet
// grows from there (the .ui-glass-sheet rules in theme.css).
import {bindGlass} from './glass';
import {bindSheetLens} from './webgl-glass';
import {syncSheetIconInk,bindGlassInk} from './glass-ink';
import {bindSheetSwipe,resetSheetSwipe} from './sheet-swipe';
import {lockPageScroll} from './scroll-lock';
const closeControls=new WeakMap<HTMLDialogElement,()=>void>();

function bindCloseControls(dialog:HTMLDialogElement):void{
  closeControls.get(dialog)?.();
  const disposers=new Map<HTMLElement,()=>void>();
  const disposeInk=bindGlassInk(dialog);
  const disposeLens=bindSheetLens(dialog);
  // Every modal sheet holds the page still behind it; sheets that show a grab handle also swipe down to close.
  const unlockScroll=lockPageScroll();
  const disposeSwipe=dialog.classList.contains('arcade-sheet')?bindSheetSwipe(dialog):()=>{};
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
    observer.disconnect();disposeInk();disposeLens();disposeSwipe();unlockScroll();dialog.removeEventListener('close',dispose);
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
  if(['menu','game-options','rules-dialog','accounts-dialog','leaderboard-dialog'].includes(dialog.id)){
    dialog.classList.add('arcade-sheet');
    dialog.dataset.glassTone=document.body.classList.contains('study-active')?'light':document.querySelector<HTMLElement>('.game-view')?.dataset.glassTone??(document.body.classList.contains('movies-active')?'dark':'light');
  }
  resetSheetSwipe(dialog);
  dialog.showModal();
  bindCloseControls(dialog);
  if(!trigger){dialog.style.removeProperty('--sheet-origin');return;}
  const sheet={left:dialog.offsetLeft,top:dialog.offsetTop,width:dialog.offsetWidth,height:dialog.offsetHeight};
  dialog.style.setProperty('--sheet-origin',sheetOrigin(trigger.getBoundingClientRect(),sheet));
}
