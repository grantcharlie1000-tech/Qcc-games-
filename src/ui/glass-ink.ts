import {canvasInk,syncCanvasInkSource} from './canvas-ink';
import {backgroundPaint,colorPaint} from './glass-background';
type RGB=readonly [number,number,number];
type Paint={rgb:RGB;alpha:number};
const UNKNOWN:RGB[]=[[0,0,0],[255,255,255]];
const IMAGE_SIZE=256;
const isUnknown=(samples:readonly RGB[])=>samples.length===2&&samples[0].every(v=>v===0)&&samples[1].every(v=>v===255);
type ImagePixels={data:Uint8ClampedArray};
const luminance=(rgb:RGB)=>rgb.reduce((sum,v,i)=>sum+(v/255<=.04045?v/3294.6:((v/255+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
const CLEAR_FILL:RGB=[8,12,18];
const CLEAR_VEIL=.2,NAV_VEIL=.36;
const HALO_DARK='rgb(0 0 0 / .8)';
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>v*(1-t)+b[i]*t) as [number,number,number];
// The light theme's section navigation is pale frost the art shows through (section-lens.ts MILK_LIFT/MILK_GAIN and
// the CSS fallback's .8 tint): about 188 over black art and 240 over white, modelled here as .8 of a 236 grey over the
// art. Its labels take Apple Music's dark grey label ink (about 45 in Apple's light still), which keeps about 6.6:1
// over the frost's darkest case (black art), so the white halo only returns below 4.5:1.
export const MILK_INK='#333336';
const MILK:RGB=[236,236,236],MILK_VEIL=.8;
export function milkInk(samples:readonly RGB[]):{color:string;halo:string}{
  const colors=samples.length?samples:[[25,29,28] as RGB];
  const ink=luminance([51,51,54]);
  const contrast=Math.min(...colors.map(rgb=>(luminance(mix(rgb,MILK,MILK_VEIL))+.05)/(ink+.05)));
  return {color:MILK_INK,halo:contrast>=4.5?'transparent':'rgb(255 255 255 / .8)'};
}
// The dark theme's WebGL bar (section-lens.ts DARK_GLASS) is a smoke over the art of about .2 of a 160 grey (black about
// 32, white about 236). Section labels keep the dark halo wherever it, or #92's darker .36 frost (NAV_VEIL), would leave
// white ink under the 7:1 bar for 10px labels. LOOK-6 made the dark CSS glass the same smoke, .125 of white (MENU_SMOKE,
// section-navigation.css): within about 6 levels of NAV_SMOKE up to mid art, so the labels' model is kept.
const NAV_SMOKE:RGB=[160,160,160],NAV_SMOKE_VEIL=.2;
const MENU_SMOKE=.125,WHITE:RGB=[255,255,255];
export function navInk(samples:readonly RGB[],selection:boolean):{color:string;halo:string}{
  const frost=glassInk(samples,'light',selection,false,NAV_VEIL,7);
  const smoke=glassInk(samples.map(rgb=>mix(rgb,NAV_SMOKE,NAV_SMOKE_VEIL)),'light',selection,false,0,7);
  return frost.halo==='transparent'&&smoke.halo==='transparent'?frost:{color:'#fff',halo:HALO_DARK};
}
// LOOK-26 (council-6eaf6223 Opus miss 2: over bright art the dark menu circle read as an opaque copper disc with a bold,
// outlined glyph). Beside the WebGL bar (section-navigation.css: its soft frost, and the dim layer under the glyph) the
// circle's smoke under the glyph stops at MENU_CAP, the luminance of 149 grey (LOOK-25's cap; white 3.0:1), as Apple's
// white Search glyph keeps 3.22:1 (2.58:1 at the glass's p90, WCAG .271/.351) over its bright poster with no outline
// (Charlie's video at 19.5 s). It stops by a uniform dim, brightness(dim), so the art keeps its colour: a per-channel clamp
// turned the face poster's orange into a grey-green patch. The dim is the one that brings the brightest of the glyph's
// samples down to MENU_CAP; there white holds 2:1 (MENU_CAPPED_FLOOR) with no outline.
const MENU_CAP=luminance([149,149,149]),MENU_CAPPED_FLOOR=2;
const dimmed=(rgb:RGB,dim:number):RGB=>rgb.map(v=>v*dim) as [number,number,number];
/** The dark menu circle is CSS glass only, that smoke: its white glyph keeps 4.5:1 over it, or takes the dark halo.
 * Beside the WebGL bar (capped) the smoke is dimmed to MENU_CAP under the glyph instead (dim, for its ::after layer) and
 * white keeps MENU_CAPPED_FLOOR there. Icon colour belongs to CSS, so only the halo is set (no --glass-adaptive-ink). */
export function menuInk(samples:readonly RGB[],capped=false):{color:string;halo:string;dim:number}{
  const smoke=samples.map(rgb=>mix(rgb,WHITE,MENU_SMOKE));
  if(!capped)return {color:'',halo:glassInk(smoke,'light',false,false,0,4.5).halo,dim:1};
  const brightest=smoke.reduce((a,b)=>luminance(b)>luminance(a)?b:a,smoke[0]??[0,0,0]);
  let dim=1;
  if(luminance(brightest)>MENU_CAP){
    let low=0,high=1;
    for(let i=0;i<20;i++){const mid=(low+high)/2;if(luminance(dimmed(brightest,mid))>MENU_CAP)high=mid;else low=mid;}
    dim=Math.round(1000*low)/1000;
  }
  return {color:'',halo:glassInk(smoke.map(rgb=>dimmed(rgb,dim)),'light',false,false,0,MENU_CAPPED_FLOOR).halo,dim};
}
/** The dark menu circle beside the WebGL bar: its soft frost and the dim layer under its glyph (section-navigation.css). */
const MENU_BESIDE_LENS='.section-navigation>.section-tabbar[data-section-lens=webgl]:not([data-glass=off])~.section-menu[data-glass=backdrop]';
/** Keep the glyph itself white. Sample only to decide whether a soft dark
 * shadow is needed over bright or busy artwork; never invert labels or scores.
 * Opaque accessibility surfaces bypass this function in the binding below. */
export function glassInk(samples:readonly RGB[],_preferred?:'light'|'dark',selection:boolean|'dark'=false,textured=false,veil=CLEAR_VEIL,minContrast=4.75):{color:string;halo:string}{
  const colors=samples.length?samples:[[25,29,28] as RGB];
  const backgrounds=colors.map(rgb=>luminance(mix(rgb,CLEAR_FILL,veil))*(selection==='dark'?.91:selection?.99:1));
  const lightContrast=Math.min(...backgrounds.map(bg=>1.05/(bg+.05)));
  return {color:'#fff',halo:!textured&&lightContrast>=minContrast?'transparent':HALO_DARK};
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
let observer:MutationObserver|undefined;
let density:MediaQueryList|undefined;
let scheme:MediaQueryList|undefined;
/** Retained for existing sheet callers; icons now use their original strokes. */
export function syncSheetIconInk(sheet:HTMLElement):void{
  for(const outline of sheet.querySelectorAll('.glass-vector-halo'))outline.remove();
}
function update(){
  frame=0;
  for(const sheet of bindings)if(sheet.matches('.ui-glass-sheet')){
    for(const parent of sheet.querySelectorAll<HTMLElement>('h1,h2,h3,p,label,a,button,small,strong,span,td,th,dt,dd')){
      // Solid light buttons (the cream primary, .ui-btn.primary) and the unread badge keep their own dark ink.
      if(parent.closest('.arcade-glass,.glass-label,svg,.game-button:not(.secondary),.ui-btn.primary,.apps-badge'))continue;
      for(const node of [...parent.childNodes])if(node.nodeType===Node.TEXT_NODE&&node.textContent?.trim()){
        const label=document.createElement('span');label.className='glass-label';node.replaceWith(label);label.append(node);
      }
    }
  }
  // Native multiplayer and player overlays bypass openSheet. This decorates
  // their existing SVGs without changing any control or dialog lifecycle.
  for(const sheet of document.querySelectorAll<HTMLElement>('.mp-card,.movies-resume-pill,.movies-fullscreen'))syncSheetIconInk(sheet);
  const {style,rect,sample}=sampler();
  const changes:{glyph:HTMLElement;ink:ReturnType<typeof glassInk>|null}[]=[],released:HTMLElement[]=[];
  const dims=new Map<HTMLElement,number>();
  for(const bar of bindings){
    const box=rect(bar);if(!box.width||!box.height||style(bar).visibility==='hidden')continue;
    const mini=bar.parentElement?.querySelector<HTMLElement>('.ui-tabbar-mini');
    const minimized=bar.hasAttribute('data-minimized')&&!bar.parentElement?.matches(':has(:focus-visible)');
    const targets=bar.matches('.ui-glass-sheet')?[bar]:minimized?(mini?[mini]:[]):bar.matches('.ui-tab,.floating-glass-group,.game-hud')?[bar]:[...bar.querySelectorAll<HTMLElement>('.ui-tab,.game-hud-item')];
    for(const target of targets){
      if(style(target).visibility==='hidden'||style(target).opacity==='0')continue;
      const glyphs=[...target.querySelectorAll<HTMLElement>('svg,span:not(.ui-glass-lens,.ui-glass-glow),small,strong,kbd')].filter(e=>!e.querySelector('svg,span,small,strong,kbd')&&!e.closest('.ui-brand-tile,.apps-badge'));
      // The unread badge (.apps-badge) keeps its own fill and ink, so it is not a glyph.
      // Retain the existing sample area for labels, including their icons, so
      // the local text shadow follows the artwork. Every glyph stays white.
      const groups=new Map<Element,HTMLElement[]>();
      for(const glyph of glyphs){
        // Destructive labels keep their warning colour; icon colour belongs to CSS.
        if(glyph.closest('.apps-danger,.is-danger')){changes.push({glyph,ink:null});continue;}
        const r=rect(glyph);if(!r.width||!r.height||style(glyph).clip!=='auto')continue;
        if(glyph.closest('.game-button:not(.secondary),.ui-btn.primary')&&!glyph.closest('.arcade-glass'))continue;
        // C30: each section label reads its own backdrop, so one bright tile does not halo all five.
        const key=bar.matches('.section-tabbar')&&!target.matches('.ui-tabbar-mini')?glyph:bar.matches('.ui-tabbar')||target.matches('.ui-tabbar-mini')?bar:glyph.closest('.ui-tab,button,a,.game-hud-item,label')??glyph;
        const group=groups.get(key)??[];group.push(glyph);groups.set(key,group);
      }
      const modal=bar.closest('dialog');
      const preference=bar.closest('.section-navigation')?'light':luminance(paint(style(modal??bar).color).rgb)>.5?'light':'dark';
      const selection=bar.matches('.ui-tabbar,.floating-glass-group');
      const nav=!!bar.closest('.section-navigation');
      const accessible=matchMedia('(prefers-contrast: more)').matches||matchMedia('(forced-colors: active)').matches||matchMedia('(prefers-reduced-transparency: reduce)').matches;
      const milky=nav&&!matchMedia('(prefers-color-scheme: dark)').matches;
      // LOOK-6: the dark menu circle's lighter smoke can leave its white glyph under 4.5:1 over bright art (menuInk).
      const circle=nav&&!milky&&target.matches('.section-menu');
      for(const group of groups.values()){
        const labels=circle?group:group.filter(glyph=>!glyph.matches('svg,.nc-chevrons'));
        // LOOK-7 (#24 review of LOOK-6, I1): only the dark menu circle inks its svg. After a live switch to light that svg is
        // no longer a label, so what the dark circle set is cleared back to a fresh light load's glyph; its dark halo would
        // otherwise stay round the light circle's grey glyph until the bar is rebuilt.
        if(!circle&&target.matches('.section-menu'))released.push(...group.filter(glyph=>glyph.matches('svg.glass-ink')));
        if(!labels.length)continue;
        let ink:ReturnType<typeof glassInk>|null=null;
        // Frosted sheets carry a dark tint under a deep blur: plain white ink, no halo.
        if(bar.closest('.ui-glass-sheet')&&!accessible)ink={color:'#fff',halo:'transparent'};
        else if(bar.dataset.glass!=='off'&&!accessible){
          const samples=group.map(sample),known=samples.filter(s=>!isUnknown(s)).flat();
          // The section bar's deep frost blurs fine texture away, so C30 showed plain labels over art.
          // There only low contrast (bright art, unreadable media) keeps the halo, at a 7:1 bar for 10px text.
          const menu=circle?menuInk(known.length?known:UNKNOWN,target.matches(MENU_BESIDE_LENS)):null;
          if(menu&&menu.dim<1)dims.set(target,menu.dim);
          ink=milky?milkInk(known.length?known:UNKNOWN)
            :menu?menu
            :nav?navInk(known.length?known:UNKNOWN,selection)
            :glassInk(known.length?known:UNKNOWN,preference,selection,samples.some(s=>s.textured),CLEAR_VEIL);
        }
        for(const glyph of labels)changes.push({glyph,ink});
      }
    }
  }
  for(const {glyph,ink} of changes){
    if(!ink){glyph.style.removeProperty('--glass-adaptive-ink');glyph.style.removeProperty('--glass-local-halo');glyph.removeAttribute('data-glass-halo');glyph.querySelector(':scope > .glass-vector-halo')?.remove();continue;}
    if(!glyph.classList.contains('glass-ink'))glyph.classList.add('glass-ink');
    const previous=glyph.style.getPropertyValue('--glass-adaptive-ink');
    if(previous!==ink.color)glyph.style.setProperty('--glass-adaptive-ink',ink.color);
    if(glyph.style.getPropertyValue('--glass-local-halo')!==ink.halo)glyph.style.setProperty('--glass-local-halo',ink.halo);
    const halo=ink.halo!=='transparent';
    if(glyph.hasAttribute('data-glass-halo')!==halo)glyph.toggleAttribute('data-glass-halo',halo);
    glyph.querySelector(':scope > .glass-vector-halo')?.remove();
  }
  // LOOK-26: the dark circle's dim under its glyph (section-navigation.css ::after), cleared wherever it no longer applies.
  for(const bar of bindings)if(bar.matches('.section-menu')){
    const dim=dims.get(bar);
    if(dim===undefined){if(bar.hasAttribute('data-glass-dim')){bar.removeAttribute('data-glass-dim');bar.style.removeProperty('--menu-glass-dim');}continue;}
    if(bar.style.getPropertyValue('--menu-glass-dim')!==String(dim))bar.style.setProperty('--menu-glass-dim',String(dim));
    if(!bar.hasAttribute('data-glass-dim'))bar.setAttribute('data-glass-dim','');
  }
  for(const glyph of released){
    glyph.style.removeProperty('--glass-adaptive-ink');glyph.style.removeProperty('--glass-local-halo');glyph.removeAttribute('data-glass-halo');
    glyph.querySelector(':scope > .glass-vector-halo')?.remove();glyph.classList.remove('glass-ink');
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
    scheme??=window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change',schedule);
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
        return !(r.target instanceof Element)||!r.target.closest('.arcade-glass,.ui-tabbar-mini')||r.attributeName==='data-minimized'||r.attributeName==='data-glass'||r.attributeName==='data-section-lens'||(r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(n=>n instanceof Element&&!n.matches('.ui-glass-contrast,.ui-glass-glow,.ui-glass-lens')));
      }))schedule();
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','data-minimized','data-glass','data-section-lens']});
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
      scheme?.removeEventListener('change',schedule);scheme=undefined;
      document.removeEventListener('scroll',schedule,true);document.removeEventListener('load',schedule,true);document.removeEventListener('visibilitychange',schedule);document.removeEventListener('transitionend',schedule,true);document.removeEventListener('focusin',schedule,true);document.removeEventListener('focusout',schedule,true);window.removeEventListener('resize',schedule);
      cancelAnimationFrame(frame);frame=0;clearTimeout(liveTimer);syncCanvasInkSource(null);
    }
  };
}
