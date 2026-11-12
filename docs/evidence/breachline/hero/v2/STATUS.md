# Breachline weapons rebuild (second build): status

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

## Wrist roll (planner approved)

The support hand's palm is rolled 20° about its finger direction (`rollAbout` in `rig.ts`) so the back of the hand
turns toward the player; fingers still wrap under the handguard and the thumb lies along the near side. Tried 0, ±20°
and +30° by eye (`__heroRoll`, `hero-v2-game.mjs` job `roll`); +20 and +30 both lose the end-on "ball", +20 kept.
The sleeve's cuff tab is gone (it stayed with the forearm while the cuff twisted with the wrist, and floated). Reloads
still meet the hand. Evidence `gate5-ar5-wrist-roll.jpg`. Honest read: hand about 5–5.5 now; the fingers' first
segments still merge into one mass at hip distance.

## Muzzle and cost (owner: "the muzzle flash and bullets don't come from the barrel"; "optimisation")

- Own shots: scene.ts guessed a point 0.7 m ahead of the eye. Now `Viewmodel.muzzle(out, worldCamera)` gives the held
  muzzle as the player sees it (same screen place, same distance from the eye), and scene.ts uses it (two lines,
  approved). The viewmodel flash sits 1.5 cm ahead of the muzzle socket. Test: `tests/games/breachline/muzzle.test.ts`.
  Evidence `muzzle-flash-hip-aimed.jpg` (flash held up for the slow capture with the dev switch `__heroFlashHold`).
- Third person: `patchfighters` took the muzzle from the weapon's matrix as last drawn. Fixed: `muzzle()` now poses the
  fighter from the shooter's state at the shot (aim, yaw, pitch; no time passes) and reads the muzzle from that pose.
  Not yet shown in a frame: `third-person-bot-attempt.jpg` has a bot in view, but it did not fire while captured.
- Cost per frame (`hero-v2-game.mjs` job `cost`, mean of 30 drawn frames, software rasteriser): script 0.09 to 0.40 ms
  (hip, aimed, firing, reloading, corridor and Lab), 3 draw calls, 19.6k triangles. Firing creates no geometry, material,
  texture or program (the warm test checks programs and textures after a firefight). Per-frame allocations removed from
  the arm solver and the light update.

## Arms asset trial (planner's item 3)

`gate5-arms-asset-trial.jpg`: (a) our sculpted arms, (b) the Patch soldier's arms from the shoulder down on our rig
(`scripts/breachline-assets/hero/arms-trial.ts`, switch `?heroarms=patch`), (c) not possible: its skeleton has one
bone per hand and no finger bones, so the fingers cannot be posed round the handguard. Its arm is 1,135 triangles with
405 in the hand (ours about 2,300 a hand), on the whole figure's texture. In the hand it reads worse: a black sleeve
and an open, fanned hand that pokes through the handguard. Verdict: keep the sculpted arms.

## First-person animation, honest read (item 5, not reworked yet)

Filmstrips: `animation-filmstrips.jpg` (aim, recoil, swap; about 4 to 8 drawn frames apart) and the reload strips in
`gate5-ar5-*-reload.jpg`.
- Aim transition, about 4: hip to aimed in about 0.15 s with a swing up and left on the way; it snaps rather than
  travels, and the support hand does not shift its grip. Would change: 0.25 s with an ease-in, a shorter arc, the stock
  coming to the cheek first, and a small settle at the end.
- Recoil, about 3.5: a small backward kick and a little rise; the rifle hardly moves at the hip, there is no
  per-shot camera kick in this layer and the flash lasts 50 ms. Would change: a sharper rearward impulse with a fast
  return, rise that builds over a burst, a slight roll, and the bolt and casing timed to the kick.
- Swap, about 4.5: the rifle drops straight out of frame and the sidearm rises straight in; no wrist turn, no hand
  change, and the sidearm is still the old model. Would change: the rifle rolls out to the right, the pistol comes up
  from the holster side with the support hand joining.
- Reload, about 5: the rifle tips and cants and the magazine change reads, but beats run together, the empty magazine
  vanishes rather than falling, and the support hand cuts across the receiver. Would change: hold each beat a few frames,
  drop the old magazine out of frame, a clear tug to seat it, and on empty a palm slap on the bolt catch with a jolt.
- Sway and walk bob: not filmed (needs live mouse input); in play they look reasonable but small.

## Hand trial 2: Patch "Base Hand" (won, now the default)

Base Hand by Polyfork (https://polyfork.dev/asset/base-hand-e3398a), CC BY 4.0; licence read from the GLB
(`asset.extras.license`: "CC-BY-4.0 OR LicenseRef-Polyfork", credit in `asset.copyright`), not AI-generated, SHA-256
checked; credited in `public/THIRD_PARTY_NOTICES.txt`. `scripts/breachline-assets/hero/hand-trial.ts` mirrors the left
hand to a right hand and retargets its 26-joint rig onto our hand and finger bones (each joint's bind frame onto
ours, blended by its weights), tagging back, palm and knuckle panel; `armsWithHand` in `hands.ts` puts it on our
sleeve with a glove cuff and strap. Owner's grip and the 20° wrist roll kept. Evidence `gate5-hand-asset-trial-2.jpg`.
Cost: 3,000 triangles a hand (sculpted 2,300), 18 bones an arm as before, the same one draw call.
Verdict: it wins. The fingers read as fingers wrapping the handguard, and the trigger hand reads in the reload. Still
to do: seams and a texture (it uses the procedural glove colours now), a slimmer cuff, and the sculpted glove is
still built at load before being replaced (about 0.7 s once). `?herohand=sculpt` brings the old one back.

## First-person animation, pass 1 (approved changes)

`animation-filmstrips-v2.jpg` (old above new: aim, recoil, swap; new walk bob and sway) and `animation-reload-v2.jpg`.
- Aim: spring 13 rad/s, damping 0.8 (about 0.25 s with a slight overshoot that drops the weapon a few mm as it settles);
  the travel toward the eye leads the move to the centre (stock to the cheek first); arc 8 mm instead of 20.
- Recoil: rearward kick 1.4 times stronger on a stiffer spring (fast return); rise grows 12 % a shot over a burst (up to
  7 shots); a constant roll added to the random one; flash 66 ms (4 frames at 60 fps) with a point light on the
  weapon that is always in the scene (fixed light count) and dark between shots. The wall light needs a world flash for
  own shots in scene.ts (`fx.flash` at the muzzle), not done.
- Swap: the weapon rolls out and in low on the right (holster side) instead of straight down.
- Reload: the spent magazine falls straight out of the well and out of frame; the hand lets go and then fetches the
  fresh one; a downward tug after seating; the palm slap on the bolt catch from empty as before.
- Honest re-rating from stills: aim 5, recoil 4, swap 4.5 to 5, reload 5, bob and sway about 5. The changes are real but
  modest, and stills at software frame rates do not show timing well; it needs judging in motion on a real machine.

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
