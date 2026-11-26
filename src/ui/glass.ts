// Liquid Glass for the island: the selection pill, the jelly press, and the material behind the bar. Chromium bends its backdrop with an
// SVG filter. Every other browser frosts the bar with its own backdrop filter, which needs no copy of the page and so cannot lag a scroll.
// Legacy unmarked frost bars retain a scroll edge. autoHideTabbar binds this controller for both Games and Movies.
import {observeSettledResize} from './settled-resize';
import {bindGlassInk} from './glass-ink';
import {bindWebglLens} from './webgl-glass';
export interface Brand{brand:string;version?:string}
type NavigatorWithBrands=Navigator&{userAgentData?:{brands?:Brand[]}};
export type GlassMode='backdrop'|'frost'|'off';

const SVG_NS='http://www.w3.org/2000/svg';
const XLINK_NS='http://www.w3.org/1999/xlink';
// The lens bends content by up to LENS_BEND px at the top and bottom rims, and the bend falls smoothly to nothing LENS_BEVEL px
// inside, so the centre stays still. The two end caps bend by LENS_CAP of that: at 390 px the island sits 12 px from each screen
// edge, so a full bend there would pull the screen's own dark margin into the ends. The map's channels run from -scale/2 to
// +scale/2, so the filter's scale is twice the bend. The lens reaches LENS_MARGIN px past the bar, which is where the rim samples
// its content from.
export const LENS_BEVEL=20;
export const LENS_BEND=10;
export const LENS_CAP=0.5;
export const REFRACTION_SCALE=2*LENS_BEND;
export const LENS_MARGIN=LENS_BEND+4;
// The arcade's clear material has a narrower, lower-power bezel. Keep these
// separate from the legacy unmarked-bar map and its displacement scale.
export const ARCADE_LENS_BEVEL=12;
// Keep the convex profile within a 3.5px offset and preserve map precision.
export const ARCADE_LENS_BEND=3.5;
const CURRENT='.ui-tab[aria-current="page"],.ui-tab[aria-pressed="true"]';
const PILL_VARS=['--ui-pill-x','--ui-pill-w','--ui-pill-on'];
let filterSeq=0;

const smoothstep=(t:number)=>t*t*(3-2*t);
// A convex squircle cross-section, y=(1-(1-t)^4)^1/4. Refract a vertical ray
// through its normal (air 1 → glass 1.5), then project it through the glass.
// Unlike the legacy outward smear, this samples inward: the rim magnifies the
// content inside the lens. Precompute the radial profile once per map.
function convexProfile(bevel:number,bend:number):number[]{
  const rays=Array.from({length:129},(_,i)=>{
    const t=Math.max(.0001,i/128),u=1-t,height=Math.pow(1-u**4,.25);
    const slope=u**3/height**3;
    const incidence=Math.atan(slope);
    const refraction=incidence-Math.asin(Math.sin(incidence)/1.5);
    return Math.min(bend,5*Math.tan(refraction)*(3+bevel*.65*height));
  });
  // Give the ray field a wider optical depth, then bound its radial derivative.
  // A sampled coordinate is depth + displacement: its derivative must stay
  // positive or the texture folds. .5 also limits magnification, preventing
  // thin terrain/wireframe lines from stretching into streaks. Integrating back
  // from the clear centre also removes the caustic
  // spike at the rim, without changing the legacy Movies field.
  const step=bevel/128*.5;
  for(let i=127;i>=0;i--)rays[i]=Math.min(rays[i],rays[i+1]+step);
  for(let i=1;i<=128;i++)rays[i]=Math.min(rays[i],rays[i-1]);
  return rays.map(ray=>-ray);
}
// The lens's height field. For each device pixel of a width by height box (in CSS px), it gives the displacement the lens applies there,
// sampled at the screen's pixel density. The bar is a capsule that sits LENS_MARGIN inside the box. A pixel moves outward along the capsule's normal, by LENS_BEND at the rim (LENS_CAP
// of that on the end caps), and that falls smoothly to zero LENS_BEVEL px inside. So each pixel samples from beyond the rim, which
// compresses the content into the rim like the edge of a thick glass, and along any normal the sample position only moves forward:
// nothing folds. The result is RGBA bytes. Red carries the x displacement and green the y one, each as 0 to 255 for -scale/2 to
// +scale/2, so 128 is no shift.
// The map has round(width * density) by round(height * density) pixels. Each pixel samples the field at its own centre, so at a whole
// density that centre is (x + 0.5) / density, and a map at density 2 is the same field drawn twice as finely.
export function lensField(width:number,height:number,margin=LENS_MARGIN,bevel=LENS_BEVEL,bend=LENS_BEND,cap=LENS_CAP,density=1,profile:'legacy'|'convex'='legacy'):Uint8ClampedArray<ArrayBuffer>{
  const pixelWidth=Math.round(width*density),pixelHeight=Math.round(height*density);
  const data=new Uint8ClampedArray(new ArrayBuffer(pixelWidth*pixelHeight*4));
  const scale=2*bend;
  const bw=width-2*margin,radius=(height-2*margin)/2;
  const convex=profile==='convex'?convexProfile(bevel,bend):null;
  for(let y=0;y<pixelHeight;y++)for(let x=0;x<pixelWidth;x++){
    // The device pixel's centre, in CSS px across the box. The map is stretched over the box, so this is also right when the size
    // times the density is not a whole number.
    const px=(x+0.5)*width/pixelWidth,py=(y+0.5)*height/pixelHeight;
    // The point in the bar's coordinates, with the capsule's core on the line v=0 between the two cap centres.
    const u=px-margin,v=py-margin-radius;
    const cx=Math.min(Math.max(u,radius),Math.max(bw-radius,radius));
    const dx=u-cx,dist=Math.hypot(dx,v);
    // Depth is the distance inside the rim. Outside the rim it stays at the rim's bend, so the field has no step at the edge. The
    // share is 1 where the normal is vertical (the straight rims) and cap where it is horizontal (the ends).
    const share=cap+(1-cap)*(dist>0?Math.abs(v)/dist:0);
    const depth=Math.min(1,Math.max(0,radius-dist)/bevel);
    const sample=depth*128,lo=Math.floor(sample);
    const push=convex
      ?share*(convex[lo]+(convex[Math.min(128,lo+1)]-convex[lo])*(sample-lo))
      :bend*share*(1-smoothstep(depth));
    const ox=dist>0?push*dx/dist:0,oy=dist>0?push*v/dist:0;
    const i=(y*pixelWidth+x)*4;
    data[i]=Math.round(255*(0.5+ox/scale));
    data[i+1]=Math.round(255*(0.5+oy/scale));
    data[i+2]=128;
    data[i+3]=255;
  }
  return data;
}

// The lens field as a PNG, the form an SVG feImage reads. The PNG has the box's size in device pixels, not in CSS px, so on a screen with
// more than one device pixel per CSS px the bend is as fine as the screen. The feImage stretches it over the box either way. Only a browser
// can encode the PNG, so this is outside the unit tests. With no 2D context there is no map, and the empty string tells the caller to leave
// the lens out, rather than bend with an all-zero map.
export function lensPng(width:number,height:number,density=1,arcade=false,margin=LENS_MARGIN):string{
  try{
  const canvas=document.createElement('canvas');
  const pixelWidth=Math.round(width*density),pixelHeight=Math.round(height*density);
  canvas.width=pixelWidth;canvas.height=pixelHeight;
  const context=canvas.getContext('2d');
  if(!context)return '';
  context.putImageData(new ImageData(lensField(width,height,margin,arcade?ARCADE_LENS_BEVEL:LENS_BEVEL,arcade?ARCADE_LENS_BEND:LENS_BEND,arcade?1:LENS_CAP,density,arcade?'convex':'legacy'),pixelWidth,pixelHeight),0,0);
  return canvas.toDataURL('image/png');
  }catch{return '';}
}
// The density the map is built at: the screen's device pixel ratio, but at least 1 and at most 3. A missing or odd ratio gives 1.
export function lensDensity(devicePixelRatio:number):number{
  return Math.min(3,Math.max(1,devicePixelRatio||1));
}

// Only Chromium-based browsers report the Chromium brand, and only Chromium draws an SVG filter inside backdrop-filter.
export function isChromiumBrands(brands:readonly Brand[]|undefined):boolean{
  return !!brands?.some(entry=>entry.brand==='Chromium');
}
// Which material a bar gets: Chromium refracts its backdrop, and every other browser frosts the bar. Reduced transparency, more contrast and
// forced colours get none, so the bar is a flat solid island.
export function glassMode(brands:readonly Brand[]|undefined,flags:{reducedTransparency:boolean;moreContrast:boolean;forcedColours:boolean}):GlassMode{
  if(flags.reducedTransparency||flags.moreContrast||flags.forcedColours)return 'off';
  return isChromiumBrands(brands)?'backdrop':'frost';
}

const round=(value:number)=>Math.round(value*100)/100;
// Apple Music's selected tab is a capsule PILL_SHARE of a tab's share of the bar wide, not one tab: Charlie's dark still
// 84 of a 350 px five-tab bar (1.2), his video 82-84 of 347-349 (1.17-1.21), the light still 71.5 of about 260 for four
// (1.1). It is centred on its tab, and an end tab's capsule stops at the bar's inset, the gap the pill keeps above and
// below (Apple's Home pill sits 4 px inside the bar), so there it sits a few px in from its tab's centre.
export const PILL_SHARE=1.2;
// The pill's box for a tab of a section bar, in the same terms as the tab's own: left and width without the bleed the
// stylesheet adds on each side. A bar too narrow to hold the capsule (a minimised bar) keeps the tab's own box.
export function capsulePill(tab:{left:number;width:number},bar:{width:number;tabs:number;inset:number;bleed:number}):{left:number;width:number}{
  const width=Math.max(tab.width+2*bar.bleed,PILL_SHARE*bar.width/Math.max(1,bar.tabs));
  if(width+2*bar.inset>bar.width)return tab;
  const centre=Math.min(Math.max(tab.left+tab.width/2,bar.inset+width/2),bar.width-bar.inset-width/2);
  return {left:centre-width/2+bar.bleed,width:width-2*bar.bleed};
}
// The custom properties that place the pill over a tab. With no current tab only its visibility changes, so it fades
// out where it was instead of sliding to the edge.
export function pillVars(tab:{left:number;width:number}|null):Record<string,string>{
  if(!tab)return {'--ui-pill-on':'0'};
  return {'--ui-pill-x':`${round(tab.left)}px`,'--ui-pill-w':`${round(tab.width)}px`,'--ui-pill-on':'1'};
}

function reduceMotion():boolean{
  return document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
}
// Engines without the pseudoElement option would animate the whole bar, so the stretch is skipped there. The test effect
// targets the bar itself: WebKit keeps the option only on an effect that has a target, and reports null without one.
function canStretch(target:Element):boolean{
  return typeof KeyframeEffect==='function'&&typeof HTMLElement.prototype.animate==='function'&&
    new KeyframeEffect(target,null,{pseudoElement:'::after'}).pseudoElement==='::after';
}

// The lens is the bar's first child in the backdrop, and it sits under everything else in the bar. It is grown by LENS_MARGIN on every
// side, so the rim can sample past the bar, and its clip-path cuts it back to the capsule. Its frost is its own backdrop, which Chromium
// bends with the filter.
function makeLens(margin=LENS_MARGIN):HTMLElement{
  const lens=document.createElement('span');
  lens.className='ui-glass-lens';
  lens.setAttribute('aria-hidden','true');
  lens.style.inset=`-${margin}px`;
  lens.style.clipPath=`inset(${margin}px round 999px)`;
  return lens;
}
// The glow is the bar's edge light. Its inset shadow brightens the rim, and plus-lighter lets that light add to what shows through the bar.
// It sits above the tint and below the pill and the tabs.
function makeGlow():HTMLElement{
  const glow=document.createElement('span');
  glow.className='ui-glass-glow';
  glow.setAttribute('aria-hidden','true');
  return glow;
}

// The SVG filter that bends a lens. Its displacement map is a PNG of the lens field, sized to the lens box. The map joins the filter
// only after it has decoded, because a filter with an empty map would shift everything by the full scale.
function makeFilter(id:string){
  const svg=document.createElementNS(SVG_NS,'svg');
  svg.setAttribute('width','0');
  svg.setAttribute('height','0');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  svg.style.position='absolute';
  const filter=document.createElementNS(SVG_NS,'filter');
  filter.setAttribute('id',id);
  filter.setAttribute('x','0');
  filter.setAttribute('y','0');
  filter.setAttribute('width','100%');
  filter.setAttribute('height','100%');
  filter.setAttribute('color-interpolation-filters','sRGB');
  const image=document.createElementNS(SVG_NS,'feImage');
  image.setAttribute('x','0');
  image.setAttribute('y','0');
  image.setAttribute('preserveAspectRatio','none');
  image.setAttribute('result','map');
  const displace=document.createElementNS(SVG_NS,'feDisplacementMap');
  displace.setAttribute('in','SourceGraphic');
  displace.setAttribute('in2','map');
  displace.setAttribute('scale',String(REFRACTION_SCALE));
  displace.setAttribute('xChannelSelector','R');
  displace.setAttribute('yChannelSelector','G');
  filter.append(displace);
  svg.append(filter);
  return {svg,filter,image,displace};
}

// Binds the pill, the press and the material to one bar. The lens is Chromium's backdrop refraction, and every other browser frosts the bar.
// Nothing here writes to the bar's children except the layers, and the observer ignores changes inside them, so no write loops back in.
export function bindGlass(bar:HTMLElement):{dispose():void}{
  const arcade=bar.classList.contains('arcade-glass');
  const section=bar.classList.contains('section-tabbar');
  // Convex arcade lenses sample inward, so their compositor surface needs no
  // legacy outward margin. This also bounds live canvas controls to their own
  // area instead of filtering an extra 14px on all four sides every frame.
  const bounded=arcade||bar.matches('.section-tabbar,.section-menu,.floating-glass-group');
  const margin=bounded?0:LENS_MARGIN;
  const standalone=bar.matches('.game-glass,.glass-control');
  const forceFallback=new URLSearchParams(location.search).get('glass')==='fallback';
  const brands=forceFallback?undefined:(navigator as NavigatorWithBrands).userAgentData?.brands;
  const queries=[matchMedia('(prefers-reduced-transparency: reduce)'),matchMedia('(prefers-contrast: more)'),matchMedia('(forced-colors: active)')];
  const id=`ui-glass-${++filterSeq}`;
  const {svg,filter,image,displace}=makeFilter(id);
  if(arcade){
    filter.setAttribute('filterUnits','userSpaceOnUse');
    filter.setAttribute('primitiveUnits','userSpaceOnUse');
    displace.setAttribute('scale',String(2*ARCADE_LENS_BEND));
  }
  const lens=makeLens(margin),glow=makeGlow();
  const edge=document.createElement('div');
  edge.className='ui-scroll-edge';
  edge.setAttribute('aria-hidden','true');
  const dragStyle=document.createElement('style');
  dragStyle.textContent='.ui-tabbar[data-glass-dragging]::after{transition:scale 140ms var(--ease-out),opacity 120ms var(--ease)!important}';
  document.head.append(dragStyle);
  const stretchable=canStretch(bar);
  let mode:GlassMode|undefined;
  // True once the map has decoded and the filter is in the document. Until then nothing refers to the filter.
  let ready=false,disposed=false,webgl=false;
  let mapWidth=0,mapHeight=0,mapDensity=0,mapSeq=0;
  // Set when the browser cannot make the map (no 2D canvas context, or a map that fails to decode). Such a bar has no lens at all.
  let lensless=false;
  let press:{
    tab:HTMLElement;
    pointerId:number;
    // A drag's pill: its box when the drag began, and the span its centre may travel (in the bar's layout px); the finger's
    // last x, and the pill centre's screen x when the drag began, which the pill keeps 1:1 with the finger from.
    drag:{x:number;y:number;active:boolean;center:number;pill:{left:number;width:number};range:[number,number];finger:number;screen:number}|null;
    // The bar's growth when the press began (section-navigation.css grows a pressed section bar about its centre).
    growth:[number,number];
    // Non-section bars keep the real control in place while the decorative pill moves (main mobile overhaul).
    startX:number;left:number;transform:string;priority:string;dragging:boolean;
  }|null=null;
  let scrubbedPointer:number|null=null;
  let placedLeft:number|null=null;
  let stretch:Animation|undefined;
  let settleTimer:ReturnType<typeof setTimeout>|undefined;
  let clickTimer:ReturnType<typeof setTimeout>|undefined;

  const current=()=>bar.querySelector<HTMLElement>(CURRENT);
  // A section pill still easing out of a press (its swell or a drag's stretch) is on the release spring, and the section
  // lens reads its raised bubble from that scale (section-lens.ts lift). The stretch's first '1 1' frame would win over
  // the transition and drop the bubble in one frame, so a selection made by the release rides the spring instead.
  const releasing=()=>section&&typeof CSSTransition==='function'&&bar.getAnimations({subtree:true}).some(animation=>
    animation instanceof CSSTransition&&animation.transitionProperty==='scale'&&(animation.effect as KeyframeEffect|null)?.pseudoElement==='::after');
  // The bar's on-screen size over its layout size, and the screen point that sits where a point sat in a press that began at
  // another growth: the bar grows about its centre, so a point keeps its place in the layout by scaling its offset from it.
  const growthOf=():[number,number]=>{
    const box=bar.getBoundingClientRect();
    return [box.width/(bar.offsetWidth||1)||1,box.height/(bar.offsetHeight||1)||1];
  };
  const throughGrowth=(x:number,y:number,from:[number,number]):[number,number]=>{
    const box=bar.getBoundingClientRect(),[sx,sy]=growthOf();
    const cx=box.left+box.width/2,cy=box.top+box.height/2;
    return [cx+(x-cx)*sx/from[0],cy+(y-cy)*sy/from[1]];
  };
  // A section bar's pill is Apple's capsule (capsulePill): its inset is the pill's own top (section-navigation.css), so
  // the ends keep the gap the pill keeps above and below. Every other bar's pill is its tab's box.
  const pillBox=(tab:HTMLElement)=>{
    const box={left:tab.offsetLeft,width:tab.offsetWidth};
    if(!section)return box;
    const style=getComputedStyle(bar,'::after');
    const tabs=[...bar.querySelectorAll<HTMLElement>('.ui-tab')].filter(entry=>entry.offsetWidth).length;
    return capsulePill(box,{width:bar.clientWidth,tabs,inset:parseFloat(style.top)||0,bleed:parseFloat(style.getPropertyValue('--section-pill-bleed'))||0});
  };
  const tabAt=(x:number,y:number)=>document.elementFromPoint(x,y)?.closest('.ui-tab')??null;
  // The tab whose centre is nearest a point along the bar, in its layout px.
  const nearestTab=(center:number)=>{
    let best:HTMLElement|null=null,gap=Infinity;
    for(const tab of bar.querySelectorAll<HTMLElement>('.ui-tab')){
      const away=Math.abs(tab.offsetLeft+tab.offsetWidth/2-center);
      if(tab.offsetWidth&&away<gap){best=tab;gap=away;}
    }
    return best;
  };
  // Moves the pill over a tab. The first placement after the bar has a size is instant, so the pill never slides in
  // from the edge. A bar with no size (detached, or hidden with display:none) is not measured, and its next placement is instant too.
  // A press moves the pill under the finger without settling it: the selection that the tap causes is still a move from the
  // settled position, so it stretches the pill.
  const place=(tab:HTMLElement|null,animate:boolean,pressing=false)=>{
    if(disposed)return;
    if(!bar.offsetWidth){bar.removeAttribute('data-pill-ready');return;}
    const box=tab?pillBox(tab):null;
    for(const [name,value] of Object.entries(pillVars(box)))bar.style.setProperty(name,value);
    if(!bar.hasAttribute('data-pill-ready')){
      // Read the layout so the instant write is applied before transitions are switched on.
      void bar.offsetWidth;
      bar.setAttribute('data-pill-ready','');
    }else if(animate&&box&&placedLeft!==null&&Math.abs(box.left-placedLeft)>0.5&&stretchable&&!reduceMotion()&&!releasing()){
      stretch?.cancel();
      stretch=bar.animate([{scale:'1 1'},{scale:'1.18 .9',offset:.4},{scale:'1 1'}],{duration:340,easing:'ease-out',pseudoElement:'::after'});
    }
    if(box&&!pressing)placedLeft=box.left;
  };
  // Nothing re-places the pill under a finger that is still down, or while a post-drag settle is waiting to activate.
  const sync=(animate:boolean)=>{if(!press&&!settleTimer)place(current(),animate);};
  const stopSettle=(restore=true)=>{
    if(!settleTimer)return;
    clearTimeout(settleTimer);settleTimer=undefined;
    document.removeEventListener('pointerdown',interruptSettle,true);
    document.removeEventListener('keydown',interruptSettle,true);
    document.removeEventListener('click',interruptClick,true);
    document.removeEventListener('visibilitychange',interruptHidden);
    window.removeEventListener('hashchange',interruptSettle);
    window.removeEventListener('blur',interruptSettle);
    if(restore)sync(true);
  };
  const interruptSettle=()=>stopSettle();
  const interruptClick=(event:MouseEvent)=>{if(!event.isTrusted||event.detail===0)stopSettle();};
  const interruptHidden=()=>{if(document.hidden)stopSettle();};

  // A press moves the pill under the finger and swells it. Keyboard activation sends no pointer events, so it never swells.
  // The release can land anywhere on the page, so the press listens on the document until it ends. Only the pointer that
  // began the press can end it, but a new primary press on the bar ends a stale one, since its pointer-up may never come.
  // A window that loses focus or a page that is hidden ends it too, for the same reason.
  const down=(event:PointerEvent)=>{
    if(event.button!==0||(section&&event.pointerType==='touch'&&!event.isPrimary))return;
    scrubbedPointer=null;
    stopSettle();
    if(press)release(null,true);
    clearClickGuard();
    const tab=event.target instanceof Element?event.target.closest<HTMLElement>('.ui-tab'):null;
    if(!tab||!bar.contains(tab))return;
    const drag=section&&!reduceMotion()?{x:event.clientX,y:event.clientY,active:false,center:0,pill:{left:0,width:0},range:[0,0] as [number,number],finger:event.clientX,screen:0}:null;
    press={tab,pointerId:event.pointerId,drag,growth:growthOf(),startX:event.clientX,left:tab.offsetLeft,transform:tab.style.getPropertyValue('transform'),priority:tab.style.getPropertyPriority('transform'),dragging:false};
    // Keep the actual control in place while the decorative pill moves.
    tab.style.setProperty('transform','none','important');
    bar.setAttribute('data-pressing','');
    document.addEventListener('pointermove',move,drag?{passive:true}:undefined);
    document.addEventListener('pointerup',up);
    document.addEventListener('dragstart',preventDrag);
    document.addEventListener('pointercancel',cancel);
    document.addEventListener('lostpointercapture',cancel);
    window.addEventListener('blur',lost);
    document.addEventListener('visibilitychange',hidden);
    if(!standalone)place(tab,false,true);
  };
  const move=(event:PointerEvent)=>{
    if(!press||event.pointerId!==press.pointerId)return;
    if(!press.drag){
      if(standalone)return;
      const delta=(event.clientX-press.startX)*(bar.offsetWidth/bar.getBoundingClientRect().width);
      if(!press.dragging&&Math.abs(delta)<1)return;
      press.dragging=true;
      // Disabling the CSS transition lets each pointer sample paint immediately.
      bar.setAttribute('data-glass-dragging','');
      const left=Math.max(0,Math.min(bar.offsetWidth-press.tab.offsetWidth,press.left+delta));
      bar.style.setProperty('--ui-pill-x',`${round(left)}px`);
      return;
    }
    const {drag,tab}=press;
    const dx=event.clientX-drag.x;
    // Leave taps and vertical pans alone until the pointer makes a horizontal move.
    if(!drag.active&&(Math.abs(dx)<6||Math.abs(dx)<=Math.abs(event.clientY-drag.y)))return;
    const width=tab.offsetWidth;
    if(!width||!bar.clientWidth)return;
    drag.finger=event.clientX;
    const begins=!drag.active;
    if(begins){
      // The capsule leaves from where it sat and its centre travels between the end tabs' capsules (capsulePill), so a
      // drag from an end tab, whose capsule sits a few px in from its tab, starts with no jump.
      const tabs=[...bar.querySelectorAll<HTMLElement>('.ui-tab')].filter(entry=>entry.offsetWidth);
      const centre=(box:{left:number;width:number})=>box.left+box.width/2;
      drag.pill=pillBox(tab);
      drag.range=[centre(pillBox(tabs[0]??tab)),centre(pillBox(tabs[tabs.length-1]??tab))];
      const box=bar.getBoundingClientRect();
      drag.screen=box.left+centre(drag.pill)*(box.width/(bar.offsetWidth||1)||1);
    }
    follow();
    if(begins){
      // The gesture takes over from any in-flight selection stretch.
      stretch?.cancel();
      drag.active=true;
      bar.setAttribute('data-pill-dragging','');
      followFrame=requestAnimationFrame(keepFollowing);
    }
  };
  // The bar grows about its centre while it is pressed (section-navigation.css), on a spring that is still settling for
  // about 300 ms (Charlie's video), so a layout px is a changing number of screen px. The pill's centre is placed from
  // the finger in screen px: where it sat on screen when the drag began, plus the finger's travel since, taken back into
  // the bar's layout px at its current scale. So it stays 1:1 with the finger on screen, and it is placed again on every
  // frame of the drag, so the settling bar never carries it off the finger (MOTION-7: it drifted by up to 1.1 px).
  let followFrame=0;
  const follow=()=>{
    const drag=press?.drag;
    if(!drag)return;
    const box=bar.getBoundingClientRect(),scale=box.width/(bar.offsetWidth||1)||1;
    const want=(drag.screen+drag.finger-drag.x-box.left)/scale;
    const center=Math.max(drag.range[0],Math.min(drag.range[1],want));
    const travel=want-(drag.pill.left+drag.pill.width/2);
    const deformation=Math.min(1,Math.abs(travel)/(press!.tab.offsetWidth||1));
    const scaleX=1.1+.22*deformation,scaleY=1.14-.16*deformation;
    drag.center=center;
    const x=`${round(center-drag.pill.width/2)}px`,stretchScale=`${scaleX} ${scaleY}`;
    if(bar.style.getPropertyValue('--ui-pill-drag-x')!==x)bar.style.setProperty('--ui-pill-drag-x',x);
    if(bar.style.getPropertyValue('--ui-pill-drag-scale')!==stretchScale)bar.style.setProperty('--ui-pill-drag-scale',stretchScale);
  };
  const keepFollowing=()=>{
    followFrame=0;
    if(!press?.drag?.active)return;
    follow();
    followFrame=requestAnimationFrame(keepFollowing);
  };
  // A native link drag would stop pointermove on the tabs that use anchors.
  const nativeDrag=(event:DragEvent)=>{
    if(press?.drag)event.preventDefault();
  };
  // The browser can still click the starting tab when a scrub returns to it.
  const suppressScrubClick=(event:MouseEvent)=>{
    if(scrubbedPointer===null||event.detail===0||
      (event instanceof PointerEvent&&event.pointerId!==scrubbedPointer))return;
    scrubbedPointer=null;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  if(section){
    bar.addEventListener('dragstart',nativeDrag);
    bar.addEventListener('click',suppressScrubClick,true);
  }
  const clearDrag=()=>{
    cancelAnimationFrame(followFrame);followFrame=0;
    bar.removeAttribute('data-pill-dragging');
    bar.style.removeProperty('--ui-pill-drag-x');
    bar.style.removeProperty('--ui-pill-drag-scale');
  };
  const stopListening=()=>{
    document.removeEventListener('pointermove',move);
    document.removeEventListener('pointerup',up);
    document.removeEventListener('dragstart',preventDrag);
    document.removeEventListener('pointercancel',cancel);
    document.removeEventListener('lostpointercapture',cancel);
    window.removeEventListener('blur',lost);
    document.removeEventListener('visibilitychange',hidden);
  };
  const release=(event:PointerEvent|null,cancelled:boolean)=>{
    if(!press)return;
    const {tab,drag,growth,transform,priority,dragging}=press;
    press=null;
    stopListening();
    if(transform)tab.style.setProperty('transform',transform,priority);
    else tab.style.removeProperty('transform');
    if(drag?.active){
      clearDrag();
      if(!cancelled&&event)scrubbedPointer=event.pointerId;
    }
    if(dragging){void bar.offsetWidth;bar.removeAttribute('data-glass-dragging');}
    bar.removeAttribute('data-pressing');
    if(dragging){
      // Touch can deliver a click to the tab where the gesture started.
      // Ignore that native click; the selected destination is activated below.
      bar.addEventListener('click',guardClick,true);
      clickTimer=setTimeout(clearClickGuard,600);
      const bounds=bar.getBoundingClientRect();
      const inside=!cancelled&&event&&event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom;
      const tabs=inside?[...bar.querySelectorAll<HTMLElement>('.ui-tab')].filter(candidate=>candidate.getClientRects().length&&!candidate.matches(':disabled,[aria-disabled="true"]')):[];
      const nearest=tabs.reduce<HTMLElement|null>((best,candidate)=>{
        const centre=(element:HTMLElement)=>{const box=element.getBoundingClientRect();return box.left+box.width/2;};
        return !best||Math.abs(centre(candidate)-event!.clientX)<Math.abs(centre(best)-event!.clientX)?candidate:best;
      },null);
      if(nearest&&nearest!==current()){
        place(nearest,true);
        // Let the pill settle before a destination replaces or hides the bar.
        const key=['href','data-kind','data-action'].find(name=>nearest.hasAttribute(name));
        const value=key?nearest.getAttribute(key):null;
        const activate=()=>{
          stopSettle(false);
          const target=nearest.isConnected&&bar.contains(nearest)?nearest:key?[...bar.querySelectorAll<HTMLElement>('.ui-tab')].find(candidate=>candidate.tagName===nearest.tagName&&candidate.getAttribute(key)===value):null;
          if(target&&!target.matches(':disabled,[aria-disabled="true"]'))target.click();else sync(true);
        };
        if(reduceMotion())activate();else{
          settleTimer=setTimeout(activate,340);
          document.addEventListener('pointerdown',interruptSettle,true);
          document.addEventListener('keydown',interruptSettle,true);
          document.addEventListener('click',interruptClick,true);
          document.addEventListener('visibilitychange',interruptHidden);
          window.addEventListener('hashchange',interruptSettle);
          window.addEventListener('blur',interruptSettle);
        }
        return;
      }
      sync(true);
      return;
    }
    // A tap ends over the same tab. The point decides, not the target, because a touch keeps its target after the finger leaves.
    // The point is taken in the layout the press began in: the pressed bar has grown about its centre since, so a pointer
    // that has not moved can sit over the next tab's grown edge (about 4 px at Games/Movies at 390 px).
    const tapped=!drag?.active&&!cancelled&&!!event&&tabAt(...throughGrowth(event.clientX,event.clientY,growth))===tab;
    // There the browser's own click follows the grown bar: a mouse's goes to the bar (the common ancestor of the two tabs)
    // and selects nothing, and a touch's may go to the neighbour. The tap selects the tab it began on, and that click is
    // dropped as a scrub's is.
    if(tapped&&section&&tabAt(event!.clientX,event!.clientY)!==tab){
      scrubbedPointer=event!.pointerId;
      tab.click();
    }
    // A completed tap on a tab that selects itself keeps the pill under the finger: its click makes that tab current, and the
    // observer below follows the change. If the click changes nothing, the pill still sits under the tapped tab, so the next
    // frame puts it back under the current one. Anything else springs back to the current tab now.
    if(tapped&&(tab.tagName==='A'||tab.hasAttribute('aria-pressed'))){requestAnimationFrame(()=>sync(false));return;}
    // A section drag that lets go selects the tab under the lens, the one nearest the pill's centre, as a tap on it
    // would, and the pill springs there, not back to the current tab. A cancelled drag, or one released outside the bar,
    // springs back. The destination click waits for the pill to settle so a newer action can cancel it (main mobile overhaul).
    if(drag?.active){
      const bounds=bar.getBoundingClientRect();
      const inside=!cancelled&&event&&event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom;
      const target=inside?nearestTab(drag.center):null;
      if(target&&target!==current()){
        place(target,true);
        bar.addEventListener('click',guardClick,true);
        clickTimer=setTimeout(clearClickGuard,600);
        const key=['href','data-kind','data-action'].find(name=>target.hasAttribute(name));
        const value=key?target.getAttribute(key):null;
        const activate=()=>{
          stopSettle(false);
          const chosen=target.isConnected&&bar.contains(target)?target:key?[...bar.querySelectorAll<HTMLElement>('.ui-tab')].find(candidate=>candidate.tagName===target.tagName&&candidate.getAttribute(key)===value):null;
          if(chosen&&!chosen.matches(':disabled,[aria-disabled="true"]'))chosen.click();else sync(true);
        };
        if(reduceMotion())activate();else{
          settleTimer=setTimeout(activate,340);
          document.addEventListener('pointerdown',interruptSettle,true);
          document.addEventListener('keydown',interruptSettle,true);
          document.addEventListener('click',interruptClick,true);
          document.addEventListener('visibilitychange',interruptHidden);
          window.addEventListener('hashchange',interruptSettle);
          window.addEventListener('blur',interruptSettle);
        }
        return;
      }
      sync(true);
      return;
    }
    sync(true);
  };
  const guardClick=(event:MouseEvent)=>{if(event.isTrusted&&event.detail>0){event.preventDefault();event.stopImmediatePropagation();clearClickGuard();}};
  const clearClickGuard=()=>{clearTimeout(clickTimer);clickTimer=undefined;bar.removeEventListener('click',guardClick,true);};
  const preventDrag=(event:DragEvent)=>{if(press?.tab.contains(event.target as Node))event.preventDefault();};
  const up=(event:PointerEvent)=>{if(event.pointerId===press?.pointerId)release(event,false);};
  const cancel=(event:PointerEvent)=>{if(event.pointerId===press?.pointerId)release(null,true);};
  const lost=()=>release(null,true);
  const hidden=()=>{if(document.hidden)release(null,true);};
  bar.addEventListener('pointerdown',down);

  // Chromium's bar is refracting when the lens reads the filter. The class and the variable are what the stylesheet reads.
  // One rendering mode at a time: the WebGL lens over a live game canvas, else
  // Chromium's SVG backdrop, else plain blur. A blur() url() chain is never the fallback.
  const paint=()=>{
    const svgMode=mode==='backdrop'&&ready&&!webgl;
    bar.dataset.glassMode=mode===undefined||mode==='off'?'off':webgl?'webgl':svgMode?'svg':'blur';
    bar.classList.toggle('is-refracting',svgMode);
    if(svgMode)bar.style.setProperty('--ui-glass-filter',`url(#${id})`);
    else bar.style.removeProperty('--ui-glass-filter');
  };
  const live=bindWebglLens(bar,active=>{if(disposed)return;webgl=active;paint();});
  // Stretch the decoded field inside the current bounded lens while its box
  // morphs. Re-encoding a DPR3 PNG on every ResizeObserver notification was
  // blocking scrolling; only the settled shape needs a fresh ray field.
  const fitMap=(width:number,height:number)=>{
    if(arcade){filter.setAttribute('width',String(width));filter.setAttribute('height',String(height));}
    image.setAttribute('width',String(width));
    image.setAttribute('height',String(height));
  };
  // The map is rebuilt when the bar changes size or the screen's pixel density changes. A detached or hidden bar has no size, so it
  // keeps its last map. Only the backdrop has a map.
  const rebuild=()=>{
    const width=bar.offsetWidth+2*margin,height=bar.offsetHeight+2*margin,density=lensDensity(window.devicePixelRatio);
    if(mode!=='backdrop'||!bar.offsetWidth||!bar.offsetHeight)return;
    // A cancelled morph can return to the cached PNG's size. Its live SVG
    // bounds were stretched in between, so restore them even on a cache hit.
    fitMap(width,height);
    if(width===mapWidth&&height===mapHeight&&density===mapDensity)return;
    mapWidth=width;
    mapHeight=height;
    mapDensity=density;
    const token=++mapSeq;
    const url=lensPng(width,height,density,arcade,margin);
    // A lens without its map would shift everything by the full scale, so without one the lens is left out.
    if(!url){lensless=true;applyMode();return;}
    const probe=new Image();
    probe.onload=()=>{
      if(token!==mapSeq||disposed)return;
      // Match the filter region and the map exactly. Percent/object-box filter
      // regions can rescale the field when a content-sized capsule resizes.
      fitMap(bar.offsetWidth+2*margin,bar.offsetHeight+2*margin);
      image.setAttribute('href',url);
      image.setAttributeNS(XLINK_NS,'xlink:href',url);
      if(!ready){filter.insertBefore(image,displace);document.body.append(svg);ready=true;}
      paint();
    };
    probe.onerror=()=>{if(token===mapSeq&&!disposed){lensless=true;applyMode();}};
    probe.src=url;
  };

  // Movies rewrites the bar's children on every render, which takes the layers out. They go back in as the first children: the glow, and the
  // lens in front of it in the backdrop.
  const ensureLayers=()=>{
    if(mode!=='backdrop'&&mode!=='frost')return;
    if(glow.parentNode!==bar)bar.prepend(glow);
    if(mode==='backdrop'&&lens.parentNode!==bar)bar.prepend(lens);
  };
  // The scroll edge is a frost layer, and it exists only in the frost: in the backdrop it would sit under the lens and blur the page that the
  // lens bends. It sits right after the island, so the stylesheet can fade it with the island's own hide. It is a sibling, not a child: a bar
  // with a backdrop filter is a backdrop root, so its children could not blur the page behind it. Movies re-renders its children, so the edge
  // goes back in whenever the island's parent changes. It is hidden while the island has no size, which is what the arcade does in a game
  // and in Movies.
  let watched:Node|null=null;
  const parentWatch=new MutationObserver(()=>keepEdge());
  const keepEdge=()=>{
    const parent=bar.parentNode;
    if(parent!==watched){parentWatch.disconnect();watched=parent;if(parent)parentWatch.observe(parent,{childList:true});}
    if(!parent||mode!=='frost'||standalone||arcade){edge.remove();return;}
    if(bar.nextSibling!==edge)bar.after(edge);
    edge.hidden=!bar.offsetWidth;
  };
  // A change of pixel density (a zoom, or a window dragged to another screen) rebuilds the map. A resolution query matches only the density it
  // names, so the watch moves on to each new density as it arrives. Only the backdrop has a map, so only the backdrop watches.
  let densityQuery:MediaQueryList|undefined;
  const onDensity=()=>{watchDensity();rebuild();};
  const watchDensity=()=>{
    densityQuery?.removeEventListener('change',onDensity);
    densityQuery=mode==='backdrop'&&!disposed?matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`):undefined;
    densityQuery?.addEventListener('change',onDensity);
  };
  // A change of mode takes out what the new mode does not draw, and draws what it does.
  const applyMode=()=>{
    const preferred=glassMode(brands,{reducedTransparency:queries[0].matches||document.documentElement.classList.contains('reduce-transparency'),moreContrast:queries[1].matches,forcedColours:queries[2].matches});
    const next=lensless&&preferred==='backdrop'?'frost':preferred;
    if(next===mode)return;
    mode=next;
    bar.dataset.glass=mode;
    // Controls inside a glass sheet keep a thin fill; a second refracting layer would sample the game, not the sheet.
    live.setEnabled(mode!=='off'&&!bar.parentElement?.closest('.ui-glass-sheet,dialog'));
    if(mode!=='backdrop'){lens.remove();svg.remove();ready=false;mapSeq++;mapWidth=mapHeight=mapDensity=0;}
    if(mode==='off')glow.remove();
    else{ensureLayers();rebuild();}
    watchDensity();
    keepEdge();
    paint();
  };

  const observer=new MutationObserver(records=>{
    ensureLayers();
    // Changes inside the layers are their own, so they neither move the pill nor need another sync.
    if(records.some(record=>!lens.contains(record.target)&&!glow.contains(record.target)))sync(true);
  });
  observer.observe(bar,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current','aria-pressed','data-hidden']});
  // A resize changes the tab positions with no mutation, and a size change also covers a bar that was hidden or detached.
  const stopResize=observeSettledResize(bar,()=>{rebuild();sync(false);keepEdge();},()=>{
    if(mode==='backdrop'&&ready)fitMap(bar.offsetWidth+2*margin,bar.offsetHeight+2*margin);
    sync(false);keepEdge();
  });
  void document.fonts?.ready.then(()=>{if(!disposed)sync(false);});
  for(const query of queries)query.addEventListener('change',applyMode);
  const preferenceObserver=new MutationObserver(applyMode);
  preferenceObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']});

  applyMode();
  sync(false);
  const disposeInk=arcade?bindGlassInk(bar):undefined;

  return{
    dispose(){
      if(disposed)return;
      disposed=true;
      disposeInk?.();
      observer.disconnect();
      stopResize();
      parentWatch.disconnect();
      for(const query of queries)query.removeEventListener('change',applyMode);
      preferenceObserver.disconnect();
      densityQuery?.removeEventListener('change',onDensity);
      densityQuery=undefined;
      bar.removeEventListener('pointerdown',down);
      if(section){
        bar.removeEventListener('dragstart',nativeDrag);
        bar.removeEventListener('click',suppressScrubClick,true);
      }
      if(press){
        if(press.transform)press.tab.style.setProperty('transform',press.transform,press.priority);
        else press.tab.style.removeProperty('transform');
        if(press.drag?.active)clearDrag();
      }
      stopListening();
      press=null;
      stopSettle(false);
      clearClickGuard();
      bar.removeAttribute('data-glass-dragging');
      dragStyle.remove();
      stretch?.cancel();
      live.dispose();
      lens.remove();
      glow.remove();
      edge.remove();
      svg.remove();
      mode='off';
      bar.classList.remove('is-refracting');
      bar.style.removeProperty('--ui-glass-filter');
      delete bar.dataset.glass;delete bar.dataset.glassMode;
      bar.removeAttribute('data-pressing');
      bar.removeAttribute('data-pill-ready');
      for(const name of PILL_VARS)bar.style.removeProperty(name);
    }
  };
}
