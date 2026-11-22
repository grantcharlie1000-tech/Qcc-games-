// Scroll behaviour for the tab bar island. nextTabbarState is the rule the unit tests cover. autoHideTabbar reads the scroll position and sets
// data-minimized on the bar once the reader has scrolled on. Minimized, the bar shrinks into a capsule that keeps the current tab's icon.
// theme.css draws both states, and data-hidden is left to the caller that hides the bar fully, such as Up next in Movies.
import {bindGlass} from './glass';
import {bindSectionNavigationLens} from './navigation';
import {drawnLenses} from './section-lens';
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

// The drag lens magnifies the tab content it passes over, as the native lens does. Each tab's icon and label take the
// lens magnification in proportion to how much of them the lens body covers: content inside the flat face reaches
// LENS_ZOOM, and the weight eases to 0 across the bevel at the lens edge, so a tab half under the lens swells too.
// This reads only the pill's resolved ::after geometry, which section-lens.ts reads too, and the content's layout boxes,
// which a scale never moves. As in Charlie's video (b24s), the press raises the lens, so the glyph under a held or
// dragged lens grows about 1.17x; the zoom follows the pill's press area, so a settle and rest stay at 1. CSS applies
// the zoom only without reduced motion.
export const LENS_ZOOM=1.18;
// The bevel section-lens.ts draws at the lens edge: min(12px, .45 of the capsule radius).
export const lensBevel=(width:number,height:number)=>Math.min(12,.45*Math.min(width,height)/2);
// The raised bubble's own bevel there (LENS_BEVEL): min(14px, .6 of its radius).
const raisedBevel=(width:number,height:number)=>Math.min(14,.6*Math.min(width,height)/2);
const smooth=(t:number)=>{const x=Math.min(1,Math.max(0,t));return x*x*(3-2*x);};
// The cover weight summed from the lens edge to a point depth px inside it: the smoothstep ramp across the bevel, then 1.
const inside=(depth:number,bevel:number)=>{
  if(depth<=0)return 0;
  if(depth>=bevel)return bevel/2+depth-bevel;
  const t=depth/bevel;
  return bevel*t*t*t*(1-t/2);
};
// The share of the span [left, right] under a lens centred at center: 1 across the face, easing to 0 at the edge.
export function lensCover(center:number,halfWidth:number,bevel:number,left:number,right:number):number{
  if(halfWidth<=0||right<=left)return 0;
  const edge=Math.min(Math.max(bevel,0),halfWidth);
  // Cumulative weight from far left: rising up to the centre, then mirrored on the way out.
  const total=(x:number)=>x<=center?inside(halfWidth-(center-x),edge):2*inside(halfWidth,edge)-inside(halfWidth-(x-center),edge);
  return (total(right)-total(left))/(right-left);
}
// The lens rises with the pill's press area, as section-lens.ts reads it: 1.07 at rest to 1.25 held.
export function lensZoom(scaleX:number,cover:number,scaleY=1.14):number{
  const rise=smooth((scaleX*scaleY-1.07)/.18);
  if(!rise||!(cover>0))return 1;
  return 1+(LENS_ZOOM-1)*rise*Math.min(1,cover);
}
// A tab's cover: its icon and label, each weighted by area, as boxes [left, right, area] in bar coordinates.
export function tabCover(center:number,halfWidth:number,bevel:number,boxes:readonly (readonly [number,number,number])[]):number{
  let area=0,covered=0;
  for(const [left,right,size] of boxes){area+=size;covered+=size*lensCover(center,halfWidth,bevel,left,right);}
  return area>0?covered/area:0;
}
function bindLensZoom(bar:HTMLElement):()=>void{
  let frame=0;
  const tabs=()=>[...bar.querySelectorAll<HTMLElement>('.ui-tab')];
  const clear=()=>{for(const tab of tabs()){tab.style.removeProperty('--section-lens-zoom');tab.removeAttribute('data-lens-target');tab.removeAttribute('data-lens-under');}};
  // The icon and label boxes of a tab in the bar's coordinates, from layout, which the zoom's own scale never moves.
  // The label reports its offset box. The icon is an SVG, with no offset box, so it takes its used size, centred in the tab
  // as the column flex places it.
  const content=(tab:HTMLElement)=>[...tab.querySelectorAll<HTMLElement|SVGSVGElement>(':scope>:is(.ui-icon,span)')].map(part=>{
    if(part instanceof HTMLElement){
      const left=tab.offsetLeft+part.offsetLeft;
      return [left,left+part.offsetWidth,part.offsetWidth*part.offsetHeight] as const;
    }
    const used=getComputedStyle(part),width=parseFloat(used.width)||0,left=tab.offsetLeft+(tab.offsetWidth-width)/2;
    return [left,left+width,width*(parseFloat(used.height)||0)] as const;
  });
  const tick=()=>{
    frame=0;
    if(!bar.hasAttribute('data-pill-dragging')&&!bar.hasAttribute('data-pressing')){clear();return;}
    const style=getComputedStyle(bar,'::after');
    const width=parseFloat(style.width)||0,height=parseFloat(style.height)||0;
    const [scaleX,scaleY=scaleX]=style.scale==='none'?[1]:style.scale.split(' ').map(Number);
    // Charlie's video: the bubble the lens draws (section-lens.ts) stands about 1.55 bar heights wide, past the CSS pill,
    // and the glyphs under all of it swell. Its box is in the bar's on-screen px, so it is taken back to layout px.
    const drawn=drawnLenses.get(bar);
    const center=drawn?drawn.pill[0]/drawn.sx:(parseFloat(style.left)||0)+(parseFloat(style.translate)||0)+width/2;
    const lensWidth=drawn?drawn.pill[2]/drawn.sx:width*scaleX,lensHeight=drawn?drawn.pill[3]/drawn.sy:height*scaleY;
    const half=lensWidth/2,bevel=drawn?raisedBevel(lensWidth,lensHeight):lensBevel(lensWidth,lensHeight);
    // Every layout read comes before the first write, so a drag frame forces at most one layout.
    const zooms=tabs().map(tab=>{
      const cover=tabCover(center,half,bevel,content(tab));
      return [tab,lensZoom(scaleX,cover,scaleY).toFixed(3),cover,Math.abs(tab.offsetLeft+tab.offsetWidth/2-center)] as const;
    });
    // The tab nearest the bubble's centre takes the selection's accent while the press lasts, as the video's Radio
    // under the held lens turns blue while Library gives it up; the ink of every tab mostly under the clear bubble
    // turns light over the art it shows (section-navigation.css).
    const target=zooms.reduce((best,entry)=>entry[3]<best[3]?entry:best,zooms[0])?.[0];
    for(const [tab,zoom,cover] of zooms){
      if(tab.style.getPropertyValue('--section-lens-zoom')!==zoom)tab.style.setProperty('--section-lens-zoom',zoom);
      if(tab.hasAttribute('data-lens-target')!==(tab===target))tab.toggleAttribute('data-lens-target',tab===target);
      if(tab.hasAttribute('data-lens-under')!==(cover>=.5))tab.toggleAttribute('data-lens-under',cover>=.5);
    }
    // The pill's scale eases for 100ms after each move, so keep following it while the press lasts.
    frame=requestAnimationFrame(tick);
  };
  const watch=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(tick);});
  watch.observe(bar,{attributes:true,attributeFilter:['data-pill-dragging','data-pressing']});
  return ()=>{watch.disconnect();cancelAnimationFrame(frame);frame=0;clear();};
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
  const bounded=bar.classList.contains('section-tabbar');
  const target:EventTarget=scroller;
  const mini=document.createElement('button');
  mini.type='button';
  mini.className='ui-tabbar-mini';
  if(bar.classList.contains('arcade-glass')){
    mini.classList.add('arcade-glass-mini');
    mini.dataset.glassTone=bar.dataset.glassTone??'dark';
  }
  mini.tabIndex=-1;
  mini.setAttribute('aria-hidden','true');
  let state:TabbarScroll={minimized:false,lastY:position(scroller).y,travel:0};
  let frame=0;
  const glass=bindGlass(bar);
  const disposeLens=bindSectionNavigationLens(bar,scroller);
  const disposeZoom=bounded?bindLensZoom(bar):()=>{};
  // Writes the attribute only when the state changes.
  const apply=(minimized:boolean)=>{
    if(bar.hasAttribute('data-minimized')===minimized)return;
    // A minimize reads the boxes once and writes the morph's transforms, so the bar and the capsule start from the layout as it is now.
    if(minimized&&!bounded)layout();
    if(minimized)bar.setAttribute('data-minimized','true');
    else bar.removeAttribute('data-minimized');
  };
  const typing=()=>!!document.activeElement?.matches(TEXT_ENTRY);
  const sync=()=>{
    frame=0;
    const {y,max}=position(scroller);
    // Sheet focus can scroll the page behind it. Keep the reader's navigation
    // state, and rebase travel so those programmatic moves never count later.
    if(bar.closest('[data-sheet-hidden]')){state={...state,lastY:y,travel:0};return;}
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
    // Shared navigation morphs its actual box. The mini is only an icon/hit
    // target over that same surface, never a second stretched backdrop.
    if(bounded)return;
    const barLeft=leftOf(bar),miniLeft=leftOf(mini);
    bar.style.setProperty('--tb-x',`${miniLeft-barLeft}px`);
    bar.style.setProperty('--tb-sx',String(mini.offsetWidth/width));
    bar.style.setProperty('--tb-sy',String(mini.offsetHeight/bar.offsetHeight));
    mini.style.setProperty('--tb-x',`${barLeft-miniLeft}px`);
    mini.style.setProperty('--tb-sx',String(width/mini.offsetWidth));
    mini.style.setProperty('--tb-sy',String(bar.offsetHeight/mini.offsetHeight));
  };
  const resized=()=>{if(bounded)layout();else instant(layout);schedule();};
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
  const measure=new ResizeObserver(()=>{if(bounded)layout();else instant(layout);keep();});
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
  if(bounded)layout();else instant(layout);
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
      disposeZoom();
      disposeLens();
      glass.dispose();
      mini.remove();
      bar.removeAttribute('data-minimized');
    }
  };
}
