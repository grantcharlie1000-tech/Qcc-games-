# Animal Stack: Christmas skin

## Skills invoked
- `game-development`: invoked; read the `game-art` guide (silhouette and staging, readability at play distance, colour hierarchy) and the `2d-games` guide (sprite layering). Accessories sit on a separate layer above the sprite art, are kept small and stay in the same flat, 2.6-outline toy style.
- `svg-skill`: invoked for the accessories. They are SVG markup (hat, antlers, scarf) composed into each species sprite. All 24 composed sprite SVGs validated with `validate.sh` (24 PASS). Every new `id` starts with the species key, as `species/types.ts` requires.
- `verification-before-completion`: invoked before reporting.
- `animate` was not used: no motion was added.

## What changed (presentation only)
- `src/games/animal-stack/christmas-art.ts` (new): hand-placed accessories for all 24 species.

  | Accessory | Species |
  | --- | --- |
  | Santa hat (12) | elephant, tapir, penguin, sloth, lion, panda, gorilla, wolf, koala, turtle, red panda, sheep |
  | Reindeer antlers (3) | horse, capybara, hippo |
  | Striped scarf (9) | giraffe, cow, ostrich, camel, moose, peacock, fox, alpaca, rhino |

  The file also holds:
  - `festiveBox`: the sprite draw box, grown to fit the accessory.
  - A cached winter sky and snowfield backdrop with static flakes and soft drifts.
  - A cached evergreen platform with a snowy top band and a light string underneath.
- `index.ts`, at mount when `christmas()` is true:
  - uses the festive sprite SVG and box, the backdrop and the platform;
  - otherwise keeps the original fills and sprites exactly.
- `christmas.css` (new):
  - `--scene-bg` uses the same vertical stops as the canvas, so the surround is seamless;
  - dark status text for readability on snow;
  - gold, red and green success sparkle;
  - focus outline colour.
- `scripts/festive-evidence.mjs`: the animal-stack action now presses DROP 5 times (real stacking).

## Guaranteed unchanged
- `species/*`, `shapes.ts`, `body.ts`, `model.ts`, `framing.ts` and `input.ts` are untouched: colliders, mass, inertia, scoring, saves and input.
- `frameCamera` still receives `world.cameraTop` and the physics `body.bounds.min.y`. The accessory box is only used in `drawImage`.
- The DROP button styling is unchanged (green, white text); it stays legible on the snow.

## Tests
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run tests/games/animal-stack tests/core/festive.test.ts` | 33/33 passed (also part of the final 86/86 combined run) |
| Playwright `tests/games/animal-stack` | 18/18 passed (final run, includes the new festive spec) |

Changes to the tall-framing tests:
- `tall-framing.spec.ts` scans for the original flat sky colour `#55c3ec`, so it is pinned to the original theme with `originalTheme` and a one-line comment.
- New `tall-framing-festive.spec.ts` runs the same tall saved stack through 8 rotations and a resize under the Christmas theme. It requires 0 pixels in the 76 px HUD band to differ from the festive backdrop, so hats and antlers never reach the HUD in that stack.
- I sanity-checked that the comparison detects ink: in a full-canvas scan, 13,691 pixels differ (animals and platform), and 0 differ in the HUD band.

## Screenshots
- `before-*` were regenerated from 4601 with the new action; `after-*` come from 4600.
- `detail-stack.png`: accessories during play.
- `detail-status-drop.png`: "The stack tumbled." in dark text above the disabled DROP button on snow.
- `detail-accessories.png`: all 24 species with accessories on the coordinate grid.

What I checked:
- No seam between the canvas and the surround on desktop.
- Light dock glass still reads on the pale sky.
- Mobile layout.

## Known limitations
- Hats and antlers are not physical, so a landing animal can visually overlap a hat (for example, the giraffe standing on the elephant's hat).
- In a far taller stack than the test fixture, a hat could in principle draw up to about 20 units above the 84 px camera floor. The camera logic was deliberately not changed.
- The desktop shots end in a tumble, both before and after, which is real physics variance.
