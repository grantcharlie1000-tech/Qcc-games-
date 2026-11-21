import {onGlassFrame,requestGlassFrame,watchGlassFrameSources} from './glass-frame-source';
import {createSectionBackdrop} from './section-backdrop';
import type {Crop} from './section-backdrop';

// The frosted scene sample, shared by both stages.
const GLASS = `uniform sampler2D scene;
uniform vec4 region;
vec3 frost(vec2 pos, float spread) {
  vec2 uv = region.xy + pos * region.zw;
  // Stagger the RGB samples to soften edges across angles.
  vec2 tapScale = region.zw * spread;
  vec2 nearX = vec2(1.50, .65) * tapScale;
  vec2 nearY = vec2(-.65, 1.50) * tapScale;
  vec2 farX = vec2(1.15, 3.05) * tapScale;
  vec2 farY = vec2(-3.05, 1.15) * tapScale;
  vec3 nearSamples = textureLod(scene, uv + nearX, 0.).rgb + textureLod(scene, uv - nearX, 0.).rgb
                   + textureLod(scene, uv + nearY, 0.).rgb + textureLod(scene, uv - nearY, 0.).rgb;
  vec3 farSamples = textureLod(scene, uv + farX, 0.).rgb + textureLod(scene, uv - farX, 0.).rgb
                  + textureLod(scene, uv + farY, 0.).rgb + textureLod(scene, uv - farY, 0.).rgb;
  return .16 * textureLod(scene, uv, 0.).rgb + .105 * (nearSamples + farSamples);
}
vec3 transmit(vec3 rgb, float transmission, float highlightCompression, float saturation) {
  float luma = dot(rgb, vec3(.2126, .7152, .0722));
  // Keep the color of dark art and soften bright detail behind the white controls.
  float exposure = transmission / (1. + highlightCompression * max(0., luma - .27));
  return mix(vec3(luma), rgb, saturation) * exposure;
}
vec3 glassTone(vec3 frosted, float clarity) {
  // Like the owner's frosted Search bar: keep the backdrop colour and its shapes
  // faintly legible, but lift them toward a light grey with compressed contrast.
  // The dragged lens clears into the owner's neutral, dark clear glass: no grey veil, no
  // added saturation and no lift, so each pixel keeps the colour of the content under it
  // and the lens takes on none of the backdrop's average colour.
  vec3 rgb = transmit(frosted, mix(.98, .80, clarity), mix(.66, .28, clarity), mix(1.10, 1., clarity));
  return mix(vec3(.44), rgb, mix(.64, 1., clarity));
}
vec3 glassColor(vec2 pos, float spread, float clarity) {
  return glassTone(frost(pos, spread * .5), clarity);
}
vec3 glassColor(vec2 pos, float spread) {
  return glassColor(pos, spread, 0.);
}`;

const VERTEX = `#version 300 es
precision highp float;
uniform vec4 pill;
uniform float pillPress;
${GLASS}
out vec2 unit;
flat out float milkTone;
void main() {
  unit = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  gl_Position = vec4(unit * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
  // Average the frosted scene over the pressed thumb for one even milky tone. It
  // depends only on uniforms, so it runs once per vertex, not at every thumb pixel.
  milkTone = 0.;
  if (pillPress > 0.) {
    for (int i = 0; i < 9; i++) {
      vec2 tap = vec2(float(i % 3) - 1., float(i / 3) - 1.) * vec2(.32, .26) * pill.zw;
      milkTone += dot(glassColor(pill.xy + tap, 1.), vec3(.2126, .7152, .0722));
    }
    milkTone = .62 + .4 * milkTone / 9.;
  }
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 size;
uniform vec4 pill;
uniform vec4 samplePill;
uniform float pillOpacity;
uniform float pillLift;
uniform float pillPress;
uniform float pillSmoke;
uniform float pillMotion;
uniform float drawPad;
uniform float pillProjection;
${GLASS}
const float BODY_SPREAD = 2.4;
// The field fade below takes about a fifth of a 9 px stripe's colour, so the stripe's own keep
// rises to hold it near its old .70.
const float SMOKE_SLOPE = 1., SMOKE_DROP = .045, SMOKE_CHROMA = .86;
// Coring fades chroma below .13 (about half a saturated 9 px stripe's), so dull fields
// grey out but a stripe keeps its width at half height.
const vec2 SMOKE_CORE = vec2(.09, .13);
// C30's even smoke over large card areas: a wide field sample (fieldColor: four taps of a mip
// level about FIELD_TEXEL css px a texel, about 10 css px out) tells broad colour from a narrow mark. Colour the field shares with the pixel fades by
// SMOKE_FIELD (teal and mustard card art), while a 9 px stripe, mostly absent from the field,
// keeps its hue. Only dull colour fades (spread below about .45): a vivid field such as a
// pure red or green panel still reads through at full strength. Bright detail also sinks a little toward the darker field, so blurred titles
// stay quiet, and broad bright art, which the field shares, still lifts the bar.
const float SMOKE_FIELD = .45, SMOKE_EVEN = .3, FIELD_TEXEL = 16. / 3.;
// The field's taps, in css px: the frost's near ring at spread 6, so a 9 px stripe keeps about
// two fifths of its colour in the field, as with the earlier nine-tap field.
const vec2 FIELD_TAP_X = vec2(9., 3.9), FIELD_TAP_Y = vec2(-3.9, 9.);
// The frost taps reach about 1 css px past a sample; keep the rim's furthest one this far inside the crop.
const float RIM_SLACK = 2.;
// The raised lens is a capsule of clear glass whose height field comes from its SDF: flat
// across the face, which magnifies evenly by LENS_ZOOM, then rolling off as 1 - u^3 across a
// soft bevel LENS_BEVEL css px wide (u runs 0 at the face to 1 at the edge). The canvas is
// drawn at device density, so the bevel spans LENS_BEVEL * DPR device px. Its slope, and so
// its normal, grows as u^2: the face meets the bevel without a seam.
const float LENS_ZOOM = 1.36, LENS_BEVEL = 14., LENS_SLOPE = 2.4;
// Like thick glass, the bevel bends each ray toward the centre along its normal, so content
// swells, bends and stretches as it enters the rim. The pull (in bevels) stays under the fold,
// where it would turn the mapping back on itself: 2 * pull < 1 / LENS_ZOOM.
const float LENS_PULL = .26;
// Like the owner's thumb, each end of the lens is a dome: its vertical magnification climbs as
// (1 - d / LENS_SWELL_SPAN)^3 over the last LENS_SWELL_SPAN css px before the end (d is the
// distance to the end), to 1 / (1 - LENS_SWELL) times the face's at the very end. A track or
// card seam thickens and curves away from the centre line as it enters, then settles to the
// even face. It only draws samples toward the centre, so the furthest sample is unchanged.
const float LENS_SWELL = .33, LENS_SWELL_SPAN = 8.;
// The raised lens is neutral, dark clear glass: dull colour under it (a navy or teal card,
// chroma spread below about .2) loses LENS_NEUTRAL of its saturation, so the lens never takes on
// the backdrop's cast, while a vivid mark (spread above about .32) keeps its hue and stays
// legible. The bevel lighting sits on top.
const float LENS_NEUTRAL = .35, LENS_NEUTRAL_DIM = .06;
const vec2 LENS_NEUTRAL_VIVID = vec2(.2, .32);
in vec2 unit;
flat in float milkTone;
out vec4 color;

// C30's smoked frost: a neutral grey that keeps only part of the art's colour, so card
// colours behind the bar stay quiet. Its tone still follows the scene, so a bright backdrop
// lifts the bar as before. Motion clears it toward the lens.
vec3 smoked(vec3 frosted, float motion, vec3 field) {
  float luma = dot(frosted, vec3(.2126, .7152, .0722));
  vec3 chroma = frosted - luma;
  float fieldLuma = dot(field, vec3(.2126, .7152, .0722));
  vec3 fieldChroma = field - fieldLuma;
  // Dark tones sink and bright art still lifts the bar, so the slope stays near one.
  float tone = mix(SMOKE_SLOPE * mix(luma, min(luma, fieldLuma), SMOKE_EVEN) - SMOKE_DROP, luma, motion);
  // Core the colour: broad, dull fields (teal, mustard card art) fade toward grey, while a
  // saturated mark keeps most of its hue.
  float spread = max(chroma.r, max(chroma.g, chroma.b)) - min(chroma.r, min(chroma.g, chroma.b));
  float shared = clamp(length(fieldChroma) / max(length(chroma), .001), 0., 1.) * (1. - smoothstep(.3, .45, spread));
  float keep = mix(SMOKE_CHROMA * smoothstep(SMOKE_CORE.x, SMOKE_CORE.y, spread) * (1. - SMOKE_FIELD * shared), 1., motion);
  return vec3(tone) + chroma * keep;
}
// A bilinear tap of mip level L reads base texels up to 1.5 * 2^L away, so the field's reach is
// its furthest tap offset (9 css px on each axis) plus that, at every density. Its centre is held
// that far, plus RIM_SLACK, inside the crop, so it never reads the clamped edge where the
// viewport clips the crop margin.
vec3 fieldColor(vec2 pos) {
  float density = float(textureSize(scene, 0).x) * region.z;
  float lod = log2(FIELD_TEXEL * density);
  float reach = 9. + 1.5 * exp2(ceil(lod - .01)) / density + RIM_SLACK;
  vec2 lo = -region.xy / region.zw + reach;
  vec2 hi = max(lo, (1. - region.xy) / region.zw - reach);
  vec2 uv = region.xy + clamp(pos, lo, hi) * region.zw;
  vec2 tapX = FIELD_TAP_X * region.zw, tapY = FIELD_TAP_Y * region.zw;
  vec3 rgb = textureLod(scene, uv + tapX, lod).rgb + textureLod(scene, uv - tapX, lod).rgb
           + textureLod(scene, uv + tapY, lod).rgb + textureLod(scene, uv - tapY, lod).rgb;
  return glassTone(rgb * .25, 0.);
}
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
vec3 rim(vec3 rgb, vec2 normal, float depth, float liftEdge) {
  // C30's top and bottom specular edges, shaped by the capsule normal. At rest the band runs
  // about 2.4 px deep so it reads as C30's rim; under the raised lens it narrows to 1.25 px,
  // which keeps the bar's glass in the lens's top gap dark.
  float top = max(0., dot(normal, vec2(-.30, -.95)));
  float bottom = max(0., normal.y);
  float line = 1. - smoothstep(.25, mix(2.4, 1.25, liftEdge), depth);
  return mix(rgb, vec3(1.), (.10 + .62 * top + .25 * bottom) * line);
}
float lensBevel(float radius) {
  return min(LENS_BEVEL, .6 * radius);
}
// The raised lens's surface, lit from the same bevel normal that refracts it: a broad soft
// lit band along the top, a softer dark band along the bottom and a little darkening all
// round where the glass tilts away. The light on the outermost px is held to about half, then
// climbs over 7 px to a broad band about 5 px in: the top edge still reads clearly brighter
// than the bar beside it, through a transition about 4.5 px wide, never a bright 1 px outline.
vec3 lensFace(vec3 sceneColor, vec2 outward, float pillDepth, float u) {
  vec3 normal = normalize(vec3(outward * LENS_SLOPE * u * u, 1.));
  float facing = dot(normal.xy, normalize(vec2(-.25, -1.)));
  float lit = max(0., facing) * (.45 + .55 * smoothstep(0., 7., pillDepth));
  float shade = max(0., -facing);
  vec3 face = sceneColor * (1. - .45 * shade - .2 * (1. - normal.z));
  return mix(face, vec3(1.), .9 * lit);
}
vec3 pillSurface(vec3 sceneColor, vec2 normal, float pillDepth, float barDepth, float liftEdge, float y, float milkTone) {
  // Give the inset and exposed outline a bevel, and fade it at the join.
  float clearance = smoothstep(1., 4.5, barDepth - max(0., pillDepth));
  clearance = max(clearance, liftEdge * smoothstep(.4, 2.5, -barDepth));
  float top = max(0., dot(normal, vec2(-.30, -.95)));
  float bottom = max(0., normal.y);
  float line = 1. - smoothstep(.2, mix(1.85, 1.6, pillLift), pillDepth);
  // A held press keeps only a faint edge so the thumb reads as one milky piece, not a ring.
  // The raised slab catches a crisp top highlight; its lower edge keeps only a hairline.
  float specular = mix(.06 + .36 * top + .13 * bottom, .62 * top * top + .05 * bottom, pillLift) * (1. - .8 * pillPress);
  // The raised lens keeps its lower bevel light so no dark seam forms under the art.
  float shade = (1. - smoothstep(.4, 5., pillDepth)) * (.25 + .75 * bottom) * (1. - pillLift) * (1. - pillPress);
  float inset = (1. - pillLift) * (1. - pillPress) * (.075 + .14 * smoothstep(-.5, .8, y));
  // The dark theme's resting selection is a smoked capsule, as in C30, with a crisp lower rim.
  float smoke = pillSmoke * (1. - pillLift) * (1. - pillPress);
  vec3 face = sceneColor * (1. - inset - .21 * shade * clearance) * (1. - .30 * smoke);
  specular += smoke * .24 * bottom;
  // First contact turns the thumb one solid, even light-grey milk, as in the owner's
  // press: the tone follows the average scene under it, so no art or dome shows. Like the
  // owner's thumb it is milky glass, not paint: a hairline catches the light at the rim and
  // a little of the scene shows through just inside it.
  float pressRim = smoothstep(-.2, .5, pillDepth) * (1. - smoothstep(1., 2., pillDepth));
  float pressRing = (1. - smoothstep(1.2, 4.5, pillDepth)) * (1. - pressRim);
  face = mix(face, vec3(milkTone), (.985 - .10 * pressRing) * pillPress);
  face = mix(face, vec3(1.), .16 * pressRim * pillPress * clearance);
  // Like the owner's dragged thumb, the raised slab is a lighter, slightly milky glass.
  face = mix(face, vec3(.80), .07 * pillLift);
  // A thin dark inner shadow runs along its lower edge, under the bottom hairline, and the
  // refractive band darkens a little all round so the slab reads as thick glass.
  float inner = 1. - smoothstep(1., 6.5, pillDepth);
  face *= 1. - pillLift * inner * (.08 + .40 * bottom * bottom);
  // A bright gloss sits just inside the slab's top edge, like the owner's thumb.
  float gloss = pillLift * top * top * (1. - smoothstep(.8, 4., pillDepth));
  return mix(mix(face, vec3(1.), specular * line * clearance), vec3(1.), .45 * gloss * clearance);
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
  // The pressed thumb and the raised slab keep a crisp glass edge, as the owner's do.
  float soft = .5 + .9 * pillLift + .6 * pillPress;
  float selected = pillOpacity * smoothstep(-soft, soft, pillDepth);
  float liftEdge = smoothstep(0., .25, pillProjection);
  if (coverage <= 0. && selected * liftEdge <= 0.) {
    color = vec4(0.);
    return;
  }

  vec2 normal = axis / max(length(axis), .001);
  vec2 body = bendFace(pos);
  // C30's smoked frost: a wider blur and a darker, flatter grey so titles behind
  // the bar do not read.
  vec3 field = fieldColor(body);
  // As in C30, a band at the rim refracts: it draws in what lies past the edge and
  // bends it along the curve, while the centre stays flat under the grey frost.
  float band = 1. - smoothstep(0., 12., depth);
  // The rim band draws its own sample, so the body sample is taken only where it shows:
  // inside the band or under a settled selection.
  vec3 bodyColor = band <= 0. || selected > 0. && pillMotion <= 0. ? smoked(glassColor(body, BODY_SPREAD), 0., field) : vec3(0.);
  vec2 bent = body + normal * 12. * band * band;
  // The band's frost eases into the centre's wider blur, so no contour shows where it ends.
  vec3 rgb = rim(band > 0. ? smoked(glassColor(bent, mix(BODY_SPREAD, 1., band)), 0., field) : bodyColor, normal, depth, liftEdge);

  if (pillOpacity > 0.) {
    // The soft contact shadow moves down as the selection lifts and fades at the bar edge.
    vec2 shadowPos = pp - vec2(0., mix(1.25, 2., pillLift));
    float shadowDepth = pillRadius - length(capsuleAxis(shadowPos, pill.zw));
    // The raised lens casts a wider, softer shadow, like the owner's dragged thumb.
    // Under the raised lens it is a soft outer shadow all round, deepest below.
    float below = mix(smoothstep(-.15, .60, pp.y / pillRadius), .4 + .6 * smoothstep(-.6, .8, pp.y / pillRadius), pillLift);
    float shadow = smoothstep(-mix(3.5, 7., pillLift), 0., shadowDepth) * smoothstep(1.5, 4.5, depth) * below;
    rgb *= 1. - pillOpacity * shadow * mix(.12, .22, pillLift) * (1. - pillPress);
    if (selected > 0.) {
      // A settled selection uses the exact same scene sample as the bar.
      vec3 selectionColor = bodyColor;
      if (pillMotion > 0.) {
        // Magnify evenly like native: one scale across the whole face, centred on
        // the active sample. Only a narrow band at the edge refracts, drawing in
        // what lies just past the lens, the same all round so the ends never curl.
        vec2 outward = pillAxis / max(length(pillAxis), .001);
        // A narrow bevel: a quarter-circle profile, so the content in the last few pixels
        // compresses hard and bends along the rim while the face inside it stays flat.
        float bevel = min(12., .45 * pillRadius);
        float edge = clamp(1. - pillDepth / bevel, 0., .985);
        // The rim's furthest sample must stay inside the backdrop crop, or CLAMP_TO_EDGE repeats
        // its edge column as a streak. Where the viewport clips the crop (an outer tab, the
        // screen bottom), scale the whole rim push down for this frame, the same at every
        // pixel, so the mapping never folds and the edge is never sampled.
        float reach = bevel * 2.6 * (1. - sqrt(1. - .985 * .985));
        vec2 lo = -region.xy / region.zw + RIM_SLACK, hi = (1. - region.xy) / region.zw - RIM_SLACK;
        vec2 core = pill.zw * .5 / 1.36;
        vec2 room = min(samplePill.xy - core - lo, hi - samplePill.xy - core);
        vec2 fit = clamp(room / max(reach, .001), 0., 1.);
        vec2 pressWarp = samplePill.xy + pp / 1.36 + outward * fit * reach * (1. - sqrt(1. - edge * edge)) / (1. - sqrt(1. - .985 * .985));
        // The raised lens refracts through its bevel instead (LENS_PULL): inward only, so its
        // furthest sample is the face's own edge, pill.zw / 2 / LENS_ZOOM from the active sample.
        float u = 1. - clamp(pillDepth / lensBevel(pillRadius), 0., 1.);
        float swell = 1. - clamp((pill.z * .5 - abs(pp.x)) / LENS_SWELL_SPAN, 0., 1.);
        vec2 lensWarp = samplePill.xy + pp * vec2(1., 1. - LENS_SWELL * swell * swell * swell) / LENS_ZOOM
                      - outward * LENS_PULL * lensBevel(pillRadius) * u * u;
        vec2 warped = mix(pressWarp, lensWarp, pillLift);
        // Keep color edges legible after the lens magnifies the frosted scene. The bar's
        // smoke and wider frost return as motion falls, so the last moving frame is the rest pill.
        selectionColor = smoked(glassColor(mix(body, warped, pillMotion), mix(BODY_SPREAD, .67, pillMotion), pillMotion * pillLift), pillMotion, field);
        // Neutral smoke in the raised lens; it falls with the motion, so the rest pill is unchanged.
        float neutral = pillMotion * pillLift;
        float lensLuma = dot(selectionColor, vec3(.2126, .7152, .0722));
        float lensSpread = max(selectionColor.r, max(selectionColor.g, selectionColor.b)) - min(selectionColor.r, min(selectionColor.g, selectionColor.b));
        float dull = 1. - smoothstep(LENS_NEUTRAL_VIVID.x, LENS_NEUTRAL_VIVID.y, lensSpread);
        selectionColor = mix(selectionColor, vec3(lensLuma), LENS_NEUTRAL * dull * neutral) * (1. - LENS_NEUTRAL_DIM * neutral);
      }
      vec2 pillNormal = pillAxis / max(length(pillAxis), .001);
      vec3 selection = pillSurface(selectionColor, pillNormal, pillDepth, depth, liftEdge, pp.y / pillRadius, milkTone);
      float lensU = 1. - clamp(pillDepth / lensBevel(pillRadius), 0., 1.);
      selection = mix(selection, lensFace(selectionColor, pillNormal, pillDepth, lensU), pillLift);

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
  bar:DOMRect; crop:Crop; pill:number[]; samplePill:number[]; opacity:number; lift:number; press:number; smoke:number;
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
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const uniform = (name:string)=>gl.getUniformLocation(program,name);
  const size = uniform('size'), region = uniform('region'), pill = uniform('pill');
  const samplePill = uniform('samplePill');
  const opacity = uniform('pillOpacity'), lift = uniform('pillLift'), press = uniform('pillPress'), smoke = uniform('pillSmoke');
  const motion = uniform('pillMotion'), drawPad = uniform('drawPad'), projection = uniform('pillProjection');
  let width = 0, height = 0;
  return {
    upload(canvas:HTMLCanvasElement) {
      if (width===canvas.width && height===canvas.height) {
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        gl.generateMipmap(gl.TEXTURE_2D);
      } else {
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        if (gl.getError()!==gl.NO_ERROR) throw new Error('Section lens texture unavailable');
        width = canvas.width;
        height = canvas.height;
        // The wide field sample reads a coarse mip level (fieldColor).
        gl.generateMipmap(gl.TEXTURE_2D);
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
      gl.uniform1f(smoke,geometry.smoke);
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

function geometryOf(element:HTMLElement, pillAnimating:boolean, dark:boolean):Geometry|null {
  const bar = element.getBoundingClientRect();
  if (!bar.width || !bar.height || bar.top>=innerHeight || bar.bottom<=0) return null;
  // The field bends inward. The margin holds the furthest sample any pose reaches: the held
  // thumb's rim pull (up to about 26 px past its face, so about 27 px past the bar over an
  // outer tab) plus the frost taps. The bar's own rim band reaches 12 px plus its taps, and
  // the raised lens refracts inward only, so its furthest sample is its face edge, a couple
  // of px past the bar. The shader caps the thumb's pull where the viewport clips this margin.
  const cropPad = 28;
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
  // Like the owner's thumb, the raised lens stays inset in the bar, clear of its top and bottom.
  const raisedHeight = bar.height - 10;
  const raisedWidth = Math.min(pillWidth + 2 * sideRoom, Math.max(pillWidth, raisedHeight * (1.36 + .29 * stretch)));
  const drawnPill = projection > 0 || press > 0 ? [
    cx,
    cy + projection * (bar.height/2 - cy),
    pillWidth * pressWidth + projection * (raisedWidth - pillWidth * pressWidth),
    // A held press sits clearly lower than the bar, as the owner's thumb does in its track.
    pillHeight * (1 - .1 * press) + projection * (raisedHeight - pillHeight),
  ] : pill;
  const pad = projection > 0 ? 8 : 0;
  return {bar,crop:{x,y,width,height},pill:drawnPill,samplePill,opacity,lift:lift*rise,press,smoke:dark?1:0,motion,pad,projection,density:Math.min(1.5,devicePixelRatio)};
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
  const scheme = matchMedia('(prefers-color-scheme: dark)');
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
    const geometry = geometryOf(bar,pillAnimating,scheme.matches);
    if (!geometry) {
      fallback();
      listenToSource(null);
      return;
    }
    const {crop,density,pad} = geometry;
    const anchor = root.getBoundingClientRect();
    const nextTexture = [anchor.x,anchor.y,crop.x,crop.y,crop.width,crop.height,density].join(',');
    const nextRender = [geometry.bar.x,geometry.bar.y,geometry.bar.width,geometry.bar.height,
      ...geometry.pill,...geometry.samplePill,geometry.opacity,geometry.lift,geometry.press,geometry.smoke,geometry.motion,pad,geometry.projection].join(',');
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
  scheme.addEventListener('change',schedule,{signal});
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
