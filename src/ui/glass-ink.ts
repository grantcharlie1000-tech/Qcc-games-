type RGB=readonly [number,number,number];
type Paint={rgb:RGB;alpha:number};
const INK:RGB=[11,16,21];
const UNKNOWN:RGB[]=[[0,0,0],[255,255,255]];
const IMAGE_SIZE=256;
const TILE_SIZE=8;
const GRID_SIZE=IMAGE_SIZE/TILE_SIZE;
type ImageRange={min:Uint8ClampedArray;max:Uint8ClampedArray};
const luminance=(rgb:RGB)=>rgb.reduce((sum,v,i)=>sum+(v/255<=.04045?v/3294.6:((v/255+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>v*(1-t)+b[i]*t) as [number,number,number];
// Component bounds are conservative even when blur mixes differently coloured
// pixels. Only the glyph stroke receives the resulting contrast outline.
const bounds=(colors:readonly RGB[]):RGB[]=>colors.length<2?[...colors]:[
  [0,1,2].map(i=>Math.min(...colors.map(c=>c[i]))) as [number,number,number],
  [0,1,2].map(i=>Math.max(...colors.map(c=>c[i]))) as [number,number,number]
];

/** The clear veil is shared with theme.css: neutral RGB184 at 2% opacity.
 * Choose ink first. Any remaining contrast lives on the glyph's outline. */
export function glassInk(samples:readonly RGB[],preferred?:'light'|'dark',selection:boolean|'dark'=false):{color:string;halo:string}{
  const backgrounds=bounds(samples.length?samples:[[25,29,28]]).flatMap(rgb=>{
    const glass=mix(rgb,[184,184,184],.02);
    // Bound both ends of the tab lens's slight vertical gradient, or the
    // floating header's 9% black selection, as well as the unselected state.
    if(selection==='dark')return [glass,mix(glass,[0,0,0],.09)];
    const lens=mix(glass,[255,255,255],.005);
    return selection?[glass,mix(lens,[0,0,0],.014),mix(lens,[0,0,0],.006)]:[glass];
  });
  const candidates=[{ink:INK,color:'#0b1015',veil:[255,255,255] as RGB},{ink:[255,255,255] as RGB,color:'#fff',veil:[0,0,0] as RGB}];
  const scored=candidates.map(candidate=>{
    const fg=luminance(candidate.ink);
    const contrast=(alpha:number)=>Math.min(...backgrounds.map(rgb=>{
      const bg=luminance(mix(rgb,candidate.veil,alpha));
      return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
    }));
    let low=0,high=0;
    if(contrast(0)<5.2){
      high=.8;
      for(let i=0;i<7;i++){const mid=(low+high)/2;if(contrast(mid)<5.2)low=mid;else high=mid;}
    }
    // Exterior glyph pixels have fractional raster coverage. Reserve 10% for
    // that coverage loss (verified on the visible WebKit/Chromium outline),
    // instead of treating the fully covered, hidden glyph core as contrast.
    return {...candidate,alpha:Math.min(1,Math.ceil(high/.9*100)/100)};
  }).sort((a,b)=>a.alpha-b.alpha);
  // Preserve the surface's established ink when a mixed backdrop requires an
  // outline either way. An unoutlined choice always takes priority.
  const best=preferred&&scored.every(c=>c.alpha>0)?scored.find(c=>c.color===(preferred==='light'?'#fff':'#0b1015'))!:scored[0];
  return {color:best.color,halo:`rgb(${best.veil.join(' ')} / ${best.alpha})`};
}

// Cache one small image readback per source, never per sample or scroll frame.
// Tainted media is an unknown colour range; no network or game-state access.
const images=new WeakMap<HTMLImageElement,{src:string;pixels:ImageRange|null}>();
function imagePixels(image:HTMLImageElement):ImageRange|null{
  if(!image.complete||!image.naturalWidth)return null;
  let cached=images.get(image);
  if(!cached||cached.src!==image.currentSrc){
    const canvas=document.createElement('canvas');canvas.width=IMAGE_SIZE;canvas.height=IMAGE_SIZE;
    try{
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,IMAGE_SIZE,IMAGE_SIZE);
      const data=ctx.getImageData(0,0,IMAGE_SIZE,IMAGE_SIZE).data;
      const min=new Uint8ClampedArray(GRID_SIZE*GRID_SIZE*3).fill(255),max=new Uint8ClampedArray(min.length);
      let opaque=true;
      for(let y=0;y<IMAGE_SIZE;y++)for(let x=0;x<IMAGE_SIZE;x++){
        const pixel=(y*IMAGE_SIZE+x)*4,tile=(Math.floor(y/TILE_SIZE)*GRID_SIZE+Math.floor(x/TILE_SIZE))*3;
        if(data[pixel+3]<250)opaque=false;
        for(let i=0;i<3;i++){min[tile+i]=Math.min(min[tile+i],data[pixel+i]);max[tile+i]=Math.max(max[tile+i],data[pixel+i]);}
      }
      cached={src:image.currentSrc,pixels:opaque?{min,max}:null};
    }
    catch{cached={src:image.currentSrc,pixels:null};}
    images.set(image,cached);
  }
  return cached.pixels;
}
const paint=(value:string):Paint=>{
  const values=value.match(/[\d.]+/g)?.map(Number)??[0,0,0,0];
  return {rgb:values.slice(0,3) as [number,number,number],alpha:values[3]??1};
};
const within=(r:DOMRect,x:number,y:number)=>x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom;
const overlaps=(a:DOMRect,b:DOMRect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

/** All layout/style reads are cached for one update, before any ink writes. */
function sampler(){
  const styles=new Map<Element,CSSStyleDeclaration>(),rects=new Map<Element,DOMRect>();
  const liveGame=!!document.querySelector('#game-stage canvas,#game-stage svg');
  const ids=new Map<Element,number>();
  const id=(e:Element)=>{let value=ids.get(e);if(value===undefined){value=ids.size;ids.set(e,value);}return value;};
  const style=(e:Element)=>{let s=styles.get(e);if(!s){s=getComputedStyle(e);styles.set(e,s);}return s;};
  const rect=(e:Element)=>{let r=rects.get(e);if(!r){r=e.getBoundingClientRect();rects.set(e,r);}return r;};
  const passive=[...document.querySelectorAll('body > *, .movies-view > *, .game-view > *')].filter(e=>{
    if(e.matches('.game-surface,.section-navigation,svg')||e.closest('.arcade-glass'))return false;
    const s=style(e);
    return s.pointerEvents==='none'&&s.visibility==='visible'&&Number(s.opacity)>0&&Number(s.zIndex)>0&&(s.backgroundImage!=='none'||paint(s.backgroundColor).alpha>0);
  }).sort((a,b)=>Number(style(a).zIndex)-Number(style(b).zIndex));

  function imageRange(image:HTMLImageElement,area:DOMRect):RGB[]{
    const pixels=imagePixels(image);if(!pixels)return UNKNOWN;
    const r=rect(image),s=style(image);
    let w=r.width,h=r.height;
    if(s.objectFit==='cover'||s.objectFit==='contain'){
      const scale=(s.objectFit==='cover'?Math.max:Math.min)(w/image.naturalWidth,h/image.naturalHeight);
      w=image.naturalWidth*scale;h=image.naturalHeight*scale;
    }
    // The shell's images are centred; a custom position is conservatively unknown.
    if(s.objectPosition!=='50% 50%')return UNKNOWN;
    const left=r.x+(r.width-w)/2,top=r.y+(r.height-h)/2;
    const x0=Math.max(0,Math.floor((area.left-left)/w*GRID_SIZE)),x1=Math.min(GRID_SIZE-1,Math.floor((area.right-left)/w*GRID_SIZE));
    const y0=Math.max(0,Math.floor((area.top-top)/h*GRID_SIZE)),y1=Math.min(GRID_SIZE-1,Math.floor((area.bottom-top)/h*GRID_SIZE));
    const min:[number,number,number]=[255,255,255],max:[number,number,number]=[0,0,0];
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const offset=(y*GRID_SIZE+x)*3;
      for(let i=0;i<3;i++){min[i]=Math.min(min[i],pixels.min[offset+i]);max[i]=Math.max(max[i],pixels.max[offset+i]);}
    }
    return x1<x0||y1<y0?[]:[min,max];
  }

  function sample(glyph:Element):RGB[]{
    // Canvas/SVG gameplay can change on every compositor frame without a DOM
    // mutation. Bound its whole colour range once; a glyph outline handles
    // that range without pixel readbacks or repeated layout/hit-test scans.
    if(liveGame&&glyph.closest('.game-dock'))return UNKNOWN;
    const r=rect(glyph);
    const ownerDialog=glyph.closest('dialog');
    // The edge lens can sample artwork beyond the glyph footprint.
    const area=new DOMRect(r.x-16,r.y-16,r.width+32,r.height+32);
    const ranges=new Map<HTMLImageElement,RGB[]>();
    const stacks=new Set<string>();
    const samples:RGB[]=[];
    for(const u of [0,.5,1])for(const v of [0,.5,1]){
      const x=Math.max(0,Math.min(innerWidth-1,area.x+area.width*u));
      const y=Math.max(0,Math.min(innerHeight-1,area.y+area.height*v));
      const stack=document.elementsFromPoint(x,y).filter(e=>!e.closest('.arcade-glass,.section-navigation,.ui-tabbar-mini')&&(!e.closest('dialog')||e.closest('dialog')===ownerDialog));
      const view=stack.find(e=>e.classList.contains('game-view'));
      const surface=view?.querySelector('.game-surface');
      if(surface&&within(rect(surface),x,y))stack.splice(stack.indexOf(view!),0,surface);
      for(const layer of passive)if(within(rect(layer),x,y))stack.unshift(layer);
      const key=stack.map(id).join(',');if(stacks.has(key))continue;stacks.add(key);
      let result:RGB[]=[[0,0,0]];
      for(const element of stack.reverse()){
        // Top-layer hit testing cannot reveal the artwork behind a dialog.
        // Its translucent paint bounds the unknown backdrop conservatively.
        if(element instanceof HTMLDialogElement)result=UNKNOWN;
        const s=style(element),color=paint(s.backgroundColor);
        result=result.map(rgb=>mix(rgb,color.rgb,color.alpha));
        if(s.backgroundImage.includes('gradient(')){
          const stops=[...s.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>paint(m[0]));
          if(stops.length)result=bounds(stops.flatMap(stop=>result.map(rgb=>mix(rgb,stop.rgb,stop.alpha))));
        }else if(s.backgroundImage!=='none')result=UNKNOWN;
        if(element instanceof HTMLCanvasElement||element instanceof HTMLVideoElement)result=UNKNOWN;
        const image=element instanceof HTMLImageElement?element:element.querySelector<HTMLImageElement>(':scope > img');
        if(image&&style(image).visibility!=='hidden'&&overlaps(rect(image),area)){
          let range=ranges.get(image);if(!range){range=imageRange(image,area);ranges.set(image,range);}
          if(range.length)result=range;
        }
        // Card captions sit over their image and can enter the blur footprint
        // without landing on a hit-test point. Include their foreground ink.
        const text=[element,...element.querySelectorAll(':scope > h2,:scope > span')].filter(e=>
          overlaps(rect(e),area)&&style(e).visibility==='visible'&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim()));
        for(const e of text)result=bounds([...result,paint(style(e).color).rgb]);
        const box=rect(element);
        for(const [width,color,edge] of [
          [s.borderLeftWidth,s.borderLeftColor,new DOMRect(box.x,box.y,parseFloat(s.borderLeftWidth),box.height)],
          [s.borderRightWidth,s.borderRightColor,new DOMRect(box.right-parseFloat(s.borderRightWidth),box.y,parseFloat(s.borderRightWidth),box.height)],
          [s.borderTopWidth,s.borderTopColor,new DOMRect(box.x,box.y,box.width,parseFloat(s.borderTopWidth))],
          [s.borderBottomWidth,s.borderBottomColor,new DOMRect(box.x,box.bottom-parseFloat(s.borderBottomWidth),box.width,parseFloat(s.borderBottomWidth))]
        ] as const)if(parseFloat(width)>0&&overlaps(edge,area)){
          const border=paint(color);result=bounds([...result,...result.map(rgb=>mix(rgb,border.rgb,border.alpha))]);
        }
      }
      samples.push(...result);
    }
    return bounds(samples);
  }
  return {style,rect,sample};
}

const bindings=new Set<HTMLElement>();
let frame=0;
let observer:MutationObserver|undefined;
let density:MediaQueryList|undefined;
function vectorHalo(glyph:Element):void{
  if(!(glyph instanceof SVGSVGElement))return;
  // Coarse curved strokes need a complete exterior pixel at diagonal edges.
  // Rebuild only if moving between display densities changes that allowance.
  density??=window.matchMedia('(max-resolution: 1.5dppx)');
  const expansion=density.matches?2.8:1.8;
  const previous=glyph.querySelector<SVGGElement>(':scope > .glass-vector-halo');
  if(previous?.dataset.expansion===String(expansion))return;
  previous?.remove();
  // A vector outline follows the live icon, without a rectangular backing or
  // a captured image. Keep it separate from currentColor so contrast can be
  // measured with the foreground hidden, just like a text shadow.
  const halo=document.createElementNS('http://www.w3.org/2000/svg','g');
  halo.classList.add('glass-vector-halo');halo.setAttribute('aria-hidden','true');
  halo.dataset.expansion=String(expansion);
  const width=glyph.getBoundingClientRect().width||24;
  const outline=expansion*(glyph.viewBox.baseVal.width||width)/width;
  for(const child of [...glyph.children])if(!child.matches('defs,title,desc')){
    const copy=child.cloneNode(true) as Element;
    copy.removeAttribute('id');for(const e of copy.querySelectorAll('[id]'))e.removeAttribute('id');
    const originals=[child,...child.querySelectorAll('*')];
    for(const [i,shape] of [copy,...copy.querySelectorAll('*')].entries()){
      if(shape.matches('path,rect,circle,ellipse,line,polyline,polygon,use')){
        // Expand each actual stroke, including the thicker native close icon.
        // A fixed group width could disappear beneath an explicit child stroke.
        const style=getComputedStyle(originals[i]);
        shape.setAttribute('stroke','currentColor');
        shape.setAttribute('stroke-width',String((style.stroke==='none'?0:parseFloat(style.strokeWidth)||0)+outline));
      }
      if(shape.hasAttribute('fill')&&shape.getAttribute('fill')!=='none')shape.setAttribute('fill','currentColor');
    }
    halo.append(copy);
  }
  glyph.prepend(halo);
}

/** Sheet actions keep their own colour; their outline follows --sheet-halo.
 * These are vector strokes, never a rectangular backing or captured backdrop. */
export function syncSheetIconInk(sheet:HTMLElement):void{
  for(const svg of sheet.querySelectorAll('svg')){
    if(svg.closest('.arcade-glass')||svg.closest('.glass-vector-halo'))continue;
    vectorHalo(svg);
  }
}
function update(){
  frame=0;
  // Native multiplayer and player overlays bypass openSheet. This decorates
  // their existing SVGs without changing any control or dialog lifecycle.
  for(const sheet of document.querySelectorAll<HTMLElement>('.mp-card,.movies-resume-pill,.movies-fullscreen'))syncSheetIconInk(sheet);
  const {style,rect,sample}=sampler();
  const changes:{glyph:HTMLElement;ink:ReturnType<typeof glassInk>|null}[]=[];
  for(const bar of bindings){
    const box=rect(bar);if(!box.width||!box.height||style(bar).visibility==='hidden')continue;
    const mini=bar.parentElement?.querySelector<HTMLElement>('.ui-tabbar-mini');
    const minimized=bar.hasAttribute('data-minimized')&&!bar.parentElement?.matches(':has(:focus-visible)');
    const targets=minimized?(mini?[mini]:[]):bar.matches('.ui-tab,.floating-glass-group')?[bar]:[...bar.querySelectorAll<HTMLElement>('.ui-tab,.game-hud-item')];
    for(const target of targets){
      if(style(target).visibility==='hidden'||style(target).opacity==='0')continue;
      const glyphs=[...target.querySelectorAll<HTMLElement>('svg,span:not(.ui-glass-lens,.ui-glass-glow),small,strong,kbd')].filter(e=>!e.querySelector('svg,span,small,strong,kbd')&&!e.closest('.ui-brand-tile'));
      for(const glyph of glyphs){
        const r=rect(glyph);if(!r.width||!r.height||style(glyph).clip!=='auto')continue;
        const modal=bar.closest('dialog');
        const preference=bar.closest('.section-navigation')?'light':luminance(paint(style(modal??bar).color).rgb)>.5?'light':'dark';
        const selection=bar.matches('.ui-tabbar,.floating-glass-group');
        changes.push({glyph,ink:bar.dataset.glass==='off'?null:glassInk(sample(glyph),preference,selection)});
      }
    }
  }
  for(const {glyph,ink} of changes){
    if(!ink){glyph.style.removeProperty('--glass-adaptive-ink');glyph.style.removeProperty('--glass-local-halo');glyph.querySelector(':scope > .glass-vector-halo')?.remove();continue;}
    if(!glyph.classList.contains('glass-ink'))glyph.classList.add('glass-ink');
    if(glyph.style.getPropertyValue('--glass-adaptive-ink')!==ink.color)glyph.style.setProperty('--glass-adaptive-ink',ink.color);
    if(glyph.style.getPropertyValue('--glass-local-halo')!==ink.halo)glyph.style.setProperty('--glass-local-halo',ink.halo);
    vectorHalo(glyph);
  }
}
const schedule=()=>{if(!frame&&!document.hidden)frame=requestAnimationFrame(update);};

/** One shared event subscription for all visible controls; no animation loop. */
export function bindGlassInk(bar:HTMLElement):()=>void{
  bindings.add(bar);
  if(bindings.size===1){
    document.addEventListener('scroll',schedule,{capture:true,passive:true});
    document.addEventListener('load',schedule,true);
    document.addEventListener('transitionend',schedule,true);
    document.addEventListener('focusin',schedule,true);
    document.addEventListener('focusout',schedule,true);
    window.addEventListener('resize',schedule,{passive:true});
    density??=window.matchMedia('(max-resolution: 1.5dppx)');
    density.addEventListener('change',schedule);
    observer=new MutationObserver(records=>{
      const liveGame=!!document.querySelector('#game-stage canvas,#game-stage svg');
      if(records.some(r=>{
        // Gameplay is covered by the conservative range above. Canvas pixels
        // still update through backdrop-filter; DOM animation cannot make the
        // fixed ink/outline pair less legible.
        if(liveGame&&r.target instanceof Element&&r.target.closest('#game-stage'))return false;
        // Several games render unchanged HUD text every animation frame. Equal
        // replacements have no new paint to sample. The compositor still reads
        // the live canvas backdrop every frame; this only avoids redundant DOM
        // hit-testing for label colours.
        if(r.type==='childList'&&r.addedNodes.length===r.removedNodes.length&&
          [...r.addedNodes].every((node,i)=>node.isEqualNode(r.removedNodes[i])))return false;
        return !(r.target instanceof Element)||!r.target.closest('.arcade-glass,.ui-tabbar-mini')||r.attributeName==='data-minimized'||r.attributeName==='data-glass'||(r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(n=>n instanceof Element&&!n.matches('.ui-glass-contrast,.ui-glass-glow,.ui-glass-lens')));
      }))schedule();
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','data-minimized','data-glass']});
  }
  schedule();
  return ()=>{
    bindings.delete(bar);
    const mini=bar.parentElement?.querySelector('.ui-tabbar-mini');
    for(const target of [...bar.querySelectorAll<HTMLElement>('.glass-ink'),...mini?.querySelectorAll<HTMLElement>('.glass-ink')??[]]){
      target.style.removeProperty('--glass-adaptive-ink');target.style.removeProperty('--glass-local-halo');target.querySelector(':scope > .glass-vector-halo')?.remove();target.classList.remove('glass-ink');
    }
    if(!bindings.size){
      observer?.disconnect();observer=undefined;
      density?.removeEventListener('change',schedule);density=undefined;
      document.removeEventListener('scroll',schedule,true);document.removeEventListener('load',schedule,true);document.removeEventListener('transitionend',schedule,true);document.removeEventListener('focusin',schedule,true);document.removeEventListener('focusout',schedule,true);window.removeEventListener('resize',schedule);
      cancelAnimationFrame(frame);frame=0;
    }
  };
}
