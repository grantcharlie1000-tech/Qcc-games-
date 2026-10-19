# Water Sort verification

Executed 2026-10-19 in `/workspace/Qcc-games-/.worktrees/water-sort` on branch
`game/water-sort`, using the isolated Vite server on port 4182. No shared source,
configuration, dependencies or lockfile is included in the specialist commit.

## Actual commands and results

| Command | Observed result |
| --- | --- |
| `npx vitest run tests/games/water-sort` | **52 passed**, 3 files: rules 10, solver/level construction 21, session/restore/hints 21. |
| `npm test` | **56 passed**, 4 files, including the shell's 4 storage tests. |
| `npm run check` | `tsc --noEmit`, exit 0. |
| `npm run dev -- --port 4182` | Vite served this worktree at `http://127.0.0.1:4182`. |
| `ARCADE_URL=http://127.0.0.1:4182 npx playwright test tests/games/water-sort --project=chromium` | **6 passed**, using `/usr/bin/chromium`; corrected-goal full run **23.9s**. |
| `ARCADE_URL=http://127.0.0.1:4182 npx playwright test tests/games/water-sort --project=chromium -g 'keyboard'` | **1 passed**, 7.0s, after the keyboard motion guard. |
| `ARCADE_URL=http://127.0.0.1:4182 node tests/games/water-sort/measure.mjs` | Wrote desktop screenshot, serialized real tube SVG and `measurements.json`; results below. |
| `bash .agents/skills/svg-skill/scripts/validate.sh tests/games/water-sort/evidence` | **1 SVG passed, 0 failed** (`tube.svg`, extracted from the actual rendered tube). |
| `git diff --check` | Exit 0. |

## What the tests actually exercise

- Literal pure-rule checks for contiguous top-run pours, partial transfer into
  remaining capacity, immutable input, mismatched tops, empty sources, full
  targets, invalid/self indices, homogeneous partial-tube wins, mixed-tube false
  wins and an empty-board false win. The queue-budget regression proves child
  generation stops once the admitted-state budget is full.
- Reproducible reverse construction, colour-volume conservation, nine distinct
  levels, and replayable reverse witnesses. A separate test BFS independently
  solves **every shipped level**, without production move, goal or search calls.
- Runtime solution replay, strictly decreasing repeated hints on all nine
  levels, plus seeded legal walks and valid current-state hints/restoration.
- Pending moves commit only after elapsed animation time, exactly once. Pause
  ignores a 10,000ms advance. Restart cancels pending moves while retaining pause.
  Undo returns the exact previous board. Restore clones legal history and
  rejects malformed data, colour/volume violations, forged transitions,
  unearned victories and forged moves after victory.
- Browser test 1: genuinely click an illegal destination, use visible hints to
  solve the puzzle, verify single-colour tubes including a partial tube, undo the win, win again,
  advance a level, change a level and restart real progress.
- Browser test 2: start a real animated pour, pause before commit using a
  controlled Playwright clock, advance paused time, verify no board change,
  resume and verify exactly one completed move.
- Browser test 3: make a real pour on a Deep level, reload and verify exact board,
  level and undo restoration; exit/re-enter three times; verify one callback per
  pour and no page errors.
- Browser test 4: use all difficulty tiers, native arrow-key focus and Enter/Space
  selection to pour; open/read/close the actual shell rules dialog.
- Browser test 5: drag with real mouse down/move/up and observe a legal pour;
  malformed local save data safely starts a new puzzle.
- Browser test 6: Chromium touch emulation performs taps, toggles colour-blind
  patterns through the real menu, checks labelled tubes and 366px width/no
  horizontal overflow, uses a real hint and captures the phone screenshot.

The core suites were observed red against stubs before implementation. A later
restore-after-victory regression was observed failing (1 failure / 20 passes),
then fixed and rerun. The corrected partial-tube goal and queue-budget regressions
were also observed red before the 52/56 passing totals. One initial browser
pause test used an advancing clock and allowed the pour to finish before the
pause click; freezing virtual time removed that test race. A later verification
attempt encountered six `ERR_CONNECTION_REFUSED` navigation failures after the
execution transport had closed the long-running Vite process; restarting the
isolated server and rerunning produced the successful results above.

## Evidence and measured limits

- `tests/games/water-sort/evidence/chromium.png`: full-page phone capture at
  **390×844**, real Flow board, colour-blind patterns and a real hint.
- `tests/games/water-sort/evidence/chromium-desktop.png`: full-page **1366×900**
  viewport, Deep level 9 with seven tubes in one row.
- `tests/games/water-sort/evidence/tube.svg`: serialized actual in-game SVG,
  validated with the local SVG skill's validator.
- `tests/games/water-sort/evidence/measurements.json`: actual Chromium
  `HeadlessChrome/154.0.0.0` measurements. Shortest BFS routes:
  **2, 4, 4, 6, 8, 10, 12, 12, 12**. Latest per-level search times ranged
  **0.4–16.2ms** while other specialists shared the machine. Forty observed RAF
  intervals averaged **16.66675ms**, maximum **16.8ms**. This measures this headless
  environment and does not claim physical Chromebook or phone performance.

WebKit was **not run**: `webkit.executablePath()` resolved to
`/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`, and `existsSync` returned
false. Touch is browser emulation, not a physical touchscreen check. Full
production/offline/subpath integration and final coordinated cover replacement
belong to the parent integration pass. No missing dedicated solver skill is
represented as present; see SKILL_USAGE.md for the exact registry and docs.
