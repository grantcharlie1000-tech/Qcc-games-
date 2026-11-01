# Strongroom asset and source provenance

Based on **Tiny Strike by Guy Zyskind (ISC)**, imported read-only from
<https://github.com/guyz/tinystrike> at
`04db555c4fc9f43fef3325c37930ad97a0c27aa3`. This inventory follows that
revision's `ASSETS.md`. The unchanged project notice is [LICENSE](LICENSE):
Copyright (c) 2026 Guy Zyskind.

## Runtime models

Paths below are under `public/game-assets/strongroom/`. Each model is copied
unchanged from Tiny Strike's matching `assets/` path. URLs use Vite's base
URL; the existing offline manifest includes every file in `public/`.

| Imported file | Original source | Licence |
| --- | --- | --- |
| `models/soldier_ct.glb` | Tiny Strike `assets/models/soldier_ct.glb`, processed/exported from Quaternius Toon Shooter Game Kit | CC0 1.0 |
| `models/soldier_t.glb` | Tiny Strike `assets/models/soldier_t.glb`, processed/exported from Quaternius Toon Shooter Game Kit | CC0 1.0 |
| `models/viewmodels/npc-arms-ct.glb` | Tiny Strike `assets/models/viewmodels/npc-arms-ct.glb`, body-stripped derivative of the CT soldier | CC0 1.0 |
| `models/viewmodels/knife.glb` | Tiny Strike original procedural weapon design, authored/exported for Tiny Strike | ISC |
| `models/viewmodels/hegrenade.glb` | Tiny Strike original equipment design, authored/exported for Tiny Strike | ISC |
| `models/viewmodels/flashbang.glb` | Tiny Strike original equipment design, authored/exported for Tiny Strike | ISC |
| `models/viewmodels/smokegrenade.glb` | Tiny Strike original equipment design, authored/exported for Tiny Strike | ISC |

Quaternius source: [Toon Shooter Game Kit](https://quaternius.com/packs/toonshootergamekit.html),
released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Thanks to Quaternius; attribution is voluntary under CC0.

## Procedural graphics and audio

- Every file under `gfx/` comes from Tiny Strike `src/gfx/`, originally ported
  from [mshumer/Claude-of-Duty](https://github.com/mshumer/Claude-of-Duty)
  (OVERWATCH), **MIT**, Copyright (c) 2026 mshumer. The unchanged notice is
  [gfx/LICENSE](gfx/LICENSE). It covers the material/texture generator and
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

The client explicitly skips `ak47.glb`, `awp.glb`, `deagle.glb`, `glock.glb`,
`m4a1.glb`, `mp5.glb`, and `usp.glb`: all firearms use procedural `gfx/weapons/`
geometry, so these unused ISC files were not copied. No videos, trailer or
asset-authoring tools, standalone HTML, source package/dependencies,
`server.mjs`, `src/server/`, `worker/`, Wrangler config, WebSocket transport,
room directory, leaderboard client, or leaderboard/room service core is imported.

## Local adaptations

The bootstrap follows QCC's lifecycle and shared Liquid Glass controls. Models
are unchanged; the separate character optimisation pipeline is deferred. Low
rendering uses Lambert albedo only; high rendering retains the licensed PBR
and atmosphere. The canvas pixel ratio follows the selected quality tier.
Strongroom never calls QCC score or leaderboard submission APIs. Networking
uses QCC Room; no Tiny Strike services are imported. Three is QCC's r180.
