# Neon Coil verification — 20 October 2026

The original local checkpoint below was reviewed by the parent-allocated Astra seat. Review findings, retained failures, and subsequent Sol 6.1 verification are appended under **Review R1**. No push, public PR, merge, release or deployment was performed.

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

- At the initial `cc08465` checkpoint, **Astra audit was pending parent slot allocation** and no Astra agent had started. The subsequently allocated audit/re-review sequence is preserved below.
- **WebKit was not executed.** The installed browser executable is absent at `/tmp/neon-coil-browsers/webkit-2370/pw_run.sh`. The normal Playwright `install ffmpeg webkit` setup stopped while downloading ffmpeg with HTTP **403**, body **`Domain forbidden`**, beginning at `https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-linux.zip`. The installer failed before WebKit installation. No manual alternate-network or direct-curl workaround was attempted. System Chromium and system ffmpeg completed the authorized local checks and recording.
- **Reference PDF/video were not opened here.** The required Library transfer-helper resource returned **`skill package is not available`**. The parent-supplied safely inspected brief/manifest was used. No ZIP was executed; no ZIP HTTP 403 response occurred in this environment.
- Mouse and multi-touch inputs are browser-generated. Physical trackpad/mobile hardware testing is not claimed.

## Review R1 — Sol 6.1 fixes and independent re-review

Astra reviewed `cc08465d3cf015ca842f8de80d9c92e6f77f953e` and found no Critical issues, with two Important findings: Boost-first touch ordering could not steer, and short landscape layouts obscured the YOU row/clipped the intro. Its complete initial report and independent reproduction/model/browser evidence are preserved in `docs/evidence/neon-coil/review-r1/astra-initial/`.

Sol 6.1 fixed independently owned touch pointers, capture cleanup, height-aware ranking, and compact short-screen cards. An adjacent 320×568 check reproduced a clipped card, offscreen Boost, and footer overlap; narrow cards/Boost now stay within the available viewport. Only arena UI/input and its browser tests changed. The simulation, renderer, existing game/study sources, original screenshots, recording, benchmark and offline results remain unchanged.

Before fixes, the corrected targeted regressions produced **four expected failures and one pass**. The separate 320×568 regression also failed before its fix. Raw failed logs, screenshots, traces, test-helper corrections and intermediate attempts remain under `review-r1/sol61/red/` and `green/`; `verification-results.json` identifies authoritative final runs. Earlier pre-audit failures are recorded in `review-r1/prior-verification-failures.md`, including the limitation that initial overwritten traces were not retained.

Final Sol 6.1 checks on the fixed source passed:

- **14 Chromium browser cases** in the complete arena suite, including both touch orders, steering reacquisition during held Boost, real collision/death, pause/Study/save/restart/disposal, actual intro/ranking/footer bounds, and 320×568, 740×360 and 844×390 layouts.
- Strict TypeScript, **288 model/core tests across 25 files**, and production build.
- Offline root and repository-subpath checks with **zero external requests, page errors or failed assets**, final pack `544fc4c6a30b` with 72 files.

Authoritative outputs are `review-r1/sol61/green/{final14,typescript-final14,unit-final14,build-final14,offline-final14}.log`, screenshots in `green/final14/`, and offline evidence in `offline/final14/`. New runs use the optional `NEON_COIL_EVIDENCE_DIR` variable so the frozen original evidence is preserved.

No new performance benchmark is claimed for the UI-only correction. Original default-Canvas and slower forced-SwiftShader results remain above and in their original JSON. Reference PDF/video, WebKit, physical trackpad/hardware limitations remain open. The following re-review outcome and correction preserve the full local review sequence; no publication is authorized.

## Review R2 — narrow-landscape residual

Astra independently re-reviewed `62f995e0e3d8f041815487f61340f8f76802f26b`. The touch finding and the reported 844×390, 740×360 and 320×568 layouts were corrected. Independent TypeScript, 288 unit tests, and all 14 Chromium cases passed. It nevertheless reproduced an Important residual: rotating 320×568 to 568×320 clipped the intro and overlapped Enter with Restart/Favourite; hit-testing a point inside Enter returned Restart. That negative verdict, measurements, screenshot, full browser report and probes are retained in `review-r2/astra-rereview/`.

Sol 6.1 removed the desktop-width cutoff from the short-landscape layout, tightened the card grid, and kept the actual YOU row clear of the footer. The original CSS produced **two expected failures** at 568×320 and 667×375. Targeted final checks then passed, including rotation of an already-open intro, full-card bounds, Enter/footer intersections and nine Enter hit-test points.

Final fixed-source verification passed **16 Chromium cases**, strict TypeScript, **288 unit/core tests across 25 files**, build, and sequential root/subpath offline checks. Final offline pack is `0c14d99f6084` with 72 files and zero external requests, page errors or failed assets. Tested-source hashes and exact commands are in `review-r2/sol61/verification-results.json`; failed and passing artifacts remain separately under `red/`, `green/` and `offline/`.

This correction changes only arena CSS and its browser tests. Input handling, simulation, renderer, existing games/study and original evidence are unchanged. No new renderer benchmark or physical-device/WebKit/reference-media verification is claimed. The final exact-checkpoint Astra re-review remains pending; publication is still unauthorized.
