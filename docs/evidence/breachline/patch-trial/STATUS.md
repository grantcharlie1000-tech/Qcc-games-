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

## 2.3 Sci-fi rifle, made usable — done

Script: `scripts/breachline-assets/patch-trial/prep-rifle.ts` (`npx vite-node`, env `RIFLE` = the web-lod2 GLB,
`SCRATCH`). It uses the hero weapons' own unwrapper (`render/hero/unwrap.ts`) and `crease` (`render/hero/geom.ts`),
imported read-only. Proof: `job2-3-rifle-clean.jpg`: the original beside the cleaned rifle, detail crops of the
"X7A" receiver and the glowing handguard before and after, the magazine out, the sockets, a clay view, and both in the
first-person 2x crop.

Files in `public/game-art/breachline/patch/rifle-scifi/` (3.33 MB, budget 4 MB):
- `rifle.glb`: nodes `body` (14,426 triangles) and `magazine` (832, capped at the well; node translation = its seat,
  so dropping it is a move along -Y). POSITION, NORMAL, **TANGENT**, TEXCOORD_0. Our weapon frame: metres, **muzzle
  toward -Z**, +Y up, +X right, origin at the bounding-box centre, 0.88 m long. (Patch's 1.90 m is an estimate; at
  0.88 m the magazine well, grip and stock read at real-rifle size.)
- `sockets.json` (also in the GLB's `extras`): muzzle, bore, sight line (rear/front, 0.118 m above the bore: a
  tall box sight), grip palm and rake, support palm, trigger, magazine seat, ejection port, charging handle. Placed by
  measurement of the side profile and checked by eye on the sheet (red markers); the weapons session should fine-tune
  them with the hands in place.
- `diff-2048/1024.ktx2`, `nor-1024.ktx2`, `arm-1024.ktx2`, 512 JPEG fallbacks. The normal map is tangent space,
  +Y up (glTF), for use with the TANGENT attribute and normalScale (1, 1).

Method and numbers:
- Decimated with the vertices welded: 151,030 to 14,996 triangles (meshoptimizer error 0.0006 of the size). Then the
  magazine was cut off by a plane at the well (body 14,426 + magazine 832 with both openings capped), normals creased
  at 34°, and the mesh unwrapped into 95 islands at 1,684 texels/m.
- Bake by closest point on the 151k mesh. Colour and roughness/metal come through its UVs; its smooth vertex normals
  go into the new tangent space. 0.9% of texels lie more than 6 mm from the 151k surface (thin parts); there the low
  normal is kept. Its own normal map was not carried over: its fine panel lines are painted into its colour anyway.
- Paint-out, in the baked colour: blue glow (34k texels) became dark anodised panels (smoother and metallic in the
  packed map); orange accents (14k) became dark polymer; light marks on dark panels (8k: "X7A", "07", pseudo-labels)
  took the local panel colour. The detail crops show the text and glow gone. Faint dark-blue tints remain in the
  former windows, and a few light edge highlights went with the marks.
- **Budget decision:** the normal map at 2048 alone was 1.6 MB, so normals and the packed map ship at 1024 and colour
  at 2048. In the 2x first-person crop the 1024 normal map holds up; see the sheet.

What it still is: a chunky, sci-fi-styled rifle (deep receiver, box sight, skeleton stock) with no moving parts other
than the magazine. Its baked shading is still in the colour. My earlier verdict on the design stands; this makes it
usable, not modern.

**Credit and licence, exactly as the Patch record gives them:**

> asset_kHXqk4QynhrkbnpiD9C8A5zo ("Black sci-fi assault rifle", title by Patch) by Scenario (Scenario, https://huggingface.co/datasets/scenario-labs/3d-collection/blob/55b4c002b4c1529fc48da3dff98516c3069bfa3f/assets/scenario_asset_kHXqk4QynhrkbnpiD9C8A5zo/output.glb), licensed Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/). AI-generated with Meshy 7 image-to-3D. Changed by Patch: textures resized to 2048 px, pivot moved to the bottom centre, credit and license added to the file metadata, simplified LODs added.

Licence: CC-BY-4.0 (Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/).
Our changes, to append: "Changed for Breachline: rescaled to 0.88 m; decimated to 15k triangles; magazine separated;
re-unwrapped and re-baked; glowing panels, orange accents and markings painted out; textures re-encoded as KTX2."

## 2.4 Service Pistol, split — done

Script: `scripts/breachline-assets/patch-trial/prep-pistol.ts` (`npx vite-node`, env `PISTOL` = the Patch `web`
GLB). Proof: `job2-4-pistol-parts.jpg` (the original beside ours; the slide racked back 35 mm and the magazine
dropped by moving only the node translations; sockets; a clay view).

Files in `public/game-art/breachline/patch/pistol/` (1.94 MB, budget 2 MB):
- `pistol.glb`: nodes `frame` (4,946 triangles, includes the fixed barrel), `slide` (2,212), `magazine` (1,822),
  `hammer` (272) and `trigger` (126). Each node's translation is its pivot: slide at its own centre (travel +Z,
  rearward), magazine at its seat (drop along -Y), hammer and trigger at their pins (rotate about X). POSITION,
  NORMAL, **TANGENT** (computed), TEXCOORD_0. Our weapon frame (muzzle -Z, +Y up, +X right), origin at the centre
  of the assembled pistol; the file's measured scale is kept (0.222 m long).
- `sockets.json` (also in the GLB's `extras`): muzzle, bore (sight 18 mm above it), grip palm and rake, support palm
  (wrapped round the firing hand), trigger, magazine seat, ejection port, slide serrations, slide travel 35 mm, hammer
  and trigger axes. Taken from the part bounding boxes and the profile; fine-tune with the hands in place.
- `diff-1024.ktx2`, `nor-1024.ktx2`, `arm-512.ktx2` and 512 JPEG fallbacks. The packed map keeps glTF's roughness
  (G) and metalness (B), with R set to 1.

Decisions for the budget: the loaded magazine's 9,094 triangles (mostly the rounds inside the grip) were simplified
to 1,822, and the roughness/metal map ships at 512 (0.85 MB at 1024). Variant B (blue grips), the empty magazine and
the loose round are not included.

Design note: an artist's model of a classic mid-century service pistol (exposed barrel ahead of a short slide,
external hammer). It is generic, with no markings or text seen, and CC0.

**Credit and licence, exactly as the Patch record gives them:**

> "Service Pistol" by Mateusz Sadek (Poly Haven, https://polyhaven.com/a/service_pistol), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Changed by Patch: packed the 1K glTF into one GLB, pivot moved to the bottom centre, credit added to the file, simplified LODs added.

Licence: CC0-1.0 (CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/); no attribution required,
but credit it anyway as above.

## 2.5 Planner's follow-up on the soldier (2026-11-11, after reviewing 2.1–2.2)

Sheets: `job2-5-weight-fixes.jpg`, `job2-5-look-squad-b.jpg`, `job2-5-look-squad-a.jpg`, `job2-5-head-hands.jpg`,
`job2-5-distance.jpg`. Script: `soldier-finish.mjs`. `body-skinned.glb` was regenerated (same file name).

- **Budget:** the 4.5 MB limit was accepted; `nor-1024` is kept. The folder is 4.22 MB.
- **Weight fixes (both done; the second only partly helps).** Above the armpit, 70% of the chest/clavicle weight moves
  to the shoulder helper, fading in from x = 0.13 m and y = 1.18 m. The holster and both outer thigh pockets are
  rigid to their thigh, blending to the hip helper at the holster's top. While doing this I found and fixed a bug: UV-seam
  duplicates had the forearm-twist step applied more than once. Result: the aiming shoulders change little; the bunching
  comes as much from the shape of the hood and shoulder plate as from the weights. The hip gap in the crouch is smaller
  but **still open**: the tear sits where the fused crotch and pocket geometry folds, and weights cannot close it.
  Remaining fix: cut the holster off as a separate rigid piece, and add a small hidden fill patch inside the hip fold.
- **Length matching (new, needed for the hands).** The soldier's forearm (elbow to glove cuff, 0.19 m) is shorter
  than our skeleton's 0.255 m, so our hand floated 6 cm past the cuff. Each limb bone is now stretched along its own
  axis to our length: forearm ×1.37, upper arm ×0.88, thigh and shin ×1.04. The cuff now meets our glove. The cost:
  the soldier's forearm sleeve is visibly longer than its own design.
- **Recolour by luminance remap** (reference shader in `trial.ts`, `squadLook`). Per class (fatigues/kit), the
  source's luminance is centred on its median and spread over a fifth of its 2–98% range with a tanh curve, then
  mapped between a dark and a light target colour. Folds, seams and wear survive as steps instead of collapsing to
  one fill. On top: a 2.5 mm object-space weave plus fine noise, a two-octave large stain layer, a steeper curve for
  kit (straps and buckles stay darker) and darkened soles. The measured ranges are in `tactical.json` / the GLB's
  `extras.lumRange`. Squad A as it ships: fatigues `#090b0d`→`#323a42` (very dark slate), kit
  `#050506`→`#232528` (near-black). Squad B: coyote `#21190f`→`#8a6e4b`, olive `#12140c`→`#5e6345`.
  Honest limit: the source texture carries little detail in its near-black values, so even remapped, squad B reads
  cleaner and flatter than a painted texture. A proper fix is a hand-tuned detail pass on the atlas, which its
  shredded layout makes impractical.
- **Head and hands on** (`attachOurs` in `trial.ts`). Triangles of our textured figure whose dominant bone is the
  head or a hand are bound to the soldier's skeleton; with the same bind pose they seat without any offset. What fits:
  helmet, balaclava (A) or face wrap (B) and goggles sit on the hood with no neck gap or step; gloves meet the cuffs
  after the length matching. What does not: our head is slightly small for this broader body; the squad B face wrap
  leaves skin around the eyes, which looks odd above a fully covered soldier; our gloves are simpler and blobbier than
  the body around them; the hood shows behind the helmet at the nape.
- **Game distance** (exact pixels, 1280×720, 70° FOV, eye 1.6 m). At 2 m (463 px tall) the soldier is clearly more
  detailed and better proportioned than ours. At 8 m (116 px) both squads separate at a glance and the soldier still
  reads better: real pouches, knee pads and boots against our smooth suit. At 20 m (46 px) the two figures are
  similar; the squad colours are what tell them apart, and both pass.

---

# Job 3 (planner, 2026-11-11 11:51 UTC): the asset's own head and hands, headgear from Patch, then in the game

## 3.1 The asset's own head and hands — done

Proof: `job3-1-2-head-hands-headgear.jpg`. `prep-soldier.mjs` now runs with `FULL=1` (no cuts) and repaints at
2048 from the 4096 sources. `skin-soldier.ts` runs with `FULL=1`. The cut version from 2.1–2.5 is replaced in the
same folder and under the same file names.

- **Head:** every texel of the head and neck becomes a dark knitted balaclava (vertical ribs 3.5 mm apart, stitch rows
  4.5 mm, a matching ripple in the normal map, roughness 0.96), except a band across the eyes (y 1.578–1.625 m,
  front only), which keeps the asset's own eyes and brows. The head shape and neck stay. The hair's quiff was flattened
  a little (the top 5 cm by up to 35%) so it does not show as a bump under the knit. The mask's new G channel marks
  "keep" (balaclava, eye band, gloves), so the squad recolour leaves them alone.
- **Hands:** the bare skin of the fingertips (32k texels, orange-pink by colour test inside the hand region) is painted
  as black synthetic glove; the glove texels stay. They remain the asset's fused hands, bound to the hand bones,
  with the hand bone at the real wrist (0.915 m) and the hand's own direction measured (wrist to fingertips). They do
  not curl round the grip: the animator places the hand, but these fingers cannot close. At 2 m they read as gloved
  hands on the rifle (sheet, last column).
- **Bone lengths, what I chose.** The animator's two-bone arm IK uses the skeleton's fixed lengths
  (`UPPER_LEN`, `FORE_LEN` in `skeleton.ts`), so our skeleton cannot take the asset's lengths without editing that
  folder. I keep our lengths and stretch the asset to them, but far less than before, because the forearm now runs
  to the real wrist: forearm ×1.13 (was ×1.37), upper arm ×0.88, legs ×1.04. The hands keep their own size.
- **Fill patches** (item 4 of the job, built here): a closed ellipsoid of black cloth inside each hip fold (0.075 ×
  0.07 × 0.08 m, half pelvis, half thigh with the hip helper; 2 × 252 triangles) so a crouch never shows the backdrop
  through the fused crotch geometry. The holster and thigh pockets were already rigid to the thigh (2.5); with the
  hands kept, the rigid regions now stop short of the hands (they had caught them).
- Budget: the tactical folder is 4.5 MB (the repainted normal map compresses less well).

## 3.2 Headgear from Patch — done

Searched with single words (`helmet` 56 hits, `mask` 168, `goggles` 2, `headset` 1, `cap` 99 (only end caps and a
cartoon hat), `balaclava` and `beanie` 0). Candidates' thumbnails: `job3-2-headgear-candidates.jpg`. Tried on the
head: steel helmet, goggles, headset, dark armoured helmet.

| Candidate | Verdict |
| --- | --- |
| `polyfork:steel-helmet-f5aa7d` (684 triangles, CC-BY, by an artist) | **Adopted, squad A.** Generic steel helmet with netting; low-poly and flat-coloured, recoloured dark slate. |
| `simready:ppe_eyeProtection_goggles_a01` (226k triangles, CC-BY, NVIDIA SimReady) | **Adopted, squad A**, over the eyes; decimated to 2,499 triangles; plain dark plastic and smoked lens. |
| `polyfork:call-headset-a95887` (516 triangles, CC-BY) | **Adopted, squad B**, over the bare balaclava; recoloured near-black. |
| `polyfork:flight-helmet-56f390` | Rejected: a cartoon space-style helmet. |
| `scenario:asset_21XK6moCyyMRnBDPnHW8KBmJ` dark armoured helmet | Rejected: sci-fi armour. |
| `scenario:asset_2Ro5Mui16ixub1zqw2BiqKaR` rusted steel helmet | Rejected: a 16th-century morion. |
| `scenario:asset_LTuvr9RKsbZJHn9YmZ5M1JtE`, `..._kSuefGeNxHWWfTVVGx3Dxn1U` goggle/riveted helmets | Rejected: fantasy full-face masks. |
| `polyhaven:old_gas_mask` | Rejected: a vintage civil-defence mask with a waist-length hose. |

Silhouettes: **A = helmet and goggles, B = bare balaclava and headset.** Prepared by `prep-headgear.ts` into
`public/game-art/breachline/patch/headgear/headgear.glb` (150 KB; helmet 684, goggles 2,499 and headset 516
triangles). Every mesh is already in head-bone space; colour, roughness, metalness and opacity are in node
`extras`, and the sets are listed in the asset `extras`. What does not fit: the helmet is low-poly and flat-shaded
next to the body (fine at 8 m and beyond, plain at 2 m), and the headset is stylised.

**Credits and licences, exactly as the Patch records give them:**

> Steel Helmet by Polyfork (https://polyfork.dev/asset/steel-helmet-f5aa7d), CC BY 4.0. Licence: https://creativecommons.org/licenses/by/4.0/. Changed by Patch: a compressed preview copy added for the viewer (web and src are as published).

Licence: CC-BY-4.0 (Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/). AI-generated: no.

> Call Headset by Polyfork (https://polyfork.dev/asset/call-headset-a95887), CC BY 4.0. Licence: https://creativecommons.org/licenses/by/4.0/. Changed by Patch: a compressed preview copy added for the viewer (web and src are as published).

Licence: CC-BY-4.0 (Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/). AI-generated: no.

> "Protective eyewear" by NVIDIA (SimReady, https://huggingface.co/datasets/nvidia/simready-assets/tree/524747d9b5e1f21b5b18b56041788c01d745f1a1/ppe_eyeProtection_goggles_a01), licensed Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/). Changed by Patch: converted from USD to glTF, MDL materials dropped for the UsdPreviewSurface textures, textures resized to 2048 px, ambient occlusion mapped from the ORM texture, mass and one convex hull per part added as OMI_physics_body and OMI_physics_shape, pivot moved to the bottom centre, credit and license added to the file metadata.

Licence: CC-BY-4.0 (Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/). AI-generated: no.

## 3.3–3.5 Stump, holster, distance — done

Proof: `job3-3-5-hips-distance.jpg` (script `job3-distance.mjs`).
- **3.3 Stump:** it was the capped wrist of the hanging left arm. With the asset's hands restored there are **no capped
  cuts left anywhere on the figure** (the neck and both wrist cuts are gone). The idle left hip at 2 m is clean in
  both squads.
- **3.4 Holster:** a separate mesh would only re-create the cut-and-cap problem, so I kept it as part of the body and
  bound it rigidly: holster and both outer thigh pockets on the thigh bone, blending to the hip helper at the
  holster's top. With the fill patches (3.1) in the hip folds, the crouch and crouch-walk hips now show cloth with no
  gap. A further detail: the eye band now stops short of the nose bridge (the nose tip had kept its skin colour).
- **3.5 Distance:** at 2 m the Patch figure, with its helmet and goggles (A) or headset (B), is clearly more real than
  our rifleman. At 8 m the two squads separate by silhouette as well as colour (helmet against bare head). At 20 m
  (46 px) both read as soldiers and colour does the work; the dark squad A is quite dark against a grey backdrop.

## 3.6 In the game behind a switch — ready (`src/games/breachline/render/patchfighters/index.ts`)

`createPatchFighters(scene, lighting)` returns the same `FightersWithEvents` as `createFighters`. It does not copy
the stock fighters: it imports their skeleton (`makeBones`, `SCALE`), `Animator`, world weapons (`weaponFor`),
`fighterMaterial` (for the weapon), and `LOD_DIST` / `LOD0_MAX`. Nothing in `render/fighters/` or `scene.ts` was
edited.
- **Assets** through `ArtLoader`: `patch/tactical/body-skinned.glb` (levels 8,000 / 3,200 / 1,200 triangles,
  matching the stock 7.9k / 3.7k / 1.4k), the shared texture set (diff 2048, nor/arm/mask 1024: one set for both
  squads, recoloured in the shader), and `patch/headgear/headgear.glb` (three levels; squad 0: helmet and goggles,
  1,845 triangles near; squad 1: headset, 516). The tactical folder is now 3.1 MB (`nor-2048` dropped); with the
  headgear, 3.4 MB in all, against the stock fighters' 4.4 MB for two squads.
- **Lighting** as the stock baked material: the reflection probe for specular only, the light probe as diffuse
  irradiance (`uProbe`), the same gains. One deliberate difference: the body takes the full probe, not the stock
  baked sets' 0.42. Tried at 0.42 in the game, the figures read as silhouettes outdoors.
- **`warm()`** loads everything, compiles every program (both squads' bodies, opaque and transparent headgear, the
  weapon, with and without a reflection probe) and uploads the shared textures. Fighters and their meshes are made
  when a player first appears, as the stock module does, from geometry and textures that are already uploaded.
  If any asset fails to load, it hands over to `createFighters`, so the switch can never leave a match without
  fighters.
- **Checked in the game** (`game-test.mjs`): it serves `scene.ts` with the switch below injected as the page loads
  it, so the file on disk stays untouched; seed 7, bots, high tier. `job3-6-in-game.jpg` shows the same spots with
  stock and Patch fighters, both squads, at 2 and 8 m. No errors in the console. The renderer's triangle count is
  about 10–15k higher with Patch fighters in view (headgear, hip fill and hands, also drawn into the shadow map);
  draw calls +7 to +13. `npx tsc --noEmit` passes.
- Harness note: the app sometimes navigates from `#/game/breachline` to `#/collection/28` partway through a long
  scripted run (stock and Patch alike), so the driver shoots only angles with a clear sightline, chosen from a
  four-way sweep.

**The change for `scene.ts`** (the environment session's file), two lines:

```ts
import { createPatchFighters } from './render/patchfighters/index';
// line 192, replacing `const fighters = createFighters(scene, heroLighting);`
const fighters = new URLSearchParams(location.search).get('fighters') === 'patch' ? createPatchFighters(scene, heroLighting) : createFighters(scene, heroLighting);
```
Without `?fighters=patch`, behaviour is unchanged.

## 3.7 First-person hands: Polyfork "Base Hand" — quick look; verdict: does not beat ours

Proof: `job3-7-fp-hands.jpg` (script `hand-look.mjs`; our glove comes from the hero studio page, which was not
changed). The base hand is a WebXR-style rig: 25 joints flat under one node, named like the WebXR hand joints,
skinned in six meshes, 3,000 triangles, plain colour, no texture. I posed it by setting each joint's transform: the
fingers curl about their side axes, and the hand is seated on the grip and handguard by palm centre, palm normal
and finger direction.

- **Shape:** a stylised mannequin hand from a "clockwork hand adornments" kit. The palm is a flat, hard-edged slab
  with sculpted tendons; the fingers are long, thin and uniform, with no pads; there is no thumb muscle or heel. Curled,
  it reads as a robot claw. At 2x in first person the faceting and the gaps between thin fingers would show.
- **Ours** (render/hero) is anatomically proportioned: palm width and thickness, finger taper, knuckle arc, thumb
  pad, cuff. Its problems are surface and texture (blotchy glove print, soft detail), not proportion.
- **Verdict: no.** It does not beat our glove as a base for a baked glove. The useful part is its rig: WebXR joint
  naming and absolute-pose posing, a clean way to drive per-finger grips if our rig ever needs that. The
  first-person frame shows the support hand only: the grip hand sits below the frame at this placement. Its
  close-ups are in the first row.

Credit (as the Patch record gives it; not adopted):

> Base Hand by Polyfork (https://polyfork.dev/asset/base-hand-e3398a), CC BY 4.0. Licence: https://creativecommons.org/licenses/by/4.0/. Changed by Patch: a compressed preview copy added for the viewer (web and src are as published).

# Job 4 (planner, 12:25 UTC): the look in the game

Evidence: `job4-sq0-yard.jpg`, `job4-sq0-lab.jpg`, `job4-sq1-yard.jpg`, `job4-sq1-lab.jpg`. Each holds the game
frame at full 1280×720 (stock left, Patch right) at 2 m and 8 m, plus a 2× crop of the centre. Seed 7, high tier.
`game-test.mjs` swaps a squad-0 and a squad-1 player between the south-yard and Lab spots, through a test-only
`teleport` it injects into `index.ts` as the page loads it (the file on disk is untouched), so each squad is seen in
both places. The two Lab sheets are about 470 KB, over the usual 400 KB, because they are at full size as asked.

What changed (all in `render/patchfighters/index.ts`, plus the bake in `prep-soldier.mjs`):
1. **Internal shading.** AO (24 rays to 25 cm) and cavity (rays to 3 cm) baked from the full-resolution source mesh
   into the atlas (mean AO 0.79, mean cavity 0.86; 71 s). AO is in the packed map's R, used as three's `aoMap`, so it
   darkens the probe term and the specular. Cavity is in the mask's B, multiplied into the albedo (×0.85 strength).
   The probe is now directional: `uProbe × (0.6 + 0.5·n.y)`, with the normal-mapped normal in world space, plus a rim
   of 0.35 × probe at grazing angles. It applies to the body and the headgear.
2. **Squad 0:** cloth middle albedo `#4a5058` (linear about 0.08) swinging ±55% with the source detail, kit
   `#34373b` (about 0.035) with roughness ×0.72 (glossier), light dust at knees, elbows, cuffs and boots.
3. **Squad 1:** coyote middle `#857360` (about 0.19, swinging ±30%; a first pass at 0.26 ±50% read cream), olive kit
   `#585b45` (about 0.1), desaturated, darker mud in the same places. The source detail is carried twice as strongly
   (tanh spread a tenth of the class range, was a fifth), and the AO, cavity and normal map now add the folds.
4. **Probe level: 0.42**, the stock baked sets' own value, chosen from game frames at 0.75 and 0.42. At 0.75, with the
   new albedo and the directional term, both squads were lighter than the walls (squad 0 read whitish grey). At 0.42
   they sit at the brightness of the props around them, indoors and out. `?patchgain=` overrides it for tuning.

**Honest read of the pairs (would the owner pick the right-hand one?):**
- **Squad 0, Lab: yes.** Dark slate cloth and a black vest clearly separate, the folds and pouches read, and the
  helmet and goggles give a distinct head. The stock figure is a smooth grey suit.
- **Squad 1, Lab: yes, narrowly.** Coyote with an olive vest, pouches and folds visible; the stock figure is similar
  in colour but smoother. The Patch figure is a touch flat on the sleeves.
- **Squad 0, yard (in shade): no, not yet.** It reads as dark clothing, no longer a hole in the picture, but the
  stock figure's lighter camouflage is easier to read in deep shade. At 8 m the two are about even.
- **Squad 1, yard: about even.** The sleeves are still the lightest part of the figure in shade. The shape is better,
  the colour no better.
- Remaining levers, if the owner wants the yard to win too: lift squad 0's cloth to about 0.10 outdoors only (via
  the probe's brightness, not the albedo), and darken the sleeve region of squad 1 (its source texels are the
  glossiest, so they remap lightest).

# Job 5 (planner, 12:48 UTC)

## 5.1 Yard levers — done (`job5-1-yard.jpg`: yard, 2 m and 8 m, stock left and Patch right in each pair)
- **Squad 0** takes 1.45 × the body's probe share (a per-squad `gain` in `PATCH_LOOKS`), not a lighter albedo.
  The probe varies little between yard shade and the Lab (the stock fill floor dominates it), so the lift applies
  everywhere; in the Lab it stays dark slate. In yard shade it now reads as well as the stock figure: grey cloth,
  a black vest, the helmet's outline.
- **Squad 1 sleeves:** the cloth on the arms (bind-pose |x| > 0.2 m and above 0.95 m) is scaled to 0.72, so the sleeves
  no longer outshine the rest of the figure in shade.
The soldiers are done from my side.

## 5.2–5.5 Weapons in hand and in the soldiers' hands — ready, with an honest verdict

Evidence: `job5-weapons.jpg`: corridor and Lab, stock and Patch, hip, aimed and four reload frames, a 2× crop of the hip
view, and the sidearm. Script: `game-test-weapons.mjs`, which injects both switches into `scene.ts` as the page loads
it (file untouched) and retries when the scripted match fails to leave the lobby.

**5.2 `src/games/breachline/render/patchhero/index.ts`:** `createPatchViewmodel(renderer, lighting)` returns `Viewmodel`.
- **Missing export.** `render/hero/viewmodel.ts` builds its rig inside a closure and has no way to substitute a
  weapon model. So the module reproduces that file's frame composition verbatim (springs, sway, bob, recoil, aim,
  reload beats, casings, flash, lighting; `KICK` and `VM_GAIN` copied because they are not exported), with the hooks
  marked `PATCH`. Everything it calls is imported from `render/hero/`: `createFpRig`, holds, arms and hands,
  `reloadFrame`, `texturedMaterial`, `Spring`, `WB`/`CASES`. Requested: an option such as
  `createHeroViewmodel(renderer, lighting, { models })` or `FpRig.setModel(id, object, sockets)`, after which this
  module reduces to its model loading.
- **How the models ride the rig.** After `setWeapon`, the stock mesh, its lens and casings are hidden. The Patch body is
  parented to the gun, the magazine to the rig's magazine bone (it follows the reload beats about the Patch seat), the
  pistol's slide to the bolt bone (35 mm travel), and brass casings to the case bones at the Patch ejection port. The rig
  gets the Patch sockets (`r.weapon = { ...stock, sockets }`), so the flash comes from the Patch muzzle. Each model is
  placed so its grip palm sits on the stock grip socket, because the hands' targets come from the stock holds.
- **Sight line.** Aiming lowers the gun by the Patch sight height above the stock one (the rifle's sight stands 7 cm
  higher above its grip). The generated rifle's box sight is solid, with no window to look through, so the rifle aims
  just over its top. At the hip the rifle is lowered 5 cm, because its receiver stands much taller above the grip.
  The pistol's sight line falls within 7 mm of the stock one.
- Only `ar` and `pistol` are swapped; every other weapon is the stock one. The assets load with the rest, and `warm()`
  draws them.

**5.3 World weapon (`patchfighters`):** a fighter carrying the AR shows the Patch rifle at world level of detail
(`patch/rifle-scifi/rifle-world.glb`, 2,193 + 249 triangles against the stock 2.5k). The stock skinned mesh keeps its
bones (the animator drives them) but draws an empty geometry; the Patch body rides bone 0 and its magazine bone 1,
grip palm on the world grip socket. One material is shared by all fighters' rifles, so its probe tint is the last
fighter's in each frame (a small inaccuracy). I have not inspected it closely in the game: in these frames the
soldiers' rifles are a few pixels.

**Honest read (would the owner pick the right-hand frame?):**
- **Rifle at the hip: no.** The Patch rifle is a dark, chunky block that fills the lower right, with no clear
  silhouette, against a slim, readable stock AR-5 with its red dot. The detail is real, but at this size and angle it
  reads as clutter.
- **Rifle aimed: no.** The stock sight gives a clean red-dot window. The Patch rifle has no window, so the aim
  looks over a dark stack of rail and sight.
- **Reload: works**, but no better than stock. The Patch magazine leaves with the support hand and comes back on the
  beats.
- **Pistol at the hip: yes, narrowly.** The Service Pistol reads as a real pistol (wood grips, exposed barrel) where the
  stock one is a dark block; it sits in the stock hands correctly.
- So: keep the Service Pistol. The generated rifle is not a better first-person weapon than the AR-5 as it is. It would
  need a real sight (a cut-out window or a separate optic), a slimmer handguard and a lighter finish to win; the AR-5
  second build (plan) is the better path for the rifle.

**5.5 The change for `scene.ts`**, two lines (default unchanged):
```ts
import { createPatchViewmodel } from './render/patchhero/index';
// line 195, replacing `const viewmodel = createViewmodel(renderer, heroLighting);`
const viewmodel = new URLSearchParams(location.search).get('weapons') === 'patch' ? createPatchViewmodel(renderer, heroLighting) : createViewmodel(renderer, heroLighting);
```

## Job 6: last attempt on the Patch rifle — verdict: still no

Evidence: `job6-rifle.jpg` (130 KB; corridor, hip and aimed, stock left and Patch right, with a 2× crop of the hip view).
Done: the generated box sight was removed down to the rail and capped (`cut-rifle-sight.ts`, 729 triangles); the AR-5's own
red-dot optic and lens sit on the rail, so the aim looks through a real window. The finish is dark grey with darker
furniture, cavity darkening and edge wear, roughness 0.45. The rifle is 15% narrower, and at the hip sits 8 cm lower
and 4 cm further forward.

Result: **aimed, about even** (it is our optic, now with a clear window). **At the hip, still no**: under the
viewmodel's hot lighting (`VM_GAIN` 2.2) the new finish reads pale grey with blown-out white specks along the edges,
so the rifle looks washed out next to the stock AR-5's warm, readable furniture. The rifle goes back to our own second
build. The Service Pistol stays the recommendation for the sidearm.

## Owner request: "the way the hand grips the gun looks terrible" — first-person AR-5 support hand

`grip-before-after.jpg`: corridor at the hip, in the game, before (left) and after (right). The left hand used to sit
under the handguard with its fingers pointing forward along it, so from the eye it read as a claw. In
`render/hero/rig.ts` (the AR-5's hold only: two lines, the weapons session's file, edited at the owner's direct
request), the palm now cups up against the underside of the handguard, the fingers run across it and wrap the far
side (stronger curl), and the thumb lies straight along the near side. A tighter elbow was tried and reverted: it
twisted the wrist. Other weapons' holds are unchanged.

## 12.2 Wounds, hurt look, flinch and bodies (Patch fighters) — done

Evidence: `job12-wounds.jpg` (227 KB). Both squads, left = squad A, right = squad B. Columns: chest hit, + leg hit, + head hit, half health, near death. The bottom strip shows both fighters after death, with their wounds. `bodies()` reported both at their rest positions (ids 1 and 3).

Method (`src/games/breachline/render/patchfighters/index.ts`):
- **Wounds.** Each `hit` takes the shooter's last `shot` event and rebuilds the ray from its x, y, z, yaw and pitch. The ray finds the nearest bone segment: the head only on head hits, otherwise the body and limbs. The hit point moves back along the ray to the surface and is converted into bind-pose space. Each fighter keeps up to `MAX_WOUNDS = 8` in a `uWound` Vector4 array in the body material. Strength grows as hp falls. The shader draws an entry mark plus a soak that runs downward. Everything is driven by the shared events, so the result is deterministic.
- **Hurt.** `uHurt = (100 - hp) / 100`, and 0.85 once dead. It adds blood and grime over the torso front and legs.
- **`?blood=off`.** Wounds become dark scuffs and dirt, with no red.
- **Flinch.** For 0.45 s after a hit, the spine bends away from the shot direction. The hit limb (arm, leg or head) also jerks, as an additive rotation after `anim.update`.
- **Bodies.** A dead fighter stays visible in the stock death pose until `reset` at round end, and keeps its wounds. `bodies()` returns `{id, x, z, yaw, t}`, where `t` is the time of death. `pose(id)` returns the body's rest position (anim root x, z) once dead, so the environment session's blood pool sits under the body.
- **warm().** Nothing new is compiled. The changes are uniforms in the existing body program, so `warm()` already covers them.

Not done:
- **First-person blood specks.** The first-person hands live in `render/hero` (the weapons session's layer), so they can't be reached without editing it. Skipped. A screen-edge flash would belong to that layer too.
- **Bodies don't settle onto furniture.** They lie at floor height where they fell.
- **The dropped weapon** follows the stock animator's behaviour.

How the evidence was made: `scripts/breachline-assets/patch-trial/wounds-test.mjs` and `wounds-sheet.mjs`. Hits are synthetic `shot` and `hit` events fed through `fighters.handle`, and the kills are a test-only injection into the served `index.ts`. No files in `src/` outside my folders were changed. `tests/games/breachline/warm.spec.ts` was not run in this pass, because usage is tight.

### 12.2 corrections (planner review)

- **Bodies.** The first sheet showed two dead fighters standing. That was the evidence script's fault, not the game's: it drew a single frame after a kill, and the death pose only advances with drawn frames. Since 12.6, bodies fall as ragdolls. `job12-wounds.jpg` is rebuilt: B dies to real gunfire (3 rounds through the sim), A to the test kill, and both lie where they fell.
- **Wound look.** Each wound now has a dark entry core about 1.5 cm across with a darker ring, and a stain that is densest at the hole and thins outward instead of an even wash. Head wounds are half the size and lighter, so a single round no longer reddens the whole face. Honest limit: at 3 m in a 720p frame the entry core is only a few pixels.
- **Camera.** The evidence script now turns the fighters to face the camera before each hit and each picture.

## 12.6 Ragdoll on death — done

Evidence: `job12-ragdoll.jpg` (139 KB). Four real kills by this player through the test hook, each confirmed by the sim's own kill event:
- rifle to the chest (`Marrow AR-5`)
- DMR head shot (`Corvin DMR`, head)
- shotgun at 1.8 m (`Halden 12`)
- frag grenade at the feet (`Frag grenade`)

Each strip shows the kill, then 0.15 s, 0.4 s, 0.9 s and 3.4 s, by which time the body is at rest. The script holds the game's own frame loop during each capture, so only fixed 0.016 s draws advance the ragdoll.

How the ragdoll works:
- **Model.** `render/patchfighters/ragdoll.ts`, with no physics library, written in plain arithmetic rather than three.js.
- **Points and sticks.** 16 points (pelvis, chest, neck, head centre, shoulders, elbows, hands, hips, knees, feet), joined by 25 sticks. The sticks include braces that keep the chest and the pelvis rigid.
- **Joint limits.** Minimum distances, taken from the bone lengths, stand in for joint limits. A hinge rule keeps the knees bending forward only.
- **Physics.** Verlet integration at a fixed 1/120 s step with 6 constraint passes, gravity and damping.
- **Collision.** Points collide with the floor, the map's solid boxes, intact or reinforced panel cells, and the map bounds. The map data is only read. Only the map within 3 m is checked, gathered again whenever the body has moved 1.5 m.
- **Friction and sleep.** Friction removes the velocity into a surface and 22% of the velocity along it, each step. The ragdoll sleeps once nothing has moved 0.6 mm per step for 0.3 s (after at least 0.5 s), or at 3 s. It then stays as the body until the round reset or a respawn.

Start state and impulse:
- **Start.** The live bone positions as last drawn, plus the fighter's own speed.
- **Gun kills.** The killing shooter's last `shot` ray hits the body point nearest it, or the head on a head shot. That point and its neighbours get a kick along the ray: 2 to 3.6 m/s by weapon, and 5.5 m/s with a wider spread and a little lift for the shotgun.
- **Blasts.** Kills whose weapon name is a grenade or the breach charge use the last `boom`. The kick points outward along the floor, strongest at the parts nearest the blast, so the legs are swept and the body turns over.
- **Melee, or a gun kill whose shot this client missed.** A kick away from the killer.
- **Every death.** The knees buckle forward, and a little seeded scatter goes into the arms. The seed comes from the victim, their death count and the killer. The weapon drops as its own 3-point body and lands beside them.

Driving the skeleton:
- **Torso.** The pelvis and chest bones take their rotation from the hip and shoulder lines (current frame times the inverse of the bind frame). spine1 sits halfway between them.
- **Limbs and neck.** Aimed along their sticks with a swing from the parent bone, so they don't twist.
- **Helper bones.** Elbow, knee, deltoid and hip helpers take half the rotation, as the animator does.
- **What follows.** The skinned mesh, its wounds and the headgear all follow. The weapon takes the turn of its three points since death.

Same on every client: the ragdoll starts only from shared events and is stepped at a fixed rate, so frame rate doesn't change the result. Clients can still differ slightly, because each starts from its own interpolated live pose.

Reporting:
- `pose(id)` and `bodies()` report the pelvis position of the ragdoll.
- `bodies()` items gain `still` (true once the ragdoll sleeps). **Note for the environment session:** the blood pool is placed at death and does not move afterwards. In the blast strip the body lands about 2.4 m from the pool. Placing the pool when `still` turns true (or moving it then) would put it under the body.

Budget:
- Nothing is compiled or uploaded at death.
- `warm.spec.ts` passes (2/2) with the ragdoll in place.
- In the unit test, about 0.08 ms per step per ragdoll (under vitest). Ten bodies at once cost about 2 ms per frame for at most 3 s, then nothing.

Test: `tests/games/breachline/ragdoll.test.ts`.
- **Every spawn and roam point.** Deaths there (chest shot from the front, head shot from the side, a strong blast from behind) end asleep within the time limit, with the head below 1.1 m, nothing above 1.25 m, and no point inside a solid box or outside the bounds.
- **Wall.** A body thrown at a wall stops on its own side.
- **Repeatability.** The same start gives the same rest position.

Tests run on this head:
- `npx vitest run tests/games/breachline`: 12 files, 111 tests passed.
- Playwright `warm.spec.ts`: 2 passed. `play.spec.ts`: 6 passed.
- `audio.spec.ts`: 1 passed when run alone. It timed out at 120 s when run alongside a capture, because of CPU contention; it renders sound offline and doesn't touch the fighters.

Not done:
- Bodies don't block each other.
- A body resting on a panel stays put if the panel is later destroyed under it, because collision is only checked while the ragdoll is awake.
- The stock fighters (`?fighters=stock`) keep their canned death.
