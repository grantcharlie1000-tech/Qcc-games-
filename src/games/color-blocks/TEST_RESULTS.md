# Gameplay correction verification — 2026-10-19 UTC

Isolated worktree: `/workspace/Qcc-games-/.worktrees/correction-blocks`, branch `correction/color-blocks`, baseline `6861106`. Parent viewport commit `6e0b12d4a94b24efed18ce75ae837f31e8dc38ec` was cherry-picked as `699bae8` solely for integration verification and is excluded from the game handoff. No dependency changes; local node_modules is an untracked symlink. Vite serves this worktree on port 4183.

| Verification | Result |
| --- | --- |
| `npm test -- tests/games/color-blocks/input.test.ts` before helper implementation | Expected missing-module failure; five hand-derived mapping cases written before implementation. |
| `npm test -- tests/games/color-blocks` | 15 passed: 10 unchanged model tests and 5 new coordinate tests. |
| `npm test` after parent shell integration | 233 tests passed in 18 files, no failures. |
| `npm run check` | Exit 0. |
| `npm run build` | Exit 0; 57-file offline pack. Parent performs final integrated offline/subpath validation. |
| Actual SVG skill validator | 9 passed: 7 generated cube variants plus the 2 existing public SVGs. Python XML parser also parsed all 7 generated variants. |
| `git diff --check` | Exit 0. |
| `ARCADE_URL=http://127.0.0.1:4183 npx playwright test tests/games/color-blocks --project=chromium --workers=1` | **17 passed in 42.0s**, 0 failures on final run, system Chromium. |
| Focused WebKit attempt, fresh keyboard selection | Browser launch unavailable: `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` does not exist. No WebKit result claimed. |

The model file is unchanged: integer placement, simultaneous row/column union, original combo scoring, seeded tray bag, save validation and game-over checks remain intact. Mapping tests independently check viewport translation, grabbed constituent offset, touch lift, current scale, invalid bounds and shape holes. Browser tests cover actual mouse/native CDP touch, keyboard, repeated keys, cancel/lost capture, Escape through Study, resize, pause, save/restore and colourblind/reduced-motion settings.

The first browser collection failed because Playwright's worker video option cannot be scoped inside a describe block; moving that option to file scope fixed collection. First real Chromium run passed 16/17 and exposed a genuine resize race: `pointerup` can arrive before the queued resize event/observer. The adapter now checks the gesture's starting board bounds synchronously against its current bounds on move/release and cancels changed geometry before placement. The failing interruption test passed on the complete final rerun. No browser failures remain in the final Chromium run.

Evidence (actual browser captures, visually inspected):

- `tests/games/color-blocks/evidence/correction-390x844.png` and `correction-390x844-drag.png`
- `tests/games/color-blocks/evidence/correction-844x390.png` and `correction-844x390-drag.png`
- `tests/games/color-blocks/evidence/correction-1366x768.png` and `correction-1366x768-drag.png`
- `tests/games/color-blocks/evidence/touch-lifted-preview.png`
- `tests/games/color-blocks/evidence/touch-drag.webm` — 390×844, 6.04s. Native CDP pickup/enlargement, offset preview, valid snap, invalid return, pointer cancellation, Escape/Study, live pause and keyboard continuation. A decoded video frame was also inspected.
- `tests/games/color-blocks/evidence/mouse-drag.webm` — 390×844, 2.04s. Real mouse pickup, full footprint and snap in the populated reference-comparison fixture.
- Existing `evidence/chromium.png` updated by the existing populated-mid-run lifecycle test.

All three layout tests assert a square board, top HUD clearance, tray bounds and no document horizontal/vertical scroll. Both mouse and native touch assert the exact ghost cells become the placed footprint. Invalid placements preserve move count; pointercancel, lost capture, Escape/Study, resize and live pause cannot place. The existing tests verify keyboard arrows/placement, same saved-board restoration/restart, simultaneous clears, no false game-over, colourblind/reduced-motion settings and repeated route disposal.

The existing lifecycle test sampled 45 **idle** RAF intervals (median 16.70ms, p95 16.80ms). This is only browser idle cadence, not active game performance or physical-device performance.

References are stills only; no supplied MP4 exists. No physical phone/trackpad, original timing parity, or measured device-performance claim is made. Parent owns independent review, full integration and deployment.
