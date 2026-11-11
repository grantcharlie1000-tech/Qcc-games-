# Breachline visual overhaul: status

Plan: `docs/superpowers/plans/2026-11-11-breachline-visual-overhaul.md`. Branch: `claude/zen-allen-otdlt6`.

## For the planner (latest first)

**2026-11-11 ~10:55 UTC: warm-up wired in; count test added.** The scene now warms everything behind the menu,
in order, and then sets `stats().ready`:
1. the art (as before);
2. `viewmodel.warm()` (retried until its assets are in);
3. `await fighters.warm(renderer, camera)`;
4. one compile and one draw of the whole scene into a small HDR target, with every combat-only object shown for it:
   the effects' flash sprites, the gadgets (charges, uplink, grenades, pulse ring; these were the lambert and basic
   programs new in play), and a tiny triangle per wall material a damaged panel can show (an intact wall draws only
   its face, so the cut-edge, cavity, stud and plank shaders used to compile at the first hole).

New test `tests/games/breachline/warm.spec.ts` waits for `ready`, records `programs` and `textures`, runs gunfire
into a wall, a breach charge and point-blank fire at an enemy, then compares. Programs are now unchanged (they rose
by 2 before this). Textures still rise by 3: the fighters' level-0 baked set (2048 BC7 + 2 x 1024 ASTC). Their
`warm()` compiles those programs, but `compileAsync` does not upload textures. I've asked the fighters session to
`renderer.initTexture` each map in `warm()`. Until then the test is marked `test.fail` with that reason, so it
flags itself as soon as the fix lands. Hole geometry: the rebuild runs once per damage change, not per frame
(`PanelView.sync` compares the panel's damage version); it creates and disposes a geometry each time, so the
geometry count is level and only small buffers upload. Suite: Breachline unit tests 96/96; browser tests plus
online test, one worker: 9 passed (warm.spec counted as an expected failure).

**2026-11-11 ~10:30 UTC: cause of the first-firefight stall.** Method: the real online spec with a 100 ms
`setInterval` gap monitor on both pages, plus `renderer.info` and a wrapper that records every GL texture/buffer
upload, between "round in action" and "4 s after the host's first hit". (`stats()` now also reports `programs`,
`textures` and `geometries`, for the acceptance check.) In that window, on **both** pages:
1. **One new shader program: a `Sprite` material, the muzzle flash.** The weapon viewmodel's flash
   (`render/hero/viewmodel.ts:61-62`) and the fighters' muzzle flash are hidden until the first shot, and
   `compile()` skips invisible objects, so the program is built on the first shot. The sun sprite does not cover it
   (different settings: fog off, not tone-mapped).
   -> **hero and fighters:** build the flash materials at load and compile them once (draw them once at scale ~0, or
   give them identical settings to an already-visible sprite), so no `Sprite` program appears in play.
2. **Three texture uploads: 2048x2048 sRGB BC7 + two 1024x1024 ASTC.** That is a fighter's level-0 baked set
   (`render/fighters/textures.ts`: diff, nor, arm). The fighters build a level's mesh and material on first use
   (`render/fighters/index.ts:103-110`, `meshFor`), so the first time an enemy comes within level-0 range (the
   host stepping in front of the guest), the page builds geometry, makes a new material and uploads ~10 MB of
   textures in one frame. The fighters' first `update` costs 0.3-1.1 s of script time here.
   -> **fighters:** build every level's geometry, mesh and material at load (time-sliced), and `renderer.initTexture`
   each map one per task, before the round starts. `meshFor` should never create anything during play.
3. **~16 buffer uploads**: the wall-hole geometry rebuilt when panels take damage (mine; small, by design).
4. **Post-processing targets reallocated** (mine, `render/post.ts` `setSize` -> `build()`): the resolution scaler
   changes the drawing size, which rebuilt the HDR buffer and the whole bloom chain. **Fixed:** the targets are now
   allocated at the largest size seen (+10%) and drawn into a viewport; every read is clamped to the area in use.
   Scale changes no longer allocate. Lab renders on High (scale 1, MSAA) and Low (scale 0.6) look unchanged.
5. **No lights are added or removed when firing** (checked: only the hemisphere and key lights in `scene.ts` and
   the viewmodel's own three, all permanent).
- Gaps: in my container the longest guest gap was 6.0 s, at the guest's first burst; the online test passes alone
  and in the sequence. Your 17.6 s is the same first-use work on a slower or busier machine.
- A program is also added the first time the corridor is seen on High (lab 46, corridor 47). Not identified yet:
  the names and truncated cache keys I logged don't separate it. Still open.
- The bookmark script now waits for the art to be live (`stats().art`), not a fixed 6 s; the warm-up can take
  longer than that under software GL.
- **Frame cost now vs the Lab gate** (bookmarks, this container): High Lab 113 calls / 73k tris (gate: 78 / 83k);
  corridor 184 / 83k; Archive 179 / 82k; programs 45-46, textures 110-114, geometries 174-208. Low: 93-156 calls,
  67k-83k tris, 39-40 programs, 76-80 textures. Growth: draw calls from the dressing (the corridor and Archive have
  about 20 dressing materials each; merging by material on High is next) and from the textured fighters and weapon;
  triangles are flat thanks to the LODs.

## Current phase: Lab vertical slice (after phase 0; see the plan's "Re-ordering after phase 0")

Weapons, hands and fighters (rows E and F, phases 6 and 7) now belong to the hero session (`render/hero/`,
`docs/evidence/breachline/hero/`). This session supplies its lighting through `HeroLighting`. Next here: Lab lighting
contrast and modelled fixtures, visible specular, post chain basics, dense Lab props; then KTX2 and the phase-1
renderer work, measured against section 5.

**Where I am (keep current):** kit round 1 done for all five of my items (`kit/`); next corridor round 3 (the
reviewer's notes: door frames and doors, lighter and fewer posts, fittings, wall dirt, a second light colour), then
Archive round 2.

## Tactical kit (row K): grenade blasts, round 1 (`kit/grenade-round-1/`)

Every explosion used to share one effect. Now `Effects.blast` takes the source:
- **Frag:** the white flash plus an ember-orange core flash, the dust cloud and floor pressure ring, sparks, a soot
  mark, and floor and wall bits thrown out that come to rest and stay.
- **Impact grenade** (its own look): a cold blue-white flash; a sharp shock ring racing across the floor (a new
  pooled ring, warmed with the effects); more sparks and a thinner cloud; a smaller soot mark.
- **Breach charge:** as in the charge item.
- **Evidence:** `frag-strip.png` (just after the blast, 0.2 s later, after clearing with `fxfast`). The blast is 6 m
  from the camera, so the soot and debris are hard to make out, and the 0.14 s flash isn't caught in the first
  frame. The impact grenade isn't rendered yet: the bookmark player's kit carries frags, and kit choice happens in
  preparation, which the script skips.
- **Mismatches for round 2:**
  - a close-up of the aftermath;
  - the impact grenade in evidence;
  - no light from the flash on the room (the flash is a sprite; a real light needs the fixed light pool);
  - debris is boxes, not shaped fragments.
- K (mine, grenades): 3 -> 4.5.

**Row K overall (mine, my parts only), round 1:** charge 5, barricades 5, reinforcement 5, uplink 5, grenades 4.5,
soft walls (row J) 6. The in-hand and third-person parts are the weapons' and fighters' sessions'.

## Tactical kit (row K): uplink device, round 1 (`kit/uplink-round-1/`)

Before: six flat boxes and a pulsing ring.
- **Now** (`render/kit.ts` `deviceGeometry`, our own design):
  - a hard case with ribs, rubber feet, latches, a handle and a hazard strip, its lid open and standing at the back;
  - a keypad panel and cable gland inside, and a whip aerial;
  - a screen in the lid's bezel (title, signal trace, status box), with a progress bar in the box;
  - three status lights: power, link, alarm.
- **State drives colour and scale only, never a redraw or upload:**
  - counting (planted): amber screen, a bar that fills over the fuse, and a link light and glow that blink faster
    as time runs out;
  - complete: green, bar full;
  - shut down (defused): dark screen and a red alarm light;
  - otherwise: armed (cyan).
- **The light that carries:** an additive glow over the screen and a pool of its colour on the floor round the case,
  pulsing with the count, plus the existing pulse ring. The case is lit by the bake probe like the charges.
- **Evidence:** `counting-then-complete.png` (amber while counting, green once the link completes),
  `counting-high.png`, `counting-crop.png`. The shut-down state is not rendered yet (it needs a scripted defuse).
- **Mismatches for round 2:**
  - the pool is faint on the bright tile floor;
  - no real light on the room: it would need a permanent light in the art scene and a recompile of every art
    shader to carry it, so it's left as a fake pool for now;
  - the screen is unlit by the room (fine) but has no glass reflection;
  - the plant and shut-down hands belong to the weapons and fighters sessions.
- K (mine, uplink): 3 -> 5.

## Tactical kit (row K): reinforcement, round 1 (`kit/reinforcement-round-1/`)

Before: a flat 20 cm slab carrying the old plate texture (dark grey, printed rivets and a hazard band).
- **Now** (`levelmesh.ts` `reinforcement()`): folded steel leaves about 0.5 m wide in a shallow zig-zag; three
  stiffening rails standing proud, with rivet heads at every fold; anchor shoes at the foot and head of every
  other fold, as if fired into the floor and ceiling. Painted blue-grey, a touch different per leaf. Both faces
  alike.
- **Under fire:** rounds that hit a plate leave a bright scar (paint blasted off round bare metal and a lead smear;
  a new decal pool) and a spray of sparks, never a hole. Fixed on the way: the simulation stops a round at the
  panel's centre plane, inside the plate, so the old decals and sparks were buried in the steel. Hits are now
  lifted to the face.
- **Evidence** (a wall the defending bots reinforce; new `REINFORCE=1` mode in the bookmark script, and
  `?artdbg=world` to list the reinforced panels): `before-after.png`, `other-side-high.png`, `shot-high.png`,
  `shot-crop.png` (scars after a burst, dust cleared with `fxfast`).
- **Mismatches for round 2:**
  - the steel is unlit by the room probe (the plate material is the old flat-shaded one), so there's no brushed
    sheen or specular;
  - the scale of the old texture shows through (stretched streaks);
  - no deploy animation: the plate appears whole when the simulation sets it, and the unfold needs the
    defender's progress (`act`/`actT`/`actTarget` on the player is enough; no new hook);
  - no anchor bolts visible in the floor or ceiling;
  - the hazard band is texture-only.
- K (mine, reinforcement): 3 -> 5.

## Tactical kit (row K): barricades, round 1 (`kit/barricade-round-1/`)

Doors and windows were a flat sheet of plank texture with square cells cut out.
- **Now** (`levelmesh.ts` `barricade()`): each row of cells is one separate board. Boards are 23 cm tall with gaps
  between them (the sky shows through on outside windows), alternate slightly in depth, and are each tilted a
  little. Each takes its own slice and shade of the timber texture.
- **Nails:** two iron heads where a board rests on the frame.
- **Collision is unchanged:** a run of intact cells is one length of board.
- **Breaks:** where cells are shot or struck out, the board snaps. Top and bottom tear back into the board by
  different amounts, a rough diagonal with a short splinter tip (no more than 3 cm into the gap). The snapped end
  grain is pale. The splinters thrown (existing debris, now flat timber slivers) stay on the floor.
- **Evidence:** `intact-before-after.png`, `shot-before-after.png` (old left, new right), `shot-high.png`.
- **Mismatches for round 2:**
  - no frame or batten behind the boards: they rest on the wall's opening trim;
  - boards are the same length (full width), never staggered or overlapping;
  - no bullet holes in boards that survive a hit;
  - the build-up animation (plank by plank) follows the simulation's cells, but nothing marks a board being
    placed (hammer or fighters' side);
  - the texture still shows the occasional seam inside one board.
- K (mine, barricades): 3 -> 5.

## Tactical kit (row K): breach charge, round 1 (`kit/charge-round-1/`)

My part of the charge is the placed model, the blast and the aftermath. The in-hand charge belongs to the weapons
session and the third-person placing to the fighters session.
- **On the wall** (`render/kit.ts`, new, our own design): an adhesive foam frame, and an olive pack with webbing
  straps, a raised tan core and two printed hazard bands. Tape over two corners onto the wall. A black detonator
  with a cap, a toggle and a cable gland, and a blinking LED that blooms. Red and black firing wires loop down the
  wall. One merged mesh (one draw call) plus the LED. Each charge's material is tinted by the baked light where it
  sits, so it is lit like the wall behind it. Before: three flat-coloured boxes (`models.ts` `chargeParts`, still
  there for the weapons session).
- **Going off:** the existing flash, smoke and sparks, plus a pressure ring (a skirt of dust racing out low along
  the floor), a soot mark on the floor, and soot on the board round the opening on the side the charge was set
  (decals belong to their cells). Board fragments thrown into the room are thin flat plates that come to rest and
  stay.
- **The opening:** ragged, torn skins, studs and the cavity (destruction rounds 1-2), with gunfire-style chips
  round it.
- **Evidence:**
  - `charge-on-wall-high.png` and `-crop.png` (armed charge);
  - `blast-strip.png`: in the smoke after 9 s game time; then 2.4 s and 8 s of effect time with `?artdbg=fxfast`.
    The bookmark tool can't run effects in real time: effects age only with rendered frames, and the test hook
    draws 16 ms frames;
  - `after-high.png`, `after-close-high.png`.
- **Mismatches for round 2:**
  - the pack is flat-coloured (no fabric, print or label textures);
  - no wire running away from the charge to the player;
  - no broken stud ends sticking into the opening (blocked by the "nothing in a passable gap" rule; a short
    splintered stub at the jamb is a possibility);
  - the smoke is a uniform haze rather than rolling clouds;
  - the floor soot sits at the wall base, under the opening, where it is hard to see.
- K (mine, charge only): 3 -> 5.

## Phase 5: destruction look, round 2 (`destruction/round-2/`)

Against round 1's mismatches:
- (1) Torn edges now have a fringe: on both faces the paint and paper peel back 1-4 cm from each break. Bare gypsum
  shows at the break, and a darker ragged paper line at the fringe's inner edge, which follows the tear.
- (3) The cut edge shows the board's layers: face paper, a white gypsum core, brown back paper. The cavity side
  of the board is brown.
- (4) Decals: a round through a soft wall leaves an entry chip on the near face and a wider blow-out on the far
  face. Every cell knocked out by gunfire leaves chips on the intact board round it, on both faces, placed beyond
  where the board can tear back. Decals belong to their cell and go when it falls. The decal texture is now a
  crater: grey bruising, a ring of crushed gypsum chips, a ragged dark hole.
- (2) Dust on every hit: an entry puff, plus a cone of gypsum dust out of the far side. Gypsum crumbs and
  breach/gunfire debris that come to rest stay on the floor until the round is cleared (pooled, oldest recycled
  first), and no longer update once settled.

Still open:
- (5) little light in the cavity;
- debris chunks are flat-shaded boxes (fine at size, plain close up);
- decals are not normal-mapped;
- the Low breach view is still mostly smoke for several seconds.

J score (mine): 5 -> 6. Evidence: `shot-wall-high.png` (holes from a magazine with chips round them),
`breach-close-high.png`, `breach-high.png`, `shot-wall-low.png`. Budgets unchanged (decals and chunks are pooled
instanced meshes; no new draw calls or programs; `warm.spec` still shows programs unchanged).

## Phase 5: destruction look, round 1 (`destruction/round-1/`)

Soft-wall panels are now built as a real partition: two plaster skins (12.5 mm) with a cavity, timber studs every
0.6 m and a noggin at 1.2 m, standing only in cells that are still intact (so nothing visible blocks a passable gap;
`tests/games/breachline/panelgeo.test.ts` checks it). Hole edges tear back into the intact board by a hashed amount
instead of following the cell grid, and the cut edges and cavity faces take the panel's own baked corner light.
Bookmarks `shot-wall` (a magazine through the Lab's south wall), `breach`, `breach-lab`, `breach-close` (after a charge).

Mismatches against the bar, for round 2: (1) torn edges are clean straight polygons with no paper fringe or crumbled
gypsum; (2) no debris left on the floor and no lingering dust after a breach; (3) the cut edge has the face's albedo,
where real board shows a grey gypsum core between paper liners; (4) no bullet decals on the intact plaster around the
holes; (5) the far skin's studs read weakly through a hole (little light reaches the cavity); (6) on Low the breach
smoke hides the hole for several seconds (existing effect; fine for play, but the look can't be judged there).

J score (mine): 3 -> 5. Budgets in the breach views: High 63k-73k triangles, 107-136 draw calls; Low 67k-75k, 99-108.

### Start-up stalls, measured in the two-page online test (planner's request, 08:28)

Long-task observer on both pages, the real online spec, this container (SwiftShader, two browsers on one CPU):
- **Before** (art High, everything in one frame): the guest's single art-integration frame took 1.6-3.9 s, and the
  guest's wall holes dropped from 11 to 0 straight after it (netcode resync after a long stall; reported).
- **After** (bc35092): the art is fully loaded and integrated about 6 s *before* the match starts (guest log: warm
  3.1 s spread over 5 draw batches and 25 one-per-task texture uploads; integrate 67 ms; the largest art task is
  under 1 s, the same as an ordinary software-rendered frame here). On High in one page the largest art step is a
  0.5-1.2 s frame, against 0.95 s for an ordinary frame with art off.
- **Remaining stalls are not loading.** The guest still has tasks of 1.5-6.9 s, all after the round starts. Timed
  inside the frame loop: script work accounts for at most 2 s of them (first draw of the weapon viewmodel 1.1-2.0 s,
  fighters' first updates 0.3-1.1 s, the main scene's first draw 0.3-1.4 s, each once); the rest is time the main
  thread waits on the software GPU process (synchronous GL queries stalling behind queued rasterisation). On a
  real GPU these are tens of milliseconds. Not a host/guest divergence: counts and health converge.
- Result: six Breachline browser tests then the online test, one worker, **passed three times running** (8/8 each).
  The poll timeout was not raised.

### Art streaming no longer stalls a match (online test)

The two-device online test had failed since the corridor commit: when the art arrived mid-match, the guest's frame
froze for 2-4 s (in software GL), and after the stall the guest's wall holes reset to none (a resync issue in the
netcode, reported to the planner; off limits here). Measured with long-task timings, the freezes were the reflection
probes (2 s, all three in one frame), first-draw shader variants, texture uploads and buffer uploads. Now: the art's
shaders are compiled before it goes live, against a half-float target like the game's (the screen variant was the
wrong one); materials hold a black stand-in probe of the same size, so the real probe is a uniform swap, not a
recompile; textures upload one per task; every mesh is drawn once into a 4x4 target, about 8k triangles per task;
probes are captured one room per frame at 128 px with a far plane fitted to the room. And a software rasteriser
(SwiftShader, llvmpipe) now gets the Low art tier, the owner's last-resort mode; `?arttier=high` forces High for
evidence renders (the bookmark script passes it). With that, `breachline-online.spec.ts` passes; with High art on
two software-GL browsers sharing one CPU it still timed out on the hit check (each poll waited seconds for the CPU).


## Roll-out step 3: Archive (site B)

Round 0/1: timber floor (Poly Haven `wood_planks`, CC0, Amal Kumar); four slightly warm fittings between the
shelving runs; shelving dressed on its solid collision boxes: steel uprights and shelf lips, archive-box fronts with
labels and hand-holes, and box files in varied colours, all standing just proud of the faces, so the collision is
unchanged; a bank of filing cabinets with drawer pulls and label holders; the reading table with paper stacks, a box
file and an open archive box (dark veneer, so it separates from the floor); ceiling grid, sprinklers, detector; a
clock, sockets and skirting on the solid south wall. Fixes after the first look: labels and hand-holes were too
large and white, the papers glared, and warm light plus the timber's bounce made the ceiling muddy brown (cooled).
Rooms now load independently: a missing or stale bake keeps that one room on the old look instead of all of them.

Scores (mine, `rooms/archive/round-1/`): A 6.5, B 6.5, C 6.5, D 7. Budgets: High 46k-82k triangles, 88-179 draw
calls (the shelving costs draw calls: about 20 dressing materials; merging by material on High is next if the
total grows); Low 71-151. Three rooms baked in parallel in 447 s.


## Roll-out step 2: corridor (in progress)

Round 0 (`adcd2b9`): the art world now handles any number of rooms (probes, mean light, reflection environment per
room; panel light merged across rooms, so the Lab–corridor wall carries both bakes). Corridor: polished terrazzo
(Poly Haven `terrazzo_tiles`, CC0, Amal Kumar), a line of ten fittings at 3 m, the T-bar ceiling with sprinklers
and smoke detectors, a cable tray on drop rods, hanging exit signs with an original running-figure pictogram, the
cabinet modelled as casework, the lockers facing into the corridor. First render: the floor carries long
reflections of the fittings, and the ceiling recedes properly. Round 1: terrazzo cooled toward the grade (it read
tan), two extinguishers at the foot of the walls.

Round 1 scores (mine, from `rooms/corridor/round-1/`): A 6.5 (even fluorescent light, upper walls near the
camera wash out), B 7 (the terrazzo carries long reflections of every fitting), C 6.5, D 6 (the walls on both sides
are destructible panels, so nothing can be fixed to them: the ceiling, the floor props and the casework carry the
dressing). Budgets: High 73k-76k triangles, 153-158 draw calls; Low 135-140 draw calls (budget 200). Running texture
total: 10 surface sets plus 5 prop sets, 17 MB shipped across all tiers; at 1K the GPU holds about 16 MB for the
Lab and corridor sets together with BC/ASTC transcodes.

Round 2: fittings every 4.5 m instead of 3 m, so the walls get pools; grime gathers toward the ceiling on the
plasterboard; red fire-alarm call points and a fire-equipment sign on the static posts between panels (nothing can
hang on the plasterboard itself). Scores (mine): A 7, B 7, C 6.5, D 6.5. C and D are capped mainly by the bare
plasterboard on both sides; the destruction-look phase, next after the Archive, gives those panels seams, studs
and breakage, which is where they will gain. Budgets: High 73k-77k triangles, 156-161 draw calls; Low 136-141.

`bake-all.mjs` bakes rooms in parallel, one process each. With two rooms it is bounded by the corridor (470 s).

Bake time: Lab and corridor together take 8 minutes single-threaded. The full building would be about 30, so the
baker needs worker threads (4 cores here) before more than two more rooms are added.


## Roll-out step 1: KTX2 (done)

Lab items closed in this step: photo ceiling tiles (ambientCG Office Ceiling 001, CC0, 600 mm tiles on the T-bar
grid); plaster normal strength 2.2x; painted metal doors and lockers glossier with a 1.4x reflection; the grade's toe
lifted (lift 0.03, black point 0.012) so shadowed casework keeps its detail (the reviewer's carry-forward note 1).
On Low, untextured dressing merges into one draw call: Low's Lab draw calls 99-107 -> 87-95.


**Landed:** textures ship as KTX2/Basis (colour ETC1S with the sRGB transfer function; normals and AO/roughness/metal
UASTC with RDO and zstd), one file for every GPU. The browser transcodes to BC, ETC2 or ASTC, so ARM Chromebooks
now get compressed textures. All tiers total 13.3 MB (512 px 3.9 MB, 1K 9.4 MB) against 22.4 MB for the BC/KTX1
set. JPEG 512 fallbacks remain for a failed transcoder, with a 20 s timeout so a dead worker cannot hang loading.
The BC encoder (`bc.mjs`) and the KTX1 files are gone.

**What was in the way, and the fix:** allowing WebAssembly was not enough. The Basis transcoder's Emscripten/embind
glue builds function wrappers with `new Function`, which needs `'unsafe-eval'`, still forbidden (correctly). Two
places do it: `craftInvokerFunction` for bound C++ methods, and `__emval_get_method_caller`, used when it constructs
a `KTX2File`. `build.mjs` swaps both for the closure equivalents Emscripten emits under `DYNAMIC_EXECUTION=0`. It
fails the build if the source text changes, or if any `new Function` survives. It then writes the worker three's
`KTX2Loader` would have made as a `blob:`, as a same-origin file (`basis/ktx2-worker.js` and the unmodified `.wasm`).
`render/assets.ts` runs it through a small `KTX2Loader` subclass. A test (`tests/games/breachline/artcsp.test.ts`)
holds the worker eval-free and the policy unchanged. Notices record the modification (Apache-2.0).

 (evidence: `lab-slice/gate/`; for review before roll-out)

**Changes this round,** in the reviewer's order:
1. Service pipes removed (the services reach the sink inside the cabinetry).
2. Destructible plasterboard gets taped joints every 1.2 m and boot-height scuffs, drawn per pixel, so they break
   with the cells. The painted skirting and rail were already per pixel.
3. More lit/unlit separation: contact occlusion reach 0.5 m at 85 %, a deeper grade toe (gamma 0.9) and black
   point 0.03. Bench tops are sealed epoxy with a soft second reflection.
4. The budget items below.

Also fixed a real bug: the automatic resolution scaler ran after drawing. On a scale change it resized, and so
cleared, the canvas after the frame was drawn, so the screen flashed empty for a frame. That flash was the
intermittent "blank Low frame" in my earlier renders, not the dev server as I wrote in round 3. It now runs before
drawing, and repeated High-then-Low runs are clean.

**Scores (Lab, mine):** A 7, B 6.5, C 6.5, D 7, H 6. A and D are at the gate. B and C are half a point short.
B needs stronger plaster normals and reflections on painted metal. C needs a photo ceiling-tile set to replace the
procedural one; that waits for KTX2, because the texture count is about to grow.

**Budgets, measured on the gate frames (this container, 1280x720):**

| | High | Low (throttled) | Budget High / Low |
| --- | --- | --- | --- |
| Triangles in view | 38k-80k (63k at `lab`) | 57k-59k | 500k / 150k |
| Draw calls | 59-108 | 99-107 | 400 / 200 |
| Script per frame, 60 frames | 0.9 ms median, 2.5 ms p90 | 0.7 ms median, 0.9 ms p90 | 5 ms / 3 ms |
| Lab art textures, GPU | about 16 MB (5 surface sets at 1K, 5 prop sets at 512, lightmaps, 2 canvases) | about 5 MB at 512 | |
| Post targets, GPU | about 42 MB (MSAA 4x HDR 33.6 MB + resolve 8.4 MB + bloom about 1 MB at 1366x768) | about 2.5 MB (HDR at 55 % scale, no bloom) | |
| Medium (not rendered here) | HDR 8.4 MB + bloom 0.5 MB, no MSAA, FXAA | | |
| Committed art | 10.5 MB (all at 512 px until KTX2) | | 60 MB / 20 MB |

Prop LODs: meshoptimizer (pinned dev dependency 0.22.0) writes a level at about 30 % of the triangles for each prop
(tool chest 13.4k to 4.0k, extinguisher 9.9k to 3.1k, stool 8.3k to 2.5k). High switches to it beyond 5 m and
Low always uses it. Triangles at the `lab` bookmark dropped from 91k to 63k. Each LOD file still carries its
model's full vertex buffer: about 1 MB in total, to strip later.

**Per-room allowance for roll-out (proposed):** each new room may add at most two new 1K surface sets. It reuses
the shared family (plaster, tile, painted metal, boards, ceiling) and the dressing kit's untextured and canvas
materials. Its props share 512 px sets. That keeps eight rooms near 60-70 MB of textures on High at BC/ETC sizes
(under 350 MB on Medium) and roughly half the download once KTX2 lands. Post targets are per screen, not per room,
so they do not scale with rooms.

**Tests:** `npx tsc --noEmit` clean; `npx vitest run tests/games/breachline` 53 passed; browser (solo flow) and the
two-device online match: 7 passed; whole suite `npx vitest run` 270 files passed (1 skipped), 5,341 tests passed (7 skipped).

**ARM today:** 512 px JPEG fallback, uncompressed in GPU memory, until KTX2.

**Roll-out order after review (reviewer's):** corridor, Archive, the remaining rooms, the yard, with KTX2 landing
before the texture count grows.

**HeroLighting (planner's decision, 2026-11-11):** `environmentScale(x, z)` added to the interface and implemented:
1 / the room's mean baked surface light inside art rooms (about 1.7 in the Lab), 1 elsewhere. Hero and fighter
materials use `environment()` for specular only, scaled by this, and take diffuse from `probe()`. `probe()` gains
SH when the light grid lands.

## Lab slice, round 3 (evidence: `lab-slice/round-3/`, including `lab-high-vs-low.png`)

From the reviewer's round-1 review (scores A 5.5, B 4, C 6, D 5.5, H 5), in their order:

1. Floor: done in round 2 (darker, glossier, visible reflections). Grounding comes from the kick plates, contact
   occlusion and the floor's reflections of benches and lockers.
2. **Low tier no longer stair-steps:** Low now has a light post tier (grade plus an FXAA edge pass, no bloom) at its
   reduced resolution, so High and Low share one look. Metals on Low (no reflection probe) are drawn as darkened
   paint instead of black or chalk-white.
3. **Paint varies by object:** grey-green lockers on a neutral painted base, blue-grey cabinet doors, charcoal door
   frames, dark carcasses so the gaps between doors and drawers read as gaps.
4. **Black point:** the grade has a black point (0.018 after the curve), so recesses, louvres and the doorway go dark.
5. **Walls:** noticeboard with pinned sheets, first-aid box, an original eye-protection sign, a wall clock, a vent
   grille, cable tray. **Ceiling:** sprinkler heads, a smoke detector, a stepped supply diffuser.
6. **Bench tops:** a monitor on a stand with a keyboard, sample trays, a test-tube rack, a benchtop centrifuge, a
   clipboard, service pipes dropping to the sink.
7. **Site "A" ring:** worn but clearly readable on every tier.
8. **Door posts:** charcoal painted with texture detail.

Also: the bookmark script retakes an empty frame once. The first run after a source edit sometimes captured a
blank canvas; I traced that to the dev server re-transforming modules, not to the renderer (six repeat runs without
edits were all clean).

Found for the hero session (relayed): on High the new AR-5 renders near-black, because the viewmodel uses my room
probe (physical units, mean surface light 0.59) for diffuse as well as reflections; with the probe off it lights
correctly.

**Scores (Lab, mine, from `lab-slice/round-3/`):** A 6.5, B 6, C 6.5, D 7, H 5.5. **Budgets on these frames:**
38k-93k triangles, 59-108 draw calls (High); textures unchanged plus two 256 px canvas textures. Still owed before
the gate: a per-room texture allowance and post targets sized by tier (the reviewer's budget note), script ms,
prop LODs.



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
| J Destruction look | 3 | 3 -> **5** (destruction round 1) | `destruction/round-1/breach-close-high.png`, `shot-wall-high.png`: two skins, cavity, studs and noggins, torn edges; no debris, dust or decals yet. |

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
