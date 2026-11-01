# Shooter asset and source provenance

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

Quaternius source: [Toon Shooter Game Kit](https://quaternius.com/packs/toonstrongroomgamekit.html),
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
- All other imported client modules (`ai/`, `audio/`, `combat/`, `core/`,
  `effects/`, `game/`, `maps/`, `player/`, `shared/`, `ui/`, `weapons/`,
  `world/`) come from the corresponding Tiny Strike `src/` directories,
  **ISC**. Their generated world textures, effects, HUD SVG silhouettes,
  maps and synthesized Web Audio are covered by the project notice.
- `public/game-art/strongroom/cover.svg` is a new QCC placeholder vector poster,
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

The client bootstrap now follows QCC's mount/pause/resume/dispose contract.
Model URLs use the QCC base URL; event listeners and deferred callbacks are
owned by the mount; menus/styles are scoped to the game; P replaces local
Escape handling; the canvas renders at the full device pixel ratio. The
online/career/ranking UI is disabled and neither upstream services nor QCC
score submissions are called. Three uses QCC's existing 0.180 dependency.
