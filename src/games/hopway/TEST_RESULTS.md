# Hopway test results

Recorded on 1 November 2026 at commit `6e0854f` on branch `game/crossy-road` (the screenshots in section 5 were taken at `24ae153`; nothing visual changed after it), in a Linux cloud container: Node v22.23.4, Vitest 3.2.7, Playwright 1.64.1 with Chromium 153.0.8010.12 (Chrome for Testing, `/opt/pw-browsers/chromium`), three 0.180.0. WebGL ran in software (SwiftShader, `--use-gl=angle --use-angle=swiftshader`); there is no GPU here. **WebKit was not available and was not tested. No physical Chromebook or phone was tested.**

## 1. Typecheck — `npm run check`

```
> pocket-offline-arcade@1.0.0 check
> tsc --noEmit
```
Exit 0, no output: 0 errors (strict TypeScript; the repo's `check` script is the typecheck, there is no separate linter).

## 2. Unit tests — `npm test`

```
 Test Files  166 passed (166)
      Tests  3830 passed (3830)
   Duration  146.22s
```

Hopway's own suites (all in that run):

```
 ✓ tests/games/hopway/generator.test.ts (82 tests) 28723ms
 ✓ tests/games/hopway/rules.test.ts (288 tests) 572ms
 ✓ tests/games/hopway/input.test.ts (129 tests) 73ms
 ✓ tests/games/hopway/audio.test.ts (11 tests) 27ms
 ✓ tests/games/hopway/lanes.test.ts (36 tests) 24ms
 ✓ tests/games/hopway/camera.test.ts (22 tests) 16ms
```

| Requirement | Where | What runs |
| --- | --- | --- |
| Generator determinism F6 | generator.test.ts | Seeds 1–2000: one 400-row batch deep-equals `World` with irregular `ensure()` steps and chunk-by-chunk generation; hazard positions identical at t = 12.345 (50 seeds); a golden master pins seeds 1 and 2024. |
| Fairness F1–F5, F7 | generator.test.ts | **2,000 seeds × 400 rows**: independent BFS (F1), ≥ 3 open columns and the safe start (F2), every road gap ≥ `roadGapMin` ≥ 3 tiles and ≥ 3·hop + 0.25 s (F3), river reachability and log-to-log bridges (F4), rail period ≥ 5 s with ≥ 2 s quiet and the light ≥ 1.0 s ahead (F5), lily rows between log rows with 3–5 pads (F7); time-sampled checks on every lane of the first 200 seeds; chunk rules, ranges and odds. |
| Rules D1–D6 | rules.test.ts | Each death fires within one step after its exact geometric moment and not before, never under another rule; precedence when rules coincide. |
| Input buffer, key repeat | rules.test.ts, input.test.ts | Max one queued hop starting at the exact landing time, extras dropped; `e.repeat` ignored for every action. |
| Blocked moves | rules.test.ts | Tree, rock, band edges, hedge: bonk with no move, no death, no idle reset. |
| Score = max row | rules.test.ts | Up, up, down, up only reaches 2. |
| Serialize/restore | rules.test.ts | Round trip mid-hop over water and while riding a log, then identical play; every invalid field rejected (incl. rows above `MAX_ROW` and a death on another row); `dying` saves as `over`. |
| Leaderboard + migration (local DB) | tests/leaderboard/server.test.ts, tests/accounts/server.test.ts | "ranks Hopway scores and retains each player's best" and `best:hopway` / `save:hopway` sync, against the in-process `@netlify/database-dev` Postgres with all committed migrations applied. |

## 3. Build and offline check

`npm run build`:
```
✓ built in 13.65s
Offline pack: 183 files, version b2cc92b782b2
```
The Hopway chunk `assets/index-C2GVteTA.js` is 51,252 bytes raw and **20,932 bytes gzip** (budget 60 KB), plus the `three` chunk other games already share. `grep -l '__hopwayTest\|__hopwayFrames\|installTestHook' dist/assets/*.js` finds **0** files: the test hook is not in production.

`ARCADE_GAMES=hopway ARCADE_EVIDENCE_DIR=<scratch> CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/verify-offline.mjs` (the repo's offline check, limited to Hopway so the committed release evidence is untouched):
```
OFFLINE PASS root hopway + Study
OFFLINE PASS subpath hopway + Study
Verified 1 games offline at both root and repository subpath.
```
That run downloads the offline pack, reloads offline, plays a hop, switches to Study and back with a frozen snapshot and the same instance, pauses, restarts and checks for horizontal overflow at 390, 768 and 1366 px. No external requests, no page errors, no failed assets.

## 4. Browser tests (Chromium only)

Dev server: `npm run dev -- --port 4317 --strictPort`. Each run used `--workers=1` and a private `--output` directory (concurrent Playwright runs share `test-results/` and wipe each other's traces otherwise).

`CHROMIUM_PATH=/opt/pw-browsers/chromium ARCADE_URL=http://127.0.0.1:4317 npx playwright test tests/games/hopway --project=chromium --workers=1` — **51 passed (4.0 m)**:

```
deaths.spec.ts › a car squashes the player: car
deaths.spec.ts › a train hits the player at least one second after its warning light: train
deaths.spec.ts › landing in open water drowns the player: water
deaths.spec.ts › a log carries the player off the edge: swept
deaths.spec.ts › waiting too long on safe grass: a UFO warns, then beams the player up: ufo-idle
deaths.spec.ts › before the first hop there is no UFO, however long the player waits
deaths.spec.ts › three rows behind the furthest row, a UFO beams the player up: ufo-behind
deaths.spec.ts › Space starts a new run after a death
deaths.spec.ts › R starts a new run even when focus is not on the Play again button
deaths.spec.ts › Rankings opens the shell leaderboard dialog, and its close button closes it
fairness.spec.ts › generation fairness in the browser: seed 11 / 2024 / 777 (rows 0–205)
fairness.spec.ts › the flood fill and the gap measure catch rows that break the rules
fairness.spec.ts › a safe bot hops through the first 25 rows of seed 11 / 2024 / 777 with real keys
lifecycle.spec.ts › Escape opens Study with the run saved and paused; the Games link returns to the same game
lifecycle.spec.ts › the shell Restart button turns a running run into a fresh ready run
lifecycle.spec.ts › Play again after a death starts a fresh run
lifecycle.spec.ts › Restart works while the game is paused
lifecycle.spec.ts › P pauses and resumes: no frames and no input while paused
lifecycle.spec.ts › a session of hops, a death, restarts and resizes logs no errors
lifecycle.spec.ts › leaving the game stops its loop and removes the test hook
lifecycle.spec.ts › every new best reaches the shell at once, even when the game is paused straight after
lifecycle.spec.ts › a paused run is saved and comes back behind Continue after a reload
lifecycle.spec.ts › the restored Continue card takes keyboard focus, so Enter continues
lifecycle.spec.ts › screenshot at the default viewport / a 390x844 phone / a 1366x768 Chromebook
lifecycle.spec.ts › 1366x768 stays within the draw-call budget after three seconds of real time
lifecycle.spec.ts › at 366x700 the page does not scroll horizontally
movement.spec.ts › W and ArrowUp hop forward, one row each
movement.spec.ts › S and ArrowDown hop back, one row each
movement.spec.ts › A and ArrowLeft hop one column left
movement.spec.ts › D and ArrowRight hop one column right
movement.spec.ts › a mouse click at the canvas centre hops forward
movement.spec.ts › touch › a touch tap on the canvas hops forward
movement.spec.ts › touch › a native touch swipe left hops left
movement.spec.ts › swipe: 60 px up / down / left / right; a 10 px drag is a tap; a 40 by 30 diagonal is a tap
movement.spec.ts › a tree in front blocks the hop, and the run does not start
movement.spec.ts › trees beside the player block sideways hops
movement.spec.ts › the hedge behind the start blocks a hop back
movement.spec.ts › a held key hops once: auto-repeat is ignored
movement.spec.ts › the input buffer keeps one extra hop and drops the rest
movement.spec.ts › the score counts only a new furthest row
```

The train test records the first time the light is on and the death time on the frozen game clock: the warning preceded the hit by **≥ 1.0 s** (the light comes on 1.1 s before the train's front even reaches the band, then the train still has to reach the player's column), and both times agree with `lanes.ts` to within one 0.05 s slice. The "no frames after leaving" test reads a development-only frame counter: it rises while the game is open and stays constant after navigating back to the library.

`npx playwright test tests/e2e/viewport.spec.ts tests/e2e/study.spec.ts --project=chromium --workers=1` — **43 passed (4.1 m)**, including "all games fill 390×844 / 844×390 without scrolling the document" (Hopway's canvas receives a real hit at its centre) and "hopway: gameplay, Escape, frozen autosave and exact return".

## 5. Screenshots (committed, all looked at)

`tests/games/hopway/evidence/`: `chromium.png` (1280×720), `phone-390x844.png`, `chromebook-1366x768.png`, `death-car.png`, `death-train.png`, `death-water.png`, `death-swept.png`, `death-ufo-idle.png`, `death-ufo-behind.png`. Each death shot shows the card near the top with the scene that caused it below (a squashed bunny beside a car, a striped train with its signal lit, open water, a drifting log, an empty field after the UFO).

## 6. Performance (measured here; not hardware numbers)

Development build, `window.__hopwayTest.stats()` after 5 s of real play:

| Viewport | Tier | Main-thread ms/frame | Draw calls | Triangles | SwiftShader fps |
| --- | --- | ---: | ---: | ---: | ---: |
| 1366×768 | High | 2.35 | 19 | 22,608 | 7.6 |
| 1366×768 | Low | 1.20 | 20 | 20,532 | 9.3 |
| 390×844 | High | 0.91 | 21 | 11,856 | 20.3 |
| 390×844 | Low | 1.38 | 20 | 12,492 | 23.4 |

Main-thread time (simulation plus render submission) is a small fraction of the 16.7 ms budget at 60 fps; draw calls stay far under the ~120 budget (9 shader programs, 29 geometries). The frame rates in the last column are CPU rasterisation in SwiftShader and say nothing about a school Chromebook's GPU; **60 fps on real Chromebooks and phones was not verified.** The renderer's own code allocates nothing per frame (CDP sampling: ≈ 13 KB/frame, two thirds three.js internals); a 2,500-frame soak kept the retained heap within 0.25 MB. Under SwiftShader the game drops itself to Low quality after its first 2 s below 50 fps, as designed.

## 7. Database migration

`netlify/database/migrations/20261031120000_hopway_score.sql` (its own commit `c48ff07`) drops and re-adds `arcade_scores_game_id_check` with the complete list from `20261030190000_minesweeper_score.sql` plus `'hopway'`. It was applied **only** to the in-process local database created by `@netlify/database-dev` inside the Vitest leaderboard and accounts suites. No remote or production database was contacted. **It needs Charlie's approval before merge**, because merging runs migrations automatically on Netlify.

## 8. Self-review against REFERENCE.md, section by section

Hopway is deliberately an original game in the genre the reference describes, not a remake of the game the reference was written from: original name and id (`hopway`), an original bunny hero, a UFO instead of the eagle, and original voxel models, palette and UI. Every rule and number below is otherwise followed unless a deviation is listed.

| § | Reference requirement | Status | Deviation and why |
| --- | --- | --- | --- |
| 0 | No title screen, character select, menus, ads, gift/coin economy, coin counter, branded skins or music; one original character; score through the shell | Met | The one character is a cream voxel bunny with a mint scarf rather than a "chick-like hopper", so it cannot be read as the original game's chicken. |
| 1 | Rows, 9 playable columns (start col 4), darkened decor zones, one tile per hop, grid-snapped logic, score = highest row via `ctx.setScore`, QCC game-over card with Score, Best, Play again (Space/Enter/tap) and Rankings | Met | The darker zones extend to the render span (x −40..48) instead of ~4 tiles, because wide landscape views show more of each lane; nothing outside columns 0–8 can be stepped on. |
| 2 | WASD/arrows, tap = forward, swipes (≥ 24 px, 1.5× dominance), P pause, Space/Enter/R restart, Escape untouched, pointer events with `touch-action:none` on the canvas only, buffer of one with extra presses dropped and key repeat ignored, portrait and landscape, blocked moves bonk without a death or an idle reset | Met | R restarts even when a button has focus; Space/Enter defer to a focused button so a press never acts twice. |
| 3 | Hop 120 ms, 0.5-tile sine arc, linear XZ, instant facing, squash visual only with no input delay, logical move at hop start, collision on the rendered position, reduced motion removes shake/squash/particles and shortens death animations | Met | — |
| 4 | D1–D6 exactly; hitboxes 0.6 (player) and length − 0.1 per end (vehicles); death animation ≤ 900 ms (≤ 300 ms reduced); rail light ≥ 1.0 s (default 1.1 s); landing in water drowns; log drift and band edge; idle 7.0 s with a warning at 5.0 s; 3 rows behind the safe line or 3 rows back | Met | The stall hazard is a UFO (warning: a pulsing ground spotlight ring plus a wobbling tone), not an eagle. Logs and pads accept landings up to 0.2 tiles past their ends (`PLATFORM_GRACE`), a forgiving choice the reference leaves open. The safe line is pulled up to within 2 rows of the best row so the view visibly creeps when the bunny idles. |
| 5 | One seeded `mulberry32`, `Date.now() ^ runCounter`, `?seed=`/test hook, pure generator free of Three.js, hazards as functions of time, chunk weights and caps, thickness rules, per-row parameters, fairness F1–F7 tested on ≥ 2,000 seeds × 400 rows | Met | `mulberry32` is seeded per chunk from (seed, chunk index), so batch sizes never change the world; the API is `generate(state, minRows)` instead of `(seed, fromRow, count, prevState)` (the same inputs, carried in `state`). Each moving lane is a 3-mover pattern with varied gaps instead of a single spacing. Road gaps are also floored by speed (≥ 3 hops + 0.25 s window) and river gaps capped by speed (no column waits more than 2.5 s for a log). Lily rows sit only between two log rows. Generation keeps ≥ 40 rows ahead and prunes 20 behind the best row (not 12 behind the camera) because landscape views show more rows. `?seed=` works only in development builds. A golden master pins two seeds' worlds because saved runs rebuild them. |
| 6 | Orthographic, pitch ~55–60°, yaw ~15–20°, fixed frustum in tiles, band + 1 tile fitted to portrait width, landscape tiles ≥ 36 px, soft x follow clamped to keep the band on screen, z with a forward bias (player ~35 % up), auto-scroll 0.35 → 0.9 rows/s after the first hop that never moves backward | Met | Pitch 58°, yaw −16° (mirrored so lanes rise to the right). |
| 7 | `setScore` per new max row, `openRankings`, `SCORED_GAMES`, migration via drop + re-add of the full list, serialize/restore validated with fresh-run fallback, nothing personal, score 1..2147483647 | Met | The migration is a separate commit and needs Charlie's approval (section 7). Restore also rejects rows above 50,000 so a tampered save cannot freeze the tab. |
| 8 | Voxel boxes, merged/instanced geometry, flat Lambert, vertex colours, no textures/downloads/CDN, one directional light with hard shadows ≤ 1024 + hemisphere, blob shadows on Low, the palette, chunky vehicles with windows, distinct truck cabs, long striped trains, a signal pole whose lamp flashes and pulses with a bell, original character, QCC card | Met | Rail rows get a second signal post on the right (x = 9.2) because the camera yaw crops the left one in portrait. The lamp alternates at 2.5 Hz, under the three-flashes-a-second photosensitivity limit for saturated red. The only texture is the shadow map's render target. |
| 9 | Web Audio oscillators only, off by default; hop, bonk, hit, bell loop, rumble, splash, warning sweep, 25-row chime | Met | The optional "car passing" whoosh was not added. The noise-like hit and splash are built from oscillators and filters, not noise buffers. |
| 10 | Keyboard-only and touch-only play, visible focus, announcements for new best / death cause / pause and resume, colour-blind redundancy, reduced motion, no ads/analytics/network/chat/UGC/external links, no new name inputs | Met | The UFO warning is also announced, so a screen-reader player hears the stall rule before it fires. |
| 11 | 60 fps on Chromebooks and phones, Low auto-drop under a 50 fps 2 s average, pixel ratio ≤ 2, ≤ ~120 draw calls, merged/instanced geometry, no per-frame allocation, RAF paused when paused or hidden, full dispose, game chunk ≤ 60 KB gzip | Partly verified | Everything measurable here passes (section 6). 60 fps on real hardware could not be measured: this environment renders WebGL in software. |

## Known limitations

- No WebKit, no physical devices, software WebGL only.
- F4b (river-to-river bridges) is enforced and tested over the first 23 s of each lane pair's timeline; an independent probe of 5,892 pairs over 900 s found no 3 s window without a log-to-log hop.
- Sound recipes were verified against a recording fake `AudioContext`, not by ear.
