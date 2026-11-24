import {onGlassFrame,requestGlassFrame,watchGlassFrameSources} from './glass-frame-source';
import {createSectionBackdrop} from './section-backdrop';
import type {Crop} from './section-backdrop';
import {capsulePill} from './glass';

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
// The raised lens's bevel squeeze as a mip level (frostLod, MOTION-23 at frost()). MOTION-25: the dark lens's soft frost
// reads it too, so its bent art stays smooth; the bar's soft frost reads it at 0, unchanged.
float frostLod = 0.;
vec3 softFrost(vec2 pos) {
  vec2 uv = region.xy + pos * region.zw;
  float density = float(textureSize(scene, 0).x) * region.z;
  float lod = max(log2(max(1., .77 * DARK_RING * density)), frostLod);
  vec3 rgb = 2. * textureLod(scene, uv, lod).rgb;
  for (int i = 0; i < 8; i++) {
    float a = .3927 + .7854 * float(i);
    rgb += textureLod(scene, uv + vec2(cos(a), sin(a)) * DARK_RING * region.zw, lod).rgb;
  }
  return rgb * .1;
}
// MOTION-23 (#24 council on 071faed9: a blocky, pixelated fisheye inside the held lens): the raised lens's bevel squeezes
// the art it draws in up to about 5x toward the rim, and frost read it at mip 0, so it aliased into blocks. While the lens
// is up, frostLod is the mip level that squeeze needs (log2 of it), so the bent art stays smooth; elsewhere it is 0.
// F21 review (LOOK-23): the last soft frost frost() took and where, so the dark see-through colour reuses it (softTaken).
vec3 softTaken = vec3(0.);
vec2 softAt = vec2(-1e9);
vec3 frost(vec2 pos, float spread) {
  if (softFrostMix > .5) {
    softTaken = softFrost(pos);
    softAt = pos;
    return softTaken;
  }
  vec2 uv = region.xy + pos * region.zw;
  // Stagger the RGB samples to soften edges across angles.
  vec2 tapScale = region.zw * spread;
  vec2 nearX = vec2(1.50, .65) * tapScale;
  vec2 nearY = vec2(-.65, 1.50) * tapScale;
  vec2 farX = vec2(1.15, 3.05) * tapScale;
  vec2 farY = vec2(-3.05, 1.15) * tapScale;
  vec3 nearSamples = textureLod(scene, uv + nearX, frostLod).rgb + textureLod(scene, uv - nearX, frostLod).rgb
                   + textureLod(scene, uv + nearY, frostLod).rgb + textureLod(scene, uv - nearY, frostLod).rgb;
  vec3 farSamples = textureLod(scene, uv + farX, frostLod).rgb + textureLod(scene, uv - farX, frostLod).rgb
                  + textureLod(scene, uv + farY, frostLod).rgb + textureLod(scene, uv - farY, frostLod).rgb;
  return .16 * textureLod(scene, uv, frostLod).rgb + .105 * (nearSamples + farSamples);
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
const vec2 MIRROR_MIX = vec2(.29, .38);
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
const vec2 DARK_MIRROR = vec2(4., 5.), FOOT_MIRROR = vec2(8., 1.5);
// LOOK-14: the flipped title still read much fainter than Apple's (band13: peak stroke lift 51 over the band's body against
// the still's 91): smoked() sank its bright strokes DARK_EVEN (.8) of the way to the wide field, undoing most of
// MIRROR_MIX. The dark mirrored zone now takes none of that sink (darkEven), and keeps MIRROR_MIX.y .45 of its contrast:
// the flipped title's strokes lift +87 over the body (Apple +91, before +51), lit to 4.7 css px (Apple 4.0).
// LOOK-20: over Apple's own content, its section title under the bar's top half on a black page (tooling item 43), Apple's
// dark still holds the flipped title in the band's outer 3 css px, and the 5 css px under it are plain smoke (rows 3-7:
// column means spread 3.0 about a 31 mean). Ours ran on to 5 css px, the band's bend drawing the mirror from about 1.2 css
// px deeper (spread 7.8 about 44), and its strokes read brighter (p95 113 over the body at css px against Apple's 107).
// DARK_MIRROR 4/5 keeps the deepest sample, (1 + 5) x 4 = (1 + 3) x 6 = 24 css px, and squeezes the flipped title into the
// outer 3 css px; MIRROR_MIX.y .38 brings its strokes toward Apple's 107. Nothing is dimmed: under the zone the band takes its
// own body sample, as the rows below it do, so uniform and bright art read as before (LOOK-15's absolute dim drew a dark
// strip there).
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
// LOOK-20 (council on 071faed9: the dark bar went milky over bright art, pale grey frosted plastic over The Grand Budapest
// Hotel and The Martian, where Apple's bar shows the poster at nearly full colour under a light smoke). Read exactly on
// Charlie's video, the bar at 32.5 s against the same art seen clean above the mini player at 33.3 s as the page scrolls
// (aligned to 1 level rms): over bright art (luma 90 and up) Apple keeps .87 of the art's colour, its tone x.91 and .40 of
// its detail at css px; over mid art all of its colour. Ours kept .25 and .38 of the colour: the frost's grey veil, the
// smoke's coring and DARK_HUE leave about a third of a vivid colour. So where the wide field is bright (SEE_FIELD, in the
// art's own luma) the dark bar takes SEE_CHROMA of the art's own colour (its soft frost and wide field, as the body blurs
// it) in place of the smoked colour, keeping the smoke's tone, so the pill step, the pill over black and the ink are
// unchanged. Dark pages and titles over them read as before, the mirrored zone keeps its strokes, and at the ends the
// colour follows the band's bent sample, so the ends still bend the art.
const float SEE_CHROMA = .92;
const vec2 SEE_FIELD = vec2(.15, .4);
// LOOK-23 (LOOK-21's draft; LOOK-27 rebase): over mid art (luma 40-90) Apple keeps all of the art's colour (Charlie's video,
// 32.5 s against the same art clean at 33.3 s) and ours kept .65: SEE_FIELD began at a wide field of .15, so mid art took
// only part of the see-through colour. The bar body's field now runs from SEE_BODY .06 to .22, and over mid art the colour
// takes SEE_MID of the soft frost's colour (the frost dulls it a little), easing to SEE_CHROMA as the field brightens over
// SEE_BRIGHT, so bright art keeps its .87. Only the colour moves: the tone, the pill and the ink are as before. The raised
// dark lens (darkBar) keeps SEE_FIELD and SEE_CHROMA, so the held lens is unchanged.
// LOOK-27, like for like on Apple's own art (tools-look27/colour27.py: this body modelled on the video's clean art under
// its bar at 32.5, 32.9, 33.0 and 33.1 s, read as Apple's bar is read): colour kept over bright art .717 -> .892 and over
// mid art .511 -> .904 (Apple .886 and .947), the tone unchanged (x.722 and x1.161, Apple x.738 and x1.132). LOOK-23's
// SEE_DETAIL (.35) is left out: on the same art it lifts the bar over art of luma 120-170 9-10 levels past Apple's (2-4
// without it) and leaves the brightest marks 25 under (26 without it).
const vec2 SEE_BODY = vec2(.06, .22), SEE_BRIGHT = vec2(.2, .35);
const float SEE_MID = 1.1;
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
const vec4 PILL_DOME = vec4(.08, .35, 3., 4.);
// LOOK-20 (Grok on 071faed9: the dark rest pill read as a flat grey disc, where Apple's is a near-black convex lens with a
// bright specular arc that the title curves through). At device px over black Apple's still lifts the pill's cap edge to
// 67 over a 15 interior (+53, about 3 css px wide); ours rose +27 over a 25 interior, its .14 dome a soft glow over 5 css
// px. The rest pill now catches PILL_SPEC.x of white along the edges that face the top left light, over PILL_SPEC.y to .z
// css px, its dome narrower, and it refracts what lies behind it: it samples the art PILL_LENS.x css px further in at its
// edge, falling as the cube of the depth, so a title bends along the capsule's ends while the glyph middle is unmoved.
const vec3 PILL_SPEC = vec3(.3, .35, 1.4);
const float PILL_LENS = 6.;
// LOOK-23 (council on 6eaf6223, Opus 7.8 and Grok 8.3: over the Grand Budapest Hotel poster the dark rest pill read as a
// milky grey disc with navy ink, where Apple's stays a near-black smoked lens with its arc and bright blue ink). Read in
// Charlie's video inside the pill (inset 4 css px, glyph and label masked; tools-look23/miss23.py), Apple's interior
// sits at WCAG luminance .107 (sRGB 92) under a .214 bar over the bright green poster (19.5 s) and .041 (57) over the
// bright photo (32.5 s), its ink a lighter blue (38,173,253 and 31,166,255; 12,141,255 over black at 38.75 s). Ours took
// PILL_STEP of a much brighter bar (.482 over the hotel) to .262 (140), a neutral grey. The step still holds at the
// capsule's ends, where apple_match reads it (2-4.6 css px in); past PILL_CAP.z css px in, eased fully by .w, the pill's
// linear tone above PILL_CAP.x rolls off toward PILL_CAP.y, so over any art the interior under the glyph stays a dark
// lens that keeps #0a84ff at about 2:1 or more (dark art and black, under .04, are unchanged). It keeps PILL_TINT of the
// smoke's colour at the bar's own saturation, so it reads as smoked glass over the art, not a grey disc.
const vec4 PILL_CAP = vec4(.04, .085, 3., 8.);
// LOOK-26 (F22 review I-1 on c7f78314): that roll-off ran 3-8 css px in all round the capsule, so the selected label's
// lowest rows (its baseline about 6.6 css px from the pill's foot, its descenders about 4) and the glyph's top (about 6.5
// from the pill's top) stood on the brighter edge tone, about 1.9:1 and 1.1:1 over white art where the interior holds
// 2.8:1. Apple's pill is dark right up to its ink (item 48: rings 2-3 px out of the ink read .85-1.0x of the interior).
// Along the capsule's top and foot, where its normal is past PILL_CAP_RUN.w vertical, the roll-off now runs from
// PILL_CAP_RUN.x to .y css px in, so every glyph row from the descenders up stands on the near-black interior; the lit
// rim, the dome and the arc stay in the outer px. Toward the ends, where the normal is under PILL_CAP_RUN.z vertical
// (about 42 degrees off the bar's axis, outside the +-40 degrees where Apple's step was read), it keeps PILL_CAP.zw, so
// the step across the capsule's end is unchanged.
const vec4 PILL_CAP_RUN = vec4(1., 3., .67, .83);
// LOOK-29 (council 942de639, Opus and Grok: over bright art the dark rest pill read as a grey-brown disc, chroma 13 over the
// hotel, where Apple's smoked lens carries the poster's colour, 23.9-56.7). Like for like on Apple's own art
// (tools-look29/pill29.py: Charlie's video at 32.5 and 32.9 s, the Home pill, the art clean at 33.3333/34.15 s) Apple's pill
// keeps about all of the art's chroma (23.8 over art at 23.7; 8.6 over 10.6) where ours kept a third (8.2; 4.0). At 3 it
// reads 23.9 and 12.0 there, with its luminance held below.
const float PILL_TINT = 3.;
// LOOK-23 (#24: the dark rest pill over a title read the title's strokes nearly as plainly as the bar beside it). Read in
// the band 5 css px inside the capsule with the glyph column left out, Apple's pill at 38.75 s over "New Releases for You"
// reads median 16-18, p90 47, p99 52 (css px 16, 47, 51.5): its strokes sink to a third of the bar's lift, into a dark
// floor. Ours read 33 and 73 (title pose, device px; 24, 71 and 115 on capture_apple's title-150 at css px). Pulling the
// art toward the wide field's mean cannot do it: over a title the field is about the strokes' own level. So the pill
// floors on the darkest of fieldSample's four taps (fieldDark, its own taps, so no extra reads): where that floor is
// darker than the pixel's tone, the pill keeps PILL_FLOOR.x of the difference. Over uniform art every tap is the pixel's
// own tone, so the pill over black (11), the uniform-art step and the ink pins are unchanged. It fades out as the floor
// brightens (linear tone PILL_FLOOR.y to .z, about 39 to 68/255 under the smoke), so over bright posters the pill keeps
// its step (pill_step_bright 1.75, Apple 1.72), and only a title or marks over a dark page sink.
const vec3 PILL_FLOOR = vec3(.25, .02, .06);
// LOOK-27 (Grok on 874125ae: over bright posters the dark rest pill was a flat near-black disc, about 79, where Apple's at
// 19.5 s and 32.5 s is a smoked convex lens with the poster inside it, its detail and colour smoked down, about 92 and 57).
// PILL_CAP's roll-off acted on each pixel's own tone, so over bright art every pixel ran into the same ceiling and the
// poster's detail went flat. The roll-off now acts on the local mean, the wide field's own pill tone, and each pixel keeps
// its ratio to that mean, up to PILL_DETAIL.x times it: the poster shows inside at the capped level, smoked down. Over
// uniform art the pixel is its mean, so the interior, the step, the pill over black and every uniform-art pin are as
// before. Under the selected label's rows (from PILL_DETAIL.y css px below the pill's centre, eased over .z) the tone is
// anchored to the darkest of the field's taps (fieldDark) at its own capped level, never brighter, so the label keeps its
// ink's contrast (item 49) while the poster still shows darker detail there.
const vec3 PILL_DETAIL = vec3(2., 7., 2.);
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
// all round and brightest along the top. MOTION-12 (#24): the video's moving lens has the wider rim, 3.5 css px at half
// height at 13.5 s against the 12.75 s hold's 2, with about the same rainbow (fringe 13 and 10). So through drag travel
// the rim widens to LENS_RIM_DRAG along the top and bottom (weighted by how far the edge faces up or down, as the band;
// the ends keep the held rim), easing back to the held rim as the press holds the lens still.
// MOTION-13 (#24): the video's held rim is more colourful than the art on both sides of it (12.75 s: rim band p90 chroma
// 19 over 3 above and 3 inside along the top, 74 over 70 and 69 along the bottom; two-sided fringe 10).
// MOTION-19 (#24): that wider drag rim was the page, not the lens. With the same pixels at 10.5 s (no lens there, the
// page unmoved) subtracted, the video's 13.5 s drag rim is 2 css px at half height along the top (rows 28-29) and 1
// along the bottom, the same as the 12.75 s hold's (2 and 1); behaviour_match's 3.5 also counted the page's grey strip
// above the lens and the poster under it. So the moving lens keeps the held rim.
// MOTION-27 (#24): with that reading (tooling item 41) the video's held rim is 1.5 css px (2 rows at half height along
// its top, 1 along its foot) and its drag rim 2; ours read 2 and 2. So while the press holds the lens still (pillPress)
// its foot narrows to LENS_RIM_HELD_FOOT, one row at half height; the top, the ends and the drag rim are unchanged.
const float LENS_RIM = 2.2, LENS_RIM_DRAG = 2.2, LENS_RIM_HELD_FOOT = 1.2;
// MOTION-23 (#24 council on 071faed9: Opus saw a thick bright grey ring, Grok a pale hairline; the video settles it). Over
// the 10.5 s frame (no lens there, the page unmoved) the video's held rim (12.75 s, the middle 60% of each edge) is 2 css
// px at half height along the top and the foot, as ours, but only +49 and +44 luma over the art under it, where ours
// rose +152 and +110: a fifth of the way to white, not a bright ring. Its light is coloured, and the colour turns round
// the lens: cyan to green along the top and the lit left end (delta 39,66,70 and 44,50,34 over black; 28,69,52 at the
// end), warm toward magenta along the foot (53,44,32; 39,33,38), where ours carried an eighth of its light as colour. The
// 13.5 s drag rim is the same light and colours. So the rim mixes LENS_RIM_LIGHT (.x, less .y as its edge faces the light,
// so the top and the foot read alike, as the video's +49 and +44) toward LENS_RIM_TOP where the edge faces the light and
// LENS_RIM_FOOT where it faces away; that colour is the lens's rainbow.
// MOTION-25 (#24 council on 6eaf6223, Grok: the video's drag foot reads magenta, ours warm): at 13.5 s the video's foot
// is magenta only as the pink poster under it is (192,148,172 over 145,105,140); the light the rim adds is a warm white,
// +47,+43,+32 (hue 44; the 12.75 s hold +55,+41,+27, hue 30). A mix toward the old pink foot (1,.78,.95) added
// +30,+23,+25 over navy (hue 345) and turned blue over the orange poster (hue 214-226); LENS_RIM_FOOT is now that warm
// white, so the foot adds +45,+37,+16 over navy (hue 43) and stays near-neutral over bright art.
const vec2 LENS_RIM_LIGHT = vec2(.2, .03);
// MOTION-28 (#24 council on 874125ae, Opus and Grok: a plain grey ring, no colour): across its width the video's rim splits
// as a prism does. Over the 10.5 s no-lens frame its top adds +46,+60,+42 on the outer row (hue 108) and +50,+37,+26 on
// the inner (hue 27) at 13.5 s (+46,+48,+36 / +41,+30,+22 at 12.75 s); its foot +55,+50,+30 inside (hue 48) and +19,+24,+25
// outside (hue 190) at 12.75 s. One tint per edge (LENS_RIM_TOP, LENS_RIM_FOOT) read as grey on a 2 px line. So the rim's
// outer row mixes toward LENS_RIM_OUTER, a green white, and its inner row toward LENS_RIM_INNER, a warm white, at the same
// light (LENS_RIM_LIGHT): over dark art they add about +35,+45,+26 (hue 92) and +45,+31,+20 (hue 26), the brighter row as
// light as the old top's (+25,+43,+45).
const vec3 LENS_RIM_OUTER = vec3(.8, 1., .62), LENS_RIM_INNER = vec3(1., .72, .5);
// MOTION-11 (#24 council on aa6359ee) darkened the face in a band about 5 css px deep just inside the rim, along the top
// and bottom, as the video's held and dragged lens is dark there. MOTION-23 (#24 council on 071faed9: a dark halo round a
// bright ring, and over bright art a wide blotchy band): that dark band is the art the lens bends in, not a shade. Over
// the pink poster the video's held lens is dark just under its top edge (12.75 s, 2-5 px in: luma 48-74 against 118-137
// further in) where the page above the bar is black, and light where the art round it is light. The fixed darkening also
// darkened the band over a bright poster and the drag lens's own top rows, so the face is no longer darkened there.
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
// small gain (its lens reads 7-11% over bright art), with no floor and no veil.
// MOTION-25 (#24, tooling item 46: the held face against the bar body over the same art): Charlie's dark video's held lens
// is its bar body over the same art, a little brighter. Pixel for pixel the 12.75 s held face reads 1.126 x the 10.5 s
// body less 3 levels (correlation .987), and its luma spread over the body's is 1.14 both blurred (3-7 css px boxes) and in
// what those boxes leave (1.06-1.14): it keeps the bar's smoke and its soft blur. Ours showed the clear art (LENS_LIGHT_DARK
// .1 + LENS_BRIGHT 1.12 of the frost), 2.33 x the body's spread over Games +210's navy and white title (the navy 60 where
// the body reads 74, the title 228 where it reads 140) and 1.92 x over the bright Grand Budapest Hotel poster. So the dark
// lens is the dark bar's own look at its sample (darkBar) at LENS_DARK_GAIN of it: it still bends the art through its
// bevel, at pix1's mip level there, and its rim and glyph are unchanged. The light lens keeps the clear art.
// MOTION-27 (#24): only the held lens. Dragged, that face kept .61 of the bar body's clarity over the bright poster
// (dark Movies, the clarity band over the lens's top rows) against the video's .98, where the clear art keeps .91; so the
// dark lens takes the bar's look while the press holds it still (pillPress, as the held rim) and the clear art through
// the drag stretch, easing between the two with it.
// MOTION-28 (#24): dragged too. Charlie's video's 13.5 s drag face is its 10.5 s bar body over the same art, as its hold
// is: 1.152 x the body less 6 levels (correlation .984), its fine detail .99-1.10 of the body's; the clear art read 1.82 x
// less 53 over Games +210's navy (detail 2.75 against the video's 1.05). The .61 set the lens over The Martian against
// The Grand Budapest Hotel's busy windows beside it (the clarity band's body columns read 3.3, the same pixels' body 1.9);
// over the same pixels the band reads .99-1.03 of its body with the bar's look, 1.60-1.66 with the clear art, the video's
// .80. So the dark lens is the bar's look, held and dragged.
const float LENS_SHARP = .7, LENS_CLEAR = 1.08;
const vec2 LENS_DARK_GAIN = vec2(1.126, 3. / 255.);
// MOTION-23 (#24): no held-only softening. With the tab glyph masked in both frames, Charlie's video's held face keeps
// 1.05-1.24 of the bar body's detail over the same art (18 frame pairs over two holds) and 1.06 of the moving lens's,
// so the held lens is as clear as the dragged one. MOTION-19's .58 (the soft face this replaced) left the 10.5 s white
// Radio glyph in the body frame.
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
// LOOK-23: the darkest of fieldSample's four taps by luma (the dark rest pill's floor, PILL_FLOOR).
vec3 fieldDark = vec3(0.);
vec3 fieldSample(vec2 pos) {
  float density = float(textureSize(scene, 0).x) * region.z;
  float lod = log2(FIELD_TEXEL * density);
  float reach = 9. + 1.5 * exp2(ceil(lod - .01)) / density + RIM_SLACK;
  vec2 lo = -region.xy / region.zw + reach;
  vec2 hi = max(lo, (1. - region.xy) / region.zw - reach);
  vec2 uv = region.xy + clamp(pos, lo, hi) * region.zw;
  vec2 tapX = FIELD_TAP_X * region.zw, tapY = FIELD_TAP_Y * region.zw;
  vec3 a = textureLod(scene, uv + tapX, lod).rgb, b = textureLod(scene, uv - tapX, lod).rgb;
  vec3 c = textureLod(scene, uv + tapY, lod).rgb, d = textureLod(scene, uv - tapY, lod).rgb;
  vec3 W = vec3(.2126, .7152, .0722);
  fieldDark = dot(a, W) < dot(b, W) ? a : b;
  fieldDark = dot(c, W) < dot(fieldDark, W) ? c : fieldDark;
  fieldDark = dot(d, W) < dot(fieldDark, W) ? d : fieldDark;
  vec3 rgb = a + b + c + d;
  return rgb * .25;
}
// MOTION-25 (#24): the dark bar's body over the art at pos, as main() draws it: the soft frost smoked over the wide field
// with DARK_BLUR of the smoked field, Apple's dark smoke (darkSmoke), and over bright art SEE_CHROMA of the art's own
// colour (LOOK-20). The raised dark lens shows it (LENS_DARK_GAIN).
vec3 darkBar(vec2 pos) {
  // fieldSample also sets fieldDark (LOOK-23's dark rest pill floor, read later in main()): keep the body's.
  vec3 bodyDark = fieldDark;
  vec3 wide = fieldSample(pos), field = glassTone(wide, 0.), soft = softFrost(pos);
  fieldDark = bodyDark;
  vec3 tone = darkSmoke(mix(smoked(glassTone(soft, 0.), 0., field), smokedBlur(field, 0.), DARK_BLUR));
  vec3 seeArt = mix(soft, wide, DARK_BLUR);
  float toneL = dot(tone, vec3(.2126, .7152, .0722)), artL = dot(seeArt, vec3(.2126, .7152, .0722));
  float see = smoothstep(SEE_FIELD.x, SEE_FIELD.y, dot(wide, vec3(.2126, .7152, .0722)));
  return vec3(toneL) + mix(tone - toneL, SEE_CHROMA * (seeArt - artL), see);
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
// (LENS_RIM), a fifth of the way to a light that runs from cyan along its top to magenta along
// its foot (LENS_RIM_LIGHT, LENS_RIM_TOP, LENS_RIM_FOOT), as the video's.
vec3 lensFace(vec3 darkArt, vec3 clearArt, vec2 outward, float pillDepth, float u) {
  vec3 normal = normalize(vec3(outward * LENS_SLOPE * u * u, 1.));
  float facing = dot(normal.xy, normalize(vec2(-.25, -1.)));
  float shade = max(0., -facing);
  vec3 face = mix(min(clearArt * LENS_CLEAR, vec3(1.)), clamp(darkArt * LENS_DARK_GAIN.x - LENS_DARK_GAIN.y, 0., 1.), pillSmoke);
  face *= 1. - .22 * shade - .1 * (1. - normal.z);
  float facing2 = outward.y * outward.y, facing4 = facing2 * facing2, facing8 = facing4 * facing4;
  float rimDepth = mix(LENS_RIM, mix(LENS_RIM_DRAG, LENS_RIM, pillPress), facing8 * facing8);
  rimDepth = mix(rimDepth, LENS_RIM_HELD_FOOT, pillPress * smoothstep(.5, .9, outward.y));
  float line = smoothstep(-.6, .3, pillDepth) * (1. - smoothstep(rimDepth - .5, rimDepth + .5, pillDepth));
  float lit = LENS_RIM_LIGHT.x - LENS_RIM_LIGHT.y * max(0., facing);
  vec3 rimLight = mix(LENS_RIM_OUTER, LENS_RIM_INNER, smoothstep(.5, 1.5, pillDepth));
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
  // LOOK-20: over bright art the dark bar keeps the art's own colour (SEE_CHROMA, SEE_FIELD) under the smoke's tone.
  if (pillSmoke > 0.) {
    float wideL = dot(wide, vec3(.2126, .7152, .0722)), seeBright = smoothstep(SEE_BRIGHT.x, SEE_BRIGHT.y, wideL);
    float see = pillSmoke * smoothstep(SEE_BODY.x, SEE_BODY.y, wideL) * (1. - mirrorZone);
    // F21 review (LOOK-23): the body's or band's own soft frost at this point (softTaken); a new one only where the
    // band took the sparse frost (its mirrored rows) and the colour shows. Where see is 0 the art has no weight.
    vec2 seePos = band > 0. ? bent : body;
    vec3 seeArt = mix(softAt == seePos ? softTaken : see > 0. ? softFrost(seePos) : wide, wide, DARK_BLUR);
    float seeL = dot(surface, vec3(.2126, .7152, .0722)), artL = dot(seeArt, vec3(.2126, .7152, .0722));
    surface = vec3(seeL) + mix(surface - seeL, mix(SEE_MID, SEE_CHROMA, seeBright) * (seeArt - artL), see);
  }
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
      // MOTION-25: the raised dark lens's art (darkBar at its sample), held and dragged (MOTION-28).
      vec3 darkLens = vec3(0.);
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
        // The bevel's squeeze along its normal: d(sample)/d(screen) = 1 + 3 u^2 x reach / bevel (frostLod).
        frostLod = pillLift * log2(1. + 3. * u * u * dot(edgeReach, abs(outward)) / lensBevel(pillRadius));
        vec3 frosted = frost(mix(body, warped, pillMotion), mix(BODY_SPREAD, .67 * mix(1., LENS_SHARP, pillLift), pillMotion) * .5);
        if (pillSmoke > 0. && pillLift > 0.) darkLens = darkBar(mix(body, warped, pillMotion));
        frostLod = 0.;
        clearArt = frosted;
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
      if (pillSmoke > 0. && pillLift > 0. && pillMotion <= 0.) darkLens = darkBar(body);
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
      // LOOK-20: the rest pill refracts what lies behind it (PILL_LENS): its edge shows the art from further in.
      vec3 pillArt = selectionColor;
      // LOOK-27: the art's own colour at the pill's lens sample, for the see-through colour below (pillSee.x < 0: none).
      vec3 pillSee = vec3(-1.);
      if (pillSmoke > 0. && pillLift < 1. && pillPress < 1.) {
        float lu = 1. - clamp(pillDepth / pillRadius, 0., 1.);
        vec2 lensPos = body - pillNormal * PILL_LENS * lu * lu * lu;
        softFrostMix = pillSmoke;
        pillArt = mix(smoked(glassColor(lensPos, BODY_SPREAD), 0., field), blurColor, bodyBlur);
        softFrostMix = 0.;
        pillSee = mix(softFrost(lensPos), wide, DARK_BLUR);
      }
      float barLinear = srgbLinear(clamp(dot(darkSmoke(pillArt), vec3(.2126, .7152, .0722)), 0., 1.));
      // LOOK-23: the floor of the darkest nearby art (PILL_FLOOR): strokes over a dark page sink toward it.
      float floorTone = srgbLinear(clamp(dot(darkSmoke(smokedBlur(glassTone(fieldDark, 0.), 0.)), vec3(.2126, .7152, .0722)), 0., 1.));
      float floorBar = min(barLinear, floorTone);
      barLinear = mix(barLinear, floorBar + PILL_FLOOR.x * (barLinear - floorBar), 1. - smoothstep(PILL_FLOOR.y, PILL_FLOOR.z, floorTone));
      float pillStep = mix(PILL_STEP.x, PILL_STEP.y, smoothstep(PILL_STEP.z, PILL_STEP.w, barLinear));
      float pillTone = max((barLinear + .05) / pillStep - .05, 0.), pillOver = max(0., pillTone - PILL_CAP.x);
      vec2 capBand = mix(PILL_CAP.zw, PILL_CAP_RUN.xy, smoothstep(PILL_CAP_RUN.z, PILL_CAP_RUN.w, abs(pillNormal.y)));
      float flatTone = min(pillTone, PILL_CAP.x) + pillOver / (1. + pillOver / (PILL_CAP.y - PILL_CAP.x));
      // LOOK-27: the roll-off on the local mean (the wide field's pill tone); the pixel keeps its ratio to it (PILL_DETAIL).
      float wideLinear = srgbLinear(clamp(dot(darkSmoke(blurColor), vec3(.2126, .7152, .0722)), 0., 1.));
      float wideTone = max((wideLinear + .05) / mix(PILL_STEP.x, PILL_STEP.y, smoothstep(PILL_STEP.z, PILL_STEP.w, wideLinear)) - .05, 0.);
      float wideOver = max(0., wideTone - PILL_CAP.x), wideCapped = min(wideTone, PILL_CAP.x) + wideOver / (1. + wideOver / (PILL_CAP.y - PILL_CAP.x));
      float detailTone = mix(flatTone, wideCapped * min(PILL_DETAIL.x, pillTone / max(wideTone, 1e-4)), smoothstep(PILL_CAP.x, PILL_CAP.y, wideTone));
      float darkLinear = srgbLinear(clamp(dot(darkSmoke(smokedBlur(glassTone(fieldDark, 0.), 0.)), vec3(.2126, .7152, .0722)), 0., 1.));
      float darkTone = max((darkLinear + .05) / mix(PILL_STEP.x, PILL_STEP.y, smoothstep(PILL_STEP.z, PILL_STEP.w, darkLinear)) - .05, 0.);
      float darkOver = max(0., darkTone - PILL_CAP.x), darkCapped = min(darkTone, PILL_CAP.x) + darkOver / (1. + darkOver / (PILL_CAP.y - PILL_CAP.x));
      detailTone = mix(detailTone, min(detailTone, darkCapped), smoothstep(PILL_DETAIL.y, PILL_DETAIL.y + PILL_DETAIL.z, pp.y));
      pillTone = mix(pillTone, detailTone, smoothstep(capBand.x, capBand.y, pillDepth));
      vec3 smokeColor = darkSmoke(pillArt);
      // LOOK-27 (Grok on 874125ae: the pill over bright posters read as a grey disc, where Apple's smoked lens keeps the
      // poster's colour inside it, smoked down): over bright art the bar body shows SEE_CHROMA of the art's own colour
      // (LOOK-20), but the pill kept the smoke's cored colour. It now takes the same see-through colour at its lens sample,
      // as the bar does where the wide field is bright (SEE_FIELD), scaled to its own tone below (PILL_TINT). Only the
      // colour moves, so the pill's tone, the step, the ink and the label's contrast are as before.
      if (pillSee.x >= 0.) {
        float smokeL = dot(smokeColor, vec3(.2126, .7152, .0722));
        float pillSeeL = dot(pillSee, vec3(.2126, .7152, .0722));
        smokeColor = vec3(smokeL) + mix(smokeColor - smokeL, SEE_CHROMA * (pillSee - pillSeeL), smoothstep(SEE_FIELD.x, SEE_FIELD.y, dot(wide, vec3(.2126, .7152, .0722))));
      }
      float smokeLuma = dot(smokeColor, vec3(.2126, .7152, .0722)), pillGrey = linearSrgb(pillTone);
      vec3 darkPill = max(vec3(pillGrey) + PILL_TINT * (smokeColor - smokeLuma) * pillGrey / max(smokeLuma, .02), 0.);
      // LOOK-29 (F24 review m-2 on 639c0c73): the colour raised the pill's linear luminance over saturated art (11-28%), which
      // the grey ink model does not see (label contrast over uniform pink 2.53 -> 2.23, red 2.74 -> 2.44). The pill is now
      // scaled in linear light to pillTone's luminance, so only its colour moves and the ink model is exact again; over
      // grey art the scale is 1, and it is never above 1 (srgbLinear is convex), so no channel overflows.
      vec3 pillLin = vec3(srgbLinear(darkPill.r), srgbLinear(darkPill.g), srgbLinear(darkPill.b));
      pillLin *= pillTone / max(dot(pillLin, vec3(.2126, .7152, .0722)), 1e-5);
      darkPill = vec3(linearSrgb(pillLin.r), linearSrgb(pillLin.g), linearSrgb(pillLin.b));
      // LOOK-5: Apple's smoked capsule catches a faint light line along its edge, brightest at its ends and foot (about
      // +15 to +20 over the bar beside it in the video at 38.75 s), so it reads as glass, not a hole: PILL_DARK_RIM of white
      // over the bar rim's old dark depth (PILL_RIM).
      float pillRim = 1. - smoothstep(PILL_RIM.x, PILL_RIM.y, pillDepth);
      darkPill = mix(darkPill, vec3(1.), PILL_DARK_RIM * pillRim * (.55 + .45 * max(abs(pillNormal.x), max(0., pillNormal.y))));
      float domeUp = max(0., -pillNormal.y), domeDown = max(0., pillNormal.y);
      darkPill = mix(darkPill, vec3(1.), PILL_DOME.x * (1. - smoothstep(0., PILL_DOME.z, pillDepth)) * domeUp * domeUp);
      darkPill *= 1. - PILL_DOME.y * (1. - smoothstep(0., PILL_DOME.w, pillDepth)) * domeDown * domeDown;
      // LOOK-20: the specular arc along the edges that face the top left light (PILL_SPEC).
      float specUp = max(0., dot(pillNormal, vec2(-.5, -.866)));
      darkPill = mix(darkPill, vec3(1.), PILL_SPEC.x * (1. - smoothstep(PILL_SPEC.y, PILL_SPEC.z, pillDepth)) * specUp * specUp);
      selection = mix(selection, darkPill, pillSmoke * (1. - pillLift) * (1. - pillPress));
      // The light theme's resting pill is the bar's own pale frost, PILL_MILK_DROP darker. A press lifts it to the
      // frost of its milky thumb, as the dark theme's press lifts its pill; the raised lens clears it smoothly.
      vec3 lightPill = mix(MILK_LIFT + MILK_GAIN * selectionColor - PILL_MILK_DROP, MILK_LIFT + MILK_GAIN * selection, pillPress);
      float lightLuma = dot(lightPill, vec3(.2126, .7152, .0722));
      lightPill = mix(lightPill, vec3(1.), clamp((PILL_LIGHT_FLOOR - lightLuma) / max(1. - lightLuma, .001), 0., 1.));
      selection = mix(selection, lightPill, (1. - pillSmoke) * (1. - pillLift));
      float lensU = 1. - clamp(pillDepth / lensBevel(pillRadius), 0., 1.);
      selection = mix(selection, lensFace(darkLens, clearArt, pillNormal, pillDepth, lensU), pillLift);

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
// (section-lens.spec reads the median and, since LOOK-26, the 5th percentile); its margin over 2:1 covers the model. LOOK-23: lighter blues only (no deeper one). LOOK-17: ACCENT is Apple's dark system blue,
// #0a84ff (hue 210, Apple's dark still 210.4; #0099ff read 204). section-navigation.css draws it at rest; press and drag keep their own accents.
const ACCENT = [10,132,255], ACCENT_FLOOR = 2.6;
// LOOK-26 (F22 review I-1): INK_SHARE's tail let the pill's brighter edge band under the label's lowest rows pass unseen
// (about 18% of the points). The ink must also keep ACCENT_LOW against INK_LOW of the points, so no allowance absorbs a
// band: the floor holds down to the label's lowest rows, as section-lens.spec now reads it (the 5th percentile, 2:1).
// With that band gone from under the glyphs (PILL_CAP_RUN), the same 2.2 would have let #0a84ff back over bright art at
// 2.2:1 (the band's points had pushed the ink lighter). ACCENT_FLOOR is now Apple's own contrast there, 2.6 (its ink
// against the pill's interior over the bright poster at 19.5 s reads 2.69:1, item 48), so over bright art the ink stays
// c7f78314's lighter blue (the hotel rgb(41,147,255) 2.6:1, white rgb(56,155,255) 2.8:1); over dark art #0a84ff is unchanged.
const ACCENT_LOW = 2, INK_LOW = .95;
const INK_STEP = [1.21,1.8,.02,.15], INK_BLUR = .2, INK_EVEN = .8, INK_FIELD = 10, INK_SOFT = .9, INK_REACH = 12, INK_SHARE = .85;
// LOOK-23 (F21 review note a): the model reads the pill as the shader draws it. Its art comes from INK_LENS (PILL_LENS) css
// px further in at the capsule's edge, falling as the cube of the depth (20ea5577), up to about 2.5 css px at the label's
// lowest rows. The floor of the darkest of the field's four taps (INK_TAPS, FIELD_TAP_X/Y, each a mip texel INK_TEXEL css
// px across) sinks it as PILL_FLOOR does (INK_FLOOR). Over uniform art neither moves it.
const INK_LENS = 6, INK_FLOOR = [.3,.02,.06], INK_TEXEL = 16/3, INK_TAPS = [[9,3.9],[-9,-3.9],[-3.9,9],[3.9,-9]];
// LOOK-23 (council on 6eaf6223): the interior's roll-off (PILL_CAP), by the point's depth in its tab's capsule.
const INK_CAP = [.04,.085,3,8];
// LOOK-27: the roll-off acts on the local mean and each point keeps its ratio to it (PILL_DETAIL), anchored under the label
// rows to the darkest tap's capped tone.
const INK_DETAIL = [2,7,2];
// LOOK-26 (F22 review I-1): along the capsule's top and foot the roll-off runs INK_CAP_RUN[0] to [1] css px in (PILL_CAP_RUN),
// easing in as the point's normal turns from INK_CAP_RUN[2] to [3] vertical.
const INK_CAP_RUN = [1,3,.67,.83];
/** A tab's rest pill, a capsule in viewport css px. */
export type InkPill = {x:number; y:number; w:number; h:number};
const srgbLinear = (value:number)=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
const inkLuminance = (rgb:number[])=>.2126*srgbLinear(rgb[0]/255)+.7152*srgbLinear(rgb[1]/255)+.0722*srgbLinear(rgb[2]/255);
/** The selected accent that keeps ACCENT_FLOOR against INK_SHARE of the pill luminances given, or '' for ACCENT (#0a84ff). */
export function selectionAccent(pills:number[]):string {
  // The contrast held at INK_SHARE of the points: thin bright strokes the pill blurs away do not move the ink alone.
  const floor = (rgb:number[])=>{
    const ink = inkLuminance(rgb);
    const ratios = pills.map(pill=>(Math.max(ink,pill)+.05)/(Math.min(ink,pill)+.05)).sort((x,y)=>x-y);
    return Math.min(ratios[Math.floor((1-INK_SHARE)*(ratios.length-1))],ratios[Math.floor((1-INK_LOW)*(ratios.length-1))]*ACCENT_FLOOR/ACCENT_LOW);
  };
  if (!pills.length || floor(ACCENT)>=ACCENT_FLOOR) return '';
  // LOOK-23 (council on 6eaf6223): toward white only. Apple's selected ink turns a lighter blue over bright art (Charlie's
  // video: 12,141,255 over black at 38.75 s, 38,173,253 and 31,166,255 over the bright poster and photo at 19.5 and
  // 32.5 s), never navy, and the pill's interior stays dark enough (PILL_CAP) that a lighter blue keeps the floor.
  let best = ACCENT, most = floor(ACCENT);
  for (let step=1;step<=16;step++) for (const end of [[255,255,255]]) {
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
 * ink region, top row first. With the tab's rest pill the art is read where the pill refracts it (INK_LENS). */
export function pillUnder(data:ArrayLike<number>, region:InkRegion, crop:Crop, boxes:DOMRect[], pill?:InkPill):number[] {
  return pillTables(data,region,crop)(boxes,pill);
}
/** pillUnder for several sets of boxes over one region: the summed-area table is built once. */
export function pillTables(data:ArrayLike<number>, region:InkRegion, crop:Crop):(boxes:DOMRect[], pill?:InkPill)=>number[] {
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
  // The smoked bar's linear luminance over art of luma art (DARK_GLASS on the art's own tone).
  const barOf = (art:number)=>{
    const over = Math.max(0,art-.5);
    return srgbLinear(Math.min(1,32/255+.875*art-.402*over*over));
  };
  return (boxes,pill)=>{
    const pills:number[] = [];
    for (const box of boxes) for (let v=box.top+1;v<box.bottom;v+=2) for (let u=box.left+1;u<box.right;u+=2) {
      const x = (u-crop.x)*sx-left, y = (v-crop.y)*sy-top;
      if (x<0 || y<0 || x>=w || y>=h) continue;
      // The pill's art is read INK_LENS * (1 - depth / radius)^3 css px further in, toward the capsule's axis.
      let lx = x, ly = y, depth = Infinity, vertical = 1;
      if (pill) {
        const radius = Math.min(pill.w,pill.h)/2, run = Math.max(0,Math.abs(pill.w-pill.h)/2);
        const px = u-pill.x-pill.w/2, py = v-pill.y-pill.h/2;
        const ax = pill.w>=pill.h ? px-Math.min(run,Math.max(-run,px)) : px, ay = pill.w>=pill.h ? py : py-Math.min(run,Math.max(-run,py));
        const reach = Math.hypot(ax,ay), lu = 1-Math.min(1,Math.max(0,(radius-reach)/radius)), shift = INK_LENS*lu*lu*lu/Math.max(reach,.001);
        depth = radius-reach;
        vertical = Math.abs(ay)/Math.max(reach,.001);
        lx = x-ax*shift*sx;
        ly = y-ay*shift*sy;
      }
      const field = mean(x,y,INK_FIELD), soft = mean(lx,ly,INK_SOFT);
      const art = INK_BLUR*field+(1-INK_BLUR)*(soft+INK_EVEN*(Math.min(soft,field)-soft));
      let bar = barOf(art);
      // PILL_FLOOR: the darkest of the field's taps, where it is dark, sinks the pill toward it.
      let dark = Infinity;
      for (const [tx,ty] of INK_TAPS) dark = Math.min(dark,mean(x+tx*sx,y+ty*sy,INK_TEXEL/2));
      const floorTone = barOf(dark), floorBar = Math.min(bar,floorTone);
      bar += (1-smoothstep((floorTone-INK_FLOOR[1])/(INK_FLOOR[2]-INK_FLOOR[1])))*(floorBar+INK_FLOOR[0]*(bar-floorBar)-bar);
      // PILL_STEP's step, deeper under brighter art as Apple's capsule (LOOK-17).
      const step = INK_STEP[0]+(INK_STEP[1]-INK_STEP[0])*smoothstep((bar-INK_STEP[2])/(INK_STEP[3]-INK_STEP[2]));
      // PILL_CAP: past INK_CAP[2] css px in, the tone above INK_CAP[0] rolls off toward INK_CAP[1].
      const tone = Math.max(0,(bar+.05)/step-.05);
      const run = smoothstep((vertical-INK_CAP_RUN[2])/(INK_CAP_RUN[3]-INK_CAP_RUN[2]));
      const from = INK_CAP[2]+run*(INK_CAP_RUN[0]-INK_CAP[2]), to = INK_CAP[3]+run*(INK_CAP_RUN[1]-INK_CAP[3]);
      const capped = (t:number)=>Math.min(t,INK_CAP[0])+Math.max(0,t-INK_CAP[0])/(1+Math.max(0,t-INK_CAP[0])/(INK_CAP[1]-INK_CAP[0]));
      const toneOf = (b:number)=>Math.max(0,(b+.05)/(INK_STEP[0]+(INK_STEP[1]-INK_STEP[0])*smoothstep((b-INK_STEP[2])/(INK_STEP[3]-INK_STEP[2])))-.05);
      const wideTone = toneOf(barOf(field)), wideCapped = capped(wideTone);
      let detail = capped(tone)+smoothstep((wideTone-INK_CAP[0])/(INK_CAP[1]-INK_CAP[0]))*(wideCapped*Math.min(INK_DETAIL[0],tone/Math.max(wideTone,1e-4))-capped(tone));
      if (pill) detail += smoothstep((v-pill.y-pill.h/2-INK_DETAIL[1])/INK_DETAIL[2])*(Math.min(detail,capped(toneOf(floorTone)))-detail);
      pills.push(tone+smoothstep((depth-from)/(to-from))*(detail-tone));
    }
    return pills;
  };
}

// The raised lens may stand past the bar's end by up to LENS_END_ROOM css px toward the screen edge and
// LENS_MENU_ROOM toward the menu button (12 px away), and keeps at least LENS_MIN_ASPECT where that
// caps it, standing at least LENS_PROUD css px past the bar top and bottom. LENS_PAD is the surface's
// margin past the bar while it is drawn: the end room plus its edge.
const LENS_END_ROOM = 14, LENS_MENU_ROOM = 8, LENS_MIN_ASPECT = 1.36, LENS_PROUD = 3, LENS_PAD = 16;
// MOTION-23 (#24 council: the held bubble stands proud of the bar): the video's held lens (12.75 s, 73 css px on the
// 66 px grown bar) stands 4 px over the bar top and 3 under its bottom, its centre LENS_HOLD_RISE bar heights above the
// bar's; the 13.5 s drag lens is centred (2 and 2). So the press raises the drawn lens and its sample by that much.
const LENS_HOLD_RISE = .0076;

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
  const holdRise = projection * press * LENS_HOLD_RISE * bar.height;
  const samplePill = projection > 0 ? [
    cx,
    cy + projection * (bar.height/2 - cy) - holdRise,
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
    cy + projection * (bar.height/2 - cy) - holdRise,
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
    // Each tab's rest pill (glass.ts capsulePill, as the stylesheet places it), where the shader refracts the art it shows.
    const barBox = bar.getBoundingClientRect(), after = getComputedStyle(bar,'::after');
    const inset = parseFloat(after.top)||0, bleed = parseFloat(after.getPropertyValue('--section-pill-bleed'))||0;
    const scaleX = barBox.width/(bar.offsetWidth||1), scaleY = barBox.height/(bar.offsetHeight||1), count = tabs.filter(tab=>tab.offsetWidth).length;
    const pills = tabs.map(tab=>{
      const pill = capsulePill({left:tab.offsetLeft,width:tab.offsetWidth},{width:bar.clientWidth,tabs:count,inset,bleed});
      return {x:barBox.left+(bar.clientLeft+pill.left-bleed)*scaleX, y:barBox.top+(bar.clientTop+inset)*scaleY,
        w:(pill.width+2*bleed)*scaleX, h:(bar.clientHeight-2*inset)*scaleY};
    });
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
        const tables = pillTables(data,region,crop);
        inkWith(paint,tabs,tabBoxes.map((boxes,i)=>selectionAccent(tables(boxes,pills[i]))));
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
