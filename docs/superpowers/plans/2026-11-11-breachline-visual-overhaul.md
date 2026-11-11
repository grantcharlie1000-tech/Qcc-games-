# Breachline visual overhaul: assessment and plan

Date: 2026-11-11. Owner asked for visuals that "match if not exceed Call of Duty: Modern Warfare 2 (the original)",
including high-quality models and textures. The current build was judged, fairly, as nowhere near that.

This document is the assessment, the plan, and the contract for the session that carries it out. It was reviewed
twice before hand-off; the review log is at the end.

## Correction, 2026-11-11 (after the owner's challenge): build the assets in code

The first version of this plan said weapons and characters were "blocked on a source" because "an agent cannot
sculpt an MW2-grade rifle by writing coordinates". **That was wrong**, and the owner proved it with a reference: a
public artifact made by the same model family (https://claude.ai/artifact/BGY1SztrAYcJQHSsnHHGmp, a breach shooter
called "Saltline"). Reading its source shows everything in it is authored in code, with no asset files:

- **Hands:** parametric five-finger hands (thumb, index, middle, ring, little; per-phalanx lengths and radii) on a
  20-bone skinned rig with two-segment arms and IK.
- **Weapons:** bevelled, lathe-turned and extruded parts, not boxes.
- **Reloads:** hand-written timelines with named beats (magazine out, clear, swap, rise, align, insert, rebound,
  regrip, tug, bolt back, release), with separate tactical and empty reloads.
- **Textures:** generated procedurally, largely in shaders with layered fbm noise for wear, grime and edge
  highlights, feeding full PBR (standard and physical materials, clear coat, normal and roughness maps).
- **Rendering:** shadow maps (1024 to 4096 by tier), ambient occlusion, planar reflections, bloom with lens dirt
  and an anamorphic streak, motion blur, MSAA, rain, quality tiers chosen from the GPU string.
- **Sound:** Web Audio with separate buses (world, near, gun, music), two convolution reverbs and ducking.

What the earlier build lacked was not capability but craft and effort: it used axis-aligned boxes and unlit
materials (about a quarter of a megabyte of code against that artifact's megabyte and a half).

**Consequences for this plan:**

- Rows E (weapon and hands) and F (characters) are **not blocked**. They are built here, in code, to the standard
  that reference shows is reachable. Asset packs remain optional, not required.
- Code-authored geometry and shader-generated PBR textures become the **primary** route for hero assets (weapons,
  hands, fighters, destruction, effects) and a legitimate route for the environment. Poly Haven and ambientCG
  remain useful for photographic surface materials and set dressing.
- That artifact is the **reference bar** for craft. Study its source statically for technique (do not run it, do
  not copy its code, names, setting or look: Breachline stays its own game).
- One thing that reference does **not** prove is the Chromebook requirement: its lowest tier still uses a 2048
  shadow map, bloom and volumetrics. Breachline must hold 30 fps on a Chromebook, so the same craft has to be
  delivered inside the budgets in section 5, optimising first.

## 1. What "MW2 quality" means here

The target is the 2009 game's **technical and craft bar**, not its content. No MW2 maps, characters, weapons models,
textures, sounds or names are to be copied or imitated closely; Breachline keeps its own setting.

The bar, as things a reviewer can check in a screenshot:

| # | Quality | MW2-era bar | Breachline today (score /10, 8 = MW2) |
| --- | --- | --- | --- |
| A | World lighting | Baked lightmaps with soft shadows and bounced light; a light grid for moving things | Per-vertex bake, hard falloff, no bounce — **3** |
| B | Surface shading | Per-pixel normal and specular maps everywhere, reflections from probes | Unlit albedo only — **1** |
| C | Texture detail | Photo-sourced, roughly 256–512 px per metre on walls and floors, 1K–2K on weapons and characters | Canvas-drawn 256–512 px tiles — **2** |
| D | World geometry | Modelled props, trims, fixtures, clutter in every room | Boxes — **1** |
| E | First-person weapon | About 8–15k triangles, normal-mapped, animated reloads, hands with fingers | About 30 boxes, slab arms — **1** |
| F | Characters | About 6–10k triangles, skinned, motion-captured locomotion and deaths | 6 rigid box groups — **1** |
| G | Dynamic shadow | Sun shadow map on characters and the weapon | Blob under each fighter — **1** |
| H | Post-processing | HDR bloom, filmic grade, depth of field when aiming | Tone mapping only — **2** |
| I | Effects | Flipbook muzzle flashes, smoke, dust, sparks; normal-mapped decals | Soft points, flat decals — **2** |
| J | Destruction look | (MW2 had little) — ours must read as layered wall: board, studs, torn edges | Square holes in a flat sheet — **3** |

## 2. Honest assessment

**The bottleneck is assets, not rendering code.** WebGL 2 can do everything in rows A, B, G, H and I. What separates
the current build from MW2 is that MW2's look came from hundreds of hand-made, photo-textured models, and this build
has none.

What was verified from this build environment (2026-11-11):

- **Reachable, CC0 (no attribution required, redistribution allowed):** Poly Haven (869 PBR texture sets; 521
  models, of which 97 industrial, 85 furniture, plus lighting, electronics, containers; glTF with diffuse, normal and
  AO/roughness/metal maps at 1K–8K; HDRI skies) and ambientCG (PBR materials). npm and GitHub are reachable.
- **Not reachable or not usable without the owner:** Sketchfab downloads (need the owner's API token; licences vary
  per model), Mixamo (needs an Adobe login; redistribution in a public repository is doubtful), Kenney and
  poly.pizza (blocked by the network policy).
- **Tools present:** three r180 with GLTFLoader, KTX2Loader, the Basis transcoder, Draco and meshopt decoders;
  meshoptimizer; sharp; ffmpeg; ImageMagick. **Absent:** Blender, toktx, basisu, gltf-transform (the last three may
  be installable from npm; Blender is not assumed).
- **No GPU.** Rendering here is a software rasteriser. Pictures can be checked; frame rate cannot.

What follows from that:

| Area | Can this plan reach the bar? | Why |
| --- | --- | --- |
| A, B, C, D environment | **Yes, largely** | Poly Haven covers bricks, concrete, plaster, tiles, floors, metal, and most of the props an annex needs (desks, chairs, cabinets, tool chests, crates, barrels, barriers, chain-link fence, ducts, pipes, air-con units, generator, lamps, cameras, extinguisher, roller shutters). Lightmaps and probes are code. |
| G, H, I | **Yes** | Code plus a few flipbook textures that can be generated offline. |
| J | **Yes** | Code and CC0 materials. |
| D gaps | **Yes, in code** | No CC0 server racks, lockers, computers, shipping containers or vehicles were found on Poly Haven. Model them in code with bevelled, lathed and extruded parts and procedural PBR materials. |
| E first-person weapons and hands | **Yes, in code** (see the correction above) | Parametric bevelled parts, five-finger skinned hands with IK, timeline-authored reloads. |
| F characters and animation | **Yes, in code**, with more risk than E | Skinned parametric bodies and gear; locomotion and deaths authored as procedural or keyframed cycles. Hand-written body animation is the hardest thing in this plan to make convincing, so it gets the most iteration rounds. |

So: **every row is to be built to the bar.** Where a row falls short at a gate, the status file gives its score and
what the next round changes; "no source" is no longer an accepted reason.

**The Chromebook constraint.** MW2 ran on consoles at about 1024x600. The weakest current Chromebooks (Intel UHD 600
class, Mali-G52 class, 4 GB shared memory) are in the same range as those consoles or below, with browser overhead
on top. Expectation, to be confirmed on hardware:

- A **Low** tier (lightmaps + albedo, no per-pixel specular on the world, no dynamic shadow, no post, 512–1K
  textures, 60–75 % render scale) should hold 30 fps on that class. It carries most of the look, because lighting
  and texture detail do most of the work.
- **Medium** and **High** (rows B, G, H in full) are where the MW2 comparison holds, and need a mid-range
  Chromebook or better.
- Download grows from about 1 MB to an estimated 40–60 MB, and GPU memory matters: textures must be GPU-compressed
  (KTX2) or the Low tier will not fit in 4 GB machines.

None of the frame-rate claims can be proven in the build container. The plan therefore ships a benchmark the owner
can run on a real Chromebook.

## 3. Owner decisions (answered 2026-11-11)

1. **Weapons and characters.** Make our own weapons, and find and use asset packs freely. Working rule: an asset
   may be committed only if its licence allows redistribution in a public repository — CC0, or CC-BY with the
   author credited in `public/THIRD_PARTY_NOTICES.txt`. Anything paid, non-commercial, "editorial use" or without a
   clear licence stays out. Sources that need a login or token remain unavailable unless the owner supplies one.
2. **Reload animations and sound effects must be our own work.** No downloaded reload animation clips and no
   downloaded sound effects, from any pack, whatever its licence. Reloads are authored here (keyframed or
   procedural, with hand IK); sound stays synthesised in `audio.ts`. Locomotion and other character animation from
   a properly licensed pack is still allowed.
3. **Security policy: WebAssembly is allowed.** `'wasm-unsafe-eval'` has been added to `script-src` in
   `public/_headers`, `netlify.toml`, `vite.config.ts` and `scripts/serve-built.mjs`. `worker-src` is still
   `'self'`: decoder workers and `.wasm` files must be served from the site, not from `blob:` URLs or a CDN.
4. **Chromebooks are a hard requirement. Optimise first.** A throttled mode for weak machines is allowed but is the
   last resort, used sparingly: reach the frame budget by instancing, merging, LODs, culling, compressed textures
   and cheaper shaders before removing anything the player can see, and select the throttled mode automatically
   only when the startup probe shows the device needs it.
5. Still open: the download budget (40–60 MB assumed acceptable) and which Chromebook model to benchmark on.

## 4. Technical design

### 4.1 Asset pipeline (`scripts/breachline-assets/`, output `public/game-art/breachline/`)

- `manifest.json` lists every external asset: id, source URL, author, licence, SHA-256, what it is used for. Only
  CC0 assets may be added without the owner's say-so. `public/THIRD_PARTY_NOTICES.txt` is updated from the manifest.
- `fetch.mjs` downloads by manifest (idempotent, checks hashes). `build.mjs` produces shipped files:
  - textures resized with sharp to tier sizes (512 / 1K / 2K), AO/roughness/metal packed in one map, normals in
    OpenGL convention;
  - GPU compression, which weak machines need to fit in 4 GB: KTX2/Basis (UASTC for normals, ETC1S for colour),
    one file for every GPU. The Basis transcoder's worker and `.wasm` are copied into the site and loaded
    same-origin (three's stock loader builds its worker from a `blob:` URL, which `worker-src 'self'` forbids, so
    wrap or patch that). The spike confirms an encoder runs under Node here (`ktx2-encoder`, or a Basis build from
    npm); if none does, fall back to S3TC/BC DDS written by ImageMagick plus uncompressed 512 px on ARM;
  - models as binary glTF with meshopt compression (decoder is WebAssembly, served same-origin), LODs from
    meshoptimizer's simplifier at build time.
- **Asset count is budgeted, not just bytes:** at most 22 surface materials and 30 prop models; small props share
  512 px textures; nothing ships at more than 2K.
- Shipped binaries are committed (the site is static). Keep the total under 60 MB and no file over 20 MB.
- Runtime loads through one `assets.ts` with a progress callback, per-tier variants, and a hard failure path
  (missing asset → the current procedural look, not a broken screen).

### 4.2 Lighting

- **Offline baker** (`scripts/breachline-assets/bake.mjs`, Node, deterministic): builds the level's static geometry
  from `map.ts` plus placed props, generates a second UV set (planar charts per wall/floor face, packed), and
  ray-traces into lightmap atlases at 8–16 texels per metre: sun and sky from the chosen HDRI, ceiling fixtures as
  area lights with soft shadows, two bounces, ambient occlusion, then denoise and edge dilation. A BVH is needed
  (`three-mesh-bvh` as a dev dependency, or a small local one). Budget: a full bake under 10 minutes on 4 cores.
  Placed props are occluders in the bake, so they cast baked contact shadows; bounce colour comes from each
  material's average albedo. Lightmaps hold more than 0–1 range (RGBM or a fixed 4x scale), or lamps will clip.
- **One geometry source.** The baker and the browser must build byte-identical static geometry and UV2 from
  `map.ts`. Put that in a pure module (`render/levelgeo.ts`, no DOM, no three renderer) imported by both, and test
  that the two agree; otherwise lightmaps will land on the wrong surfaces.
- **Light grid:** the same baker writes a 3D grid of L1 spherical-harmonic probes (about 1 m spacing, two heights).
  Props without lightmap UVs, fighters, the weapon in hand, gadgets and particles are lit from it.
- **Reflection probes:** one small prefiltered cube map per room and three for the yard, baked offline.
- Destructible panels cannot be lightmapped per texel (they change). They take lighting from panel-local baked
  samples at cell corners (as now, but from the new baker) so they match the walls around them.
- The existing `lightbake.ts` stays as the fallback and for tests.

### 4.3 Materials and tiers

One material family (`render/materials.ts`), three variants compiled per tier:

| | Low | Medium | High |
| --- | --- | --- | --- |
| World | albedo x lightmap | + normal, specular from probe and dominant light direction | same, 2K textures |
| Props, fighters, weapon | albedo x light grid | + normal, specular, sun shadow | same |
| Sun shadow | none (contact blobs) | one 1024 map, fighters and weapon only | two cascades, 2048 |
| Post | none | bloom, grade, FXAA | + depth of field when aiming, SSAO if it fits |
| Render scale | 60–75 %, adaptive | 75–100 %, adaptive | 100 % |

Tier is chosen by a short startup probe (renderer string, a timed frame burst) and can be overridden in the menu.

### 4.4 Geometry

- **Architecture** stays generated from `map.ts`, so collision and visuals cannot drift, but gains modelled detail:
  door and window frames with depth, skirting, a suspended ceiling grid with recessed fixtures, wall trunking, vents,
  pipes and ducts from the modular Poly Haven kits, signage.
- **Props:** each collision box in `map.ts` is dressed with real models (mapping table in section 6). Art fits the
  collision, not the other way round. Where collision must change to fit a model, change `map.ts`, bump
  `NET_VERSION`, and re-run the navigation, bot and online tests.
- **Clutter** with no collision (papers, cables, bins, small tools) is allowed only where it cannot be mistaken for
  cover.
- **Instancing and merging:** repeated props are instanced; static props in a room merge into few draw calls.
- **Loading is asynchronous.** `createScene` is synchronous today. The menu must appear at once on the fallback
  look while assets stream in, with progress shown, and a match must be playable before High-tier textures arrive.

### 4.5 Destruction look

The 0.25 m cell simulation does not change. The picture does:

- the hole outline is smoothed (marching squares over the cell grid) so breaches are ragged, not square;
- the wall is two skins with a cavity: broken board edges show thickness, torn paper and a gypsum normal map;
- timber studs and noggins sit in the cavity and are revealed by damage. They must break with the cells around
  them, so nothing visible is left where the simulation says a fighter can walk or shoot;
- debris uses a few chunk meshes, not cubes, plus dust that lingers; bullet holes on solid surfaces get
  normal-mapped decals.

### 4.6 Weapons and hands

- Each weapon is authored in code as real parts with named sockets (muzzle, grip, support hand, magazine, bolt or
  slide, sight line): receivers and handguards from extruded profiles with bevels, barrels, suppressor threads and
  optics from lathes, rails, pins, screws, selector, trigger and guard as separate bevelled pieces. Target 8–15k
  triangles each, with LODs for the third-person copy. Materials are PBR with shader-generated wear: edge
  highlights, scratches, grime in recesses, parkerised steel, polymer, anodised aluminium, wood where it applies.
- Hands: parametric five-finger hands (per-phalanx lengths and radii, knuckles, nails, glove seams) on a skinned
  rig, two-bone IK for the arms to the grip and support sockets, finger curl poses per weapon and per grip.
- **Reloads are authored here, as timelines of named beats** (owner's rule: no downloaded reload clips): magazine
  release, magazine out, clear, fetch, rise, align, insert, seat, regrip, bolt or slide; separate tactical and
  empty reloads per weapon; the shotgun loads shell by shell. Hands and magazine follow the timeline through IK
  targets. Timings must still match `WeaponDef.reload` in `config.ts` (the simulation is not changed).
- The existing procedural sway, recoil and aim-down-sights stay and are refined (weapon inertia, sight alignment,
  a firing cycle with bolt travel and ejected casings).
- Gate for this section: row E at 8. If it is below, iterate; do not move on with "about 5".

### 4.7 Characters

- Skinned bodies authored in code: torso, limbs, head and hands from lofted cross-sections with smooth skin
  weights at the joints; modelled gear on top (helmet with rails and strap, goggles, plate carrier with pouches,
  belt, holster, knee pads, boots with soles). About 6–10k triangles, three LODs. Procedural fabric, webbing, metal
  and rubber materials. Squad colours as bands on helmet and arms, with the shape cue kept.
- Animation authored in code: a locomotion cycle driven by pace and direction (foot plant, hip sway, shoulder
  counter-rotation, weapon bob), crouch, lean, aim pitch as an additive layer through the spine, a third-person
  reload matching the first-person beats, hit flinches, and several deaths. The simulation's pose fields stay the
  single source of truth. A properly licensed locomotion pack may be used if one is found, but is not required.
- This is the riskiest section. Budget the most look-compare-iterate rounds here and judge it in motion (frame
  sequences), not only in stills.

### 4.8 Effects and post

- Flipbook atlases for muzzle flash, smoke, dust and explosion (generated offline from a noise simulation, so they
  are original and deterministic), soft particles on Medium and up, shell casings, impact sparks by surface type.
- Bloom, filmic curve and a colour-grade LUT in one composite pass; depth of field only when aiming, High only.
- Sky from a Poly Haven HDRI converted to a low-dynamic-range cube map; the baker uses the same HDRI, so the sun in
  the sky and the light on the ground agree.

## 5. Budgets (asserted by tests wherever countable)

| | Low | Medium | High |
| --- | --- | --- | --- |
| Triangles in view | ≤ 150k | ≤ 300k | ≤ 500k |
| Draw calls | ≤ 200 | ≤ 300 | ≤ 400 |
| Texture memory (GPU) | ≤ 160 MB | ≤ 350 MB | ≤ 700 MB |
| First download | ≤ 20 MB | ≤ 40 MB | ≤ 60 MB |
| Script per frame (this container) | ≤ 3 ms | ≤ 4 ms | ≤ 5 ms |
| Target | 30 fps on the named Chromebook | 60 fps on a mid laptop | 60 fps on a desktop GPU |

A `?bench=1` mode flies a fixed camera path for 30 seconds on each tier and shows average and 1 % low frame rate,
tier, render scale and the renderer string, so the owner can read real numbers off a real Chromebook.

## 6. Prop mapping (first candidates, all Poly Haven CC0; confirm fit and size before use)

| Place | Collision today | Candidates |
| --- | --- | --- |
| Office, lobby | desks, reception | `metal_office_desk`, `SchoolChair_01`, `drawer_cabinet`, `desk_lamp_arm_01`, `cardboard_box_01` |
| Lab | benches, cabinets | `chemistry_set`, `metal_tool_chest`, `drill_press_01`, `korean_fire_extinguisher_01`, stools; benches modelled |
| Garage | van, crates, bench | `metal_toolbox`, `hand_truck`, `propane_tank`, `Barrel_01`/`barrel_03`, `old_military_crate`, `ladder_sectioned_01`; **vehicle: no source** |
| Archive | shelving | `Shelf_01` family, box files modelled, `plastic_crate_01` |
| Break room | counter, fridge, sofa | `sofa_02`/`sofa_03`, `metal_trash_can`, `WetFloorSign_01`; appliances modelled |
| Server room | racks | **no source**: model racks properly (frame, rails, blanking plates, cable looms), emissive LEDs |
| Ceilings, walls | — | `modular_airduct_rectangular_01`, `modular_industrial_pipes_01`, `hanging_industrial_lamp`, `industrial_caged_sconce`, `security_camera_01` |
| Yard | barriers, containers, shed | `concrete_road_barrier`(`_02`), `modular_chainlink_fence`, `exterior_aircon_unit`, `portable_generator`, `trashbag`; **containers and vehicles: no source**, model with ribbed panels, doors, corner castings |
| Openings | barricades, windows | `rollershutter_window_01–03` for reference and parts; barricade planks modelled with CC0 wood |
| Sidearm | — | `service_pistol` |

## 7. Phases, each ending in a gate

Every phase ends with: the fixed set of eight camera bookmarks re-rendered on High and Low; a scorecard (section 8);
all existing tests green; a commit and push. A phase is not done because tests pass.

| Phase | Work | Gate |
| --- | --- | --- |
| 0. Spike (do first, small) | Fetch three texture sets and three models; settle the texture route in 4.1 (write a DDS/S3TC texture and load it under the site's real CSP; note what the software rasteriser supports); load them in the real renderer; prototype the baker on the Lab alone; record sizes, bake time, memory | One Lab screenshot with real materials and a ray-traced lightmap; a written go/no-go on the texture route and on the baker approach. **If the Lab does not look dramatically better here, stop and report before building the rest.** |
| 1. Renderer foundation | `assets.ts`, material family, tiers and startup probe, loading screen, fallback path, post chain skeleton, budget counters, `?bench=1` | Old look still works with assets missing; budgets measured |
| 2. Lighting | Full baker, UV2, lightmaps, light grid, reflection probes, HDRI sky | Lighting row A ≥ 7 |
| 3. Surfaces | Every wall, floor, ceiling material replaced; trims, frames, ceiling grid, fixtures | Rows B, C ≥ 7 on High |
| 4. Props and dressing | Room by room and yard, per section 6; modelled stand-ins for the gaps | Row D ≥ 7 indoors, ≥ 6 in the yard |
| 5. Destruction look | Section 4.5 | Row J ≥ 7; the destruction tests and a new "nothing visible blocks a passable gap" check pass |
| 6. Weapons and hands | Section 4.6, authored in code | Row E ≥ 8, judged in stills and across a reload sequence |
| 7. Characters | Section 4.7, authored in code | Row F ≥ 7, judged in motion (frame sequences of walking, crouching, firing, dying) |
| 8. Effects, post, optimisation | Section 4.8; LODs; tier tuning against budgets; docs, notices, SPEC update | Rows G, H, I ≥ 7; all budgets met; benchmark instructions written for the owner |

## 8. How quality is judged

- **Scorecard, fixed bar.** Each row A–J is scored 0–10 where 8 means "would not look out of place in MW2 (2009)"
  and the current build is recorded as the baseline (about 1–2 on most rows). All rows are re-scored after every
  phase, in a table, by looking at the renders — never from memory or from the report alone.
- **The craft bar is the reference artifact** named in the correction at the top: read its source for how each
  thing is built before building the same kind of thing here.
- **Reference first.** Before writing code in a phase, study real references for that row (the Poly Haven asset
  renders for materials and props; publicly available screenshots of late-2000s military shooters for composition
  and lighting, looked at for study only, never saved into the repository or copied).
- **Look, compare, iterate.** Each round: render → open the render → list at least five specific mismatches against
  the reference → fix → render again. Expect two to four rounds per phase. A green test with a poor picture is a
  failure.
- **Bookmarks:** lobby menu flyover; south yard toward the building; west lot; corridor; Lab; Archive; Server room;
  a breached wall close up; the weapon in hand in each of those. Same seeds, same poses, every time.
- **Orchestrator sign-off.** The session that commissioned this opens the final renders itself before the work is
  called done.

## 9. Fences

- **Do not change behaviour:** `sim.ts`, `state.ts`, `net.ts`, `bots.ts`, `nav.ts`, `world.ts` and the rules in
  `config.ts` are off limits, except collision adjustments in `map.ts` under the rule in 4.4. `index.ts`, `hud.ts`
  and `input.ts` may be touched only for the loading screen, the tier setting and the benchmark.
- **Owned by the overhaul:** `scene.ts`, `levelmesh.ts`, `lightbake.ts`, `textures.ts`, `models.ts`, `effects.ts`,
  new files under `src/games/breachline/render/`, `scripts/breachline-assets/`, `public/game-art/breachline/`.
- No runtime CDN; everything ships from the site. No new runtime dependency without need; dev dependencies for the
  pipeline are acceptable and must be pinned.
- Reduced motion still disables camera shake, bob and flashes. Colour is never the only squad cue.
- Never commit an asset whose licence is not recorded in the manifest. Nothing from MW2 or any other game.
- Report honestly: where a row cannot reach the bar, say what score it reached and what would unlock the rest.

## 10. Risks

| Risk | Likelihood | Effect | Response |
| --- | --- | --- | --- |
| Decoder worker built from a `blob:` URL | Certain with three's stock loader | Blocked by `worker-src 'self'` | Serve the worker and `.wasm` from the site (4.1) |
| No ETC2/ASTC encoder for ARM devices | Medium | Low tier may not fit 4 GB ARM Chromebooks | Uncompressed 512 px there; flag for the owner |
| Offline baker too slow or noisy | Medium | Lighting stays below bar | Lower texel density outdoors, progressive bake, bilateral denoise; worst case per-vertex bake on denser meshes |
| Poly Haven props do not fit the collision boxes | High | Rework | Scale within ±15 %, otherwise adjust `map.ts` under the 4.4 rule |
| Too many unique prop textures | High | Download and memory budgets blown | The asset count budget in 4.1; atlas small props |
| Baker and browser build different geometry | Medium | Lightmaps misplaced | Single shared module and an agreement test (4.2) |
| Hand-written body animation looks stiff | High | Row F below the bar | Most iteration rounds go here; judge in motion; a licensed locomotion pack is allowed as a supplement |
| Code-authored hero assets cost too much per frame | Medium | Chromebook budget missed | LODs, merged static parts, one material per weapon, shader cost measured per tier |
| Chromebook cannot hold 30 fps | Unknown (no GPU here) | Core requirement missed | Optimise first (instancing, merging, LODs, culling, compressed textures, cheaper shaders); benchmark mode; adaptive scale; a throttled mode only as the last resort |
| Download too large for school networks | Medium | Players wait or give up | Tiered loading; Low under 20 MB; lazy-load High textures after first frame |
| Software rasteriser renders differ from real GPUs | Low | Misjudged pictures | Owner confirms on real hardware at the phase 0 and phase 4 gates |

## Parallel workstream, added 2026-11-11: hero models (weapons, hands, fighters)

The owner looked at the phase 0 Lab and said the graphics and models need to be better. The weapon in hand fills a
third of every frame and the fighters are what players look at; both were scheduled last (phases 6 and 7). They
are moved forward and given to **a second Opus 5.5 session that runs now, in parallel** with the environment
session. Sections 4.6 and 4.7 remain the specification; this section is the contract between the two sessions.

**Split.**

| | Environment session | Hero session |
| --- | --- | --- |
| Phases | 0–5 and 8 (renderer, lighting, surfaces, props, destruction look, effects, post, optimisation) | 6 and 7 (first-person weapons and hands, reload animation, fighters and their animation) |
| Owns | `scene.ts` (except the seam below), `levelmesh.ts`, `lightbake.ts`, `textures.ts`, `effects.ts`, `render/` except `render/hero/`, `scripts/breachline-assets/`, `public/game-art/breachline/` | `models.ts`, everything under `src/games/breachline/render/hero/`, `tests/games/breachline/hero*`, `docs/evidence/breachline/hero/` |

**The seam in `scene.ts`.** Today the weapon in hand and the fighters are built inline (`gunFor`,
`updateViewmodel`, `figFor`, `updateFigures`, the view scene and its lights). The hero session's **first commit**
moves that code behind two modules and nothing else:

```ts
// render/hero/index.ts
export interface HeroLighting {
  /** Light arriving at a point, for anything that moves. Colour now; spherical harmonics when the light grid lands. */
  probe(x: number, y: number, z: number): { color: [number, number, number]; sh?: Float32Array };
  /** Reflection environment for the place the camera is in, or null before one exists. */
  environment(x: number, z: number): THREE.Texture | null;
  sun: { x: number; y: number; z: number; color: [number, number, number] };
}
export function createViewmodel(renderer: THREE.WebGLRenderer, lighting: HeroLighting): Viewmodel; // owns its scene and camera
export function createFighters(scene: THREE.Scene, lighting: HeroLighting): Fighters;
```

`scene.ts` then only constructs these, forwards the per-frame view and the match events, and renders the viewmodel
after the world. After that commit the environment session does not edit the hero modules, and the hero session
does not edit `scene.ts` again except to change those few call lines. The environment session supplies
`HeroLighting` (an adapter over the existing `bake.probe` at first, the baked light grid and reflection probes
later); the hero session must look right under both.

**Budgets for hero assets** (in addition to section 5): weapon and hands in view ≤ 20k triangles and ≤ 4 draw
calls; each fighter ≤ 8k triangles at full detail with two lower levels (about 3k and 1k), ≤ 3 draw calls, ≤ 40
bones; ten fighters ≤ 60k triangles in view; procedural textures ≤ 1K, generated lazily for what is equipped, ≤ 150
ms each; all hero animation ≤ 1 ms of script per frame in the build container. Weak machines get the lower levels
and smaller textures, not missing parts.

**How it is judged** (section 8 applies, plus): for every weapon, three studio turntable renders, the first-person
frame at hip and aimed, and an eight-frame strip of each reload; for fighters, turntables per squad, and eight-frame
strips of walking, sprinting, crouch-walking, firing, flinching and each death, seen from the side and from the
front. Renders are also taken *in the game*, under the real lighting, because that is where they will be seen.
Gates: row E ≥ 8, row F ≥ 7, each after at least three look-compare-iterate rounds per asset. Evidence and a status
file go under `docs/evidence/breachline/hero/`.

**Reference.** The "Saltline" artifact named at the top (hands, bevelled parts, reload beat timelines), studied
statically; public photographs of real rifles, shotguns, carbines, submachine guns, marksman rifles, pistols and of
soldiers' kit, looked at for proportion and detail, never saved into the repository. Breachline's weapons are its
own designs with its own names: believable, not replicas of a specific make and model.

**Review of this addition (two passes).** Pass 1: a third session on one branch only works if the files are
disjoint, so the split is by file and the shared file (`scene.ts`) gets a one-time seam; lighting is the real
dependency between the two, so it is an interface rather than an import of each other's internals. Pass 2 (against
the code): the viewmodel renders in its own scene with its own camera and lights today, so the hero session owns
that scene outright; fighters' pose comes from the simulation's fields, which stay read-only; reload timing comes
from `reloads.ts` (sound plan, section 4) and `WeaponDef.reload`; `index.ts` is already edited by two sessions, so
the hero session exposes its own dev-only hook from its module instead of touching it.

## Re-ordering after phase 0 (environment session, 2026-11-11)

The owner judges whole frames, and what made the phase-0 Lab look cheap was flat light and no post-processing, not
missing megabytes. The environment session therefore works the **Lab as a vertical slice** before spreading the new
materials to other rooms, in this order:

1. Lighting contrast: stronger, tighter fixtures with less fill, dark corners and under-bench areas, contact shadow
   under every prop, modelled troffers (frame, diffuser) with a hot spot on the ceiling in the lightmap; check the
   lightmap's range and AO strength.
2. Visible specular on tile and metal, with the fixtures present in the reflection probe as bright sources.
3. The post chain basics, brought forward from phase 8: render to a half-float target, filmic curve and colour grade,
   bloom on fixtures and muzzle flashes, light vignette, ambient occlusion where the tier affords it. One grade
   direction is chosen here and surfaces are held to it from phase 3 on.
4. Dense modelled props in the Lab: cabinetry with doors and handles, sink and taps, bench equipment, skirting and
   dado rail as geometry, sockets and conduit.
5. The KTX2/Basis runtime (same-origin transcoder) and the phase-1 renderer work (tiers with cheaper shaders, startup
   probe, loading screen, budget counters, `?bench=1`) follow, because the slice must be measured against section 5.

Gate for the slice: rows A–D at 7 or better in the Lab bookmarks, with the budget numbers measured on those frames.
Then the same standard rolls out room by room (phases 2–4 as written). Phases 6 and 7 belong to the hero session.

## Fighters split out, added 2026-11-11

The owner asked again for better gun and people models and textures. After its first round the hero session had one
weapon in the game and had not started the fighters, so **fighters (section 4.7, row F) move to their own Opus 5.5
session**, and the hero session keeps weapons, hands, the weapon in hand and reloads (section 4.6, row E).

| | Weapons session (was "hero") | Fighters session |
| --- | --- | --- |
| Owns | `models.ts`, `src/games/breachline/render/hero/`, `tests/games/breachline/hero*`, `docs/evidence/breachline/hero/` | `src/games/breachline/render/fighters/`, `tests/games/breachline/fighters*`, `docs/evidence/breachline/fighters/` |
| Gate | Row E ≥ 8 | Row F ≥ 7, judged in motion |

Contract between them:

- **One-line seam.** `createFighters` in `render/hero/index.ts` becomes a re-export of `render/fighters/index.ts`.
  The fighters session makes that single edit in its first commit; nothing else in `render/hero/` is edited by it.
- **Toolkit.** The fighters session may import the hero toolkit (`geom.ts`, `sdf.ts`, `material.ts`, `rig.ts`,
  `hands.ts`) but not change it; anything it needs beyond that it writes in its own directory.
- **Weapons in fighters' hands.** The weapons session exports a low-detail world model per weapon with grip and
  support-hand sockets (`worldWeapon(id)` from `render/hero/index.ts`, about 1.5k triangles). Until it exists the
  fighters session uses a stand-in with the same sockets.
- **Truth comes from the simulation.** Hit volumes (`rayBody` in `world.ts`), eye height, crouch and lean are fixed;
  the body must fill them: a head where the head sphere is, a torso where the cylinder is.
- Lighting arrives through `HeroLighting`, as for weapons. Budgets as in the hero section above.

## Working notes for whoever carries this out

- Fresh checkout: `npm ci`. Type-check with `npx tsc --noEmit`; unit tests `npx vitest run tests/games/breachline`
  (41 tests) and the whole suite `npx vitest run`; build `npm run build`.
- Browser tests in this kind of container need the pre-installed Chromium:
  `ARCADE_URL=http://127.0.0.1:<port> CHROMIUM_PATH=/opt/pw-browsers/chromium BLOCKCRAFT_BROWSER_CHANNEL=headless-shell npx playwright test tests/games/breachline tests/multiplayer/breachline-online.spec.ts --project=chromium --trace off --workers=1`
  with `npx vite --host 127.0.0.1 --port <port> --strictPort` running. Run one browser at a time: several at once
  exhausted the container's memory.
- The game exposes `window.__breachlineTest` in dev builds (`start`, `freeze`, `advance`, `hold`, `place`, `look`,
  `skip`, `still`, `stats`, `draw`, `state`): use it to pose the fixed bookmarks. `start({quality:'high'})` avoids
  the adaptive scale dropping under the software rasteriser.
- `tests/e2e/shell.spec.ts` "library at …" already fails on the base branch (it expects 24 game cards); ignore it.
- `tests/core/posters.test.ts` requires flat cover art; do not touch `public/game-art/breachline/cover.svg`.
- Existing screenshots for the baseline are in `docs/evidence/breachline/`.

## Left over from the code review, for the overhaul to pick up (all in `scene.ts`)

- Release the WebGL context on dispose (`renderer.forceContextLoss()`), as `src/games/quad-clash/scene.ts` does, and
  dispose the instanced shadow mesh and every pooled geometry.
- Only six grenade meshes are pooled; a seventh live grenade is invisible. Size the pool to the most that can exist.
- The "Sharp" preset never gets antialiasing, because `antialias` is fixed when the renderer is created, before
  saved preferences are restored. Tier selection in 4.3 must account for this.
- Mounting blocks the main thread while the level is built (about 270 ms in the build container, likely a second or
  more on a Chromebook). The asynchronous loading in 4.4 should remove this.

## Corrections from phase 0 (2026-11-11)

- **Texture route.** Built and working first (before WebAssembly was allowed): KTX 1.1 files with BC1 (colour,
  sRGB), BC5 (normals, z rebuilt in the shader) and BC1 (AO/roughness/metal), written by a local JavaScript encoder
  (`scripts/breachline-assets/bc.mjs`, no ImageMagick: it cannot write BC5) and read by three's stock `KTXLoader`,
  with 512 px JPEG fallbacks for GPUs without S3TC/RGTC. Then, with WebAssembly allowed, `ktx2-encoder` 0.6.0 was
  confirmed to run under Node here: 1K colour as ETC1S is 154 KB (BC1: 699 KB) and normals as UASTC+RDO+zstd 334 KB
  (BC5: 1.4 MB), and Basis transcodes to ETC2/ASTC on ARM. **Phase 1 switches the shipped textures to KTX2/Basis**
  per 4.1, with the transcoder served same-origin; the BC path stays as the fallback. Until then only the 512 px BC
  files are committed (the 1K ones are local build outputs, so history does not carry files about to be replaced).
- **Art rooms carry their own light fixtures** (`render/fixtures.ts`). The map's lamp list is too sparse for a baked
  look (the Lab had two small panels for 80 m^2); it is kept for the fallback look and rooms not yet converted.
  `map.ts` is not touched.
- **Lit materials need normals everywhere.** Destructible panel meshes had none (the unlit material never needed them).
- **Shader patches must target whole chunks.** three expands `#include`s after `onBeforeCompile`, so line-level
  replacements inside chunks silently do nothing.
- **Tooling:** `npx vite-node scripts/breachline-assets/bake.ts` runs the TypeScript baker against the real map code;
  `scripts/breachline-assets/bookmarks.mjs` renders the camera bookmarks (needs the fixture-style localStorage seeding
  to get past the account screen). `?art=off` shows the procedural look, `?arttier=low` the Low tier,
  `?artdbg=nodir,nonormal,noenv,noarm,panelbasic` isolates material terms for review.
- **Budget arithmetic:** a surface set at 1K costs 2.8 MB (download and GPU). 22 sets at 1K is ~60 MB, the whole High
  budget, so 2K is for hero surfaces only and small props must share atlases.

## Review log

**Pass 1 (feasibility and order).** Changes made: moved the spike to phase 0 with a stop-and-report gate, because
the whole plan rests on unproven tools (texture compression and the baker); separated what is achievable now
(environment) from what is blocked (weapons, characters) instead of listing both as work; added the fallback path so
a missing asset can never break the game; replaced "match MW2" with a ten-row scorecard, with today's scores as the
baseline, so progress is measurable; added the benchmark because frame rate cannot be measured where the work is
done; added an asset *count* budget after working out that forty props with three 1K maps each would blow the
download budget on their own; required the bake to include props as occluders and to store more than 0–1 range.

**Pass 2 (against the code and the site as they are).** Changes made: checked the site's Content-Security-Policy and
found it blocks WebAssembly and `blob:` workers, which rules out the standard Basis, meshopt and Draco decoders —
added decision 4, a no-WebAssembly texture and mesh route as the default, and a rule that the policy is not to be
changed unasked; the baker and the browser must share one geometry module or lightmaps will not line up, so that is
now a requirement with a test; lighting for destructible panels cannot use lightmaps, so it keeps corner samples
from the new baker; studs in the wall cavity were visual-only in the first draft, which would show solid timber
where fighters can walk — they now break with their cells and get a test; props must fit existing collision, with
an explicit rule (and `NET_VERSION` bump) where they cannot; scene creation is synchronous today, so asynchronous
loading with an immediate fallback look was added; `index.ts` joined the restricted list with three allowed
purposes; budgets gained a script-cost row because that is the only frame cost measurable in the container; the
prop table marks every gap ("no source") rather than implying coverage; working notes were added from what this
session learned about running tests here.

**Correction after hand-off (owner's challenge).** The owner pointed to a code-only artifact by the same model
family with skinned five-finger hands, bevelled weapons, shader-made PBR textures, beat-by-beat reloads and layered
sound. The claim that weapons and characters were blocked without downloaded models was withdrawn; sections 2, 4.6,
4.7, 7, 8 and 10 were rewritten so that every row is built in code to the bar, with that artifact as the craft
reference and the Chromebook budgets still binding.
