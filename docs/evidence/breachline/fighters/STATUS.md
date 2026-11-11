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

**Where I am:** round 1 evidence committed; next is round 2 of body and kit (see "Still weak").

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
| r1 | **4** | `r1/turntable-s0.png`, `r1/turntable-s1.png`, `r1/before-after.png`, `r1/ingame-lab-*.png`, `r1/ingame-arc-*.png`, `r1/walk-strip-old-stride.png` | A real, skinned soldier with modelled kit and planted feet, the head exactly in the hit sphere, both squads distinct by kit, colour and shape. Held at 4 because: the support arm reaches at full stretch so the rifle hold looks presented rather than carried; the uniform is a flat colour with no camouflage, seams or pockets on the trousers; close up the gloves are lumps and the neck is long; only walking has been judged in motion (sprint, crouch-walk, strafe, firing, flinch, reloads, deaths are built and tested numerically but not yet looked at); outdoors in shade the figure goes dark. |

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

## Budgets measured

| Item | Budget | Measured |
| --- | --- | --- |
| Fighter, full detail | 6–8k tris | Azure 7.85k, Ember 7.99k |
| Middle / low level | ~3k / ~1k | 3.59k–3.66k / 1.26k–1.32k |
| Draw calls per fighter | ≤ 3 | 2 (body + kit, weapon) + one shared contact-shadow call for all |
| Bones | ≤ 40 | 32 (+9 in the weapon) |
| Ten fighters in view | ≤ 60k | ≤ 4 × 8.0k + 6 × 3.7k = 54k worst case (at most 4 at full detail) |
| Animation, ten fighters | ≤ 1 ms | 0.23 ms per frame (node, unit test) |
| Mesh build | — | about 600 ms for full detail (AO bake and head surface nets dominate), 250 ms middle, 50 ms low; built lazily one per frame, lowest first. **Too slow, to be cut.** |
| Textures | ≤ 1K, ≤ 150 ms | none: all surface detail is the shared shader's procedural PBR |

## Tests

`tests/games/breachline/fighters.test.ts` (32): budgets per level and squad; the head centre within 3 cm of the sim's head sphere centre and pelvis, waist and chest inside the body cylinder for 27 stance × lean × pitch poses; the bore along the view direction; a planted foot moves < 5 mm a frame walking, strafing, crouch-walking and sprinting; every death ends with all joints between the floor and 0.55 m; ten fighters' animation per frame. Whole unit suite 5373 passed; Breachline browser tests and the two-device online test 7/7.

## Still weak

- Support arm at full stretch; the hold looks presented. Hands are lumps close up.
- Uniform: flat colour, no camouflage print, no seams, no trouser pockets.
- Strips for sprint, crouch-walk, strafe, fire, flinch, reload, plant and deaths not yet rendered and judged.
- Third-person reloads only run for fighters this device simulates (`p.reload` is not sent over the network); remote fighters show no reload. Firing is taken from the scene's `muzzle()` request, which the scene makes for every shot.
- Mesh build time (600 ms per full level).
