import {onGlassFrame,requestGlassFrame,watchGlassFrameSources} from './glass-frame-source';
import {createSectionBackdrop} from './section-backdrop';
import type {Crop} from './section-backdrop';

// The frosted scene sample, shared by both stages.
const GLASS = `uniform sampler2D scene;
uniform vec4 region;
// Apple's dark bar blurs a title behind it into soft letters at their own size (the still's "Releases for You"), where
// the frost's nine sparse taps smeared ours into streaks. While softFrostMix is set (the dark body and its band below
// the mirrored zone), frost() reads softFrost instead: nine taps, a ring of eight DARK_RING css px round the sample, on
// a mip level whose texels fill the .77 DARK_RING gaps between them, so a stroke spreads evenly instead of repeating at
// each tap. Its reach, DARK_RING plus 1.5 texels of the next whole mip level (about 3.6 css px at 1.5x), stays inside
// the crop's 12 px floor under the bar. LOOK-6 brought the ring down to .6 so a title stayed nearly as sharp as Apple's
// still shows it. LOOK-10: the council on aa6359ee read that bar as too clear (titles and the green and red stripes
// sharp through it) beside Apple's calmer smoke, which softens what lies behind it into one surface, so the ring widens
// to 1.6: letters still read through the bar, softly (the old near-black slab stays rejected).
// LOOK-12: with LOOK-10's deeper smoke (DARK_EVEN) that read as a smudge. Title strokes alone (glyph boxes masked, edges
// under 190 at their bright end) rise over 2.40 css px in Apple's still (88 levels); ours rose over 2.77 (44 levels), and
// over 2.21 (66 levels) at aa6359ee's settings, the council's "sharp". At .9 the ring gives Apple's 2.40 and the strokes
// stay calm (48 levels): soft letters, not a smudge. Its reach is .9 plus 2 css px of mip 1, inside the crop's floor.
float softFrostMix = 0.;
const float DARK_RING = .9;
vec3 softFrost(vec2 pos) {
  vec2 uv = region.xy + pos * region.zw;
  float density = float(textureSize(scene, 0).x) * region.z;
  float lod = log2(max(1., .77 * DARK_RING * density));
  vec3 rgb = 2. * textureLod(scene, uv, lod).rgb;
  for (int i = 0; i < 8; i++) {
    float a = .3927 + .7854 * float(i);
    rgb += textureLod(scene, uv + vec2(cos(a), sin(a)) * DARK_RING * region.zw, lod).rgb;
  }
  return rgb * .1;
}
vec3 frost(vec2 pos, float spread) {
  if (softFrostMix > .5) return softFrost(pos);
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
// so the dark theme takes DARK_BLUR of the wide field instead. LOOK-5: was .25, which still hazed the posters and blurred
// a title under the bar into blobs; Apple's video at 32.5 s keeps an arm and the Hamilton star sharp through its bar.
// LOOK-10 (council on aa6359ee, see DARK_RING): .1 left small bright marks crisp. .55 of the wide field calmed them but
// lifted the dark page beside bright art (apple_match's bar over the plain page 36 -> 51, Apple 32), so the dark bar takes
// .2 and calms bright marks by sinking them DARK_EVEN of the way to their darker field (smoked()), which never lifts the
// dark: titles and bright stripes dim into the smoke while black stays 32. Uniform art keeps its tone either way.
const float DARK_BLUR = .2, DARK_EVEN = .8;
// The C30 face bend stretched a title behind the dark bar 1.2-1.5x vertically into tall streaks; the dark theme keeps
// DARK_BEND of it, and its body frosts soft (softFrost).
const float DARK_BEND = .3;
// Apple's blur bleeds colour: art behind its bar tints it, .46-1.12 of the art's own chroma over a 40 css px
// window (Charlie's video, 32.5-32.75 s). The smoked wide field keeps BLUR_CHROMA of its colour, uncored, so a
// mark smeared below SMOKE_CORE still tints the bar (a 9 px stripe keeps about half its colour over the window).
const float BLUR_CHROMA = .86;
// The frost taps reach about 1 css px past a sample; keep the rim's furthest one this far inside the crop.
const float RIM_SLACK = 2.;
const vec2 RIM_LIGHT = vec2(1., .44);
const float RIM_TINT = 3.;
// Apple's resting rim, light then dark: full light to RIM_REST.x css px deep, gone by .y (light), .z and .w (dark).
// Apple's dark rim is about +70 over the bar at its outer device px, +47 and +33 at the next two, then gone.
// LOOK-10: at css px Apple's dark rim spans two px in its still (+87 and +50 over the bar, black page) and in the video's
// rest frame (+21 and +28, compression softening it), where ours read one bright px (+54, then +2). The dark line now
// holds full light to .8 css px and is gone by 1.9 (RIM_LIGHT.y .38 of white at the top): a bright outer px and a
// softer second over a black page, its peak between the still's and the video's; the second px stays under half the
// first, as Apple's half-maximum width (apple_match) is one px. The dark pill's faint edge keeps PILL_RIM.
// LOOK-12 (council on ea5b395c: Apple's dark bar has a bright, thin lit rim where ours read faint): at device px Apple's
// still lifts its rim over a black page +34, +38, +26 and then a glow of +17, +11, +9 into the bar (about 3 css px), where
// ours was one bright css px and gone (+52, +52, +53, +41, +19, +5). The dark line now holds full light to .6 css px and
// fades by 2.2 (RIM_LIGHT.y .5, its ends lit at .22 of the top's light, was .10): +81, +80, +77, +63, +36, +17 over black
// at device px (+79 and +39 at css px, was +52 and +22), a lit edge with Apple's soft inner glow. That also lit the foot
// (apple_match's rim peak, top and bottom averaged, 31.5 -> 57.5 against Apple's 35.7), where the council asked for a
// specular top edge: the dark foot takes RIM_FOOT of the bottom's light (.25, the light theme keeps .5) and the line
// RIM_LIGHT.y .44, so the top stays the bright lit edge and the foot a fainter line, as in Apple's still.
const vec4 RIM_REST = vec4(.9, 1.6, .6, 2.2);
const vec2 RIM_FOOT = vec2(.5, .25);
const vec2 PILL_RIM = vec2(.35, 1.15);
// Apple Music's dark top band mirrors the title behind it plainly ("New Releases for You" flipped under the rim):
// the mirror keeps MIRROR_MIX of its contrast, light then dark, and the dark smoke (DARK_SMOKE) then lifts it back by
// about half again, so the flipped title reads mid-grey as in Apple's dark still.
const float MIRROR_BAND = 8., MIRROR_K = 2.;
const vec2 MIRROR_MIX = vec2(.29, .45);
// In that still the flipped "New Releases for You" reads as crisp letters, so the dark theme's mirrored zone frosts at
// MIRROR_SPREAD (about a third of the band's), where its strokes were smeared into streaks.
const float MIRROR_SPREAD = .35;
// LOOK-13 (council on ea5b395c: Apple's dark bar bends the art in its edge band at rest; ours passed it under flat).
// At device px Apple's dark still draws its flipped title into the band's outer 4 css px (p95 106-139 over a 31 body),
// where ours spread a fainter one over 2-7 css px. The dark top band mirrors from DARK_MIRROR (band 6, squeeze 3: a
// title 13-24 css px deep lands in its outer 4.3 css px) and keeps MIRROR_MIX.y .6 of its contrast (was .35).
// Apple's dark foot band mirrors too: in its still a poster whose top lies about 15 css px above the bar's foot shows
// through to 3.3 css px from the edge, then the foot reads as the bar over black (36-44) to the rim, where ours pulled
// the art from past the edge and ran it on flat to the rim. The dark foot draws from FOOT_MIRROR.x + FOOT_MIRROR.y *
// (FOOT_MIRROR.x - d) inside the bar, so that poster ends 3.3 css px from the foot. Both mirrors sample inside the bar,
// so neither reaches toward the crop's edge, and the taps are the band's own.
const vec2 DARK_MIRROR = vec2(6., 3.), FOOT_MIRROR = vec2(8., 1.5);
// LOOK-14: the flipped title still read much fainter than Apple's (band13: peak stroke lift 51 over the band's body against
// the still's 91): smoked() sank its bright strokes DARK_EVEN (.8) of the way to the wide field, undoing most of
// MIRROR_MIX. The dark mirrored zone now takes none of that sink (darkEven), and keeps MIRROR_MIX.y .45 of its contrast:
// the flipped title's strokes lift +87 over the body (Apple +91, before +51), lit to 4.7 css px (Apple 4.0).
// Apple Music's light bar is pale frost the art shows through, not milk: its mini player passes about .3 of the album
// art under a 228 grey, and its tab bar reads 234 over the white page. The light theme lifts the bar's frost to
// MILK_LIFT + MILK_GAIN of it, so black art reads about 188 under it and white about 240, and the art's colour and
// blurred shapes show through at about a fifth of their contrast (the .86 milk passed about a fifteenth). The mirrored
// top band keeps MILK_MIRROR of its flipped title's strokes against the field over that lift, so the title still reads
// in it, and its rim reads brighter (RIM_LIGHT.x). The resting pill is the bar's own frost PILL_MILK_DROP darker, as
// Apple's grey selected tab (209 under its 234 bar); a press lifts it to the frost, and the raised lens clears it.
// Over black art that frost reads about 188 and the pill followed it to about 166, where the #ff375f accent read 1.45:1.
// The pill is held at PILL_LIGHT_FLOOR luma or lighter, eased toward white, so the
// accent keeps about 2.1:1 over any art (section-lens.spec's black patch); over bright art it stays the step darker.
const float MILK_LIFT = .683, MILK_GAIN = .483, MILK_MIRROR = 1., PILL_MILK_DROP = 22. / 255., PILL_LIGHT_FLOOR = 200. / 255.;
// Apple Music's dark bar is a light smoke over the art (Charlie's still and video): black under it reads about 32/255,
// and the art shows through nearly at its own tone, a little lifted (a floor under the video's man at 32.5 s reads
// about 76 raw and 98 through the bar, the gold Hamilton poster about 117 and 132), its colour a little greyed. At rest
// the dark theme takes the frost's tone as DARK_SMOKE.x + DARK_SMOKE.y of it, which undoes the frost's grey veil (black
// about 32, white about 230), and DARK_HUE of that gain of its colour. LOOK-10: at DARK_HUE 1 (about four fifths of the
// art's own colour) bluish posters tinted our bar blue-grey (council on aa6359ee), where Apple's dark bar is a neutral
// smoke; at .5 the art's colour still shows through, at about two fifths of its own chroma.
const vec2 DARK_SMOKE = vec2(-.047, 1.55);
const float DARK_HUE = .5;
// LOOK-5 (owner: our dark bar read as a near-black slab beside Apple's see-through smoke): that gain on the veiled frost
// lifted dark art at a slope of 1.15 (the floor's 76 read 118, mid grey 160) and sank white to 230, so posters read hazy
// and flat. The smoke now undoes the frost's veil and roll-off and the dark smoked() slope first (uniform art a tones to
// DARK_TONE.x + DARK_TONE.y * a * E(a), E being glassTone's exposure), then takes Apple's straight line on the art's own
// tone: DARK_GLASS.x + DARK_GLASS.y of it (black 32, 76 -> 98, 117 -> 135, as the video at 32.5 s), the art's contrast
// kept, rolling off past DARK_GLASS.z by DARK_GLASS.w of the square, so white still reads 230.
const vec2 DARK_TONE = vec2(1.18 * .44 * .36 - SMOKE_DARK_DROP, 1.18 * .64);
const vec4 DARK_GLASS = vec4(32. / 255., .875, .5, .402);
// Apple's dark selected tab is a smoked capsule a step darker than the bar. LOOK-6: over a black page Apple's pill reads 11
// under its bar's 32 in the dark still and 13 under 29 in the video's rest frame (38.75 s), a pill-to-bar luminance
// contrast of 1.21 and 1.15. LOOK-10 (council on aa6359ee: our pill sat well below the bar, 79 under 136 over mid-grey
// art, held there so the blue accent kept 2.5:1): the dark rest pill sits PILL_STEP under the bar's own smoke in
// luminance contrast over every art, black 32 -> 15, #777's 136 -> 124, white's 229 -> 212, as Apple's capsule only a
// little darker than its bar. The selected icon and label keep 2:1 against it by their ink (glass-ink.ts pillAccent).
// LOOK-16 (Charlie: dark pill to bar contrast like Apple's): the still's own step, 1.21, brings the pill over black to its
// 10/255 (was 15). LOOK-17: read by section-lens.spec's step in pairs across the capsule's ends on Apple's own rest frames,
// Apple's pill sinks further under its bar over brighter art, not less: 1.16 over black (video 38.75 s; the still 1.21),
// 1.22-1.25 over dark art (32.5-32.75 s), 1.68 over a bright green poster (19.5 s, its bar 137/255) and 2.05-2.08 over a
// bright photo (32.5-32.75 s). So the step follows the bar's smoke at the pixel: PILL_STEP.x over a black page (32 -> 11),
// rising to PILL_STEP.y as the bar's linear luminance runs from PILL_STEP.z to PILL_STEP.w (about 38 to 108/255): #777's
// 136 -> 95 and white's 229 -> 172, a smoked capsule plainly under the bar over any art. LOOK-19: PILL_STEP.y 1.65 -> 1.8,
// as apple_match's pill_step_bright (the spec's step in end-cap pairs over bright art) read 1.56 against Apple's 1.72 at 1.65.
const vec4 PILL_STEP = vec4(1.21, 1.8, .02, .15);
const float PILL_DARK_RIM = .15;
// LOOK-12 (council on ea5b395c: Apple's dark selected pill reads as a convex dome, ours as a flat grey disc): the rest pill
// takes PILL_DOME.x of white along its top, fading over PILL_DOME.z css px, and loses PILL_DOME.y of its tone along its
// foot over PILL_DOME.w, each falling off with how far the edge faces up or down. Both stay in the capsule's outer few px,
// clear of the icon and label the ink reads, so its middle keeps PILL_STEP under the bar.
const vec4 PILL_DOME = vec4(.14, .35, 5., 4.);
float srgbLinear(float c) { return c <= .04045 ? c / 12.92 : pow((c + .055) / 1.055, 2.4); }
float linearSrgb(float c) { return c <= .0031308 ? 12.92 * c : 1.055 * pow(c, 1. / 2.4) - .055; }
// The raised lens is a capsule of clear glass whose height field comes from its SDF: flat
// across the face, which shows the art evenly at LENS_ZOOM, then rolling off as 1 - u^3 across a
// soft bevel LENS_BEVEL css px wide (u runs 0 at the face to 1 at the edge). The canvas is
// drawn at device density, so the bevel spans LENS_BEVEL * DPR device px. Its slope, and so
// its normal, grows as u^2: the face meets the bevel without a seam.
// MOTION-12 (#24): was 1.36. Charlie's video shows the art under the held and dragged lens at its own size: with the
// glyphs and labels masked, the 12.75 s and 13.5 s lens faces match the same art at 10.5 s at x0.98 and x0.96 (gradient
// NCC .98 and .96 over the face's central rows; x1.18 and x1.16 with the glyph left in, which is the glyph's own growth,
// tabbar.ts LENS_ZOOM). So the face is 1:1 and only the bevel bends the art; the glyphs alone grow.
const float LENS_ZOOM = 1., LENS_BEVEL = 14., LENS_SLOPE = 2.4;
// Like thick glass, the bevel bends each ray along its normal. MOTION-5 (#24 council): Apple's raised lens visibly bends
// the art at its edge (Charlie's video, 12.75-13.5 s and 24.85 s: glyphs and titles under the rim squeeze and curve
// along it), where the old inward pull only swelled the rim a little. So across the bevel the sample now reaches
// outward, by LENS_EDGE_REACH css px at the rim: the face stays evenly magnified, and the bevel draws in the art from
// the face's edge to a couple of px past the lens's own, squeezed about 2.5x at the rim, so straight edges bend into it.
// A push outward never folds the mapping. The reach is cut where the backdrop crop would run out, as the press's is.
// MOTION-11 (#24 council on aa6359ee: "a thin ring that bends almost nothing"): the reach is LENS_EDGE_REACH and grows as
// u^3, so the outer few px of the bevel draw in art from about 8 css px past the lens edge, squeezed about 4.6x at the
// rim, and a straight edge visibly curves into it, as the video's rim warps what passes under it. The face is unchanged.
const float LENS_EDGE_REACH = 18.;
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
// Its edge is a thin crisp rim about LENS_RIM css px deep, falling off over half a px either side of its inner edge
// (MOTION-5: the video's hold and drag rims read about 2 px at half height, ours read 4.5 and 3 at LENS_RIM 3; MOTION-11:
// 1 and 2 at 1.5, against the video's 2 and 3.5, so it is 2.2), lit
// all round and brightest along the top, whose light splits into a thin rainbow (LENS_FRINGE), red at the outside
// running to blue inside, as Apple's does. MOTION-12 (#24): the video's moving lens has the wider rim, 3.5 css px at half
// height at 13.5 s against the 12.75 s hold's 2, with about the same rainbow (fringe 13 and 10). So through drag travel
// the rim widens to LENS_RIM_DRAG along the top and bottom (weighted by how far the edge faces up or down, as the band;
// the ends keep the held rim) and its rainbow, spread over the wider rim, eases to LENS_FRINGE_DRAG; both ease back to the
// held rim's as the press holds the lens still.
// MOTION-13 (#24): the video's held rim is a rainbow more colourful than the art on both sides of it (12.75 s: rim band
// p90 chroma 19 over 3 above and 3 inside along the top, 74 over 70 and 69 along the bottom; two-sided fringe 10). At .24
// ours carried less colour than the navy card art beside it (two-sided 1.0): over 2.2 css px the spectrum's .8 turn
// averages out within each css px, where the drag's 3.4 px rim keeps it. The held rainbow is LENS_FRINGE .4 (.36 read
// 7.5, top 9 and bottom 6).
const float LENS_RIM = 2.2, LENS_FRINGE = .4, LENS_RIM_DRAG = 3.4, LENS_FRINGE_DRAG = .19;
// MOTION-14 (#24): mixed toward the spectrum at .4, the white rim lost up to a third of its light where the rainbow runs
// through magenta and blue, and over bright art (the pink poster) the held rim read 1.5 css px at half height, not the
// video's 2. The rainbow keeps its colour at LENS_FRINGE but darkens the rim only as much as the .24 rainbow did
// (LENS_FRINGE_SHADE); the drag's .19 is unchanged.
const float LENS_FRINGE_SHADE = .24;
// MOTION-11 (#24 council on aa6359ee): the video's rim is a thick, darker refracting band along the top and bottom,
// about 5 css px deep just inside the bright line, tapering round the ends (12.75 s and 13.5 s). The face darkens by up
// to LENS_BAND_DARK across depths LENS_BAND (in, full, full, out), weighted by how far the edge faces up or down: the
// light theme's band is lighter (.x), so on its pale bar the bubble reads as glass and not a dark hole.
const vec4 LENS_BAND = vec4(2., 3.4, 5.8, 8.8);
const vec2 LENS_BAND_DARK = vec2(.25, .45);
// The raised lens is Apple's clear, bright bubble (Charlie's video, 12.75-13.5 s; MOTION-5 council): held or dragged,
// the art under it shows unfrosted, magnified and in its own colour and contrast, lifted a little toward white:
// LENS_LIGHT held and LENS_LIGHT_DRAG through drag travel in the light theme, LENS_LIGHT_DARK in the dark. The held
// lens was lifted .8, a milky disc. Its bevel shading comes after the lift, so its edge still reads, and the ink over
// a dragged lens turns light (section-navigation.css, data-lens-under). The raised lens samples the scene LENS_SHARP
// as wide as the moving thumb's frost, so the magnified art stays crisp.
// MOTION-11 (#24 council on aa6359ee: a milky or smoked disc): the lift toward white read as milk. In the video the art
// inside the lens reads 7-11% brighter than through the bar over bright art and the same over dark art, with more
// contrast, a gain and not a veil. So the face is the clear art times LENS_BRIGHT over a small floor: LENS_LIGHT in the
// light theme, and in the dark LENS_LIGHT_DARK, about the dark smoke's own black, so dark art reads as through the bar.
// The light theme's gain is larger (LENS_BRIGHT.x), so on its pale bar the clear bubble still reads bright.
// MOTION-14 (#24 council on ea5b395c, both seats: over the pink and orange posters the light held, dragged and releasing
// lens was milky and washed the art out, where Apple's is near-invisible: the poster at full colour, the lens seen by its
// rim and the larger glyph). The light lens's floor (LENS_LIGHT .08 of white) and its 1.25 gain over the frost's
// highlight-compressed sample lifted navy card art 27 levels over the art it shows and clipped a poster's bright channels
// to pastel. The light lens is now the clear art under it (the bent, unfrosted sample) times LENS_CLEAR, the video's
// small gain (its lens reads 7-11% over bright art), with no floor and no veil. The dark lens keeps its smoked sample
// over LENS_LIGHT_DARK at LENS_BRIGHT.
const float LENS_LIGHT_DARK = .1, LENS_SHARP = .7, LENS_BRIGHT = 1.12, LENS_CLEAR = 1.08;
// MOTION-19 (#24): Charlie's video softens the art under the parked lens. The page does not move between 10.5 s and
// 12.75 s, so the same art is seen under the bar body (10.5 s) and under the held lens (12.75 s): with the glyph masked,
// the held lens's face keeps .58 of the body's detail and matches the body blurred by about .75 css px (gradient NCC
// peak at .75-1); over the clarity band's rows it keeps 1.03 of it. Our light lens showed 5.3 times its frosted body's
// detail over the same art. While the press holds the lens still (pillPress, which falls to 0 as a drag stretches the
// lens) the light lens's face takes HOLD_SOFT of the soft frost (softFrost, about the dark body's .94 css px blur), with
// no veil, gain or colour change, so the art keeps the council's full colour and only its fine detail softens. The
// bevel, whose samples reach toward the crop's edge, stays crisp (the face from HOLD_FACE.y of the bevel inward).
// Rest (no lift, no press) and drag travel (no press) are untouched.
const float HOLD_SOFT = 1.;
const vec2 HOLD_FACE = vec2(.3, .5);
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
// The share of DARK_EVEN's sink a smoked() call takes: 1 everywhere but the dark band's mirrored zone (LOOK-14).
float darkEven = 1.;
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
  float even = mix(SMOKE_EVEN, DARK_EVEN * darkEven, pillSmoke);
  float tone = mix(slope * mix(luma, min(luma, fieldLuma), even) - drop, luma, motion);
  // Core the colour: broad, dull fields (teal, mustard card art) fade toward grey, while a
  // saturated mark keeps most of its hue.
  float spread = max(chroma.r, max(chroma.g, chroma.b)) - min(chroma.r, min(chroma.g, chroma.b));
  float shared = clamp(length(fieldChroma) / max(length(chroma), .001), 0., 1.) * (1. - smoothstep(.3, .45, spread));
  float keep = mix(SMOKE_CHROMA * smoothstep(SMOKE_CORE.x, SMOKE_CORE.y, spread) * (1. - SMOKE_FIELD * shared), 1., motion);
  return vec3(tone) + chroma * keep;
}
// Apple Music's dark smoke (DARK_GLASS on the art's tone, DARK_HUE): see-through glass that keeps the art's contrast and
// more of its colour.
vec3 darkSmoke(vec3 rgb) {
  float luma = dot(rgb, vec3(.2126, .7152, .0722));
  float h = max(0., (luma - DARK_TONE.x) / DARK_TONE.y);
  float art = min(1., h <= .98 * .27 ? h / .98 : (1. - .66 * .27) * h / max(.98 - .66 * h, .2));
  float over = max(0., art - DARK_GLASS.z);
  return vec3(DARK_GLASS.x + DARK_GLASS.y * art - DARK_GLASS.w * over * over) + DARK_HUE * DARK_SMOKE.y * (rgb - luma);
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
  return mix(rgb, light, min(1., mix(.6, .22, pillSmoke) + .62 * top + mix(RIM_FOOT.x, RIM_FOOT.y, pillSmoke) * bottom) * mix(RIM_LIGHT.x, RIM_LIGHT.y, pillSmoke) * line);
}
float lensBevel(float radius) {
  return min(LENS_BEVEL, .6 * radius);
}
// The raised lens's surface: clear glass, darkened only a little where the bevel tilts away
// from the light, with no broad lit band over the content. Its edge is Apple's thin crisp rim
// (LENS_RIM), brightest along the top and still clear along the bottom, carrying the faint
// rainbow fringe (LENS_FRINGE) across its depth.
vec3 lensFace(vec3 sceneColor, vec3 clearArt, vec2 outward, float pillDepth, float u) {
  vec3 normal = normalize(vec3(outward * LENS_SLOPE * u * u, 1.));
  float facing = dot(normal.xy, normalize(vec2(-.25, -1.)));
  float shade = max(0., -facing);
  vec3 face = mix(min(clearArt * LENS_CLEAR, vec3(1.)), LENS_LIGHT_DARK + (1. - LENS_LIGHT_DARK) * min(sceneColor * LENS_BRIGHT, vec3(1.)), pillSmoke);
  float band = smoothstep(LENS_BAND.x, LENS_BAND.y, pillDepth) * (1. - smoothstep(LENS_BAND.z, LENS_BAND.w, pillDepth));
  face *= (1. - .22 * shade - .1 * (1. - normal.z)) * (1. - mix(LENS_BAND_DARK.x, LENS_BAND_DARK.y, pillSmoke) * band * outward.y * outward.y);
  float facing2 = outward.y * outward.y, facing4 = facing2 * facing2, facing8 = facing4 * facing4;
  float rimDepth = mix(LENS_RIM, mix(LENS_RIM_DRAG, LENS_RIM, pillPress), facing8 * facing8);
  float t = clamp(pillDepth / rimDepth, 0., 1.);
  float line = smoothstep(-.6, .3, pillDepth) * (1. - smoothstep(rimDepth - .5, rimDepth + .5, pillDepth));
  float lit = .5 + .38 * max(0., facing) + .12 * max(0., outward.y);
  vec3 spectrum = .5 + .5 * cos(6.2832 * (.8 * t + vec3(0., .33, .67)));
  float fringe = mix(LENS_FRINGE_DRAG, LENS_FRINGE, pillPress), tone = dot(spectrum, vec3(.2126, .7152, .0722));
  vec3 rimLight = 1. - min(fringe, LENS_FRINGE_SHADE) * (1. - tone) + fringe * (spectrum - tone);
  return mix(face, rimLight, lit * line);
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
  // MOTION-14 (#24 council on ea5b395c: the light lens was milky at the release too): that milk belongs to the press before
  // the lens rises. Through a release the press eases out while the lens falls, and the falling light lens showed it; so in
  // the light theme it fades as the lens rises, and the falling lens clears into the rest pill's frost alone.
  face = mix(face, vec3(milkTone), (.985 - .10 * pressRing) * pillPress * (1. - pillLift * (1. - pillSmoke)));
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
  // LOOK-5: Apple's dark rest pill meets its bar within about a css px (its dark still), where ours blurred over two.
  float soft = .5 + .3 * pillLift + .6 * pillPress * (1. - pillLift) + (.5 - .3 * pillSmoke) * (1. - pillLift) * (1. - pillPress);
  float selected = pillOpacity * smoothstep(-soft, soft, pillDepth);
  float liftEdge = smoothstep(0., .25, pillProjection);
  if (coverage <= 0. && selected * liftEdge <= 0.) {
    color = vec4(0.);
    return;
  }

  vec2 normal = axis / max(length(axis), .001);
  vec2 body = mix(pos, bendFace(pos), mix(1., DARK_BEND, pillSmoke));
  // C30's smoked frost: a wider blur and a darker, flatter grey so titles behind
  // the bar do not read.
  vec3 wide = fieldSample(body);
  vec3 field = glassTone(wide, 0.);
  // As in C30, a band at the rim refracts: it draws in what lies past the edge and
  // bends it along the curve, while the centre stays flat under the grey frost.
  float band = 1. - smoothstep(0., 12., depth);
  // The rim band draws its own sample, so the body sample is taken only where it shows:
  // inside the band or under a settled selection.
  // The dark theme's body is Apple's soft blur (softFrost).
  softFrostMix = pillSmoke;
  vec3 bodyColor = band <= 0. || selected > 0. && pillMotion <= 0. ? smoked(glassColor(body, BODY_SPREAD), 0., field) : vec3(0.);
  // Apple Music's heavy blur (BODY_BLUR): the smoked frost gives way to the smoked wide field.
  vec3 blurColor = smokedBlur(field, 0.);
  float bodyBlur = mix(BODY_BLUR, DARK_BLUR, pillSmoke);
  bodyColor = mix(bodyColor, blurColor, bodyBlur);
  // Like Apple Music's bar at rest, the top band mirrors the content just under it: at depth d
  // inside MIRROR_BAND it draws from depth MIRROR_BAND + MIRROR_K * (MIRROR_BAND - d), so a title
  // behind the bar shows flipped and squeezed in the top edge (the dark theme's tighter, DARK_MIRROR).
  // Sides and bottom bend outward; the dark foot mirrors too (FOOT_MIRROR), drawing from deeper inside.
  float topFacing = smoothstep(.25, .75, -normal.y);
  float footFacing = pillSmoke * smoothstep(.25, .75, normal.y);
  float mirrorBand = mix(MIRROR_BAND, DARK_MIRROR.x, pillSmoke), mirrorK = mix(MIRROR_K, DARK_MIRROR.y, pillSmoke);
  float mirror = topFacing * (1. + mirrorK) * max(0., mirrorBand - depth) + footFacing * (1. + FOOT_MIRROR.y) * max(0., FOOT_MIRROR.x - depth);
  vec2 bent = body + normal * (12. * band * band * (1. - topFacing - footFacing) - mirror);
  // The mirrored title stays crisp but reads at Apple's low strength: it keeps MIRROR_MIX of
  // its contrast against the wide field colour.
  float mirrorZone = topFacing * (1. - smoothstep(mirrorBand - 2., mirrorBand, depth));
  // The band's frost eases into the centre's wider blur, so no contour shows where it ends.
  // The heavy blur stays out of the mirrored top band, so it reads crisp, as Apple's top edge.
  // The dark theme's mirrored zone frosts at MIRROR_SPREAD, so the flipped title stays crisp.
  float bandSpread = mix(mix(BODY_SPREAD, 1., band), MIRROR_SPREAD, mirrorZone * pillSmoke);
  // Below the mirrored zone the dark band frosts as the dark body does, so a title does not streak where the band begins.
  softFrostMix = pillSmoke * (1. - step(.001, mirrorZone));
  // The dark mirrored zone keeps its strokes: smoked() does not sink them toward the field there (darkEven).
  darkEven = 1. - mirrorZone;
  vec3 surface = band > 0. ? mix(smoked(mix(field, glassColor(bent, bandSpread), 1. - (1. - mix(MIRROR_MIX.x, MIRROR_MIX.y, pillSmoke)) * mirrorZone), 0., field), blurColor, bodyBlur * (1. - band) * (1. - mirrorZone)) : bodyColor;
  // The moving selection and the rest pill's clear glass keep the frost.
  softFrostMix = 0.;
  darkEven = 1.;
  // The dark theme's bar is Apple's dark smoke (DARK_SMOKE), the same at every motion: only the selection moves.
  surface = mix(surface, darkSmoke(surface), pillSmoke);
  // The light theme's pale frost (MILK_LIFT, MILK_GAIN). The mirrored band keeps MILK_MIRROR of its strokes over it.
  surface = mix(surface, MILK_LIFT + MILK_GAIN * surface + (1. - MILK_GAIN) * MILK_MIRROR * mirrorZone * (surface - blurColor),
                1. - pillSmoke);
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
      // The raised light lens's face: the art under it, bent and unfrosted (lensFace).
      vec3 clearArt = selectionColor;
      float clear = mix(PILL_CLEAR.x, PILL_CLEAR.y, pillSmoke) * (1. - pillMotion) * (1. - pillLift) * (1. - pillPress);
      vec3 clearGlass = vec3(0.), plainGlass = vec3(0.);
      if (pillMotion > 0.) {
        // One scale across the whole face, centred on the active sample: the raised lens's own LENS_ZOOM, so the art
        // keeps its size as the lens rises and falls. Only a narrow band at the edge refracts, drawing in
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
        vec2 core = pill.zw * .5 / LENS_ZOOM;
        vec2 room = min(samplePill.xy - core - lo, hi - samplePill.xy - core);
        vec2 fit = clamp(room / max(reach, .001), 0., 1.);
        vec2 pressWarp = samplePill.xy + pp / LENS_ZOOM + outward * fit * reach * (1. - sqrt(1. - edge * edge)) / (1. - sqrt(1. - .985 * .985));
        // The raised lens bends through its bevel instead (LENS_EDGE_REACH): outward, so the art just past its face
        // squeezes into the rim. Its furthest sample is LENS_EDGE_REACH past the face's own edge, pill.zw / 2 /
        // LENS_ZOOM from the active sample; where the crop would run out first (an end tab near the screen edge),
        // the reach is cut to the room, the same over the whole lens, so it never samples the clamped edge.
        float u = 1. - clamp(pillDepth / lensBevel(pillRadius), 0., 1.);
        float swell = 1. - clamp((pill.z * .5 - abs(pp.x)) / LENS_SWELL_SPAN, 0., 1.);
        vec2 face = pill.zw * .5 / LENS_ZOOM;
        vec2 edgeReach = clamp(min(samplePill.xy - face - lo, hi - samplePill.xy - face), 0., LENS_EDGE_REACH);
        vec2 lensWarp = samplePill.xy + pp * vec2(1., 1. - LENS_SWELL * swell * swell * swell) / LENS_ZOOM
                      + outward * edgeReach * u * u * u;
        vec2 warped = mix(pressWarp, lensWarp, pillLift);
        // Keep color edges legible after the lens magnifies the frosted scene. The bar's
        // smoke and wider frost return as motion falls, so the last moving frame is the rest pill.
        // One frost sample serves the moving selection and the clear glass it fades from.
        vec3 frosted = frost(mix(body, warped, pillMotion), mix(BODY_SPREAD, .67 * mix(1., LENS_SHARP, pillLift), pillMotion) * .5);
        clearArt = frosted;
        // MOTION-19: the held light lens's soft face (HOLD_SOFT). Zero at rest, in drag travel and in the dark theme.
        float holdSoft = HOLD_SOFT * pillPress * pillLift * (1. - pillSmoke) * (1. - smoothstep(HOLD_FACE.x, HOLD_FACE.y, u));
        if (holdSoft > 0.) clearArt = mix(frosted, softFrost(mix(body, warped, pillMotion)), holdSoft);
        selectionColor = mix(smoked(glassTone(frosted, pillMotion * pillLift), pillMotion, field), smokedBlur(field, pillMotion), bodyBlur * (1. - pillMotion));
        // The dark rest pill is the body's soft frost (softFrost), so as the motion falls the selection eases into that
        // sample: the last moving frame is the rest pill, and a press's first frame leaves it without a step. The clear
        // and plain glass below keep the frost, as at rest.
        float soften = pillSmoke * (1. - pillMotion);
        if (soften > 0.) {
          softFrostMix = pillSmoke;
          vec3 soft = mix(smoked(glassColor(body, BODY_SPREAD), 0., field), blurColor, bodyBlur);
          softFrostMix = 0.;
          selectionColor = mix(selectionColor, soft, soften);
        }
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
      // The dark theme's resting pill is Apple's smoked capsule (PILL_STEP): the bar's own smoke at this pixel, a little
      // darker, so the art still shows through it. A press and the raised lens take it back to their milky and clear
      // pieces. LOOK-10: it takes only the smoke's tone, so it reads as a neutral smoked capsule with the blue in the icon
      // and label alone (the council read the darkened art's colour as a blue one).
      float barLinear = srgbLinear(clamp(dot(darkSmoke(selectionColor), vec3(.2126, .7152, .0722)), 0., 1.));
      float pillStep = mix(PILL_STEP.x, PILL_STEP.y, smoothstep(PILL_STEP.z, PILL_STEP.w, barLinear));
      vec3 darkPill = vec3(linearSrgb(max((barLinear + .05) / pillStep - .05, 0.)));
      // LOOK-5: Apple's smoked capsule catches a faint light line along its edge, brightest at its ends and foot (about
      // +15 to +20 over the bar beside it in the video at 38.75 s), so it reads as glass, not a hole: PILL_DARK_RIM of white
      // over the bar rim's old dark depth (PILL_RIM).
      float pillRim = 1. - smoothstep(PILL_RIM.x, PILL_RIM.y, pillDepth);
      darkPill = mix(darkPill, vec3(1.), PILL_DARK_RIM * pillRim * (.55 + .45 * max(abs(pillNormal.x), max(0., pillNormal.y))));
      float domeUp = max(0., -pillNormal.y), domeDown = max(0., pillNormal.y);
      darkPill = mix(darkPill, vec3(1.), PILL_DOME.x * (1. - smoothstep(0., PILL_DOME.z, pillDepth)) * domeUp * domeUp);
      darkPill *= 1. - PILL_DOME.y * (1. - smoothstep(0., PILL_DOME.w, pillDepth)) * domeDown * domeDown;
      selection = mix(selection, darkPill, pillSmoke * (1. - pillLift) * (1. - pillPress));
      // The light theme's resting pill is the bar's own pale frost, PILL_MILK_DROP darker. A press lifts it to the
      // frost of its milky thumb, as the dark theme's press lifts its pill; the raised lens clears it smoothly.
      vec3 lightPill = mix(MILK_LIFT + MILK_GAIN * selectionColor - PILL_MILK_DROP, MILK_LIFT + MILK_GAIN * selection, pillPress);
      float lightLuma = dot(lightPill, vec3(.2126, .7152, .0722));
      lightPill = mix(lightPill, vec3(1.), clamp((PILL_LIGHT_FLOOR - lightLuma) / max(1. - lightLuma, .001), 0., 1.));
      selection = mix(selection, lightPill, (1. - pillSmoke) * (1. - pillLift));
      float lensU = 1. - clamp(pillDepth / lensBevel(pillRadius), 0., 1.);
      selection = mix(selection, lensFace(selectionColor, clearArt, pillNormal, pillDepth, lensU), pillLift);

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
  let reader:WebGLFramebuffer|null = null;
  return {
    /** The size of the backdrop last uploaded, in texels. */
    size:()=>[width,height] as const,
    /** LOOK-11: starts reading the uploaded backdrop's bytes over a texel box into a pack buffer, top row first as
     * getImageData gives them (the texture's first row is the canvas's top). poll() gives them once the GPU has written
     * them (null until then), so neither thread waits: the 2D backdrop is never read back, which made the browser stop
     * accelerating it, and a plain readPixels stalled 56 ms on the busy GPU thread in swiftshader (requestInk). */
    read(left:number, top:number, w:number, h:number) {
      const pack = gl.createBuffer();
      reader ??= gl.createFramebuffer();
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,reader);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pack);
      gl.bufferData(gl.PIXEL_PACK_BUFFER,4*w*h,gl.STREAM_READ);
      gl.readPixels(left,top,w,h,gl.RGBA,gl.UNSIGNED_BYTE,0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
      let fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      gl.flush();
      const cancel = ()=>{
        if (!fence) return;
        gl.deleteSync(fence);
        fence = null;
        gl.deleteBuffer(pack);
      };
      return {cancel, poll():Uint8Array|null {
        if (!fence || gl.isContextLost()) throw new Error('Section lens readback lost');
        if (gl.getSyncParameter(fence,gl.SYNC_STATUS)!==gl.SIGNALED) return null;
        const data = new Uint8Array(4*w*h);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pack);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,data);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
        cancel();
        return data;
      }};
    },
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

// LOOK-10 (council on aa6359ee): the dark resting pill sits PILL_STEP under the bar's smoke over every art, so the selected
// icon and label keep 2:1 against it by their ink, not by a darker pill. Once a rest frame holds still, pillUnder reads the
// backdrop the lens uploaded under the selected tab's icon and label, blurred as the dark bar blurs it (INK_BLUR, DARK_BLUR,
// of a box about the wide field's reach, the rest about the soft frost's with its bright detail sunk INK_EVEN of the way
// to the field, as smoked() sinks it), and takes the pill's luminance there (DARK_GLASS, then PILL_STEP). selectionAccent gives the least step of the #0099ff accent toward white (over a mid pill) or toward a
// deeper blue (over a bright one) that keeps ACCENT_FLOOR against INK_SHARE of the points, '' where #0099ff already does
// (section-lens.spec reads the median); its margin over 2:1 covers the model. LOOK-17: ACCENT is Apple's dark system blue,
// #0a84ff (hue 210, Apple's dark still 210.4; #0099ff read 204). section-navigation.css draws it at rest; press and drag keep their own accents.
const ACCENT = [10,132,255], ACCENT_DEEP = [0,32,92], ACCENT_FLOOR = 2.2;
const INK_STEP = [1.21,1.8,.02,.15], INK_BLUR = .2, INK_EVEN = .8, INK_FIELD = 10, INK_SOFT = .9, INK_REACH = 12, INK_SHARE = .85;
const srgbLinear = (value:number)=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
const inkLuminance = (rgb:number[])=>.2126*srgbLinear(rgb[0]/255)+.7152*srgbLinear(rgb[1]/255)+.0722*srgbLinear(rgb[2]/255);
/** The selected accent that keeps ACCENT_FLOOR against INK_SHARE of the pill luminances given, or '' for ACCENT (#0a84ff). */
export function selectionAccent(pills:number[]):string {
  // The contrast held at INK_SHARE of the points: thin bright strokes the pill blurs away do not move the ink alone.
  const floor = (rgb:number[])=>{
    const ink = inkLuminance(rgb);
    const ratios = pills.map(pill=>(Math.max(ink,pill)+.05)/(Math.min(ink,pill)+.05)).sort((x,y)=>x-y);
    return ratios[Math.floor((1-INK_SHARE)*(ratios.length-1))];
  };
  if (!pills.length || floor(ACCENT)>=ACCENT_FLOOR) return '';
  let best = ACCENT, most = floor(ACCENT);
  for (let step=1;step<=16;step++) for (const end of [[255,255,255],ACCENT_DEEP]) {
    const ink = ACCENT.map((value,i)=>Math.round(value+(end[i]-value)*step/16)), reached = floor(ink);
    if (reached>=ACCENT_FLOOR) return `rgb(${ink.join(' ')})`;
    if (reached>most) {
      best = ink;
      most = reached;
    }
  }
  return `rgb(${best.join(' ')})`;
}
/** The texel box of a width x height backdrop painted for crop that the ink reads round boxes (viewport css px). */
export type InkRegion = {left:number; top:number; w:number; h:number; sx:number; sy:number};
export function inkRegion(width:number, height:number, crop:Crop, boxes:DOMRect[]):InkRegion|null {
  if (!boxes.length || !width || !height) return null;
  const sx = width/crop.width, sy = height/crop.height;
  const left = Math.max(0,Math.floor((Math.min(...boxes.map(box=>box.left))-INK_REACH-crop.x)*sx));
  const top = Math.max(0,Math.floor((Math.min(...boxes.map(box=>box.top))-INK_REACH-crop.y)*sy));
  const right = Math.min(width,Math.ceil((Math.max(...boxes.map(box=>box.right))+INK_REACH-crop.x)*sx));
  const bottom = Math.min(height,Math.ceil((Math.max(...boxes.map(box=>box.bottom))+INK_REACH-crop.y)*sy));
  const w = right-left, h = bottom-top;
  return w>0 && h>0 ? {left,top,w,h,sx,sy} : null;
}
/** The dark rest pill's luminance every 2 css px over each box (viewport css px), from the backdrop's RGBA bytes over its
 * ink region, top row first. */
export function pillUnder(data:ArrayLike<number>, region:InkRegion, crop:Crop, boxes:DOMRect[]):number[] {
  return pillTables(data,region,crop)(boxes);
}
/** pillUnder for several sets of boxes over one region: the summed-area table is built once. */
export function pillTables(data:ArrayLike<number>, region:InkRegion, crop:Crop):(boxes:DOMRect[])=>number[] {
  const {left,top,w,h,sx,sy} = region;
  // A summed-area table of the art's tone gives each box mean in four reads.
  const sum = new Float64Array((w+1)*(h+1));
  for (let y=0;y<h;y++) {
    let row = 0;
    for (let x=0;x<w;x++) {
      const i = 4*(y*w+x);
      row += (.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;
      sum[(y+1)*(w+1)+x+1] = sum[y*(w+1)+x+1]+row;
    }
  }
  const mean = (x:number,y:number,reach:number)=>{
    const x0 = Math.max(0,Math.round(x-reach*sx)), x1 = Math.min(w,Math.round(x+reach*sx)+1);
    const y0 = Math.max(0,Math.round(y-reach*sy)), y1 = Math.min(h,Math.round(y+reach*sy)+1);
    return (sum[y1*(w+1)+x1]-sum[y0*(w+1)+x1]-sum[y1*(w+1)+x0]+sum[y0*(w+1)+x0])/Math.max(1,(x1-x0)*(y1-y0));
  };
  return boxes=>{
    const pills:number[] = [];
    for (const box of boxes) for (let v=box.top+1;v<box.bottom;v+=2) for (let u=box.left+1;u<box.right;u+=2) {
      const x = (u-crop.x)*sx-left, y = (v-crop.y)*sy-top;
      if (x<0 || y<0 || x>=w || y>=h) continue;
      const field = mean(x,y,INK_FIELD), soft = mean(x,y,INK_SOFT);
      const art = INK_BLUR*field+(1-INK_BLUR)*(soft+INK_EVEN*(Math.min(soft,field)-soft)), over = Math.max(0,art-.5);
      const tone = Math.min(1,32/255+.875*art-.402*over*over), bar = srgbLinear(tone);
      // PILL_STEP's step, deeper under brighter art as Apple's capsule (LOOK-17).
      const step = INK_STEP[0]+(INK_STEP[1]-INK_STEP[0])*smoothstep((bar-INK_STEP[2])/(INK_STEP[3]-INK_STEP[2]));
      pills.push(Math.max(0,(bar+.05)/step-.05));
    }
    return pills;
  };
}

// The raised lens may stand past the bar's end by up to LENS_END_ROOM css px toward the screen edge and
// LENS_MENU_ROOM toward the menu button (12 px away), and keeps at least LENS_MIN_ASPECT where that
// caps it, standing at least LENS_PROUD css px past the bar top and bottom. LENS_PAD is the surface's
// margin past the bar while it is drawn: the end room plus its edge.
const LENS_END_ROOM = 14, LENS_MENU_ROOM = 8, LENS_MIN_ASPECT = 1.36, LENS_PROUD = 3, LENS_PAD = 16;

/** The lens each bar last drew: [cx, cy, width, height] in the bar's on-screen css px, and the bar's own scale
 * (sx, sy) against its layout box. tabbar.ts sizes the glyph zoom from it, so the zoom covers the wide bubble. */
export const drawnLenses = new WeakMap<HTMLElement,{pill:number[]; sx:number; sy:number}>();

// MOTION-6 (#24 review): the frost's wide field reads mip level 3 of the backdrop crop (fieldSample: 8 device px a texel
// at density 1.5), whose texel grid is anchored at the crop's origin and pitched by its size. Rounding the bar's own edges
// moved that origin and size as the bar grows under a press (2 css px down and 7 css px wider at 390 px), so the same
// screen point read the field at another grid phase and the frosted body shifted by 3-5/255 with no change in the look.
// The crop now starts and ends on the screen's own grid of CROP_GRID device px, the mip-3 footprint: the rest and the
// grown bar read the field on the same screen grid (at 390 px they share the origin), and an end the viewport does not
// clip halves exactly down the mip chain, so the body holds still: assemble.py's body strip at Games +18 read max 3, mean
// .35/255 before and max 1, mean .03 after. The grid only ever widens the crop, by under CROP_GRID device px.
export const CROP_GRID = 8;
/** The backdrop crop for a bar's screen box: pad css px round it, inside the viewport, on the CROP_GRID device px grid. */
export function sectionCrop(bar:{left:number;top:number;right:number;bottom:number}, density:number, viewWidth:number, viewHeight:number, pad = 28):Crop|null {
  const near = (edge:number) => Math.max(0, Math.floor((edge - pad) * density / CROP_GRID) * CROP_GRID);
  const far = (edge:number, limit:number) => Math.min(Math.floor(limit * density), Math.ceil((edge + pad) * density / CROP_GRID) * CROP_GRID);
  const x = near(bar.left), y = near(bar.top);
  const width = far(bar.right, viewWidth) - x, height = far(bar.bottom, viewHeight) - y;
  if (width<=0 || height<=0) return null;
  return {x:x / density, y:y / density, width:width / density, height:height / density};
}

function geometryOf(element:HTMLElement, pillAnimating:boolean, dark:boolean):Geometry|null {
  const bar = element.getBoundingClientRect();
  if (!bar.width || !bar.height || bar.top>=innerHeight || bar.bottom<=0) return null;
  // The margin holds the furthest sample any pose reaches: the press warp's rim pull, which shows
  // only while the press raises the lens (up to about 26 px past the lens face at its LENS_ZOOM, cut to the room
  // the crop has), plus the frost taps. The bar's own
  // rim band reaches 12 px plus its taps. The raised lens's bevel reaches LENS_EDGE_REACH outward,
  // a couple of px past its own edge, and the shader cuts that reach, as the thumb's pull, where
  // the viewport clips this margin.
  const density = Math.min(1.5,devicePixelRatio);
  const crop = sectionCrop(bar,density,innerWidth,innerHeight);
  if (!crop) return null;
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
  return {bar,crop,pill:drawnPill,samplePill,opacity,lift:lift*raise,press,smoke:dark?1:0,motion,pad,projection,density};
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
  // LOOK-10: the crop the backdrop canvas holds and its paint count. LOOK-11: the paint and the tabs last inked (requestInk).
  let paintedCrop:Crop|null = null, paints = 0, inkedPaint = -1, inkedTabs:HTMLElement[] = [], inkVersion = 0;
  let inkTimer:ReturnType<typeof setTimeout>|undefined;
  // LOOK-11: the backdrop read in flight for the ink, and when it began; disposal cancels it.
  let inkRead:{cancel:()=>void; poll:()=>Uint8Array|null}|undefined, inkStarted = -Infinity;
  const tabsOf = ()=>[...bar.querySelectorAll<HTMLElement>('.ui-tab')];
  const inkable = ()=>!disposed && !lost && scheme.matches && bar.dataset.sectionLens==='webgl';
  // LOOK-11 (review I-1 on 691f4616): the ink landed 120 ms and a read after the bar came to rest, so a tab switch settled
  // in #0099ff (about 1.4:1 over a mid pill) and then eased to its blue with no settle repaint after it. Now every tab
  // carries its own ink, worked out from each backdrop paint as soon as the glyphs are at their rest size, so the tab a
  // tap or a drag selects already has its blue and eases to it inside the pill's release spring. While a paint is not yet
  // inked the bar holds data-ink-pending, which keeps tabbar.ts's settle repaint waiting for it, and an ink that changes
  // bumps data-ink, which re-arms that repaint after the colour ease (a scroll that stops, or art that arrives late).
  const INK_SPACING = 100;
  function inkPending(on:boolean) {
    if (bar.hasAttribute('data-ink-pending')!==on) bar.toggleAttribute('data-ink-pending',on);
  }
  function inkStale() {
    const tabs = tabsOf();
    return inkedPaint!==paints || tabs.length!==inkedTabs.length || tabs.some((tab,i)=>tab!==inkedTabs[i]);
  }
  // The glyphs at their rest size: no press or drag, and no lens zoom left on a tab, so their boxes are the rest boxes.
  const glyphsAtRest = ()=>!bar.matches('[data-pressing],[data-pill-dragging]') &&
    tabsOf().every(tab=>{const zoom = tab.style.getPropertyValue('--section-lens-zoom'); return !zoom || Number(zoom)===1;});
  function requestInk() {
    if (!inkable() || !gpu || !paintedCrop || !inkStale()) return inkPending(!!inkRead && inkable());
    inkPending(true);
    if (inkRead || inkTimer) return;
    // At most one read in flight, and while paints keep coming (a scroll) one every INK_SPACING; the last paint is always read.
    const wait = Math.max(glyphsAtRest() ? 0 : 50, inkStarted+INK_SPACING-performance.now());
    if (wait>0) {
      inkTimer = setTimeout(()=>{inkTimer = undefined; requestInk();},wait);
      return;
    }
    startInk(gpu,paintedCrop);
  }
  function startInk(renderer:NonNullable<typeof gpu>, crop:Crop) {
    const paint = paints, tabs = tabsOf();
    const tabBoxes = tabs.map(tab=>[tab.querySelector(':scope > span'),tab.querySelector(':scope > .ui-icon')]
      .flatMap(element=>element?[element.getBoundingClientRect()]:[]).filter(box=>box.width && box.height));
    // LOOK-11: the backdrop's bytes come from the texture the lens uploaded for paintedCrop (renderer.read), read without
    // a wait, never from the 2D canvas: one getImageData there made Chrome stop accelerating that canvas (+.4 ms a scroll
    // frame in swiftshader, and a 250-330 ms stall at the read that switched it).
    const [width,height] = renderer.size();
    const region = inkRegion(width,height,crop,tabBoxes.flat());
    if (!region) return inkWith(paint,tabs,tabs.map(()=>''));
    const read = renderer.read(region.left,region.top,region.w,region.h);
    inkRead = read;
    inkStarted = performance.now();
    const poll = ()=>{
      inkTimer = undefined;
      if (inkRead!==read) return;
      let data:Uint8Array|null = null;
      try {
        data = read.poll();
      } catch {
        inkRead = undefined;
        read.cancel();
        return requestInk();
      }
      if (!data && performance.now()-inkStarted<2000) {
        inkTimer = setTimeout(poll,16);
        return;
      }
      inkRead = undefined;
      read.cancel();
      if (data && inkable()) {
        const pills = pillTables(data,region,crop);
        inkWith(paint,tabs,tabBoxes.map(boxes=>selectionAccent(pills(boxes))));
      }
      // A newer paint since the read began is read in turn.
      requestInk();
    };
    inkTimer = setTimeout(poll,16);
  }
  function inkWith(paint:number, tabs:HTMLElement[], accents:string[]) {
    let changed = false;
    tabs.forEach((tab,i)=>{
      if (tab.style.getPropertyValue('--section-pill-adaptive-accent')===accents[i]) return;
      changed = true;
      if (accents[i]) tab.style.setProperty('--section-pill-adaptive-accent',accents[i]);
      else tab.style.removeProperty('--section-pill-adaptive-accent');
    });
    inkedPaint = paint;
    inkedTabs = tabs;
    if (changed) bar.dataset.ink = String(++inkVersion);
  }

  function fallback() {
    drawnLenses.delete(bar);
    bar.removeAttribute('data-section-lens');
    inkPending(false);
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
          paintedCrop = crop;
          paints++;
        }
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
    // LOOK-11: ink each new paint, a new tab set, or the first dark frame after a light spell (requestInk).
    requestInk();
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
    if (hostChanged || records.some(({target})=>target===document.documentElement || target===document.body ||
        document.head.contains(target))) invalidate();
    else schedule();
  });
  // Route renders replace the host's direct children. Only the current
  // paintable scene needs subtree updates.
  changes.observe(host,{childList:true,attributes:true,attributeFilter:attributes});
  changes.observe(bar,{childList:true,attributes:true,attributeFilter:attributes});
  changes.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','data-input']});
  changes.observe(document.body,{attributes:true,attributeFilter:['class']});
  // MOTION-11: a stylesheet added, edited or removed in <head> restyles the scene with no change inside it, so the lens
  // takes a fresh backdrop then, and again when a linked sheet loads. Without it the bar kept showing the old art
  // (clear-glass.spec :207 hides #content with a style tag and shoots the bar at once).
  changes.observe(document.head,{childList:true,subtree:true,characterData:true});
  if (bar.parentElement) changes.observe(bar.parentElement,{attributes:true,attributeFilter:['data-sheet-hidden']});

  const signal = events.signal;
  document.head.addEventListener('load',invalidate,{capture:true,signal});
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
    clearTimeout(inkTimer);
    inkRead?.cancel();
    inkRead = undefined;
    bar.removeAttribute('data-ink-pending');
    for (const tab of bar.querySelectorAll<HTMLElement>('.ui-tab')) tab.style.removeProperty('--section-pill-adaptive-accent');
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
