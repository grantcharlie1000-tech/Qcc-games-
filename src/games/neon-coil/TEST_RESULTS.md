# Neon Coil verification — 20 October 2026

Local implementation is ready for the parent-allocated Astra review. No push, public PR, merge, release or deployment was performed.

## Completed checks

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed strict TypeScript |
| `npm test -- --reporter=dot` | **288 passed**, 25 files, including 14 new arena model tests and existing Snake/model/core tests |
| `npm run build` | Passed; 106 modules; final offline manifest version `a6ae5711eb16`, 72 files |
| SVG skill validator | 1 passed, 0 failed for the original cover |
| Chromium browser suite | **8 passed**, no skipped/flaky/failed tests in the final combined run |
| Production offline verification | Passed at `/` and `/Qcc-games-/`: action, save, restart, Study restoration, zero external requests, zero page errors, zero failed assets |
| Existing game isolation | Git diff contains no changes under `src/games/snake/`, `src/games/pool/` or `src/study/`; browser test still eats a grid-Snake apple for 10 points before opening Neon Coil separately |

The final eight browser cases cover hover movement without a click, earned mass/body growth, held Space boost, P pause, a quick keyboard tap, rim death, real mouse steering into a bot's body, death pellets, replay without duplicate ticks, Escape-to-Study freezing/restoration, saved continuation, resize, 2× DPI, reduced motion, touch drag plus a second boost finger, release/cancel, keyboard-focusable boost, window blur, 8-second frame gaps, invalid saves and three leave/reenter cycles. Viewports include 1280×720, 1440×900, 1920×1080, 2560×1080, 390×844 and 844×390. No scrolling was observed.

Model tests additionally verify seeded reproducibility, equal fixed-step results across 30/60/120 Hz, bounded turn rate, curved following history, boost floor/cost/speed, head-on symmetry, safe self-crossing, actual bot growth/death/respawn, collectible defeat trails, ranking outside the top 10, terminal states, long-stall bounds, snapshot isolation/validation and restorable death during catch-up.

## Rendering measurements and recording

The dedicated production benchmark ran without recording or other browser tests at the same time. Chromium 154.0.8037.57 used its default Canvas 2D path in a container. Each viewport records 120 requestAnimationFrame intervals. These are synthetic-container measurements, not physical hardware or trackpad claims.

| Viewport | Median frame interval | p95 frame interval | p95 game-loop CPU work |
| --- | ---: | ---: | ---: |
| 1280×720 | 16.7 ms | 16.7 ms | 4.0 ms |
| 1440×900 | 16.7 ms | 16.8 ms | 3.8 ms |
| 1920×1080 | 16.7 ms | 16.7 ms | 3.8 ms |
| 2560×1080 | 16.7 ms | 16.7 ms | 4.3 ms |
| 390×844 | 16.7 ms | 16.8 ms | 4.7 ms |

Measurements and the 8.8-second VP9 recording are in `docs/evidence/neon-coil/interaction-results.json` and `mouse-boost-pause.webm`. The recording contains actual mouse movement, Space boost, pause/resume and a curved following body; the run grows from 30 to about 59 mass. No test hook or prerecorded reference video drives it. The benchmark uses production build `ba4133869a19`; final build `a6ae5711eb16` adds touch-specific help text and hides a redundant mobile subtitle. Simulation and renderer are identical between those builds.

The offline verifier uses its existing forced SwiftShader configuration and records its own separate timings in `offline/offline-results.json`. With the final browser suite running concurrently, it measured 33.4 ms median and 66.7–83.3 ms p95 intervals. Its functional offline pass does not establish 60 fps on that software path; those measurements are not substituted for the dedicated default-renderer benchmark.

## Evidence and reproduction

- `docs/evidence/neon-coil/browser-results.json`: concise final eight-test results; `browser-final.json`: full Playwright result.
- `body-collision-browser.png`, `death-browser.png`, `touch-390.png`: real input-driven body collision, rim death and touch evidence.
- `curved-play-1440.png`, `paused-1440.png`, `play-1280.png`, `play-1920.png`, `play-2560.png`: original running views and pause.
- `offline/offline-results.json`: production root/subpath results, cache versions, requests and errors.

Run the browser suite with `npx playwright test tests/games/neon-coil/play.spec.ts --project=chromium --timeout=60000`. Run the production offline check with `ARCADE_GAMES=neon-coil ARCADE_EVIDENCE_DIR=docs/evidence/neon-coil/offline npm run verify:offline` after building. For a new recording/benchmark, serve the built site locally and run `ARCADE_URL=http://127.0.0.1:4174/ node scripts/verify-neon-coil.mjs`. Recording uses the installed system ffmpeg, without a package download.

## Remaining review and unavailable checks

- **Astra audit is pending parent slot allocation.** No Astra agent has started. The repository asks for independent review of substantial changes; the task explicitly requires waiting for the parent's allocated slot. Code and evidence are ready to review.
- **WebKit was not executed.** The installed browser executable is absent at `/tmp/neon-coil-browsers/webkit-2370/pw_run.sh`. The normal Playwright `install ffmpeg webkit` setup stopped while downloading ffmpeg with HTTP **403**, body **`Domain forbidden`**, beginning at `https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-linux.zip`. The installer failed before WebKit installation. No manual alternate-network or direct-curl workaround was attempted. System Chromium and system ffmpeg completed the authorized local checks and recording.
- **Reference PDF/video were not opened here.** The required Library transfer-helper resource returned **`skill package is not available`**. The parent-supplied safely inspected brief/manifest was used. No ZIP was executed; no ZIP HTTP 403 response occurred in this environment.
- Mouse and multi-touch inputs are browser-generated. Physical trackpad/mobile hardware testing is not claimed.
