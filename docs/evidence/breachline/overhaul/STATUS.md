# Breachline visual overhaul: status

Plan: `docs/superpowers/plans/2026-11-11-breachline-visual-overhaul.md`. Branch: `claude/zen-allen-otdlt6`.

## Current phase: Lab vertical slice (after phase 0; see the plan's "Re-ordering after phase 0")

Weapons, hands and fighters (rows E and F, phases 6 and 7) now belong to the hero session (`render/hero/`,
`docs/evidence/breachline/hero/`). This session supplies its lighting through `HeroLighting`. Next here: Lab lighting
contrast and modelled fixtures, visible specular, post chain basics, dense Lab props; then KTX2 and the phase-1
renderer work, measured against section 5.

## Lab slice, round 2 (evidence: `lab-slice/round-2/`)

From the reviewer's mid-slice look (at 90eeca9) and my own list:

1. **Floor specular now visible.** In a reflection-only render the floor reflections were already strong; the bright
   diffuse floor swamped them. The tile albedo is lowered (floor midtones about a third, as asked), it is glossier
   (roughness about 0.08), and its reflection carries a 2.6x sealed-surface multiplier. `lab-west-high.png` shows
   the sheen and the fittings' reflections along the walls.
2. **Vignette eased** (strength 0.16, starting further out), so the ceiling near the camera is no longer crushed.
3. **Wall band no longer flat:** semi-gloss (it catches the fittings), grime towards boot height, a painted skirting
   zone; the dado rail and skirting are geometry on the solid wall.
4. **Ceiling grid with depth:** T-bars at 600 mm and wall angle trim, over the tile joints, lit by the ceiling's own
   lightmap (`lab-ceiling-high.png`).

Scores (Lab, from `lab-slice/round-2/`): A 6, B 6 (floor and band now reflect), C 6, D 6, H 5. Budgets on these
frames: 36k-91k triangles, 55-102 draw calls (unchanged texture memory). Still to reach 7: door leaves and deeper
frames, more on the benches' far ends and walls (noticeboard, fume cupboard), stronger plaster normals, prop LODs,
then KTX2.



Not at the slice gate yet (rows A-D at 7). Done this round, in the order the reviewer asked:

1. **Light contrast.** Troffer beams tightened (cos^2), sharp contact occlusion on bounced light, 16 texels/m,
   four fittings over the walkways; modelled fittings (housing, rim, prismatic lens) with a baked hot spot on the
   ceiling around each (`lab-ceiling-high.png`).
2. **Specular.** The reflection probe was black (cube faces were never cleared because the game renders with
   `autoClear` off); fixed. Reflections are box-projected onto the room; specular occlusion is normalised to the
   room's mean baked light (it had been normalised to a probe that sees the lamps, which hid the floor's
   reflections). Lenses now carry near-physical radiance, so they show in reflections and bloom.
3. **Post chain** (`render/post.ts`), brought forward: half-float HDR target (MSAA 4x on High), soft-knee bloom
   pyramid, ACES, a lift/gamma/gain grade (cool, slightly desaturated shadows, warm neutral highlights), vignette.
   The throttled tier keeps the renderer's own curve and no post. **Grade direction chosen:** institutional
   blue-grey (walls, casework, trim) against warm beige floors and timber, cool fluorescent light; surfaces in
   later rooms are held to this.
4. **Dense dressing** (`render/labdress.ts`, `render/detail.ts`): bench cabinetry with doors, drawers, bar handles,
   kick plates and end panels; lockers with louvres, latches and number plates; a sink with a gooseneck tap;
   reagent bottles; sockets; a switch on conduit; skirting and a dado rail on the solid wall (painted skirting zone
   on the destructible panels). Every piece borrows the lightmap of the surface it stands on, so it carries the
   baked light and contact shadow with no extra bake or lights.
5. Barricade boards use a CC0 photo set (`raw_plank_wall`, Dimitrios Savva) lit by the panel bake; frames lifted
   off pure black.

Bugs found by looking: the room split rejected faces whose origin lay outside the room on their vertical axis, so
the west end of the Lab's north wall still drew the old way (fixed, rebaked; the stale-bake test caught the
geometry change); on Low, "metal" dressing rendered black without a reflection probe (now painted on Low).

**Scores now (Lab only, from `lab-slice/round-1/`):**

| Row | Phase 0 (reviewer) | Now | Evidence |
| --- | --- | --- | --- |
| A Lighting | 4 | 6 | `lab-west-high.png`: hot spots, darker upper walls and corners, contact shadow under benches and stools; still too even across the floor. |
| B Shading | 3 | 5 | `lab-bench-high.png`: reflections on worktops, bottles and chrome; floor gloss subtle; normal detail on plaster mostly invisible at this exposure. |
| C Texture | 5 | 6 | Photo floor, walls, casework, boards; ceiling tiles and lockers' sides are still procedural or tinted. |
| D Geometry | 2 | 6 | `lab-high.png`: cabinetry, lockers, sink and tap, bottles, sockets, conduit; the room shell is still flat boxes (no ceiling grid in depth, no door leaves, plain posts). |
| H Post | 2 | 5 | Bloom, grade and vignette on High; no AO or depth of field. |

**What would take A-D to 7 next round:** a ceiling grid with depth and a better tile; stronger falloff between
fittings (fewer bounce lumens, or an exposure that lets midtones sit lower); door leaves and frames with depth;
noticeboard, fume cupboard or equipment on the benches' far ends; normal-map strength on plaster; then KTX2 so the
1K sets ship.

**Budgets measured on the Lab bookmarks (High, this container):** triangles in view 36k-91k (budget 500k);
draw calls 54-101 (budget 400); textures for the Lab art about 15 MB of GPU memory at 1K (4 surface sets 11.2 MB,
5 prop sets 3.5 MB, lightmaps 1.2 MB) plus the post chain about 40 MB at 1280x720 (MSAA HDR target and bloom
levels) and the reflection probe about 4 MB; committed art 9.4 MB (all of it at 512 px until KTX2). Script time
per frame is not measured yet (phase-1 counters). The props are still at full resolution (about 50k of the 90k
triangles); LODs are on the list.

**Hero lighting:** `HeroLighting.environment(x, z)` now returns the Lab's reflection probe inside the Lab (null elsewhere); `probe` is still the old per-vertex bake adapter until the light grid lands.

**Tests this round:** `npx tsc --noEmit` clean; `npx vitest run tests/games/breachline` 53 passed; browser tests (solo flow and two-device online) 7 passed.

**What ARM devices get today:** no S3TC, so the 512 px JPEG fallbacks, uncompressed in GPU memory (about 3x the
compressed size). KTX2/Basis (transcoding to ETC2/ASTC) is what fixes this; it is the next renderer task after the
slice.



**Gate verdict.** The Lab now uses photo-sourced CC0 materials, GPU-compressed textures loaded with no WebAssembly
under the real site CSP, a ray-traced lightmap with soft shadows and two bounces, a dominant-direction map so normal
maps shade the baked light, reflection-probe specular, and three modelled CC0 props lit by baked light probes. Compare
`phase-0/lab-high-procedural.png` (the old look, same pose) with `phase-0/lab-high.png`. It is a large step on
lighting, surfaces and texture detail. It is **not yet** "dramatically better" in every respect: the ceiling is still
the old procedural drop ceiling, nothing is post-processed, and the fighters and the weapon in hand are unchanged, so
the frame as a whole still reads as a game in transition. The foundation (texture route, baker, shared geometry,
material family, fallback) is proven, which is what this gate exists to decide, so the plan proceeds.

- **Texture route: go.** KTX 1.1 containers holding BC1 (colour, sRGB), BC5 (normals) and BC1 (AO/roughness/metal),
  encoded by our own deterministic JavaScript encoder (`scripts/breachline-assets/bc.mjs`, 38.5 dB PSNR on the tile
  set) and read by three's stock `KTXLoader` (plain JavaScript). Works under `script-src 'self'` with no change to the
  policy. The software rasteriser here exposes `WEBGL_compressed_texture_s3tc`, `_s3tc_srgb`, `EXT_texture_compression_rgtc`,
  `_etc`, `_astc`, `_bptc`. GPUs without S3TC/RGTC (most ARM Chromebooks) get 512 px JPEG fallbacks automatically.
  No ETC2/ASTC encoder yet: ARM devices take the uncompressed fallback (risk noted in plan section 10).
  This replaces the plan's DDS/ImageMagick idea: ImageMagick cannot write BC5, and KTX needs no custom loader.
- **Update after the owner's answers (WebAssembly now allowed, `worker-src 'self'`):** `ktx2-encoder` 0.6.0 (MIT, a
  Basis Universal build) runs under Node here. On the Lab floor at 1K: colour as ETC1S 154 KB in 2.6 s (BC1 KTX:
  699 KB), normals as UASTC+RDO+zstd 334 KB in 8.2 s (BC5 KTX: 1.4 MB). That is about 4.5 times less download and,
  unlike BC, transcodes to ETC2/ASTC on ARM Chromebooks. **Decision: phase 1 moves the shipped textures to KTX2/Basis**,
  with three's transcoder `.wasm` and worker served same-origin (three's stock `KTX2Loader` builds its worker from a
  `blob:` URL, which `worker-src 'self'` forbids, so it gets a small same-origin worker wrapper). That runtime path is
  the first task of phase 1 and is not yet proven in the browser. The BC/KTX1 path built here stays as the fallback.
- **Baker: go.** `scripts/breachline-assets/bake.ts` (Node via `vite-node`, `three-mesh-bvh` 0.9.1 pinned as a dev
  dependency). Lab at 12 texels/m: 40,349 texels, 512 x 172 atlas, 64 gather rays, two bounces, 384-ray SH probes,
  panel corner samples: **97 s single-threaded** on this container. The whole building is roughly eight Labs, so a
  full bake needs worker threads to meet the 10-minute budget (phase 2).

## Scorecard (0-10, 8 = would not look out of place in MW2 2009; scored from the pixels)

| Row | Baseline | Phase 0 (Lab only) | Evidence |
| --- | --- | --- | --- |
| A World lighting | 3 | **5** (reviewer: 4) | `phase-0/lab-west-high.png`: soft shadows under benches, AO in wall/floor corners, bounce tint; but flat overall exposure, no grade, rest of the map unchanged. |
| B Surface shading | 1 | **4** (reviewer: 3) | `phase-0/lab-bench-high.png`: normal-mapped plaster and metal, probe reflections; specular is subtle, ceiling and panels' broken edges still unlit-style. |
| C Texture detail | 2 | **5** | `phase-0/lab-high.png`: photo tiles, plaster, painted metal at 1K (~400-800 px/m); ceiling, lockers and barricades still procedural. |
| D World geometry | 1 | **2** | `phase-0/lab-high.png`: three real props (tool chest, extinguisher, stools); benches and lockers are still boxes. |
| E First-person weapon | 1 | 1 | Unchanged (phase 6, built in code, gate 8). |
| F Characters | 1 | 1 | Unchanged (phase 7, built in code, gate 7). |
| G Dynamic shadow | 1 | 1 | Unchanged (phase 8). |
| H Post-processing | 2 | 2 | Unchanged: tone mapping only (phase 1 skeleton, phase 8). |
| I Effects | 2 | 2 | Unchanged (phase 8). |
| J Destruction look | 3 | 3 | Unchanged (phase 5); Lab panels now share the room's material and baked light. |

Scores for A-D are for the Lab; elsewhere the map is still at baseline.

### Reviewer's phase-0 scores (commissioning session, from the pixels): A 4, B 3, C 5, D 2

Taken as the scores of record; mine above were one point generous on A and B. Their findings, folded into phases
(items 1-3 must show in the Lab bookmark by the end of phase 2):

1. Lighting flat and washed, flatter than the old frame: raise key-to-fill, let corners and under-bench go dark,
   check the lightmap range and AO strength. Target: fixtures brightest, floor midtones about a third, contact shadow
   under every prop. (Phase 2.)
2. No visible specular: grazing-angle sheen on tile and metal, fixtures as bright sources in the probes, ARM
   roughness reaching the shader. (Phases 2-3.)
3. Fixtures are flat rectangles: model the troffer (frame, diffuser), hot spot on the ceiling in the lightmap. (Phase 2.)
4. Benches are the most box-like thing in frame: modelled cabinetry, sink, taps, equipment; Lab first. (Phase 4.)
5. Wall band is a featureless strip: dado rail and skirting as geometry, sockets, conduit, scuffs. (Phase 3.)
6. Door posts and frames pure black: proper material and light. (Phase 3.)
7. Site "A" ring reads as fresh flat paint: wear it, take the floor's normal and gloss. (Phase 3.)
8. Palette does not hang together (beige floor, cool grey walls, navy trim): choose a grade direction before phase 3.
9. Barricades, ceiling tiles, lockers, fighters and weapon still old; the photo/box mismatch is now glaring.

From now on each gate records the section 5 budgets measured on the bookmark frames and what ARM devices get
(today: uncompressed 512 px JPEG fallback until KTX2 lands).

## Iteration log (phase 0)

**Reference study.** Poly Haven's own sphere renders of ~45 candidate texture sets (tiles, plaster, block, brick,
metals) and ambientCG's painted-metal range; prop renders and polycounts from the Poly Haven API. Late-2000s military
shooter interiors studied from memory of publicly available material only (nothing saved): strong light pools under
fixtures, dark corners, two-tone institutional walls, dense props, filmic contrast.

**Round 1** (first render, `lab` bookmark): (1) every lightmapped surface black — the lightmap sampled UV set 0
because three's `channel` defaults to 0; (2) only two 0.7 m² lamps for 80 m², floor about 0.3 of target;
(3) destructible panels pure black; (4) bench tops black; (5) navy metal albedo ~0.03 reads as void;
(6) panel corner samples at y = 0 sit under the floor and return zero. Changed: lightmap `channel = 1`; art rooms get
their own fixture layout (`render/fixtures.ts`); corner samples moved just inside the panel rim; metal brightened.
**Round 2**: (1) bench tops and floor darkened by the direction term — traced to the BC5 normal patch never applying
(three resolves `#include`s after `onBeforeCompile`, so z came out as -1); (2) panels still black — panel meshes had
no normals (fine for the old unlit material, NaN for the lit one); (3) lighting too even (six fixtures, heavy fill);
(4) lockers lost their detail under a plain metal texture; (5) walls blank: the two-tone institutional band was gone;
(6) floor has no sheen. Changed: patch the chunk itself; `PanelView` writes normals; four fixtures over the walkways
so benches throw shadow; lockers keep the procedural texture under the lightmap until modelled; a painted lower band
with a dark rail by world height in the shader (works on lightmapped walls and panels alike); tile gloss 0.5.
**Round 3**: (1) tool chest black on its unlit side — L1 SH rings negative; (2) "ROUND 1" banner covering the frame
in some runs; (3) extinguisher very dark in its corner (correct, but dull); (4) barricade planks bright and flat
against the new light (old material); (5) ceiling still the old canvas texture, fixtures flat white. Changed: SH floor
at 30 % of the average; bookmark renders hide transient banners and prompts. (3)-(5) are left for phases 3 and 5.

## Files (phase 0, net lines)

New: `scripts/breachline-assets/` fetch.mjs 88, build.mjs 142, bc.mjs 112, bake.ts 406, bookmarks.mjs 56,
manifest.json; `src/games/breachline/render/` artworld.ts 186, materials.ts 112, levelgeo.ts 109, assets.ts 79,
surfaces.ts 36, fixtures.ts 25, props.ts 13; `tests/games/breachline/levelgeo.test.ts` 52.
Changed: `levelmesh.ts` +52/-15 (face claim hook, per-room ceilings, panel normals and per-panel look),
`scene.ts` +31 (art scene, async load, fallback), `package.json` (dev dependency `three-mesh-bvh` 0.9.1, pinned).
No changes to sim, state, net, bots, nav, world, map or config.

**Committed vs local:** only the 512 px BC files are committed; the 1K BC files are local build outputs, because
phase 1 replaces them with KTX2. A fresh checkout therefore shows the Lab with 512 px surfaces (verified in a render);
the phase-0 evidence images were rendered with the local 1K files.

## Assets (all CC0, Poly Haven; manifest `scripts/breachline-assets/manifest.json`, notices updated)

| Asset | Use | Shipped |
| --- | --- | --- |
| interior_tiles (Charlotte Baglioni) | Lab floor | 512 + 1K KTX, JPEG fallback: 3.57 MB |
| painted_plaster_wall (Amal Kumar) | Lab walls, panels, bench tops | 3.55 MB |
| blue_metal_plate (Rob Tuytel) | Lab benches, posts, frames | 3.54 MB |
| metal_tool_chest (Yann Kervran, John Hutcheson) | Lab prop, 14.6k tris | glb + 256/512 textures |
| korean_fire_extinguisher_01 (UM JOORIN) | Lab prop, 9.9k tris, 3 materials | glb + 3 texture sets (~3 MB) |
| metal_stool_01 (Ulan Cabanilla) | Lab prop x3, 8.3k tris | glb + textures |

Totals: textures 15.6 MB on disk (512/256 tier 6.5 MB, 1K/512 tier 8.4 MB, JPEG fallback 0.8 MB), models 0.94 MB,
bake 0.23 MB. Source downloads 27 MB in `.cache` (not committed).

## Budgets (Lab view, High, measured in this container)

| | Measured | Budget (High) | Note |
| --- | --- | --- | --- |
| Triangles in view | 83k (old look: 38k) | 500k | Props are full-resolution: 50k triangles for five props. LODs needed (phase 4). |
| Draw calls | 78 (old: 64) | 400 | |
| Texture memory (Lab art) | ~12.6 MB | 700 MB | 3 surface sets at 1K (2.8 MB each) + 5 prop sets at 512 + lightmaps. |
| Download (Lab art, High) | ~10 MB | 60 MB | Three surface sets at 1K cost 8.4 MB; 22 sets would cost ~60 MB alone. 1K must be the High ceiling for most sets; small props must share an atlas (the extinguisher's three texture sets for one small prop is wasteful). |
| Script per frame | not measured yet | 5 ms | Phase 1 adds counters. |

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 270 files passed, 1 skipped; 5,341 tests passed, 7 skipped (includes the new
  `tests/games/breachline/levelgeo.test.ts`: no surface lost or doubled by the room split, atlas deterministic and
  non-overlapping, shipped lightmaps match current geometry).
- Browser, with the art loading (dev server, pre-installed Chromium, one worker):
  `npx playwright test tests/games/breachline tests/multiplayer/breachline-online.spec.ts --project=chromium --trace off --workers=1`:
  7 passed (six solo-flow tests and the two-device online match), after rebasing onto the WebAssembly CSP change.
- Fallback checks by render: with the 1K files absent the Lab loads the 512 px set; with the bake missing the
  game logs one warning and keeps the procedural look.

## Owner decisions

Answered 2026-11-11 (plan section 3): WebAssembly allowed (same-origin workers and `.wasm` only); weapons, hands and
characters are authored in code to the bar (rows E >= 8, F >= 7); reloads and sounds must be our own work; Chromebooks
are a hard requirement, optimise first, and the Low tier is the throttled last-resort mode, chosen automatically
only when the startup probe needs it. Still open: the 40-60 MB download budget (assumed acceptable) and which
Chromebook model to benchmark on.

## Known gaps after phase 0

- The default Chromebook experience must be the full look, optimised (owner's rule). Low (throttled) still runs the full PBR shader with features off; phase 1 needs cheaper shader variants per tier and a cost measurement for each.
- Art quality is selected at scene creation (`?arttier=low` for review); the in-game setting does not switch it yet.
- Ceiling, lockers, barricade planks, fighters, weapon: unchanged.
- Bake is single-threaded.
- Bookmarks other than the Lab exist in `scripts/breachline-assets/bookmarks.mjs` but are not yet part of the review.
