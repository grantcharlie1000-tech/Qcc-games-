# Breachline weapons rebuild (second build) — status

Session: weapons rebuild, from 2026-11-12 (plan: "Hero models, second build", "Weapons rebuild resumes").
Owns `models.ts`, `render/hero/`, `scripts/breachline-assets/hero/`, `public/game-art/breachline/hero/`, this folder.

## Where I am

**AR-5: gates 1–5 done; the baked AR-5 is what players now hold.** Hands: anatomy rebuilt to the plan
(gate 3), hands' set rebaked for the new mesh. Next: the shared kit (rails, sights, grips, magazines) and the Halden 12.

## Pipeline (new)

| Step | Where | Notes |
| --- | --- | --- |
| Design parameters (mm) | `render/hero/sculpt/designs.ts` | One table drives the sculpt, the design sheet and the run-time sockets (`ar5Sockets()`). |
| Sculpt kit | `render/hero/sculpt/sdf.ts` | Exact SDF primitives (boxes with chamfered or rounded edges, cylinders, extruded and revolved outlines with true arc fillets), chamfered and filleted unions and cuts, repeats, rotations, fine relief. Every shape carries a box; outside it the box distance stands in. |
| AR-5 sculpt | `render/hero/sculpt/ar5.ts` | 25 parts, `hi` adds stipple, knurling, serrations, screw sockets, pin dimples, slot-edge chamfers (normal map only). Offline only: the game never imports it. |
| Mesher | `scripts/breachline-assets/hero/mesher.ts` | Narrow-band surface nets (coarse pass every 4th point), vertices projected onto the surface. 0.4 mm grid: about 6M raw triangles for the rifle, about 50 s. |
| Game mesh | `scripts/breachline-assets/hero/sculpt.ts` | Per part: pre-simplify (0.03 mm), then one global error searched so the total meets the budget, divided by a per-part weight (optic, mount, charging handle and rail get the most). Face normals with 40° creases. Writes `public/game-art/breachline/hero/ar5/mesh.bin` (format in `render/hero/meshbin.ts`). |
| In game | `render/hero/baked.ts`, `weapons.ts` (`registerBaked`, `heldWeapon`), `rig.ts` (`resetHolds`), `viewmodel.ts` | The baked weapon replaces the procedural one in hand once its mesh and set load; on any failure the procedural rifle and its old set stay. World weapons (`worldWeapon`) are unchanged. `?heroclay` shows weapons and arms in grey clay. |
| Studio v2 | `render/hero/studio/v2.html`, driven by `tests/games/breachline/hero-v2-shots.mjs` | Clay or textured views beside the benchmark pistol under the same light; the design sheet. |
| Game frames | `tests/games/breachline/hero-v2-game.mjs` | 1280×720, corridor and Lab, hip and aimed (aim held 1.4 s: 0.6 s is not a finished aim), reload frames. Crops and sheets: `scripts/breachline-assets/hero/evidence.py`. |

## Gates

| Gate | AR-5 | Evidence |
| --- | --- | --- |
| 1 Design sheet | done | `gate1-ar5-design-sheet.jpg` |
| 2 Clay, studio and first person | done, sent to the planner | `gate2-ar5-clay-studio.jpg`, `gate2-ar5-clay-firstperson.jpg` |
| 3 Hand and arm clay | done | `gate3-hands-clay.jpg` |
| 4 Baked and textured, moving light | done | `gate4-ar5-textured-studio.jpg`, `gate4-ar5-moving-light.jpg`, `gate4-ar5-atlas.jpg` |
| 5 In the game, old beside new | done, sent to the planner | `gate5-ar5-{corridor,lab}-hip-aimed.jpg`, `gate5-ar5-{corridor,lab}-reload.jpg`, `gate5-ar5-reload-crops-2x.jpg` |

## Honest read at gate 2

- Better than r6 in shape: slim receiver (27) and handguard (44), real parts (rail with slots, octagonal slotted
  handguard, flared well, raked stippled grip, bolt catch, selector, pins, a two-ring red dot with turrets and hoods,
  folded back-up sights), and it reads as a rifle from every side. In clay beside the Service Pistol the forms are of
  a similar order of complexity at this distance.
- Still wrong: the stock is a slab (better than before, still not designed); the optic dominates the hip view and its
  rear hood ring is faceted at 2×; the handguard's angled vents read as long grooves; edges are crisp but all of
  equal weight. The arms are the old glove (gate 3 work).
- Aimed: the 31 mm window is centred on the crosshair with the dot in it (checked numerically: gun at (0, 0, -0.075)
  with no rotation after the aim settles).

## Gate 3: hands

- First person has its own anatomy (`FP_HAND` in `hands.ts`); `HAND` is untouched because the fighters build from it.
  Plan sizes: palm about 85 × 29 mm, knuckles 101–106 mm from the wrist in an arc, fingers from the knuckle 72 / 80 /
  74 / 58 mm split 50/28/22 %, 19–20 mm wide at the first joint tapering to 15–16, wrist 58 × 39. The arm bones follow
  the same table, so the owner's grip pose in `rig.ts` is kept as it was.
- Glove: a continuous moulded knuckle panel along the knuckle arc, finger-back guards, wrist strap with its buckle
  tab and a pull tab. Sleeve: 112 mm at the forearm to an 85 mm cuff over the glove, deeper compression folds at the
  elbow and above the cuff, turned hem and a cuff tab.
- Honest read: the hand reads as a hand holding the handguard and the proportions are right, but in flat clay the
  fingers do not separate well at game distance; the glove's seams and two tones do most of that work once
  textured. The thumb and the strap tab look blocky when the hand is close (aimed view, lower left).

## Gate 4: baked set

- Unwrap (`scripts/breachline-assets/hero/chart.ts`): per part and dominant axis, connected by position; 1711 charts,
  about 2000 texels/m at weight 1, 45 % of the 2048 atlas.
- Field bake (`bakefield.ts`, four processes, about 6 min; cached by the texels and the sculpt, so a repaint takes under
  a minute): normal from the high-detail field along the low mesh's normal (4 sub-samples per texel, encoded for the
  shader's derivative tangent frame), occlusion traced through the field (14 rays, 32 mm), curvature at 0.35 and 1.5 mm.
- Paint (`sculpt.ts`): per finish (anodised aluminium, dark-earth cerakote, polymer, dark-earth polymer, parkerised
  steel, rubber, brass; matt black inside the optic), thin broken edge wear to bare metal on the sharpest edges only,
  grime in cavities, roughness variation, handling polish on the grip, charging handle and magazine.
- Encoding: ETC1S for all three maps (UASTC was 2 MB a map at 2048). High: 1.43 MB of textures plus a 544 KB mesh
  (quantised); Low: 0.5 MB plus the mesh.
- Honest read: the edges catch a thin gleam that moves with the light and the stipple, knurling and rail slots read;
  the receiver is still very dark under the studio light; the stock is plain; the magazine and handguard colour is
  flat between edges (little mid-frequency variation); no markings yet.

## Gate 5: in the game

- Old (left, `?heroold`) beside new (right) in the corridor and the Lab, hip and aimed with 2× crops, and four reload
  frames each. Captures draw 24 frames before each shot: the viewmodel's springs only move on drawn frames, so the
  earlier 0.6 s aim frames showed a weapon still on its way up (that, not the sight, was the off-centre window).
- Aimed: the window is centred and the red dot sits on the true crosshair (measured: dot at camera (0, 0, -0.23)).
  The dot's chart is now large in the atlas: at 2 texels ETC1S averaged it away.
- Spent cases are back in the mesh (three brass cases on the case bones), excluded from the occlusion bake.
- Honest read (row E): about 6 against the owner's scale. Better than r6: slim, crisp edges with a moving gleam,
  real parts, a sight you look through. Still wrong: the optic still dominates the hip view; the receiver is dark
  under the corridor light; the support hand's fingers merge at hip distance; the stock and magazine are plain; no
  markings; the dot is small and dim against bright walls.

## Gate 5, second pass (planner's review of gates 2–5)

Done: compact red dot (26 mm body, 22 mm window, sight line 58 mm over the bore, low riser), coated cool glass and
matt black inside (the "copper pipe" was the amber lens material); aimed now shows a thin dark ring, clear glass and a
bright dot on the crosshair. Adjustable stock with a round collar on the tube, raised cheek surface, recessed side
panels, latch lever, sling slot, position notches on the tube; no pointed forms. Receiver lifted (#676b70) with
roughness drift; colour drift, handling polish and bottom-edge scuffs on the handguard and magazine. Invented markings
(MARROW AR-5, CAL 5.56, M5-04217, MRW WORKS, SAFE SEMI AUTO, MRW on the mount). Arm slimmer, squad band toned toward
the sleeve, cuff hem a clear step; fingers slimmer and spread; the glove a lighter coyote than the handguard.
New hip hold chosen from `gate5-ar5-holds.jpg`: lower right, less cant, barrel less steeply in; the support grip moved
back to 360 mm and the left shoulder forward so the hand still reaches (holds further forward left it floating).

Honest read: aimed is now right; the optic no longer dominates the hip view. Still wrong: at the hip the support hand
shows its back and wrist strap, so it reads as a mitten; with the owner's pose the fingers wrap the far side, out of
view. Showing four fingers needs a pose change (fingers over the top of the handguard), which is the owner's call.
The receiver and magazine are still mostly below the frame at the hip; the reload frames show them.

## Hand pass (time-boxed, owner's pose kept)

Flatter back of the hand (palm 76 × 18 mm core, slimmer, lower metacarpals), a smaller crisper knuckle row, narrower
wrist and a smaller glove cuff so the sleeve hem steps over it, the large strap and pull tabs removed, glove darker
and less saturated (#8a806e). Evidence `gate5-ar5-hand-pass.jpg` (before left, after right, corridor and Lab, 2×).
Honest read: a small improvement, still about 4.5–5. The "square patch" is the dark knuckle panel seen nearly end-on:
from this camera, with the owner's pose, the back of the hand faces along the line of sight and is foreshortened
into a ball. Shape changes alone barely move it; turning the hand's back toward the camera (a wrist roll of 20–30°
toward the player, fingers still wrapping under) is the next lever, if the planner agrees.

## Decisions (made without asking; say if wrong)

- New assets go to `hero/ar5/`, not `hero/ar/`: `render/patchhero/` (the `?weapons=patch` switch, not mine) cuts its
  optic from the procedural AR and uses the old `hero/ar` set; overwriting it would break that switch. When the
  switch is retired, `hero/ar/` (5.8 MB) can be deleted, which the 12 MB budget will need.
- The red dot sits further forward (u 90–162 over the receiver's front half) and the aimed eye relief is 0.075 m, so the
  window is larger when aimed and the hip view shows more of the receiver.
- Chamfered and filleted unions bulge where two shapes share a face; those joins are hard unions now (found as a hole
  in the magazine well).

## Tests

Gate 5 push: `npx tsc --noEmit` clean; `npx vitest run tests/games/breachline` 121 passed (the fighters' frame-time test
fails only while a browser capture loads the machine); Breachline browser tests 8/8 passed with the baked AR-5 in hand.

Gate 2 push: `npx tsc --noEmit` clean; `npx vitest run tests/games/breachline` 116 passed; Breachline browser tests
(`play.spec.ts`, `warm.spec.ts`) 8/8 passed. Players still see the old rifle: the AR-5's new texture set does not exist
yet, so the baked loader falls back.
