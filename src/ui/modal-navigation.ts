import './modal-navigation.css';

const CHROME='.section-navigation,.section-header,.game-dock';
const PANELS='dialog,[role="dialog"],.study-cookie-panel';

/** Navigation is a lower functional layer: never leave its paint under a sheet.
 * Watches presentation only; owners retain their actions, traps and Escape. */
export function suppressNavigationUnderSheets():void{
  let returnTo:HTMLElement|null=null,hidden=false,movedFocus=false;
  const remember=(event:Event)=>{
    const target=event.target instanceof Element?event.target.closest<HTMLElement>('a,button'):null;
    if(!hidden&&target?.closest(CHROME))returnTo=target;
    else if(!hidden&&!(event.target instanceof Element&&event.target.closest(PANELS)))returnTo=null;
  };
  document.addEventListener('pointerdown',remember,true);
  document.addEventListener('focusin',remember,true);
  const visible=(panel:HTMLElement)=>{
    if(panel instanceof HTMLDialogElement&&panel.open)return true;
    const style=getComputedStyle(panel);
    // Native display/overlay exits can keep painting after open is removed.
    return style.display!=='none'&&style.visibility!=='hidden'&&panel.getClientRects().length>0;
  };
  const sync=()=>{
    const panels=[...document.querySelectorAll<HTMLElement>(PANELS)].filter(visible);
    const next=panels.length>0;
    document.body.toggleAttribute('data-sheet-open',next);
    const active=document.activeElement;
    // Non-native panels such as Up next may open while a navigation item has
    // keyboard focus. Move it to the existing panel controls before inerting.
    if(next&&active instanceof HTMLElement&&active.closest(CHROME)){
      returnTo=active;movedFocus=true;
      panels.at(-1)?.querySelector<HTMLElement>('button,a[href],input,[tabindex]')?.focus({preventScroll:true});
    }
    for(const root of document.querySelectorAll<HTMLElement>(CHROME)){
      root.toggleAttribute('data-sheet-hidden',next);
      root.inert=next||root.hasAttribute('data-view-hidden');
    }
    if(hidden&&!next){
      const target=returnTo;returnTo=null;
      if(target?.isConnected&&!target.closest('[inert]')&&
        (movedFocus||active===document.body||active===document.documentElement||active instanceof Element&&!!active.closest(PANELS))){
        requestAnimationFrame(()=>{if(!hidden&&target.isConnected&&!target.closest('[inert]'))target.focus({preventScroll:true});});
      }
      movedFocus=false;
    }
    hidden=next;
  };
  const observer=new MutationObserver(records=>{
    if(records.some(record=>record.type==='childList'
      ? [...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&(node.matches(`${PANELS},${CHROME}`)||node.querySelector(`${PANELS},${CHROME}`)))
      : record.target instanceof Element&&(record.target.matches(PANELS)||record.target.querySelector(PANELS))))sync();
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden','aria-hidden','role','class','style']});
  for(const event of ['transitionend','transitioncancel','animationend','close'])document.addEventListener(event,e=>{
    if(e.target instanceof Element&&(e.target.matches(PANELS)||e.target.querySelector(PANELS)))sync();
  },true);
  sync();
}
