# Breachline fighters — status

Session: fighters (row F: bodies, kit, materials, animation). Plan:
`docs/superpowers/plans/2026-11-11-breachline-visual-overhaul.md` (4.7, 5, 8, 9, "Parallel workstream: hero models",
"Fighters split out"). Owns `src/games/breachline/render/fighters/`, `tests/games/breachline/fighters*`, this folder.

## Phase

| Step | State |
| --- | --- |
| Seam: `createFighters` re-exported from `render/fighters/index.ts`, box figures moved unchanged | **Done**, b4c1e8c; unit 53/53, Breachline browser + online 7/7 |
| Reference study | Done (below) |
| Body, kit, materials, animation | In progress |

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
