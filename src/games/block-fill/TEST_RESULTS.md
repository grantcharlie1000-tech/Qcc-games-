# Verification evidence — 2026-10-19

Worktree: `/workspace/Qcc-games-/.worktrees/block-fill`, branch `game/block-fill`. Own Vite server: `npm run dev -- --port 4188`. No package, shared configuration or cover changes made by this specialist.

| Actual command | Result |
| --- | --- |
| `npx vitest run tests/games/block-fill` | 8 passed, 1 file; final rules run 66ms of test execution. |
| `npm run check` | Exit 0; strict TypeScript passes. |
| `npm test` | 12 passed, 2 files (8 Block Fill, 4 core storage), exit 0. |
| `ARCADE_URL=http://127.0.0.1:4188 npx playwright test tests/games/block-fill --project=chromium` | 6 passed in 29.8s, exit 0; final sequential run. |
| `bash .agents/skills/svg-skill/scripts/validate.sh tests/games/block-fill/evidence` | 1 SVG passed; 0 failed. |

The eight rules tests cover every shipped level's independently checked construction witness and a separate from-scratch completion search, determinism and increasing playable count, orthogonal legal/rejected moves, immediate backtracking, final-square completion, alternate solutions, valid/invalid/versioned/sparse snapshots, every witness-prefix hint, and interpolated horizontal/vertical/diagonal samples. An independent brute-force 3×3 enumerator checks all legal prefixes against the production solver and verifies both hint continuations and backtrack recovery.

The six Chromium scenarios perform actual mouse dragging with single-event straight runs across multiple cells, keyboard completion, Backspace/Undo, hint reveal, trapped-prefix hint recovery, Reset path, pause input rejection, restart while the shell is paused, native rules dialog, save/reload, malformed-save recovery, library exit/re-entry with one-step input checks, all twelve pointer-driven garden completions and the final win. Completion points remain earned through reset and reload and cannot be collected twice. Touch tracing uses real Chromium touch input via CDP `Input.dispatchTouchEvent` and is followed by mouse reverse tracing.

Screenshot: `tests/games/block-fill/evidence/chromium.png` at 390×844. Inspected visually: rounded green garden cells, continuous dimensional gold trail, numbered visits, visible start/head, count, readable controls and no horizontal overflow. Gameplay SVG captured from the live DOM: `tests/games/block-fill/evidence/gameplay.svg`; validates with the actual repository SVG script. Cover art remains parent-owned and untouched as explicitly directed.

Engine actually used: system Chromium `154.0.8037.57` at `/usr/bin/chromium`. A separate 60-frame RAF sample on this shared cloud container measured median 16.7ms and p95 16.7ms. The game itself has no RAF loop, timers, physics engine or GPU resources. These figures are browser/container observations, not Chromebook or physical touch-device performance claims.

Earlier failures and fixes are retained honestly: a purported dead-end unit fixture was actually solvable, so it was replaced with hand-checked `[0,1,4,7]`; the 3×3 center-start opener cannot dead-end, so the E2E trap scenario correctly uses garden two. Native dialog close/resume required an explicit resumed-state predicate before keyboard input. A sparse-array restore regression was reproduced and fixed by validating dense array values. One overlapping local Playwright rerun caused artifact-directory ENOENT cleanup errors; final verification is sequential.

Known limitations: twelve finite gardens; bounded hint search can recommend a verified earlier prefix rather than the minimum possible undo distance. Search-limit text never claims a mathematically proven dead end. WebKit is unavailable in this environment and was not claimed or tested. Touch hardware, production offline integration and parent cover replacement remain parent-level verification. No known gameplay defects after these checks.
