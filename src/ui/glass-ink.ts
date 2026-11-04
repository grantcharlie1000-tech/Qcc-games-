import {canvasInk,syncCanvasInkSource} from './canvas-ink';
import {backgroundPaint,colorPaint} from './glass-background';
type RGB=readonly [number,number,number];
type Paint={rgb:RGB;alpha:number};
const INK:RGB=[11,16,21];
const UNKNOWN:RGB[]=[[0,0,0],[255,255,255]];
const IMAGE_SIZE=256;
const isUnknown=(samples:readonly RGB[])=>samples.length===2&&samples[0].every(v=>v===0)&&samples[1].every(v=>v===255);
type ImagePixels={data:Uint8ClampedArray};
const luminance=(rgb:RGB)=>rgb.reduce((sum,v,i)=>sum+(v/255<=.04045?v/3294.6:((v/255+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
const CLEAR_FILL:RGB=[8,12,18];
const CLEAR_VEIL=.2,NAV_VEIL=.36;
const HALO_DARK='rgb(0 0 0 / .8)',HALO_LIGHT='rgb(255 255 255 / .75)';
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>v*(1-t)+b[i]*t) as [number,number,number];
/** Choose plain foreground ink for the clear material. Blur softens detail;
 * neither the material nor its glyphs gain an opaque contrast outline. Where
 * neither ink reaches 4.5:1 over the sampled backdrop (busy or mixed art), the
 * glyph gets a soft opposite-tone halo; over even art it stays transparent. */
export function glassInk(samples:readonly RGB[],preferred?:'light'|'dark',selection:boolean|'dark'=false,textured=false,veil=CLEAR_VEIL):{color:string;halo:string}{
  const colors=samples.length?samples:[[25,29,28] as RGB];
  // Model the fill: the clear fill (--glass-clear-fill, rgb(8 12 18 / .20)) or
  // the bottom navigation's frosted tint (section-navigation.css, alpha .36).
  const backgrounds=colors.map(rgb=>luminance(mix(rgb,CLEAR_FILL,veil))*(selection==='dark'?.91:selection?.99:1));
  const dark=luminance(INK);
  const darkContrast=Math.min(...backgrounds.map(bg=>(Math.max(bg,dark)+.05)/(Math.min(bg,dark)+.05)));
  const lightContrast=Math.min(...backgrounds.map(bg=>1.05/(bg+.05)));
  let color=darkContrast>=lightContrast?'#0b1015':'#fff';
  // Point samples of images, canvases and gradients can miss detail that the
  // light blur still shows under a glyph, so textured backdrops always keep the
  // halo. Over art the ink already suits, the opposite-tone halo is unobtrusive.
  // Flat backdrops keep a small margin (4.75 for 4.5:1) for what this model
  // omits: navigation's tone curve and faint control fills under a glyph.
  const legible=!textured&&Math.max(darkContrast,lightContrast)>=4.75;
  if(!legible){
    const unknown=colors.length===2&&colors[0].every(v=>v===0)&&colors[1].every(v=>v===255);
    if(unknown&&preferred)color=preferred==='light'?'#fff':'#0b1015';
    else{
      // Known mixed artwork still has a local luminance. A route preference
      // must not force white ink over its resolvable bright portions.
      const mean=backgrounds.reduce((sum,value)=>sum+value,0)/backgrounds.length;
      color=(mean+.05)/(dark+.05)>=1.05/(mean+.05)?'#0b1015':'#fff';
    }
  }
  return {color,halo:legible?'transparent':color==='#fff'?HALO_DARK:HALO_LIGHT};
}

// Cache one small image readback per source, never per sample or scroll frame.
// Tainted media is an unknown colour range; no network or game-state access.
const images=new WeakMap<HTMLImageElement,{src:string;pixels:ImagePixels|null}>();
function imagePixels(image:HTMLImageElement):ImagePixels|null{
  if(!image.complete||!image.naturalWidth)return null;
  const src=image.currentSrc||image.src;let cached=images.get(image);
  if(!cached||cached.src!==src){
    const canvas=document.createElement('canvas');canvas.width=IMAGE_SIZE;canvas.height=IMAGE_SIZE;
    try{
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,IMAGE_SIZE,IMAGE_SIZE);
      cached={src,pixels:{data:ctx.getImageData(0,0,IMAGE_SIZE,IMAGE_SIZE).data}};
    }catch{cached={src,pixels:null};}
    images.set(image,cached);
  }
  return cached.pixels;
}
const paint=colorPaint;
const within=(r:DOMRect,x:number,y:number)=>x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom;

/** All layout/style reads are cached for one update, before any ink writes. */
function sampler(){
  const styles=new Map<Element,CSSStyleDeclaration>(),rects=new Map<Element,DOMRect>();
  const visibility=new Map<Element,boolean>();
  const style=(e:Element)=>{let s=styles.get(e);if(!s){s=getComputedStyle(e);styles.set(e,s);}return s;};
  const rect=(e:Element)=>{let r=rects.get(e);if(!r){r=e.getBoundingClientRect();rects.set(e,r);}return r;};
  const visible=(e:Element):boolean=>{
    let value=visibility.get(e);if(value!==undefined)return value;
    const s=style(e);value=s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&(!e.parentElement||visible(e.parentElement));
    visibility.set(e,value);return value;
  };
  const source=document.querySelector<HTMLCanvasElement>('#game-stage canvas:not(.ui-glass-gl>canvas)');
  const liveCanvas=source&&visible(source)?source:null;syncCanvasInkSource(liveCanvas);
  const excluded=(e:Element)=>!!e.closest('dialog,.arcade-glass,.section-navigation,.ui-tabbar-mini,.game-sheet,[hidden]');
  const modal=!!document.querySelector('dialog[open]');
  // Top-layer hit testing hides the page beneath a modal. Include all visible
  // presentation, including arbitrary fixed body overlays and pointerless art.
  const candidates=[...document.querySelectorAll(modal?'html,body,body *':'html,body,body > *, .movies-view > *, .game-view > *, img')].filter(e=>{
    if(excluded(e)||!visible(e))return false;
    const s=style(e);
    return (s.backgroundImage!=='none'||paint(s.backgroundColor).alpha>0||e.matches('img,canvas,video,iframe')||parseFloat(s.borderTopWidth)>0)&&rect(e).width>0;
  });
  // Under a modal, top-layer hit testing cannot see the page, so elements that
  // paint their own text are found by rectangle. Built once per update, on demand.
  const paintsText=(e:Element)=>[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&!!n.textContent?.trim());
  let textElements:Element[]|undefined;
  const texts=()=>textElements??=[...document.querySelectorAll('body *')].filter(e=>!excluded(e)&&paintsText(e)&&visible(e)&&rect(e).width>0);
  const keys=new Map<Element,Array<{node:Element;z:number}>>();
  const key=(element:Element)=>{
    let value=keys.get(element);if(value)return value;
    value=[];
    for(let e:Element|null=element;e&&e!==document.documentElement;e=e.parentElement){
      const s=style(e);
      if(e===element||s.isolation==='isolate'||s.transform!=='none'||Number(s.opacity)<1||s.zIndex!=='auto'&&s.position!=='static')value.unshift({node:e,z:Number(s.zIndex)||0});
    }
    keys.set(element,value);return value;
  };
  const order=(a:Element,b:Element)=>{
    const ak=key(a),bk=key(b);let i=0;while(i<ak.length&&i<bk.length&&ak[i].node===bk[i].node)i++;
    if(i===ak.length||i===bk.length)return ak.length-bk.length;
    return ak[i].z-bk[i].z||(ak[i].node.compareDocumentPosition(bk[i].node)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
  };
  function imageAt(image:HTMLImageElement,x:number,y:number):Paint|null{
    const pixels=imagePixels(image);if(!pixels)return null;
    const r=rect(image),s=style(image);let w=r.width,h=r.height;
    if(s.objectFit==='cover'||s.objectFit==='contain'){
      const scale=(s.objectFit==='cover'?Math.max:Math.min)(w/image.naturalWidth,h/image.naturalHeight);w=image.naturalWidth*scale;h=image.naturalHeight*scale;
    }
    const position=s.objectPosition.split(/\s+/),offset=(v:string,size:number)=>v?.endsWith('%')?parseFloat(v)*size/100:parseFloat(v)||0;
    const left=r.x+offset(position[0],r.width-w),top=r.y+offset(position[1]??'50%',r.height-h);
    const total=[0,0,0];let alpha=0;
    for(const [dx,wx] of [[-3,1],[0,2],[3,1]])for(const [dy,wy] of [[-3,1],[0,2],[3,1]]){
      const px=Math.floor((x+dx-left)/w*IMAGE_SIZE),py=Math.floor((y+dy-top)/h*IMAGE_SIZE);
      if(px<0||py<0||px>=IMAGE_SIZE||py>=IMAGE_SIZE)continue;
      const i=(py*IMAGE_SIZE+px)*4,a=pixels.data[i+3]/255,weight=wx*wy/16;
      alpha+=a*weight;for(let c=0;c<3;c++)total[c]+=pixels.data[i+c]*a*weight;
    }
    return {alpha,rgb:total.map(v=>alpha?v/alpha:0) as [number,number,number]};
  }
  function sample(glyph:Element):RGB[]&{textured?:boolean}{
    const r=rect(glyph),samples:RGB[]&{textured?:boolean}=[];
    for(const u of [.2,.5,.8])for(const v of [.2,.5,.8]){
      const x=Math.max(0,Math.min(innerWidth-1,r.x+r.width*u)),y=Math.max(0,Math.min(innerHeight-1,r.y+r.height*v));
      const stack=new Set((modal?candidates:document.elementsFromPoint(x,y)).filter(e=>!excluded(e)&&visible(e)&&within(rect(e),x,y)));
      for(const e of candidates)if(within(rect(e),x,y))stack.add(e);
      // Under a modal, top-layer hit testing cannot see the page's text.
      if(modal)for(const e of texts())if(within(rect(e),x,y))stack.add(e);
      // Text, images, media and gradients left visible behind clear glass (not
      // painted over by an opaque layer) are detail point samples can miss.
      let textureBehind=false;
      let result:RGB[]=[[0,0,0]];
      const apply=(color:Paint,opacity=1)=>{result=result.map(rgb=>mix(rgb,color.rgb,color.alpha*opacity));};
      for(const element of [...stack].sort(order)){
        const s=style(element),box=rect(element),opacity=Number(s.opacity);
        const fill=paint(s.backgroundColor);apply(fill,opacity);
        if(fill.alpha*opacity>=.99)textureBehind=false;
        if(opacity>0&&(paintsText(element)||s.backgroundImage!=='none'||element.matches('img,canvas,video,iframe')))textureBehind=true;
        if(s.backgroundImage!=='none'){
          const background=backgroundPaint(s,box,x,y);if(background)apply(background,opacity);else result=UNKNOWN;
        }
        if(element instanceof HTMLImageElement){const color=imageAt(element,x,y);if(color)apply(color,opacity);else result=UNKNOWN;}
        if(element instanceof HTMLCanvasElement){
          const colors=canvasInk(new DOMRect(x,y,1,1),element);if(colors)result=colors;else result=UNKNOWN;
        }else if(element instanceof HTMLVideoElement||element instanceof HTMLIFrameElement)result=UNKNOWN; // embedded players cannot be read
        for(const [width,color,edge] of [
          [s.borderLeftWidth,s.borderLeftColor,new DOMRect(box.x,box.y,parseFloat(s.borderLeftWidth),box.height)],
          [s.borderRightWidth,s.borderRightColor,new DOMRect(box.right-parseFloat(s.borderRightWidth),box.y,parseFloat(s.borderRightWidth),box.height)],
          [s.borderTopWidth,s.borderTopColor,new DOMRect(box.x,box.y,box.width,parseFloat(s.borderTopWidth))],
          [s.borderBottomWidth,s.borderBottomColor,new DOMRect(box.x,box.bottom-parseFloat(s.borderBottomWidth),box.width,parseFloat(s.borderBottomWidth))]
        ] as const)if(parseFloat(width)>0&&within(edge,x,y))apply(paint(color),opacity);
      }
      if(textureBehind)samples.textured=true;
      if(result.length>1&&result.some(color=>color.some((value,c)=>value!==result[0][c])))return Object.assign([...UNKNOWN],{textured:true});
      samples.push(result[0]);
    }
    return samples;
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
      // Retain the existing sample area for labels, including their icons, so
      // label contrast does not change. Icons themselves keep fixed white ink.
      const groups=new Map<Element,HTMLElement[]>();
      for(const glyph of glyphs){
        const r=rect(glyph);if(!r.width||!r.height||style(glyph).clip!=='auto')continue;
        if(glyph.closest('.game-button:not(.secondary)')&&!glyph.closest('.arcade-glass'))continue;
        const key=bar.matches('.ui-tabbar')||target.matches('.ui-tabbar-mini')?bar:glyph.closest('.ui-tab,button,a,.game-hud-item,label')??glyph;
        const group=groups.get(key)??[];group.push(glyph);groups.set(key,group);
      }
      const modal=bar.closest('dialog');
      const preference=bar.closest('.section-navigation')?'light':luminance(paint(style(modal??bar).color).rgb)>.5?'light':'dark';
      const selection=bar.matches('.ui-tabbar,.floating-glass-group');
      const accessible=matchMedia('(prefers-contrast: more)').matches||matchMedia('(forced-colors: active)').matches||matchMedia('(prefers-reduced-transparency: reduce)').matches;
      for(const group of groups.values()){
        const labels=group.filter(glyph=>!glyph.matches('svg,.nc-chevrons'));
        if(!labels.length)continue;
        let ink:ReturnType<typeof glassInk>|null=null;
        // Frosted sheets carry a dark tint under a deep blur: plain white ink, no halo.
        if(bar.closest('.ui-glass-sheet')&&!accessible)ink={color:'#fff',halo:'transparent'};
        else if(bar.dataset.glass!=='off'&&!accessible){
          const samples=group.map(sample),known=samples.filter(s=>!isUnknown(s)).flat();
          ink=glassInk(known.length?known:UNKNOWN,preference,selection,samples.some(s=>s.textured),bar.closest('.section-navigation')?NAV_VEIL:CLEAR_VEIL);
        }
        for(const glyph of labels)changes.push({glyph,ink});
      }
    }
  }
  for(const {glyph,ink} of changes){
    if(!ink){glyph.style.removeProperty('--glass-adaptive-ink');glyph.style.removeProperty('--glass-local-halo');glyph.removeAttribute('data-glass-halo');glyph.querySelector(':scope > .glass-vector-halo')?.remove();continue;}
    if(!glyph.classList.contains('glass-ink'))glyph.classList.add('glass-ink');
    const previous=glyph.style.getPropertyValue('--glass-adaptive-ink');
    if(previous&&previous!==ink.color&&glyph.closest('.game-view')){
      const pending=pendingInk.get(glyph);if(pending?.color!==ink.color){pendingInk.set(glyph,{color:ink.color,count:1});continue;}
    }else pendingInk.delete(glyph);
    if(previous!==ink.color)glyph.style.setProperty('--glass-adaptive-ink',ink.color);
    if(glyph.style.getPropertyValue('--glass-local-halo')!==ink.halo)glyph.style.setProperty('--glass-local-halo',ink.halo);
    const halo=ink.halo!=='transparent';
    if(glyph.hasAttribute('data-glass-halo')!==halo)glyph.toggleAttribute('data-glass-halo',halo);
    glyph.querySelector(':scope > .glass-vector-halo')?.remove();
  }
  clearTimeout(liveTimer);
  if(bindings.size&&!document.hidden&&document.querySelector('#game-stage canvas:not(.ui-glass-gl>canvas)'))liveTimer=setTimeout(schedule,140);
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
      target.style.removeProperty('--glass-adaptive-ink');target.style.removeProperty('--glass-local-halo');target.removeAttribute('data-glass-halo');target.querySelector(':scope > .glass-vector-halo')?.remove();target.classList.remove('glass-ink');
    }
    if(!bindings.size){
      observer?.disconnect();observer=undefined;
      density?.removeEventListener('change',schedule);density=undefined;
      document.removeEventListener('scroll',schedule,true);document.removeEventListener('load',schedule,true);document.removeEventListener('visibilitychange',schedule);document.removeEventListener('transitionend',schedule,true);document.removeEventListener('focusin',schedule,true);document.removeEventListener('focusout',schedule,true);window.removeEventListener('resize',schedule);
      cancelAnimationFrame(frame);frame=0;clearTimeout(liveTimer);syncCanvasInkSource(null);
    }
  };
}
