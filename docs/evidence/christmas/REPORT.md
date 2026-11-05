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

---

## Full Christmas skins

Built by four parallel agents from one shared brief (each confined to its own games), then reviewed by me from screenshots, detail crops and diffs before committing. Each game's `NOTES.md` has the full skill record, files and test commands.

### Suika Game (`fruit-merge`)

| Before | After |
| --- | --- |
| ![](./fruit-merge/before-mobile.png) | ![](./fruit-merge/after-mobile.png) |
| ![](./fruit-merge/before-desktop.png) | ![](./fruit-merge/after-desktop.png) |

- **Changes:** The eleven fruits become eleven distinct ornaments (jingle bell, holly berry, snowflake, evergreen, candy, amber, midnight, snow globe, star bauble, Christmas pudding, grand ornament), each with its own colour and motif, in the board, the Up next preview, labels and screen-reader text. Each ornament's round body is exactly the physics radius (checked for all 11 tiers in the browser); loops and caps sit above the circle like the old stems. Frosted check board with lights and an evergreen basket. Ornaments and the static board are cached.
- **Skills:** game-development + game-art, svg-skill (snow tile, validated), systematic-debugging, verification-before-completion. Details in [`fruit-merge/NOTES.md`](fruit-merge/NOTES.md).
- **Notes and tests:** Colour-blind tier badges kept. The first version dropped frame rate in the software-rendered test browser (about 4 fps against 29); caching fixed it. Unit 22/22, browser 11/11.

### Flappy Bird (`flappy-bird`)

| Before | After |
| --- | --- |
| ![](./flappy-bird/before-mobile.png) | ![](./flappy-bird/after-mobile.png) |
| ![](./flappy-bird/before-desktop.png) | ![](./flappy-bird/after-desktop.png) |

- **Changes:** Winter sky with a low sun and still snowflakes, snowy dunes with firs, a snowy red-tile roof as the ground, a Santa hat on the unchanged bird, and brick chimneys that fill exactly the pipe collision rectangles with snow-topped stone caps exactly where the pipe caps were. `model.ts` untouched; the scene stays light, so the light dock glass still fits.
- **Skills:** game-development + game-art + 2d-games, systematic-debugging, verification-before-completion (no SVG, no new motion). Details in [`flappy-bird/NOTES.md`](flappy-bird/NOTES.md).
- **Notes and tests:** Draw cost 0.22 ms per frame against 0.70 ms for the original. Unit 13/13; final browser results in the regression section.

### Ball Run (`ball-run`)

| Before | After |
| --- | --- |
| ![](./ball-run/before-mobile.png) | ![](./ball-run/after-mobile.png) |
| ![](./ball-run/before-desktop.png) | ![](./ball-run/after-desktop.png) |

- **Changes:** Icy-blue road with snow-white lines, frosted snow-dusted towers with warm lit windows (one 64×256 canvas texture on the existing tower material), a deep winter-blue sky with a static CSS star layer, red/green/gold blocks, white sliders, evergreen-and-gold boost gates and a glossy red bauble ball with gold bands.
- **Skills:** game-development + 3d-games + game-art, systematic-debugging, verification-before-completion. Details in [`ball-run/NOTES.md`](ball-run/NOTES.md).
- **Notes and tests:** Only materials, colours, textures and fog change: geometry, ball radius, collision, pools, draw calls and resolution tiers are identical. I sent the first version back because the surroundings still read as the original wireframe city; the snow pass fixed that. Unit 113/113.

### Animal Stack (`animal-stack`)

| Before | After |
| --- | --- |
| ![](./animal-stack/before-mobile.png) | ![](./animal-stack/after-mobile.png) |
| ![](./animal-stack/before-desktop.png) | ![](./animal-stack/after-desktop.png) |

- **Changes:** Santa hats (12 animals), reindeer antlers (3) and striped scarves (9) drawn into each animal's sprite only, a winter sky and snowfield, and a snowy evergreen platform with lights. Colliders, mass, the model and camera framing are untouched; the status text is dark for snow and the DROP button is unchanged.
- **Skills:** game-development + game-art + 2d-games, svg-skill (24 composed sprites validated), verification-before-completion. Details in [`animal-stack/NOTES.md`](animal-stack/NOTES.md).
- **Notes and tests:** `tall-framing.spec.ts` asserts the original flat sky, so it is pinned to the original theme; the new `tall-framing-festive.spec.ts` runs the same tall stack with Christmas on and checks the HUD band stays clear. Limitations: hats are not solid, so an animal can appear to rest on one; in a far taller stack than the test, a hat could reach about 20 units into the HUD band. Unit 33/33, browser 18/18.

### Minesweeper (`minesweeper`)

| Before | After |
| --- | --- |
| ![](./minesweeper/before-mobile.png) | ![](./minesweeper/after-mobile.png) |
| ![](./minesweeper/before-desktop.png) | ![](./minesweeper/after-desktop.png) |

- **Changes:** Covered tiles are raised snow mounds on a midnight snowflake background, revealed tiles are flat frosty ground with the classic number colours darkened to at least 4.6:1, mines are lumps of coal (the one that went off glows with embers on a red-ringed tile), and flags are candy canes with holly on the board and in the Flag mode button.
- **Skills:** svg-skill (five SVGs, validated), game-development + game-art, systematic-debugging, verification-before-completion. Details in [`minesweeper/NOTES.md`](minesweeper/NOTES.md).
- **Notes and tests:** Rankings, settings and touch Reveal/Flag controls unchanged. Unit tests pass; one browser test (`play.spec:87`) also fails on the original code.

### Solitaire (`solitaire`)

| Before | After |
| --- | --- |
| ![](./solitaire/before-mobile.png) | ![](./solitaire/after-mobile.png) |
| ![](./solitaire/before-desktop.png) | ![](./solitaire/after-desktop.png) |

- **Changes:** Evergreen felt inside a gold frame, holly in the bottom corners, an original red card back with a gold diamond lattice and snowflake medallion, gold outlines on foundation slots, and red/gold buttons. Card faces untouched. The drag ghost reuses the `.solitaire` class, so the felt rules exclude it and a dragged card stays clean.
- **Skills:** game-development + game-art, svg-skill (card back pattern and holly, validated), systematic-debugging, verification-before-completion. Details in [`solitaire/NOTES.md`](solitaire/NOTES.md).
- **Notes and tests:** Browser 8/9 in the agent's run; the failure was the 30 s overall limit under machine load (passes when not loaded).

### Block Fill (`block-fill`)

| Before | After |
| --- | --- |
| ![](./block-fill/before-mobile.png) | ![](./block-fill/after-mobile.png) |
| ![](./block-fill/before-desktop.png) | ![](./block-fill/after-desktop.png) |

- **Changes:** Ice cells with a frost sheen, warm-lit covered cells, navy hatched walls, and the drawn path as a green light cable with coloured bulbs, each with a cap, glow and outlined number; the start is a gold S bulb and the head a large warm-white bulb. The hint marker is red so it shows on ice.
- **Skills:** svg-skill, game-development + game-art, systematic-debugging, verification-before-completion. Details in [`block-fill/NOTES.md`](block-fill/NOTES.md).
- **Notes and tests:** Markup structure, coordinates, `data-cell` groups, labels, logic and input unchanged. About 2 ms more per move from larger SVG markup; frame time unchanged.

### Flow Free (`color-connect`)

| Before | After |
| --- | --- |
| ![](./color-connect/before-mobile.png) | ![](./color-connect/after-mobile.png) |
| ![](./color-connect/before-desktop.png) | ![](./color-connect/after-desktop.png) |

- **Changes:** Endpoints become Christmas light bulbs whose glass is the pair's own colour-blind shape at the original size, with a green socket, a halo and the letter in place; paths are glowing cables in the pair colour (no blur filters) keeping each pair's dash pattern; gold frame on a starry midnight sky.
- **Skills:** game-development + game-art, svg-skill, verification-before-completion. Details in [`color-connect/NOTES.md`](color-connect/NOTES.md).
- **Notes and tests:** All seven pair colours, letters and shapes unchanged; checked on a 9×9 board with all seven pairs (`compare-9x9.png`). On the dark background the shell's dock glass is nearly transparent but the text stays readable.

### Pool (`pool`)

| Before | After |
| --- | --- |
| ![](./pool/before-mobile.png) | ![](./pool/after-mobile.png) |
| ![](./pool/before-desktop.png) | ![](./pool/after-desktop.png) |

- **Changes:** Deeper evergreen felt, red lacquer rails with gold bevel, pinstripes and diamonds, and a static string of coloured lights along the rail's outer band, drawn once into the cached table canvas (bulbs near pockets skipped); dark evergreen room with faint snowflakes. Balls, numbers, stripes, cue, geometry, pockets, physics and online play are unchanged.
- **Skills:** game-development + game-art, verification-before-completion (Canvas only, static). Details in [`pool/NOTES.md`](pool/NOTES.md).
- **Notes and tests:** Limitations: bulbs are about 5 px on a phone; the wire has square corners inside the rounded rail corners. Browser 15/15 in the agent's run.

### Pac-Man (`maze-muncher`)

| Before | After |
| --- | --- |
| ![](./maze-muncher/before-mobile.png) | ![](./maze-muncher/after-mobile.png) |
| ![](./maze-muncher/before-desktop.png) | ![](./maze-muncher/after-desktop.png) |

- **Changes:** Night maze with icy walls and snow clipped inside the walls (never into a lane), snowball dots, bauble power pellets that blink like the originals, a Santa hat on the muncher and the spare-life icons, and snowman ghosts whose beanie and scarf keep each ghost's original colour and face marks. Frightened snowmen turn blue, the end-of-fright flash goes white and red, and eaten ghosts show the original eyes.
- **Skills:** game-development + game-art + 2d-games, svg-skill (exported board validated, unique ids), verification-before-completion. Details in [`maze-muncher/NOTES.md`](maze-muncher/NOTES.md).
- **Notes and tests:** All 242 dots and 4 pellets keep their positions and sizes; `model.ts` untouched; the hat reaches about 2 units above where the antennae did (drawing only). Unit 19/19, browser 16/16.

### Corn Clicker (`corn-clicker`)

| Before | After |
| --- | --- |
| ![](./corn-clicker/before-mobile.png) | ![](./corn-clicker/after-mobile.png) |
| ![](./corn-clicker/before-desktop.png) | ![](./corn-clicker/after-desktop.png) |

- **Changes:** The cob has snow on its tip and a red gift bow, the golden cob a snow cap and ribbon, both on the same pixel grids so hit areas and layout are unchanged; all four farm backdrop stages are snowy with firs (the first adds a barn with lights and a wreath); evergreen panels in red frames with holly and light strings that ignore clicks.
- **Skills:** game-development + game-art + 2d-games, verification-before-completion (no SVG authored). Details in [`corn-clicker/NOTES.md`](corn-clicker/NOTES.md).
- **Notes and tests:** Every economy, timing, save, backup and interface file is untouched. The golden cob appears only after 60–120 s of play, so it was checked from a sprite render (`detail-art.png`). Unit 43/43, browser 9/9.

### Claimline (`claimline`)

| Before | After |
| --- | --- |
| ![](./claimline/before-mobile.png) | ![](./claimline/after-mobile.png) |
| ![](./claimline/before-desktop.png) | ![](./claimline/after-desktop.png) |

- **Changes:** Snow-covered arena with a candy-cane rim and a dark evergreen forest outside; you are red and the six bots are blue, green, gold, plum, ice cyan and gingerbread (original hue order); your head alone wears a Santa hat; capture trails are light strings (soft glow band, dark wire, bulbs every 1.2 cells that stay put as the trail grows).
- **Skills:** game-development + game-art + 2d-games, systematic-debugging, verification-before-completion. Details in [`claimline/NOTES.md`](claimline/NOTES.md).
- **Notes and tests:** Shape marks on heads and HUD rows kept. The first version cost 37 ms per frame against 15 ms for the original; building the snow texture at device resolution and skipping off-screen bulbs brought it to parity (about 21–24 ms against 22 ms under the same load). Bots are randomly seeded, so before and after layouts differ. Unit 50/50, browser 14/14.

---

## Quality control

### Regression results (final code)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Clean |
| `npx vitest run` (all unit tests) | 219 files, 4,354 tests passed |
| `npm run build` | Succeeds, including the service-worker kill-switch check |
| Browser suites for the 21 games, `tests/e2e`, campaigns and game sheet (833 tests, Chromium, 2 workers, 1 retry) | 826 passed, 1 skipped, 12 failed; classification below |
| Crossy Road browser suite | 62 passed |
| Minecraft (Blockcraft), Quad Clash | Mount with no page errors; no festive changes |
| `git diff 0246c6d` of `src/games/{crossy-road,blockcraft,quad-clash}`, `public/` (all game posters) and `src/core/catalog.ts` | No changes |

Each of the 12 failures was run again, one worker, on this branch and on the original commit:

- **Fail on the original code as well (pre-existing):** `redesign-shell.spec.ts:68` (phone navigation size at 360 px) and the Block Blast touch-evidence test (its gameplay assertions pass; it fails at `video.saveAs` because the container's ffmpeg is older than this Playwright version expects).
- **Timing under load (pass on both servers when rerun alone):** Ball Run boost readout (two variants), Flappy Bird scored flight, Globle drag/zoom, and two Snake tests. They fail only when two workers share a busy machine.
- **Pre-existing flaky test:** Tetris `the most recently pressed direction wins while both are held` relies on Playwright's flowing fake clock and the game's auto-shift, so any latency between steps moves the piece twice. It fails on the original code too (1 of 10 runs in a sample). Profiling found no festive cost: no long tasks after Start in 12 runs, identical frame pacing (16.7 ms median, 16.8 ms p95) and lower main-thread load than the original theme.
- **Original-palette assertions (fixed):** three `see-through-material` tests assert the original cards' exact colours. Two are pinned to the original theme; the Corn test now runs in both themes, checking the original panel colours only for the original theme and the opaque tip with at least 4.5:1 text contrast in both. The suite now passes 16/16.

Other tests that measure the original artwork's exact pixels were pinned the same way (`neon-coil/visual.spec.ts`, `animal-stack/tall-framing.spec.ts`); Animal Stack also gained a festive framing test, and Ball Run's speed-readout contrast check now measures against the active theme's bar colour. `tests/e2e/festive.spec.ts` mounts all 21 games with the theme on, checks the menu switch leaves saves and scores alone, and switches the theme both ways inside Pac-Man.

### Independent code review

A separate reviewer read the whole diff. Verdict: no critical issues; gameplay state, physics, saves, scores and input untouched; theme-off paths identical to the original. Fixed from its findings:

- Switching the theme mid-game could leave mixed artwork (Pac-Man's walls lost their colour). The shell now saves and remounts the open game when the switch changes, through the normal navigation path.
- Ball Run had gold obstacles beside gold boost gates. Obstacles are now reds and greens only; gold means boost.
- Slipline's idle green and blocked red now differ by 3.2:1 in lightness (the original lavender and red: 3.0:1).
- Block Blast hides its ribbon when colour-blind glyphs are on; Block Blast and Water Sort read festive colour names to screen readers.
- Suika's ornament cache is bounded to two scales; Pac-Man hides its antennae by class; an unused helper was removed.

Declined, with reasons: per-frame drawing in Flappy Bird (measured 0.22 ms per frame against 0.70 ms for the original) and Snake (36 static snowflakes replace the original's 36 static grass tufts, so the cost is unchanged).

### Performance

Measured per game where the skin draws every frame: Flappy Bird 0.22 ms per frame against 0.70 ms for the original; Claimline 21–24 ms against 22 ms under the same load (after caching fixed an early 37 ms version); Suika level with the original after caching (an early version ran at about 4 fps in the software-rendered test browser); Tetris identical frame pacing with lower main-thread load; Block Fill about 2 ms more per move from larger SVG markup, frame time unchanged; Ball Run adds one 64×256 texture and no draw calls. No game adds particle systems, blur filters or snowfall.

### Restoring the original look

Open the Menu and turn off **Christmas theme**. The game in play is saved and reopened in its original look; every other game opens in its original look. The choice is stored under `qcc:festive`, separate from saves, scores, sync and leaderboards. A unit test checks that every Christmas CSS rule is scoped to the theme attribute.

### Known limitations

- **Animal Stack:** hats are drawing only, so an animal can appear to rest on one; in a far taller stack than the tests use, a hat could reach about 20 units into the score area.
- **Corn Clicker:** the golden cob appears only after 60–120 s of play, so it was checked from a sprite render (`corn-clicker/detail-art.png`), not an in-game screenshot.
- **Pool:** light bulbs are about 5 px on a phone, and the light wire has square corners inside the rounded rail corners.
- **Flow Free:** on its dark background the shell's dock glass is nearly transparent (text stays readable).
- **Claimline:** bots are randomly seeded, so its before and after screenshots show different layouts.
- **Christmas is the default with no date window.** Turning it off after the season is a single default in `src/festive/festive.ts`, or the Menu switch per player.
- **Environment:** video-saving tests cannot finish in this container (ffmpeg mismatch), and only Chromium was run; WebKit was not tested.
- Running the browser tests rewrites some committed evidence images under `tests/games/*/evidence` and `docs/evidence/` (outside this report). Those rewritten files were not committed.
