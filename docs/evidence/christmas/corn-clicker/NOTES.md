# Corn Clicker: Christmas skin

## Skills invoked
- `game-development`: invoked; read the `game-art` guide (pixel-art consistency: work at 1x on the existing grid; readability by value) and the `2d-games` guide (sprite layers).
  - The new art is drawn on the same pixel grids: cob 28×44, golden cob 20×30, backdrop 192×120.
  - The bow got a dark outline after the first version read as a muddy blob.
- `verification-before-completion`: invoked before reporting.
- `svg-skill` was not used for this game: no SVG was authored. The CSS reuses the shared `--xmas-*` textures.
- `animate` was not used: no motion was added. The existing animations are untouched.

## What changed (presentation only)
- `src/games/corn-clicker/christmas-art.ts` (new):
  - `COB_XMAS`: the clickable cob with snow on its tip and a red gift bow where the husk gathers. Skins still recolour the kernels; the bow and snow keep their own colours.
  - `GOLDEN_XMAS`: the golden cob with a snow cap and a red ribbon bow.
  - `festiveSceneUrl`: the farm backdrop for all 4 stages under snow. It has snowy hills, fir trees with snowy tips and a static snowfall, and stage 0 adds a red barn with a snowy roof, an eave light string and a wreath. Each stage keeps its time of day (day, dusk, night, cosmos).
- `art.ts`: `cobArt` (pixel mode only; the face photo mode is unchanged), `goldenArt` and `sceneUrl` branch on `christmas()`. The original branches are untouched.
- `christmas.css` (new), colours and decoration only:
  - evergreen panel palette (CSS variables), candy-red column frames, snowflake texture;
  - holly in the top corners of the cob column;
  - a light strand over the cob stage and along the farm scene's top (pseudo-elements with `pointer-events:none`, out of flow);
  - green upgrade and producer tiles, toast and tooltip backgrounds;
  - a soft red glow on the golden cob;
  - the shell surround through `--game-surface`.
- `scripts/festive-evidence.mjs`: the corn-clicker action now does 40 cob clicks, buys a Farmhand and does 12 more clicks.

## Guaranteed unchanged
- `data.ts`, `model.ts`, `big.ts`, `state.ts`, `persistence.ts`, `score.ts`, `ui.ts`, `garden-view.ts`, `text.ts` and `audio.ts` are untouched. That covers all economy numbers, timing, golden cob spawn and effects, saves, backups, cross-tab locking and the UI structure.
- Sprite dimensions are identical, so the cob and golden cob hit areas and the layout are unchanged.

## Tests
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run tests/games/corn-clicker tests/core/festive.test.ts` | 43/43 passed (also part of the final 86/86 combined run) |
| Playwright `tests/games/corn-clicker` | 9/9 passed |

The browser tests rewrote `tests/games/corn-clicker/evidence/*.png`; I left them for the lead.

## Screenshots
- `before-*` were regenerated from 4601 with the new action; `after-*` come from 4600.
- `detail-art.png`: original vs Christmas cob, the Christmas cob with the ruby skin, original vs Christmas golden cob, and the 4 snowy backdrop stages.

What I checked:
- Frame and lights.
- Text contrast on the evergreen panels.
- The "Saved just now" line is not covered by the holly (I moved the holly to the top corners).
- Mobile Cob tab and dock.

## Known limitations
- The golden cob shows up in play only after 60–120 s, so it is verified through the `detail-art.png` sprite render, not an in-game shot.
- The garden plant sprites, pests, producers and the face-photo cob are unchanged.
