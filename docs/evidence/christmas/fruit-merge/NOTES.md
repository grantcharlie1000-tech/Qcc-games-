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
