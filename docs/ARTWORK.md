# Library posters

Every game's library poster (`public/game-art/<id>/cover.svg`) comes from one generator, so the posters read as a single set:

```sh
node scripts/generate-posters.mjs              # every poster, then syncs the card colours in src/core/catalog.ts
node scripts/generate-posters.mjs pool snake   # only these posters
bash .agents/skills/svg-skill/scripts/validate.sh public/game-art
```

`tests/core/posters.test.ts` checks that each poster is well-formed, uses the shared stage and matches its card colours.

## The system

The posters are lit isometric voxel dioramas.

- **Frame.** 320×410, the same ratio as the library card, so nothing is cropped. The model is fitted below y=104 because the live HTML title sits over the top.
- **Voxel models.** Each poster has a hand-built model in `scripts/posters/models/<id>.mjs`. It fills a `Scene` with dense voxels using boxes, ellipsoids, cylinders, lines and hand-drawn pixel sprites (`Scene.sprite`, `Scene.layers`). Letters, numbers, faces and icons are voxels too.
- **Baked lighting.** `scripts/posters/engine.mjs` gives every visible face one flat colour: top lightest, +y (screen left) lit, +x (screen right) in shade, plus cast shadows from a key light at the upper left and ambient occlusion in creases. `{glow: true}` voxels stay unlit and `{alpha}` voxels are glass. There are no gradients, filters or outlines.
- **Exact rendering.** Faces land on a triangular screen lattice, the frontmost face wins each triangle, and triangles that share a colour merge into one outlined path, stroked in its own colour to hide seams.
- **Backdrop.** A flat colour per game (`POSTERS[id].hue`, or `color`) with two flat discs behind the model and square pixel particles around it. Every title uses the same cream ink, and each game's accent colours its title underline.

The generator writes `color`, `ink` and `accent` for each game in `src/core/catalog.ts`. The card colour is the poster's backdrop, so the placeholder shown while the image loads matches it.

## How the svg-skill rules apply

- Each file has `xmlns`, the 320×410 `viewBox`, an XML declaration, and `role="img"` with a `<title>` and `<desc>`.
- Lettering is built from voxels, not `<text>`, so it looks the same on every device.
- Coordinates are rounded to one decimal, which is sub-pixel at poster size.
- `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art` and `tests/core/posters.test.ts` enforce these rules. The test also rejects gradients, filters, masks and patterns.

## Adding a game

1. Add an entry to `POSTERS` in `scripts/generate-posters.mjs`, choosing a hue that isn't already close to its neighbours in the library.
2. Add `scripts/posters/models/<id>.mjs` exporting `build(scene, helpers)`. Use `helpers.hash` for noise, never `Math.random`.
3. Run the generator, look at the render, and iterate until the hero reads at card size.

## Provenance

All posters are original voxel models drawn in code. They contain no linked images, downloaded artwork, proprietary sprites or game branding.
