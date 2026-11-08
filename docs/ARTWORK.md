# Library posters

Every game's library poster (`public/game-art/<id>/cover.svg`) comes from one generator, so the posters read as a single set:

```sh
node scripts/generate-posters.mjs              # every poster, then syncs the card colours in src/core/catalog.ts
node scripts/generate-posters.mjs pool snake   # only these posters
bash .agents/skills/svg-skill/scripts/validate.sh public/game-art
```

`tests/core/posters.test.ts` checks that each poster is well-formed, uses the shared stage and matches its card colours.

## The system

The posters use the Blockcraft and Crossy Road covers' visual language: isometric voxel dioramas.

- **Frame.** 320×410, the same ratio as the library card, so nothing is cropped. The top 130 units stay clear because the live HTML title and underline sit there.
- **Voxel models.** Every subject is a real block model built in code (`Scene.box`, `Scene.ball`, `Scene.set`) and rendered with one 2:1 isometric projection. Each model is scaled to fill the same stage area, so the blocks have similar weight from poster to poster.
- **Flat shading.** Each block colour comes from `C`. The top face is lightened, the left (+y) face uses the base colour and the right (+x) face is darkened, so light always comes from the same side. There are no outlines, gradients, blurs or drop shadows. Faces are stroked in their own colour to hide anti-aliasing seams, and grass-style blocks get a coloured band along the top of their sides.
- **Painted pixels.** Eyes, numbers, letters, suits, arrows and road markings are pixel art painted onto block faces, like Minecraft textures. Lettering uses a 3×5 pixel font. Each painted pixel attaches to the frontmost block it sits on, so it's drawn in the right depth order.
- **Backdrop.** A flat colour per game (`POSTERS[id].hue`) with square pixel "snow" around the model. Every title uses the same cream ink, and each game's accent colours its title underline.

The generator writes `color`, `ink` and `accent` for each game in `src/core/catalog.ts`. The card colour is the poster's backdrop, so the placeholder shown while the image loads matches it.

## How the svg-skill rules apply

The posters follow the installed [`svg-skill`](../.agents/skills/svg-skill/SKILL.md) (quality checklist and optimisation rules):

- Each file has `xmlns`, the 320×410 `viewBox`, an XML declaration, and `role="img"` with a `<title>` and `<desc>`.
- Lettering is drawn as painted pixel shapes, not `<text>`. Posters load through `<img>`, where only device fonts are available, so real text would change shape between devices.
- Consecutive faces that share a colour merge into one path, and coordinates are rounded to one decimal, which is sub-pixel at poster size.
- `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art` and `tests/core/posters.test.ts` enforce these rules. The test also rejects gradients, filters, masks and patterns, so the posters stay flat.

## Adding a game

1. Add an entry to `POSTERS`, choosing a hue that isn't already close to its neighbours in the library.
2. Add an `art[id]` function that builds the voxel model on the scene it's given, using the colours in `C` and painting details with `top`, `floor`, `left`, `right` or `paint`.
3. Run the generator and check the result in the library grid, including the narrow two-column layout.

## Provenance

All posters are original voxel models drawn in code. They contain no linked images, downloaded artwork, proprietary sprites or game branding. The Globle poster projects the bundled Natural Earth public-domain outlines (`src/games/globle/data/world.json`), with the guessed countries shaded by their real distance from the hidden country.
