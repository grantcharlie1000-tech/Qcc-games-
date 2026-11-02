# Strongroom asset and source provenance

Based on **Tiny Strike by Guy Zyskind (ISC)**, imported read-only from
<https://github.com/guyz/tinystrike> at
`04db555c4fc9f43fef3325c37930ad97a0c27aa3`. This inventory follows that
revision's `ASSETS.md`. The unchanged project notice is [LICENSE](LICENSE):
Copyright (c) 2026 Guy Zyskind.

## Runtime models

Paths below are under `public/game-assets/strongroom/`. The final operators and arms are designer-built derivatives of the CC0 originals; medium/high guns are built from the licensed source at load time, with baked LODs on potato/low. URLs use Vite's base
URL; the existing offline manifest includes every file in `public/`.

| File | Source | Licence |
| --- | --- | --- |
| `models/soldier_ct.glb`, `models/soldier_t.glb` | Quaternius Toon Shooter Game Kit via Tiny Strike, rebuilt by the supplied `characters/tools/build.mjs`: one palette material, LOD0/LOD1, 12 clips, meshopt | CC0 1.0 |
| `models/viewmodels/arms_attack.glb`, `arms_defend.glb` | Tiny Strike `npc-arms-ct.glb`, body-stripped CC0 derivative, designer palette UVs for gloves/sleeves | CC0 1.0 |
| Source `engine/gfx/operators/attachments.js`, `palette.js`, `body-metrics.js` | Original Strongroom procedural operator kits and palette; supplied designer outputs, copied without modification | Project licence |
| Source `engine/gfx/operators/meshopt-decoder.js` | meshoptimizer 0.22 official JavaScript reference decoder by Jasper St. Pierre / Arseny Kapoulkine; permits one-time decoding under the existing CSP | MIT |

Quaternius source: [Toon Shooter Game Kit](https://quaternius.com/packs/toonshootergamekit.html),
released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Thanks to Quaternius; attribution is voluntary under CC0.

## Procedural graphics and audio

- Every file under `gfx/` comes from Tiny Strike `src/gfx/`, originally ported
  from [mshumer/Claude-of-Duty](https://github.com/mshumer/Claude-of-Duty)
  (OVERWATCH), **MIT**, Copyright (c) 2026 mshumer. The unchanged notice is
  [GFX-LICENSE](GFX-LICENSE). It covers the material/texture generator and
  GLSL surfaces, sky/atmosphere/cloud/star rendering, postprocessing, geometry
  toolkit and procedural weapon builders. No external raster art is used.
  QCC's weapon-template teardown adaptation is kept under that notice.
- The retained `core/input.js`, `core/settings.js`, `maps/`, `shared/`, and `world/`
  modules come from Tiny Strike (**ISC**). The unused economy, career, HUD,
  combat, round, AI, WebSocket, room directory and four map implementations
  were deleted in Round 2. The application simulation, rendering adapter, HUD,
  synthesised audio and online session are QCC TypeScript.
- `public/game-art/strongroom/cover.svg` is a final original QCC vector poster by the game designer,
  drawn for this integration; it contains no third-party art.
- The mounted menu and arcade Game rules display the Tiny Strike credit.
  Copies of both code notices and this inventory are also shipped beside
  the public models for offline attribution.

## Deliberately excluded

Original, unprocessed soldier models, old beige arms and the unused low-detail firearm/equipment exports are replaced. Guns now use the retained procedural weapon builders, with merged remote/cheap variants. The existing grip poses and finger-closing helper remain in `engine/viewmodel-arms.js` (ISC). No videos, trailers or
asset-authoring tools, standalone HTML, source package/dependencies,
`server.mjs`, `src/server/`, `worker/`, Wrangler config, WebSocket transport,
room directory, leaderboard client, or leaderboard/room service core is imported.

## Local adaptations

The bootstrap follows QCC's lifecycle and shared Liquid Glass controls. The supplied optimised character pipeline is integrated, with per-operator kits cached once, side × viewer-relative palette materials and per-tier LOD switching. Low
rendering uses Lambert albedo only; high rendering retains the licensed PBR
and atmosphere. The canvas pixel ratio follows the selected quality tier.
Strongroom never calls QCC score or leaderboard submission APIs. Networking
uses QCC Room; no Tiny Strike services are imported. Three is QCC's r180.

| File | Source | Licence |
| --- | --- | --- |
| `fonts/BarlowCondensed-SemiBold.ttf`, `fonts/BarlowCondensed-Bold.ttf` | Barlow Project Authors, Google Fonts; supplied in the approved HUD mock | SIL Open Font License 1.1, bundled `fonts/OFL.txt` |
| Original HUD SVG symbols (`ui/hud-markup.ts`) | Strongroom / QCC Games, approved direction B | Project licence |

The JavaScript decoder is copied from `meshoptimizer/meshopt_decoder_reference.js` (0.22.0), with its MIT notice in `engine/gfx/operators/MESHOPT-LICENSE.md`. This avoids requesting a WebAssembly script-policy exemption; embedded images use Three’s TextureLoader under the existing `img-src blob:` policy. No security policy was changed.

| File | Source | Licence |
| --- | --- | --- |
| `models/weapons/*-low.glb`, `*-held.glb` | Derived directly from the retained Tiny Strike/Claude-of-Duty procedural builders; `scripts/build-strongroom-weapons.mjs` welds and simplifies their real geometry offline with meshoptimizer 0.22. One vertex-colour primitive: ≤2,200 gun triangles plus 696 arm triangles in low-tier first person; ≤250 remote gun triangles. Full procedural builds remain on medium/high. | MIT/ISC, retained `GFX-LICENSE`/`LICENSE` |
| `MESHOPT-LICENSE.md` | meshoptimizer 0.22 decoder and offline simplification tooling copyright/permission notice | MIT |

Round 3 low-tier weapons are baked LODs of the same real procedural guns, not the old exported stand-ins. First-person arms retain their embedded side palette; ordinary embedded images load through Three TextureLoader under the existing policy. The decoder/simplifier's permission notice is shipped above and alongside the canonical source. No runtime Wasm exemption or remote asset host is required.

The application keeps the supplied team-swatches emissive mask and protects those swatches from overexposed daylight in its operator shader adapter. HDR uses a bounded nonnegative ACES fit; cloth, skin and original kits keep normal scene lighting. No model or designer kit geometry is changed by that adaptation.
