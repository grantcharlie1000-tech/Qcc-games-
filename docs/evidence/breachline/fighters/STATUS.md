# Breachline fighters — status

Session: fighters (row F: bodies, kit, materials, animation). Plan:
`docs/superpowers/plans/2026-11-11-breachline-visual-overhaul.md` (4.7, 5, 8, 9, "Parallel workstream: hero models",
"Fighters split out"). Owns `src/games/breachline/render/fighters/`, `tests/games/breachline/fighters*`, this folder.

## Phase

| Step | State |
| --- | --- |
| Seam: `createFighters` re-exported from `render/fighters/index.ts`, box figures moved unchanged | **Done**, b4c1e8c; unit 53/53, Breachline browser + online 7/7 |
| Reference study | Done (below) |
| Body (lofts, SDF head and hands), kit, materials, animation | **Round 1 in the game** (f75ba6c and after) |
| Weapons in hand | `worldWeapon(id, lod)` from the weapons session, adapted to the fighter's sockets (stand-in kept as fallback) |
| Lighting | Diffuse from `probe()` as indirect irradiance, specular from `environment()` scaled by `environmentScale()` |

**Where I am:** round 5, a re-unwrap for large, recognisable islands, with the face reworked in the bake. The Azure rifleman's set is in the game; Ember is still procedural. F = 6, below the gate of 7. Next: Ember's set, the shoulder pinch, the gloves.

## Reference study (looked at, nothing saved)

**Proportion** (adult male, 1.76 m bare, about 7.5 heads of 0.235 m). Fitted to the simulation, whose head sphere
(r 0.17) is centred 0.02 m above the eye (1.62 standing, 1.02 crouched) and whose body cylinder is r 0.32, top at
the head sphere's base + 0.03:

| Landmark | Height (m) | Notes |
| --- | --- | --- |
| Crown / helmet top | 1.76 / 1.82 | head sphere top 1.81 |
| Eye | 1.625 | sim eye 1.62 |
| Chin | 1.52 | jaw angle under the ear lobe |
| Shoulder (acromion) | 1.45 | biacromial 0.40, across deltoids 0.46 |
| Chest (nipple line) | 1.29 | chest depth 0.24 bare, 0.32 in plates |
| Elbow (hanging) | 1.10 | upper arm 0.30 |
| Waist / navel | 1.06 | waist 0.30 wide |
| Hip joint | 0.92 | hips 0.34 wide, joints ±0.09 |
| Crotch | 0.83 | |
| Wrist / fingertips | 0.84 / 0.66 | forearm 0.26, hand 0.19 |
| Knee | 0.50 | thigh 0.43, shin 0.42 |
| Ankle | 0.08 | foot 0.27 long with boot |

Limb taper: the thigh is widest just below the buttock (0.17 wide, 0.18 deep), narrowing to 0.10 at the knee; the
calf bulges high and to the inside (0.12) and narrows to 0.065 above the ankle; the upper arm is round at the
deltoid (0.12), flatter at the biceps, 0.085 at the elbow; the forearm is widest a third of the way down (0.09) and
flat and narrow at the wrist (0.06 × 0.04). Necks slope into trapezius; the head sits forward of the spine.

**Kit** (photographs of soldiers and tactical police in full kit; a generic, own design, no copied product):
- *Helmet:* high-cut shell ending above the ears, a 6 mm rim trim, a rail along each side over the ear cut, a front
  shroud plate, a ridge where the brow trim turns up, hook-and-loop panels; four-point chin strap to a cup under the
  chin. Reads as a dome wider than the head by 2–3 cm on every side.
- *Eyes:* wrap goggles on a wide strap over the helmet, or slim ballistic glasses. Dark lens, the frame catches light.
- *Face:* balaclava or a scarf over the lower face; at ten metres what reads is the brow shadow, the nose bump, the
  jaw edge and the ears under the strap.
- *Plate carrier:* front and back plate bags (about 0.26 × 0.33 m, 5–6 cm thick with the pad), cummerbund round the
  sides, padded shoulder straps; PALS rows of 25 mm webbing across the front; three rifle magazine pouches low on
  the front with bungee/flap tops; an admin pouch above; radio pouch on the back left with a bent whip antenna; drag
  handle at the top of the back.
- *Belt:* 50 mm padded belt with buckle, a dump pouch at the back, two grenade or utility pouches; a thigh or belt
  holster on the firing side.
- *Gloves* over the cuff; *knee pads* with a hard moulded cap and two straps; *boots* with a 0.2 m shaft, a 3 cm
  lugged sole, toe cap and criss-cross laces.
- *Uniform:* combat shirt with an upper-arm pocket and a patch panel (squad shape goes there), trousers with thigh
  cargo pockets and knee seams.

**How 2009-era console characters were built** (study of the era's practice): silhouette first (helmet + carrier +
rifle make the faction readable at fifty metres), then gear volumes, then material. 5–8k triangles, a head under 1k,
normal maps carrying stitching and webbing, colour maps with dirt in folds and pale wear on edges; motion-captured
locomotion blended over eight directions, an additive aim layer through the spine, leans and flinches additive, the
weapon always in both hands. Feet are planted with IK so they never slide.

**Decisions taken from the study:**
- Body from **lofted cross-sections** (fast, deterministic, exact triangle control per level, explicit smooth skin
  weights); **head and gripping hands from signed-distance primitives** meshed with the toolkit's surface nets
  (small grids, so tens of milliseconds). Kit modelled with the toolkit's bevelled parts, rigid on its bone.
- Skeleton of about 32 bones: spine ×3, neck, head, clavicles, two-bone arms and legs with feet and toes, and helper
  bones (elbow, knee, deltoid, hip, forearm twist) that take half the joint rotation to keep volume.
- Animation fully procedural from the pose fields: feet planted from distance travelled (stance foot fixed in the
  world, so no sliding), two-bone IK for legs and arms, spine solves so the head lands in the simulation's head
  sphere, a recoil spring, beat-driven reload, flinch impulse, three keyframed deaths ending on the ground.
- Squads differ by colour band **and** shape patch, and also by kit: Azure in slate urban kit with balaclava and
  goggles, Ember in coyote kit with scarf and glasses.

## Scores (row F, 8 = MW2 2009; gate F ≥ 7)

| Round | F | Evidence | Why |
| --- | --- | --- | --- |
| Baseline | 1 | `r1/before-after.png` (left) | Six rigid groups of boxes, a painted face, no hands |
| r1 | 4 | `r1/turntable-s0.png`, `r1/turntable-s1.png`, `r1/before-after.png`, `r1/ingame-lab-*.png`, `r1/ingame-arc-*.png`, `r1/walk-strip-old-stride.png` | A real, skinned soldier with modelled kit and planted feet, the head exactly in the hit sphere, both squads distinct by kit, colour and shape. Held at 4 because: the support arm reaches at full stretch so the rifle hold looks presented rather than carried; the uniform is a flat colour with no camouflage, seams or pockets on the trousers; close up the gloves are lumps and the neck is long; only walking has been judged in motion (sprint, crouch-walk, strafe, firing, flinch, reloads, deaths are built and tested numerically but not yet looked at); outdoors in shade the figure goes dark. |

| r2 | **5** | `r2/turntable-s0.png`, `r2/turntable-s1.png`, `r2/before-after.png`, `r2/ingame-lab-2m.png`, `r2/ingame-yard-{2,8,20}m.png`, and an eight-frame strip of every clip in `r2/strip-*.png` (walk side and front, sprint, crouch-walk side and front, strafe, fire, flinch, the three deaths from the side and the front, tactical and empty reloads, plant, reinforce) | Up from 4: every clip is now seen in motion and reads as what it is; the three deaths fall differently and come to rest; the reloads carry the magazine on the beats; the printed uniform with seams and the dust on the boots give the cloth a surface. Held at 5 because: the arms are still smooth tubes with a pinched shoulder when raised, and the gloves are lumps; Ember's scarf barely shows; the sprint is knees-bent rather than a driving run; firing recoil is small at range and the flinch shows mainly in the weapon; the faces are long and gaunt; outdoors in shade both squads go dark; the plant reads as reaching forward, not down (the sim keeps the head at standing height). |

| r3 | **6** | `r3/turntable-s0.png`, `r3/turntable-s1.png`, `r3/before-after.png`, `r3/ingame-lab-2m.png`, `r3/ingame-lab-5m.png`, `r3/ingame-yard-{2m-shade,8m,20m}.png`, `r3/strip-*.png` | Up from 5, following the review. A low ready replaces the mannequin point: the rifle pivots about the butt in the shoulder, muzzle down, elbows bent. Aimed, the head drops to the sights and the firing elbow tucks. Shoulders are broader, the carrier deeper, limbs and boots heavier, and the thighs have cargo pockets. Carrier, pouches, helmet, gloves and boots now separate from the fatigues in value and hue (Ember's olive carrier on coyote, Azure's black kit on slate). The balaclava is charcoal rather than a void. Held at 6 because: the shoulders still pinch when the rifle is up; the gloves are lumps; the faces are long; Azure in deep shade outdoors still reads mostly black; the sprint has no driving stride; there are no normal-mapped folds beyond the shader's weave and grain. |

| r4 | **6** | `r4/atlas-l0-{diff,nor,arm}.png`, `r4/turntable-s0.png`, `r4/turntable-moving-light.png`, `r4/baked-vs-procedural-close.png`, `r4/ingame-yard-{2m,8m,20m}.png` with 2× crops, `r4/strip-{walk-side,walk-front,sprint-side}-s0.png` | The rifleman now has a real texture set: printed camouflage, ripstop, folds at elbows, knees and waist, seams with stitching, taped kit edges, webbing ribs, sole tread, ray-traced occlusion, and roughness that separates cloth, nylon, leather, polymer and skin; it reads in the game at 2 and 8 m. The walk gained shoulder counter-rotation, weapon bob and sway, and a longer stride. Held at 6: the atlas packs at 47% (texels wasted), and chart seams cut the print on the arms; the normal detail is soft at 1024; the shoulders still pinch; the gloves are lumps; Ember has no set yet. |

| r5 | **6** | `r5/atlas-l0-{diff,nor,arm}.png`, `r5/checker.png`, `r5/turntable-s0.png`, `r5/ingame-yard-{2m,8m,20m}.png` with 2× crops | The atlas is now recognisable: torso, each leg and arm, the plates, the hands and the cummerbund are single islands. 452 charts instead of 1318, 698 texels/m instead of 580, and charts fill 83% of the square. The checker shows even density with little stretch. The face is a muted, darker skin with brow and nose shading and stubble. Held at 6: thin bands still unwrap as rings; the head and helmet charts are fans; the shoulders pinch; the gloves are lumps; Ember is not baked. |

## Iteration log

**Body, round 1** (studio turntables):
1. Camera yaw was reversed (the "front" render was the back) → fixed in the studio.
2. Rifle held at arm's length, arms straight: the support socket was 0.45 m ahead of the grip and the chest square → the chest blades 0.55 rad (support shoulder forward, head turned back to the aim), butt pulled into the pocket, support hand nearer the magazine well.
3. Grey flaps over the shoulders when the arms rose → torso no longer weighted to the deltoid helper; arms bound forward-down (halfway to the rifle pose) so the shoulder bends half as far.
4. Dark blotches on the torso's sides → arm bones left out of the AO bake (in the bind pose they hang where they never are in play).
5. Legs locked straight → fighter drawn at 1.02 scale (1.80 m) so the sim's eye height leaves the knees soft; feet apart and staggered at rest.
6. Helmet sat high like a cap → lower, wider shell, high cut over the ears, low at the nape.
7. Trousers did not follow the legs → the skin-weight chain was given top-down (it expects ascending stations), so whole legs were on the hip helper; boots likewise. Fixed.

**Animation, round 1** (walk strips, unit tests):
1. Strides of 1.6 m over-extended the legs (reach 1.06) because the head is pinned to the sim's eye height → shorter, quicker tactical steps; the pelvis bobs a few centimetres after the head solve.
2. Looking down while crouched pushed the hips out of the body cylinder → crouch more upright; aim-down taken mostly by neck and arms; the head solve bends the lower spine toward the target before moving the pelvis.
3. Sprint slid the feet 12 mm a frame (legs over-reach) → the sprinter runs 6 cm lower, leaned in.
4. Two deaths put the arm that ends underneath through the floor → re-keyed; death 2 lies higher (side-lying hips are wider).

**In game, round 1:**
1. Near-black silhouettes under the world's run-time lights → albedos raised; lighting split per the planner: diffuse from `probe()` as indirect irradiance, specular from `environment()` × `environmentScale()`.
2. Sunlit uniform blew out at full probe gain → gain 0.35.

**Round 2** (strips of every clip, head close-ups, in-game Lab and yard):
1. The support arm over-reached on long handguards (reach 1.01–1.16 for AR, DMR, shotgun) → the support shoulder protracts up to 0.8 rad until the hand is within 95% of reach (AR 0.94, DMR 0.95, shotgun 1.03).
2. Uniform was flat colour → printed three-tone pattern at about 12 cm with breakup, side, knee-panel and waist seams with dashed stitching (fighter material, flagged by wear ≥ 0.5 on fabric); dust on boots and lower legs, more in recesses.
3. Recoil and flinch were millimetres (spring peaks about 0.06 times tiny gains) → recoil 2–4 cm back and about 4° up per shot. The head solve cancelled a spine flinch (the head must stay in the sim's sphere), so the flinch now twists the chest against the neck, snaps the head, shrugs the shoulders and knocks the weapon off line.
4. Death 0 sat in an invisible chair mid-fall and ended with its legs in the air: tilting the pelvis back swings the legs forward with it → thighs counter-rotated during the fall, flat at rest with one knee up. Arms in the deaths flew out T-wide because the keys' roll adds to the A-pose bind → keys roll the arms inward during falls.
5. The slung weapon was buried in the body while using an object → it hangs at the right hip; the plant's hands go lower.
6. Ember's scarf stuck out in front of the chin like a bill, then vanished inside an over-blended neck → a thick wrap round the collar, the neck's blend radius halved; the jaw is wider.
7. Ember's ▲ sat on a backing that read as a ◆ when the arm turned it → round backing; Azure's ◆ narrowed so it never reads as a square.
8. Head and gloves meshed on a coarser grid before decimation: full-detail build 600 → about 390 ms.

**Round 3** (reviewer's eight points):
1. Stance → low ready when not aiming, reloading or just fired (1.2 s). Head down and rolled onto the stock when aimed; firing-elbow pole lowered so it tucks.
2. Build → shoulder joints out to ±0.20; chest and shoulders up to 12% wider and 10% deeper; arms ×1.15 (deltoid ×1.25); legs ×1.08; plates 6 cm thick, further forward, and the pouches follow; boots 12% wider and taller.
3. Shoulder volume → fuller deltoid rings (the pinch remains; see Still weak).
4. Values → kit darker, or a different hue from the fatigues; the admin, magazine and radio pouches are in webbing colour, so they separate from the plate bags.
5. Face → charcoal balaclava; glasses and goggles unchanged.
6. Legs → cargo pockets with flaps, and the trousers bloused over the boot tops.
7. Grounding and shade → a constant fill of 0.8 plus the probe × 0.6, as irradiance. The arithmetic: a 0.1 albedo beside walls baked to about 0.15 needs E near 4. The contact shadow is present on every tier.
8. Evidence → every clip re-rendered; in-game frames at 2, 5, 8 and 20 m.
- Budget paid for: helmet shell rows 5 → 4, leg straps 12 → 10 segments, pocket flaps as plain boxes, one fewer torso ring. Full detail is now 7.80k (Azure) and 7.93k (Ember).
- `handle(events, m, self)` added. Remote reloads start the reload animation, and a kill picks the death by where the shot came from: front falls back, behind falls forward, side spins. It is ready for the scene's call.

**Round 4** (baked texture sets; planner's change of technique and the reviewer's r2 notes):
1. Pipeline, built in my folders only: `scripts/breachline-assets/fighters/unwrap.ts` grows planar charts by normal cone and connectivity and shelf-packs them with 4-texel padding, density weighted to the head, chest and arms. `bake.ts` builds the game's own mesh, rasterises it into the atlas, evaluates a high-detail height in 3D along each texel's tangent frame (so chart seams do not show in the normal map), ray-traces 64-ray occlusion with three-mesh-bvh (arms and body occlude only themselves), paints albedo, roughness and metal in layers, dilates, and encodes KTX2 with the environment session's settings. Shipped: `public/game-art/breachline/fighters/rifleman-azure/` with per level `diff`, `nor`, `arm` and `uv.bin` (the unwrap of the very mesh the game builds).
2. Runtime: `render/fighters/textures.ts` loads the set through the environment session's `ArtLoader`. It gets the renderer from the first render and reaches my folder with a relative set name, so none of their files changed. It checks each level's vertex count, rebuilds the geometry with the shipped split vertices and UVs, and draws one standard PBR material per level: diffuse from the probe, specular-only reflections. On any failure the fighter keeps the procedural material. A unit test checks that every shipped level matches the mesh the game builds, and the download budget.
3. Studio lit three-point (warm key, cool fill, rim) on a mid-grey backdrop, with a moving key for turntables; it shows the baked set.
4. The full-size normal map was 2.3 MB of a 4.1 MB set → normal and AO/roughness/metal at half size; the set is 2.4 MB.
5. A brown block on the back was elbow dirt: in the bind pose the elbows sit beside the carrier → elbow and knee masks now apply only to texels on their own limb. Grime is neutral and capped.
6. Baked albedo is lighter than the vertex colours and carries its own occlusion → baked materials get half the probe fill.
7. Walk: shoulders counter-rotate visibly against the hips, the weapon bobs and sways with the step and lags the body, the stride is longer (inside the foot-slide test), and the weight is forward at rest.

**Round 5** (the reviewer's unwrap warning and r3 notes):
1. Unwrap rewritten (`unwrap.ts`). The mesh is split into its connected parts. Tubes are detected by the axis their normals are most perpendicular to (right for limbs and for short, wide bands) and unwrapped as one cylinder each, seam toward the body's centre. Other parts become planar charts with a loose normal cone, so bevels join their faces; parts under 30 cm² are one chart. Packing is a skyline packer, with 90° turns that are rotations, not mirrors.
2. Skin: 45% desaturated and darker, with brow and nose shading and stubble on the jaw and upper lip; rougher.
3. Studio: a numbered checker mode for judging density and stretch on the unwrap.
- Set size: 2.1 MB.

## Budgets measured

| Item | Budget | Measured |
| --- | --- | --- |
| Fighter, full detail | 6–8k tris | Azure 7.80k, Ember 7.93k (r3) |
| Middle / low level | ~3k / ~1k | 3.67k–3.74k / 1.34k–1.40k (r3) |
| Draw calls per fighter | ≤ 3 | 2 (body + kit, weapon) + one shared contact-shadow call for all |
| Bones | ≤ 40 | 32 (+9 in the weapon) |
| Ten fighters in view | ≤ 60k | ≤ 4 × 7.93k + 6 × 3.74k = 54.2k worst case (at most 4 at full detail) |
| Animation, ten fighters | ≤ 1 ms | 0.23 ms per frame (node, unit test) |
| Mesh build | — | about 390 ms for full detail (head and glove surface nets dominate; AO about 30 ms), 180 ms middle, 50 ms low; built lazily one per frame, lowest first, so the first frame is not blocked. **Still a stall of that size when a full level is first built; to be moved off the frame or cut further.** |
| Textures (download) | 6 MB for all fighters | rifleman-azure 2.1 MB: full detail diff 2048, nor 1024, arm 1024; middle 1024 / 512 / 512; low 512 / 256 / 256; UV data 250 KB. Ember not baked yet |
| Bake | offline | about 5 min for the three levels (64 AO rays) |

## Tests

`tests/games/breachline/fighters.test.ts` (32): budgets per level and squad; the head centre within 3 cm of the sim's head sphere centre and pelvis, waist and chest inside the body cylinder for 27 stance × lean × pitch poses; the bore along the view direction; a planted foot moves < 5 mm a frame walking, strafing, crouch-walking and sprinting; every death ends with all joints between the floor and 0.55 m; ten fighters' animation per frame. Whole unit suite 5373 passed; Breachline browser tests and the two-device online test 7/7 (r1).

r2 (342ed44): `npx tsc --noEmit` clean; whole unit suite 5381 passed; Breachline browser tests 7/7. **The two-device online test fails** at its line 54: after gunfire, device b's hole count does not match device a's within 10 s. It fails in the full browser sequence and passes when run alone. With `createFighters` swapped back to the original box figures at the same commit it fails identically, so it is not from the fighters. It was green at 3f3978e and arrived with commits from other sessions in between; reported to the planner.

## Still weak (what the next rounds change)

- **Below the gate: F = 6 against 7.** No asset or reference blocks it; it needs more rounds.
- Texture set: thin bands still unwrap as rings and the head and helmet charts are fans; the normal detail is soft at 1024; the Low tier still downloads the full-size albedo; Ember has no set yet.
- Shoulders pinch when the rifle is up (the deltoid collapses inward on the near side). Next: a second shoulder helper driven by arm elevation, and torso weights at the armpit.
- Gloves are lumps at close range; fingers do not separate.
- Faces read long; Ember's scarf barely shows above the shoulder straps.
- Azure's black kit in deep outdoor shade reads mostly black at 2 m.
- Sprint has bent knees and no flight phase; the strafe crosses its feet.
- Folds and pouch flaps are geometry and procedural shading only, with no baked normal detail.
- Third-person reloads for remote fighters wait for the scene's `fighters.handle?.(events, m, self)` call, which has been approved for the environment session.
- Building the full-detail mesh is about 390 ms the first time it is needed.
- The death ground test checks joints, not the skinned surface.
- **Not mine, reported:** the two-device online test fails at line 54 in the full browser run (it passes alone). It fails identically with the box figures swapped back in.
