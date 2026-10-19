# Ball Run verification

Date: 2026-10-19. Isolated worktree `.worktrees/ball-run`, browser URL `http://127.0.0.1:4190/#/game/ball-run`.

## Executed checks

- `npm run check` — exit 0 after final lifecycle/input change; TypeScript strict check passed.
- `npx vitest run tests/games/ball-run` — 1 file, 8 tests passed. Deterministic geometry bounds over 12 seeds × 600 section samples; center-following navigation for 1200 metres over four seeds; 30/144Hz steering equivalence; edge fall/loss; jumping vs missing a gap; block collision vs jumping; airborne continuation; valid/invalid restore.
- `npm test` — 2 files, 12 tests passed (8 Ball Run plus 4 existing storage tests).
- `ARCADE_URL=http://127.0.0.1:4190 npx playwright test tests/games/ball-run --project=chromium` — final run 4 passed in 14.7s using installed `/usr/bin/chromium`, software WebGL flags from shared config. Actual hash-routed game; no imported model standing in for browser gameplay.
- `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art/ball-run` — 1 SVG passed, 0 failed.

Browser coverage: explicit start; instructions dialog; real arrow steering; keyboard steering after pause focus changes; pause freezes both distance and steering; jump creates airborne saved state; held pointer steering leads to falling loss; Roll again; restart while paused; exact distance restore; explicit Continue after rules on a restored run; dispose/re-entry; native Chromium touchscreen hold, drag, and Jump tap; gap crossing with actual Space key; no horizontal overflow at 390px; unsupported WebGL fallback. No page errors in lifecycle case. Disposal is checked on the retained old canvas with `WebGL2RenderingContext.isContextLost()` after leaving.

Screenshot: `tests/games/ball-run/evidence/chromium.png`, 390px phone viewport, active descent at 58 metres with the upcoming warning-striped gap and an orange block visible. Screenshot inspected visually: 3D perspective road, rolling striped sphere, neon edge strips, readable distances, touch targets and no clipping.

## Measured rendering evidence

Renderer diagnostics in the actual scene report **9 draw calls, 4 geometries**. Geometry is allocated once; advancing updates fixed InstancedMesh matrices, not mesh creation. Last passing run sampled 44 consecutive RAF intervals while the game was running: median **16.7ms**, p95 **16.7ms**. Earlier passing runs under concurrent machine load measured median 33.3ms / p95 66.7ms and median 16.7ms / p95 83.3ms. These are short local observations, not hardware benchmarks or a guaranteed frame rate. Chromium uses ANGLE SwiftShader software WebGL in this container; no physical Chromebook or mobile GPU was tested.

## Environment issues resolved during verification

The first E2E attempt failed to load Three because multiple worktrees shared `node_modules/.vite`: the optimized dependency URL returned HTTP504 “Outdated Optimize Dep”. An isolated server was launched with Vite `createServer({cacheDir:'/tmp/ball-run-vite-cache', server:{port:4190,strictPort:true}})`; the parent subsequently added worktree-local `.vite-cache` in shared config. No shared config was edited by this specialist. One in-flight test encountered a full-page HMR reload during that parent config update; the clean final run passed.

A native-touch test initially held directional input too long through slow polling, drove off the road, then tried to jump after falling. RAF-based movement predicates and an independent grounded jump check replaced the timing-sensitive sequence; actual touch path passes. A real keyboard-focus bug after pause was fixed and covered. Restored runs now retain an explicit start gate even when a rules dialog is opened and closed.

## Limits and integration ownership

WebKit was not executed; this assignment required the configured Chromium project, and no claim is made about unavailable engines. Parent owns integrated root/subpath build/offline checks, shared shell, final all-game screenshots and independent code review. Parent is replacing the cover in its common SVG redesign after integration. No known gameplay blocker remains in the tested Chromium environment. WebGL2 unavailable produces a helpful visible fallback, and device/context interruptions require leaving and reopening to continue the saved run.
