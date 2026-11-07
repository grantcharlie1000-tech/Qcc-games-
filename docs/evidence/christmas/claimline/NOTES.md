# Claimline: Christmas skin

## Skills invoked
- `game-development`: read `game-art/SKILL.md` (readability, value contrast, hierarchy) and `2d-games/SKILL.md`, plus the orchestrator's performance budget and caching anti-patterns.
  - These drove the choices of cached textures, viewport culling and a single human-only hat.
- `systematic-debugging`: for a measured frame-cost regression (below).
- `verification-before-completion`.
- I did not invoke `svg-skill` (no new SVG; HUD marks keep the existing inline markup with festive colours) or `animate` (no new motion).

## What changed (files)
- `src/games/claimline/christmas-render.ts` (new):
  - `FESTIVE_LOOK` palette. Same hue families and player order as the original so bots stay recognisable: You red `#d8263a`, blue, green, gold, plum, ice cyan, gingerbread.
  - Glowing bulb sprites, built once per mount.
  - Snowflake texture at device resolution, rebuilt only when the cell size changes.
  - Light-string trails: the original 1.5-cell band as a soft glow, a dark wire on the centreline, and owner-coloured bulbs every 1.2 cells measured from the trail start, culled to the viewport.
  - Candy-cane arena ring, stroked only while the edge can be on screen.
- `src/games/claimline/render.ts`:
  - Colours go through a `Look`, chosen once per renderer by `christmas()`. `ORIGINAL_LOOK` holds the original constants, so the original branch draws the same.
  - Festive branches for the outside, trails and ring.
  - The human head gets an upright Santa hat above it (drawn in a 1/24-cell frame because the helper uses pixel units), which makes "You" easy to find.
  - `markSvg` uses the active palette.
- `src/games/claimline/christmas.css` (new): night-forest surround, snowy HUD cards, red share bar and "You" row, festive start card and stick.
- `scripts/festive-evidence.mjs` (my line only): presses Play, then steers with held arrow keys through one loop and part of a second, so the shot shows trails and land.

## Guaranteed unchanged
- Model, bots, geometry, outline, input and score files are untouched.
- Hit radius, trail band and capture rules are model-side. The rendered trail band keeps its 1.5-cell width.
- Shape marks on heads and HUD rows are kept, so players stay distinguishable without colour.

## Performance
- First festive pass measured 37 ms/frame against 15 ms original, in a loaded software-GL headless Chromium at 1440x900 with 201 trail points.
- Root cause: a world-scaled pattern was resampled every frame (32 ms on its own).
- Fix: a device-resolution tile with a translate-only pattern (2 ms, cheaper than the original stripes at 3–4 ms), plus viewport culling of bulbs and the ring.
- Final: 24.3 ms and 20.7 ms (festive) against 22.0 ms and 22.2 ms (original), measured in alternation. That is parity within noise.
- No gradients are created per frame, except the single hat gradient in `drawSantaHat`.

## Tests
- `npx tsc --noEmit`: no errors in my files.
- `npx vitest run tests/games/claimline tests/core/festive.test.ts`: 5 files, 50/50 passed.
- Playwright `tests/games/claimline` on :4600: 14/14 passed.

## Screenshots (inspected)
- `before-*` (:4601) and `after-*` (:4600), using the same action. Bots are randomly seeded per run, so the layouts differ.
- Checked:
  - The seven colours are distinct.
  - The red "You" plus hat is easy to spot.
  - Bulbs are evenly spaced and stable.
  - Labels are legible on snow.
  - The candy ring and snow texture are crisp.
  - HUD cards are readable on the dark outside.
- `detail-hat-light-trail.png`, `detail-candy-ring-snow.png`.

## Known limitations
- The capture-flash tiles are the original pixel tiles.
- The outside is now dark evergreen. Claimline already uses dark dock glass, so no shared change is needed.
