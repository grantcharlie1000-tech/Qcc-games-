# Crossy Road performance and streaming

Crossy-only rush pass. Ball Run source is unchanged; its earlier baseline is retained for the follow-up. Shared UI, glass, leaderboards and other games were not edited.

Production preview, Chromium/SwiftShader, 15-second rAF samples after warmup. Phone: 390×844, DPR 3, CPU 4×. Desktop: 1366×768, DPR 1. CPU profiling ran separately. One after sample per profile; these software-GPU numbers are not real-device FPS.

| Profile | FPS before → after | p95 ms before → after | p99 ms before → after | Frames >33 ms before → after |
|---|---:|---:|---:|---:|
| phone | 17.40 → 33.24 | 333.3 → 83.4 | 566.7 → 333.4 | 40 / 263 → 67 / 508 |
| desktop | 12.61 → 4.72 | 666.7 → 1516.6 | 900.0 → 4649.8 | 20 / 196 → 9 / 71 |

Phone FPS improved 91%. The desktop sample regressed, including a 4.65-second p99 interval. Both before/after CPU profiles are dominated by shared-shell `getImageData` readbacks. That code is outside scope; the desktop regression remains unresolved. No repeat benchmark was run, as requested.

| Profile | Mean draw calls before → after | Retained heap growth before → after |
|---|---:|---:|
| phone | 30.89 → 26.62 | 1.08 → 0.93 MiB |
| desktop | 32.13 → 32.44 | 0.96 → 0.21 MiB |

Changes:

- DPR starts at 2, drops to 1.5 then 1 under sustained frame pressure, and recovers with hysteresis. Automatic adaptation preserves geometry and shadows.
- Ground strips cover bounded horizontal chunks. Existing instanced meshes, reused buffers and projected shadows remain; there are no shadow maps. Auxiliary row caches are capped.
- New generation revision 5 retains seeded mulberry32, replaces forced terrain alternation with weighted choices and bounded clusters, randomizes each lane’s direction/speed/spacing, and gradually increases difficulty. Revisions 1–4 retain their generation streams for old saves.
- Grass banks connect seeded clear corridors; obstacle placement is hashed by seed/row/column. Dense randomized log spacing guarantees a landing interval on every adjacent log pair at any time.
- Removed side movement limits and edge-drift deaths. Camera follows x smoothly; terrain, vehicles, logs, lilies, trains and signals stream around the view. A shifting render origin preserves local float precision; fixed pools and stateless column queries bound memory.
- Independent review fixes: stable train-pass IDs prevent repeated rumble while drifting; corrupt extreme saved coordinates are rejected before unsafe render iteration.

Validation: `npx tsc --noEmit` passed; Crossy-only Vitest **631/631 passed (15 files)**; `npx vite build` passed for the production measurement. Both benchmark scenarios reported no page errors; screenshots and compressed CPU profiles are saved here. E2E/Playwright specs and CI were skipped per the priority change. The owned preview was stopped.

Implementation commits: `03b3743f`, `9031dfa4`. Baseline: `00cd17bd`. Measurements: [before.json](before.json), [after.json](after.json). Unit log: [crossy-vitest.txt](crossy-vitest.txt).
