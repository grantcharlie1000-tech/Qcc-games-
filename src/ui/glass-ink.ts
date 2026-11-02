import {canvasInk} from './canvas-ink';
type RGB=readonly [number,number,number];
type Paint={rgb:RGB;alpha:number};
const INK:RGB=[11,16,21];
const UNKNOWN:RGB[]=[[0,0,0],[255,255,255]];
const IMAGE_SIZE=256;
const TILE_SIZE=8;
const GRID_SIZE=IMAGE_SIZE/TILE_SIZE;
type ImageRange={mean:Uint8ClampedArray};
const luminance=(rgb:RGB)=>rgb.reduce((sum,v,i)=>sum+(v/255<=.04045?v/3294.6:((v/255+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>v*(1-t)+b[i]*t) as [number,number,number];
// Bound CSS gradient stops; image tiles and live canvases use local averages
// matching the softened backdrop rather than the old outline's extrema.
const bounds=(colors:readonly RGB[]):RGB[]=>colors.length<2?[...colors]:[
  [0,1,2].map(i=>Math.min(...colors.map(c=>c[i]))) as [number,number,number],
  [0,1,2].map(i=>Math.max(...colors.map(c=>c[i]))) as [number,number,number]
];

/** Choose plain foreground ink for the clear material. Blur softens detail;
 * neither the material nor its glyphs gain an opaque contrast outline. */
export function glassInk(samples:readonly RGB[],preferred?:'light'|'dark',selection:boolean|'dark'=false):{color:string;halo:string}{
  const colors=samples.length?samples:[[25,29,28] as RGB];
  const backgrounds=colors.map(rgb=>luminance(mix(rgb,[184,184,184],.02))*(selection==='dark'?.91:selection?.99:1));
  const dark=luminance(INK);
  const darkContrast=Math.min(...backgrounds.map(bg=>(Math.max(bg,dark)+.05)/(Math.min(bg,dark)+.05)));
  const lightContrast=Math.min(...backgrounds.map(bg=>1.05/(bg+.05)));
  const color=preferred&&Math.max(darkContrast,lightContrast)<4.5
    ?preferred==='light'?'#fff':'#0b1015'
    :darkContrast>=lightContrast?'#0b1015':'#fff';
  return {color,halo:'transparent'};
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
      const sums=new Uint32Array(GRID_SIZE*GRID_SIZE*3);
      let opaque=true;
      for(let y=0;y<IMAGE_SIZE;y++)for(let x=0;x<IMAGE_SIZE;x++){
        const pixel=(y*IMAGE_SIZE+x)*4,tile=(Math.floor(y/TILE_SIZE)*GRID_SIZE+Math.floor(x/TILE_SIZE))*3;
        if(data[pixel+3]<250)opaque=false;
        for(let i=0;i<3;i++)sums[tile+i]+=data[pixel+i];
      }
      const mean=new Uint8ClampedArray(sums.length);for(let i=0;i<sums.length;i++)mean[i]=Math.round(sums[i]/(TILE_SIZE*TILE_SIZE));
      cached={src:image.currentSrc,pixels:opaque?{mean}:null};
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
  const liveCanvas=document.querySelector<HTMLCanvasElement>('#game-stage canvas:not(.ui-glass-live)');
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
    const total:[number,number,number]=[0,0,0];let count=0;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const offset=(y*GRID_SIZE+x)*3;
      for(let i=0;i<3;i++)total[i]+=pixels.mean[offset+i];count++;
    }
    return count?[total.map(n=>Math.round(n/count)) as [number,number,number]]:[];
  }

  // Modal hit testing exposes only the top layer. Traverse the visible
  // underlying presentation geometrically instead, without closing the dialog.
  const modalUnderlay=document.querySelector('dialog[open]')?[...document.querySelectorAll('#content,#content *,#study-view,#study-view *,.movies-view,.movies-view *,.game-view,.game-view *')].filter(e=>{
    if(e.closest('dialog,.arcade-glass,.section-navigation,.game-sheet,[hidden]'))return false;
    const s=style(e);return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&rect(e).width>0;
  }):[];
  function sample(glyph:Element):RGB[]{
    const r=rect(glyph);
    const live=liveCanvas?canvasInk(r,liveCanvas):null;if(live)return live;
    const ownerDialog=glyph.closest('dialog');
    // The edge lens can sample artwork beyond the glyph footprint.
    const area=new DOMRect(r.x-6,r.y-6,r.width+12,r.height+12);
    const ranges=new Map<HTMLImageElement,RGB[]>();
    const stacks=new Set<string>();
    const samples:RGB[]=[];
    for(const u of [0,.5,1])for(const v of [0,.5,1]){
      const x=Math.max(0,Math.min(innerWidth-1,area.x+area.width*u));
      const y=Math.max(0,Math.min(innerHeight-1,area.y+area.height*v));
      const stack=(ownerDialog?modalUnderlay.filter(e=>within(rect(e),x,y)).reverse():document.elementsFromPoint(x,y)).filter(e=>!e.closest('.arcade-glass,.section-navigation,.ui-tabbar-mini')&&!e.closest('dialog'));
      const view=stack.find(e=>e.classList.contains('game-view'));
      const surface=view?.querySelector('.game-surface');
      if(surface&&within(rect(surface),x,y))stack.splice(stack.indexOf(view!),0,surface);
      for(const layer of passive)if(within(rect(layer),x,y))stack.unshift(layer);
      const key=stack.map(id).join(',');if(stacks.has(key))continue;stacks.add(key);
      let result:RGB[]=[[0,0,0]];
      for(const element of stack.reverse()){
        // Top-layer hit testing cannot reveal the artwork behind a dialog.
        // Its translucent paint bounds the unknown backdrop conservatively.
        if(element instanceof HTMLDialogElement)continue;
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
let liveTimer:ReturnType<typeof setTimeout>|undefined;
const pendingInk=new WeakMap<HTMLElement,{color:string;count:number}>();
let observer:MutationObserver|undefined;
let density:MediaQueryList|undefined;
/** Retained for existing sheet callers; icons now use their original strokes. */
export function syncSheetIconInk(sheet:HTMLElement):void{
  for(const outline of sheet.querySelectorAll('.glass-vector-halo'))outline.remove();
}
function update(){
  frame=0;
  for(const sheet of bindings)if(sheet.matches('.ui-glass-sheet')){
    for(const parent of sheet.querySelectorAll<HTMLElement>('h1,h2,h3,p,label,a,button,small,strong,span,td,th,dt,dd')){
      if(parent.closest('.arcade-glass,.glass-label,svg,.game-button:not(.secondary)'))continue;
      for(const node of [...parent.childNodes])if(node.nodeType===Node.TEXT_NODE&&node.textContent?.trim()){
        const label=document.createElement('span');label.className='glass-label';node.replaceWith(label);label.append(node);
      }
    }
  }
  // Native multiplayer and player overlays bypass openSheet. This decorates
  // their existing SVGs without changing any control or dialog lifecycle.
  for(const sheet of document.querySelectorAll<HTMLElement>('.mp-card,.movies-resume-pill,.movies-fullscreen'))syncSheetIconInk(sheet);
  const {style,rect,sample}=sampler();
  const changes:{glyph:HTMLElement;ink:ReturnType<typeof glassInk>|null}[]=[];
  for(const bar of bindings){
    const box=rect(bar);if(!box.width||!box.height||style(bar).visibility==='hidden')continue;
    const mini=bar.parentElement?.querySelector<HTMLElement>('.ui-tabbar-mini');
    const minimized=bar.hasAttribute('data-minimized')&&!bar.parentElement?.matches(':has(:focus-visible)');
    const targets=bar.matches('.ui-glass-sheet')?[bar]:minimized?(mini?[mini]:[]):bar.matches('.ui-tab,.floating-glass-group')?[bar]:[...bar.querySelectorAll<HTMLElement>('.ui-tab,.game-hud-item')];
    for(const target of targets){
      if(style(target).visibility==='hidden'||style(target).opacity==='0')continue;
      const glyphs=[...target.querySelectorAll<HTMLElement>('svg,span:not(.ui-glass-lens,.ui-glass-glow),small,strong,kbd')].filter(e=>!e.querySelector('svg,span,small,strong,kbd')&&!e.closest('.ui-brand-tile'));
      for(const glyph of glyphs){
        const r=rect(glyph);if(!r.width||!r.height||style(glyph).clip!=='auto')continue;
        const modal=bar.closest('dialog');
        const preference=bar.closest('.section-navigation')?'light':luminance(paint(style(modal??bar).color).rgb)>.5?'light':'dark';
        const selection=bar.matches('.ui-tabbar,.floating-glass-group');
        if(glyph.closest('.game-button:not(.secondary)')&&!glyph.closest('.arcade-glass'))continue;
        const accessible=matchMedia('(prefers-contrast: more)').matches||matchMedia('(forced-colors: active)').matches||matchMedia('(prefers-reduced-transparency: reduce)').matches;
        changes.push({glyph,ink:bar.dataset.glass==='off'||accessible?null:glassInk(sample(glyph),preference,selection)});
      }
    }
  }
  for(const {glyph,ink} of changes){
    if(!ink){glyph.style.removeProperty('--glass-adaptive-ink');glyph.style.removeProperty('--glass-local-halo');glyph.querySelector(':scope > .glass-vector-halo')?.remove();continue;}
    if(!glyph.classList.contains('glass-ink'))glyph.classList.add('glass-ink');
    const previous=glyph.style.getPropertyValue('--glass-adaptive-ink');
    if(previous&&previous!==ink.color&&glyph.closest('.game-view')){
      const pending=pendingInk.get(glyph);if(pending?.color!==ink.color){pendingInk.set(glyph,{color:ink.color,count:1});continue;}
    }else pendingInk.delete(glyph);
    if(previous!==ink.color)glyph.style.setProperty('--glass-adaptive-ink',ink.color);
    if(glyph.style.getPropertyValue('--glass-local-halo')!==ink.halo)glyph.style.setProperty('--glass-local-halo',ink.halo);
    glyph.querySelector(':scope > .glass-vector-halo')?.remove();
  }
  clearTimeout(liveTimer);
  if(bindings.size&&!document.hidden&&document.querySelector('#game-stage canvas:not(.ui-glass-live)'))liveTimer=setTimeout(schedule,140);
}
const schedule=()=>{if(!frame&&!document.hidden)frame=requestAnimationFrame(update);};

/** One shared event subscription for all visible controls; no animation loop. */
export function bindGlassInk(bar:HTMLElement):()=>void{
  bindings.add(bar);
  if(bindings.size===1){
    document.addEventListener('scroll',schedule,{capture:true,passive:true});
    document.addEventListener('load',schedule,true);
    document.addEventListener('visibilitychange',schedule);
    document.addEventListener('transitionend',schedule,true);
    document.addEventListener('focusin',schedule,true);
    document.addEventListener('focusout',schedule,true);
    window.addEventListener('resize',schedule,{passive:true});
    density??=window.matchMedia('(max-resolution: 1.5dppx)');
    density.addEventListener('change',schedule);
    observer=new MutationObserver(records=>{
      const liveGame=!!document.querySelector('#game-stage canvas,#game-stage svg');
      if(records.some(r=>{
        // Live canvas ink is refreshed by the bounded sampling timer.
        // Ignore simulation-only DOM churn between those samples.
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
      document.removeEventListener('scroll',schedule,true);document.removeEventListener('load',schedule,true);document.removeEventListener('visibilitychange',schedule);document.removeEventListener('transitionend',schedule,true);document.removeEventListener('focusin',schedule,true);document.removeEventListener('focusout',schedule,true);window.removeEventListener('resize',schedule);
      cancelAnimationFrame(frame);frame=0;clearTimeout(liveTimer);
    }
  };
}
