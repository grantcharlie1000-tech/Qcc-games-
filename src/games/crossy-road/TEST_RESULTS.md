# Crossy Road fidelity pass 1 verification

Verified locally on 2026-11-01, on branch `game/crossy-road`. Rendering code and final review captures use commit `cc749de`; the final documentation/test commit follows it. No push, PR, merge, deployment or remote database application was performed.

## Checks

| Check | Result |
| --- | --- |
| `npm run check` | Pass |
| `npm test` | 167 files / 3,834 tests passed |
| Generator F1–F7 | 2,000 seeds × 400 rows; time-sampled subset retained; pass |
| Crossy Road Chromium suite | 53 tests passed (2.3 min), including native DSF3 rotation/quality and reduced-motion short-landscape cards |
| Touched Study + viewport Chromium specs | 43 tests passed (2.3 min) |
| `npm run build` | Pass; offline pack generated locally |
| Production lazy game chunk | 20,794 bytes gzip, excluding shared Three.js; below 60 KB |
| Production dev hooks | Neither `__crossyRoadTest` nor `__crossyRoadFrames` appears in built JavaScript |
| Rename audit | Case-insensitive tracked-name grep has no old-name matches |
| Independent code review | No Critical or Important defects; two filename/capture inconsistencies corrected |

Browser commands use `ARCADE_URL=http://127.0.0.1:4190`, Chromium at `/usr/bin/chromium`, and one worker. Ports 4173/4174 and the Liquid Glass worktree were left alone. A first concurrent browser/build run passed 52 tests but hit a Chromium context-teardown timeout after seed 2024's assertions; the final isolated run is recorded above. The first Study run had two retained-DOM failures in Pool/Globle during Vite reconnects; both passed in isolation and the full 43-test rerun passed with a line reporter/private output and a stable dev server. No assertions were relaxed. One earlier fairness timeout under software-render capture load passed on an isolated rerun; no fairness assertions or seed counts were removed.

## Captures and comparison

Run `ROUND=4 node scripts/capture-crossy.mjs` after starting `npm run dev -- --port 4190 --strictPort`. The script verifies the Crossy Road title, fidelity renderer marker and served source before trusting each image.

Four rounds were generated outside git at `/workspace/qcc-crossy-review/r1/` through `/workspace/qcc-crossy-review/r4/`. Each has 33 whole-screen PNGs and one native-pixel crop, plus a JSON manifest of seeds, state, time, backing-buffer sizes, antialiasing and render stats. The final set is `r4`:

- Start: seed **11**, row **0**, t=0.
- Natural mixed scene: seed **7**, row **40**, t=**4.075458626742293**. Unmodified generated surroundings include road, river, lily and rail rows 38–49; the signal is flashing.
- Mid-hop: same seed/row, half-way through a 120 ms sideways hop.
- Car, truck, train, water, swept, UFO-idle and UFO-behind: deterministic focal lanes/validated restored state, triggered by the real rules and stepped clock. No synthetic death flag is injected. The game-over card follows the UFO-behind capture.
- Phone 390×844 at DSF2: **780×1688** drawing buffer.
- Phone 390×844 at DSF3: **1170×2532** drawing buffer, antialiasing enabled. The 420×480 native crop is unscaled and was opened to check voxel edges.
- PC 1366×768: **1366×768** drawing buffer. Dark outside zones and additional columns remain visible.
- Every final capture uses High quality, canvas origin (0,0), and **15–28 draw calls**.

Reference contact sheet and frames t013/t020/t024/t027/t028/t119 were opened and compared with successive captures. Iterations corrected yaw/zoom and initial framing, widened traffic, increased truck boxes, exposed brown trunks under olive box foliage, refined purple rocks, dark logs, small lily pads and chunky foam, tightened the bird's ambient shadow, replaced the signal silhouette, removed flower cubes, and restored immediate visual camera creep. All six deaths and the QCC outcome card were inspected in the final shots.

Remaining visible differences: prop clustering is less dense/varied in places, bark/foam details are simpler, and lighting/shadow softness is not an exact match to the reference. QCC chrome and the UFO are intentional owner choices. The poster remains with the separate designer and was not edited after that instruction. Real iPhone/Chromebook GPU frame rates are not established by headless software WebGL captures.

## Contracts preserved

- New id/route/save/rankings namespace: `crossy-road`; title: Crossy Road. Earlier ids' saves are not imported.
- White voxel bird with red comb and orange beak/legs; all geometry authored in code.
- Hop timing 120 ms, single-input buffer, forgiving collision spans, all deaths and seeded fairness.
- UFO warning 5 s, idle 7 s without a new furthest row; sideways/back moves do not reset progress. Immediate at 3 rows back or behind. Fast swoop, grab and departure under 0.7 s; reduced motion uses a static saucer/fade.
- Cars use 1.5-tile rendered and collision spans for Charlie's proportion override; unchanged minimum free gaps follow each mover. The new-id first-release seed fingerprints were updated explicitly and all fairness checks passed.
- Shared shell owns Score/Row/Best/Menu/rankings. Continue/outcome cards use `ui-glass-sheet`, `arcade-sheet` and `game-button`; no duplicate game-owned live HUD or rankings control.
- High uses native DPR capped at 3, antialiasing and real 2048-square directional shadow maps; Low caps DPR at 1.5 with cheaper shadows. Canvas resizing follows its real CSS size, including rotation.

## Review scope and migration

The independent reviewer inspected rename/integration, camera/culling, shadow casting, native resolution, shared-sheet presentation, capture validity, source changes and reference/R1/R2 images; no blocking defect was found. Its two small inconsistencies were corrected before final captures. Runtime reduced motion, short-landscape card reachability and integration tests are verified by the final browser suite. Hardware FPS is left to physical-device testing. Remote migration application is intentionally outside this task.

`netlify/database/migrations/20261031120000_crossy_road_score.sql` has an explicit **SCHEMA CHANGE: NEEDS CHARLIE APPROVAL** header. It permits `crossy-road` in the existing score constraint. Only isolated local test databases were used; no remote migration was run and no environment secrets or connection strings were read or printed.
