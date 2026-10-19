# Color Connect verification

Environment: isolated worktree `/workspace/Qcc-games-/.worktrees/color-connect`, Node/Vite with shared installed dependencies, own Vite server at `http://127.0.0.1:4189`, 2026-10-19. No dependency install, shared code edit or extra agents. Parent-provided `.vite-cache` setting and node_modules symlink remain unstaged.

## Fresh checks

- `npm run check`: TypeScript strict check passed, exit 0.
- `npx vitest run tests/games/color-connect`: 11 game tests passed. They cover orthogonal legality, wrong endpoints, overlap/crossing/jumps, self-backtracking, endpoint redraw, trail trimming, all-pair AND full-coverage completion, deterministic seeded generation with coverage witnesses, every shipped level solved by endpoint-only CSP, first hint revealing an edge, hints preserving current prefixes and requiring proven backtracking, search-budget uncertainty, fast grid interpolation and malformed snapshots/history, including sparse unknown arrays that JSON cannot represent. Separate exhaustive complete-path enumeration agrees with the CSP for all 378 canonical 3×3 two-pair endpoint boards.
- `npm test`: 15 tests passed across 2 files (11 game + 4 existing core storage tests), exit 0.
- `ARCADE_URL=http://127.0.0.1:4189 npx playwright test tests/games/color-connect --project=chromium`: 10 passed in the final run (full output captured in evidence/chromium-e2e.txt). Tests use the actual hash route and public UI, including a hand-checked complete first-board solution drawn through mouse input. Additional lifecycle test mounts the real module with a context and exercises pause/restore/dispose; no production debug hooks exist.
- `bash .agents/skills/svg-skill/scripts/validate.sh tests/games/color-connect/evidence/board.svg`: 1 passed / 0 failed. Python ElementTree also parsed the actual serialized SVG successfully.

The first rule-test run deliberately failed all nine then-unimplemented behaviors. The initial browser test failed because the game/board did not exist. A later first-hint regression failed with one occupied path cell instead of two, then passed after hints began revealing an actual edge. Independent review identified a live-gesture save inconsistency: the exact held-final-mouse-gesture regression failed with an empty completion list, then passed after snapshots began projecting the full pending transaction. It also proves repeated serialization is stable, restored undo removes that gesture, and redrawing the same solved puzzle never duplicates its award. The reviewer’s sparse-array restore case also failed before dense validation rejected holes in completion/history arrays. A trusted pointer-to-keyboard focus regression failed because the actual focused cell stayed at the drag origin; gesture completion now synchronizes focus to the trail tip only when focus is already inside the grid, and the regression also verifies that hint-toolbar focus is preserved. These were feature red/green runs; final totals below reflect the completed implementation.

## Browser evidence

Chromium `/usr/bin/chromium`, browser user agent HeadlessChrome/154.0.0.0. `tests/games/color-connect/evidence/chromium.png` is an actual 390×844 capture showing two drawn matching paths, original shaded wells/trails/pegs, 69% coverage, semantic action controls and shape/letter legend. Inspected visually. At this viewport the parent stage is 366px wide. A 7×7 board has 49 cells, each at least 44px, with no horizontal document overflow.

Interactions: pointer drawing, full-board win/score/next puzzle, fast two-cell skip interpolation, wrong endpoints blocked, legal backtracking, start-peg redraw, erase, gesture undo, keyboard path creation, hint from an alternative current route, proven backtrack message, pause disabled controls and gated synthetic actions, restart while paused, validated restore, real saved reload, transactionally consistent save during a held final gesture with no award farming, repeated leave/re-entry, rules dialog, disposal without stale callbacks and zero pageerrors. Native touch uses Chromium CDP only behind `browserName==='chromium'`; portable mouse/keyboard tests remain available to WebKit.

Attempted `ARCADE_URL=http://127.0.0.1:4189 npx playwright test tests/games/color-connect --project=webkit -g 'actual pointer'`: failed before any test interaction because `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` is absent. No WebKit pass claimed; CI must install its engine. No physical touch-device, screen-reader or Chromebook hardware verification claimed.

## Deterministic shipped-board verification

| Puzzle | Board / pairs | Independent CSP nodes |
| --- | --- | --- |
| First light | 4×4 / 3 | 14 |
| Little bends | 4×4 / 3 | 16 |
| Four friends | 4×4 / 4 | 13 |
| Garden paths | 5×5 / 4 | 22 |
| Ribbon dance | 5×5 / 4 | 23 |
| Sweet circuit | 5×5 / 5 | 24 |
| Deep lagoon | 6×6 / 5 | 264 |
| Interwoven | 6×6 / 5 | 398 |
| Prism garden | 6×6 / 6 | 287 |
| Twilight maze | 7×7 / 6 | 622 |
| Seven seas | 7×7 / 6 | 1338 |
| Grand tapestry | 7×7 / 7 | 2046 |

All returned solved paths satisfy full coverage, endpoint matching and no overlap. Solver nodes are algorithm-specific evidence, not an exact measure of human difficulty. Boards progress in size and route complexity.

## Measured performance and scope

`tests/games/color-connect/evidence/performance.json` records an actual Chromium probe. Sixty idle requestAnimationFrame intervals: median 16.70ms, p95 16.80ms. Independent initial-board solves took 0.1–6.8ms in that probe. These are environment measurements, not physical Chromebook promises. The game creates no animation loop, timers, observers, audio resources or network requests. Drawing renders only on actions. Context owns sound; there is no decorative motion, so sound-off and reduced-motion settings need no private override.

Known limitation: hints use a deterministic 180,000-node budget (50,000 when checking candidate erasures). A difficult current prefix can return the truthful longer-search message instead of a step. It never follows an initial witness through occupied cells or calls a budget exhaustion impossible. This game has twelve finite replayable puzzles; changing puzzles resets that board's paths, while solved-puzzle awards remain distinct until full restart. Cover.svg is intentionally untouched and parent-owned.
