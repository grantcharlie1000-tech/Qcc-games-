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
// the zoom only without reduced motion. MOTION-3: was 1.18. The bar now grows about 1.055x under the press as the video's
// does, and the video's 1.17 is the glyph's whole growth, so the lens's own share is 1.16 (measured 1.25 drag, 1.11 hold).
export const LENS_ZOOM=1.16;
// The bevel section-lens.ts draws at the lens edge: min(12px, .45 of the capsule radius).
export const lensBevel=(width:number,height:number)=>Math.min(12,.45*Math.min(width,height)/2);
// The raised bubble's own bevel there (LENS_BEVEL): min(14px, .6 of its radius).
const raisedBevel=(width:number,height:number)=>Math.min(14,.6*Math.min(width,height)/2);
const smooth=(t:number)=>{const x=Math.min(1,Math.max(0,t));return x*x*(3-2*x);};
// MOTION-7: every frame of Charlie's video press (19.587-19.920 s) shows the glyph under the rising lens growing over about
// 200 ms, not with the lens's two-frame rise: x1.015 at 17 ms, 1.08 at 50, 1.146 at 100, 1.193 at 133 and 1.21 by 217
// (the bar's own growth, on its spring, is part of that). The lens's own share of the zoom eases in as a quadratic ease-out
// over GLYPH_RISE ms from the press, which with the bar's spring follows the video's curve; a release still eases back.
export const GLYPH_RISE=200;
export const glyphRise=(elapsed:number)=>{const t=Math.min(1,Math.max(0,elapsed/GLYPH_RISE));return 1-(1-t)*(1-t);};
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
// MOTION-11 (#24 council on aa6359ee: Movies and My list crossed the raised lens's rim whole and unbent, where the video's
// rim warps the glyphs into it): a tab the rim crosses bends as the art under the rim does (section-lens.ts
// LENS_EDGE_REACH): across the bubble's bevel each point shows what lies WARP_REACH * u^3 further out, so a glyph's outer
// part is squeezed into the rim. An SVG displacement map of the bubble, drawn once per size, sits under each such tab.
// The bend stays in the outer WARP_BAND css px, as the video's does (a glyph in the face is not squeezed).
const WARP_REACH=18,WARP_BAND=9,WARP_SPAN=2.2*WARP_REACH,WARP_DENSITY=2;
const SVG_NS='http://www.w3.org/2000/svg';
let warpIds=0;
function warpMap(width:number,height:number,bevel:number):string{
  const w=Math.ceil(width*WARP_DENSITY),h=Math.ceil(height*WARP_DENSITY);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  if(!ctx||!w||!h)return '';
  const image=ctx.createImageData(w,h),radius=Math.min(width,height)/2,line=Math.max(0,(width-height)/2);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const px=(x+.5)/WARP_DENSITY-width/2,py=(y+.5)/WARP_DENSITY-height/2;
    const ax=px-Math.max(-line,Math.min(line,px)),length=Math.hypot(ax,py),depth=radius-length;
    const u=depth>0&&length>0?Math.max(0,1-depth/Math.min(bevel,WARP_BAND)):0,pull=WARP_REACH*u*u*u/Math.max(length,1e-3);
    const i=(y*w+x)*4;
    // Channel .5 is no displacement; at full lift feDisplacementMap's scale WARP_SPAN spans the whole pull either way.
    image.data[i]=Math.round(255*(.5+ax*pull/WARP_SPAN));
    image.data[i+1]=Math.round(255*(.5+py*pull/WARP_SPAN));
    image.data[i+2]=128;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  return canvas.toDataURL();
}
function bindLensWarp(bar:HTMLElement){
  const defs=document.createElementNS(SVG_NS,'svg');
  defs.setAttribute('aria-hidden','true');
  defs.style.cssText='position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const filters=new Map<HTMLElement,{id:string;image:SVGFEImageElement;filter:SVGFilterElement;displace:SVGFEDisplacementMapElement}>();
  let size='',map='';
  const make=(tab:HTMLElement)=>{
    let entry=filters.get(tab);
    if(entry)return entry;
    if(!defs.isConnected)document.body.append(defs);
    const id=`section-lens-warp-${++warpIds}`,filter=document.createElementNS(SVG_NS,'filter');
    filter.id=id;
    for(const [name,value] of [['filterUnits','userSpaceOnUse'],['color-interpolation-filters','sRGB']])filter.setAttribute(name,value);
    filter.innerHTML='<feFlood flood-color="rgb(128,128,128)" result="flat"/><feImage preserveAspectRatio="none" result="bubble"/>'+
      '<feMerge result="map"><feMergeNode in="flat"/><feMergeNode in="bubble"/></feMerge>'+
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G"/>';
    defs.append(filter);
    entry={id,image:filter.querySelector('feImage') as SVGFEImageElement,filter,displace:filter.querySelector('feDisplacementMap') as SVGFEDisplacementMapElement};
    filters.set(tab,entry);
    return entry;
  };
  return {
    // The bubble in the bar's layout px (centre x, centre y, width, height, bevel) and its lift. Each tab it crosses bends.
    set(tab:HTMLElement,lens:readonly [number,number,number,number,number]|null,lift=1){
      if(!lens){if(tab.style.filter)tab.style.removeProperty('filter');return;}
      const [cx,cy,width,height,bevel]=lens,next=`${Math.round(width/2)*2}x${Math.round(height/2)*2}x${Math.round(bevel)}`;
      if(next!==size){size=next;map=warpMap(Math.round(width/2)*2,Math.round(height/2)*2,bevel);for(const {image} of filters.values())image.setAttribute('href',map);}
      const {id,image,filter,displace}=make(tab);
      if(image.getAttribute('href')!==map)image.setAttribute('href',map);
      const attributes:[SVGElement,string,number][]=[[displace,'scale',WARP_SPAN*lift],[filter,'x',-24],[filter,'y',-24],[filter,'width',tab.offsetWidth+48],
        [filter,'height',tab.offsetHeight+48],[image,'x',cx-width/2-tab.offsetLeft],[image,'y',cy-height/2-tab.offsetTop],
        [image,'width',Math.round(width/2)*2],[image,'height',Math.round(height/2)*2]];
      for(const [element,name,value] of attributes)if(element.getAttribute(name)!==value.toFixed(2))element.setAttribute(name,value.toFixed(2));
      if(tab.style.filter!==`url("#${id}")`)tab.style.setProperty('filter',`url("#${id}")`);
    },
    clear(tabs:readonly HTMLElement[]){for(const tab of tabs)tab.style.removeProperty('filter');},
    dispose(){filters.clear();defs.remove();},
  };
}
function bindLensZoom(bar:HTMLElement):()=>void{
  let frame=0;
  // When the current press began (glyphRise), or null outside a press.
  let pressedAt:number|null=null;
  const warp=bindLensWarp(bar);
  const tabs=()=>[...bar.querySelectorAll<HTMLElement>('.ui-tab')];
  const unzoom=()=>{pressedAt=null;for(const tab of tabs()){tab.style.removeProperty('--section-lens-zoom');tab.removeAttribute('data-lens-target');tab.removeAttribute('data-lens-under');}};
  const clear=()=>{unzoom();warp.clear(tabs());};
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
  // The rim bends the tabs it crosses (bindLensWarp) while the WebGL bubble is raised, through the release spring too.
  const bend=(drawn:{pill:number[];sx:number;sy:number}|undefined,lift:number,covers:readonly (readonly [HTMLElement,number])[])=>{
    const lens=drawn&&lift>0?[drawn.pill[0]/drawn.sx,drawn.pill[1]/drawn.sy,drawn.pill[2]/drawn.sx,drawn.pill[3]/drawn.sy] as const:null;
    for(const [tab,cover] of covers)warp.set(tab,lens&&cover>0&&cover<.999?[...lens,raisedBevel(lens[2],lens[3])]:null,lift);
  };
  const tick=()=>{
    frame=0;
    const style=getComputedStyle(bar,'::after');
    const width=parseFloat(style.width)||0,height=parseFloat(style.height)||0;
    const [scaleX,scaleY=scaleX]=style.scale==='none'?[1]:style.scale.split(' ').map(Number);
    // Charlie's video: the bubble the lens draws (section-lens.ts) stands about 1.55 bar heights wide, past the CSS pill,
    // and the glyphs under all of it swell. Its box is in the bar's on-screen px, so it is taken back to layout px.
    const drawn=drawnLenses.get(bar);
    const center=drawn?drawn.pill[0]/drawn.sx:(parseFloat(style.left)||0)+(parseFloat(style.translate)||0)+width/2;
    const lensWidth=drawn?drawn.pill[2]/drawn.sx:width*scaleX,lensHeight=drawn?drawn.pill[3]/drawn.sy:height*scaleY;
    const half=lensWidth/2,bevel=drawn?raisedBevel(lensWidth,lensHeight):lensBevel(lensWidth,lensHeight);
    // The bubble's lift, as section-lens.ts reads it from the pill's press area.
    const lift=smooth((scaleX*scaleY-1.07)/.18);
    if(!bar.hasAttribute('data-pill-dragging')&&!bar.hasAttribute('data-pressing')){
      // The release: the glyphs ease back (CSS) while the bend follows the falling bubble down.
      if(pressedAt!==null)unzoom();
      if(drawn&&lift>0){bend(drawn,lift,tabs().map(tab=>[tab,tabCover(center,half,bevel,content(tab))] as const));frame=requestAnimationFrame(tick);}
      else clear();
      return;
    }
    const now=performance.now();
    pressedAt??=now;
    const rise=glyphRise(now-pressedAt);
    // Every layout read comes before the first write, so a drag frame forces at most one layout.
    const zooms=tabs().map(tab=>{
      const cover=tabCover(center,half,bevel,content(tab));
      return [tab,(1+(lensZoom(scaleX,cover,scaleY)-1)*rise).toFixed(3),cover,Math.abs(tab.offsetLeft+tab.offsetWidth/2-center)] as const;
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
    bend(drawn,lift,zooms.map(([tab,,cover])=>[tab,cover] as const));
    // The pill's scale eases for 100ms after each move, so keep following it while the press lasts.
    frame=requestAnimationFrame(tick);
  };
  const watch=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(tick);});
  watch.observe(bar,{attributes:true,attributeFilter:['data-pill-dragging','data-pressing']});
  return ()=>{watch.disconnect();cancelAnimationFrame(frame);frame=0;clear();warp.dispose();};
}
// MOTION-10: the release eases every tab glyph back from the press (its scale, opacity and colour), and in Chromium a
// stroked glyph's outermost anti-aliased column can keep a raster from those moving frames: the light theme's TV foot, the
// one stroke in its filled twins, settled 2-3 levels darker at a round cap (x 155 or 166, rows 806-808 at 390 px) than
// at rest, with every computed style back at rest, until something repainted the glyph (MOTION-9). So once a press or
// drag has ended and nothing in the bar has moved for SETTLE_FRAMES frames, each tab glyph is laid out again once. Its
// styles are unchanged, so the frame draws exactly the resting glyph, rastered afresh.
const SETTLE_FRAMES=2;
// A bar that never comes to rest (an endless animation in it) is repainted after this many frames instead.
const SETTLE_LIMIT=120;
function bindSettleRepaint(bar:HTMLElement):()=>void{
  let frame=0,quiet=0,frames=0,size='';
  const held=()=>bar.matches('[data-pressing],[data-pill-dragging]');
  const moving=()=>typeof bar.getAnimations==='function'&&bar.getAnimations({subtree:true}).some(animation=>
    animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity);
  const repaint=()=>{
    for(const icon of bar.querySelectorAll<SVGElement>('.ui-tab>.ui-icon')){
      // At SETTLE_LIMIT the bar may still be moving: a glyph still easing is left alone, never cut short.
      if(typeof icon.getAnimations==='function'&&icon.getAnimations().some(animation=>animation.playState==='running'))continue;
      const value=icon.style.getPropertyValue('display'),priority=icon.style.getPropertyPriority('display');
      icon.style.setProperty('display','none','important');
      void icon.getBoundingClientRect();
      if(value)icon.style.setProperty('display',value,priority);else icon.style.removeProperty('display');
    }
  };
  const tick=()=>{
    frame=0;
    // A new press starts over: its own release brings the next repaint.
    if(held())return;
    // The section lens resizes its canvas as the raised bubble comes down, so a frame that changed it counts as moving.
    const canvas=bar.querySelector<HTMLCanvasElement>(':scope>canvas.section-lens');
    const now=canvas?`${canvas.width}x${canvas.height}`:'';
    quiet=moving()||now!==size?0:quiet+1;
    size=now;
    if(quiet<SETTLE_FRAMES&&++frames<SETTLE_LIMIT){frame=requestAnimationFrame(tick);return;}
    repaint();
  };
  const watch=new MutationObserver(()=>{
    if(held()||frame)return;
    quiet=frames=0;size='';
    frame=requestAnimationFrame(tick);
  });
  watch.observe(bar,{attributes:true,attributeFilter:['data-pill-dragging','data-pressing']});
  return ()=>{watch.disconnect();cancelAnimationFrame(frame);frame=0;};
}
// MOTION-8: Apple's tab bar never leaves the screen when one of its tabs turns the page (Charlie's video, 15.183 s: the bar
// stays and its pill springs to Library while the page goes). A route that hides this bar's navigation behind a loading page
// (main.ts setChromeInert while Movies loads, which left no bar on screen for about 30-370 ms) keeps the bar up instead when
// the route is the tab this bar was just sent to: inert, as the navigation is, with its pill sprung to that tab. It gives
// way when the loading page goes (the routed view's own bar arrives in that frame) or the navigation comes back, and gives
// the pill back to the tab it left.
const HANDOVER_WINDOW=1000;
function bindRouteHandover(bar:HTMLElement):()=>void{
  const chrome=bar.closest<HTMLElement>('.app-navigation'),host=document.querySelector<HTMLElement>('#content');
  if(!chrome||!host)return ()=>{};
  let sent:{tab:HTMLElement;at:number}|null=null;
  let held:{tab:HTMLElement;previous:HTMLElement[]}|null=null;
  const loading=()=>!!host.querySelector(':scope > .loading');
  const end=()=>{
    if(!held)return;
    const {tab,previous}=held;
    held=null;
    chrome.removeAttribute('data-route-handover');
    if(tab.getAttribute('aria-current')!=='page'||!previous.length)return;
    tab.removeAttribute('aria-current');
    for(const other of previous)if(other.isConnected)other.setAttribute('aria-current','page');
  };
  // A tap or a drag released over a tab (glass.ts clicks it) sends the bar there, if the bar is on screen.
  const clicked=(event:Event)=>{
    const tab=(event.target as Element|null)?.closest<HTMLElement>('a.ui-tab');
    sent=tab&&bar.contains(tab)&&bar.getClientRects().length&&!chrome.hasAttribute('data-view-hidden')?{tab,at:performance.now()}:null;
  };
  // Mutation records arrive before the next frame is painted, so the bar is never off screen in between.
  const watch=new MutationObserver(records=>{
    if(held){if(!chrome.hasAttribute('data-view-hidden')||!loading())end();return;}
    const hide=records.find(record=>record.target===chrome&&record.attributeName==='data-view-hidden');
    const route=sent;
    if(!hide||hide.oldValue!==null||!route||!chrome.hasAttribute('data-view-hidden')||!loading())return;
    sent=null;
    if(performance.now()-route.at>HANDOVER_WINDOW||route.tab.getAttribute('href')!==location.hash||!bar.contains(route.tab))return;
    const previous=[...bar.querySelectorAll<HTMLElement>('.ui-tab[aria-current=page]')].filter(tab=>tab!==route.tab);
    for(const tab of previous)tab.removeAttribute('aria-current');
    route.tab.setAttribute('aria-current','page');
    chrome.setAttribute('data-route-handover','');
    held={tab:route.tab,previous};
  });
  watch.observe(chrome,{attributes:true,attributeFilter:['data-view-hidden'],attributeOldValue:true});
  watch.observe(host,{childList:true});
  bar.addEventListener('click',clicked);
  return ()=>{watch.disconnect();bar.removeEventListener('click',clicked);end();};
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
  const disposeSettle=bounded?bindSettleRepaint(bar):()=>{};
  const disposeHandover=bounded?bindRouteHandover(bar):()=>{};
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
      disposeHandover();
      disposeSettle();
      disposeZoom();
      disposeLens();
      glass.dispose();
      mini.remove();
      bar.removeAttribute('data-minimized');
    }
  };
}
