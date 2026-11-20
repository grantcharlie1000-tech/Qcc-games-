import {onGlassFrame,requestGlassFrame,watchGlassFrameSources} from './glass-frame-source';
import {createSectionBackdrop} from './section-backdrop';
import type {Crop} from './section-backdrop';

const VERTEX = `#version 300 es
out vec2 unit;
void main() {
  unit = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  gl_Position = vec4(unit * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform vec2 size;
uniform vec4 region;
uniform vec4 pill;
uniform float pillOpacity;
in vec2 unit;
out vec4 color;

float capsuleRadius(vec2 bounds) {
  return min(bounds.x, bounds.y) * .5;
}
vec2 capsuleAxis(vec2 p, vec2 bounds) {
  vec2 halfLine = max(vec2(0.), (bounds - bounds.yx) * .5);
  return p - clamp(p, -halfLine, halfLine);
}
vec3 backdrop(vec2 pos, float frost) {
  vec2 uv = region.xy + pos * region.zw;
  vec2 step = frost * region.zw;
  return .60 * texture(scene, uv).rgb + .10 * (
    texture(scene, uv + vec2(step.x, 0.)).rgb + texture(scene, uv - vec2(step.x, 0.)).rgb +
    texture(scene, uv + vec2(0., step.y)).rgb + texture(scene, uv - vec2(0., step.y)).rgb);
}
vec3 transmit(vec3 rgb, float transmission) {
  float luma = dot(rgb, vec3(.2126, .7152, .0722));
  // Keep the color of dark art and soften bright detail behind the white controls.
  float exposure = transmission / (1. + 1.30 * max(0., luma - .27));
  return mix(vec3(luma), rgb, 1.10) * exposure;
}
vec3 rim(vec3 rgb, vec2 normal, float depth) {
  float light = dot(normal, vec2(-.42, -.91));
  float key = smoothstep(-.08, .98, light);
  float line = 1. - smoothstep(.35, 1.45, depth);
  float sheen = (1. - smoothstep(.6, 4., depth)) * key;
  float shade = (1. - smoothstep(1., 4., depth)) * max(0., -light);
  return mix(rgb * (1. - .12 * shade), vec3(1.), (.09 + .49 * key) * line + .11 * sheen);
}
void main() {
  vec2 pos = unit * size;
  vec2 p = pos - size * .5;
  vec2 axis = capsuleAxis(p, size);
  float radius = capsuleRadius(size);
  float depth = radius - length(axis);
  float coverage = smoothstep(-.5, .5, depth);
  vec2 normal = axis / max(length(axis), .001);
  // A cylindrical face bends across the short axis and into both end caps.
  // The cubic term increases the bend near the rim, with zero slope at the spine.
  vec2 radial = axis / radius;
  vec2 body = pos - vec2(p.x * .055, 0.) - axis * (.29 + .18 * dot(radial, radial));
  vec3 rgb = rim(transmit(backdrop(body, 1.45), .94), normal, depth);

  if (pillOpacity > 0.) {
    vec2 pp = pos - pill.xy;
    vec2 pillAxis = capsuleAxis(pp, pill.zw);
    float pillRadius = capsuleRadius(pill.zw);
    float pillDepth = pillRadius - length(pillAxis);
    float selected = pillOpacity * smoothstep(-.5, .5, pillDepth);
    if (selected > 0.) {
      // Magnify the same scene about the animated pill center, with its own rim.
      vec2 pillRadial = pillAxis / pillRadius;
      vec2 lens = pos - pp * .36 - pillAxis * (.10 * dot(pillRadial, pillRadial));
      vec2 pillNormal = pillAxis / max(length(pillAxis), .001);
      vec3 selection = rim(transmit(backdrop(lens, .9), 1.) + .014, pillNormal, pillDepth);
      rgb = mix(rgb, selection, selected);
    }
  }
  color = vec4(rgb * coverage, coverage);
}`;

type Geometry = {bar:DOMRect; crop:Crop; pill:number[]; opacity:number; density:number};

function createRenderer(gl:WebGL2RenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error('Section lens program unavailable');
  for (const [type,source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Section lens shader unavailable');
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    gl.attachShader(program,shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||'Section lens link failed');
  gl.useProgram(program);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const uniform = (name:string)=>gl.getUniformLocation(program,name);
  const size = uniform('size'), region = uniform('region'), pill = uniform('pill'), opacity = uniform('pillOpacity');
  let width = 0, height = 0;
  return {
    upload(canvas:HTMLCanvasElement) {
      if (width===canvas.width && height===canvas.height) {
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
      } else {
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        if (gl.getError()!==gl.NO_ERROR) throw new Error('Section lens texture unavailable');
        width = canvas.width;
        height = canvas.height;
      }
    },
    draw(geometry:Geometry) {
      const {bar,crop} = geometry;
      gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
      gl.uniform2f(size,bar.width,bar.height);
      gl.uniform4f(region,(bar.x-crop.x)/crop.width,(bar.y-crop.y)/crop.height,1/crop.width,1/crop.height);
      gl.uniform4fv(pill,geometry.pill);
      gl.uniform1f(opacity,geometry.opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    },
  };
}

function geometryOf(element:HTMLElement):Geometry|null {
  const bar = element.getBoundingClientRect();
  if (!bar.width || !bar.height || bar.top>=innerHeight || bar.bottom<=0) return null;
  // The field bends inward. A small margin retains frost taps and edge antialiasing.
  const pad = 8;
  const x = Math.max(0,Math.floor(bar.left)-pad), y = Math.max(0,Math.floor(bar.top)-pad);
  const width = Math.min(innerWidth,Math.ceil(bar.right)+pad)-x;
  const height = Math.min(innerHeight,Math.ceil(bar.bottom)+pad)-y;
  if (width<=0 || height<=0) return null;
  const style = getComputedStyle(element,'::after');
  const w = parseFloat(style.width)||0, h = parseFloat(style.height)||0;
  const shiftX = parseFloat(style.translate)||0;
  const [scaleX,scaleY=scaleX] = style.scale==='none'?[1]:style.scale.split(' ').map(Number);
  const sx = bar.width/element.offsetWidth, sy = bar.height/element.offsetHeight;
  const pill = [(shiftX+(parseFloat(style.left)||0)+w/2)*sx,((parseFloat(style.top)||0)+h/2)*sy,w*scaleX*sx,h*scaleY*sy];
  return {bar,crop:{x,y,width,height},pill,opacity:w&&h?Number(style.opacity):0,density:Math.min(1.5,devicePixelRatio)};
}

/** Owns the section bar's GPU surface and the live updates for its backdrop. */
export function bindSectionLens(bar:HTMLElement, host:HTMLElement, scene:()=>HTMLElement|null):()=>void {
  const canvas = document.createElement('canvas');
  canvas.className = 'section-lens';
  canvas.setAttribute('aria-hidden','true');
  const display = canvas.getContext('2d');
  const renderCanvas = document.createElement('canvas');
  renderCanvas.className = canvas.className;
  const backdrop = createSectionBackdrop(invalidate);
  if (!display || !backdrop) return ()=>{};
  display.globalCompositeOperation = 'copy';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  let frame = 0, disposed = false, unavailable = false, lost = false;
  let rendered = '', texture = '', textureReady = false;
  let gl:WebGL2RenderingContext|null = null;
  let gpu:ReturnType<typeof createRenderer>|null = null;
  let root:HTMLElement|null = null;
  let source:HTMLCanvasElement|null = null;
  let releaseFrame:(()=>void)|undefined;

  function fallback() {
    bar.removeAttribute('data-section-lens');
    rendered = '';
  }
  function listenToSource(next:HTMLCanvasElement|null) {
    if (source===next) return;
    releaseFrame?.();
    source = next;
    releaseFrame = next ? onGlassFrame(next,()=>drawSectionLens(next)) : undefined;
  }
  function schedule() {
    if (root && !disposed && !frame && !document.hidden && !unavailable && !lost) {
      frame = requestAnimationFrame(drawSectionLens);
    }
  }
  function invalidate() {
    backdrop?.invalidate();
    texture = '';
    schedule();
  }
  const drawSectionLens = (tick:number|HTMLCanvasElement) => {
    if (typeof tick==='number') frame = 0;
    const live = typeof tick==='number'?undefined:tick;
    const hidden = bar.closest('[data-sheet-hidden]') ||
      (bar.dataset.hidden==='true' && !bar.parentElement?.querySelector(':focus-visible'));
    if (!backdrop || !root || disposed || document.hidden || unavailable || lost || hidden ||
        !bar.dataset.glass || bar.dataset.glass==='off' || motion.matches ||
        document.documentElement.classList.contains('reduce-motion')) {
      fallback();
      listenToSource(null);
      return;
    }
    const geometry = geometryOf(bar);
    if (!geometry) {
      fallback();
      listenToSource(null);
      return;
    }
    const {crop,density} = geometry;
    const anchor = root.getBoundingClientRect();
    const nextTexture = [anchor.x,anchor.y,crop.x,crop.y,crop.width,crop.height,density].join(',');
    const nextRender = [geometry.bar.x,geometry.bar.y,geometry.bar.width,geometry.bar.height,...geometry.pill,geometry.opacity].join(',');
    const changed = texture!==nextTexture || !!live;
    try {
      if (changed) {
        // Movies can have a hero or player outside the browse subtree.
        const coversCrop = root===host || anchor.top<=crop.y && anchor.bottom>=crop.y+crop.height;
        const result = coversCrop && backdrop.paint(root,root===host?document.documentElement:host,crop,density,live);
        if (result instanceof HTMLCanvasElement) {
          fallback();
          listenToSource(result);
          if (!live) requestGlassFrame(result);
          return;
        }
        if (!live) listenToSource(null);
        texture = nextTexture;
        textureReady = result;
        if (result) {
          if (!gpu) {
            gl = renderCanvas.getContext('webgl2',{antialias:false,depth:false,stencil:false,premultipliedAlpha:true});
            if (!gl) {
              unavailable = true;
              fallback();
              return;
            }
            gpu = createRenderer(gl);
          }
          gpu.upload(backdrop.canvas);
        }
      }
      if (!textureReady || !gpu) {
        fallback();
      } else if (changed || rendered!==nextRender || canvas.parentElement!==bar) {
        const width = Math.ceil(geometry.bar.width*density), height = Math.ceil(geometry.bar.height*density);
        if (canvas.width!==width || canvas.height!==height) {
          canvas.width = renderCanvas.width = width;
          canvas.height = renderCanvas.height = height;
          display.globalCompositeOperation = 'copy';
        }
        gpu.draw(geometry);
        // Present the WebGL buffer during its draw. WebKit can otherwise retain
        // the previous fixed-layer frame as the underlying page scrolls.
        display.drawImage(renderCanvas,0,0);
        if (canvas.parentElement!==bar) bar.prepend(canvas);
        bar.dataset.sectionLens = 'webgl';
        rendered = nextRender;
      }
    } catch (error) {
      fallback();
      listenToSource(null);
      backdrop.reset();
      textureReady = false;
      // Security errors are local to the crop. A later scroll may bring a
      // readable scene into view. Other setup or GPU errors leave CSS in charge.
      unavailable = !(error instanceof DOMException && error.name==='SecurityError') && !gl?.isContextLost();
    }
    if (bar.getAnimations({subtree:true}).some(animation=>animation.playState==='running')) schedule();
  };

  const resize = new ResizeObserver(invalidate);
  resize.observe(bar);
  const attributes = ['class','style','hidden','src','srcset','sizes','open','aria-pressed','aria-current',
    'data-glass','data-hidden','data-minimized','data-pressing','data-sheet-hidden'];
  const sceneChanges = new MutationObserver(invalidate);
  function refreshScene() {
    const next = scene();
    if (root===next) return;
    sceneChanges.disconnect();
    listenToSource(null);
    root = next;
    if (root) {
      sceneChanges.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
      resize.observe(host);
    } else {
      resize.unobserve(host);
      cancelAnimationFrame(frame);
      frame = 0;
      fallback();
    }
    invalidate();
  }
  const changes = new MutationObserver(records=>{
    const hostChanged = records.some(({target})=>target===host);
    if (hostChanged || records.some(({target,attributeName})=>target===bar && attributeName==='data-glass')) refreshScene();
    if (hostChanged || records.some(({target})=>target===document.documentElement || target===document.body)) invalidate();
    else schedule();
  });
  // Route renders replace the host's direct children. Only the current
  // paintable scene needs subtree updates.
  changes.observe(host,{childList:true,attributes:true,attributeFilter:attributes});
  changes.observe(bar,{childList:true,attributes:true,attributeFilter:attributes});
  changes.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','data-input']});
  changes.observe(document.body,{attributes:true,attributeFilter:['class']});
  if (bar.parentElement) changes.observe(bar.parentElement,{attributes:true,attributeFilter:['data-sheet-hidden']});

  const signal = events.signal;
  document.addEventListener('scroll',event=>{
    if (event.target===document || event.target===host) schedule();
    else if (root && event.target instanceof Node && host.contains(event.target)) invalidate();
  },{capture:true,passive:true,signal});
  for (const name of ['load','error','transitionrun','transitionend','animationstart','animationend','focusin','focusout']) {
    host.addEventListener(name,event=>{
      if (root && event.target instanceof Element && !event.target.closest('.section-navigation')) invalidate();
    },{capture:true,signal});
  }
  for (const name of ['transitionrun','transitionend','animationend','focusin','focusout']) {
    bar.parentElement?.addEventListener(name,schedule,{signal});
  }
  renderCanvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    lost = true;
    gpu = null;
    listenToSource(null);
    fallback();
  },{signal});
  renderCanvas.addEventListener('webglcontextrestored',()=>{
    lost = false;
    invalidate();
  },{signal});
  document.addEventListener('visibilitychange',invalidate,{signal});
  window.addEventListener('resize',invalidate,{signal});
  window.visualViewport?.addEventListener('resize',invalidate,{signal});
  motion.addEventListener('change',schedule,{signal});
  document.fonts?.addEventListener('loadingdone',invalidate,{signal});
  void document.fonts?.ready.then(()=>{if (!disposed) invalidate();});
  const unwatch = watchGlassFrameSources(()=>{
    if (source || root?.querySelector('canvas')) invalidate();
  });
  refreshScene();
  return ()=>{
    disposed = true;
    cancelAnimationFrame(frame);
    events.abort();
    changes.disconnect();
    sceneChanges.disconnect();
    resize.disconnect();
    listenToSource(null);
    unwatch();
    fallback();
    backdrop.dispose();
    canvas.remove();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
