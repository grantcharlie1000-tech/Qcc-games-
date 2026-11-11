# Patch asset trial: status

Evidence only (nothing integrated into the game). Renders made by `scripts/breachline-assets/patch-trial/`
(standalone page `index.html` + `trial.ts`, driven by `soldier.mjs` / `rifle.mjs` through the pre-installed Chromium,
software WebGL). Downloads were fetched over HTTPS from the Patch API, checked against the API's sha256, kept in a
scratch folder outside the repository, and parsed only by three's `GLTFLoader` (none uses meshopt/KTX2/Draco).

Light for every render: RoomEnvironment at 0.5, warm key high front-left, cool fill low front-right, rim behind
(the fighter studio's rig, turned with the camera), mid-grey backdrop, ACES tone mapping, no post effects.

Sheets are JPEG (not PNG) to stay under 400 KB.

## Progress

- [x] 1. Tactical soldier sheet: `soldier-tactical.jpg`, and beside our rifleman: `soldier-tactical-vs-ours.jpg`;
  its raw textures: `tex-tactical-basecolor.jpg`, `tex-tactical-metalrough.jpg`
- [x] 2. Rifle sheet: `rifle-scifi.jpg`, and beside our AR-5 and the Poly Haven Service Pistol: `rifle-scifi-vs-ours.jpg`;
  raw colour texture: `tex-rifle-scifi-basecolor.jpg`
- [x] 3. `soldier-armoured.jpg`, `soldier-trooper.jpg`, `rifle-bolt.jpg`
- [x] 4. Assessment below; summary table at the top

## Summary

| Candidate | Recommendation | One line |
| --- | --- | --- |
| Tactical soldier in black | **Adopt with named fixes** | Far better than our rifleman; fix metalness, cover the bare head, replace the hands, recolour by mask |
| Weathered armoured soldier | **Reject** | Reads as a famous sci-fi franchise's armoured trooper; 179k triangles; grime and gloss baked in |
| Orange desert trooper | **Reject** (for fighters) | Clean and light (5.5k) but a sci-fi spacesuit look, low detail up close |
| Black sci-fi assault rifle | **Reject** (as the main rifle) | Rich detail, but sci-fi glow, readable "X7A"/"07" text, baked shading, one fused mesh |
| Service Pistol (Poly Haven) | **Adopt** | The quality bar; separate parts; sidearm as planned |
| Bolt Action Rifle 7.62 (Poly Haven) | **Adopt for the marksman slot only if a vintage rifle is wanted**; otherwise benchmark | Artist quality, but a wooden WW2-era scoped rifle |

Nothing here is a modern assault rifle of artist quality; the AR question stays open (our second build, or a
further search).

## Notes on method

- The dev server's Content-Security-Policy blocks GLTFLoader's `blob:` texture fetches, so the driver opens the page
  with Playwright's `bypassCSP` (trial page only). The repo's pinned Playwright expects a different headless shell, so
  the driver launches `/opt/pw-browsers/chromium` (the project's documented workaround).
- "Game scale" close-ups are the exact pixels of a 1280x720 frame with a 70-degree vertical FOV, 2 m from the
  target (about 257 px per metre), cut out with `setViewOffset` and enlarged 3x with nearest-neighbour.
- Our rifleman is shown in its idle pose with the AR (it has no A-pose); the candidate has no skeleton, so it is in
  its own A-pose.

## Tactical soldier in black (`scenario:asset_e9xaKzrr8R1sMe2VMajWaAb1`, `web`, 18,782 triangles, 2048 px)

Loaded at its own 1.72 m. Rodin (Hyper3D) v2.5 "fast" image-to-3D; CC-BY-4.0.

**Good.** Clearly the best-looking person we have seen in this project: a believable modern tactical outfit (plate
carrier with magazine pouches, belt with drop holster, knee pads, gloves, boots), proportions of a real adult,
convincing silhouette from every side including the back (the back is finished: carrier rear panel and straps).
At game scale (2 m, 1:1) it reads as a real soldier; ours reads as a toy beside it.

**Wrong.**
- **Bare head with a realistic face.** No helmet, no balaclava. That is not our look (ours are masked and helmeted)
  and a realistic, specific-looking face is a liability (it can resemble a real person). Our helmet and goggles would
  have to go on, and the hair would poke through unless removed.
- **Metalness map is wrong for cloth.** The metal/rough texture marks the sleeves, gloves, boots and parts of the
  carrier as fully metallic and smooth (pink areas in `tex-tactical-metalrough.jpg`), so the sleeves render as glossy
  black latex in every view. Fix: force metalness to 0 everywhere except true hardware, raise roughness.
- **Hands.** Gloves are fused mitts; the fingertips are bare skin-coloured blocks with no separate fingers (see
  "hand: studio detail"). At 2 m it is a dark blob with orange tips; any hand animation (grip on a rifle) needs the
  hands remodelled or replaced.
- **Texture atlas is shredded**: thousands of tiny islands (`tex-tactical-basecolor.jpg`). Repainting, re-colouring
  for the second squad, or adding our patches is impractical on it; mip-mapping will bleed colour at island edges at
  distance. Little baked lighting in the colour map (it is near-uniform black), which is good.
- No skeleton; A-pose with arms slightly bent. Skinning to our skeleton is needed; fused fingers make that easier,
  not harder.
- No logos or readable text seen on the model or texture.

**Verdict (provisional): adopt with named fixes** — metalness to 0 / roughness up; head replaced or covered by our
helmet + balaclava + goggles (remove the hair and face); hands replaced by our gloved hands at the wrist; re-colour by
a tint mask rather than repainting the atlas. Final verdict after the other soldiers are seen.

## Black sci-fi assault rifle (`scenario:asset_kHXqk4QynhrkbnpiD9C8A5zo`, `web-lod2`, 151,030 triangles, 2048 px)

Meshy 7 image-to-3D; CC-BY-4.0. Patch's size (1.90 m) is an estimate and clearly wrong; rendered at 0.88 m. One fused
mesh, double-sided material. The first-person frame places it and our AR-5 identically (camera at the eye, 55° FOV,
no hands) so only the models differ.

**Good.** Dense, coherent hard-surface detail with real depth: chamfered panels, vents, rail, a box sight, a
skeleton stock with through-holes, ribbed magazine, raked grip. It holds up in the 2x first-person crop far better
than our AR-5, whose handguard and receiver are still flat slabs. Both sides are finished; the underside and top are
plausible. No melted areas at this level; small parts (trigger, sight) are clean.

**Wrong.**
- **It is a sci-fi weapon, not a modern rifle**: glowing blue capsule windows in the handguard and sides, orange
  accent stripes. That does not fit a modern close-quarters game; recolouring the glow out leaves recessed windows
  with nothing in them.
- **Readable text**: "X7A" on the receiver and handguard, "07" on the stock, small pseudo-labels elsewhere. Generated,
  not a brand I recognise, but it must be painted out (the plan forbids logos and readable text from unknown origin).
- **Baked shading** in the colour map: each panel carries its own darkening and highlight gradient, so it looks
  slightly "painted" and will fight our lighting; the atlas is shredded into hundreds of islands (see
  `tex-rifle-scifi-basecolor.jpg`), so clean repainting is impractical — it would need re-unwrapping and a re-bake.
- **One fused mesh**: magazine, trigger, charging handle and sight are welded on. A reload needs the magazine cut out
  and capped; there is no bolt or port to animate.
- The overall silhouette is chunky (deep receiver, fat stock) — closer to a game "future rifle" than to the slim
  proportions the plan asks for (handguard 40–48 mm).

**Reduction to about 15k triangles with a baked normal map.** 151k is about 10x the budget. What would survive as
geometry: the outline (receiver block, handguard, stock frame with its large holes, grip, magazine, sight box, muzzle).
What would move into the normal map acceptably: panel lines, vents, rail teeth, small screws, the ribs on the
magazine and stock. What would suffer: the shallow window recesses and edge chamfers that catch light (they become
flat-shaded), and close to the camera (first person, 2x crop) the silhouette steps on the sight and rail would be
visible. In first person it is probably fine at 15k; seen from 2 m in third person it certainly is.

**Comparison.** Against our AR-5: richer and more convincing at every distance, but stylistically wrong (sci-fi) and
with readable text; ours is the right kind of rifle drawn badly. Against the Poly Haven Service Pistol (the bar): the
pistol is clean, accurately proportioned, separate parts (slide, hammer, trigger, magazine), tidy UVs and no baked
light; the generated rifle is busier and less believable as an object. A stranger would not think they came from the
same studio.

**Verdict: reject as our main rifle** (sci-fi design, text, baked shading, fused). It could serve a future or
"prototype" weapon after paint-out of the text and glow; not for row E's modern AR. Its value is as a reference for
the density of detail we lack.

## Service Pistol (Poly Haven, CC0) — benchmark

Variant A (wood grips); the file also carries variant B (blue grips), an empty magazine and a loose round, hidden
here. 16,650 triangles as assembled. Clean, separate moving parts, correct scale, no text seen. **Adopt as the
sidearm** (as the plan already intends), credit Mateusz Sadek / Poly Haven.

## Weathered armoured soldier (`scenario:asset_ma3BPFTWWAETEfU8vh9zQFrM`, `web-lod2`, 179,436 triangles)

YVO3D image-to-3D; CC-BY-4.0. The file faces +X and is 1.0 m tall (Patch's scale is an estimate); turned and
rendered at 1.78 m.

**Good.** Very rich sculpted detail: layered plates, pouches, straps, knee and elbow armour, gloves with separate
fingers that hold up at studio scale, finished back.

**Wrong.**
- **Recognisable design.** A full-face helmet with an orange visor and a sculpted jaw guard, bulky plated
  sci-fi armour: it reads at a glance as the drop-trooper armour of a famous console shooter franchise. That alone is
  disqualifying under the plan's caution.
- **Weathering and lighting baked into the colour**: heavy grime, dark crevices and highlights painted in; under our
  light it looks wet and glossy-black in the recesses. Strong red accent stripes.
- 179k triangles at the lightest LOD offered (1.5M source): about 10x a fighter's budget; a reduction would lose most
  of what makes it look good.
- No skeleton; hands are moulded in a half-curl.

**Verdict: reject.**

## Orange desert trooper (`scenario:asset_in3md75AeDtffS4gGsbWsrBM`, `web`, 5,542 triangles)

Tripo P2 image-to-3D; CC-BY-4.0. 1.0 m in the file (estimated); rendered at 1.78 m.

**Good.** Light (5.5k, under budget as is), clean and readable silhouette, simple tidy shapes, symmetrical, finished
back with a backpack; gloves have a readable thumb and fingers at studio scale.

**Wrong.**
- **The look**: an orange suit with a full helmet, dark bubble visor and respirator: a sci-fi colonist or spaceman,
  not a modern soldier. Re-colouring would not fix the helmet.
- **Low detail up close**: smooth, rubbery surfaces with painted-on wear; the "armour" is just bumps in a one-piece
  suit; at 2 m it looks like a toy figure (though a cleaner one than ours).
- Glossy, plasticky highlights (high metalness or low roughness in its map).
- A holstered pistol is part of the leg mesh.

**Verdict: reject for the fighters.** Could be a stand-in for a non-combat or sci-fi mode; not for Breachline.

## Bolt Action Rifle 7.62 (Poly Haven, CC0, 18,276 triangles shown)

The file's muzzle points to +X; turned to match. The alternate bolt (`bolt_b`) and the loose round are hidden.

**Good.** Artist quality throughout: correct proportions, clean wood grain, a cloth wrap on the stock, scope with
glass, separate bolt and trigger, tidy UVs, no baked lighting seen, no text or logos seen. It reads as a real object
at every distance and in first person.

**Wrong for us.** It is a wooden, military-surplus scoped bolt-action of the mid-20th century (generic, but
obviously historical), not a modern marksman rifle; it would stand out next to modern kit.

**Verdict:** the best-made weapon here with the pistol. **Adopt for the marksman slot only if the owner is happy with
a vintage rifle in a modern game**; otherwise keep it as the benchmark for our own builds.

---

# Job 2: preparing the assets (planner's request, 2026-11-11 11:15 UTC)

Processed files go to `public/game-art/breachline/patch/<asset>/` (the only folder outside my two that this job may
write). Nothing is wired into the game. Textures follow the game's `ArtLoader` layout (`<kind>-<size>.ktx2`, with
`<kind>-512.jpg` fallbacks), so `new ArtLoader(renderer, tier).texture('../patch/<asset>', kind, size)` loads them.
The KTX2 settings are copied from `scripts/breachline-assets/build.mjs` (in `patch-trial/ktx.mjs`; that script
could not be imported because it runs its whole build when imported).

## 2.1 Tactical soldier, cleaned — done

Script: `scripts/breachline-assets/patch-trial/prep-soldier.mjs` (from the Patch `src` variant, 4096 px maps).
Proof: `job2-1-tactical-clean.jpg` (original beside LOD0 and LOD1, the recolour, the mask, the neck and wrist caps;
textures loaded from the shipped KTX2 files through `ArtLoader`).

Files in `public/game-art/breachline/patch/tactical/` (4.01 MB in total, budget 4 MB, see below):
- `body.glb` (since removed, see 2.2): nodes `body_lod0` (12,000 triangles) and `body_lod1` (4,999), POSITION/NORMAL/TEXCOORD_0, no
  materials or images. Metres, +Y up, **facing +Z**, feet on y = 0, as delivered. The cut planes and the reference
  luminances are in the asset's `extras` and in `tactical.json`.
- `diff-2048/1024.ktx2`, `nor-2048/1024.ktx2`, `arm-1024.ktx2`, `mask-1024.ktx2`, fallbacks `diff/nor/arm-512.jpg`
  and `mask-256.png`.

Decisions:
- **Metalness 0 everywhere.** The brief said to keep real metal such as buckles; at the size we draw a fighter there
  is none worth keeping, and the generator's metal map only marked the sleeves, gloves and boots (8% of texels, all
  wrong). Roughness is remapped to 0.55–0.95, which removes the latex look. The packed map keeps glTF's layout
  (R = 1, G = roughness, B = 0), so it works as `roughnessMap`/`metalnessMap`. With only roughness left in it, I ship
  it at **1024 only**: at 2048 it was 1.75 MB for no visible gain. That is what keeps the set within 4 MB.
- **Cuts** are plane cuts through the triangles (straddling triangles are split, not dropped), each opening closed
  by a fan cap: neck at y = 1.525 m (just above the hood collar), wrists at the glove cuffs, perpendicular to the
  forearm (planes in `tactical.json`). The caps use a black cloth texel. A little neck skin still shows inside the
  hood ring at the neck cut (see the close-up); our balaclava covers it. If it does not, lower the cut 1–2 cm.
- **Tint mask** (`mask`, 255 = kit): plate carrier, belt and its pouches, drop holster, knee pads, boots. Fatigues:
  sleeves, trousers, hood. Set by body region in 3D and rasterised into the atlas, then dilated 6 texels and blurred
  slightly, because the atlas is shredded and all near-black, so colour gives nothing to separate by. Boundaries are
  therefore straight cuts by height, not seams of the garment. Kit is about 50% of the atlas.
- **Recolour formula** (the reference is in `trial.ts`, `loadPrepared(..., { tint })`): in linear space,
  `l = luminance(base)`, `colour = mix(tintFatigues * clamp(l / refFatigues, 0, 3), tintKit * clamp(l / refKit, 0, 3), mask)`,
  with `ref` = the class's mean luminance (sRGB 0.0678 fatigues, 0.0546 kit, raised to the power 2.2). Shown: coyote
  `#6b5133` fatigues with olive `#464b2c` kit.
- **LOD1 at 5k:** the shredded atlas's UV seams stop meshoptimizer at about 10k. LOD1 is therefore simplified with
  vertices welded by position, and each corner takes the duplicate in its triangle's UV island. 47% of LOD1
  triangles cross a seam and stretch texture across it; on the black outfit at LOD1 distances (7–18 m) that shows
  only as faint specks at the shoulders. A clean fix needs a re-unwrap.

**Credit and licence, exactly as the Patch record gives them** (for `public/THIRD_PARTY_NOTICES.txt`):

> asset_e9xaKzrr8R1sMe2VMajWaAb1 ("Tactical soldier in black", title by Patch) by Scenario (Scenario, https://huggingface.co/datasets/scenario-labs/3d-collection/blob/55b4c002b4c1529fc48da3dff98516c3069bfa3f/assets/scenario_asset_e9xaKzrr8R1sMe2VMajWaAb1/output.glb), licensed Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/). AI-generated with Rodin (Hyper3D) v2.5 fast image-to-3D. Changed by Patch: textures resized to 2048 px, pivot moved to the bottom centre, credit and license added to the file metadata, simplified LODs added.

Licence: CC-BY-4.0 (Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/).
CC-BY requires the changes to be stated. Our changes, to append: "Changed for Breachline: from the 4096 px source; head
cut at the neck and hands at the wrists; metalness removed and roughness remapped; simplified to 12k and 5k
triangles; tint mask added; textures re-encoded as KTX2."

## 2.2 Tactical soldier, skinned (prototype) — done; verdict: deforms acceptably at game distances, tears in two places close up

Script: `scripts/breachline-assets/patch-trial/skin-soldier.ts` (run with `npx vite-node`; it imports
`fighters/skeleton.ts` read-only). Viewer: `trial.ts` `loadSkinned` / `pose` / `joint`, using the stock `Animator`
(walk, aim, crouch and death are the fighters' own scripts, copied from the fighter studio) with our AR in hand.
Proof: `job2-2-tactical-skinned.jpg`.

**File for the fighters session:** `public/game-art/breachline/patch/tactical/body-skinned.glb`, nodes `body_lod0`
and `body_lod1`. Already in the **fighters' frame and bind pose** (facing -Z, authored units; the fighter group's
`SCALE` applies as for our own body), with `JOINTS_0` = bone indices in `skeleton.ts` order `B` and `WEIGHTS_0` as
normalised bytes (4 per vertex, summing to 255). Bind it exactly like our figure:
`new THREE.SkinnedMesh(geo, mat); mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(makeBones()))`, with the
textures from 2.1 (`'../patch/tactical'`). The static `body.glb` was dropped from `public/` to stay near the budget
(the skinned file carries the same two levels); `prep-soldier.mjs` regenerates it.

**Method.** Joints measured on the A-pose mesh (listed in the GLB's `extras.measuredJoints`). Weights by distance to
bone segments: each vertex takes its nearest bone and the bones adjacent to it in the hierarchy, w = 1/d⁴; arm bones are
penalised smoothly inside the torso's width; 10 smoothing passes over the position-welded mesh, so UV seams cannot
split. Half of each two-bone blend at the elbows, knees, shoulders and hips goes to the helper bone; the distal
forearm leans on the twist bone. The mesh is then moved into the bind pose by those weights, so the stock bind
matrices and the animator work unchanged.

**What it shows.**
- Walk, crouch, crouch-walk and the death fall: **acceptable**. The legs bend cleanly, the knee pads stay on the knees,
  and the vest stays rigid enough. At 2–8 m it reads as a real soldier moving with our animation.
- **Aiming: the shoulders bunch.** The deltoid area pushes up into the hood when the rifle is raised, and the
  support-side elbow folds into a sharp crease. There is no tear after smoothing; the first pass, with a hard arm/torso
  boundary, had spikes at the right elbow, now gone.
- **Crouch, right hip: a tear.** The drop holster and thigh-pocket flap pull away from the belly and open a gap
  showing the inside. The generated mesh has overlapping, fused geometry there, so a weight fix will not cure it.
  Fix: weight the holster region rigidly to the thigh, or cut the holster off and attach our own.
- No hands and no head yet. Those are our attachments (hand bones and head bone exist in the skeleton).

**Recommendation:** usable as the fighter body after two targeted fixes: (a) re-weight the shoulder for the aim
pose, more `delt` helper and less `spine2` above the armpit; (b) rigid-weight or remove the thigh holster. Expect
an hour's work in the fighters session, not a rebuild.

**Budget:** the tactical folder is now 4.2 MB (0.2 MB over 4 MB). Cheapest cut, if needed: drop `nor-1024.ktx2`
(0.37 MB; the low tier would then fall back to the 512 JPEG normal map), or ship `diff/nor` at 2048 only.
