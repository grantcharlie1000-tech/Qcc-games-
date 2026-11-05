# Christmas Arcade — evidence report

Branch `claude/christmas-arcade-transformation-jivfvc`. All screenshots on this page are real captures of the running app made by `scripts/festive-evidence.mjs` in headless Chromium at 1440 × 900 (desktop) and 390 × 844 (phone), during active play. "Before" images come from a pristine checkout of the original commit (`0246c6d`) served separately; "after" images come from this branch. Every image was opened and inspected during development; problems found that way are listed per game.

## How the theme works

- `src/festive/festive.ts` sets `data-festive="christmas"` on `<html>` at start-up. Christmas is the default. A **Christmas theme** switch in the Menu turns it off; the choice is stored under `qcc:festive`, outside the `pocket-arcade:v1:` namespace, so it is never synced, never part of a save and never touches scores. `?festive=off` in the URL does the same for one visit.
- Every CSS override lives in a per-game `christmas.css` and is scoped under `:root[data-festive="christmas"]` (a unit test enforces this), so switching the theme off restores the original look immediately.
- Canvas, SVG and WebGL games branch on `christmas()` at draw or mount time. The original branch is unchanged. Decoration is drawn around the real geometry; no hitbox, body size, collision shape, colour index, rule or score changes.
- Shared assets: `src/festive/christmas.css` (colour tokens shared with Crossy Road's Christmas palette, inline-SVG textures: snowflakes, stars, a light strand, holly, candy stripe) and `src/festive/art.ts` (Canvas helpers: Santa hat, bauble, candy cane, bulb, snowflake, snow cap, light string).
- No new dependencies, no raster images. Motion: none added except where a game notes it; reduced motion is respected.

## Shared skill selection

Skills were assessed again for every game (see each section). Used across the project: **using-superpowers** (workflow), **brainstorming** (the brief already specified the design, so it moved straight to implementation with my design calls recorded here), **game-development** with its `game-art`, `web-games`, `2d-games`, `3d-games` and `mobile-games` guides (palette value contrast, "don't rely only on colour", mobile budgets), **svg-skill** (all SVG textures and files, validated with its `validate.sh`), **animate** (its gate rejected snowfall loops and constant decorative motion on screens players watch continuously), **test-driven-development** (the theme switch and scope tests), **systematic-debugging** (every test failure), **dispatching-parallel-agents** (the twelve full skins were built by four parallel agents with a shared brief, each confined to its own games), **requesting-code-review** and **verification-before-completion** (final pass). The Phaser skills were not applicable: the arcade uses Canvas 2D, DOM/SVG, Matter.js and Three.js, not Phaser.

---

## Lightweight themes

### Block Blast (`color-blocks`)

| Before | After |
| --- | --- |
| ![](color-blocks/before-mobile.png) | ![](color-blocks/after-mobile.png) |
| ![](color-blocks/before-desktop.png) | ![](color-blocks/after-desktop.png) |

- **Changes:** the seven block colours become wrapping papers (gold, red, snow-white, burgundy, holly, copper, pine) with a contrasting ribbon, so every block reads as a present; evergreen table with snow specks and a gold-trimmed board. `art.ts` (index → colour mapping only; saved indices unchanged), `christmas.css`.
- **Skills:** svg-skill (the blocks are inline SVG), game-development/game-art (seven hues kept apart by value). animate not used (no motion).
- **Found in review and fixed:** a visible seam where the shell continued the background around the column (switched to a vertical gradient with centre-anchored tiles); colour-blind glyphs were dark on dark papers (now light glyphs on burgundy, red and pine).
- **Tests:** 23 unit; 20 browser tests, all gameplay assertions pass. One touch test fails only at its final `video.saveAs` (container ffmpeg mismatch, see Limitations).

### Water Sort (`water-sort`)

| Before | After |
| --- | --- |
| ![](water-sort/before-mobile.png) | ![](water-sort/after-mobile.png) |
| ![](water-sort/before-desktop.png) | ![](water-sort/after-desktop.png) |

- **Changes:** wine-red starry night, a strand of lights, snow on each tube's lip with a holly sprig, frosted outlines, gold selection; seven distinct festive liquids (cranberry, spruce blue, gold, holly, sugar plum, frost, clementine). Names and letters used for accessibility are unchanged. `art.ts`, `index.ts` (pour stream colour), `christmas.css`.
- **Skills:** svg-skill (tube art), game-art (liquid separation). No motion added.
- **Found in review and fixed:** the holly sprig was too small to read; enlarged.
- **Tests:** 268 unit; 23 browser (one mid-pour Study test failed once under parallel load and passed on rerun).

### Stack (`tower`)

| Before | After |
| --- | --- |
| ![](tower/before-mobile.png) | ![](tower/after-mobile.png) |
| ![](tower/before-desktop.png) | ![](tower/after-desktop.png) |

- **Changes:** slabs cycle red, green, gold and snow with explicit top/front/side shades so the isometric depth still reads; snow plinth; new snowy-night backdrop (`christmas-sky.svg`: moon, stars, snowy hills, pines); dark glass for the dock (`festiveDarkSurfaces` in `src/ui/game-chrome.ts`).
- **Skills:** game-art (depth by value), svg-skill (backdrop, validated). No motion added.
- **Found in review and fixed:** the shell copied the whole backdrop around the play area (two moons, white snow behind light glass buttons) — the surround is now sky only and the dock uses dark glass; a star sat behind the "NEXT SLAB" label (moved).
- **Tests:** 8 browser, all pass; unit suite passes.

### Snake (`snake`)

| Before | After |
| --- | --- |
| ![](snake/before-mobile.png) | ![](snake/after-mobile.png) |
| ![](snake/before-desktop.png) | ![](snake/after-desktop.png) |

- **Changes:** snowy board with static snowflakes, candy-cane frame, red body with green bands along the same path, holly-green head wearing a Santa hat, food is a bauble whose sphere is exactly the food radius (colour varies by cell). `art.ts`, `christmas.css`.
- **Skills:** game-art (contrast on a light board), shared Canvas helpers. No motion added.
- **Found in review and fixed:** the red hat disappeared on a red head; the head is now green.
- **Tests:** 45 unit; 15 browser (one timing test failed once under load and passed on rerun; it also proves the festive pixels are identical across reloads).

### Slither (`neon-coil`)

| Before | After |
| --- | --- |
| ![](neon-coil/before-mobile.png) | ![](neon-coil/after-mobile.png) |
| ![](neon-coil/before-desktop.png) | ![](neon-coil/after-desktop.png) |

- **Changes:** midnight-blue arena with faint snow, candy-cane player and Christmas skins for the seven bots (holly, frost, cranberry, sugar plum, gold, pine-and-gold, gingerbread), pellets in Christmas-light colours. Sprites for both themes are cached at mount. `skin.ts`, `render.ts`, `christmas.css`.
- **Skills:** game-art (skins must stay distinguishable for the ranking), 2d-games (cached pattern, no per-frame cost). No motion added.
- **Tests:** 56 unit; 35 browser. Two visual tests measure the original skin's exact pixel colours; they are pinned to the original theme with `originalTheme` (the Christmas render is covered by `tests/e2e/festive.spec.ts`).

### Globle (`globle`)

| Before | After |
| --- | --- |
| ![](globle/before-mobile.png) | ![](globle/after-mobile.png) |
| ![](globle/before-desktop.png) | ![](globle/after-desktop.png) |

- **Changes:** the WebGL canvas is transparent only in Christmas mode, showing a starry winter sky; SVG ornaments hang in the top corners, layered behind the globe so they appear only around it. Land, ocean, guess and clue colours are unchanged. `globe.ts`, `ornaments.svg`, `christmas.css`.
- **Skills:** 3d-games (no extra GPU work: decoration is CSS), svg-skill (ornaments, validated), game-art (decor must not compete with clue colours).
- **Found in review and fixed:** on phones the zoomed globe was covered by the ornaments; moved them behind the canvas.
- **Tests:** 37 unit; 18 browser, all pass.

### Slipline (`slipline`)

| Before | After |
| --- | --- |
| ![](slipline/before-mobile.png) | ![](slipline/after-mobile.png) |
| ![](slipline/before-desktop.png) | ![](slipline/after-desktop.png) |

- **Changes:** icy-blue board with sparse snowflakes; arrows snow-white and holly-green. State colours keep their meaning: red still means blocked, selection is gold, clearing glows gold-white; colour-blind dashes unchanged. Each arrow's tone is keyed to its stable id. `index.ts` (adds `data-tone`), `christmas.css`.
- **Skills:** game-art (keep colour semantics), svg-skill (texture tokens).
- **Found in review and fixed:** tones keyed to DOM order shuffled when an arrow cleared; now keyed to the arrow id. Snowflakes were too dense behind the routes.
- **Tests:** 6 unit; 11 browser, all pass.

### Tetris (`quadfall`)

| Before | After |
| --- | --- |
| ![](quadfall/before-mobile.png) | ![](quadfall/after-mobile.png) |
| ![](quadfall/before-desktop.png) | ![](quadfall/after-desktop.png) |

- **Changes:** gift-wrapped pieces in seven festive colours with contrasting ribbons (the ribbon is skipped when colour-blind glyphs are on, so the glyph stays clear), snowy navy page, gold-trimmed board, frosted panels. `index.ts`, `christmas.css`.
- **Skills:** game-art, svg-skill tokens. No motion added.
- **Tests:** 33 unit; 19 browser. `the most recently pressed direction wins while both are held` is timing-sensitive (Playwright's flowing fake clock plus the game's auto-shift). It fails on the original code too (1 of 10 runs); on this branch it failed 4 of 10 in one sample. Profiling showed no festive cost: no long tasks after Start in 12 runs, equal frame pacing (16.7 ms median, 16.8 ms p95) and lower main-thread load (about 17 % busy against 19–24 % for the original theme). Recorded as a pre-existing flaky test.

### Wordle (`fivefold`)

| Before | After |
| --- | --- |
| ![](fivefold/before-mobile.png) | ![](fivefold/after-mobile.png) |
| ![](fivefold/before-desktop.png) | ![](fivefold/after-desktop.png) |

- **Changes:** evergreen table with holly in the corners, snow specks, gold-trimmed tiles, keys with a gold underline, cream dialog with a red rim. Clue colours and their colour-blind alternatives are untouched (they use `!important`).
- **Skills:** game-art (gold accents kept off tile fills so they can't be confused with the "present" clue), svg-skill tokens.
- **Found in review and fixed:** the shell's surface copy dropped `background-repeat`, so the corner holly tiled across the dock; `src/ui/game-chrome.ts` now copies it (a no-op for every existing game).
- **Tests:** 26 unit; browser tests and the shell glass suites, 31 pass.
