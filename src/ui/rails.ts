// Rail rows scroll by three quarters of their width. Each .ui-rail carries data-can-prev/next, which
// theme.css uses to hide an arrow that has nowhere to go. A sub-pixel offset does not count as movement.
export interface RailRow{scrollLeft:number;clientWidth:number;scrollWidth:number}
// theme.css pads each row by 4 px, and scroll snapping rests the first card on that padding.
const REST=4;
export function railEdges(row:RailRow):{canPrev:boolean;canNext:boolean}{
  return {canPrev:row.scrollLeft>REST+1,canNext:row.scrollLeft+row.clientWidth<row.scrollWidth-1};
}
export function scrollStep(row:{clientWidth:number},direction:number):number{
  return direction*row.clientWidth*0.75;
}
function setFlags(rail:HTMLElement,row:HTMLElement):void{
  const {canPrev,canNext}=railEdges(row);
  rail.dataset.canPrev=String(canPrev);rail.dataset.canNext=String(canNext);
  keepFocus(rail,row,canPrev,canNext);
}
// theme.css hides an arrow that has nowhere to go, and a focused arrow that disappears drops focus to body.
// Focus moves to the opposite arrow when it is available, otherwise to the row's first (prev) or last (next) card.
function keepFocus(rail:HTMLElement,row:HTMLElement,canPrev:boolean,canNext:boolean):void{
  const focused=globalThis.document?.activeElement;
  if(!focused||!rail.contains(focused))return;
  const onPrev=focused.matches('.ui-rail-arrow.prev');
  const onNext=focused.matches('.ui-rail-arrow.next');
  if(!(onPrev&&!canPrev)&&!(onNext&&!canNext))return;
  const opposite=rail.querySelector<HTMLElement>(onPrev?'.ui-rail-arrow.next':'.ui-rail-arrow.prev');
  if(opposite&&(onPrev?canNext:canPrev)){opposite.focus({preventScroll:true});return;}
  const card=onPrev?row.firstElementChild:row.lastElementChild;
  (card as HTMLElement|null)?.focus({preventScroll:true});
}
export function updateRails(root:ParentNode):void{
  for(const rail of root.querySelectorAll<HTMLElement>('.ui-rail')){
    const row=rail.querySelector<HTMLElement>('.ui-rail-row');
    if(row)setFlags(rail,row);
    else{rail.dataset.canPrev='false';rail.dataset.canNext='false';}
  }
}
// Delegated arrow clicks and scroll tracking for every rail under root. Returns a disposer.
export function bindRails(root:HTMLElement,reduced:()=>boolean):()=>void{
  const onClick=(event:Event)=>{
    const arrow=(event.target as Element).closest?.<HTMLElement>('[data-scroll]');
    const row=arrow?.closest<HTMLElement>('.ui-rail')?.querySelector<HTMLElement>('.ui-rail-row');
    if(!arrow||!row)return;
    row.scrollBy({left:scrollStep(row,Number(arrow.dataset.scroll)),behavior:reduced()?'auto':'smooth'});
  };
  // Scroll events do not bubble, so the listener is attached in the capture phase.
  const onScroll=(event:Event)=>{
    const row=event.target;
    if(!(row instanceof HTMLElement)||!row.matches('.ui-rail-row'))return;
    const rail=row.closest<HTMLElement>('.ui-rail');
    if(rail)setFlags(rail,row);
  };
  // Resizing, or a hidden library becoming visible again, changes the edges without a scroll event.
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>updateRails(root)):undefined;
  resize?.observe(root);
  root.addEventListener('click',onClick);
  root.addEventListener('scroll',onScroll,true);
  return()=>{root.removeEventListener('click',onClick);root.removeEventListener('scroll',onScroll,true);resize?.disconnect();};
}
