// One shared WebGL2 lens renderer for game-facing glass, on every browser.
// WebKit cannot run backdrop-filter:url() and no browser exposes arbitrary live
// DOM pixels, so the lens refracts the only live pixels we own: the game's
// canvas. The game's own render loop calls notifyGlassFrame after drawing; in
// that same task we copy one bounded crop around every visible lens into a
// small staging canvas (1-1.5 px per CSS px), upload it once with
// texSubImage2D, draw every lens into one atlas, and copy each atlas slot into
// the lens's own output canvas, which sits under the surface's DOM content.
// There is no second requestAnimationFrame; crop changes trigger an opacity readback.
// Anything unexpected (no WebGL2, context loss, tainted source, accessibility
// or motion preferences) deactivates the lens; the surface keeps its CSS blur.
import './webgl-glass.css';
import {hasGlassFrameSource,onGlassFrame,requestGlassFrame,watchGlassFrameSources} from './glass-frame-source';
import {LENS_PRESETS,fitPreset,glassDensity,type LensPreset} from './glass-lens-profile';

export type LensKind=keyof typeof LENS_PRESETS;
export interface WebglLens{setEnabled(enabled:boolean):void;dispose():void}

const VERTEX=`#version 300 es
in vec2 a_unit;
uniform vec4 u_rect;
out vec2 v_position;
void main(){
  v_position=u_rect.xy+a_unit*u_rect.zw;
  gl_Position=vec4(a_unit.x*2.0-1.0,1.0-a_unit.y*2.0,0.0,1.0);
}`;
// Coordinates are source-local CSS px, so strength is independent of DPR.
const FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform vec4 u_crop;
uniform vec2 u_texRange;
uniform vec2 u_texel;
uniform vec2 u_source;
uniform vec4 u_rect;
uniform float u_radius;
uniform float u_band;
uniform float u_bend;
uniform float u_softness;
uniform float u_saturation;
in vec2 v_position;
out vec4 outColor;
vec4 readScene(vec2 p){
  vec2 uv=(p-u_crop.xy)/u_crop.zw*u_texRange;
  return texture(u_scene,clamp(uv,0.5*u_texel,u_texRange-0.5*u_texel));
}
void main(){
  vec2 p=v_position-u_rect.xy-0.5*u_rect.zw;
  vec2 q=abs(p)-(0.5*u_rect.zw-u_radius);
  vec2 outside=max(q,0.0);
  float len=length(outside);
  float sd=len+min(max(q.x,q.y),0.0)-u_radius;
  float aa=max(fwidth(sd),0.001);
  float coverage=1.0-smoothstep(-0.5*aa,0.5*aa,sd);
  // Only the canvas is live. Page background around it keeps the CSS tint.
  vec2 onSource=step(vec2(0.0),v_position)*step(v_position,u_source);
  coverage*=onSource.x*onSource.y;
  if(coverage<=0.0)discard;
  vec2 normal;
  if(len>0.00001)normal=outside/len*sign(p);
  else normal=q.x>q.y?vec2(sign(p.x),0.0):vec2(0.0,sign(p.y));
  float t=clamp(-sd/max(u_band,0.001),0.0,1.0);
  float edge=1.0-t*t*(3.0-2.0*t);
  vec2 s=v_position-normal*u_bend*edge;
  vec4 color=readScene(s);
  if(u_softness>0.0){
    color*=0.40;
    color+=0.15*readScene(s+vec2(u_softness,0.0));
    color+=0.15*readScene(s-vec2(u_softness,0.0));
    color+=0.15*readScene(s+vec2(0.0,u_softness));
    color+=0.15*readScene(s-vec2(0.0,u_softness));
  }
  float luma=dot(color.rgb,vec3(0.2126,0.7152,0.0722));
  color.rgb=clamp(mix(vec3(luma),color.rgb,u_saturation),0.0,color.a);
  outColor=color*coverage;
}`;
const UNIFORMS=['u_rect','u_scene','u_crop','u_texRange','u_texel','u_source','u_radius','u_band','u_bend','u_softness','u_saturation'] as const;
type Uniform=typeof UNIFORMS[number];
// Large sheets are capped so a phone never fills a full-screen glass buffer.
const MAX_LENS_PIXELS=400_000;
const bucket=(n:number)=>Math.max(32,Math.ceil(n/64)*64);

interface Lens{
  surface:HTMLElement;wrapper:HTMLElement;output:HTMLCanvasElement;ctx:CanvasRenderingContext2D|null;
  kind:LensKind;enabled:boolean;active:boolean;source:HTMLCanvasElement|null;
  onActive:(active:boolean)=>void;attach:()=>void;detach:()=>void;
}
// opaqueKey/opaque: a rare probe (only when the crop geometry changes) of whether the
// source covers the crop with opaque pixels; transparent areas keep the CSS blur.
interface Group{lenses:Set<Lens>;off:()=>void;lost:boolean;lastFrame:number;opaqueKey:string;opaque:boolean}
interface Plan{lens:Lens;x:number;y:number;w:number;h:number;outW:number;outH:number;density:number;preset:LensPreset;slot:number;inside:boolean}
interface Gpu{
  canvas:HTMLCanvasElement;gl:WebGL2RenderingContext;program:WebGLProgram;vao:WebGLVertexArrayObject;
  texture:WebGLTexture;uniforms:Record<Uniform,WebGLUniformLocation|null>;texW:number;texH:number;
}

const lenses=new Set<Lens>();
const groups=new Map<HTMLCanvasElement,Group>();
const pending=new Set<HTMLCanvasElement>();
let gpu:Gpu|null=null,unavailable=false,contextLost=false,flushQueued=false;
let staging:HTMLCanvasElement|null=null,stagingCtx:CanvasRenderingContext2D|null=null;
let unwatchSources:(()=>void)|null=null,unwatchPreferences:(()=>void)|null=null;

/** Measured CPU submission cost; the GPU may still be working afterwards. */
export const webglGlassStats={frames:0,uploads:0,skipped:0,cpuMs:0,lastCpuMs:0,failures:0};
// Read by the frame-time proof scripts; no behaviour depends on it.
(globalThis as {__qccGlassStats?:typeof webglGlassStats}).__qccGlassStats=webglGlassStats;

let queries:MediaQueryList[]|null=null;
const preferenceQueries=()=>queries??=['(prefers-reduced-transparency: reduce)','(prefers-contrast: more)','(forced-colors: active)','(prefers-reduced-motion: reduce)'].map(q=>matchMedia(q));
// Preferences are re-read only when they change, never per frame.
let preferred=true;
function refreshPolicy(){
  const forcedBlur=new URLSearchParams(location.search).get('glass')==='blur';
  preferred=!forcedBlur&&!document.documentElement.classList.contains('reduce-motion')&&!preferenceQueries().some(q=>q.matches);
}
/** Reduced motion keeps glass still: no per-frame lens, plain blur instead. */
function allowed():boolean{return preferred&&!unavailable&&!contextLost;}

function compile(gl:WebGL2RenderingContext,type:number,source:string):WebGLShader{
  const shader=gl.createShader(type);if(!shader)throw new Error('shader');
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)&&!gl.isContextLost())throw new Error(gl.getShaderInfoLog(shader)??'compile');
  return shader;
}
function createGpu(canvas:HTMLCanvasElement):Gpu|null{
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
  if(!gl)return null;
  const program=gl.createProgram();if(!program)return null;
  gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,FRAGMENT));
  gl.bindAttribLocation(program,0,'a_unit');gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)??'link');
  const vao=gl.createVertexArray(),buffer=gl.createBuffer(),texture=gl.createTexture();
  if(!vao||!buffer||!texture)return null;
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindTexture(gl.TEXTURE_2D,texture);
  for(const [name,value] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,name,value);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.useProgram(program);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  const uniforms=Object.fromEntries(UNIFORMS.map(name=>[name,gl.getUniformLocation(program,name)])) as Record<Uniform,WebGLUniformLocation|null>;
  gl.uniform1i(uniforms.u_scene,0);
  return {canvas,gl,program,vao,texture,uniforms,texW:0,texH:0};
}
function ensureGpu():Gpu|null{
  if(gpu||unavailable)return gpu;
  try{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;resolveAll();});
    canvas.addEventListener('webglcontextrestored',()=>{
      contextLost=false;gpu=null;
      try{gpu=createGpu(canvas);}catch{gpu=null;}
      if(!gpu)unavailable=true;
      resolveAll();
    });
    gpu=createGpu(canvas);
  }catch{gpu=null;}
  if(!gpu){unavailable=true;webglGlassStats.failures++;queueMicrotask(resolveAll);}
  return gpu;
}

function setActive(lens:Lens,active:boolean){
  if(lens.active===active)return;
  lens.active=active;if(!active)lens.surface.removeAttribute('data-glass-partial');lens.onActive(active);
}
function deactivate(group:Group){for(const lens of group.lenses)setActive(lens,false);}
function deactivateAll(){for(const lens of lenses)setActive(lens,false);}
function fail(){unavailable=true;webglGlassStats.failures++;deactivateAll();queueMicrotask(resolveAll);}

function sourceFor(surface:HTMLElement):HTMLCanvasElement|null{
  // Shell sheets (the Menu dialog) sit outside the game view; other shell glass never joins.
  const sheet=surface instanceof HTMLDialogElement||surface.matches('.ui-glass-sheet');
  const view=surface.closest('.game-view')??(sheet&&document.body.classList.contains('in-game')?document.querySelector('.game-view'):null);
  if(!view)return null;
  for(const canvas of view.querySelectorAll<HTMLCanvasElement>('#game-stage canvas'))if(hasGlassFrameSource(canvas))return canvas;
  return null;
}
function visible(element:HTMLElement):boolean{
  if(typeof element.checkVisibility==='function')return element.checkVisibility({opacityProperty:true,visibilityProperty:true});
  const style=getComputedStyle(element);
  return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&!!element.getClientRects().length;
}
function radiusOf(surface:HTMLElement,width:number,height:number):number{
  const value=getComputedStyle(surface).borderTopLeftRadius;
  const n=parseFloat(value);
  if(!Number.isFinite(n))return 0;
  return value.endsWith('%')?n*Math.min(width,height)/100:n;
}

/** Draw every visible lens over one source, synchronously after its frame. */
function render(source:HTMLCanvasElement,group:Group){
  const started=performance.now();group.lastFrame=started;
  if(document.hidden||group.lost||!allowed()){deactivate(group);return;}
  const back=source.getBoundingClientRect();
  if(!back.width||!back.height||!source.width||!source.height||!visible(source)){deactivate(group);return;}
  const plans:Plan[]=[];
  for(const lens of group.lenses){
    if(!lens.enabled||!lens.surface.isConnected||!visible(lens.surface)){setActive(lens,false);continue;}
    // A re-render may replace the surface's children; restore the lens layer.
    if(lens.wrapper.parentElement!==lens.surface)lens.attach();
    const box=lens.wrapper.getBoundingClientRect();
    const width=lens.wrapper.offsetWidth,height=lens.wrapper.offsetHeight;
    const overlaps=box.right>back.left&&box.left<back.right&&box.bottom>back.top&&box.top<back.bottom;
    if(!width||!height||!box.width||!box.height||!overlaps){setActive(lens,false);continue;}
    // 1-1.5 px per CSS px; very large sheets settle at 1.
    const density=Math.max(1,Math.min(glassDensity(devicePixelRatio),Math.sqrt(MAX_LENS_PIXELS/(width*height))));
    // The surface may be scaled by a press or an opening transition; sample where it is on screen.
    const scale=box.width/width;
    const preset=fitPreset(LENS_PRESETS[lens.kind],box.width,box.height,radiusOf(lens.surface,width,height)*scale);
    const inside=box.left>=back.left-.5&&box.top>=back.top-.5&&box.right<=back.right+.5&&box.bottom<=back.bottom+.5;
    plans.push({lens,x:box.left-back.left,y:box.top-back.top,w:box.width,h:box.height,outW:Math.max(1,Math.round(width*density)),outH:Math.max(1,Math.round(height*density)),density,preset,slot:0,inside});
  }
  if(!plans.length){webglGlassStats.skipped++;return;}
  const g=ensureGpu();if(!g){deactivate(group);return;}
  const {gl}=g;
  // One bounded crop around all lenses, padded by the furthest sample.
  const pad=Math.max(...plans.map(p=>p.preset.bend+p.preset.softness))+2;
  const cx0=Math.max(0,Math.floor(Math.min(...plans.map(p=>p.x))-pad)),cy0=Math.max(0,Math.floor(Math.min(...plans.map(p=>p.y))-pad));
  const cx1=Math.min(back.width,Math.ceil(Math.max(...plans.map(p=>p.x+p.w))+pad)),cy1=Math.min(back.height,Math.ceil(Math.max(...plans.map(p=>p.y+p.h))+pad));
  if(cx1<=cx0||cy1<=cy0){deactivate(group);return;}
  const density=Math.max(...plans.map(p=>p.density));
  const stW=Math.max(1,Math.ceil((cx1-cx0)*density)),stH=Math.max(1,Math.ceil((cy1-cy0)*density));
  try{
    staging??=document.createElement('canvas');
    stagingCtx??=staging.getContext('2d',{alpha:true});
    if(!stagingCtx){fail();return;}
    if(staging.width<stW||staging.height<stH){staging.width=bucket(Math.max(stW,staging.width));staging.height=bucket(Math.max(stH,staging.height));}
    const kx=source.width/back.width,ky=source.height/back.height;
    stagingCtx.clearRect(0,0,stW,stH);
    stagingCtx.drawImage(source,cx0*kx,cy0*ky,(cx1-cx0)*kx,(cy1-cy0)*ky,0,0,stW,stH);
    const key=`${cx0},${cy0},${cx1},${cy1},${stW},${stH}`;
    if(group.opaqueKey!==key){
      // Not per frame: a one-off probe when the crop moves or resizes.
      group.opaqueKey=key;
      const probe=stagingCtx.getImageData(0,0,stW,stH).data;let opaque=true;
      for(let i=3;i<probe.length;i+=4*7)if(probe[i]<250){opaque=false;break;}
      group.opaque=opaque;
    }
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,g.texture);
    if(gl.isContextLost()){deactivate(group);return;}
    if(g.texW!==staging.width||g.texH!==staging.height){
      g.texW=staging.width;g.texH=staging.height;
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,g.texW,g.texH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
    // The bounded crop is the only upload this frame.
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,stW,stH,gl.RGBA,gl.UNSIGNED_BYTE,staging);
    webglGlassStats.uploads++;
    // Atlas: stack each lens's output vertically in the shared drawing buffer.
    let atlasH=0,atlasW=1;
    for(const plan of plans){plan.slot=atlasH;atlasH+=plan.outH;atlasW=Math.max(atlasW,plan.outW);}
    if(g.canvas.width<atlasW||g.canvas.height<atlasH||g.canvas.width>2*atlasW+64||g.canvas.height>2*atlasH+64){g.canvas.width=bucket(atlasW);g.canvas.height=bucket(atlasH);}
    const H=g.canvas.height,u=g.uniforms;
    gl.bindVertexArray(g.vao);gl.useProgram(g.program);
    gl.viewport(0,0,g.canvas.width,H);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4f(u.u_crop,cx0,cy0,cx1-cx0,cy1-cy0);
    gl.uniform2f(u.u_texRange,stW/g.texW,stH/g.texH);
    gl.uniform2f(u.u_texel,1/g.texW,1/g.texH);
    gl.uniform2f(u.u_source,back.width,back.height);
    for(const plan of plans){
      gl.viewport(0,H-plan.slot-plan.outH,plan.outW,plan.outH);
      gl.uniform4f(u.u_rect,plan.x,plan.y,plan.w,plan.h);
      gl.uniform1f(u.u_radius,plan.preset.radius);gl.uniform1f(u.u_band,plan.preset.band);gl.uniform1f(u.u_bend,plan.preset.bend);
      gl.uniform1f(u.u_softness,plan.preset.softness);gl.uniform1f(u.u_saturation,plan.preset.saturation);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
    // Copy in the same task: the drawing buffer is not preserved.
    for(const plan of plans){
      const {lens}=plan;
      if(!lens.ctx){setActive(lens,false);continue;}
      if(lens.output.width!==plan.outW||lens.output.height!==plan.outH){lens.output.width=plan.outW;lens.output.height=plan.outH;}
      lens.ctx.globalCompositeOperation='copy';
      lens.ctx.drawImage(g.canvas,0,plan.slot,plan.outW,plan.outH,0,0,plan.outW,plan.outH);
      // Where the lens is not fully backed by opaque canvas pixels, the CSS blur stays on under it.
      const partial=!(plan.inside&&group.opaque);
      if(lens.surface.hasAttribute('data-glass-partial')!==partial)lens.surface.toggleAttribute('data-glass-partial',partial);
      setActive(lens,true);
    }
  }catch{
    // A tainted or lost source cannot be refracted; keep the CSS material.
    group.lost=true;deactivate(group);webglGlassStats.failures++;return;
  }
  webglGlassStats.frames++;
  const cost=performance.now()-started;webglGlassStats.lastCpuMs=cost;webglGlassStats.cpuMs+=cost;
}

/** Ask the game for its current frame (e.g. paused board, moved sheet). Coalesced per task. */
function schedule(source:HTMLCanvasElement|null){
  if(!source)return;
  pending.add(source);
  if(flushQueued)return;
  flushQueued=true;
  queueMicrotask(()=>{
    flushQueued=false;
    const sources=[...pending];pending.clear();
    const now=performance.now();
    // A running game redraws within a frame anyway; only idle (paused) sources need a repaint.
    for(const s of sources){const g=groups.get(s);if(g&&now-g.lastFrame>100)try{requestGlassFrame(s);}catch{/* The lens waits for the game's next frame. */}}
  });
}

function join(lens:Lens,source:HTMLCanvasElement|null){
  if(lens.source===source)return;
  leave(lens);
  lens.source=source;
  if(!source)return;
  // Only a surface over a live source carries a lens layer.
  lens.attach();
  let group=groups.get(source);
  if(!group){
    const current=source;
    const lost=()=>{const g=groups.get(current);if(g){g.lost=true;deactivate(g);}};
    const restored=()=>{const g=groups.get(current);if(g){g.lost=false;schedule(current);}};
    current.addEventListener('webglcontextlost',lost);current.addEventListener('webglcontextrestored',restored);
    const offFrame=onGlassFrame(current,()=>{const g=groups.get(current);if(g)render(current,g);});
    const created:Group={lenses:new Set(),lost:false,lastFrame:-Infinity,opaqueKey:'',opaque:false,off:()=>{offFrame();current.removeEventListener('webglcontextlost',lost);current.removeEventListener('webglcontextrestored',restored);}};
    group=created;groups.set(source,group);
  }
  group.lenses.add(lens);schedule(source);
}
function leave(lens:Lens){
  const source=lens.source;lens.source=null;setActive(lens,false);
  if(!source)return;
  lens.detach();
  const group=groups.get(source);if(!group)return;
  group.lenses.delete(lens);
  if(!group.lenses.size){group.off();groups.delete(source);}
}
function resolveAll(){refreshPolicy();for(const lens of lenses)join(lens,lens.enabled&&allowed()?sourceFor(lens.surface):null);}
function startWatching(){
  if(unwatchSources)return;
  unwatchSources=watchGlassFrameSources(resolveAll);
  const queries=preferenceQueries(),classes=new MutationObserver(resolveAll);refreshPolicy();
  const sync=()=>{resolveAll();if(!allowed())deactivateAll();};
  for(const q of queries)q.addEventListener('change',sync);
  classes.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  const resize=()=>{for(const source of groups.keys())schedule(source);};
  const visibility=()=>{if(document.hidden)deactivateAll();else resize();};
  // A paused game draws nothing while a sheet or its ancestors settle, so redraw
  // once when any transition or animation ends, or a page/sheet scrolls.
  const moved=['transitionend','transitioncancel','animationend','animationcancel','scroll'] as const;
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);
  for(const name of moved)document.addEventListener(name,resize,{capture:true,passive:true});
  unwatchPreferences=()=>{for(const q of queries)q.removeEventListener('change',sync);classes.disconnect();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);for(const name of moved)document.removeEventListener(name,resize,true);};
}
function stopWatching(){if(lenses.size)return;unwatchSources?.();unwatchSources=null;unwatchPreferences?.();unwatchPreferences=null;}

function kindFor(surface:HTMLElement):LensKind{
  if(surface instanceof HTMLDialogElement||surface.matches('.ui-glass-sheet,.game-sheet-panel'))return 'sheet';
  const {offsetWidth:w,offsetHeight:h}=surface;
  return w&&h&&w<=52&&Math.abs(w-h)<4?'button':'dock';
}

/** Binds the shared lens to one surface. onActive reports when it is actually refracting. */
export function bindWebglLens(surface:HTMLElement,onActive:(active:boolean)=>void,kind?:LensKind):WebglLens{
  // A neutral element: control stylesheets hide or restyle their own spans.
  const wrapper=document.createElement('qcc-glass-lens');wrapper.className='ui-glass-gl';wrapper.setAttribute('aria-hidden','true');
  const output=document.createElement('canvas');wrapper.append(output);
  let disposed=false;
  const lens:Lens={surface,wrapper,output,ctx:null,kind:kind??'dock',enabled:false,active:false,source:null,onActive,attach:()=>{},detach:()=>{}};
  // A scrolling sheet carries its absolutely positioned children with its content.
  const refresh=()=>{
    if(!lens.enabled)return;
    const top=surface.scrollTop,left=surface.scrollLeft;
    wrapper.style.translate=top||left?`${left}px ${top}px`:'';
    schedule(lens.source);
  };
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(refresh):undefined;
  // A sheet drag moves the surface with inline style while the paused game draws nothing.
  const moved=new MutationObserver(refresh);
  lens.attach=()=>{
    lens.kind=kind??kindFor(surface);lens.ctx??=output.getContext('2d');
    if(wrapper.parentElement!==surface)surface.prepend(wrapper);
    resize?.observe(wrapper);surface.addEventListener('scroll',refresh,{passive:true});
    moved.observe(surface,{attributes:true,attributeFilter:['style','class']});
  };
  lens.detach=()=>{resize?.disconnect();moved.disconnect();surface.removeEventListener('scroll',refresh);wrapper.remove();};
  return{
    setEnabled(value){
      if(disposed||lens.enabled===value)return;
      lens.enabled=value;
      if(value){
        if(unavailable)return;
        lenses.add(lens);startWatching();join(lens,allowed()?sourceFor(surface):null);
      }else{
        leave(lens);lenses.delete(lens);stopWatching();
      }
    },
    dispose(){
      if(disposed)return;
      this.setEnabled(false);disposed=true;
    }
  };
}

/** Sheets are frosted: the CSS backdrop blur and dark tint carry them over a
 * live game too. A refracted lens copy would paint the game back sharp over the
 * blur, so sheets stay in the blur mode. */
export function bindSheetLens(surface:HTMLElement):()=>void{
  const previous=surface.dataset.glassMode;
  surface.dataset.glassMode='blur';
  return()=>{if(previous===undefined)delete surface.dataset.glassMode;else surface.dataset.glassMode=previous;};
}
