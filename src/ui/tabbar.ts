// Scroll behaviour for the tab bar island. nextTabbarState is the rule the unit tests cover. autoHideTabbar reads the scroll position and sets
// data-minimized on the bar once the reader has scrolled on. Minimized, the bar shrinks into a capsule that keeps the current tab's icon.
// theme.css draws both states, and data-hidden is left to the caller that hides the bar fully, such as Up next in Movies.
import {bindGlass} from './glass';
export interface TabbarScroll{minimized:boolean;lastY:number;travel:number}
// px of downward travel before the bar minimizes, and of upward travel before it expands again.
export const TABBAR_MINIMIZE=64;
export const TABBAR_EXPAND=32;
// The bar is always expanded within TABBAR_TOP px of the top, and it cannot minimize above TABBAR_FLOOR px.
export const TABBAR_TOP=64;
export const TABBAR_FLOOR=120;
// px from the end of the page where the bar always shows.
export const TABBAR_EDGE=24;
// The fields where a reader types. While one of them has focus, the bar's state holds.
const TEXT_ENTRY='input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]),textarea,select,[contenteditable]:not([contenteditable="false"])';
const CURRENT='.ui-tab[aria-current="page"],.ui-tab[aria-pressed="true"]';

export function nextTabbarState(state:TabbarScroll,y:number,max:number,typing=false):TabbarScroll{
  const limit=Math.max(0,max);
  // Rubber-band overscroll is ignored: the position is clamped to the page.
  const at=Math.min(Math.max(y,0),limit);
  // A page that cannot reach the floor, and the two ends of every page, keep the bar expanded, even while the reader types.
  if(limit<TABBAR_FLOOR||at<=TABBAR_TOP||at>=limit-TABBAR_EDGE)return {minimized:false,lastY:at,travel:0};
  // While typing the state holds, and the count restarts here, so the page's own movement never counts toward a change.
  if(typing)return {minimized:state.minimized,lastY:at,travel:0};
  const delta=at-state.lastY;
  // Travel counts in one direction. A reversal starts the count again, so jitter never adds up to a change.
  // A sample that did not move keeps the travel built so far: it is neither a reversal nor a step the same way.
  const sameWay=state.travel===0||delta===0||Math.sign(delta)===Math.sign(state.travel);
  const travel=sameWay?state.travel+delta:delta;
  let minimized=state.minimized;
  if(travel>=TABBAR_MINIMIZE&&at>=TABBAR_FLOOR)minimized=true;
  else if(travel<=-TABBAR_EXPAND)minimized=false;
  return {minimized,lastY:at,travel};
}

function position(scroller:Window|HTMLElement):{y:number;max:number}{
  if(scroller instanceof HTMLElement)return {y:scroller.scrollTop,max:scroller.scrollHeight-scroller.clientHeight};
  return {y:scroller.scrollY,max:scroller.document.documentElement.scrollHeight-scroller.innerHeight};
}
// The left edge of an element's layout box. The used left and margin are not moved by a transform, so the edge stays put while the bar shrinks.
const leftOf=(element:HTMLElement)=>{const style=getComputedStyle(element);return parseFloat(style.left)+parseFloat(style.marginLeft);};

// One passive scroll listener per scroller, with at most one frame of work pending. Returns reset(), which expands the bar and counts travel
// from the current position, and dispose(), which removes the listener and the capsule. The Liquid Glass pill, press and refraction are bound
// to the same bar here, so every island gets them.
// The capsule is a sibling placed right after the bar, so the bar's own opacity, transform and backdrop never reach it. It is a pointer
// affordance only: a tap on it expands the bar, and the bar stays reachable by keyboard while minimized.
export function autoHideTabbar(bar:HTMLElement,scroller:Window|HTMLElement):{reset():void;dispose():void}{
  const target:EventTarget=scroller;
  const mini=document.createElement('button');
  mini.type='button';
  mini.className='ui-tabbar-mini';
  mini.tabIndex=-1;
  mini.setAttribute('aria-hidden','true');
  let state:TabbarScroll={minimized:false,lastY:position(scroller).y,travel:0};
  let frame=0;
  const glass=bindGlass(bar);
  // Writes the attribute only when the state changes.
  const apply=(minimized:boolean)=>{
    if(bar.hasAttribute('data-minimized')===minimized)return;
    // A minimize reads the boxes once and writes the morph's transforms, so the bar and the capsule start from the layout as it is now.
    if(minimized)layout();
    if(minimized)bar.setAttribute('data-minimized','true');
    else bar.removeAttribute('data-minimized');
  };
  const typing=()=>!!document.activeElement?.matches(TEXT_ENTRY);
  const sync=()=>{
    frame=0;
    const {y,max}=position(scroller);
    state=nextTabbarState(state,y,max,typing());
    apply(state.minimized);
  };
  // Scrolling and resizing both re-check the position. A resize can shorten the scrollable range with no scroll event.
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(sync);};
  // The transforms that join the two boxes. The bar shrinks onto the capsule's bottom-left corner and the capsule grows out of the bar's.
  // Both sit the same distance above the bottom, so their bottom edges meet. A minimize writes them as they are, and a value that did not move
  // starts no transition. A resize writes them with transitions off, so a re-fit never animates.
  const instant=(write:()=>void)=>{
    bar.toggleAttribute('data-layout',true);
    mini.toggleAttribute('data-layout',true);
    write();
    // The read applies the written values before the transitions are switched back on.
    void mini.offsetWidth;
    bar.toggleAttribute('data-layout',false);
    mini.toggleAttribute('data-layout',false);
  };
  const layout=()=>{
    const width=bar.offsetWidth;
    mini.hidden=!width;
    if(!width)return;
    const barLeft=leftOf(bar),miniLeft=leftOf(mini);
    bar.style.setProperty('--tb-x',`${miniLeft-barLeft}px`);
    bar.style.setProperty('--tb-sx',String(mini.offsetWidth/width));
    bar.style.setProperty('--tb-sy',String(mini.offsetHeight/bar.offsetHeight));
    mini.style.setProperty('--tb-x',`${barLeft-miniLeft}px`);
    mini.style.setProperty('--tb-sx',String(width/mini.offsetWidth));
    mini.style.setProperty('--tb-sy',String(bar.offsetHeight/mini.offsetHeight));
  };
  const resized=()=>{instant(layout);schedule();};
  // The capsule follows the bar: right after it, or after the scroll edge that glass.ts keeps there. Movies re-renders its children, which
  // removes the capsule with them, so the bar's parent is watched and the capsule is put back. Movies creates the island before it attaches
  // the nav, so the watch starts on the first size change of the attached bar, as glass.ts's scroll edge does.
  let parent:Node|null=null;
  const parentWatch=new MutationObserver(()=>keep());
  const keep=()=>{
    if(bar.parentNode!==parent){parentWatch.disconnect();parent=bar.parentNode;if(parent)parentWatch.observe(parent,{childList:true});}
    if(!parent)return;
    const after=bar.nextElementSibling?.classList.contains('ui-scroll-edge')?bar.nextElementSibling:bar;
    if(mini.previousElementSibling!==after)after.after(mini);
  };
  const measure=new ResizeObserver(()=>{instant(layout);keep();});
  measure.observe(bar);
  // The capsule shows the icon of the current tab, or of the first tab while none is current. The icon is a copy, so the bar keeps its own.
  const icon=()=>{
    const tab=bar.querySelector<HTMLElement>(CURRENT)??bar.querySelector<HTMLElement>('.ui-tab');
    const svg=tab?.querySelector('.ui-icon');
    mini.replaceChildren(...(svg?[svg.cloneNode(true)]:[]));
  };
  const tabs=new MutationObserver(icon);
  tabs.observe(bar,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current','aria-pressed']});
  // A tap on the capsule expands the bar, and counts travel from here, so the next scroll down has to be a deliberate one. A click focuses the
  // capsule in some browsers, and it is hidden from assistive technology, so it lets the focus go.
  mini.addEventListener('click',()=>{mini.blur();state={minimized:false,lastY:position(scroller).y,travel:0};apply(false);});

  target.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',resized,{passive:true});
  keep();
  icon();
  instant(layout);
  return{
    reset(){
      if(frame)cancelAnimationFrame(frame);
      frame=0;
      state={minimized:false,lastY:position(scroller).y,travel:0};
      apply(false);
    },
    dispose(){
      target.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',resized);
      measure.disconnect();
      tabs.disconnect();
      parentWatch.disconnect();
      if(frame)cancelAnimationFrame(frame);
      frame=0;
      glass.dispose();
      mini.remove();
      bar.removeAttribute('data-minimized');
    }
  };
}
