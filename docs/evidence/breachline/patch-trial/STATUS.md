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
- [ ] 3. Armoured soldier, desert trooper, bolt-action rifle
- [ ] 4. Full assessment

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
