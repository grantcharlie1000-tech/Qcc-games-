/** Temporary bridge to the existing dock HUD/action nodes. The central dock
 * owner can replace these two functions with its typed slots after merge.
 * This never creates, positions or skins a second dock. */
export function mountCompactHud(container:HTMLElement){
  const hud=container.closest('.game-view')?.querySelector<HTMLElement>('.game-hud');
  const element=document.createElement('span');element.className='game-compact-hud';element.setAttribute('role','img');
  Object.assign(element.style,{whiteSpace:'nowrap',fontSize:'12px',fontWeight:'600',lineHeight:'1.2',fontVariantNumeric:'tabular-nums',flexShrink:'0'});
  const previousPadding=hud?.style.paddingInline??'';
  if(hud){hud.style.paddingInline='10px';hud.append(element);}
  const hideSources=()=>{for(const source of hud?.querySelectorAll<HTMLElement>('.game-hud-item')??[]){source.style.display='none';if(!source.hidden)source.hidden=true;}};
  const observer=new MutationObserver(hideSources);
  if(hud)observer.observe(hud,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  hideSources();
  return{element,set(text:string,accessibleText=text){if(element.textContent!==text)element.textContent=text;element.setAttribute('aria-label',accessibleText);},dispose(){observer.disconnect();element.remove();if(hud){hud.style.paddingInline=previousPadding;for(const source of hud.querySelectorAll<HTMLElement>('.game-hud-item')){source.hidden=false;source.style.removeProperty('display');}}}};
}

/** Existing game-owned action buttons become siblings of the existing HUD.
 * bindGameChrome binds their glass after mount. Geometry only accommodates the
 * two extra actions on this older dock; central action slots supersede it. */
export function mountDockActions(container:HTMLElement,before:HTMLButtonElement,after:HTMLButtonElement){
  const hud=container.closest('.game-view')?.querySelector<HTMLElement>('.game-hud');
  const previousMin=hud?.style.minWidth??'',previousMax=hud?.style.maxWidth??'';
  for(const button of [before,after]){button.className='ui-tab arcade-glass game-glass';button.querySelectorAll('span').forEach(span=>span.remove());}
  if(hud){hud.before(before);hud.after(after);hud.style.minWidth='40px';hud.style.maxWidth='calc(100% - 244px)';}
  return{dispose(){before.remove();after.remove();if(hud){hud.style.minWidth=previousMin;hud.style.maxWidth=previousMax;}}};
}
