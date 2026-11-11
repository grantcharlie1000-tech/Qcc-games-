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
- [ ] 2. Rifle sheet
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
