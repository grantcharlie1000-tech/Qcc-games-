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
// MOTION-23 (#24 council on 071faed9: the glyph under the drag lens's edge tears): the rim pulled a glyph from 18 css px
// out into its outer band, and a glyph just past the edge stays put, so the two halves split by up to 18 px there.
// A 6 px pull still bends the glyph into the rim but no longer splits it.
const WARP_REACH=6,WARP_BAND=9,WARP_SPAN=2.2*WARP_REACH,WARP_DENSITY=2;
const SVG_NS='http://www.w3.org/2000/svg';
let warpIds=0;
// MOTION-13 (#24 review of aa6359ee..691f4616, I-2): the map was drawn and PNG-encoded (toDataURL) inside the rAF tick at
// every 2 css px size step of the rising, falling or stretching bubble, and every feImage then loaded the new image. Each
// size's map is now built once and kept (the WARP_CACHE most recent): its pixels in a task after the frame, its PNG by
// toBlob, and it is decoded before any feImage takes it. One map is built at a time, for the latest size asked for, so a
// rise or a fall builds a few maps, not one per step. Until the bubble's own size is ready, the tabs keep the last decoded
// map, stretched to the bubble's box, so no frame swaps a glyph's bend to an image that is not there yet.
const WARP_CACHE=24;
type WarpMap={url:string;ready:boolean};
const warpMaps=new Map<string,WarpMap>();
let warpWanted:{key:string;width:number;height:number;bevel:number}|null=null,warpBuilding=false;
function warpBuild(){
  const next=warpWanted;
  warpWanted=null;
  if(!next||warpMaps.has(next.key))return;
  const entry:WarpMap={url:'',ready:false};
  warpMaps.set(next.key,entry);
  for(const key of warpMaps.keys()){if(warpMaps.size<=WARP_CACHE)break;if(key!==next.key)warpMaps.delete(key);}
  warpBuilding=true;
  const done=(url='')=>{entry.url=url;entry.ready=true;warpBuilding=false;warpBuild();};
  setTimeout(()=>{
    const canvas=warpCanvas(next.width,next.height,next.bevel);
    if(!canvas||typeof canvas.toBlob!=='function'||typeof FileReader!=='function'){done();return;}
    canvas.toBlob(blob=>{
      if(!blob){done();return;}
      const reader=new FileReader();
      reader.onerror=()=>done();
      reader.onload=()=>{
        const url=typeof reader.result==='string'?reader.result:'',image=new Image();
        image.src=url;
        image.decode().then(()=>done(url),()=>done());
      };
      reader.readAsDataURL(blob);
    },'image/png');
  },0);
}
// The decoded map for a bubble size, or null while it is being built (a size not yet asked for starts building).
function warpMap(width:number,height:number,bevel:number):WarpMap|null{
  const key=`${width}x${height}x${Math.round(bevel)}`,hit=warpMaps.get(key);
  if(hit){warpMaps.delete(key);warpMaps.set(key,hit);return hit.ready?hit:null;}
  warpWanted={key,width,height,bevel};
  if(!warpBuilding)warpBuild();
  return null;
}
// The decoded map nearest a size, for a bar whose first bend comes before its own size is ready ('' if none is).
function warpNearest(width:number,height:number):string{
  let url='',best=Infinity;
  for(const [key,map] of warpMaps){
    if(!map.ready||!map.url)continue;
    const [w,h]=key.split('x').map(Number),gap=Math.abs(w-width)+Math.abs(h-height);
    if(gap<best){best=gap;url=map.url;}
  }
  return url;
}
function warpCanvas(width:number,height:number,bevel:number):HTMLCanvasElement|null{
  const w=Math.ceil(width*WARP_DENSITY),h=Math.ceil(height*WARP_DENSITY);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  if(!ctx||!w||!h)return null;
  const image=ctx.createImageData(w,h),radius=Math.min(width,height)/2,line=Math.max(0,(width-height)/2),band=Math.min(bevel,WARP_BAND);
  // Channel .5 (128) is no displacement; at full lift feDisplacementMap's scale WARP_SPAN spans the whole pull either way.
  // Only the bubble's outer band moves, so the map starts flat and only pixels within a px of that band are worked out.
  image.data.fill(128);
  for(let i=3;i<image.data.length;i+=4)image.data[i]=255;
  const near=Math.max(0,radius-band-1)**2,far=(radius+1)**2;
  for(let y=0;y<h;y++){
    const py=(y+.5)/WARP_DENSITY-height/2;
    for(let x=0;x<w;x++){
      const px=(x+.5)/WARP_DENSITY-width/2,ax=px-Math.max(-line,Math.min(line,px)),reach=ax*ax+py*py;
      if(reach<near||reach>far)continue;
      const length=Math.hypot(ax,py),depth=radius-length;
      const u=depth>0&&length>0?Math.max(0,1-depth/band):0,pull=WARP_REACH*u*u*u/Math.max(length,1e-3);
      const i=(y*w+x)*4;
      image.data[i]=Math.round(255*(.5+ax*pull/WARP_SPAN));
      image.data[i+1]=Math.round(255*(.5+py*pull/WARP_SPAN));
    }
  }
  ctx.putImageData(image,0,0);
  return canvas;
}
function bindLensWarp(bar:HTMLElement){
  const defs=document.createElementNS(SVG_NS,'svg');
  defs.setAttribute('aria-hidden','true');
  defs.style.cssText='position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const filters=new Map<HTMLElement,{id:string;image:SVGFEImageElement;filter:SVGFilterElement;displace:SVGFEDisplacementMapElement}>();
  // The last decoded map the tabs were given.
  let shown='';
  // A map at the raised bubble's usual size (about 1.58 x 1.11 bar heights held, section-lens.ts) is built once the bar is
  // laid out, so the first press bends from its first frame, not from when its own size is ready.
  const warm=requestAnimationFrame(()=>{
    const height=bar.offsetHeight;
    if(height>0){const w=Math.round(1.58*height/2)*2,h=Math.round(1.11*height/2)*2;warpMap(w,h,raisedBevel(w,h));}
  });
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
    // Once per frame: the map for the bubble in the bar's layout px (width, height, bevel), drawn at its size to the
    // nearest 2 css px, or the last decoded one until that is ready.
    map(lens:readonly [number,number,number,number,number]){
      const width=Math.round(lens[2]/2)*2,height=Math.round(lens[3]/2)*2,ready=warpMap(width,height,lens[4]);
      if(ready)shown=ready.url;
      // The bar's first bend takes the nearest decoded size, stretched to the bubble, until its own is ready.
      else if(!shown)shown=warpNearest(width,height);
      return shown;
    },
    // The bubble (centre x, centre y, width, height, bevel), its lift and map, and the tab's layout box [left, top, width,
    // height], read before the frame's writes. Each tab it crosses bends.
    set(tab:HTMLElement,lens:readonly [number,number,number,number,number]|null,lift:number,map:string,box:readonly [number,number,number,number]){
      if(!lens||!map){if(tab.style.filter)tab.style.removeProperty('filter');return;}
      // The map is centred on the bubble and stretched to its box.
      const [cx,cy]=lens,width=Math.round(lens[2]/2)*2,height=Math.round(lens[3]/2)*2,[left,top,tabWidth,tabHeight]=box;
      const {id,image,filter,displace}=make(tab);
      if(image.getAttribute('href')!==map)image.setAttribute('href',map);
      const attributes:[SVGElement,string,number][]=[[displace,'scale',WARP_SPAN*lift],[filter,'x',-24],[filter,'y',-24],[filter,'width',tabWidth+48],
        [filter,'height',tabHeight+48],[image,'x',cx-width/2-left],[image,'y',cy-height/2-top],
        [image,'width',width],[image,'height',height]];
      for(const [element,name,value] of attributes)if(element.getAttribute(name)!==value.toFixed(2))element.setAttribute(name,value.toFixed(2));
      if(tab.style.filter!==`url("#${id}")`)tab.style.setProperty('filter',`url("#${id}")`);
    },
    clear(tabs:readonly HTMLElement[]){for(const tab of tabs)tab.style.removeProperty('filter');},
    dispose(){cancelAnimationFrame(warm);filters.clear();defs.remove();},
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
  // A tab's layout box in the bar, [left, top, width, height], read with the frame's other reads.
  const box=(tab:HTMLElement)=>[tab.offsetLeft,tab.offsetTop,tab.offsetWidth,tab.offsetHeight] as const;
  // The rim bends the tabs it crosses (bindLensWarp) while the WebGL bubble is raised, through the release spring too.
  // Each tab comes with its cover and its box, both read before the frame's first write.
  const bend=(drawn:{pill:number[];sx:number;sy:number}|undefined,lift:number,covers:readonly (readonly [HTMLElement,number,readonly [number,number,number,number]])[])=>{
    const lens=drawn&&lift>0?[drawn.pill[0]/drawn.sx,drawn.pill[1]/drawn.sy,drawn.pill[2]/drawn.sx,drawn.pill[3]/drawn.sy] as const:null;
    const bubble=lens?[...lens,raisedBevel(lens[2],lens[3])] as const:null;
    const map=bubble&&covers.some(([,cover])=>cover>0&&cover<.999)?warp.map(bubble):'';
    for(const [tab,cover,place] of covers)warp.set(tab,bubble&&cover>0&&cover<.999?bubble:null,lift,map,place);
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
      // The release: the glyphs ease back (CSS) while the bend follows the falling bubble down. The tabs are read before
      // unzoom writes.
      const covers=drawn&&lift>0?tabs().map(tab=>[tab,tabCover(center,half,bevel,content(tab)),box(tab)] as const):null;
      if(pressedAt!==null)unzoom();
      if(covers){bend(drawn,lift,covers);frame=requestAnimationFrame(tick);}
      else clear();
      return;
    }
    const now=performance.now();
    pressedAt??=now;
    const rise=glyphRise(now-pressedAt);
    // Every layout read comes before the first write, so a drag frame forces at most one layout.
    const zooms=tabs().map(tab=>{
      const cover=tabCover(center,half,bevel,content(tab)),place=box(tab);
      return [tab,(1+(lensZoom(scaleX,cover,scaleY)-1)*rise).toFixed(3),cover,Math.abs(place[0]+place[2]/2-center),place] as const;
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
    bend(drawn,lift,zooms.map(([tab,,cover,,place])=>[tab,cover,place] as const));
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
// LOOK-11 (review I-1 on 691f4616): the dark section lens inks each tab from its backdrop (section-lens.ts requestInk). A
// paint not yet inked holds data-ink-pending, so the settle waits for the ink as for any motion, and an ink that changes
// bumps data-ink, which re-arms the settle: the repaint then follows its colour ease (a scroll that stops, late art).
function bindSettleRepaint(bar:HTMLElement):()=>void{
  let frame=0,quiet=0,frames=0,size='';
  const held=()=>bar.matches('[data-pressing],[data-pill-dragging]');
  const moving=()=>bar.hasAttribute('data-ink-pending')||typeof bar.getAnimations==='function'&&bar.getAnimations({subtree:true}).some(animation=>
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
  watch.observe(bar,{attributes:true,attributeFilter:['data-pill-dragging','data-pressing','data-ink']});
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
