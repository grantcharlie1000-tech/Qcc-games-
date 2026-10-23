# Charlie's campaign extension and Neon Coil growth fix

Started from freshly fetched `main` at `c7fe5804db2e6aa7373ef66d9286dae3bea57499` on `codex/charlie-levels-snake-growth`. PR #32 was already part of that base; this change does not merge other PRs.

## Inventory

| Game | Actual progression on the base | This change |
| --- | --- | --- |
| Water Sort (the colour-sorting game) | 27 authored finite puzzles | 77 (+50) |
| Block Fill | 12 finite gardens | 32 (+20) |
| Color Connect | 12 finite endpoint puzzles | 32 (+20) |
| Fruit Merge | Endless score and fruit evolution | No artificial levels |
| Color Blocks | Endless seeded hands and score | No artificial levels |
| Tower | Endless stacking and height | No artificial levels |
| Snake | Endless grid run and score | No artificial levels |
| Neon Coil (snake.io-style clone) | Endless mass-based arena | Remove 600 ceiling |
| Minesweeper | 3 repeatable difficulty presets, fresh seeded boards | Presets preserved |
| Solitaire | Repeatable shuffled Klondike deals | Deals preserved |
| Ball Run | Endless procedural track and distance | No artificial levels |
| Pool | Repeatable eight-ball racks | Racks preserved |
| Animal Stack | Endless stacking and height | No artificial levels |
| Flappy Bird | Endless gate course and score | No artificial levels |
| Globle | Repeatable country-guessing rounds | Rounds preserved |
| Blockcraft | Procedural survival/creative sandbox | No artificial levels |
| Maze Muncher | Repeating maze, endless numbered waves with speed/fright tuning | No finite level catalogue added |
| Corn Clicker | Incremental production, upgrades and Replant cycles | Progression preserved |

## Puzzle design and compatibility

All original indices, boards, construction seeds and scoring records are unchanged. A frozen base fixture protects the original 27/12/12 catalogues. Existing partial and completed snapshots retain their campaign records; saved completion of the former final garden now exposes Next garden.

Water Sort's new boards use 5–7 colours and the existing seven-colour labelled palette. Independent breadth-first search proves their shortest legal solutions rise from 14 to 21 pours (chapter plateaus allow practice). Uniqueness ignores tube order and colour renaming, preventing rearranged or recoloured duplicates. Each board also has a replayable legal construction witness. The original three difficulty selectors remain compatible.

Block Fill adds exactly one open square per garden, from 37 to 56, introducing 7×7 and 8×8 layouts. Its exact path solver independently verifies every board, and tests exercise hints from every witness prefix. Color Connect adds ten 8×8 then ten 9×9 boards, each with seven pairs; within each chapter, selection was ordered by measured search effort. Endpoint layouts are distinct even under colour permutation, rotation and reflection. Independent search supplies actual full-coverage orthogonal paths.

## Snake diagnosis and resource bounds

A controlled actual food pickup reproduced `{eaten:1,mass:600}` from a 600-mass player. The score HUD, ranking and body target all consume the same mass; `Math.min(600, mass + food.value)` in the model caused the observed ceiling. The renderer did not independently cap score.

Meals now continue earning mass, bounded only by JavaScript's safe integer range. Length preserves the old `130 + 3 × mass` curve through 600, then grows logarithmically: `1930 + 1800 × log1p((mass − 600) / 600)`. This gives continuing physical growth without making enormous scores require proportional memory. The recent 64 movement points stay exact; when a trail exceeds 2,048 points, older points are decimated and its real polyline length is recalculated. Drawing, collision and persistence share that same bounded polyline. Food remains bounded at 2,600; no population or score migration is introduced. Existing version-1 saves, including capped runs, continue to restore.

Regression coverage includes real pellet consumption past 600 and 10,000, boost spending, high-mass saves and continuation, 16,000 curved simulation ticks with bounded history and actual body growth, and a browser continuation of a legacy 600-mass save that eats to 9,600 and displays the same score in its HUD, host and ranking.

## Verification status

- Baseline aggregate: **passed**, 111 files / 2,493 tests.
- New cap/progression regressions: observed failing before implementation.
- Final unit, browser, build, update and offline results: in progress; exact results will be recorded before merge.
- WebKit local installation: **blocked**, browser download host returned HTTP 403 `Domain forbidden`. Chromium is installed locally. WebKit execution is pending CI and is not claimed as passed.
- Independent Astra review: pending parent audit; merge is held until resolved.
