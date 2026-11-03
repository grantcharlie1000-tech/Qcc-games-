# Ball Run performance follow-up

Production source: `ed34d9de` before, `cc95fee9` after. Branch: `perf/ballrun`.

| Profile | FPS before → after | p95 ms before → after | p99 ms before → after | Frames >33 ms before → after |
| --- | ---: | ---: | ---: | ---: |
| Phone | 19.03 → 27.05 | 166.7 → 116.6 | 216.7 → 133.4 | 131/288 → 165/408 |
| Desktop | 20.91 → 19.45 | 200.0 → 233.3 | 233.4 → 283.3 | 89/314 → 86/292 |

Phone FPS improved 42.1%; p95 improved 30.1%. Desktop FPS fell 7.0% and p95 worsened 16.7% in this single paired run. No desktop speedup is claimed. Shared-shell `getImageData` remains dominant in the separate CPU profiles (desktop 2,201.55 → 2,449.26 ms self time). It is outside this task’s scope; the profile does not establish the cause of the desktop regression.

Method: Chromium/ANGLE SwiftShader, seed 11, production preview, 2 s warmup, 15 s unprofiled rAF timing, separate 3 s CDP CPU profile, real Play/retry clicks. Phone: 390×844, device DPR 3, CPU 4×. Desktop: 1366×768, DPR 1, CPU 1×. Same harness/settings before and after; these are software-GPU results, not physical-device measurements.

Changes:

- Retain road tiles, lane/cross lines, gates and static obstacles by world identity. Build entering pieces and LOD transitions; recycle bounded slots and upload only dirty ranges. Rebase every 256 m for precision. Sliders still follow the collision pose every frame.
- Preserve the original 1.5 DPR ceiling; sustained slow frames lower it to 1.25 then 1, with slower recovery. Phone reached DPR 1 during timing; desktop remained at 1.
- Write HUD text, attributes and boost transforms only when changed. CSS computes the boost label’s width-dependent position without synchronous layout reads. ResizeObserver supplies canvas size, also reused for pointer steering.
- Reuse the frame view, media query, transforms and upload ranges; avoid the per-frame gate iterator. Course generation, physics, camera, colors, materials, and shell integration are unchanged.

Draw calls remain about 6 and geometries exactly 3. Retained heap growth after forced GC: phone 408,332 → 415,956 bytes; desktop 382,292 → 105,012 bytes. Run progress/retries vary with frame timing; this short sample is not a long-term leak test.

Validation: `npx tsc --noEmit`, 107 Ball Run unit tests across 10 files, and production builds passed. The six focused performance/streaming tests also passed after the final allocation cleanup. Builds, tests and measurements ran sequentially through `flock /tmp/qcc-test.lock`. E2e specs and CI commands were skipped. Independent read-only review found no remaining issues.

A differential check against the original renderer compared 246,991 road/gate/obstacle instance matrices and colors across 152 frames, two seeds and Medium/Hard, including rebasing and distances up to 62,020 m. Maximum component difference: 0.00001526 (Float32 translation precision). Temporary duplicate source/test removed; see [geometry-validation.json](geometry-validation.json). Before/after screenshots were visually inspected; they show different live run positions.

Files: `src/games/ball-run/{index,scene,instances,resolution}.ts`, `tests/games/ball-run/{performance,scene-cache}.test.ts`, `scripts/perf/crossy-ballrun.mjs` (`--ballrun-only`), and this evidence directory. No Crossy, shared/glass styling, leaderboard, or Tetris changes.

Artifacts: [before.json](before.json), [after.json](after.json), matching screenshots and compressed CPU profiles. The harness closed its browser and preview after both runs. No PR was opened or merged.
