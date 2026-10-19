# Verified results — 2026-10-19 UTC

Environment: isolated `game/color-blocks` worktree, Vite on port 4183, system `/usr/bin/chromium`, headless Playwright Chromium. No dependency installation or shared source/config edits were made by this specialist.

| Command | Fresh result |
| --- | --- |
| `npm run check` | Exit 0; TypeScript clean. |
| `npx vitest run tests/games/color-blocks` | 1 file, **10 tests passed**, 0 failed (08:55:37 UTC, 820 ms total). |
| `npm test` | **14 tests passed** in 2 files, 0 failed: 10 Color Blocks + 4 shared storage tests (08:57:04 UTC, 842 ms total). |
| `ARCADE_URL=http://127.0.0.1:4183 npx playwright test tests/games/color-blocks --project=chromium` | **9 passed**, 0 failed, 18.1 seconds; actual mouse, keyboard and trusted touch input. |
| `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art/color-blocks/spark.svg` | **1 passed**, 0 failed. |
| `git diff --check` | Exit 0, no whitespace errors. |

The first unit invocation before model implementation failed with missing-module resolution, as expected; the original nine deterministic rule fixtures then passed after implementation. A tenth test now exercises 20 seeds through up to 80 real moves each, preserving valid snapshots and deterministic continuation over tray boundaries.

## What the tests prove

- Crossing row/column clears are identified simultaneously, their shared cell is removed once, both lines count and the score is 41 for a one-cell two-line clear at streak one.
- Consecutive clears multiply line score; a no-clear move resets combo. Invalid/overlapping/fractional/out-of-bounds or already-used placements cannot mutate the state.
- All three slots must be used before refill. A shuffle bag presents each of nineteen shapes before repeating; a fitting piece can be moved forward from an otherwise blocked upcoming bag deal without discarding shapes.
- Legal-move detection examines every remaining piece, so an unplayable first shape does not cause false loss. A checkerboard with only isolated gaps genuinely ends when only a square remains.
- Snapshot validation rejects bad versions, dimensions, cell/shape values, invalid RNG, negative scores and duplicate bag entries. Defensive copies and future random sequence survive serialization.
- Mouse drag at 390px and 1000px: the exact highlighted indices `[18,19,26,27]` become occupied. Grabbing the square's bottom-right cell preserves its offset. Invalid overlap or outside-board drop leaves the move count unchanged.
- Keyboard places a square at `[9,10,17,18]`; pause rejects actions, route exit and full browser reload restore the same cells and score; restarting from pause empties the board and resets the move count.
- Trusted CDP touchStart/touchMove/touchEnd in a `hasTouch` mobile browser produces the exact same ghost/commit, followed by a real tap-select/tap-place action.
- Shell settings change colourblind marks and reduced-motion mode; rules are visible; malformed saved game is safely ignored. Three route exit/re-entry cycles leave exactly one game and a single keyboard placement increments moves once. No page errors were observed in this lifecycle scenario.

## Visual and performance evidence

`tests/games/color-blocks/evidence/chromium.png` is an actual full-page 390×844 Chromium capture after a real drag in a deterministic populated mid-run fixture. It shows original beveled gems and geometric marks, the banner's original SVG illustration, tray and labelled controls. Visually reviewed at phone size: no horizontal overflow, crisp SVG geometry, dark separated board cells and clear occupied/empty contrast. The 366px available stage fits; vertical page scrolling is available for controls on short screens.

The lifecycle/evidence test sampled **45 idle RAF intervals** in headless Chromium: median **16.70 ms**, p95 **16.70 ms** on the final run. This measures the current browser environment's idle refresh cadence, not active-render timing or physical Chromebook performance. The game itself has no RAF loop.

## Limits and known defects

No known blocking gameplay defects after these checks. WebKit is unavailable and was not run. Mouse events cover the normal trackpad pointer route, but no physical trackpad or mobile device was available. Touch was tested with trusted Chromium protocol input. Full offline packaging, root/subpath production hosting and all-game integration are parent-owned checks. The parent owns the replacement cover artwork; this branch intentionally leaves `cover.svg` untouched. Independent parent integration review is requested, not claimed completed. The test runner emitted only the environment's harmless NO_COLOR/FORCE_COLOR warning.
