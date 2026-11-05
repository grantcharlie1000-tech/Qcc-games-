# Pac-Man (maze-muncher): Christmas skin

## Skills invoked
- `game-development`: read `game-art/SKILL.md` (silhouette, staging, readability, colour hierarchy, "don't rely only on colour") and `2d-games/SKILL.md`.
  - Each snowman keeps its chaser colour as a large accent (beanie, scarf), plus the original shape marks.
  - Frightened and flashing states change the whole body colour, as in the original.
- `svg-skill`: the board is inline SVG. I followed its workflow:
  - Inline fragment inside the existing `role="img"` board, so no extra a11y elements.
  - Ids are scoped by the board prefix and are unique.
  - Removed an unused gradient.
  - Validated the live festive board, exported to a standalone file, with `bash .agents/skills/svg-skill/scripts/validate.sh` (PASS) and `xmllint --noout` (OK). Result: 7 ids, 7 unique.
- `verification-before-completion`.
- I did not invoke `animate`: no new motion. The bauble caps reuse the original power-berry blink (`mm-blink`) and stop with it under reduced motion and pause.

## What changed (files)
- `src/games/maze-muncher/christmas-art.ts` (new):
  - SVG Santa hat, mirroring `drawSantaHat`.
  - `snowPath()`: snow on every upward-facing wall edge, clipped to the wall outline so it never enters a lane.
  - Bauble gradients.
  - `snowmanMarkup()`.
- `src/games/maze-muncher/art.ts`, all behind `const xmas = christmas()` at board creation:
  - Extra defs and clip; a snow layer and an ice rim over `.mm-wall`.
  - Power berries filled with bauble gradients (inline style), with gold caps above the circle that hide with their dot.
  - Nib's antennae replaced by a hat; the lives tray icons get small hats.
  - Snowman markup instead of the wisp flame. The flame path's `d` is not rewritten in Christmas mode.
- `src/games/maze-muncher/christmas.css` (new):
  - Night maze, icy walls with snow, red ghost-house door, white snowball dots.
  - Snowman body, beanie and scarf in `var(--mm-wisp)`.
  - Frightened: blue body, navy accents, pale face. Ending: white with red. Reduced-motion calm outline. Colour-blind dark outline.
  - Red/cream frame ring, festive card, snowflake surround.
- `scripts/festive-evidence.mjs` (my line only): starts, runs left along the start row, reads the board's spoken aria-label to turn down at the corner, and eats a bauble. The shot shows frightened snowmen, with the same state before and after.

## Guaranteed unchanged
- `model.ts` is untouched.
- The SVG keeps every original element and class: `.mm-wall` path, 242 `.mm-dot` circles r=1.1, 4 `.mm-berry` circles r=3.4, wisp groups and classes, banner, tray.
- Dot and pellet positions and sizes are identical.
- The snowman footprint is about ±5 × −8.5…7.8 units, against the original flame's ±6.4 × −8…7 plus sparks.
- The hat replaces the antennae and reaches about 2 units higher than they did. It is decoration only.
- Eaten state uses the original eyes.

## Tests
- `npx tsc --noEmit`: no errors in my files.
- `npx vitest run tests/games/maze-muncher tests/core/festive.test.ts`: 2 files, 19/19 passed.
- Playwright `tests/games/maze-muncher` on :4600: 16/16 passed, including a re-run after the final SVG clean-up.

## Screenshots (inspected)
- `before-*` (:4601) and `after-*` (:4600) show the same moment: score 190, chasers frightened.
- `detail-snowmen-hat.png`: READY state. All four snowmen are distinct by beanie and scarf colour and marks; Nib's hat; snow-capped walls.
- `detail-frightened-snow-walls.png`: bauble, frightened snowman, snow clipped inside walls.

## Known limitations
- Bonus fruit are the original fruit.
- The outer wall band behind the lives tray is lighter than the original's near-black fill. The original has the same band in dark blue.
