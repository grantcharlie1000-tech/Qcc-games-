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
// Apple Music's dark bar is smoked glass with a grey veil: black under it reads about 30/255
// (SMOKE_DARK_DROP). The dark theme's clear resting pill takes PILL_VEIL of the same veil, so it
// stays a near-black capsule about 25 below the bar.
const float SMOKE_DARK_DROP = .075, PILL_VEIL = .096;
// Coring fades chroma below .13 (about half a saturated 9 px stripe's), so dull fields
// grey out but a stripe keeps its width at half height.
const vec2 SMOKE_CORE = vec2(.09, .13);
// C30's even smoke over large card areas: a wide field sample (fieldSample: four taps of a mip
// level about FIELD_TEXEL css px a texel, about 10 css px out) tells broad colour from a narrow mark. Colour the field shares with the pixel fades by
// SMOKE_FIELD (teal and mustard card art), while a 9 px stripe, mostly absent from the field,
// keeps its hue. Only dull colour fades (spread below about .45): a vivid field such as a
// pure red or green panel still reads through at full strength. Bright detail also sinks a little toward the darker field, so blurred titles
// stay quiet, and broad bright art, which the field shares, still lifts the bar.
const float SMOKE_FIELD = .15, SMOKE_EVEN = .3, FIELD_TEXEL = 16. / 3.;
// The field's taps, in css px: the frost's near ring at spread 6, so a 9 px stripe keeps about
// two fifths of its colour in the field, as with the earlier nine-tap field.
const vec2 FIELD_TAP_X = vec2(9., 3.9), FIELD_TAP_Y = vec2(-3.9, 9.);
// Apple Music's bar is heavily blurred: titles behind it do not read and colours bleed. At rest
// the frost takes BODY_BLUR of the wide field sample (about 20 css px across), so the bar keeps
// about a tenth of the backdrop's detail. The rim band sharpens toward the edge, so the mirrored
// title stays crisp, and motion clears the blur, so the moving lens is unchanged.
const float BODY_BLUR = .9;
// Apple's dark bar blurs less: titles and posters behind it still show their shapes (Charlie's still and video, 32.5 s),
// so the dark theme takes DARK_BLUR of the wide field instead.
const float DARK_BLUR = .25;
// Apple's blur bleeds colour: art behind its bar tints it, .46-1.12 of the art's own chroma over a 40 css px
// window (Charlie's video, 32.5-32.75 s). The smoked wide field keeps BLUR_CHROMA of its colour, uncored, so a
// mark smeared below SMOKE_CORE still tints the bar (a 9 px stripe keeps about half its colour over the window).
const float BLUR_CHROMA = .86;
// The frost taps reach about 1 css px past a sample; keep the rim's furthest one this far inside the crop.
const float RIM_SLACK = 2.;
const vec2 RIM_LIGHT = vec2(1., .5);
const float RIM_TINT = 3.;
// Apple's resting rim, light then dark: full light to RIM_REST.x css px deep, gone by .y (light), .z and .w (dark).
// Apple's dark rim is about +70 over the bar at its outer device px, +47 and +33 at the next two, then gone.
const vec4 RIM_REST = vec4(.9, 1.6, .35, 1.15);
// Apple Music's dark top band mirrors the title behind it plainly ("New Releases for You" flipped under the rim):
// the mirror keeps MIRROR_MIX of its contrast, light then dark, and the dark smoke (DARK_SMOKE) then takes about a
// quarter off, so the flipped title reads mid-grey as in Apple's dark still.
const float MIRROR_BAND = 8., MIRROR_K = 2.;
const vec2 MIRROR_MIX = vec2(.29, .75);
// In that still the flipped "New Releases for You" reads as crisp letters, so the dark theme's mirrored zone frosts at
// MIRROR_SPREAD (about a third of the band's), where its strokes were smeared into streaks.
const float MIRROR_SPREAD = .35;
// Apple Music's light bar is milky glass, near white (about 234/255) over any page, dark ones too: the
// light theme's bar mixes MILK_MIX of the way to MILK_TONE, so the art keeps only a faint tint and
// almost none of its detail. The mirrored top band is as milky, but keeps MILK_MIRROR of its flipped
// title's strokes against the field, so the title still reads in it, and its rim reads brighter
// (RIM_LIGHT.x). The resting pill takes the same milk PILL_MILK_DROP darker, as Apple's grey selected
// tab; a press lifts it to the bar's own milk, and the raised lens clears it.
const float MILK_TONE = 1., MILK_MIX = .86, MILK_MIRROR = 1., PILL_MILK_DROP = 27. / 255.;
// Apple's frost is pale but not opaque: the blurred art's shapes still show faintly through the milk, and its
// colour bleeds through: the milk keeps MILK_BLEED more of the blurred art's chroma, so each card tints the bar.
const float MILK_BLEED = .55;
// Apple Music's dark bar is a dark smoke over the art, not a grey veil: black under it reads about 30/255 (DARK_BLACK),
// and brighter art sinks toward the smoke while its colour and shapes still bleed through (Charlie's video, 32.5 s:
// the gold Hamilton poster stays gold under the bar). At rest the dark theme keeps DARK_SMOKE.y of the frost's tone
// over a floor of DARK_SMOKE.x, so a mid-grey poster reads about a quarter darker than the art, and DARK_HUE times
// that of its colour, so the art's hue reads through the smoke instead of greying out.
const vec2 DARK_SMOKE = vec2(.04, .72);
const float DARK_HUE = 1.5, DARK_BLACK = 30. / 255.;
// Apple's dark selected tab is a visible dark capsule: about 10/255 over a black page, 21 under the bar, and over
// bright art a darker, smokier piece than the bar. The dark rest pill keeps PILL_DARK.y of the bar's tone above the
// bar's black, on a floor of PILL_DARK.x.
const vec2 PILL_DARK = vec2(10. / 255., .74);
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
// The raised lens is clear glass, as Apple Music's held and dragged bubble: the content under it
// shows through in its own colour and contrast, not milky. Dull colour under it (a navy or teal
// card, chroma spread below about .2) loses only LENS_NEUTRAL of its saturation, while a vivid
// mark (spread above about .32) keeps its hue. LENS_GAIN takes the clear glass tone's .80
// transmission back to about one, and LENS_LIFT no longer lifts dark content toward milk.
const float LENS_NEUTRAL = .1, LENS_GAIN = 1.25, LENS_LIFT = 0.;
// Its edge is a thin crisp rim about LENS_RIM css px deep, even across it and falling off over a
// px either side of its inner edge (Apple's rim reads about 3.5 px), brightest along the top, whose light splits
// into a faint rainbow (LENS_FRINGE), red at the outside running to blue inside, as Apple's does.
const float LENS_RIM = 3., LENS_FRINGE = .3;
// In the light theme the raised lens is clear, bright glass: the magnified, unfrosted art shows
// through it, lifted LENS_LIGHT of the way to white, so it reads no darker than the milky resting
// pill while it keeps about three times the bar's contrast, and the dark ink on it stays legible.
// Its bevel shading comes after the lift, so its edge still reads. The dark theme's lens is clear.
// Through drag travel the lens is Apple's clear drag bubble (Charlie's video, 13.5 s): the art under it shows
// unfrosted, magnified and in its own colour and contrast, lifted only LENS_LIGHT_DRAG, and the ink over it turns
// light (section-navigation.css, data-lens-under). The raised lens samples the scene LENS_SHARP as wide as the
// moving thumb's frost, so the magnified art stays crisp.
const float LENS_LIGHT = .8, LENS_LIGHT_DRAG = .1, LENS_SHARP = .7;
// The pressed thumb's hairline rim carries the same spectrum at PRESS_FRINGE.
const float PRESS_FRINGE = .4;
const vec2 LENS_NEUTRAL_VIVID = vec2(.2, .32);
// C30's resting selection is clear glass: the art under it reads through in its own colour,
// with none of the bar's smoke or grey veil. At rest the pill's face mixes PILL_CLEAR of the
// way from the bar's smoked sample toward the same frost seen through clear glass (glassTone at
// clarity 1, no veil) at the bar's own transmission (PILL_GAIN takes the lens's .80 back to .98).
// The light theme's pill clears further (PILL_CLEAR.x), as C30's light pill shows its card
// nearly unchanged; the dark theme's (.y) keeps a little smoke. It fades out with motion, lift
// and press, and it is sampled where the selection is, so a sliding pill keeps its refraction.
const vec2 PILL_CLEAR = vec2(.95, .7);
const float PILL_DEEPEN = 23. / 255.;
const float PILL_GAIN = .98 / .80;
// Over bright art the clear glass, and the dark theme's lighter .20 smoke, would lift the pill
// toward the selected accent's own luminance and wash the accent out. Once the bar's veiled frost
// passes PILL_BRIGHT.x luma (grey art about #464646), the pill eases to the plain smoked pill's
// tone (slope one, .30 dark smoke), and from PILL_BRIGHT.y (about #727272) it is never brighter
// than that, while darker card art keeps the clear look.
const vec2 PILL_BRIGHT = vec2(.45, .55);
// The dark theme's resting pill keeps PILL_SMOKE of smoke over normal art, so it sits about 22 under the
// bar as Apple Music's; the bright-art hold still trades it for the plain pill's .30.
const float PILL_SMOKE = 0., PILL_DEEPEN_DARK = 6. / 255.;
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
  // Dark tones sink and bright art still lifts the bar, so the slope stays near one. In the
  // dark theme (pillSmoke) a steeper slope and a deeper drop make Apple Music's denser smoke:
  // black still reads about 30 under its grey veil; bright blobs sink
  // further toward their field so the steeper slope adds no detail.
  float slope = mix(SMOKE_SLOPE, 1.18, pillSmoke), drop = mix(SMOKE_DROP, SMOKE_DARK_DROP, pillSmoke);
  float even = mix(SMOKE_EVEN, .5, pillSmoke);
  float tone = mix(slope * mix(luma, min(luma, fieldLuma), even) - drop, luma, motion);
  // Core the colour: broad, dull fields (teal, mustard card art) fade toward grey, while a
  // saturated mark keeps most of its hue.
  float spread = max(chroma.r, max(chroma.g, chroma.b)) - min(chroma.r, min(chroma.g, chroma.b));
  float shared = clamp(length(fieldChroma) / max(length(chroma), .001), 0., 1.) * (1. - smoothstep(.3, .45, spread));
  float keep = mix(SMOKE_CHROMA * smoothstep(SMOKE_CORE.x, SMOKE_CORE.y, spread) * (1. - SMOKE_FIELD * shared), 1., motion);
  return vec3(tone) + chroma * keep;
}
// Apple Music's dark smoke (DARK_SMOKE, DARK_HUE): an even darkening of the bar's frost that keeps more of its colour.
vec3 darkSmoke(vec3 rgb) {
  float luma = dot(rgb, vec3(.2126, .7152, .0722));
  return vec3(DARK_SMOKE.x + DARK_SMOKE.y * luma) + DARK_HUE * DARK_SMOKE.y * (rgb - luma);
}
// The smoked wide field of the heavy blur: smoked()'s tone, with BLUR_CHROMA of the field's colour kept
// uncored. Motion clears it as smoked() does.
vec3 smokedBlur(vec3 field, float motion) {
  float luma = dot(field, vec3(.2126, .7152, .0722));
  return smoked(vec3(luma), motion, field) + (field - luma) * mix(BLUR_CHROMA, 1., motion);
}
// A bilinear tap of mip level L reads base texels up to 1.5 * 2^L away, so the field's reach is
// its furthest tap offset (9 css px on each axis) plus that, at every density. Its centre is held
// that far, plus RIM_SLACK, inside the crop, so it never reads the clamped edge where the
// viewport clips the crop margin.
vec3 fieldSample(vec2 pos) {
  float density = float(textureSize(scene, 0).x) * region.z;
  float lod = log2(FIELD_TEXEL * density);
  float reach = 9. + 1.5 * exp2(ceil(lod - .01)) / density + RIM_SLACK;
  vec2 lo = -region.xy / region.zw + reach;
  vec2 hi = max(lo, (1. - region.xy) / region.zw - reach);
  vec2 uv = region.xy + clamp(pos, lo, hi) * region.zw;
  vec2 tapX = FIELD_TAP_X * region.zw, tapY = FIELD_TAP_Y * region.zw;
  vec3 rgb = textureLod(scene, uv + tapX, lod).rgb + textureLod(scene, uv - tapX, lod).rgb
           + textureLod(scene, uv + tapY, lod).rgb + textureLod(scene, uv - tapY, lod).rgb;
  return rgb * .25;
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
vec3 rim(vec3 rgb, vec2 normal, float depth) {
  // C30's top and bottom specular edges, shaped by the capsule normal. The band is C30's single
  // thin, crisp rim, about 1.2 px deep (RIM_REST). It is the same under a press
  // or drag: the raised lens now rises past the bar, so the bar body away from it never changes.
  float top = max(0., dot(normal, vec2(-.30, -.95)));
  float bottom = max(0., normal.y);
  // It is Apple's crisp line, about 1.2 css px of full light inside the edge (RIM_REST, light then dark).
  vec2 rest = mix(RIM_REST.xy, RIM_REST.zw, pillSmoke);
  float line = 1. - smoothstep(rest.x, rest.y, depth);
  // Apple Music's bar rim is a thin, dim light line, not a bright outline: about +40 luma over
  // the dark bar and fainter still in the light theme (RIM_LIGHT, light then dark). It catches
  // the colour of the art under it: the light it mixes toward keeps RIM_TINT times the art's
  // chroma, so over orange art the rim reads light orange and over grey it stays white.
  vec3 light = clamp(vec3(1.) + RIM_TINT * (rgb - dot(rgb, vec3(.2126, .7152, .0722))), 0., 1.);
  return mix(rgb, light, min(1., mix(.6, .10, pillSmoke) + .62 * top + .5 * bottom) * mix(RIM_LIGHT.x, RIM_LIGHT.y, pillSmoke) * line);
}
float lensBevel(float radius) {
  return min(LENS_BEVEL, .6 * radius);
}
// The raised lens's surface: clear glass, darkened only a little where the bevel tilts away
// from the light, with no broad lit band over the content. Its edge is Apple's thin crisp rim
// (LENS_RIM), brightest along the top and still clear along the bottom, carrying the faint
// rainbow fringe (LENS_FRINGE) across its depth.
vec3 lensFace(vec3 sceneColor, vec2 outward, float pillDepth, float u, float light) {
  vec3 normal = normalize(vec3(outward * LENS_SLOPE * u * u, 1.));
  float facing = dot(normal.xy, normalize(vec2(-.25, -1.)));
  float shade = max(0., -facing);
  vec3 face = mix(sceneColor, vec3(1.), light) * (1. - .22 * shade - .1 * (1. - normal.z));
  float t = clamp(pillDepth / LENS_RIM, 0., 1.);
  float line = smoothstep(-.8, .5, pillDepth) * (1. - smoothstep(LENS_RIM - 1., LENS_RIM + 1., pillDepth));
  float lit = .34 + .46 * max(0., facing) + .16 * max(0., outward.y);
  vec3 spectrum = .5 + .5 * cos(6.2832 * (.8 * t + vec3(0., .33, .67)));
  return mix(face, mix(vec3(1.), spectrum, LENS_FRINGE), lit * line);
}
vec3 pillSurface(vec3 sceneColor, vec2 normal, float pillDepth, float barDepth, float liftEdge, float y, float milkTone, float deepen) {
  // Give the inset and exposed outline a bevel, and fade it at the join.
  float clearance = smoothstep(1., 4.5, barDepth - max(0., pillDepth));
  clearance = max(clearance, liftEdge * smoothstep(.4, 2.5, -barDepth));
  float top = max(0., dot(normal, vec2(-.30, -.95)));
  float bottom = max(0., normal.y);
  float line = 1. - smoothstep(.2, mix(1.85, 1.6, pillLift), pillDepth);
  // Like Apple Music's selected tab, the resting pill has no lit rim of its own: its edge
  // reads only as the change in tone. A held press keeps only a faint edge so the thumb reads
  // as one milky piece, not a ring. The raised slab catches a crisp top highlight; its lower
  // edge keeps only a hairline.
  float specular = mix((.06 + .36 * top + .13 * bottom) * pillPress, .62 * top * top + .05 * bottom, pillLift) * (1. - .8 * pillPress);
  // The raised lens keeps its lower bevel light so no dark seam forms under the art.
  float inset = (1. - pillLift) * (1. - pillPress) * .13;
  // The dark theme's resting selection is a smoked capsule, as in C30.
  float smoke = pillSmoke * (1. - pillLift) * (1. - pillPress);
  vec3 face = sceneColor * (1. - inset) * (1. - PILL_SMOKE * smoke);
  // Apple Music's selected tab is a darker capsule in the bar: in both themes it sits about
  // PILL_DEEPEN (23/255) below the bar's own tone. Over bright art the pill is already held to the
  // smoked pill's tone for the accent's contrast (PILL_BRIGHT), so the deepening fades there.
  face = max(face - deepen * (1. - pillLift) * (1. - pillPress), 0.);
  // First contact turns the thumb one solid, even light-grey milk, as in the owner's
  // press: the tone follows the average scene under it, so no art or dome shows. Like the
  // owner's thumb it is milky glass, not paint: a hairline catches the light at the rim and
  // a little of the scene shows through just inside it.
  float pressRim = smoothstep(-.2, .5, pillDepth) * (1. - smoothstep(1., 2., pillDepth));
  float pressRing = (1. - smoothstep(1.2, 4.5, pillDepth)) * (1. - pressRim);
  face = mix(face, vec3(milkTone), (.985 - .10 * pressRing) * pillPress);
  face = mix(face, vec3(1.), .16 * pressRim * pillPress * clearance);
  // Its rim carries the raised lens's faint rainbow, red outside to blue inside, as Apple's held bubble.
  vec3 pressSpectrum = .5 + .5 * cos(6.2832 * (.8 * clamp(pillDepth / 2., 0., 1.) + vec3(0., .33, .67)));
  face = mix(face, pressSpectrum, PRESS_FRINGE * pressRim * pillPress * clearance);
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
  // The pressed thumb keeps a soft glass edge; the raised lens's is crisp, as Apple's thin rim.
  float soft = .5 + .3 * pillLift + .6 * pillPress * (1. - pillLift) + .5 * (1. - pillLift) * (1. - pillPress);
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
  vec3 wide = fieldSample(body);
  vec3 field = glassTone(wide, 0.);
  // As in C30, a band at the rim refracts: it draws in what lies past the edge and
  // bends it along the curve, while the centre stays flat under the grey frost.
  float band = 1. - smoothstep(0., 12., depth);
  // The rim band draws its own sample, so the body sample is taken only where it shows:
  // inside the band or under a settled selection.
  vec3 bodyColor = band <= 0. || selected > 0. && pillMotion <= 0. ? smoked(glassColor(body, BODY_SPREAD), 0., field) : vec3(0.);
  // Apple Music's heavy blur (BODY_BLUR): the smoked frost gives way to the smoked wide field.
  vec3 blurColor = smokedBlur(field, 0.);
  float bodyBlur = mix(BODY_BLUR, DARK_BLUR, pillSmoke);
  bodyColor = mix(bodyColor, blurColor, bodyBlur);
  // Like Apple Music's bar at rest, the top band mirrors the content just under it: at depth d
  // inside MIRROR_BAND it draws from depth MIRROR_BAND + MIRROR_K * (MIRROR_BAND - d), so a title
  // behind the bar shows flipped and squeezed in the top edge. Sides and bottom bend outward.
  float topFacing = smoothstep(.25, .75, -normal.y);
  float mirror = topFacing * (1. + MIRROR_K) * max(0., MIRROR_BAND - depth);
  vec2 bent = body + normal * (12. * band * band * (1. - topFacing) - mirror);
  // The mirrored title stays crisp but reads at Apple's low strength: it keeps MIRROR_MIX of
  // its contrast against the wide field colour.
  float mirrorZone = topFacing * (1. - smoothstep(MIRROR_BAND - 2., MIRROR_BAND, depth));
  // The band's frost eases into the centre's wider blur, so no contour shows where it ends.
  // The heavy blur stays out of the mirrored top band, so it reads crisp, as Apple's top edge.
  // The dark theme's mirrored zone frosts at MIRROR_SPREAD, so the flipped title stays crisp.
  float bandSpread = mix(mix(BODY_SPREAD, 1., band), MIRROR_SPREAD, mirrorZone * pillSmoke);
  vec3 surface = band > 0. ? mix(smoked(mix(field, glassColor(bent, bandSpread), 1. - (1. - mix(MIRROR_MIX.x, MIRROR_MIX.y, pillSmoke)) * mirrorZone), 0., field), blurColor, bodyBlur * (1. - band) * (1. - mirrorZone)) : bodyColor;
  // The dark theme's bar is Apple's dark smoke (DARK_SMOKE), the same at every motion: only the selection moves.
  surface = mix(surface, darkSmoke(surface), pillSmoke);
  // The light theme's milk (MILK_MIX). The mirrored band keeps MILK_MIRROR of its strokes over the milk.
  float milk = MILK_MIX * (1. - pillSmoke);
  surface = mix(surface, vec3(MILK_TONE), milk) + MILK_MIRROR * milk * mirrorZone * (surface - blurColor)
          + MILK_BLEED * milk * (blurColor - dot(blurColor, vec3(.2126, .7152, .0722)));
  vec3 rgb = rim(surface, normal, depth);

  if (pillOpacity > 0.) {
    // The soft contact shadow moves down as the selection lifts and fades at the bar edge.
    vec2 shadowPos = pp - vec2(0., mix(1.25, 2., pillLift));
    float shadowDepth = pillRadius - length(capsuleAxis(shadowPos, pill.zw));
    // The raised lens casts a wider, softer shadow, like the owner's dragged thumb.
    // Under the raised lens it is a soft outer shadow all round, deepest below.
    float below = mix(smoothstep(-.15, .60, pp.y / pillRadius), .4 + .6 * smoothstep(-.6, .8, pp.y / pillRadius), pillLift);
    float shadow = smoothstep(-mix(3.5, 7., pillLift), 0., shadowDepth) * smoothstep(1.5, 4.5, depth) * below;
    rgb *= 1. - pillOpacity * shadow * mix(0., .22, pillLift) * (1. - pillPress);
    if (selected > 0.) {
      // A settled selection uses the exact same scene sample as the bar.
      vec3 selectionColor = bodyColor;
      float clear = mix(PILL_CLEAR.x, PILL_CLEAR.y, pillSmoke) * (1. - pillMotion) * (1. - pillLift) * (1. - pillPress);
      vec3 clearGlass = vec3(0.), plainGlass = vec3(0.);
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
        // One frost sample serves the moving selection and the clear glass it fades from.
        vec3 frosted = frost(mix(body, warped, pillMotion), mix(BODY_SPREAD, .67 * mix(1., LENS_SHARP, pillLift), pillMotion) * .5);
        selectionColor = mix(smoked(glassTone(frosted, pillMotion * pillLift), pillMotion, field), smokedBlur(field, pillMotion), bodyBlur * (1. - pillMotion));
        if (clear > 0.) {
          // The bright-art hold reads the unblurred frost, so the pill's tone gate is unchanged by the blur.
          plainGlass = glassTone(frosted, 0.);
          clearGlass = glassTone(mix(frosted, wide, bodyBlur * (1. - pillMotion)), 1.);
        }
        // Neutral smoke in the raised lens; it falls with the motion, so the rest pill is unchanged.
        float neutral = pillMotion * pillLift;
        float lensLuma = dot(selectionColor, vec3(.2126, .7152, .0722));
        float lensSpread = max(selectionColor.r, max(selectionColor.g, selectionColor.b)) - min(selectionColor.r, min(selectionColor.g, selectionColor.b));
        float dull = 1. - smoothstep(LENS_NEUTRAL_VIVID.x, LENS_NEUTRAL_VIVID.y, lensSpread);
        selectionColor = mix(selectionColor, vec3(lensLuma), LENS_NEUTRAL * dull * neutral) * (1. + (LENS_GAIN - 1.) * neutral);
        selectionColor += LENS_LIFT * neutral * max(0., 1. - dot(selectionColor, vec3(.2126, .7152, .0722)));
      } else if (clear > 0.) {
        vec3 frosted = frost(body, BODY_SPREAD * .5);
        clearGlass = glassTone(mix(frosted, wide, bodyBlur), 1.);
        plainGlass = glassTone(frosted, 0.);
      }
      vec2 pillNormal = pillAxis / max(length(pillAxis), .001);
      vec3 faceColor = selectionColor;
      float deepen = mix(PILL_DEEPEN, PILL_DEEPEN_DARK, pillSmoke);
      if (clear > 0.) {
        faceColor = mix(selectionColor, clearGlass * PILL_GAIN + PILL_VEIL * pillSmoke, clear);
        // Hold bright art to the plain smoked pill (PILL_BRIGHT). Its tone eases to the frost's
        // luma with motion, as smoked() does, and pillSurface's .20 dark smoke is traded for .30.
        float plain = dot(plainGlass, vec3(.2126, .7152, .0722));
        float fieldLuma = dot(field, vec3(.2126, .7152, .0722));
        float plainTone = mix(SMOKE_SLOPE * mix(plain, min(plain, fieldLuma), SMOKE_EVEN) - SMOKE_DROP, plain, pillMotion);
        float smoke = pillSmoke * (1. - pillLift) * (1. - pillPress);
        float ceiling = max(0., plainTone) * (1. - .30 * smoke) / (1. - PILL_SMOKE * smoke);
        float faceLuma = dot(faceColor, vec3(.2126, .7152, .0722));
        float bright = smoothstep(PILL_BRIGHT.x, PILL_BRIGHT.y, plain);
        faceColor *= mix(1., min(1., ceiling / max(faceLuma, .001)), bright);
        // Fades with the clear look (motion, lift, press), so the deepening returns without a step.
        deepen *= 1. - bright * (1. - pillMotion) * (1. - pillLift) * (1. - pillPress);
      }
      vec3 selection = pillSurface(faceColor, pillNormal, pillDepth, depth, liftEdge, pp.y / pillRadius, milkTone, deepen);
      // The dark theme's resting pill is Apple's dark capsule (PILL_DARK): the bar's own smoke at this pixel, deepened
      // toward a near-black floor, so it reads under the bar over a black page and over bright art alike. A press and
      // the raised lens take it back to their milky and clear pieces.
      vec3 barSmoke = darkSmoke(selectionColor);
      selection = mix(selection, PILL_DARK.x + PILL_DARK.y * max(barSmoke - DARK_BLACK, 0.), pillSmoke * (1. - pillLift) * (1. - pillPress));
      // The light theme's resting pill is the bar's milk, PILL_MILK_DROP darker. A press lifts it to the bar's milk,
      // as the dark theme's press lifts its pill toward the frosted milk; the raised lens clears it smoothly.
      selection = mix(selection, vec3(MILK_TONE - PILL_MILK_DROP * (1. - pillPress)), MILK_MIX * (1. - pillSmoke) * (1. - pillLift));
      float lensU = 1. - clamp(pillDepth / lensBevel(pillRadius), 0., 1.);
      selection = mix(selection, lensFace(selectionColor, pillNormal, pillDepth, lensU, mix(LENS_LIGHT_DRAG, LENS_LIGHT, pillPress) * (1. - pillSmoke)), pillLift);

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
        // The wide field sample reads a coarse mip level (fieldSample).
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

// The raised lens may stand past the bar's end by up to LENS_END_ROOM css px toward the screen edge and
// LENS_MENU_ROOM toward the menu button (12 px away), and keeps at least LENS_MIN_ASPECT where that
// caps it, standing at least LENS_PROUD css px past the bar top and bottom. LENS_PAD is the surface's
// margin past the bar while it is drawn: the end room plus its edge.
const LENS_END_ROOM = 14, LENS_MENU_ROOM = 8, LENS_MIN_ASPECT = 1.36, LENS_PROUD = 3, LENS_PAD = 16;

/** The lens each bar last drew: [cx, cy, width, height] in the bar's on-screen css px, and the bar's own scale
 * (sx, sy) against its layout box. tabbar.ts sizes the glyph zoom from it, so the zoom covers the wide bubble. */
export const drawnLenses = new WeakMap<HTMLElement,{pill:number[]; sx:number; sy:number}>();

function geometryOf(element:HTMLElement, pillAnimating:boolean, dark:boolean):Geometry|null {
  const bar = element.getBoundingClientRect();
  if (!bar.width || !bar.height || bar.top>=innerHeight || bar.bottom<=0) return null;
  // The field bends inward. The margin holds the furthest sample any pose reaches: the press
  // warp's rim pull, which shows only while the press raises the lens (up to about 26 px past
  // the lens face at 1/1.36, so about 20 px past the bar top and 27 px past an outer tab's end),
  // plus the frost taps. The bar's own rim band reaches 12 px plus its taps, and
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
  // Leave room for the adjacent menu even when a scrub reaches the outer tab. The room is the resting capsule's
  // (glass.ts capsulePill), which already stops at the bar's inset; its press and drag stretch is the lens's own.
  const sideRoom = Math.min(cx,bar.width-cx) + 6 - w*sx/2;
  const expanded = opacity > 0 && bar.width >= 2 * bar.height &&
    element.dataset.hidden !== 'true' && element.dataset.minimized !== 'true';
  // Drag stretch grows scaleX past the press scale; it shapes the lens into the drag lens.
  const rise = smoothstep((scaleX - 1.1) / .18);
  // Charlie's video (b24s): a press raises the clear lens at once (19.650-19.667 s), so the lens
  // rises with the press itself, follows the animated scale through release, and falls back on it.
  const raise = smoothstep(lift);
  const projection = expanded ? raise * smoothstep(sideRoom/2) : 0;
  const settledX = (parseFloat(style.getPropertyValue('--ui-pill-x')) || 0) -
    (parseFloat(style.getPropertyValue('--section-pill-bleed')) || 0);
  // Transition progress comes from the resolved pseudo-element geometry, so
  // release and selection slides return to zero without an extra clock.
  const travel = Math.abs(shiftX-settledX);
  const scale = Math.max(Math.abs(scaleX-1),Math.abs(scaleY-1));
  const moving = expanded && (pillAnimating || element.hasAttribute('data-pressing'));
  // Magnification arrives with the raised lens, which the press now raises.
  const motion = moving ? Math.min(1,Math.max(lift,travel/24,scale*7)) * (.18 + .82 * raise) : 0;
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
  // Charlie's video (b24s/MEASUREMENTS.md): the held lens is a wide clear bubble, 1.55 x 1.11 bar
  // heights (102 x 73 css px, aspect 1.40) across about a tab and a half, centred on the bar, so it
  // stands about 4 px above the bar top and 3 px below its bottom. The drag lens is 1.06 bar heights
  // tall at aspect 1.47. It stays centred on its tab and may stand past the bar's ends: by
  // LENS_END_ROOM toward the screen edge, keeping 6 px of it, and by LENS_MENU_ROOM toward the menu.
  // Where that caps its width at an outer tab it flattens toward LENS_PROUD px over each bar edge (the
  // video's hold lens stands 3-4 px proud), so it keeps a capsule (aspect LENS_MIN_ASPECT), not a circle.
  const naturalHeight = bar.height * (1.11 - .05 * rise);
  const endRoom = Math.min(LENS_END_ROOM, Math.max(0, bar.left - 6));
  // The bar's growth while pressed (section-navigation.css) already reaches half its extra width toward the menu.
  const menuRoom = Math.max(0, LENS_MENU_ROOM - (bar.width - element.offsetWidth) / 2);
  // MOTION-5 (#24 council): at an end tab Apple's lens keeps its width and moves inward, clamped inside the screen
  // (Charlie's video, 24.85 s: the lens over Home stands a few px in from the bar's end, centred past the Home glyph),
  // where ours was capped by the screen edge into a round disc. So the raised lens keeps its natural width wherever the
  // span from endRoom past the bar's screen end to menuRoom past its menu end holds it, and its centre slides inward
  // just enough to stay in that span.
  const raisedWidth = Math.min(naturalHeight * (1.40 + .07 * rise), bar.width + endRoom + menuRoom);
  const raisedCx = Math.min(Math.max(cx, raisedWidth / 2 - endRoom), bar.width + menuRoom - raisedWidth / 2);
  const raisedHeight = Math.min(naturalHeight, Math.max(bar.height + 2 * LENS_PROUD, raisedWidth / LENS_MIN_ASPECT));
  const pressedWidth = pillWidth * pressWidth, pressedHeight = pillHeight * (1 - .1 * press);
  const drawnCx = cx + projection * (raisedCx - cx);
  // The lens magnifies what lies under its own centre.
  if (projection > 0) samplePill[0] = drawnCx;
  const drawnPill = projection > 0 || press > 0 ? [
    drawnCx,
    cy + projection * (bar.height/2 - cy),
    pressedWidth + projection * (raisedWidth - pressedWidth),
    pressedHeight + projection * (raisedHeight - pressedHeight),
  ] : pill;
  const pad = projection > 0 ? LENS_PAD : 0;
  return {bar,crop:{x,y,width,height},pill:drawnPill,samplePill,opacity,lift:lift*raise,press,smoke:dark?1:0,motion,pad,projection,density:Math.min(1.5,devicePixelRatio)};
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
    drawnLenses.delete(bar);
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
    drawnLenses.set(bar,{pill:geometry.pill,sx:geometry.bar.width/(bar.offsetWidth||1),sy:geometry.bar.height/(bar.offsetHeight||1)});
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
