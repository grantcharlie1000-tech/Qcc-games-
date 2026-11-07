# Minesweeper — Christmas skin

## Skills invoked
- `using-superpowers`: start of the work session (required by AGENTS.md).
- `svg-skill`: the five new SVG assets (viewBox, defs, `aria-hidden`, validated with `validate.sh`).
- `game-development` (and its `game-art/SKILL.md`): readability guidance (contrast by value, not hue alone; clear silhouettes), used for the snow and ground values and the coal and cane shapes.
- `systematic-debugging`: browser test timeouts (see Tests).
- No motion was added, so `animate` was not used.

## What changed (visual only)
- `src/games/minesweeper/christmas.css` (new; imported after `style.css`; every selector starts with `:root[data-festive="christmas"]`):
  - Winter-night surround: a midnight gradient with snowflakes on `.game-view` and `--game-surface`.
  - The board is an icy blue frame with a thin gold rim drawn as inset shadows inside the existing 3px padding, so its size is unchanged.
  - Covered tiles and flagged tiles are snow mounds (`xmas-snow.svg`, `xmas-snow-alt.svg`), which keeps the checkerboard rhythm.
  - Revealed tiles are flat, frosty, cool ground (`#dbe6ee` and `#cddbe6`). They read clearly lower than the snow.
  - Number hues are the classic ones, deepened. All eight are at least 4.6:1 on both ground colours; computed values are 4.63 to 12.10. The originals measured 4.06 to 10.53.
  - The exploded tile is warm red with a red ring. A wrong flag is pink snow with a red cross.
  - The Reveal/Flag switch, outcome text and result bar use the midnight, red and gold palette.
  - The settings dialog is left to the shared glass sheet.
- `src/games/minesweeper/index.ts`:
  - Imports `christmas.css` and `christmas()`.
  - `image()` returns the festive SVG when `christmas()` is true, and otherwise the original `public/game-art` file, byte-for-byte the same as before.
  - The triggered mine uses `exploded` only when `christmas()` is true.
- New art in `src/games/minesweeper/`:
  - `xmas-flag.svg`: a candy cane with holly, used on the board and in the Flag mode button.
  - `xmas-coal.svg`: a faceted lump of coal.
  - `xmas-coal-lit.svg`: coal with glowing ember cracks and sparks, for the exploded mine.
- `scripts/festive-evidence.mjs` (minesweeper entry only): reveals the centre tile, then flags three covered tiles. It uses right-click on desktop and Flag mode with taps on touch.
- `public/game-art/**` and the cover art are untouched.

## Guaranteed unchanged
- Model, rules, first-click safety, chording, scoring, rankings, stats, saves, timer, settings dialog and touch Reveal/Flag gestures. None of these were touched.
- Tile size, board padding and layout: only colours, backgrounds, inset shadows and `img` sources changed. Mode-switch icon is 24px instead of 22px, inside the same button.
- ARIA labels and `data-state`/`data-visual` logic are the same.

## Tests
- `npx tsc --noEmit`: no errors in minesweeper. During one run there was an unrelated error in `src/games/fruit-merge/art.ts`, which belongs to another agent.
- `npx vitest run tests/games/minesweeper tests/core/festive.test.ts`: 3 files, 32/32 passed.
- Playwright on :4600 (`--output=/tmp/claude-0/pw-minesweeper`):
  - Runs gave 13/18, 15/18 and 14/18 passed. The failures were `locator.click`/`evaluate` timeouts opening `#game-menu` while the previous shell menu was still closing (`menu.spec:4`, `play.spec:17/36/60/87`), and the failing set changed from run to run.
  - Same suite on the pristine :4601: 18/18 passed.
  - Isolation on :4600: `play.spec:17` with the original theme forced (`originalTheme`) failed 2 of 3 runs. With the Christmas theme it passed 2 of 3.
  - With `index.ts` temporarily restored to HEAD (no Christmas import at all), `play.spec:17`+`:36` failed in 2 of 3 runs.
  - So the timeouts are in the shared shell or concurrent load on :4600, not in this skin. No tests were changed.
- Final full run after the last art change: 17/18 passed on :4600.
  - The failure was `play.spec:87` at line 99: a flagged count after the pinch, where a long hold fires under load.
  - That test then failed identically on pristine :4601 (1/1) and again on :4600 (1/1).
  - It is pre-existing and timing-dependent, not caused by the skin.

## Screenshots (inspected)
- `before-*.png` (from :4601) and `after-*.png` (from :4600): active play with the centre revealed and three flags.
- `compare-mobile.png`: before and after side by side.
- `detail-candy-flags.png`: cane flags on snow at phone size.
- `detail-lost-board.png`: a lost desktop board with coal, the exploded ember coal and two wrong flags with crosses.
- `detail-coal-exploded.png`: a close-up of that board.

What I checked:
- Covered and revealed tiles are clearly distinct on both viewports.
- Numbers are crisp.
- The triggered mine is clearly marked.
- Dark dock glass stays legible on the dark surround.
- No clipping or seams around the board.

## Known limitations
- If the theme is toggled mid-game, tiles already rendered keep their old image until their state changes. This is the existing `data-visual` cache; a remount refreshes them.
