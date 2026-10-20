# Blockcraft: source project and optimisation record

Blockcraft is the arcade's endless block-building game. It is a TypeScript rebuild of the MIT-licensed [Minecraft-Javascript-Edition](https://github.com/ashish0kumar/Minecraft-Javascript-Edition) by Ashish Kumar (commit `f7336ea`, Three.js r167, ~1 800 lines). That project was chosen because it is a complete, browser-native, permissively licensed clone with the core loop: infinite chunked terrain, ores, trees, clouds, mining, placing, a hotbar and saves. It also uses Three.js, which the arcade already ships for Ball Run, so Blockcraft adds about 30 KB of code and a 5 KB worker on top of the shared, lazily loaded Three.js chunk.

Not taken from upstream: its PNG textures and font (they look like Minecraft assets), its pickaxe model, and the name. All artwork is generated in code, and the game is called Blockcraft.

## What changed and why it is faster

| Area | Upstream | Blockcraft |
| --- | --- | --- |
| Voxel storage | A JS object `{id, instanceId}` per block: 18 432 objects per 24×32×24 chunk | One 16 KB `Uint8Array` per 16×16×64 chunk |
| Geometry | One `InstancedMesh` per block type per chunk (9, each sized for every voxel), plus a water plane per chunk. A whole cube is drawn if any face shows | One opaque mesh and at most one water mesh per chunk. Only exposed faces are emitted, culled across chunk borders, then **greedy-merged** where tile and lighting match |
| Vertex format | `BoxGeometry` (float position, normal and uv: 32 B per vertex) plus a 64 B matrix per instance | **7 bytes per vertex**: `Uint8` position and `Uint8` info (u, v, tile, shade). Every chunk shares one quad index buffer |
| Lighting | Lambert lights plus a 2048² PCF soft shadow map; every block casts and receives | Unlit shader with ambient occlusion, face shading and column sky-shade **baked into vertices**; no shadow pass |
| Textures | 18 PNG requests (plus GLB and font), one material per face type | One procedural 128×64 atlas with no requests. Merged quads repeat their tile with `fract()` in the fragment shader |
| Terrain generation | Main thread via `requestIdleCallback`. Three full-resolution 3D noise passes per voxel for ores | **Web Workers** (up to 3) with transferred buffers. Caves use 425 interpolated 3D samples per chunk; ores use an integer hash. Main-thread fallback if workers fail |
| Saved edits | Builds a string key for every voxel of every loading chunk to check the store | Integer-keyed map per chunk; only edited indices are replayed |
| Chunk lookup | `children.find` linear search per block access; O(n²) set difference every frame | `Map` keyed by an integer |
| Picking | `THREE.Raycaster` against instanced meshes | Voxel DDA (Amanatides & Woo) |
| Physics | 200 Hz; allocates candidate objects **and a new `THREE.Mesh` helper per candidate block every step** | 60 Hz swept AABB with no allocation; buffered jump so taps are never lost |
| Clouds | A block layer inside every chunk | One run-length-merged mesh drawn only where clouds are, snapped seamlessly around the player |
| Resolution | Full `devicePixelRatio`, always rendering | Capped at 1.5×; **adaptive resolution** (0.5–1.5) keeps frame time near budget. The loop idles when nothing changes |
| Mesher hot path | n/a | Padded 18×66×18 copy with row `set()`, buried-voxel early reject, module-local aliases instead of import indirection: 2.7 ms → **0.9 ms per chunk** (Node, measured) |

## Measurements

Same machine (4-core cloud container), same Chromium 141 headless, **software WebGL (SwiftShader)**, 1280×720 viewport, both served by Vite dev servers. Figures come from the scripts in this session's scratchpad: 5 s of `requestAnimationFrame` intervals, and a CDP CPU profile over 6 s of sprinting forward.

| Metric | Upstream | Blockcraft |
| --- | --- | --- |
| Frames per second standing still | 0.4 (12.5 s frames) | 8.2 (p50 133 ms) |
| Frames per second while sprinting / streaming | 0.6 | 6.2 |
| Main-thread busy while sprinting | 65.8 % | 13.8 % |
| JS heap after loading | 558 MB | 22 MB |
| Time until the spawn chunk is playable | n/a | 0.9 s |
| Visible world streamed and meshed (69 chunks) | n/a | ≈1.1 s |
| Draw calls at view distance 5 | not exposed (≈10 meshes per chunk × 49 chunks, plus a shadow pass, from code) | 53–74 |

With software rendering, almost all of Blockcraft's frame time is the emulated GPU: 86 % of the main thread is idle. On real hardware the same scene is far below a frame budget, but **no physical-device performance is claimed here**. Blockcraft's frame rates above include adaptive resolution, which had dropped to 50 %; upstream renders at full resolution with soft shadows. The CPU-busy and heap rows do not depend on resolution.

## Rendering pipeline

1. `worker.ts` generates `Uint8Array(16·16·64)` chunks (`terrain.ts`) and transfers them back.
2. `world.ts` stores chunks and replays saved edits on arrival.
3. When all eight neighbours exist, `mesher.ts` copies a padded volume and computes a face key for every exposed face (tile, sky shade, four 2-bit AO values). It then greedily merges equal, evenly lit keys per direction and slice. Faces with an AO gradient stay single, keeping AO exact; their quad diagonal is chosen to avoid interpolation creases.
4. `index.ts` uploads `position` and `info` attributes with the shared index, sets a known bounding sphere (no per-vertex pass), and draws with a small `ShaderMaterial` that includes Three's fog and colour-space chunks.
5. Edits rebuild the touched chunk at once and queue only the neighbours whose border or AO samples changed.

The streaming radius is `r + 1.5` chunks for data and `r` for meshes, so every meshed chunk has all eight neighbours. Chunks beyond `r + 2.5` are freed (GPU buffers detached from the shared index first).

## Verification

See [`src/games/blockcraft/TEST_RESULTS.md`](../src/games/blockcraft/TEST_RESULTS.md).
