// Liquid Glass sheets for the shell's menu, rules, accounts and leaderboards dialogs. sheetOrigin is the rule the unit
// tests cover. openSheet opens a dialog and points its transform origin at the control that opened it, so the sheet
// grows from there (the .ui-glass-sheet rules in theme.css).
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
  dialog.showModal();
  if(!trigger){dialog.style.removeProperty('--sheet-origin');return;}
  const sheet={left:dialog.offsetLeft,top:dialog.offsetTop,width:dialog.offsetWidth,height:dialog.offsetHeight};
  dialog.style.setProperty('--sheet-origin',sheetOrigin(trigger.getBoundingClientRect(),sheet));
}
