# Library posters

Every game's library poster (`public/game-art/<id>/cover.svg`) comes from one generator, so the 24 posters read as a single set:

```sh
node scripts/generate-posters.mjs              # every poster, then syncs the card colours in src/core/catalog.ts
node scripts/generate-posters.mjs pool snake   # only these posters
bash .agents/skills/svg-skill/scripts/validate.sh public/game-art
```

`tests/core/posters.test.ts` checks that each poster is well-formed, uses the shared stage and matches its card colours.

## The system

- **Frame.** 320×410, the same ratio as the library card, so nothing is cropped. The top 120 units stay quiet because the live HTML title and underline sit there.
- **Stage.** Every poster uses the same backdrop: a dark two-stop gradient built from a single hue per game (`POSTERS[id].hue`), a lighter glow behind the subject, a halftone floor that fades in towards the bottom, and a soft ground shadow. Only the hue changes between games.
- **Palette.** Subjects use only the twelve `PALETTE` swatches. Each swatch has a light, base and dark tone, used for the lit, plain and shaded sides of a shape.
- **Lighting.** Light always comes from the upper left. Glossy surfaces get one white highlight, and raised objects get the shared `drop` shadow.
- **Shared parts.** Grid games are built from the same glossy `tile` and dark `slot`. Balls, fruit and orbs use the same `sphere`. Blocks and slabs use the same isometric `cube`. Creatures share the same `eye` and `blush`.
- **Accents.** Each game has one accent swatch. It colours the poster's four-point sparkles and dots, and the title underline on the card. Every title uses the same cream ink.

The generator writes `color`, `ink` and `accent` for each game in `src/core/catalog.ts`. The card colour is the top of the poster's stage, so the placeholder shown while the image loads matches the poster.

## Adding a game

1. Add an entry to `POSTERS`, choosing a hue that isn't already close to its neighbours in the library.
2. Add an `art[id]` function that returns the subject, using the shared parts and palette.
3. Run the generator and check the result in the library grid, including the narrow two-column layout.

## Provenance

All posters are original vectors drawn in code. They contain no linked images, downloaded artwork, proprietary sprites or game branding. The Globle poster projects the bundled Natural Earth public-domain outlines (`src/games/globle/data/world.json`), with the guessed countries shaded by their real distance from the hidden country.
