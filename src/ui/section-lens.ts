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
uniform vec4 samplePill;
uniform float pillOpacity;
uniform float pillLift;
uniform float pillPress;
uniform float pillMotion;
uniform float drawPad;
uniform float pillProjection;
in vec2 unit;
out vec4 color;

float capsuleRadius(vec2 bounds) {
  return min(bounds.x, bounds.y) * .5;
}
vec2 capsuleAxis(vec2 p, vec2 bounds) {
  vec2 halfLine = max(vec2(0.), (bounds - bounds.yx) * .5);
  return p - clamp(p, -halfLine, halfLine);
}
vec2 bendFace(vec2 pos) {
  vec2 p = pos - size * .5;
  float radius = capsuleRadius(size);
  float along = p.x / (size.x * .5);
  float across = p.y / radius;
  float across2 = across * across;
  float cap = capsuleAxis(p, size).x / radius;

  // Keep the center nearly affine and grow the bend toward the upper and lower rim.
  float rowBend = .08 + across2 * (.06 + .135 * across2);
  float cap2 = cap * cap;
  float shoulder = .35 * cap * cap2 * (1.5 - .5 * cap2);
  float x = p.x - radius * (along * rowBend + shoulder);
  float column = x / (size.x * .5);
  float y = p.y * (.83 - .12 * column * column - .08 * across2 * (1. + across2));
  return size * .5 + vec2(x, y);
}
vec3 frost(vec2 pos, float spread) {
  vec2 uv = region.xy + pos * region.zw;
  // Stagger the RGB samples to soften edges across angles.
  vec2 tapScale = region.zw * spread;
  vec2 nearX = vec2(1.50, .65) * tapScale;
  vec2 nearY = vec2(-.65, 1.50) * tapScale;
  vec2 farX = vec2(1.15, 3.05) * tapScale;
  vec2 farY = vec2(-3.05, 1.15) * tapScale;
  vec3 nearSamples = texture(scene, uv + nearX).rgb + texture(scene, uv - nearX).rgb
                   + texture(scene, uv + nearY).rgb + texture(scene, uv - nearY).rgb;
  vec3 farSamples = texture(scene, uv + farX).rgb + texture(scene, uv - farX).rgb
                  + texture(scene, uv + farY).rgb + texture(scene, uv - farY).rgb;
  return .16 * texture(scene, uv).rgb + .105 * (nearSamples + farSamples);
}
vec3 transmit(vec3 rgb, float transmission, float highlightCompression) {
  float luma = dot(rgb, vec3(.2126, .7152, .0722));
  // Keep the color of dark art and soften bright detail behind the white controls.
  float exposure = transmission / (1. + highlightCompression * max(0., luma - .27));
  return mix(vec3(luma), rgb, 1.10) * exposure;
}
vec3 glassColor(vec2 pos, float spread) {
  return transmit(frost(pos, spread), .98, .66);
}
vec3 rim(vec3 rgb, vec2 normal, float depth) {
  // C30's top and bottom specular edges, shaped by the capsule normal.
  float top = max(0., dot(normal, vec2(-.30, -.95)));
  float bottom = max(0., normal.y);
  float line = 1. - smoothstep(.3, 1.45, depth);
  return mix(rgb, vec3(1.), (.10 + .55 * top + .25 * bottom) * line);
}
vec3 pillSurface(vec3 sceneColor, vec2 normal, float pillDepth, float barDepth, float liftEdge, float y) {
  // Give the inset and exposed outline a bevel, and fade it at the join.
  float clearance = smoothstep(1., 4.5, barDepth - max(0., pillDepth));
  clearance = max(clearance, liftEdge * smoothstep(.4, 2.5, -barDepth));
  float top = max(0., dot(normal, vec2(-.30, -.95)));
  float bottom = max(0., normal.y);
  float line = 1. - smoothstep(.2, mix(1.85, 3.6, pillLift), pillDepth);
  float specular = mix(.06 + .36 * top + .13 * bottom, .46 * top + .10 * bottom, pillLift);
  // The raised lens keeps its lower bevel light so no dark seam forms under the art.
  float shade = (1. - smoothstep(.4, 5., pillDepth)) * (.25 + .75 * bottom) * (1. - pillLift);
  float inset = (1. - pillLift) * (1. - pillPress) * (.075 + .14 * smoothstep(-.5, .8, y));
  vec3 face = sceneColor * (1. - inset - .21 * shade * clearance);
  // First contact frosts the thumb: a brighter milky core with compressed contrast.
  float core = smoothstep(.5, 9., pillDepth);
  float faceLuma = dot(face, vec3(.2126, .7152, .0722));
  vec3 milk = mix(vec3(faceLuma), face, .55) * .62 + vec3(.34);
  face = mix(face, milk, pillPress * (.55 + .35 * core));
  return mix(face, vec3(1.), specular * line * clearance);
}
void main() {
  vec2 pos = unit * (size + 2. * drawPad) - drawPad;
  vec2 p = pos - size * .5;
  vec2 axis = capsuleAxis(p, size);
  float radius = capsuleRadius(size);
  float depth = radius - length(axis);
  float coverage = smoothstep(-.5, .5, depth);

  vec2 pp = pos - pill.xy;
  vec2 pillAxis = capsuleAxis(pp, pill.zw);
  float pillRadius = capsuleRadius(pill.zw);
  float pillDepth = pillRadius - length(pillAxis);
  float selected = pillOpacity * smoothstep(-.5 - .6 * pillLift, .5 + .6 * pillLift, pillDepth);
  float liftEdge = smoothstep(0., .25, pillProjection);
  if (coverage <= 0. && selected * liftEdge <= 0.) {
    color = vec4(0.);
    return;
  }

  vec2 normal = axis / max(length(axis), .001);
  vec2 body = bendFace(pos);
  vec3 bodyColor = glassColor(body, 1.);
  vec3 rgb = rim(bodyColor, normal, depth);

  if (pillOpacity > 0.) {
    // The soft contact shadow moves down as the selection lifts and fades at the bar edge.
    vec2 shadowPos = pp - vec2(0., mix(1.25, 3.5, pillLift));
    float shadowDepth = pillRadius - length(capsuleAxis(shadowPos, pill.zw));
    float shadow = smoothstep(-3.5, 0., shadowDepth) * smoothstep(1.5, 4.5, depth)
                   * smoothstep(-.15, .60, pp.y / pillRadius);
    rgb *= 1. - pillOpacity * shadow * mix(.12, .16, pillLift) * (1. - pillPress);
    if (selected > 0.) {
      // A settled selection uses the exact same scene sample as the bar.
      vec3 selectionColor = bodyColor;
      if (pillMotion > 0.) {
        // Project the visible capsule into the active lens's sampling footprint.
        vec2 sampleOffset = pp / pill.zw * samplePill.zw;
        vec2 sampleAxis = capsuleAxis(sampleOffset, samplePill.zw);
        vec2 radial = sampleAxis / capsuleRadius(samplePill.zw);
        vec2 focused = .71 * sampleOffset - sampleAxis * (.19 + .155 * dot(radial, radial));
        // Keep the exposed crest focused on the scene under the bar. The side and
        // lower bevels draw detail in from the outer part of the same footprint.
        float bevel = smoothstep(.55, .98, length(radial)) * smoothstep(-1., -.4, radial.y);
        vec2 warped = samplePill.xy + mix(focused, sampleOffset, bevel);
        // Keep color edges legible after the lens magnifies the frosted scene.
        selectionColor = glassColor(mix(body, warped, pillMotion), mix(1., .67, pillMotion));
      }
      vec2 pillNormal = pillAxis / max(length(pillAxis), .001);
      vec3 selection = pillSurface(selectionColor, pillNormal, pillDepth, depth, liftEdge, pp.y / pillRadius);

      // The selected surface owns the covered rim. Blend coverage in
      // premultiplied alpha so the two outlines meet as one contour.
      float bodyWeight = coverage * (1. - selected);
      float pillWeight = selected * mix(coverage, 1., liftEdge);
      color = vec4(bodyWeight * rgb + pillWeight * selection, bodyWeight + pillWeight);
      return;
    }
  }
  color = vec4(rgb * coverage, coverage);
}`;

type Geometry = {
  bar:DOMRect; crop:Crop; pill:number[]; samplePill:number[]; opacity:number; lift:number; press:number;
  motion:number; pad:number; projection:number; density:number;
};

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
  const size = uniform('size'), region = uniform('region'), pill = uniform('pill');
  const samplePill = uniform('samplePill');
  const opacity = uniform('pillOpacity'), lift = uniform('pillLift'), press = uniform('pillPress');
  const motion = uniform('pillMotion'), drawPad = uniform('drawPad'), projection = uniform('pillProjection');
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
      gl.uniform4fv(samplePill,geometry.samplePill);
      gl.uniform1f(opacity,geometry.opacity);
      gl.uniform1f(lift,geometry.lift);
      gl.uniform1f(press,geometry.press);
      gl.uniform1f(motion,geometry.motion);
      gl.uniform1f(drawPad,geometry.pad);
      gl.uniform1f(projection,geometry.projection);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    },
  };
}

function smoothstep(value:number) {
  const t = Math.min(1,Math.max(0,value));
  return t * t * (3 - 2 * t);
}

function geometryOf(element:HTMLElement, pillAnimating:boolean):Geometry|null {
  const bar = element.getBoundingClientRect();
  if (!bar.width || !bar.height || bar.top>=innerHeight || bar.bottom<=0) return null;
  // The field bends inward. A small margin retains frost taps and edge antialiasing.
  const cropPad = 8;
  const x = Math.max(0,Math.floor(bar.left)-cropPad), y = Math.max(0,Math.floor(bar.top)-cropPad);
  const width = Math.min(innerWidth,Math.ceil(bar.right)+cropPad)-x;
  const height = Math.min(innerHeight,Math.ceil(bar.bottom)+cropPad)-y;
  if (width<=0 || height<=0) return null;
  const style = getComputedStyle(element,'::after');
  const w = parseFloat(style.width)||0, h = parseFloat(style.height)||0;
  const shiftX = parseFloat(style.translate)||0;
  const [scaleX,scaleY=scaleX] = style.scale==='none'?[1]:style.scale.split(' ').map(Number);
  const sx = bar.width/element.offsetWidth, sy = bar.height/element.offsetHeight;
  const pill = [(shiftX+(parseFloat(style.left)||0)+w/2)*sx,((parseFloat(style.top)||0)+h/2)*sy,w*scaleX*sx,h*scaleY*sy];
  // Read the already-animated press area. Selection stretch peaks at 1.062.
  // A held press and the stretched scrub both stay above 1.25.
  const lift = Math.min(1, Math.max(0, (scaleX * scaleY - 1.07) / .18));
  const opacity = w&&h?Number(style.opacity):0;
  const [cx,cy,pillWidth,pillHeight] = pill;
  // Leave room for the adjacent menu even when a scrub reaches the outer tab.
  const sideRoom = Math.min(cx,bar.width-cx) + 6 - pillWidth/2;
  const expanded = opacity > 0 && bar.width >= 2 * bar.height &&
    element.dataset.hidden !== 'true' && element.dataset.minimized !== 'true';
  // A held press only widens the pill. Drag stretch grows scaleX past the press
  // scale, so the raised lens builds with travel and falls back the same way on release.
  const rise = smoothstep((scaleX - 1.1) / .18);
  // Use the animated scale through release as well as during the press.
  const projection = expanded ? smoothstep(lift) * rise * smoothstep(sideRoom/2) : 0;
  const settledX = (parseFloat(style.getPropertyValue('--ui-pill-x')) || 0) -
    (parseFloat(style.getPropertyValue('--section-pill-bleed')) || 0);
  // Transition progress comes from the resolved pseudo-element geometry, so
  // release and selection slides return to zero without an extra clock.
  const travel = Math.abs(shiftX-settledX);
  const scale = Math.max(Math.abs(scaleX-1),Math.abs(scaleY-1));
  const moving = expanded && (pillAnimating || element.hasAttribute('data-pressing'));
  // First contact refracts only a little; magnification arrives with the raised lens.
  const motion = moving ? Math.min(1,Math.max(lift,travel/24,scale*7)) * (.18 + .82 * rise) : 0;
  const press = expanded ? lift * (1 - rise) : 0;
  // The frosted thumb reads about 1.15 times wider than the resting pill.
  const pressWidth = 1 + .045 * press;
  const stretch = Math.min(1,Math.max(0,(1.14-scaleY)/.16));
  // Keep the active sample centered on the bar as the visible capsule flattens and rises.
  const samplePill = projection > 0 ? [
    cx,
    cy + projection * (bar.height/2 - cy),
    pillWidth + projection * Math.min(8,2*sideRoom),
    pillHeight + projection * (bar.height + 8 - 3*stretch - pillHeight),
  ] : pill;
  const raisedHeight = bar.height - 8;
  const raisedWidth = Math.min(pillWidth + 2 * sideRoom, Math.max(pillWidth, raisedHeight * (1.36 + .29 * stretch)));
  const drawnPill = projection > 0 || press > 0 ? [
    cx,
    cy + projection * (raisedHeight/2 - 2.5 - cy),
    pillWidth * pressWidth + projection * (raisedWidth - pillWidth * pressWidth),
    pillHeight + projection * (raisedHeight - pillHeight),
  ] : pill;
  const pad = projection > 0 ? 8 : 0;
  return {bar,crop:{x,y,width,height},pill:drawnPill,samplePill,opacity,lift:lift*rise,press,motion,pad,projection,density:Math.min(1.5,devicePixelRatio)};
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
    const animations = bar.getAnimations({subtree:true}).filter(animation=>animation.playState==='running');
    const pillAnimating = animations.some(animation=>(animation.effect as KeyframeEffect|null)?.pseudoElement==='::after');
    const geometry = geometryOf(bar,pillAnimating);
    if (!geometry) {
      fallback();
      listenToSource(null);
      return;
    }
    const {crop,density,pad} = geometry;
    const anchor = root.getBoundingClientRect();
    const nextTexture = [anchor.x,anchor.y,crop.x,crop.y,crop.width,crop.height,density].join(',');
    const nextRender = [geometry.bar.x,geometry.bar.y,geometry.bar.width,geometry.bar.height,
      ...geometry.pill,...geometry.samplePill,geometry.opacity,geometry.lift,geometry.press,geometry.motion,pad,geometry.projection].join(',');
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
        // Match the viewport pad to each axis of the CSS box.
        canvas.style.setProperty('--section-lens-pad-x',pad ? `${100*pad/geometry.bar.width}%` : '');
        canvas.style.setProperty('--section-lens-pad-y',pad ? `${100*pad/geometry.bar.height}%` : '');
        const width = Math.ceil((geometry.bar.width+2*pad)*density);
        const height = Math.ceil((geometry.bar.height+2*pad)*density);
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
    if (animations.length) schedule();
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
