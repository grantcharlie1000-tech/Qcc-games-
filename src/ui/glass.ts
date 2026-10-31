// Liquid Glass for the island: the selection pill, the jelly press, and the material behind the bar. Chromium bends its backdrop with an
// SVG filter. Every other browser frosts the bar with its own backdrop filter, which needs no copy of the page and so cannot lag a scroll.
// In the frost, phones also get a scroll edge behind the bar. tabbar.ts calls bindGlass from autoHideTabbar, so the arcade bar and the Movies
// bar both get it.
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
const CURRENT='.ui-tab[aria-current="page"],.ui-tab[aria-pressed="true"]';
const PILL_VARS=['--ui-pill-x','--ui-pill-w','--ui-pill-on'];
let filterSeq=0;

const smoothstep=(t:number)=>t*t*(3-2*t);
// The lens's height field. For each device pixel of a width by height box (in CSS px), it gives the displacement the lens applies there,
// sampled at the screen's pixel density. The bar is a capsule that sits LENS_MARGIN inside the box. A pixel moves outward along the capsule's normal, by LENS_BEND at the rim (LENS_CAP
// of that on the end caps), and that falls smoothly to zero LENS_BEVEL px inside. So each pixel samples from beyond the rim, which
// compresses the content into the rim like the edge of a thick glass, and along any normal the sample position only moves forward:
// nothing folds. The result is RGBA bytes. Red carries the x displacement and green the y one, each as 0 to 255 for -scale/2 to
// +scale/2, so 128 is no shift.
// The map has round(width * density) by round(height * density) pixels. Each pixel samples the field at its own centre, so at a whole
// density that centre is (x + 0.5) / density, and a map at density 2 is the same field drawn twice as finely.
export function lensField(width:number,height:number,margin=LENS_MARGIN,bevel=LENS_BEVEL,bend=LENS_BEND,cap=LENS_CAP,density=1):Uint8ClampedArray<ArrayBuffer>{
  const pixelWidth=Math.round(width*density),pixelHeight=Math.round(height*density);
  const data=new Uint8ClampedArray(new ArrayBuffer(pixelWidth*pixelHeight*4));
  const scale=2*bend;
  const bw=width-2*margin,radius=(height-2*margin)/2;
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
    const push=bend*share*(1-smoothstep(Math.min(1,Math.max(0,radius-dist)/bevel)));
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
export function lensPng(width:number,height:number,density=1):string{
  const canvas=document.createElement('canvas');
  const pixelWidth=Math.round(width*density),pixelHeight=Math.round(height*density);
  canvas.width=pixelWidth;canvas.height=pixelHeight;
  const context=canvas.getContext('2d');
  if(!context)return '';
  context.putImageData(new ImageData(lensField(width,height,LENS_MARGIN,LENS_BEVEL,LENS_BEND,LENS_CAP,density),pixelWidth,pixelHeight),0,0);
  return canvas.toDataURL('image/png');
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
function makeLens():HTMLElement{
  const lens=document.createElement('span');
  lens.className='ui-glass-lens';
  lens.setAttribute('aria-hidden','true');
  lens.style.inset=`-${LENS_MARGIN}px`;
  lens.style.clipPath=`inset(${LENS_MARGIN}px round 999px)`;
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
  const brands=(navigator as NavigatorWithBrands).userAgentData?.brands;
  const queries=[matchMedia('(prefers-reduced-transparency: reduce)'),matchMedia('(prefers-contrast: more)'),matchMedia('(forced-colors: active)')];
  const id=`ui-glass-${++filterSeq}`;
  const {svg,filter,image,displace}=makeFilter(id);
  const lens=makeLens(),glow=makeGlow();
  const edge=document.createElement('div');
  edge.className='ui-scroll-edge';
  edge.setAttribute('aria-hidden','true');
  const stretchable=canStretch(bar);
  let mode:GlassMode|undefined;
  // True once the map has decoded and the filter is in the document. Until then nothing refers to the filter.
  let ready=false,disposed=false;
  let mapWidth=0,mapHeight=0,mapDensity=0,mapSeq=0;
  // Set when the browser cannot make the map (no 2D canvas context, or a map that fails to decode). Such a bar has no lens at all.
  let lensless=false;
  let press:{tab:HTMLElement;pointerId:number}|null=null;
  let placedLeft:number|null=null;
  let stretch:Animation|undefined;

  const current=()=>bar.querySelector<HTMLElement>(CURRENT);
  // Moves the pill over a tab. The first placement after the bar has a size is instant, so the pill never slides in
  // from the edge. A bar with no size (detached, or hidden with display:none) is not measured, and its next placement is instant too.
  // A press moves the pill under the finger without settling it: the selection that the tap causes is still a move from the
  // settled position, so it stretches the pill.
  const place=(tab:HTMLElement|null,animate:boolean,pressing=false)=>{
    if(disposed)return;
    if(!bar.offsetWidth){bar.removeAttribute('data-pill-ready');return;}
    const box=tab?{left:tab.offsetLeft,width:tab.offsetWidth}:null;
    for(const [name,value] of Object.entries(pillVars(box)))bar.style.setProperty(name,value);
    if(!bar.hasAttribute('data-pill-ready')){
      // Read the layout so the instant write is applied before transitions are switched on.
      void bar.offsetWidth;
      bar.setAttribute('data-pill-ready','');
    }else if(animate&&box&&placedLeft!==null&&Math.abs(box.left-placedLeft)>0.5&&stretchable&&!reduceMotion()){
      stretch?.cancel();
      stretch=bar.animate([{scale:'1 1'},{scale:'1.18 .9',offset:.4},{scale:'1 1'}],{duration:340,easing:'ease-out',pseudoElement:'::after'});
    }
    if(box&&!pressing)placedLeft=box.left;
  };
  // Nothing re-places the pill under a finger that is still down.
  const sync=(animate:boolean)=>{if(!press)place(current(),animate);};

  // A press moves the pill under the finger and swells it. Keyboard activation sends no pointer events, so it never swells.
  // The release can land anywhere on the page, so the press listens on the document until it ends. Only the pointer that
  // began the press can end it, but a new primary press on the bar ends a stale one, since its pointer-up may never come.
  // A window that loses focus or a page that is hidden ends it too, for the same reason.
  const down=(event:PointerEvent)=>{
    if(event.button!==0)return;
    if(press)release(null,true);
    const tab=event.target instanceof Element?event.target.closest<HTMLElement>('.ui-tab'):null;
    if(!tab||!bar.contains(tab))return;
    press={tab,pointerId:event.pointerId};
    bar.setAttribute('data-pressing','');
    document.addEventListener('pointerup',up);
    document.addEventListener('pointercancel',cancel);
    document.addEventListener('lostpointercapture',cancel);
    window.addEventListener('blur',lost);
    document.addEventListener('visibilitychange',hidden);
    place(tab,false,true);
  };
  const stopListening=()=>{
    document.removeEventListener('pointerup',up);
    document.removeEventListener('pointercancel',cancel);
    document.removeEventListener('lostpointercapture',cancel);
    window.removeEventListener('blur',lost);
    document.removeEventListener('visibilitychange',hidden);
  };
  const release=(event:PointerEvent|null,cancelled:boolean)=>{
    if(!press)return;
    const {tab}=press;
    press=null;
    stopListening();
    bar.removeAttribute('data-pressing');
    // A tap ends over the same tab. The point decides, not the target, because a touch keeps its target after the finger leaves.
    const tapped=!cancelled&&!!event&&document.elementFromPoint(event.clientX,event.clientY)?.closest('.ui-tab')===tab;
    // A completed tap on a tab that selects itself keeps the pill under the finger: its click makes that tab current, and the
    // observer below follows the change. If the click changes nothing, the pill still sits under the tapped tab, so the next
    // frame puts it back under the current one. Anything else springs back to the current tab now.
    if(tapped&&(tab.tagName==='A'||tab.hasAttribute('aria-pressed'))){requestAnimationFrame(()=>sync(false));return;}
    sync(true);
  };
  const up=(event:PointerEvent)=>{if(event.pointerId===press?.pointerId)release(event,false);};
  const cancel=(event:PointerEvent)=>{if(event.pointerId===press?.pointerId)release(null,true);};
  const lost=()=>release(null,true);
  const hidden=()=>{if(document.hidden)release(null,true);};
  bar.addEventListener('pointerdown',down);

  // Chromium's bar is refracting when the lens reads the filter. The class and the variable are what the stylesheet reads.
  const paint=()=>{
    bar.classList.toggle('is-refracting',mode==='backdrop'&&ready);
    if(mode==='backdrop'&&ready)bar.style.setProperty('--ui-glass-filter',`url(#${id})`);
    else bar.style.removeProperty('--ui-glass-filter');
  };
  // The map is rebuilt when the bar changes size or the screen's pixel density changes. A detached or hidden bar has no size, so it
  // keeps its last map. Only the backdrop has a map.
  const rebuild=()=>{
    const width=bar.offsetWidth+2*LENS_MARGIN,height=bar.offsetHeight+2*LENS_MARGIN,density=lensDensity(window.devicePixelRatio);
    if(mode!=='backdrop'||!bar.offsetWidth||!bar.offsetHeight||(width===mapWidth&&height===mapHeight&&density===mapDensity))return;
    mapWidth=width;
    mapHeight=height;
    mapDensity=density;
    const token=++mapSeq;
    const url=lensPng(width,height,density);
    // A lens without its map would shift everything by the full scale, so without one the lens is left out.
    if(!url){lensless=true;applyMode();return;}
    const probe=new Image();
    probe.onload=()=>{
      if(token!==mapSeq||disposed)return;
      image.setAttribute('width',String(width));
      image.setAttribute('height',String(height));
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
    if(!parent||mode!=='frost'){edge.remove();return;}
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
    const next=lensless?'off':glassMode(brands,{reducedTransparency:queries[0].matches,moreContrast:queries[1].matches,forcedColours:queries[2].matches});
    if(next===mode)return;
    mode=next;
    bar.dataset.glass=mode;
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
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{rebuild();sync(false);keepEdge();}):undefined;
  resize?.observe(bar);
  void document.fonts?.ready.then(()=>{if(!disposed)sync(false);});
  for(const query of queries)query.addEventListener('change',applyMode);

  applyMode();
  sync(false);

  return{
    dispose(){
      if(disposed)return;
      disposed=true;
      observer.disconnect();
      resize?.disconnect();
      parentWatch.disconnect();
      for(const query of queries)query.removeEventListener('change',applyMode);
      densityQuery?.removeEventListener('change',onDensity);
      densityQuery=undefined;
      bar.removeEventListener('pointerdown',down);
      stopListening();
      press=null;
      stretch?.cancel();
      lens.remove();
      glow.remove();
      edge.remove();
      svg.remove();
      mode='off';
      bar.classList.remove('is-refracting');
      bar.style.removeProperty('--ui-glass-filter');
      delete bar.dataset.glass;
      bar.removeAttribute('data-pressing');
      bar.removeAttribute('data-pill-ready');
      for(const name of PILL_VARS)bar.style.removeProperty(name);
    }
  };
}
