# Suika Game (fruit-merge): Christmas skin

## Skills invoked
- `using-superpowers`: invoked at the start of the session, as AGENTS.md requires.
- `game-development`: invoked; read `game-art/SKILL.md` for silhouette readability, colour hierarchy and the rule against relying on colour alone. As a result each tier has its own colour family and its own motif, and tier-number badges stay on for colour-blind mode.
- `svg-skill`: invoked for the 64px snow tile `christmas-snow-tile.svg`. Followed its workflow (viewBox, `aria-hidden`, no metadata) and validated it with `validate.sh` (PASS).
- `systematic-debugging`: invoked when 4 browser tests failed. Root cause: the per-frame festive drawing (many small paths, gradients and snowflakes) ran at about 4 fps on the tests' SwiftShader GL canvas, against about 29 fps for the original. The fix caches each ornament as a pre-painted sprite per tier and pixel size, and caches the static board (snow, lights and basket) once per pixel ratio. Measured after the fix: about 21 fps vs 15 fps for the original under the same load.
- `verification-before-completion`: invoked before reporting.
- `animate` was not used: no motion was added.

## What changed (presentation only)
- `src/games/fruit-merge/christmas-art.ts` (new): 11 ornaments.
  - 1 Jingle Bell (gold, slot and bow)
  - 2 Holly Berry (red, holly leaves)
  - 3 Snowflake Bauble (silver)
  - 4 Evergreen Bauble (green, gold zigzag)
  - 5 Candy Bauble (red and white stripes)
  - 6 Amber Bauble (orange, gold dots)
  - 7 Midnight Bauble (blue, stars and moon)
  - 8 Snow Globe (ice, fir tree, red base)
  - 9 Star Bauble (purple, big gold star)
  - 10 Christmas Pudding (brown, icing, holly)
  - 11 Grand Ornament (red and gold filigree, crown cap)

  Each ornament has two cached layers: the motif and topper turn with the body, while the lighting stays fixed. The file also holds the snowy board (the original 32px check geometry with frosted colours and flakes), a light string, an evergreen basket with snow and holly, and a red and gold floor rim.
- `art.ts`: `drawFruit` branches to `drawOrnament` when `christmas()` is true. The original branch is untouched.
- `index.ts`:
  - Festive display names for "Up next", status, level and announcements.
  - Festive spark and flash colours, and a cached backdrop.
  - The original drawing code is kept intact in the `else` branches.
- `christmas.css` (new): board colour, red ledge shadow, "UP NEXT" eyebrow colour, banner colour.
- `christmas-snow-tile.svg` (new): the surround tile.
  - `alignSurface` in `src/ui/game-chrome.ts` still sets the tile's size and position inline (64 px × scale, offset by 90 px).
  - Only `background-image` is overridden, with `!important`, so the tile lines up with the canvas. **No shared-file change is needed.**
- `scripts/festive-evidence.mjs`: the fruit-merge action now makes 28 real drops, so the shots show a mixed pile.

## Guaranteed unchanged
- `engine.ts` is untouched: tiers, radii, the queue, scoring, the danger line, physics bodies and saves.
- Each ornament's round body fills exactly radius r. Checked in the browser on the rendered sprites for all 11 tiers: 0 opaque pixels outside r+0.75 below the centre and 0 transparent pixels inside r−1.5. Loops, caps and holly sit above the circle, the same way the original stems and leaves did.
- Input, layout, the HUD and the leaderboard are unchanged. The rules text is unchanged.

## Tests
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run tests/games/fruit-merge tests/core/festive.test.ts` | 22/22 passed (also part of the final 86/86 combined run) |
| Playwright `tests/games/fruit-merge` (Chromium, `--output=/tmp/claude-0/pw-fruit-merge`) | final run 11/11 passed |

Before the performance fix, 4 tests failed on the festive code while the original passed 10/11. After the fix:
- One full run had 1 failure, `pause-render`: "Execution context was destroyed", a navigation during another agent's edits.
- Run alone, `pause-render` then passed on the festive server and failed on the original (4601).
- The final full run was 11/11.

## Screenshots
- `before-*` were regenerated from 4601 with the improved action; `after-*` come from 4600.
- `detail-tiers.png`: all tiers with names and radii.
- `detail-tiers-colorblind.png`: number badges.

What I checked:
- Distinct colour and motif per tier, including the Up next preview (bell, bauble).
- Light string at the canvas top.
- Holly at the basket corners.
- No seam between the canvas check and the surround tile on desktop and mobile.
- Light dock glass is still legible.

## Known limitations
- Toppers (loops, caps, holly) can visually overlap a neighbour's body, as the original stems did.
- The rules text still says "watermelon".

## Polish pass (night scene, motion, sharpness)
The first skin read as washed out: pale board, flat white basket, no motion. This pass is still presentation only (`engine.ts` untouched).

### Blurry rendering: root cause and fix
The board canvas's backing store was always 360 × devicePixelRatio (capped at 2), whatever size the board was shown at. The board is shown wider than 360 CSS px (about 530 px on a 1440×900 desktop; about 370 px on 3× phones, which need about 1110 device px), so the browser stretched a low-resolution bitmap and every ornament looked soft, even though the vector art is clean. `index.ts` now sizes the backing store from the board's on-screen width × devicePixelRatio, capped at 3×. The ratio is a multiple of 1/30, so the store stays exactly 12k × 17k px and the board keeps its 360:510 shape. The cached ornament sprites already key on device pixels, so they follow automatically. The "Up next" preview is sized the same way. This also sharpens the original fruit theme.

### Look
- Night sky with stars, a crescent moon and warm out-of-focus lights; snow on the ground.
- The basket is now translucent frosted glass with a candlelit glow, a diagonal sheen, frost in the corners and an inner shadow. It has a candy-cane frame with diagonal stripes, and a pine garland with small baubles, a snow cap and holly.
- The light string scallops across the top; the waiting ornament hangs from it on a gold thread.
- Ornaments gained a glassy rim reflection and a softer specular highlight.
- The danger line is now a gold bead chain that pulses red while the pile is too high.
- Surround: the midnight gradient with still snow at two scales; the dock uses dark-tone glass (`festiveDarkSurfaces`). The "Up next" label sits in a glass pill.

### Motion (all off under reduced motion)
- Snowfall drifts behind the glass, and bulb halos twinkle in a slow chase.
- The hanging ornament swings against your aim and then settles into an idle sway. After a drop, the next one slides down its thread.
- Merges show a coloured glow, an expanding gold ring and spinning star sparkles. The new ornament springs in (outBack scale) and its "+points" label pops in gold.
- A glint now and then travels across the pile.
- The surround's snow is deliberately still. An endless CSS animation would keep running behind the pause menu and would break the suite's "animations settled" checks.

### Performance
- Static layers (sky, basket and wire) are painted once per pixel ratio.
- Snow, halos, sparkles and glints are cached sprites drawn with `drawImage`.
- The merge pop scales the context and does not rasterise new sprite sizes.

### Tests
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run tests/games/fruit-merge tests/core/festive.test.ts` | 22/22 |
| Playwright (Chromium): `tests/games/fruit-merge`, `tests/e2e/festive.spec.ts`, `viewport.spec.ts`, `glass-menus.spec.ts`, `see-through-material.spec.ts` | 79/79 |
