# Breachline hero models — status

Session: hero models, now **weapons session**: weapons, hands, the weapon in hand and reloads (row E). Since the plan
change of 2026-11-11 ("Fighters split out"), fighters and row F belong to the fighters session
(`docs/evidence/breachline/fighters/`); row F is no longer scored here. Plan: `docs/superpowers/plans/2026-11-11-breachline-visual-overhaul.md`
(sections 4.6, 4.7, 5, 8, 9 and "Parallel workstream: hero models").

## Where I am

r5b: re-charted unwrap. Charts are now per part, axis and depth layer, and tiny layers share a chart, so the atlas shows recognisable parts: 1793 texels/m against 1405, 41% coverage. Proof is `r5/ar-unwrap-checker.png` (squares are square and even on the visible side). The receiver is now near-black anodised (about 0.04 linear), the handguard and magazine dark earth, the grip and stock black polymer (`r5/game-ar-textured-lab-corridor-crop.png`). Next: fingers visible round the handguard, the optic coating and mount, wear at screen scale, the hands' texture set and the sleeve.


r5 (in progress, per the plan's "Change of technique"): baked texture pipeline for the AR-5 is working end to end. Unwrap in code (`render/hero/unwrap.ts`: dominant-axis islands, landscape shelf packing, density weighted to the left side and top), offline baker (`scripts/breachline-assets/hero/bake.ts`, vite-node: rasterise texels, ray-cast AO with three-mesh-bvh, height-stamp normal map, layered albedo/roughness/metal), KTX2 2048/1024 + 512 JPEG in `public/game-art/breachline/hero/ar/` (5.8 MB incl. both sizes), run-time `texturedMaterial` (no per-pixel noise; environment for specular only) loaded through the environment's ArtLoader. Separate finishes (glossier anodised receiver, bluish steel, matte polymer), an overhead viewmodel key light indoors. Evidence `r5/ar-atlas-{diff,nor,arm}.png`, `r5/game-ar-textured-lab-corridor-crop.png`. Support hand: two-tone coyote glove, cradle rolled so thumb and knuckles read (`r5/game-ar-support-hand-crop-2x.png`); fingers are still not distinct. Next: hands' own texture set, a turntable under a moving light, budget trim (arm map at 2048 is 2.1 MB).


r4: lighting fix pushed; then hip framing (lower right, canted 15° so the side reads, support hand in view), original engraved markings on the AR-5 (`r4/ar-markings.png`: maker, model and calibre, serial, selector positions, 5×7 laser-style glyphs as flush quads), darker gloves with finger gussets and thicker knuckle guards (`r4/gloves.png`), slimmer sleeves. AR plus arms 19.85k tris. Next: the AR-5 in hand to E ≥ 8 (framing, materials and markings, gloves and sleeves, reloads that read beat by beat), then each other weapon to the same standard.

## Phase

| Step | State |
| --- | --- |
| Seam (`render/hero/index.ts`, `createViewmodel`, `createFighters`, `HeroLighting`) | **Done**, commit 64547a5, behaviour unchanged; unit (53), Breachline browser (6) and online (1) tests green |
| Shared reload beat table `reloads.ts` | Created to the audio plan's section 4 shape (commit 17d94db); the sound session owns it and may retune |
| Reference study | Done (below) |
| Geometry toolkit (`render/hero/geom.ts`), PBR wear shader (`material.ts`), SDF mesher (`sdf.ts`) | Done (round 1) |
| Dev studio (`render/hero/studio/index.html` under vite; `window.__breachlineHero`) and evidence scripts (`tests/games/breachline/hero-shots.mjs`, `hero-game.mjs`) | Done |
| Marrow AR-5 | Round 3 (turntable), round 2 (in hand) |
| Hands and arms (SDF gloves, sleeves, squad band and shape patch, IK) | Round 2 |
| Viewmodel motion (springs, sway, bob, recoil, ADS, sprint, swap, melee, casings) and reload timelines | Round 1, **in the game** |
| Tern C8, Wren-9, Halden 12, Corvin DMR, P-11 | Round 2 (turntables), holds derived from each weapon's sockets |
| `worldWeapon(id, lod)` for fighters' hands (contract in the plan) | **Done**: exported from `render/hero/index.ts` with the full sockets and each hand's placement. Level 1 (near) 0.8–2.6k tris, level 2 (far) 0.6–1.8k: AR 2.6k/1.8k, Tern 1.7k/1.2k, Wren 0.9k/0.7k, Halden 1.8k/1.2k, Corvin 2.3k/1.5k, P-11 0.8k/0.6k. Evidence `r2/world-weapons-lods.png` |
| Fighters, animation | Moved to the fighters session |

## Scores (row E: weapon and hands; row F: characters). 8 = MW2 (2009)

| Round | E | F | Evidence |
| --- | --- | --- | --- |
| Baseline | 1 | 1 | `docs/evidence/breachline/05-breach.png`, `overhaul/phase-0/lab-bench-high.png`: about 30 boxes, slab arms, a blue block for a wrist band; fighters are six rigid box groups |
| r4 | 6 | — | `r4/lighting-after-high.png`, `r4/lighting-after-low.png`, `r4/game-ar-hip-ads.png`, `r4/ar-markings.png`, `r4/gloves.png`, `r4/game-ar-reload-*.png`. The weapon in hand now reads in the game, with polymer, anodised aluminium and steel separate, in the Lab, the corridor and on Low. The hip framing shows the side and the support hand; the AR-5 carries real markings; the gloves have gussets and guards. Why 6, not 8: in the game's reload the magazine is visible only briefly at the frame's lower edge, so the beats do not read as distinct poses; the aimed optic housing is still heavy; there is no fine normal detail per material (machining lines, cast texture); only the AR-5 had this round; the other five are still at the r2 standard (about 5). |
| r3 | 5 | — | `r3/game-*-hip-ads.png` (AR, Halden, Corvin, P-11 in the Lab and corridor under the real light), `r3/game-*-reload-*.png`, `r3/studio-reload-*.png`, `r3/studio-ar-reload-insert-closeup.png`. Reloads now read on screen: the rifle tips up and cants so the magazine well comes into view and the support hand is seen seating a magazine; the shotgun shuttles red shells from the side saddle into the port; the pistol's support hand comes over the top to rack. The shotgun's aimed view now shows the ghost ring and the glowing front post centred. Still 5, not higher: surfaces are clean but plain next to MW2's textured guns (no markings, no normal-mapped detail, little colour variation); gloves are soft lumps at close range, worst in the pistol's aimed grip; the support hand takes an odd path back after the AR's tactical reload; the magazine is out of view while it is being fetched. |
| r2 | 5 | 1 | `r2/*-turntable.png`, `r2/*-fp-hip-ads-orbits.png`. All six weapons now exist as distinct designs with their own sights (tube dot, holographic with ring reticle, mini reflex, ghost ring with bead, variable scope, three-dot irons), all held by the gloved hands within budget. Why only 5: weapons are clean but plain (flat panels, little surface break-up, no markings); in-hand frames only checked in the studio for five of the six; pistol hands look like mittens at aimed range; magazine changes are still largely off-screen. |
| r1 | 4 | 1 | `r1/ar-game-hip-ads.png`, `r1/ar-turntable-*.png`, `r1/ar-reload-*-strip.png`. The AR-5 is a real rifle shape with bevelled parts, a slotted handguard, a rail, an optic, edge wear and cavity AO, and gloved five-finger hands hold it. Why only 4: five of six weapons are still missing; in the reload the magazine is mostly out of frame; the gloves read soft and lumpy at close range; the hip pose crowds the right edge; the materials are flat under the game's light. F is unchanged. |

Gates: E ≥ 8, F ≥ 7.

## Reference study

**Saltline (technique only, read statically, nothing run or copied).** It has no human characters, only a drone and a
quadruped robot, so it gives no reference for row F.
- **Hands:** a signed-distance field of about 100 primitives (round cones per phalanx, ellipsoids for knuckles, pads,
  thenar mound, web). Each finger is smooth-blended internally and hard-min'd against the other fingers so they never
  fuse, then soft-blended into the palm. Meshed once with surface nets and skinned by distance to each primitive's
  bone, with Laplacian-smoothed weights. Helper bones take half the joint rotation to keep volume at the knuckles.
  Gloves, seams, stitches and creases are drawn in the shader from a per-vertex parametric coordinate.
- **Grip:** fingers are curled from open toward a fist until they touch colliders taken from the gun's measured
  geometry; arms use two-bone law-of-cosines IK with a per-weapon pole and shoulder.
- **Weapon parts:** bevelled extrusions with filleted outlines, lathes with crease-aware normals, lofts through
  cross-section rings for tapered receivers and curved magazines. Per-vertex curvature (convex → edge wear, concave →
  cavity) plus voxel-probe AO go into one vec4 attribute. Moving parts (bolt, magazine, round) stay separate meshes.
- **Materials:** standard PBR with one shared shader patch: rotated-domain value noise, scratches stretched along the
  bore, edge wear to bare metal, grime in cavities, micro-bump via screen derivatives, and fine detail faded by
  metres-per-pixel so it does not alias.
- **Reloads:** absolute-time beat tables, phases eased with smootherstep, and the magazine's transform taken from the
  hand frame while held (pinch, then carry), then a gun-relative path (rise, align, insert short, wind up, seat,
  rebound, regrip, tug). The empty reload adds a full charging-handle pull; the tactical one only a press-check tug.
- **Feel:** analytic damped springs for every viewmodel motion (stable at any frame time), with recoil as velocity
  impulses on six springs, look sway as spring velocity soft-clamped with tanh, and an ADS pose that puts the sight
  line exactly on the camera axis, with an arc mid-transition.

**Real-world proportions** (published dimensions, used for scale, not copied designs): 5.56 mm rifles of about 0.84 to
0.99 m with 0.37 to 0.51 m barrels, a pistol grip raked about 20°, a 30-round magazine about 0.19 m along its curve, and
the rail top 0.07 m above the bore. Pump shotguns are about 1 m long with a 0.47 m barrel and a tube magazine under it.
9 mm submachine guns are 0.5 to 0.65 m with straight 32-round magazines. Service pistols are about 0.19 m long and
0.13 m high, with a 0.025 m slide. Soldier kit: helmet shell about 0.27 m wide, plate carrier about 0.25 × 0.33 m
plates with triple magazine pouches, boots with about 0.03 m soles.

**Decisions taken from the study:**
- I will write my own SDF mesher (surface nets), used both for hands and for fighter bodies. Meshing at a coarser grid
  gives the lower detail levels.
- Hard parts are built with the toolkit in `geom.ts`: extrusions, lathes, rounded boxes and tubes, crease normals and
  voxel AO.
- Each weapon is one skinned mesh with rigid bones for its moving parts (magazine, bolt or slide, trigger, pump), so
  a weapon is 1 draw call and the arms another, within the 4-call budget.
- One shader patch serves weapons, hands and fighters.

## Iteration log

**AR-5 turntable, rounds 1–3** (`scratchpad` renders, r1 evidence is round 3):
1. 23.5k tris (over budget) → rail teeth unbevelled, knurls plain, rounded boxes cheaper: 15.3k.
2. Huge sporting-style stock → slim collapsible stock on a visible buffer tube with a latch, cheek riser and ribbed butt pad.
3. Magazine floorplate tilted the wrong way; ribs read as scratches → tilt sign fixed.
4. Coated aluminium read as chrome (metalness .45) → cerakote/anodising .05–.15 metalness, rough .6.
5. Whole flat faces were "worn" because every crease vertex counted as an edge → wear from bevel curvature only;
   `RoundedBoxGeometry` replaced with filleted extrusions, so flats stay flat.
6. Blotchy AO from self-hits → finer voxels (1/320 of the size), larger normal offset.
7. Ejection port was a slab stuck on → flush dark port, a hinge rod, a dust-cover lip and the bolt carrier in it.

**Lighting, round 4** (`r4/lighting-before-high.png`, `r4/lighting-after-high.png`, `r4/lighting-after-low.png`):
the rifle and gloves were a near-black silhouette on High in the Lab and the corridor. There were three causes:
1. The baked reflection probe was used for diffuse light, in the bake's physical units. Now the environment gives
   specular only (the IBL irradiance term is removed in the shader patch), scaled by `environmentScale`. Diffuse comes
   from `probe()` through the hemisphere and key lights.
2. Albedos were near black (0x23–0x2a sRGB, about 0.02 linear). Coated metals and polymer are raised to 0x3e–0x5c.
3. The post grade's 0.03 black point (after the tone curve) crushes anything under about 0.05 linear radiance. The
   viewmodel is now lit hotter than the world (×2.2), as shooters traditionally do.
Checked in the Lab (baked probe), the corridor (fallback environment) and on Low: polymer, anodised aluminium and
steel now separate in all three.

**Reloads and in-game, round 3:**
1. The magazine change was below the frame edge → the rifle pitches up (muzzle up about 20°) and cants instead of
   lifting (lifting brought the stock into the lens).
2. The shotgun reload rolled the wrong way and hid the loading port → the same tip-and-cant as the rifles.
3. The in-game script picked no kit (it held the digit before the menu took input) → it presses the key, so the
   shotgun, DMR and pistol are now shown in the game.
4. The shotgun's aimed view was half stock → sights raised to a 46 mm sight height (a ramped front post with a tritium
   dot, a ghost ring on a block) and the eye moved back to 0.2 m; the view camera's near plane is now 4 cm.
5. `worldWeapon` lower levels were 2–7k triangles → bevels, holes and fillet arcs dropped below level 0, parts under
   4 mm (level 1) or 9 mm (level 2) culled, rail teeth merged into one strip.

**Five new weapons, rounds 1–2:**
1. The studio showed spent casings and the loading shell → hidden bones are scaled to zero.
2. The carbine's lower rail floated above the gun (rotated about the origin, not the bore) → mirrored height.
3. The holographic window read as a black box (lens too opaque) → a 14 % clear lens; the ring reticle now reads.
4. The shotgun's wood was a wavy zebra → grain stretched along the stock, warped by low-frequency noise.
5. The shotgun's aimed view was all stock (the comb sat on the sight line) → comb lowered 3 cm, eye relief 0.17 m.
6. The pistol arms were bent and too close → extended to 0.42 m, shoulders moved in.
7. AR plus arms was 23.9k → unbevelled rail teeth, one-segment bevels on the handguard walls, decimation to 2.3k per
   hand (error 6 mm cap), sleeves at 24×16: 19.9k.

**Hands, rounds 1–2:**
1. Inside out (quad winding) → fixed.
2. 39k triangles for two arms → meshoptimizer simplifier (pinned 0.22.0, bundled WebAssembly) to 3k per hand; sleeves
   30×18 rings: both arms 8.2k.
3. The cuff was a fat round cone → an oval cuff with a strap.
4. Hand rotations as Euler angles were unreadable → placements given as a palm contact point, a palm direction and a
   finger direction; the wrist is derived.
5. The left arm could not reach the handguard → viewmodel shoulders moved forward and down (as games do), plus a
   12 cm shoulder lean when a target is out of reach; IK residual measured as 0 at hip and aimed.

**In game, rounds 1–2:**
1. The hip pose crowded the bottom-right corner → moved in.
2. Aimed, the optic filled the screen → eye relief 0.1 m.
3. The red dot was darkened by cavity grime → emissive excluded from grime.
4. The reload happened below the screen edge → the rifle lifts and cants during the change.
5. The empty reload's hand crossed the camera to reach the charging handle at the cheek → a palm slap on the bolt
   catch instead.

## Budgets measured

| Item | Budget | Measured |
| --- | --- | --- |
| Weapons, first person | 8–15k tris | AR 13.3k, Tern C8 9.4k, Wren-9 6.2k, Halden 12 5.5k, Corvin 10.5k, P-11 4k (round 2, after trimming) |
| Both arms | — | about 6.5k tris |
| Weapon + hands in view | ≤ 20k tris, ≤ 4 calls | max 19.9k (AR); 3 calls (weapon, arms, lens) or 2 without glass, + the flash sprite while firing; casings are bones in the weapon mesh (0 calls) |
| Arm IK + finger poses | ≤ 1 ms per frame (all hero animation) | 0.2–1.1 ms per solve in the studio under the software rasteriser (includes the first-call JIT) |
| AR-5 build time | — | about 290 ms once (the AO bake is most of it) |
| Glove mesh build | — | about 700 ms once (surface nets plus simplify): **too slow, to be cut** |

## Tests

r4 (final this session): `npx tsc --noEmit` clean; `npx vitest run` whole suite: 5346 passed, 7 skipped, 0 failed (271 files). Breachline browser tests 7/7. The two-device online test failed once ("the host hits the guest": the guest's health did not drop within 10 s), then passed on rerun. That is timing-dependent under two software-rendered pages, but it could also mean the new viewmodel's per-frame cost slows the host. Worth measuring on a real machine.


r1: `npx tsc --noEmit` clean; `npx vitest run tests/games/breachline` 53 passed; Breachline browser tests and the
two-device online test 7/7 passed with the new viewmodel in the game.

## Still weak

- **Row E is 6, below the gate of 8.** What remains, in order: reload beats as distinct, readable poses with the magazine in view; thinner optic housings and a tinted lens; fine normal detail per material; then bring the five other weapons up to the AR-5 one at a time (markings, small parts, shotgun walnut and checkering), each with its own rounds.
- The other five weapons are below the AR's detail: flat panels, few small parts, no markings.
- The glove mesh takes about 0.7 s to build (once).
- Pistol hands read as mittens when aimed.
- The magazine change is mostly off-screen; there are no casings yet in the world, only in the viewmodel.
- Gloves are lumpy close up; the knuckle guard bar is crude.
