// Background scroll lock while a sheet is open. overflow:hidden on the root stops touch and wheel scrolling on iOS Safari 16+ and every
// desktop engine without moving the page, so scrollY (read by route() and the tab bar) never jumps. A non-passive touchmove guard stops
// older iOS from panning the page from outside the sheet, and the scrollbar's width is kept as padding so nothing shifts sideways.
let holders=0;
let saved:{overflow:string;bodyOverflow:string;padding:string;x:number;y:number;hash:string}|null=null;
let guard:((event:TouchEvent)=>void)|null=null;

export function isPageScrollLocked():boolean{return holders>0;}

export function lockPageScroll():()=>void{
  if(holders++===0){
    const root=document.documentElement,body=document.body;
    const gutter=Math.max(0,window.innerWidth-root.clientWidth);
    const padding=parseFloat(getComputedStyle(root).paddingRight)||0;
    saved={overflow:root.style.overflow,bodyOverflow:body.style.overflow,padding:root.style.paddingRight,x:scrollX,y:scrollY,hash:location.hash};
    root.style.overflow='hidden';body.style.overflow='hidden';
    if(gutter)root.style.paddingRight=`${padding+gutter}px`;
    root.setAttribute('data-scroll-locked','');
    guard=event=>{
      const target=event.target instanceof Element?event.target:null;
      if(event.cancelable&&!target?.closest('dialog[open],[role=dialog]'))event.preventDefault();
    };
    document.addEventListener('touchmove',guard,{passive:false,capture:true});
  }
  let released=false;
  return()=>{
    if(released)return;released=true;
    if(--holders>0||!saved)return;
    const root=document.documentElement,body=document.body,{x,y,hash}=saved;
    root.style.overflow=saved.overflow;body.style.overflow=saved.bodyOverflow;root.style.paddingRight=saved.padding;
    root.removeAttribute('data-scroll-locked');
    if(guard)document.removeEventListener('touchmove',guard,{capture:true});
    guard=null;saved=null;
    // iOS can nudge the page while the keyboard is up; put it back only when it moved behind the sheet.
    // A navigation while the sheet was open owns the new position.
    if(hash===location.hash&&(scrollX!==x||scrollY!==y))window.scrollTo({left:x,top:y,behavior:'instant'});
  };
}
