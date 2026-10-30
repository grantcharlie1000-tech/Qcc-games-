// Liquid Glass for the island: the selection pill, the jelly press, and a lens that bends what is behind the bar. Chromium
// refracts its backdrop with an SVG filter. Every other browser refracts a copy of the images behind the bar, drawn in the
// bar's lens. tabbar.ts calls bindGlass from autoHideTabbar, so the arcade bar and the Movies bar both get it.
export interface Brand{brand:string;version?:string}
type NavigatorWithBrands=Navigator&{userAgentData?:{brands?:Brand[]}};
export type GlassMode='backdrop'|'mirror'|'off';
export interface Box{x:number;y:number;width:number;height:number}

const SVG_NS='http://www.w3.org/2000/svg';
const XLINK_NS='http://www.w3.org/1999/xlink';
// The lens bends content by up to LENS_BEND px at the top and bottom rims, and the bend falls smoothly to nothing LENS_BEVEL px
// inside, so the centre stays still. The two end caps bend by LENS_CAP of that: at 390 px the island sits 12 px from each screen
// edge, so a full bend there would pull the screen's own dark margin into the ends. The map's channels run from -scale/2 to
// +scale/2, so the filter's scale is twice the bend. The lens reaches LENS_MARGIN px past the bar, which is where the rim samples
// its content from.
export const LENS_BEVEL=22;
export const LENS_BEND=16;
export const LENS_CAP=0.5;
export const REFRACTION_SCALE=2*LENS_BEND;
export const LENS_MARGIN=LENS_BEND+4;
// The mirror copies at most this many images. When there are more, the ones that cover the least of the glass are left out: they are
// ranked by the area each covers under the lens.
export const MIRROR_LIMIT=16;
const PAGE_FALLBACK='#191d1c';
const CURRENT='.ui-tab[aria-current="page"],.ui-tab[aria-pressed="true"]';
const PILL_VARS=['--ui-pill-x','--ui-pill-w','--ui-pill-on'];
let filterSeq=0;

const smoothstep=(t:number)=>t*t*(3-2*t);
// The lens's height field. For each pixel of a width by height box, it gives the displacement the lens applies there. The bar is a
// capsule that sits LENS_MARGIN inside the box. A pixel moves outward along the capsule's normal, by LENS_BEND at the rim (LENS_CAP
// of that on the end caps), and that falls smoothly to zero LENS_BEVEL px inside. So each pixel samples from beyond the rim, which
// compresses the content into the rim like the edge of a thick glass, and along any normal the sample position only moves forward:
// nothing folds. The result is RGBA bytes. Red carries the x displacement and green the y one, each as 0 to 255 for -scale/2 to
// +scale/2, so 128 is no shift.
export function lensField(width:number,height:number,margin=LENS_MARGIN,bevel=LENS_BEVEL,bend=LENS_BEND,cap=LENS_CAP):Uint8ClampedArray<ArrayBuffer>{
  const data=new Uint8ClampedArray(new ArrayBuffer(width*height*4));
  const scale=2*bend;
  const bw=width-2*margin,radius=(height-2*margin)/2;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    // The pixel centre in the bar's coordinates, with the capsule's core on the line v=0 between the two cap centres.
    const u=x+0.5-margin,v=y+0.5-margin-radius;
    const cx=Math.min(Math.max(u,radius),Math.max(bw-radius,radius));
    const dx=u-cx,dist=Math.hypot(dx,v);
    // Depth is the distance inside the rim. Outside the rim it stays at the rim's bend, so the field has no step at the edge. The
    // share is 1 where the normal is vertical (the straight rims) and cap where it is horizontal (the ends).
    const share=cap+(1-cap)*(dist>0?Math.abs(v)/dist:0);
    const push=bend*share*(1-smoothstep(Math.min(1,Math.max(0,radius-dist)/bevel)));
    const ox=dist>0?push*dx/dist:0,oy=dist>0?push*v/dist:0;
    const i=(y*width+x)*4;
    data[i]=Math.round(255*(0.5+ox/scale));
    data[i+1]=Math.round(255*(0.5+oy/scale));
    data[i+2]=128;
    data[i+3]=255;
  }
  return data;
}

// The lens field as a PNG, the form an SVG feImage reads. Only a browser can encode the PNG, so this is outside the unit tests. With no
// 2D context there is no map, and the empty string tells the caller to leave the lens out, rather than bend with an all-zero map.
export function lensPng(width:number,height:number):string{
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context)return '';
  context.putImageData(new ImageData(lensField(width,height),width,height),0,0);
  return canvas.toDataURL('image/png');
}

// The images the mirror copies, placed in the lens's own box: the bar grown by the margin on every side, with the box's top left
// corner as the origin. An image that does not reach the box is left out. At most `limit` are kept, ranked by the area each covers
// under the box (the share of the glass it takes), and they come back in document order.
export function mirrorPlacement(bar:Box,sources:readonly Box[],margin=LENS_MARGIN,limit=MIRROR_LIMIT):{index:number;x:number;y:number;width:number;height:number}[]{
  const left=bar.x-margin,top=bar.y-margin,right=bar.x+bar.width+margin,bottom=bar.y+bar.height+margin;
  const kept:{index:number;area:number;x:number;y:number;width:number;height:number}[]=[];
  sources.forEach((source,index)=>{
    const area=Math.max(0,Math.min(source.x+source.width,right)-Math.max(source.x,left))*Math.max(0,Math.min(source.y+source.height,bottom)-Math.max(source.y,top));
    if(area>0)kept.push({index,area,x:source.x-left,y:source.y-top,width:source.width,height:source.height});
  });
  return kept.sort((a,b)=>b.area-a.area||a.index-b.index).slice(0,limit).sort((a,b)=>a.index-b.index)
    .map(({index,x,y,width,height})=>({index,x,y,width,height}));
}

// Only Chromium-based browsers report the Chromium brand, and only Chromium draws an SVG filter inside backdrop-filter.
export function isChromiumBrands(brands:readonly Brand[]|undefined):boolean{
  return !!brands?.some(entry=>entry.brand==='Chromium');
}
// Which lens a bar gets. Reduced transparency, more contrast and forced colours get none, so the bar is a flat solid island.
export function glassMode(brands:readonly Brand[]|undefined,flags:{reducedTransparency:boolean;moreContrast:boolean;forcedColours:boolean}):GlassMode{
  if(flags.reducedTransparency||flags.moreContrast||flags.forcedColours)return 'off';
  return isChromiumBrands(brands)?'backdrop':'mirror';
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

// The page colour behind the bar: the first background that is not transparent, looking up from the bar's parent.
function pageColour(bar:HTMLElement):string{
  for(let element:HTMLElement|null=bar.parentElement;element;element=element.parentElement){
    const colour=getComputedStyle(element).backgroundColor;
    if(colour!=='transparent'&&colour!=='rgba(0, 0, 0, 0)')return colour;
  }
  return PAGE_FALLBACK;
}

// The lens is the bar's first child and sits under the tint, the rim, the pill and the tabs. It is grown by LENS_MARGIN on every
// side, so the rim can sample past the bar, and its clip-path cuts it back to the capsule. Its scene holds the mirror's copies, and
// the scene's page colour covers the lens, so in the mirror the lens draws no frost of its own.
function makeLens():{lens:HTMLElement;scene:HTMLElement}{
  const lens=document.createElement('span');
  lens.className='ui-glass-lens';
  lens.setAttribute('aria-hidden','true');
  lens.style.inset=`-${LENS_MARGIN}px`;
  lens.style.clipPath=`inset(${LENS_MARGIN}px round 999px)`;
  const scene=document.createElement('span');
  scene.className='ui-glass-scene';
  lens.append(scene);
  return {lens,scene};
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

// Binds the pill, the press and the lens to one bar. The lens is Chromium's backdrop refraction, or the mirror elsewhere. Nothing here
// writes to the bar's children except the lens itself, and the observer ignores the lens's own copies, so no write loops back in.
export function bindGlass(bar:HTMLElement):{dispose():void}{
  const brands=(navigator as NavigatorWithBrands).userAgentData?.brands;
  const queries=[matchMedia('(prefers-reduced-transparency: reduce)'),matchMedia('(prefers-contrast: more)'),matchMedia('(forced-colors: active)')];
  const id=`ui-glass-${++filterSeq}`;
  const {svg,filter,image,displace}=makeFilter(id);
  const {lens,scene}=makeLens();
  const stretchable=canStretch(bar);
  let mode:GlassMode|undefined;
  // True once the map has decoded and the filter is in the document. Until then nothing refers to the filter.
  let ready=false,disposed=false;
  let mapWidth=0,mapHeight=0,mapSeq=0;
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

  // Chromium's bar is refracting when the lens reads the filter. The class and the variable are what the stylesheet reads. The
  // mirror's scene stays hidden until the filter is there, so no copy shows sharp and unbent.
  const paint=()=>{
    bar.classList.toggle('is-refracting',mode==='backdrop'&&ready);
    if(mode!=='off'&&ready)bar.style.setProperty('--ui-glass-filter',`url(#${id})`);
    else bar.style.removeProperty('--ui-glass-filter');
    scene.style.visibility=ready?'':'hidden';
  };
  // The map is rebuilt only when the bar changes size. A detached or hidden bar has no size, so it keeps its last map.
  const rebuild=()=>{
    const width=bar.offsetWidth+2*LENS_MARGIN,height=bar.offsetHeight+2*LENS_MARGIN;
    if(mode==='off'||!bar.offsetWidth||!bar.offsetHeight||(width===mapWidth&&height===mapHeight))return;
    mapWidth=width;
    mapHeight=height;
    const token=++mapSeq;
    const url=lensPng(width,height);
    // A lens without its map would draw unbent copies, or shift everything by the full scale, so without one the lens is left out.
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
      scheduleMirror();
    };
    probe.onerror=()=>{if(token===mapSeq&&!disposed){lensless=true;applyMode();}};
    probe.src=url;
  };

  // The mirror copies the images behind the bar into the lens's scene, which holds the page colour under them. It reads every rect
  // and style first, then writes, so a scroll costs one layout at most. Each copy keeps its source's src, fit, position and radius.
  // Copies are ranked by the area each covers under the lens, the share of the glass it takes. They ignore clipping by a scroll
  // container and covering overlays: an image under a sheet still gets a copy, and a copy is not cut at a scroller's own edge.
  const copies=new WeakMap<HTMLImageElement,HTMLImageElement>();
  let shown:HTMLImageElement[]=[];
  let mirrorFrame=0;
  // The bar is held hidden by the page's scroll, unless keyboard focus is in it (as the stylesheet's :has(:focus-visible) rule says).
  const hiddenNow=()=>bar.hasAttribute('data-hidden')&&!bar.querySelector(':focus-visible');
  // True while a translate or scale transition of the bar itself runs. A pill or tab transition does not count.
  const moving=()=>bar.getAnimations().some(animation=>animation instanceof CSSTransition&&!(animation.effect as KeyframeEffect|null)?.pseudoElement&&animation.playState!=='finished');
  // The bar is on screen when it is not held hidden, or while its own hide or show still moves it.
  const onScreen=()=>bar.offsetWidth>0&&(!hiddenNow()||moving());
  // The removal observer runs only while the bar is on screen in mirror mode, so a cover that leaves the page takes its copy with it.
  let watching=false;
  const removals=new MutationObserver(records=>{
    if(records.some(record=>[...record.removedNodes].some(node=>node instanceof Element&&(node.localName==='img'||node.querySelector('img')!==null))))scheduleMirror();
  });
  const syncWatch=()=>{
    const want=!disposed&&mode==='mirror'&&onScreen();
    if(want&&!watching){removals.observe(bar.ownerDocument.body,{childList:true,subtree:true});watching=true;}
    else if(!want&&watching){removals.disconnect();watching=false;}
  };
  // The visible state is checked before a frame is asked for, so a hidden bar costs no frame.
  const scheduleMirror=()=>{
    syncWatch();
    if(!mirrorFrame&&mode==='mirror'&&onScreen())mirrorFrame=requestAnimationFrame(()=>{mirrorFrame=0;mirror();});
  };
  const mirror=()=>{
    if(disposed||mode!=='mirror'||!onScreen())return;
    const bounds=bar.getBoundingClientRect();
    // The bar may be part-way through its own scale or slide, and the lens moves with it. So each rect is taken into the bar's own
    // coordinates, where the lens is laid out, by removing the offset and dividing by the bar's current scale.
    const kx=bar.offsetWidth?bounds.width/bar.offsetWidth:1,ky=bar.offsetHeight?bounds.height/bar.offsetHeight:1;
    const reach=LENS_MARGIN;
    // Every value is read into plain data before the first write, so no read after a write forces a style recalc.
    const sources:HTMLImageElement[]=[],boxes:Box[]=[],looks:{fit:string;position:string;radius:string;opacity:string}[]=[];
    for(const img of bar.ownerDocument.images){
      if(bar.contains(img)||!img.complete||!img.naturalWidth||!img.currentSrc)continue;
      const rect=img.getBoundingClientRect();
      if(!rect.width||!rect.height||rect.right<bounds.left-reach||rect.left>bounds.right+reach||rect.bottom<bounds.top-reach||rect.top>bounds.bottom+reach)continue;
      const style=getComputedStyle(img);
      if(style.visibility!=='visible'||style.display==='none'||Number(style.opacity)===0)continue;
      sources.push(img);
      boxes.push({x:(rect.left-bounds.left)/kx,y:(rect.top-bounds.top)/ky,width:rect.width/kx,height:rect.height/ky});
      looks.push({fit:style.objectFit,position:style.objectPosition,radius:style.borderRadius,opacity:style.opacity});
    }
    const placed=mirrorPlacement({x:0,y:0,width:bar.offsetWidth,height:bar.offsetHeight},boxes,LENS_MARGIN,MIRROR_LIMIT);
    const background=pageColour(bar);
    scene.style.background=background;
    const next:HTMLImageElement[]=[];
    for(const {index,x,y,width,height} of placed){
      const source=sources[index],look=looks[index];
      let copy=copies.get(source);
      if(!copy){
        copy=document.createElement('img');
        copy.alt='';
        copy.draggable=false;
        copies.set(source,copy);
      }
      if(copy.getAttribute('src')!==source.currentSrc)copy.setAttribute('src',source.currentSrc);
      Object.assign(copy.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`,objectFit:look.fit,objectPosition:look.position,borderRadius:look.radius,opacity:look.opacity});
      if(copy.parentNode!==scene)scene.append(copy);
      next.push(source);
    }
    for(const source of shown)if(!next.includes(source))copies.get(source)?.remove();
    shown=next;
    // While the bar's own transition runs, the glass moves under the page, so the copies are placed again on every frame until it settles.
    if(moving())scheduleMirror();
  };
  // Events that move or show the images behind the bar. A capture listener on the document also catches the Movies overlay's own
  // scroll. An image still fading in has no copy yet: its copy comes in with the end of the fade, and a load or an error brings it
  // in too. The bar's own transitions move the glass, so they are followed as well, and so is keyboard focus, which holds the bar open.
  const IMAGE_EVENTS=['load','error','animationstart','animationend','transitionrun','transitionend','transitioncancel'];
  const imageEvent=(event:Event)=>{
    const motion=event.target===bar&&!(event as TransitionEvent).pseudoElement;
    if(event.target instanceof HTMLImageElement||motion)scheduleMirror();
  };
  const mirrorEvents=()=>{
    document.addEventListener('scroll',scheduleMirror,{capture:true,passive:true});
    window.addEventListener('resize',scheduleMirror,{passive:true});
    bar.addEventListener('focusin',scheduleMirror);
    bar.addEventListener('focusout',scheduleMirror);
    for(const type of IMAGE_EVENTS)document.addEventListener(type,imageEvent,{capture:true});
  };
  const unmirrorEvents=()=>{
    document.removeEventListener('scroll',scheduleMirror,{capture:true});
    window.removeEventListener('resize',scheduleMirror);
    bar.removeEventListener('focusin',scheduleMirror);
    bar.removeEventListener('focusout',scheduleMirror);
    for(const type of IMAGE_EVENTS)document.removeEventListener(type,imageEvent,{capture:true});
    removals.disconnect();
    watching=false;
  };
  // Any mode other than the mirror holds no copies, so a copy never outlives the mirror that drew it.
  const clearCopies=()=>{scene.replaceChildren();scene.style.background='';shown=[];};

  // Movies rewrites the bar's children on every render, which takes the lens out. The lens goes back in as the first child.
  const ensureLens=()=>{if(mode!==undefined&&mode!=='off'&&lens.parentNode!==bar)bar.prepend(lens);};
  const applyMode=()=>{
    const next=lensless?'off':glassMode(brands,{reducedTransparency:queries[0].matches,moreContrast:queries[1].matches,forcedColours:queries[2].matches});
    if(next===mode)return;
    if(mode==='mirror')unmirrorEvents();
    mode=next;
    bar.dataset.glass=mode;
    if(mode==='off')lens.remove();
    else{ensureLens();rebuild();if(mode==='mirror')mirrorEvents();}
    if(mode!=='mirror')clearCopies();
    paint();
    scheduleMirror();
  };

  const observer=new MutationObserver(records=>{
    ensureLens();
    // Changes inside the lens are its own copies: they neither move the pill nor need another copy.
    if(records.some(record=>!lens.contains(record.target))){sync(true);scheduleMirror();}
  });
  observer.observe(bar,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current','aria-pressed','data-hidden']});
  // A resize changes the tab positions with no mutation, and a size change also covers a bar that was hidden or detached.
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{rebuild();sync(false);scheduleMirror();}):undefined;
  resize?.observe(bar);
  void document.fonts?.ready.then(()=>{if(!disposed){sync(false);scheduleMirror();}});
  for(const query of queries)query.addEventListener('change',applyMode);

  applyMode();
  sync(false);

  return{
    dispose(){
      if(disposed)return;
      disposed=true;
      observer.disconnect();
      resize?.disconnect();
      for(const query of queries)query.removeEventListener('change',applyMode);
      unmirrorEvents();
      removals.disconnect();
      if(mirrorFrame)cancelAnimationFrame(mirrorFrame);
      mirrorFrame=0;
      bar.removeEventListener('pointerdown',down);
      stopListening();
      press=null;
      stretch?.cancel();
      lens.remove();
      scene.replaceChildren();
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
