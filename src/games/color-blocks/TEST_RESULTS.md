# Block puzzle systems pack verification — 2026-11-05 UTC

Implements the reference pack's proposed scoring, move-counted combo, colour and all-clear rewards, constructive witness generator, reproducible saves and reward presentation. Chromium is the system build at `/opt/pw-browsers/chromium`; WebKit was not run.

| Checklist area | Evidence |
| --- | --- |
| Core mechanics | Existing mouse, touch, keyboard, invalid-drop and simultaneous-clear specs pass unchanged apart from the new score totals. `rewards.spec.ts` checks the projected-clear preview (24 lit cells for a three-row drop). |
| Generation | `fair-deal.test.ts` replays every stored witness from its deal-time board: 384 seeded sparse-to-dense boards and 30 consecutive trays for each of 10 seeds. Where a witness is partial, the independent exhaustive oracle confirms no full path exists. |
| Scoring | `model.test.ts` reproduces 24, 166 and 389, a crossing row and column (two lines, shared tile once), two colours gone with a survivor, and colour plus all-clear stacking (401) without double counting. |
| Combo | One and two plain placements keep the chain, the third resets it; save/restore leaves chain and pips unchanged. Browser test checks the pips drop from two to one. |
| Animation | Screenshots of preview, release (animations frozen for capture), settled board, drag during a fading celebration, reduced motion and the result card are in `tests/games/color-blocks/evidence/rewards-*.png`. |
| Consistency | `replay(seed, history)` twice gives identical state over 10 seeded runs. A mouse drop interrupted by pause saves exactly the state of the same keyboard drop with no effects. |
| Mobile / desktop | 390×844 and 1366×768: no horizontal scroll, tray clear of the dock. Existing 844×390 correction spec passes. |
| Performance / comfort | Clear plus immediate drag: no main-thread long tasks. RAF intervals in headless Chromium show 83–133 ms gaps, but a plain drag on the previous build showed the same gaps (p95 83 ms), so they come from Playwright's synchronous input dispatch. Reduced motion: no particles. Muted sound and tab backgrounding were not separately re-tested. |

| Command | Result |
| --- | --- |
| `npx vitest run` | 221 files, 4417 tests passed. |
| `npx tsc --noEmit`, `npm run build` | Exit 0. |
| `npx playwright test tests/games/color-blocks --project=chromium` | 26 passed. `correction.spec.ts` needed its video option switched off locally because ffmpeg is not installed here; the committed file is unchanged. |
| Shell specs: viewport, play-surface, festive, ingame-space, leaderboard sidebar | 59 passed. |

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

## Fair three-piece follow-up — 20 October 2026

Separate local branch `feat/fair-color-blocks`. The complete unit suite passes
274 tests; Color Blocks has 23 passing model/input cases and 18 passing Chromium
browser cases. The new native-input case fails on the original dealer and passes
on the bounded constructive dealer. New trays were independently solved on 384
seeded boards and through 300 complete trays. Root/subpath offline play and the
69-file production build pass. See `docs/FAIR_COLOR_BLOCKS.md` and its raw
evidence folder for bounds, fallback, measurements, save compatibility and
the local WebKit limitation. Exact-checkpoint Astra review precedes publication.
