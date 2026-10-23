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

Meals now continue earning mass, bounded only by JavaScript's safe integer range. Length preserves the old `130 + 3 × mass` curve through 600, then grows logarithmically: `1930 + 1800 × log1p((mass − 600) / 600)`. This gives continuing physical growth without making enormous scores require proportional memory. The recent 64 movement points stay exact; when a trail exceeds 2,048 points, older points are resampled at uniform arc-length intervals and its real polyline length is recalculated. Drawing, collision and persistence share that same bounded polyline. Food remains bounded at 2,600; no population or score migration is introduced. Existing version-1 saves, including capped runs, continue to restore.

Regression coverage includes real pellet consumption past 600 and 10,000, boost spending, high-mass saves and continuation, 16,000 curved simulation ticks with bounded history and actual body growth, and a browser continuation of a legacy 600-mass save that eats to 9,600 and displays the same score in its HUD, host and ranking.

## Verification status

- Baseline aggregate: **passed**, 111 files / 2,493 tests.
- New cap/progression regressions: observed failing before implementation.
- Initial implementation aggregate: **passed**, 114 files / 2,651 tests (`npm test -- --maxWorkers=1`).
- Typecheck, production build and native diagnostic helper: **passed**; 7 helper tests.
- Focused Chromium: **passed**, 24 tests, including all 32 gardens, final Water Sort solve/save/wrap and a 600 → 9,600 Neon Coil save continuation.
- Offline production verification: **passed**, all 18 games plus Study at both `/` and `/Qcc-games-/`.
- Follow-up Chromium: **passed**, all 6 Block Fill tests with stable coordinate measurement, plus the final 9×9 Color Connect solve/save/wrap and existing held-final-gesture regression. The three-minute 32-garden timeout remains unchanged.
- Audit-fix aggregate: **passed**, 114 files / 2,657 tests. The subsequently added exact Astra reproducer passed with all 9 growth cases.
- Full local Chromium aggregate before the audit fix: **296 passed, 25 failed, 1 not run**. Follow-up runs passed all 6 Block Fill cases, both Color Connect completion cases, and all 25 Ball Run / Color Blocks correction / Flappy Bird cases. Seventeen original failures were a missing Playwright FFmpeg binary (system FFmpeg is now used from a temporary tool cache); Flappy fit checks now wait for native actionability before the unchanged bounds assertions. The two online multiplayer room tests could not reach PeerJS Cloud: the host returned HTTP 403. One Globle screenshot timed out under concurrent load.
- Full local Chromium aggregate before the row fix: **319 passed, 2 failed, 1 not run**. The failures were cloud room creation blocked by the local HTTP 403; the serial Pool relay did not run after its room failure. Those multiplayer cases passed in remote CI. Exact-head PR checks remain authoritative.
- Retained-update verification initially **failed** at `W activates after topic away and back` in both this branch and the untouched base; see `docs/evidence/charlie-levels/update-baseline-comparison.json`. Subsequent complete runs passed at both scopes with native tracing enabled and disabled, using the original fixture and all retention assertions. No service-worker or fixture correction is published. Final CI repeats the complete check against the final build.
- WebKit local installation: **blocked**, browser download host returned HTTP 403 `Domain forbidden`. Remote WebKit reproduced a real hit-area mismatch during a held gesture; the final walkthrough checks alignment before every native move and after release. Browser installation in CI now uses Ubuntu’s official archive after the Azure mirror stalled; package validation and the original full verification steps remain intact.
- Independent Astra re-audit cleared game-code head `24f45316f13696040dd2d8fd2948a5be2a094d2f`, including the exact save-loss reproduction and twelve varied 16,000-tick simulations. The subsequent Color Connect row fix requires incremental review before merge. See PR #33 for the final review and exact-head check results.

The reproducible `node scripts/profile-neon-growth.mjs` profile (run against `npm run dev -- --port 4173`) exercised 18,000 ticks per case at 600, 10,000, 100,000, five million and one billion mass, including wide turns. History stayed at or below 2,048 points and every final state restored. Observed isolated-player simulation p95 was 0.6–2.0 ms and canvas draw-call p95 was 0.2 ms on this environment. These are software Chromium measurements, not physical-device certification; `growth-performance.json` records actual versus target body length.

The new 9×9 browser walkthrough exposed an input bug: showing victory refits the stage before pointer release, so reprocessing that release against the smaller grid could retract the just-completed path. Pointer updates now freeze once full coverage is reached, and release commits the winning gesture. The browser regression verifies victory both before and after release, then save/restore and wrapping.

Independent Astra review found that repeated index decimation could create a 346-pixel segment at five million mass while the existing validator allowed 284 pixels, losing the saved run on reload. Uniform arc-length sampling replaces index decimation; restore validation is unchanged. Regression routes cover wide left/right circles and figure-eights at five million and one billion mass, checking periodic snapshots and every compaction boundary. The shared online leaderboard retains its existing 2,147,483,647 score ceiling; local mass and geometry continue beyond 600 without a leaderboard/database migration.

WebKit also resized implicit CSS grid rows while a native cell button was held. The top-row centre shifted from logical y=0.5 to 0.944 after starting the next gesture, although the grid itself did not move; after release all rows aligned again. Explicit equal rows now keep hit areas aligned with the SVG and pointer mapper throughout the gesture. The browser regression retains the original win-before-release, win-after-release, save/restore and wrap assertions, and adds alignment checks during and after each gesture.
