# Breachline hero models — status

Session: hero models (weapons, hands, reloads, fighters). Plan: `docs/superpowers/plans/2026-11-11-breachline-visual-overhaul.md`
(sections 4.6, 4.7, 5, 8, 9 and "Parallel workstream: hero models").

## Phase

| Step | State |
| --- | --- |
| Seam (`render/hero/index.ts`, `createViewmodel`, `createFighters`, `HeroLighting`) | **Done**, commit 64547a5, behaviour unchanged; unit (53), Breachline browser (6) and online (1) tests green |
| Shared reload beat table `reloads.ts` | Created to the audio plan's section 4 shape (commit 17d94db); the sound session owns it and may retune |
| Reference study | Done (below) |
| Geometry toolkit (`render/hero/geom.ts`) | In progress |
| Weapons ×6, hands, reloads | Not started |
| Fighters, animation | Not started |

## Scores (row E: weapon and hands; row F: characters). 8 = MW2 (2009)

| Round | E | F | Evidence |
| --- | --- | --- | --- |
| Baseline | 1 | 1 | `docs/evidence/breachline/05-breach.png`, `overhaul/phase-0/lab-bench-high.png`: about 30 boxes, slab arms, a blue block for a wrist band; fighters are six rigid box groups |

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

(none yet)

## Budgets measured

(none yet)

## Still weak

Everything in rows E and F is still the baseline.
