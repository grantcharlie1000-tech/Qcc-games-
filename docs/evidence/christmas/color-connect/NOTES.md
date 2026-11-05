# Flow Free (color-connect) — Christmas skin

## Skills invoked
- `game-development` (with `game-art/SKILL.md`): guided readability. Accessibility is "don't rely only on color", so the colour-blind shapes stay full size. Hierarchy: endpoints stand out over cables.
- `svg-skill`: the bulbs and cables are inline SVG generated in `render()`. Gradients sit in `<defs>`, the per-instance id prefixing is kept, and the art stays decorative inside the existing `aria-hidden` SVG. No standalone `.svg` file was added, so `validate.sh` had nothing to check.
- No motion was added, so `animate` was not used.

## What changed (visual only)
- `src/games/color-connect/index.ts`:
  - Imports `christmas.css` and `christmas()`.
  - In `render()`, `xmas=christmas()` selects festive markup for the same geometry. The original branch is untouched (`else`).
  - Endpoints are Christmas light bulbs. The glass is the pair's own shape (circle, diamond, square, triangle, pentagon, star, hexagon) at the original size. It is filled with a new radial "glass" gradient (`cc-bulb-<i>`) in the pair colour and has an inner light rim and a highlight. A green socket cap sits on top, a soft halo glows in the pair colour, and the letter sits in the same position and size.
  - Paths are luminous cables: a translucent wide glow in the pair colour, then a dark-edged wire, the pair colour and a bright core. The pair's colour-blind dash pattern is kept on the wire.
  - The same polyline points are used, so no geometry changed. The connected check badges are unchanged.
- `src/games/color-connect/christmas.css` (new; every selector starts with `:root[data-festive="christmas"]`):
  - A midnight starry and snowy surround (`--game-surface` and `.game-surface`).
  - A gold frame.
  - A midnight playfield edge.
  - Gold focus and selection rings.
  - A midnight-and-gold win strip.
- `scripts/festive-evidence.mjs` (color-connect entry only): drags A and B home and most of C on puzzle 1, using real mouse drags.
- Cover/poster art is untouched.

## Guaranteed unchanged
- Levels, rules, model, input mapping (the grid of buttons over the SVG), keyboard, saves, scoring, the 7 pair colours (`palette` untouched), letters, shapes and dash marks.
- The festive art is drawn only inside the existing `aria-hidden` SVG, which has `pointer-events:none`.

## Tests
- `npx tsc --noEmit`: no errors in color-connect. Unrelated errors seen from other agents' files (e.g. `tests/games/animal-stack/tall-framing-festive.spec.ts`).
- `npx vitest run tests/games/color-connect tests/core/festive.test.ts`: 21/21 passed.
- Playwright `tests/games/color-connect` on :4600 (`--output=/tmp/claude-0/pw-color-connect`): 17 passed and 2 failed, both 30 s timeouts at load average around 14: `menus.spec:5` at 390, and `play.spec:109`.
- Rerunning exactly those (`menus.spec.ts` and `play.spec.ts:109`): 5/5 passed on :4600, and 5/5 passed on pristine :4601.
- These are timing flakes under load. No test was changed.

## Screenshots (inspected)
- `before-*.png` (:4601) and `after-*.png` (:4600): puzzle 1 in progress.
- `compare-mobile.png`: before and after side by side.
- `detail-9x9-mobile.png` and `compare-9x9.png`: puzzle 32 (9×9, all 7 pairs) with short cables from each pair, before and after. All seven shapes, letters and colours are distinct at 9×9 phone size.
  - An earlier version put a smaller bulb over a shape plate, which hid the triangle and pentagon. I replaced it so the bulb glass is the shape.
- `detail-win-mobile.png`: the solved puzzle with the win strip.

What I checked:
- Letters stay legible (dark ink on bright glass).
- The cables glow without blur filters.
- The frame and surround have no seams.

## Known limitations
- On the dark starry surround, the shell's dock glass is very transparent, though the text stays legible. The lead may want dark-tone glass, but this game was already dark-toned (not in `lightSurfaces`), so I requested no change.
