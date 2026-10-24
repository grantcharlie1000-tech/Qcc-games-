# Ball Run test results

Current results: [Redesign (2026-10-24)](#redesign-2026-10-24) below. The 2026-10-19 sections that come first describe the replaced game. Their screenshots have since been overwritten by the redesign's evidence set under the same names; only `ramp-gap.webm` remains from them, and the earlier images are in git history (for example at main `ceb61e3`).

## Gameplay correction (2026-10-19)

2026-10-19, isolated worktree `.worktrees/correction-ball`. Local Vite URL `http://127.0.0.1:4194/#/game/ball-run`. Parent shared viewport commit `6e0b12d4a94b24efed18ce75ae837f31e8dc38ec` was cherry-picked locally as `a1d8e89` for integration checks; it is excluded from the game handoff.

### Checks

- Focused deterministic tests: 9 passed. Traverses 1200m over four seeds without a jump action, observes airborne flight and at least 12 landings per seed, verifies continuous chunk seams over 12 seeds/99 seams, ramp takeoff and gravity landing, smooth speed boost/recovery, frame-rate-independent steering, real edge fall/loss freeze, sphere/block collision vs clear center navigation, exact airborne v2 restore, and v1 distance/best/seed migration.
- Full unit suite: `npm test` — 17 files, 229 tests passed.
- `npm run check`, `npm run build`, `git diff --check` — exit 0. Build manifest retains Ball Run as a dynamic game entry; no Three import added to the homepage.
- Existing unmodified cover: SVG validator — 1 passed, 0 failed.
- Focused Chromium: `ARCADE_URL=http://127.0.0.1:4194 npx playwright test tests/games/ball-run --project=chromium --workers=1` — 8 passed in 39.4s. After the final city depth-offset/player-relative camera refinement, the focused gap/drag/held-key/projection test and all three viewport captures passed again: 4 passed in 16.8s (`--grep 'real restored|perspective'`).

Browser cases use the actual routed module: drag and held-key steering, pause freeze, held-key Study interruption, restart, explicit restore, old-canvas context disposal and re-entry, native Chromium touch drag/cancel followed by keyboard steering, actual acceleration and ramp gap flight/landing without jumping, full-view aspect/overflow at 390×844 / 844×390 / 1366×768, deliberate WebGL loss/save/re-entry, and unavailable-WebGL fallback preserving a seeded 58m save.

### Evidence

`tests/games/ball-run/evidence/` then contained active-running screenshots at all three requested viewport sizes and an actual Playwright VP9 WebM recording (`ramp-gap.webm`, 390×844, 9.12s). Source references are not distributed. The recording contains actual mouse drag, held keyboard steering, acceleration, ramp launch, gap crossing, landing and continued rolling.

That checkpoint's screenshots placed the ball center at .6833–.6842 of viewport height. Independent pixel-mask analysis of the full magenta silhouette finds width/height .9688–.9764, consistent with a round perspective sphere; actual canvas dimensions and camera aspect are also asserted. The test projects the ball center and requires vertical position .60–.78. Final player-relative tracking adds an on-screen horizontal projection assertion after held-D input and gap traversal.

Viewed the actual recorded gap sequence: this caught ball clipping under valid lateral steering, which centered screenshots alone missed. The final camera follows the player laterally and vertically while retaining real fall visibility. Solid city faces receive polygon depth offset so coplanar wire grids stay readable with antialiasing disabled.

### Real failures corrected

The revised model tests first ran against the old implementation: 8 failed, 1 existing steering test passed. They passed after the terrain/kinematics change. The original mandatory-jump test is replaced by launch/airborne/landing and long-course non-jump traversal coverage.

The first browser run had 6 passes / 2 failures: unavailable-WebGL fallback overwrote an existing 58m save with 0m because restore was a no-op; and the global button display rule overrode the hidden Start button after context loss. Both were reproduced and fixed, then the suite passed. Actual screenshots exposed fixed camera height raising the ball into the upper half on ramps; actual video exposed lateral clipping; both informed camera corrections. Half-metre longitudinal grid stair-steps were replaced by connected endpoints along the curved road.

### Rendering observations and limits

The running scene then reported **7 draw calls, 3 geometries**. Road/grid/obstacle/gate instance buffers and the city buffers are reused, not allocated per frame. No shadows, postprocessing or custom shaders.

Chromium is `/usr/bin/chromium` with ANGLE SwiftShader software WebGL. Final recorded sample of 44 RAF intervals: median **66.7ms**, p95 **133.3ms**. The preceding full 8-case run recorded median50/p95116.7ms. A separate 60-interval sample without recording measured median **66.7ms**, p95 **116.7ms**. Earlier antialias-enabled samples varied from median16.7/p95133.3ms (recording) to median100/p95183.4ms (no recording). Original `antialias:false` was retained to reduce software-GPU cost. These are local observations with highly variable load, not a hardware benchmark or a promised frame rate.

Only reference stills are available; original continuous timing is unverified. Native browser touch emulation is not physical-device evidence. WebKit and real mobile/Chromebook GPUs were not tested. Parent owns final all-game/offline/root/subpath checks, independent integration review, and production deployment. No runtime dependency or shared file is part of the game-only handoff.


## Procedural follow-up checkpoint

Base main: `375e250`. Branch: `feat/flappy-ball-run`. See [complete evidence and limitations](../../../docs/FLAPPY_BALL_RUN.md).

- `npm test`: 266 passed across 23 files (23 focused model tests across Flappy and Ball Run).
- `npm run build`: strict TypeScript, Vite and offline manifest passed (69 local files).
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright npx playwright test tests/games/flappy-bird tests/games/ball-run --project=chromium --workers=1 --output=/tmp/qcc-green-browser`: 17 passed in 1.2m; system Chromium 154, software WebGL, system FFmpeg.
- Both changed games passed offline at `/` and `/Qcc-games-/` on the exact frozen checkpoint build, including the compact overlay CSS. All 13 games also passed offline before the final collision refinement.
- Original SVG validation and diff whitespace checks pass.

Exact browser/unit/build/seeded red-green/baseline outputs and offline JSON are in `docs/evidence/flappy-ball-run/`. Screenshots are in each game's `tests/games/<id>/evidence/`.

The broad suite has 147 passes and three failures also reproduced on unchanged main: Block Fill drag tests at lines 19 and 74 and Tower's 30-second tall-tower test at line 47. No unrelated code was changed. WebKit remains unavailable: the browser installer stopped at a prohibited FFmpeg download (HTTP 403 Domain forbidden); installed local Chromium/FFmpeg were used without bypassing network restrictions. No physical hardware testing is claimed. No external publication occurred.

## Redesign (2026-10-24)

Branch `claude/ball-run-redesign` from main `ceb61e3`. The final verification ran on the final source on a 4 vCPU container, with no other test lanes running; the only change it made was the deliberate evidence refresh below, and afterwards only the evidence PNGs and the documentation changed. Branch SHAs are not cited because the work-in-progress snapshot history is due to be rewritten into logical commits. Design, rulings and limits: [delivery checkpoint](../../../docs/BALL_RUN_REDESIGN.md). The commands below are as run, on Node 22.22.0 and Playwright 1.64.1, with paths abbreviated: `CHROMIUM_PATH=/opt/pw-browsers/chromium` (Chrome for Testing 153.0.8010.12), `PLAYWRIGHT_BROWSERS_PATH` a `pw-webkit` folder in the session scratchpad (WebKit 2370 and FFmpeg 1013, not part of the repository), and `--output` and `ARCADE_EVIDENCE_DIR` folders in the same scratchpad.

### Final checks

- `npx tsc --noEmit -p tsconfig.json`: exit 0, no output (24.5 s).
- `npx vitest run tests/games/ball-run`: 4 files, **80 passed** in 17.32 s (model 30, records 19, bot 8, course 23).
- `npm test -- --maxWorkers=1`: exit 1; 116 of 117 files and **2721 of 2722 tests passed** (328.5 s). All four Ball Run files pass. The one failure is `tests/games/blockcraft/light.test.ts` "stays within the budget in cave-riddled terrain with lava lakes" (3.124 ms against a 3 ms budget). It fails alone too (3.2459 ms), Blockcraft is unchanged since `ceb61e3`, and the same suite on an export of main fails two of these performance tests (3.197 and 3.370 ms). The run's one unhandled vitest `Timeout calling "onTaskUpdate"` RPC error also occurs on main. Both are pre-existing and unrelated.
- `npm run build`: exit 0 (39 s); offline pack 115 files, version `8242aacfc9d8`. The Ball Run chunk is 54.92 kB (22.25 kB gzip). The only warning is Vite's 500 kB chunk notice for the shared Three module and the two largest app chunks.
- `git diff --check ceb61e3`: exit 0.
- `CHROMIUM_PATH=… PLAYWRIGHT_BROWSERS_PATH=… npx playwright test tests/games/ball-run --project=chromium --workers=1 --output=…`: **27 passed** (5.0 m).
- The same with `--project=webkit`: **26 passed, 1 skipped** (2.6 m). The skip is the spec's own `test.skip(browserName!=='chromium')` for CDP native touch.
- `npx playwright test tests/e2e/study.spec.ts tests/e2e/viewport.spec.ts tests/leaderboard/sidebar.spec.ts -g "ball-run|viewport"` in each engine: Chromium **8 passed** (1.1 m), WebKit **8 passed** (50.8 s). Covers Study's Escape, frozen autosave and exact return for Ball Run, all-games 390×844 / 844×390 fit without document scroll, 320 px toolbar reach and the collapsed rankings pill.
- `ARCADE_GAMES=ball-run ARCADE_EVIDENCE_DIR=… npm run verify:offline`: `OFFLINE PASS root ball-run + Study`, `OFFLINE PASS subpath ball-run + Study` (51 s). 0 external requests, 0 page errors, 0 failed assets at both deployments; heavy chunks lazy; action, save, restart and Study restoration all true.

The 27 browser cases drive the routed game with real input: fresh-profile Medium setup, slider re-theming and Tab order; drag and held keys, no teleport on a new drag, P pause/resume and held keys through pause, Study, blur, death and restore; native phone touch drag and cancel; a restored Hard run hitting a block, burst, Game Over records, R, Home and reload; shell Restart committing once with the 250 ms score throttle (and not committing a run abandoned at 0 m); legacy v1 best 143 kept as Medium's all-time record, its note keeping Play in view at 568×320, 667×330, 568×300 and 640×300, and a legacy best of 0; a restored Game Over keeping only confirmed NEW marks; reduced-motion fade-only Game Over and no double commit from dying or Game Over; a gate as a permanent boost with Speed Up feedback, and Top Speed at the cap; a curve; 390×844, 844×390, 1366×768, 1920×1080, 667×330 and 568×320 fit with a round ball, matching aspect, ball screen y 0.60–0.80 on a straight, HUD clear of back and pause, and every panel on screen without scrolling; WebGL loss (save kept, focus moved), WebGL unavailable (save untouched); repeated restarts with constant geometries; resize during a held key.

### Engines

Chromium 153.0.8010.12, headless, with ANGLE SwiftShader software WebGL (`--use-gl=angle --use-angle=swiftshader`). WebKit is Playwright's WebKit build 2370 installed locally for this session, with WebGL 2 available. This is the first Ball Run checkpoint run in WebKit. Unit tests run in Vitest's node environment.

### Measured guarantees

From the task reports, the final whole-branch review and the documentation review; out-of-suite scripts and logs are in the session scratchpad, not the repository.

- **Reachability.** In the suite, an independent interval check at 0.95 of the generator's reach stays open over 0–6 km for seeds 1–24 on every difficulty. Out of suite it stayed open for seeds 1–1000 × 3 difficulties × 6 km (0 of 3000 closed) on the flight-capped course, and for seeds 1–300 (0 of 900) after the final Medium/Hard row-spacing retune.
- **Minimum gap.** The narrowest widest opening over about 296,000 checked steps is exactly 2.000 / 1.700 / 1.450 m. An opening is measured between block faces (a slider over its whole sweep), or from a block face out to the outer side of a ball whose centre sits at the last supported point, 0.133 m inside the road edge (so 0.247 m beyond the painted edge). Measured to the painted edge instead, the narrowest widest opening is 1.864 / 1.529 / 1.273 m, with 154 / 397 / 684 steps below the minimum, mostly bank-rolled big blocks and sliders beside the edge; by construction it is never below the minimum less 0.187 m there. Gaps that are not routes can be much narrower: scatter cubes may sit 0.1 m apart. The test fails on three mutations (minimum gap ignored, gap prune ignored, CONFIG lowered to 1.3 / 1.2 m).
- **Bot.** The suite matrix (per difficulty, 12 seeds × 3000 m from the start and 4 seeds × 1500 m past the cap, plus Hard seeds 37, 39 and 89 × 3000 m at the cap) passes. Wider sweeps on the flight-capped course: seeds 1–100 × 3000 m from the start plus 3000 m at the cap, and seeds 101–400 × 1500 m at the cap, 0 deaths on every difficulty. A centre-line driver dies on all 36 matrix courses within 90–218 m, so the bot really avoids blocks. The plan's simpler bot died on 6/6 matrix tests; an exact grid search (0.01 m × 0.05 m/s, the model's own steering at 120 Hz) found every examined failure passable, so it was replaced, not the course. These wide sweeps ran before the final row-spacing retune; after it the suite matrix and the 300-seed reachability check were re-run green. The final whole-branch review then swept the final course: seeds 13–112 × 3000 m from the start, seeds 5–104 × 1500 m from just past the cap and seeds 1–60 × 1500 m from half the cap distance, 0 deaths on every difficulty; and 40 seeds × 30 km from the start on every difficulty, 1 death (Hard seed 13, a zigzag block at 27,951 m), which a beam search with the real simulation found passable from four of the bot's own states between 27,700 and 27,930 m.
- **Density** over 1–6 km at course speed, seeds 1–24, clear zones included: 0.867 / 1.214 / 1.476 blocks/s and 0.491 / 0.613 / 0.686 rows/s (Easy / Medium / Hard), against suite thresholds of 0.6 / 0.9 / 1.3 and 0.35 / 0.5 / 0.65 pooled, with every seed at 85 % or more. The old game averaged about 0.4 blocks/s.
- **Flights.** Real `model.step` driven by the bot, seeds 1–40 × 3, from the start to 4 km past the cap (1998 km): 844 / 1020 / 1225 flights of 1 cm or more; at most 0.958 s in the air; at most 0.40 m above the take-off road; at most 2.58 m above the road beneath on crests and dips and 4.0 m on drops; longest 38.3 / 47.5 / 57.9 m. No landing within 12 m of a block, 0 of 1757 gates entered airborne, and every flight inside the generator's predicted zones (least slack 0.517 m before take-off, 0.568 m after landing). A replica at 8 step phases (seeds 1–200 × 3, 122,283 flights) found only 10 skims of 0.6–5 mm outside the zones. This sweep ran before the final row-spacing retune; the road is unchanged by it, and block clearance of flight zones is enforced by the generator. Before the height cap the longest flights were 61 / 82 / 121 m with apexes up to 10.8 m, and 8 crossed arch roofs.
- **Speed.** Every difficulty is slower than the old curve at 30 s and 60 s, never decreases, and reaches exactly 40 / 50 / 62 m/s. Integrating `course.speed` at 1/120 s on seeds 1–8 (documentation review, scratchpad `docreview/speed.ts`): speed at 60 s is 11.84–11.88 / 15.04–16.34 / 18.25–19.88 m/s, and the cap is reached after 7.83–8.31 min (11.03–11.72 km) / 6.90–7.37 min (12.27–13.10 km) / 6.26–6.70 min (13.64–14.73 km) on Easy / Medium / Hard. A gate adds its gain permanently (still higher 10 s later) and adds nothing at the cap. A crest that curves away faster than gravity launches the ball at 30 m/s (Hard) and at the cap on every difficulty, and it lands and runs on; gates and steering reversals on banks never launch it.
- **Records.** `dayKey` and `weekKey` round-trip and land on Mondays for every day of 2026 at 7 local times in 5 time zones (12,775 dates), checked against a UTC oracle.
- **Mutation checks.** 6 of 6 records mutations, 10 + 9 model mutations, 6 + 1 course flight mutations, 3 minimum-gap mutations, and 6 UI mutations (reduced-motion scale, double commits from dying or Game Over, focus, restore refocus, canvas tab order) each fail a test.
- **Generation.** The suite bounds 20 km of Hard course at 1 s (measured 108–155 ms). A cold first course took 72–88 ms on a quiet machine before the last flight changes; after them it was 149 ms CPU and 186 ms wall (median of 8) under load average 13–15, against the plan's 150 ms target. A quiet re-measure of the final code was not made.

### Rendering and frame timing

Draw calls and geometries from `renderer.info` (`data-draw-calls` / `data-geometries`), identical at 390×844 and 1366×768: fresh warm-up straight 6 / 3; mid-course straight (Medium seed 4, 2375 m, 22 m/s) 7 / 3; Hard seed 5 gate 0, approach 7 / 3, inside the arch 7–8 / 3, after the exit 6–7 / 3. The budget is 11 / 4.

RAF over 45 running frames, median / p95 ms, two runs each:

| Viewport | Warm-up straight | Mid-course straight | Gate approach and arch |
| --- | --- | --- | --- |
| 390×844 | 100 / 183, 100 / 200 | 117 / 200, 100 / 200 | 117 / 217, 100 / 200 |
| 1366×768 | 183 / 417, 183 / 333 | 167 / 300, 200 / 400 | 200 / 383, 183 / 350 |

Idle pages in the same browser run at 16.7 ms, so this is SwiftShader rasterising WebGL on the CPU. An alternating A/B of production builds on the warm-up straight measured main `ceb61e3` (7 / 3) at 117 / 217 and 117 / 133 ms (390×844) and 183 / 317 and 183 / 217 ms (1366×768), and this branch (6 / 3) at 100 / 200 twice and 200 / 367 and 200 / 350 ms: about the same rate as the old renderer. The offline check (production build, reduced motion, 390×844) measured a median of 100 ms. These are local software-rendering observations, not frame rates for any device.

Renderer allocation, measured by heap sampling while the road rebuilds every frame, in two independent runs (the implementer's and the polish reviewer's): 193–236 KB per render before the polish round, about 47–76 KB after (47–66 and 52–76 KB). The burst floor fix left 0 of 358,046 fragment corners below the road in 126 real block deaths (68,624 before), and 0 % of the burst hidden by the road at both sizes (2–22 % before).

### Evidence

`BALL_RUN_EVIDENCE=1 CHROMIUM_PATH=… PLAYWRIGHT_BROWSERS_PATH=… npx playwright test tests/games/ball-run --project=chromium --workers=1 --output=…`: 27 passed (5.0 m). Screenshots are written only with `BALL_RUN_EVIDENCE` set and only by Chromium, so the set is one engine at one pixel ratio (1×, CSS size); the previous committed set had been a 2× WebKit mix. In `tests/games/ball-run/evidence/`, checked by eye:

- Running: [390x844](../../../tests/games/ball-run/evidence/390x844.png), [844x390](../../../tests/games/ball-run/evidence/844x390.png), [1366x768](../../../tests/games/ball-run/evidence/1366x768.png), [1920x1080](../../../tests/games/ball-run/evidence/1920x1080.png), [667x330](../../../tests/games/ball-run/evidence/667x330.png), [568x320](../../../tests/games/ball-run/evidence/568x320.png).
- Setup: `setup-<size>.png`; Game Over: `over-<size>.png`, same six sizes.
- Moments: [curve](../../../tests/games/ball-run/evidence/curve.png) (road curving toward a gate arch), [boost](../../../tests/games/ball-run/evidence/boost.png) (Hard, inside the arch: chevrons, Speed Up, trail), [collision](../../../tests/games/ball-run/evidence/collision.png) (burst against a block), [results](../../../tests/games/ball-run/evidence/results.png) (Hard Game Over with Today and Week NEW), [procedural-restart](../../../tests/games/ball-run/evidence/procedural-restart.png).

Comparison with the reference: the side-by-side sheets were made during the renderer task, not from this final set. `final-compare-reference.png` set eight moments (straight, read the hazard, arch ahead, enter the boost, drop and flight, bank, curved ribbon, sphere breaks) against pages 02, 03, 04 and 06, and `rec-compare-reference.png` set the straight, gate and death shots at three sizes against pages 02 and 03 (both in the session scratchpad, not the repository). The straight keeps page 02's composition and the boost arch matches page 03's third frame; the setup and Game Over panels were not on the sheets; their white-on-colour buttons follow page 05, and the HUD sits where page 06 places it. That comparison was not repeated after the later renderer changes (polish round, burst floor fix); the final set above was only checked by eye.

`ramp-gap.webm` in the same folder shows the pre-redesign ramp course. The current spec no longer writes it; it is kept because `docs/DELIVERY.md` and `docs/GAMEPLAY_CORRECTIONS.md` link it. Those checkpoints and `docs/FLAPPY_BALL_RUN.md` also link screenshots by the names above; those files now show the redesign, and the earlier images are in git history (for example at `ceb61e3`). This checkpoint's Playwright videos were not added to the repository.

### Real failures found and corrected

- The plan's literal bot (P-controller on a backtracked line) died on every matrix test: it flip-flopped around blocks and ignored the 0.1 s steering lag and bank drift. Two later Hard cap deaths (seeds 39 and 89, and 37 at 3 km) came from re-plans losing the line; reuse and beam fallbacks fixed them, with a regression test.
- The independent reachability test caught a generator bug: a row's pass started at the first block's widened front, skipping its cut (Medium seed 18, a 0.126 m route). Stress seeds then showed dead-end slivers; every route narrower than 0.25 m is now pruned.
- Long blocks on steep banks sat up to 0.124 m into the road; the lift is now exact for vertical clearance (0 sunk or floating in 176,819 blocks).
- A gate's speed jump read as a launch; lift-off now comes only from road curvature. Crests almost never launched (1 of 621); after unscaling their length, flights reached 121 m and passed through arch roofs; height caps, flight zones, gate deferral and crest/dip-to-straight substitution followed, each with failing tests first.
- Renderer: chevrons pointed backward; on an edge fall the camera drove into the towers; landscape horizontal FOV reached 96–108°; reduced motion still tilted the camera in landscape falls; burst fragments sank into the road.
- UI: the score throttle could be bypassed; the shell's reduced-motion transition rule froze Game Over at opacity 0 under the test clock; the HUD sat under the pause button at 1920 px; short landscape panels clipped; a restored Game Over kept the setup prompt as its status; the legacy note pushed Play out of view at 568×320; the speed readout fell to 1.37:1 over arch bars; and a Restart test passed without reaching its guard.

### Limitations

- No physical device, touch hardware or GPU was tested. All frame timings are software WebGL in a container; touch is Chromium CDP emulation.
- The bot is not a complete oracle. Before the final retune, continuous drives from the start to 4 km past the cap killed it twice in 120 runs (Medium seed 37 at 10,247 m, Hard seed 33 at 14,602 m); reachability stays open there and the bot survives from placed starts before both. On the final course, 30 km drives killed it once in 120 runs (Hard seed 13 at 27,951 m), and a beam search found that spot passable from the bot's own earlier states. These are planner limits on very long drives, not course faults.
- The generator's reach model ignores the 0.1 s steering lag. The 0.7 safety factor and the bot, which models it, are the evidence.
- Residual garbage: about 47–76 KB per render while the road rebuilds (two independent heap-sampling runs) (boxed doubles, `Math.hypot`, `course.sample`), about 150–200 B per simulation step inside `course.ts`, and about 1.5 KB per frame more during the 0.9 s burst.
- Hard rows/s headroom is small: 0.686 pooled against the 0.65 threshold, and the worst seed is at 89 % against an 85 % floor. Any change that adds clear road can fail the density test; retune Hard's `rowInterval` if so.
- Cold course generation may exceed the 150 ms target under heavy load.
- Stills show composition, not continuous motion; no WebM of the new course is committed. White button labels keep the reference look and stay below 3:1 against the amber and green fills by strict WCAG; a dark edge carries the contrast. In narrow landscape views the reduced-motion trail shows about as many spheres on screen as the normal one (2 against 2.26 mean), although it is shorter.
- The Blockcraft performance test above fails on this machine on main as well.
