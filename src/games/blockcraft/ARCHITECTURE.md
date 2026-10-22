# Blockcraft architecture and agent playbook

Blockcraft is a modern-Minecraft-style survival/creative sandbox on Three.js. The engine
(`engine/game.ts`) creates one service per area. Services talk **only** through the interfaces in
`engine/contracts.ts` (reached via the `Game` object) and the typed event bus (`game.events`).
Registries are plain data in `data/`.

## Module ownership

Each feature area owns specific files. **Edit only the files your area owns.** If you need a
change in a file you do not own (a contract, a registry, the engine), do not edit it: describe the
exact change in your final report under "Contract requests" and work around it locally (for
example with a small local adapter or a fallback).

| Area | Owned files (create others freely inside your own folder/prefix) | Test files |
| --- | --- | --- |
| Engine, contracts, registries (integrator) | `engine/*`, `data/*`, `index.ts`, `style.css`, `world/world.ts`, `world/worker.ts`, `ARCHITECTURE.md` | `core.test.ts`, `play.spec.ts` |
| Terrain and biomes | `world/terrain.ts`, `world/noise.ts`, `world/terrain-*.ts`, `world/structures*.ts`, `data/biomes.ts` (tuning only, keep ids/names/fields) | `terrain*.test.ts` |
| Lighting | `world/light.ts`, `world/light-*.ts` | `light*.test.ts` |
| Meshing | `render/mesher.ts`, `render/mesher-*.ts`, `render/shapes*.ts` | `mesher*.test.ts` |
| Renderer and sky | `render/renderer.ts`, `render/sky*.ts`, `render/particles*.ts`, `render/hand*.ts`, `render/overlay*.ts` | `renderer*.test.ts`, `render*.spec.ts` |
| Entity framework | `entity/entities.ts`, `entity/model*.ts`, `entity/spawning*.ts`, `entity/items*.ts` (item/xp entities), `entity/ai*.ts` (shared AI helpers) | `entities*.test.ts`, `entities*.spec.ts` |
| Passive mobs | `entity/passive.ts`, `entity/passive-*.ts` | `passive*.test.ts` |
| Companion mobs | `entity/companions.ts`, `entity/companions-*.ts` | `companions*.test.ts` |
| Hostile mobs | `entity/hostile.ts`, `entity/hostile-*.ts`, `entity/projectiles*.ts` | `hostile*.test.ts` |
| Monsters | `entity/monsters.ts`, `entity/monsters-*.ts` | `monsters*.test.ts` |
| Player and controls | `player/player.ts`, `player/input.ts`, `player/touch.css`, `player/controls-*.ts` | `player*.test.ts`, `controls*.spec.ts` |
| Survival | `player/survival.ts`, `player/survival-*.ts`, `player/effects*.ts` | `survival*.test.ts` |
| Inventory and screens | `items/inventory.ts`, `ui/screens.ts`, `ui/screens.css`, `ui/screen-*.ts`, `ui/slots*.ts` | `inventory*.test.ts`, `screens*.spec.ts` |
| Crafting and smelting | `items/crafting.ts`, `items/recipes*.ts`, `world/blockentities.ts` | `crafting*.test.ts` |
| Interaction | `interact/interaction.ts`, `interact/loot*.ts`, `interact/placement*.ts`, `interact/use*.ts`, `interact/combat*.ts` | `interaction*.test.ts`, `interaction*.spec.ts` |
| World simulation | `world/ticks.ts`, `world/ticks-*.ts`, `world/fluids*.ts`, `world/explosion*.ts`, `world/growth*.ts`, `world/fire*.ts` (registers `primed_tnt` and `falling_block` in `registerWorldEntities`) | `ticks*.test.ts` |
| Audio | `audio/sounds.ts`, `audio/*.ts` | `sounds*.test.ts` |
| Weather | `world/weather.ts`, `world/weather-*.ts`, `render/weather*.ts` | `weather*.test.ts` |
| Advancements and statistics | `ui/advancements.ts`, `ui/advancements-*.ts`, `ui/advancements.css` | `advancements*.test.ts` |
| HUD and menus | `ui/hud.ts`, `ui/hud.css`, `ui/hud-*.ts`, `ui/menus*.ts` | `hud*.test.ts`, `hud*.spec.ts` |
| Block art | `art/atlas.ts`, `art/tiles-*.ts`, `scripts/generate-blockcraft-cover.py`, `public/game-art/blockcraft/*` | `art*.test.ts` |
| Item art | `art/items.ts`, `art/sprites-*.ts` | `item-art*.test.ts` |
| Online play | `net/*`, `engine/players.ts` (player views: use `playersOf(game)` / `hasAuthority(game)` instead of `game.player` for anything that should also see online guests) | `net*.test.ts`, `tests/multiplayer/blockcraft-online.spec.ts` |

Paths are relative to `src/games/blockcraft/`; tests go in `tests/games/blockcraft/`. Shared test helpers live in
`tests/games/blockcraft/helpers/` (integrator-owned; `fake-game.ts` builds a DOM-free `Game` whose services you replace with yours).

## Rules

- **Keep the contract.** Implement your service's interface exactly as declared. You may add
  internal helpers and exported pure functions for tests. Do not change another area's
  behaviour by monkey-patching `game`.
- **Wiring rules** (also in the `contracts.ts` header):
  - A factory only stores `game` and builds private state; reach other services in `init()` or later. Entity kinds are registered by the
    `register*` calls in `engine/game.ts` (passive, companions, hostile, monsters, world entities), before any `init()`; the entity
    framework registers 'item' and 'xp_orb' itself.
  - Tick order is survival, player, entities, ticks, blockEntities, weather, then the rest; frame order is input, player, interaction,
    render, entities, weather, ui, hud, then the rest, and finally `render.render()`.
  - Each input action has one consumer (see `InputAction`). Change settings only through `game.updateSettings` / `setMode` /
    `setViewDistance`; time only through `skipTime`.
  - Every sound name is in the closed `SoundName` union; its docs say which area plays it.
  - Engine-owned flows: death screen and `respawn()`, sleeping's `skipTime`, pause/resume, `restored` after a load, sky darkening.
- **Use the registries.** Block ids come from `data/blocks.ts` (`blockId('name')`, `B.*`, lookup
  tables like `SOLID`/`OPAQUE`). Items are string ids from `data/items.ts`. Biomes come from `data/biomes.ts`.
  Never hard-code numeric block ids.
- **Performance budget:**
  - The main thread has about 16 ms per frame on a low-end Chromebook. Chunk work is budgeted in `engine/streaming.ts`.
  - Light per chunk should be ≤ 3 ms and meshing ≤ 2 ms (both in Node).
  - Entity rendering must stay at ≤ 3 draw calls total, with ≤ 1 ms CPU for 60 entities. Mob AI ≤ 0.05 ms per mob per tick.
  - Block ticks ≤ 1 ms per tick on average; weather precipitation ≤ 2 draw calls; particles 1 draw call.
  - No per-frame allocation in hot loops.
  - No shadows or post-processing.
- **Determinism.** World generation is a pure function of seed and chunk position (it runs in Web
  Workers). Gameplay randomness uses `game.random()`.
- **Persistence.** `serialize()` returns small JSON-safe data. `restore(data)` must validate
  everything and ignore anything invalid; never throw.
- **Lifecycle.** `dispose()` frees every listener, timer, DOM node, geometry, material and
  texture you created. The game can be mounted and unmounted repeatedly.
- **Accessibility.**
  - Buttons get readable labels and work with keyboard focus.
  - No emoji as artwork.
  - Respect `game.reducedMotion` (no view bobbing or sway).
  - Escape is reserved by the arcade shell (it opens Study Mode). Use `E` to close screens.
- **Art looks vanilla but is drawn here.** Every texture is painted in code to look like vanilla Minecraft
  (see "Vanilla look" in FEATURES.md). Never copy, trace or embed Mojang textures, sounds or models (vanilla block
  and item *names* are fine).
- **Content Security Policy.** Only same-origin scripts and no inline scripts. Workers must be
  same-origin module workers. Never use `eval`. Data URLs are allowed for images.

## Coordinates and conventions

- **Chunks** are 16×128×16 (`engine/constants.ts`); sea level is 62. Index with `voxelIndex(x,y,z) = x + z*16 + y*256`.
- **Face order** is +x (east), −x (west), +y, −y, +z (south), −z (north).
- **Yaw** 0 looks north (−z); positive yaw turns left. Pitch is up-positive.
- **Ticks** run at 20 per second; `dayTime` is 0..23999 (6000 = noon).
- **Light** values are 0..15, packed as `sky<<4 | block`.
- **Vertex layout:** see `MeshPart` in `contracts.ts`.
- **Facing:** block `facing` points toward the placer (`facingFromYaw`); see `BlockDef.facing` for chests, furnaces, torches, ladders, doors,
  beds and stairs.
- **Units:** velocities in blocks/second, health and damage in half-hearts, entity `moveX/moveZ` in blocks/second.
- **Debugging:** in development (`npm run dev`), `window.blockcraft` is the running engine.

## Testing

- Unit: `npx vitest run tests/games/blockcraft/<your-file>.test.ts`
- Types: `npx tsc --noEmit` (fix errors in your files; report errors elsewhere)
- Browser (only if your brief asks): start your own server
  `npx vite --host 127.0.0.1 --port <port>` and run
  `ARCADE_URL=http://127.0.0.1:<port> PLAYWRIGHT_BROWSERS_PATH=<pw dir> npx playwright test tests/games/blockcraft/<file>.spec.ts --project=chromium`.
  Use `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` as `CHROMIUM_PATH`. Software WebGL is slow, so give generous timeouts.
