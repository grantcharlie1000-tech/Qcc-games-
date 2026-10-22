# Blockcraft: source project and optimisation record

Blockcraft is the arcade's endless block-building game. It began as a TypeScript rebuild of the MIT-licensed [Minecraft-Javascript-Edition](https://github.com/ashish0kumar/Minecraft-Javascript-Edition) by Ashish Kumar (commit `f7336ea`, Three.js r167, ~1 800 lines). That project was chosen because it is a complete, browser-native, permissively licensed clone with the core loop: infinite chunked terrain, ores, trees, clouds, mining, placing, a hotbar and saves. It also uses Three.js, which the arcade already ships for Ball Run. The feature work since then grew it into a modern-Minecraft-style survival and creative game: biomes, lighting, mobs, survival, inventory and crafting screens, smelting, world ticks, weather, sound, advancements and a vanilla-style HUD. Its production chunk is 841 kB (308 kB gzip), with a 64 kB worker, on top of the shared, lazily loaded Three.js chunk (486 kB).

Not taken from upstream: its PNG textures and font (they look like Minecraft assets), its pickaxe model, and the name. All artwork is generated in code, and the game is called Blockcraft. The architecture and module ownership are in [`src/games/blockcraft/ARCHITECTURE.md`](../src/games/blockcraft/ARCHITECTURE.md); the feature list is in [`FEATURES.md`](../src/games/blockcraft/FEATURES.md).

## What changed and why it is faster

| Area | Upstream | Blockcraft |
| --- | --- | --- |
| Voxel storage | A JS object `{id, instanceId}` per block: 18 432 objects per 24×32×24 chunk | 16×128×16 chunks: one 32 KB `Uint8Array` of block ids, one of packed light (`sky<<4 \| block`), an `Int16Array` heightmap and per-column biomes. Chunks are looked up in a `Map` by a small-integer key (no heap number per lookup) |
| Geometry | One `InstancedMesh` per block type per chunk (9, each sized for every voxel), plus a water plane per chunk. A whole cube is drawn if any face shows | Three meshes per chunk at most (opaque, cutout, translucent). Only exposed faces are emitted, culled across chunk borders, then **greedy-merged** where tile, light, AO and tint match. Other shapes (slabs, stairs, plants, doors, liquids…) follow the vanilla block models |
| Vertex format | `BoxGeometry` (float position, normal and uv: 32 B per vertex) plus a 64 B matrix per instance | **20 bytes per vertex** (`MeshPart` in `engine/contracts.ts`): `Uint16×4` position (1/16 block, plus a light byte and flags), `Uint16×4` uvt (u, v, tile, shade) and `Uint8×4` tint. Every chunk shares one quad index buffer |
| Lighting | Lambert lights plus a 2048² PCF soft shadow map; every block casts and receives | Vanilla-style flood-fill sky and block light per chunk (`world/light.ts`), smooth lighting and AO baked into vertices, day/night through a lightmap uniform; no shadow pass |
| Textures | 18 PNG requests (plus GLB and font), one material per face type | One procedural 256×256 atlas (16×16 tiles of 16 px) with no requests. Terrain samples a mipmapped copy (vanilla's 4 levels, the level picked from the unwrapped tile coordinate so greedy quads tile seamlessly); everything else samples it sharp |
| Terrain generation | Main thread via `requestIdleCallback`. Three full-resolution 3D noise passes per voxel for ores | **Web Workers** (up to 3) with transferred buffers; main-thread fallback if workers fail. Light and meshing run on the main thread within a per-frame budget, nearest chunks first |
| Saved edits | Builds a string key for every voxel of every loading chunk to check the store | Integer-keyed map per chunk; only edited indices are replayed. Saved as one base64 segment per edited chunk, kept until that chunk changes, so an autosave stays cheap however many edits there are |
| Entities | n/a | Batched model rendering (all mobs in at most 3 draw calls), quads written from corner offsets so drawing allocates almost nothing. Saved entities of unloaded chunks leave the simulation and come back with their chunk |
| Picking | `THREE.Raycaster` against instanced meshes | Voxel DDA (Amanatides & Woo) |
| Physics | 200 Hz; allocates candidate objects **and a new `THREE.Mesh` helper per candidate block every step** | 60 Hz swept AABB with no allocation; buffered jump so taps are never lost |
| Resolution | Full `devicePixelRatio`, always rendering | Capped at 1.5×; **adaptive resolution** (0.5–1.5) keeps frame time near budget. The loop idles when nothing changes |

## Measurements

Same machine (4-core cloud container, shared with another Chromium session during the runs), Chromium 141 headless, **software WebGL (SwiftShader)**, view distance 5 chunks. The "before" column is the final review's measurement of commit `63f0fc1`; "after" is the same probe on the fixes that followed it (stream B). The old 1280×720 figures from before the feature work were 8.2 fps standing (p50 133 ms), 6.2 fps sprinting, 13.8 % main-thread busy, 22 MB heap and 53–74 draw calls.

| Metric (1366×768 unless noted) | Before (`63f0fc1`) | After |
| --- | --- | --- |
| Frame time standing, p50 / p95 | 150 / 283 ms | 100 / 183 ms |
| Frame time sprinting, p50 / p95 | 150 / 250–283 ms | 100 / 117–167 ms |
| Main-thread busy standing / sprinting | 9.4–17.6 % / 8–12.8 % | 9.1–15.1 % / 8.7–12.3 % |
| 390×844 standing and sprinting, p50 / p95 | 33.4 / 67–83 ms | not re-measured |
| JS heap (main isolate, after forced GC), load and 2–3 min of flight | 20 MB, 20.1–21.4 MB | 20.2–21.2 MB |
| Load: ready / all view chunks meshed | 1.3–2.1 s / 5.4–9.8 s | 1.3 s / 5.7 s |
| Chunk light / mesh per build, p50 (p95) | 0.9–1.3 (2.0–3.4) / 1.0–1.2 (1.7–5.3) ms | 0.8–1.2 (1.5–2.9) / 1.0–1.2 (2.1–4.1) ms |
| Draw calls | 112–132 (87–104 at 390) | 79–125 |
| Allocation standing, per 8 s / per frame | 30.9 MB / 569 KB | 16.2 MB / 183 KB |
| Allocation sprinting, per 8 s | 25.7 MB | 16.7 MB |
| Largest per-frame allocators | mob quads 135 KB, chunk light copy 122 KB, streaming iterators 34 KB | iterators 15 KB, entity raycast 13 KB, RNG 8 KB; mob quads 2 KB |
| Autosave with 150 000 edits: serialize / stringify / `setItem` | 24.8–80.9 / 17–25.7 / 8.8–11.2 ms, 1.8 MB | 1.4–1.8 ms (11.6 ms on the first save after the edits) / 5–6.8 / 5.1–6.7 ms; the edits are 0.6 MB of the payload |
| Autosave in normal play | 8–25 KB, 0.2–0.5 ms | 22–25 KB, 0.2–0.4 ms |
| Leaving and re-entering 5 times | workers, AudioContexts, WebGL contexts, timers and listeners all released; one engine kept alive by a module variable (18 MB) | the path search no longer keeps a world; dispose also clears the voxel buffers |

With software rendering almost all of the frame time is the emulated GPU (the CPU profile is about 90 % idle), and frame times move with the load the other session puts on the shared GPU process, so the frame rows compare loosely; the allocation, autosave and heap rows do not depend on it. **No physical-device performance is claimed here.** The probes are in the session scratchpad (`perf.mjs`, `save.mjs`).

## Rendering pipeline

1. `world/worker.ts` generates `Uint8Array(16·128·16)` chunks with their biomes (`world/terrain.ts`) and transfers them back.
2. `world/world.ts` stores chunks, replays saved edits on arrival and marks the chunks a change affects (the chunk and the neighbours sharing its border, or only relighting for neighbours a light change can reach).
3. When all eight neighbours exist, `engine/streaming.ts` lights the chunk with its 3×3 neighbourhood (`world/light.ts`, keeping the chunk's own light for gameplay) and meshes it (`render/mesher.ts`) within a per-frame budget, edited chunks first.
4. `render/renderer.ts` uploads the three parts with the shared index and a known bounding sphere, and draws them with camera-relative shaders: lightmap, fog, biome tint, animated water and lava, and the mipmapped terrain atlas.
5. The streaming radius is `r + 1.5` chunks for data and `r` for meshes, so every meshed chunk has all eight neighbours. Chunks beyond `r + 2.5` are freed (GPU buffers detached from the shared index first); their saved entities wait in the entity store.

## Verification

See [`src/games/blockcraft/TEST_RESULTS.md`](../src/games/blockcraft/TEST_RESULTS.md).
