# Neon Coil verification — 20 October 2026

The **local R3 resize correction passed its allocated Astra review at `f8df8003c773246984a200cf8a4b48c7578579c5`**, with no remaining findings. Astra independently passed five focused Chromium cases; Sol 6.1 verified all 20 arena Chromium cases, strict TypeScript, 288 unit/core tests and build. The published draft PR remains at `1e08484`; its first full CI failed one WebKit resize assertion. No corrected WebKit run is claimed, and further pushes are held because PR publication automatically deployed a Netlify preview. Details and preserved failures are under **Review R3** below.

The prior runtime checkpoint `9e187e8a23c5df263092dc27ec3b7b6ac5ad837f` passed its allocated Astra review with no remaining findings, 16 independent Chromium cases, and inspected unit/build/offline evidence. That review remains preserved in `docs/evidence/neon-coil/review-final/astra/`. The original checkpoint results and all later findings and corrections remain below; later publication does not change those historical local results.

## Original checkpoint checks

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
- **WebKit was not executed locally.** The installed browser executable is absent at `/tmp/neon-coil-browsers/webkit-2370/pw_run.sh`. The normal Playwright `install ffmpeg webkit` setup stopped while downloading ffmpeg with HTTP **403**, body **`Domain forbidden`**, beginning at `https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-linux.zip`. The installer failed before WebKit installation. No manual alternate-network or direct-curl workaround was attempted. System Chromium and system ffmpeg completed the authorized local checks and recording. Hosted CI later installed/executed WebKit and failed the resize assertion recorded under R3; the local correction has not been verified in WebKit.
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

This correction changes only arena CSS and its browser tests. Input handling, simulation, renderer, existing games/study and original evidence are unchanged. No new renderer benchmark or physical-device/WebKit/reference-media verification is claimed. The following final exact-checkpoint review completes the local audit sequence; publication is still unauthorized.

## Final Astra review — 9e187e8

The same allocated Astra seat independently re-reviewed the clean checkpoint `9e187e8a23c5df263092dc27ec3b7b6ac5ad837f` against `62f995e0e3d8f041815487f61340f8f76802f26b`. **No Critical, Important or Minor findings remain. Ready for parent review: Yes.** No further implementation changes were requested.

Independent strict TypeScript and the complete **16-case Chromium suite** passed (72.99 seconds; zero skipped, flaky or unexpected cases). Additional probes verified the rotated 568×320 Enter, saved Continue and death/Play again cards. Every card fits above the footer and all nine sampled action-button hit-tests pass for each state, with zero runtime errors. Source hashes match the final Sol 6.1 manifest.

Astra inspected the final 288-test, build and sequential offline evidence (pack `0c14d99f6084`, 72 files, zero external/page/asset errors); it did not repeat those completed runs at this checkpoint. The prior review independently ran the same unchanged model/core unit suite. The final report, raw browser JSON, TypeScript output, exact probe script/results, screenshots and copied browser test/configuration are preserved in `docs/evidence/neon-coil/review-final/astra/`, with checksums for copied artifacts.

The original negative reviews, red runs, intermediate failures, slower SwiftShader measurements, original recording and all unavailable-check limitations remain preserved. Final documentation/evidence may be committed after this reviewed runtime checkpoint without changing application sources. The final verdict grants no publication, push, merge or deployment authorization.

## Review R3 — post-publication resize synchronization

Following fresh parent approval, head `1e08484b890bb2d60ced32989bfc139d075acc44` was pushed and opened as [draft PR 5](https://github.com/grantcharlie1000-tech/Qcc-games-/pull/5). Remote main was still `a7f7631d4f606667f23b016ad6091cb3899365e8`, and no duplicate branch/PR existed. [CI run 39416296107](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39416296107) checked out test merge `0254e4d1113304e8d64b87a5b27fb7b1b02012f0`, whose tree exactly matches the published head. It passed 288 unit tests, installed both engines, and completed browser testing with **329 passed, one failed, 14 skipped**. Neon Coil accounted for 16 Chromium passes and 11 WebKit passes, one WebKit failure and four existing CDP-only skips. Build/update/offline checks were skipped after that failure; Pages deployment was skipped.

The failure expected five ranking rows after resizing and received ten. That assertion remains correct and unchanged. Source tracing and four authoritative Chromium red regressions confirmed a product defect: resize updated canvas dimensions immediately, while the viewport-dependent ranking waited for a throttled running-loop update. Ready/paused/dead worlds could retain the old row count indefinitely. The running test's canvas-readiness check exposed the same synchronization gap. Exact hosted WebKit event ordering remains inferred because its trace could not be downloaded locally.

Sol 6.1 added a narrow resize-time HUD refresh using the normal phase guard. Four regressions now require strict five/ten rows across ready, paused, dead and running-with-frozen-clock resizes. World snapshots, best score and announcements remain unchanged; applicable phases resume afterward. The original resize/high-DPI test is unchanged. Authoritative red: **four intended ranking failures**; targeted green: **five passed**; full arena Chromium: **20 passed**. Strict TypeScript, **288 tests in 25 files**, and build passed (72-file pack `24046d9a038d`). No new offline or performance benchmark is claimed for this HUD correction. The initial red run's server failures are retained and excluded from ranking-reproduction counts.

`docs/evidence/neon-coil/review-r3/DIAGNOSIS.md`, `sol61/manifest.json` and `ci-first-failure/` preserve source hashes, exact commands, raw logs, before/after snapshots, screenshots and the first hosted CI outcome. All earlier evidence remains unchanged. The hosted screenshot/trace artifact `12261214108` remains available, but local materialization of the supported file reference was blocked before receiving bytes by `Tunnel connection failed: 403 Forbidden`; no retry or bypass occurred. Local WebKit remains absent and no corrected WebKit result is claimed.

**An automatic Netlify preview deployment occurred when PR 5 opened.** It was a deployment even though it was not manually invoked, and should have been checked before publication under the user's no-deploy restriction. The parent disclosed it. Read-only Netlify metadata confirmed production remains main commit `a7f7631d`, published at 03:43 UTC before this PR. Safe metadata is retained under `ci-first-failure/`. No further deployment-triggering writes, hosting changes, preview deletion/promotion, CI rerun, merge or release occurred. The new correction stays local; further pushes require explicit permission for the automatic-preview side effect.

### Allocated R3 Astra review

After the parent allocated a new slot, Astra reviewed exact clean local checkpoint `f8df8003c773246984a200cf8a4b48c7578579c5` against published head `1e08484`. **No Critical, Important or Minor findings were identified. Locally ready for parent review: Yes.** No further implementation fix was requested.

Astra independently passed the original resize/high-DPI test plus all four lifecycle regressions: **five focused Chromium cases in 23.63 seconds**, zero skipped/flaky/unexpected cases. Rankings changed 5 → 10 → 5, full worlds stayed equal, and best score, announcements and runtime errors remained unchanged. It also verified source identity, all 76 Sol artifact hashes, 12 retained CI-record hashes and 60 retained snapshots across red and green. It inspected the completed 20-case Chromium, TypeScript, 288-unit and build records without rerunning them.

The report, raw independent browser/validation JSON, runner configuration, copied tests, screenshots and snapshots are preserved in `review-r3/astra/`. The review does not establish corrected WebKit/full-CI, new offline/performance, reference-media fidelity or physical-device behavior. A later documentation-only commit records this verdict without changing the audited runtime. All deployment/publication holds remain in force.

## Review R4 — current-main integration and test repairs

The parent subsequently authorized ordinary PR updates and their automatic Netlify previews on the existing setup, withdrawing the Free-tier prerequisite. No purchase, billing, account or security change was authorized or made. Earlier holds above describe the historical checkpoints. Main merges remain the parent's responsibility.

Published head `421a8d3` completed [CI 39479986705](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39479986705) with **288 unit passes; 333 browser passes, five failures and 14 skips**. Both engines passed the original resize/high-DPI test, including the prior WebKit failure. The four new lifecycle WebKit failures came from assuming DPR 1 for a correctly rendered DPR 2 canvas. The remaining Chromium case exceeded the 30-second total budget. Build/update/offline checks did not run. The run tested merge `fa2b5733` based on `a7f7631`, not the Animal Stack main commit `fbac0a58` that arrived two seconds after the run began.

Authorized local merge `3773b5e` incorporated `fbac0a58` without conflicts or manual resolutions. All 431 feature paths and 72 main paths are disjoint from their common base and were preserved exactly. The follow-up changes only the arena browser tests and concise evidence; all 219 runtime/public files match the integrated source. Existing Snake, Pool and Study implementations are unchanged.

Sol 6.1 corrected backing-size expectations to use actual capped/rounded DPR, while retaining strict 5 → 10 → 5 rows, full-world equality, best score, announcements, errors and resume assertions. A DPR 2 Chromium red reproduced the old expectation. All four lifecycle cases passed at DPR 1 and 2, with additional fractional DPR 1.25 and capped DPR 3 checks. Diagnostic JSON now stores full-world SHA256 fingerprints and small summaries; the actual equality assertions still compare complete worlds.

Only the long interaction flow now has a 60-second cumulative orchestration budget. Its original inputs, simulated durations and gameplay assertions remain intact. Astra identified that the first revision also extended implicit action/navigation allowance. Sol added explicit 30-second auto-wait/navigation caps; retrying assertions remain seven seconds. Raw synthetic input, state reads and fake-clock work have no independent timeout and share the cumulative budget. This distinction does not define or establish a product responsiveness SLA.

Normal/4×/20× timing probes completed in 13.0/13.6/22.4 seconds. At 40×, the old 30-second budget expired at 31.1 seconds; the revised flow with operation caps completed every assertion in 38.8 seconds (39.4-second test), and its actual normal run passed in 12.3 seconds. This supports orchestration headroom under controlled load, not the hosted failing await/cause or a product latency improvement. Smaller independent tests could improve attribution, but equivalent real-input setup must retain the grown/curved/boosted/paused world before the keyboard handoff; naive fresh-state splits lose that transition coverage.

Combined Chromium verification initially produced **159 passes and 17 pre-game environment failures** because Playwright's bundled ffmpeg was absent. A supported private `PLAYWRIGHT_BROWSERS_PATH` cache reused installed `/usr/bin/ffmpeg`, with no download or global-cache change. The two affected files then passed **18 cases**, recovering all 17 blocked cases and repeating one existing pass: **176 unique Chromium cases passed across the runs**. The original failures remain preserved. All 20 arena cases, host and Animal Stack cases passed in the broad run.

Strict TypeScript, **288 unit tests**, build, update verification and all **14 games plus Study offline at root and repository-subpath URLs** passed. The integrated pack contains **84 files**, version `1c58baf3fab5`, with zero external requests, page errors or failed assets in offline verification. Source identities are separated: broad suite `b1fc976`; capped focused flow `06929e0`; final comment-only cleanup `db633ac`. No dedicated renderer benchmark was repeated.

`docs/evidence/neon-coil/review-r4/` preserves the old hosted result, integration proof, exact commands, 42 compact Sol artifacts with checksums and the independent review. Raw new failures, traces, videos and screenshots remain in the local handoff directories; earlier committed evidence is untouched. Local WebKit and the hosted trace remain unavailable; there was no installer/artifact retry or access bypass. Fresh full hosted CI on the integrated head remains required before merge eligibility.

Astra's final exact-checkpoint review of `db633ac` reports **no remaining Critical, Important or Minor findings; ready for fresh PR CI**. Its independent DPR 2 run passed **five cases in 34.7 seconds**, covering the complete interaction flow and all four resize lifecycles. It verified all 42 Sol artifact hashes, the disjoint integration and final comment-only identity. The initial negative finding, final report, independent results, screenshots and checksums are preserved separately under `review-r4/astra/`. The owned server stopped and the allocated audit slot was released. This verdict does not establish hosted CI or merge eligibility.
