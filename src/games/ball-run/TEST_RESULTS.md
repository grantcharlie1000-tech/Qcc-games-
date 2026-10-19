# Ball Run correction verification

2026-10-19, isolated worktree `.worktrees/correction-ball`. Local Vite URL `http://127.0.0.1:4194/#/game/ball-run`. Parent shared viewport commit `6e0b12d4a94b24efed18ce75ae837f31e8dc38ec` was cherry-picked locally as `a1d8e89` for integration checks; it is excluded from the game handoff.

## Checks

- Focused deterministic tests: 9 passed. Traverses 1200m over four seeds without a jump action, observes airborne flight and at least 12 landings per seed, verifies continuous chunk seams over 12 seeds/99 seams, ramp takeoff and gravity landing, smooth speed boost/recovery, frame-rate-independent steering, real edge fall/loss freeze, sphere/block collision vs clear center navigation, exact airborne v2 restore, and v1 distance/best/seed migration.
- Full unit suite: `npm test` — 17 files, 229 tests passed.
- `npm run check`, `npm run build`, `git diff --check` — exit 0. Build manifest retains Ball Run as a dynamic game entry; no Three import added to the homepage.
- Existing unmodified cover: SVG validator — 1 passed, 0 failed.
- Focused Chromium: `ARCADE_URL=http://127.0.0.1:4194 npx playwright test tests/games/ball-run --project=chromium --workers=1` — 8 passed in 39.4s. After the final city depth-offset/player-relative camera refinement, the focused gap/drag/held-key/projection test and all three viewport captures passed again: 4 passed in 16.8s (`--grep 'real restored|perspective'`).

Browser cases use the actual routed module: drag and held-key steering, pause freeze, held-key Study interruption, restart, explicit restore, old-canvas context disposal and re-entry, native Chromium touch drag/cancel followed by keyboard steering, actual acceleration and ramp gap flight/landing without jumping, full-view aspect/overflow at 390×844 / 844×390 / 1366×768, deliberate WebGL loss/save/re-entry, and unavailable-WebGL fallback preserving a seeded 58m save.

## Evidence

`tests/games/ball-run/evidence/` contains active-running screenshots at all three requested viewport sizes and an actual Playwright VP9 WebM recording (`ramp-gap.webm`, 390×844, 9.12s). Source references are not distributed. The recording contains actual mouse drag, held keyboard steering, acceleration, ramp launch, gap crossing, landing and continued rolling.

Current screenshots place the ball center at .6833–.6842 of viewport height. Independent pixel-mask analysis of the full magenta silhouette finds width/height .9688–.9764, consistent with a round perspective sphere; actual canvas dimensions and camera aspect are also asserted. The test projects the ball center and requires vertical position .60–.78. Final player-relative tracking adds an on-screen horizontal projection assertion after held-D input and gap traversal.

Viewed the actual recorded gap sequence: this caught ball clipping under valid lateral steering, which centered screenshots alone missed. The final camera follows the player laterally and vertically while retaining real fall visibility. Solid city faces receive polygon depth offset so coplanar wire grids stay readable with antialiasing disabled.

## Real failures corrected

The revised model tests first ran against the old implementation: 8 failed, 1 existing steering test passed. They passed after the terrain/kinematics change. The original mandatory-jump test is replaced by launch/airborne/landing and long-course non-jump traversal coverage.

The first browser run had 6 passes / 2 failures: unavailable-WebGL fallback overwrote an existing 58m save with 0m because restore was a no-op; and the global button display rule overrode the hidden Start button after context loss. Both were reproduced and fixed, then the suite passed. Actual screenshots exposed fixed camera height raising the ball into the upper half on ramps; actual video exposed lateral clipping; both informed camera corrections. Half-metre longitudinal grid stair-steps were replaced by connected endpoints along the curved road.

## Rendering observations and limits

The running scene reports **7 draw calls, 3 geometries**. Road/grid/obstacle/gate instance buffers and the city buffers are reused, not allocated per frame. No shadows, postprocessing or custom shaders.

Chromium is `/usr/bin/chromium` with ANGLE SwiftShader software WebGL. Final recorded sample of 44 RAF intervals: median **66.7ms**, p95 **133.3ms**. The preceding full 8-case run recorded median50/p95116.7ms. A separate 60-interval sample without recording measured median **66.7ms**, p95 **116.7ms**. Earlier antialias-enabled samples varied from median16.7/p95133.3ms (recording) to median100/p95183.4ms (no recording). Original `antialias:false` was retained to reduce software-GPU cost. These are local observations with highly variable load, not a hardware benchmark or a promised frame rate.

Only reference stills are available; original continuous timing is unverified. Native browser touch emulation is not physical-device evidence. WebKit and real mobile/Chromebook GPUs were not tested. Parent owns final all-game/offline/root/subpath checks, independent integration review, and production deployment. No runtime dependency or shared file is part of the game-only handoff.


## Procedural follow-up checkpoint

Base main: `375e250`. Branch: `feat/flappy-ball-run`. See [complete evidence and limitations](../../../docs/FLAPPY_BALL_RUN.md).

- `npm test`: 266 passed across 23 files (23 focused model tests across Flappy and Ball Run).
- `npm run build`: strict TypeScript, Vite and offline manifest passed (69 local files).
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright npx playwright test tests/games/flappy-bird tests/games/ball-run --project=chromium --workers=1 --output=/tmp/qcc-green-browser`: 17 passed in 1.2m; system Chromium 154, software WebGL, system FFmpeg.
- Both changed games passed offline at `/` and `/Qcc-games-/` on the final physics build. The compact 320px overlay CSS was then verified in the final focused run/build. All 13 games also passed offline before the final collision refinement.
- Original SVG validation and diff whitespace checks pass.

Exact browser/unit/build/seeded red-green/baseline outputs and offline JSON are in `docs/evidence/flappy-ball-run/`. Screenshots are in each game's `tests/games/<id>/evidence/`.

The broad suite has 147 passes and three failures also reproduced on unchanged main: Block Fill drag tests at lines 19 and 74 and Tower's 30-second tall-tower test at line 47. No unrelated code was changed. WebKit remains unavailable: the browser installer stopped at a prohibited FFmpeg download (HTTP 403 Domain forbidden); installed local Chromium/FFmpeg were used without bypassing network restrictions. No physical hardware testing is claimed. No external publication occurred.
