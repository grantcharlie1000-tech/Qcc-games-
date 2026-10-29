// Liquid Glass for the island: the selection pill that slides and stretches between tabs, the jelly press, and in
// Chromium a refraction filter. tabbar.ts calls bindGlass from autoHideTabbar, so the arcade bar and the Movies bar both get it.
export interface Brand{brand:string;version?:string}
type NavigatorWithBrands=Navigator&{userAgentData?:{brands?:Brand[]}};

const SVG_NS='http://www.w3.org/2000/svg';
const CURRENT='.ui-tab[aria-current="page"],.ui-tab[aria-pressed="true"]';
const PILL_VARS=['--ui-pill-x','--ui-pill-w','--ui-pill-on'];
let filterSeq=0;

// The displacement map for the refraction filter. A red ramp (x) and a green ramp (y) run across and down the bar and are
// screened together, then a neutral rounded rect sits inside the rim and is blurred. The centre does not move the content
// behind it, and only the rim bends it, like the edge of a lens.
export function glassMap(width:number,height:number,edge=16):string{
  const rx=Math.max(0,height/2-edge);
  const innerWidth=Math.max(0,width-2*edge);
  const innerHeight=Math.max(0,height-2*edge);
  return `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`+
    '<defs>'+
    '<linearGradient id="x" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#000"/></linearGradient>'+
    '<linearGradient id="y" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0f0"/><stop offset="1" stop-color="#000"/></linearGradient>'+
    `<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${edge/2}"/></filter>`+
    '</defs>'+
    `<rect width="${width}" height="${height}" fill="url(#x)"/>`+
    `<rect width="${width}" height="${height}" fill="url(#y)" style="mix-blend-mode:screen"/>`+
    `<rect x="${edge}" y="${edge}" width="${innerWidth}" height="${innerHeight}" rx="${rx}" fill="rgb(128,128,128)" filter="url(#b)"/>`+
    '</svg>';
}

// Only Chromium-based browsers report the Chromium brand, and only Chromium draws an SVG filter inside backdrop-filter.
export function isChromiumBrands(brands:readonly Brand[]|undefined):boolean{
  return !!brands?.some(entry=>entry.brand==='Chromium');
}
export function refractionAllowed(brands:readonly Brand[]|undefined,reducedTransparency:boolean):boolean{
  return !reducedTransparency&&isChromiumBrands(brands);
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
// Engines without the pseudoElement option would animate the whole bar, so the stretch is skipped there.
function canStretch():boolean{
  return typeof KeyframeEffect==='function'&&typeof HTMLElement.prototype.animate==='function'&&
    new KeyframeEffect(null,null,{pseudoElement:'::after'}).pseudoElement==='::after';
}

interface Refraction{rebuild():void;dispose():void}
// Chromium only. The bar gets a hidden SVG filter of its own: a displacement map sized to the bar, then the backdrop is
// displaced by it. The class and the filter reference come off under reduced transparency.
function bindRefraction(bar:HTMLElement,brands:readonly Brand[]|undefined):Refraction{
  const id=`ui-glass-${++filterSeq}`;
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
  displace.setAttribute('scale','34');
  displace.setAttribute('xChannelSelector','R');
  displace.setAttribute('yChannelSelector','G');
  // The map goes in before the filter joins the document. Chromium fetches an feImage as soon as it is in the document,
  // so an image with no href would ask for an empty URL.
  filter.append(displace);
  svg.append(filter);

  // True once the map exists and the filter is in the document. Until then the bar never refers to the filter.
  let ready=false;
  const reducedTransparency=matchMedia('(prefers-reduced-transparency: reduce)');
  const apply=()=>{
    const on=ready&&refractionAllowed(brands,reducedTransparency.matches);
    bar.classList.toggle('is-refracting',on);
    if(on)bar.style.setProperty('--ui-glass-filter',`url(#${id})`);
    else bar.style.removeProperty('--ui-glass-filter');
  };
  reducedTransparency.addEventListener('change',apply);

  let mapWidth=0,mapHeight=0;
  return{
    // Rebuilt only when the bar changes size. A detached or hidden bar has no size, so it keeps its last map.
    rebuild(){
      const width=bar.offsetWidth,height=bar.offsetHeight;
      if(!width||!height||(width===mapWidth&&height===mapHeight))return;
      mapWidth=width;
      mapHeight=height;
      image.setAttribute('width',String(width));
      image.setAttribute('height',String(height));
      image.setAttribute('href','data:image/svg+xml,'+encodeURIComponent(glassMap(width,height)));
      if(!ready){
        filter.insertBefore(image,displace);
        document.body.append(svg);
        ready=true;
        apply();
      }
    },
    dispose(){
      reducedTransparency.removeEventListener('change',apply);
      svg.remove();
      bar.classList.remove('is-refracting');
      bar.style.removeProperty('--ui-glass-filter');
    }
  };
}

// Binds the pill, the press and (where it applies) the refraction to one bar. Nothing here writes to the bar's children,
// and the observer watches only the attributes that the pill reads, so the bar's own style writes cannot loop back in.
export function bindGlass(bar:HTMLElement):{dispose():void}{
  const brands=(navigator as NavigatorWithBrands).userAgentData?.brands;
  const refraction=isChromiumBrands(brands)?bindRefraction(bar,brands):undefined;
  const stretchable=canStretch();
  let disposed=false;
  let press:HTMLElement|null=null;
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
  // The release can land anywhere on the page, so the press listens on the document until it ends.
  const down=(event:PointerEvent)=>{
    if(event.button!==0||press)return;
    const tab=event.target instanceof Element?event.target.closest<HTMLElement>('.ui-tab'):null;
    if(!tab||!bar.contains(tab))return;
    press=tab;
    bar.setAttribute('data-pressing','');
    document.addEventListener('pointerup',up);
    document.addEventListener('pointercancel',cancel);
    document.addEventListener('lostpointercapture',cancel);
    place(tab,false,true);
  };
  const release=(event:PointerEvent|null,cancelled:boolean)=>{
    if(!press)return;
    const tab=press;
    press=null;
    document.removeEventListener('pointerup',up);
    document.removeEventListener('pointercancel',cancel);
    document.removeEventListener('lostpointercapture',cancel);
    bar.removeAttribute('data-pressing');
    // A tap ends over the same tab. The point decides, not the target, because a touch keeps its target after the finger leaves.
    const tapped=!cancelled&&!!event&&document.elementFromPoint(event.clientX,event.clientY)?.closest('.ui-tab')===tab;
    // A completed tap on a tab that selects itself keeps the pill under the finger: its click makes that tab current,
    // and the observer below follows the change. Anything else springs back to the current tab.
    if(tapped&&(tab.tagName==='A'||tab.hasAttribute('aria-pressed')))return;
    sync(true);
  };
  const up=(event:PointerEvent)=>release(event,false);
  const cancel=()=>release(null,true);
  bar.addEventListener('pointerdown',down);

  // The observer covers the Movies re-render (the nav's innerHTML is replaced) and the aria changes that move the selection.
  const observer=new MutationObserver(()=>sync(true));
  observer.observe(bar,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current','aria-pressed']});
  // A resize changes the tab positions with no mutation, and a size change also covers a bar that was hidden or detached.
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{refraction?.rebuild();sync(false);}):undefined;
  resize?.observe(bar);
  void document.fonts?.ready.then(()=>{if(!disposed)sync(false);});

  refraction?.rebuild();
  sync(false);

  return{
    dispose(){
      if(disposed)return;
      disposed=true;
      observer.disconnect();
      resize?.disconnect();
      bar.removeEventListener('pointerdown',down);
      document.removeEventListener('pointerup',up);
      document.removeEventListener('pointercancel',cancel);
      document.removeEventListener('lostpointercapture',cancel);
      stretch?.cancel();
      refraction?.dispose();
      bar.removeAttribute('data-pressing');
      bar.removeAttribute('data-pill-ready');
      for(const name of PILL_VARS)bar.style.removeProperty(name);
    }
  };
}
