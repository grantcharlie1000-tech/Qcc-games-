# Femboy Frosthop — test results

## frosthop-v2: harder course (7 November 2026)

All 30 stages were redesigned to be much harder, and the obstacle pool grew: kill bricks (strips, checkerboards, sliders, pop-up pistons), fairy-light panels that are solid only while lit, swinging pendulums, 3- and 4-arm sweepers, low jump-rope sweepers, pusher blocks and sideways conveyors joined the original set.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | passes |
| `npx vitest run tests/games/femboy-obby` | 3 files, 89 tests, all passing (adds kill brick, panel, pendulum, multi-arm and jump-rope tests, a difficulty test, and the new teaching order) |
| `npx vitest run` (whole repository) | 240 files, 4789 tests, all passing |
| `ARCADE_URL=http://127.0.0.1:5291 CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/games/femboy-obby --project=chromium --trace off` | 10 of 11 pass. The portrait touch test fails in this container; it fails the same way 3 out of 3 times on the unchanged pre-v2 code, so it is not caused by this change |

- **Every stage is still beatable:** the autopilot plays all 30 stages with zero deaths at normal speed, and eight hazard stages with gentle help on. It now jumps kill bricks, times jumps over low sweeper arms, leans against conveyor belts, and only commits to a landing it can stand on for half a second (so a sliding spike or a panel about to go dark counts as a failed landing).
- **Draw calls** stay under 80 at every zone: each sweeper and each pendulum is one merged mesh.
- **Time Trial e2e:** stage 30 can no longer be cleared by holding W, so the test now drops the player onto the finish podium's edge after teleporting (the stage's obstacles are covered by the course tests).

## frosthop-v1 (original course)

Recorded 7 November 2026 on the `claude/modest-carson-vvksac` branch, in a Linux cloud container. "Browser" below means **Chromium 153 headless with SwiftShader (CPU) WebGL** through the real shell at `/#/game/femboy-obby`. No physical phone, tablet or GPU was available. WebKit was not run.

## Commands and outcomes

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` (`npm run check`) | passes |
| `npx vitest run tests/games/femboy-obby` | 4 files, 81 tests, all passing |
| `npx vitest run` (whole repository) | 237 files, 4760 tests, all passing (after the review fixes) |
| `npm run build` | passes; the game is its own lazy chunk (~119 kB plus the shared Three.js chunk) and the library entry does not import it |
| `ARCADE_URL=http://127.0.0.1:4631 CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/games/femboy-obby --project=chromium --trace off --workers 1` | 11 tests, all passing (the suite was run several times; one earlier flaky wait was replaced by a condition) |
| `node scripts/perf/femboy-obby.mjs <url> 60 <checkpoint> [low]` | see Performance |

## What the automated checks prove

- **Controller (sim.test.ts):** standing is exact; diagonal speed is normalised; the standing apex is 1.6–1.75 units with about 0.75 s airtime; a running jump clears a 4-unit gap and not 5.4; early release trims the jump; coyote time works at 80 ms and not at 160 ms; a jump pressed 100 ms early is buffered once; a fall at the speed cap lands on a 0.2-unit platform (no tunnelling); a low ceiling stops the jump without launching through; a 0.3 step is climbed. The 30, 60 and 120 Hz render loops, with a 0.2 s frame spike, produce the same simulation, and catch-up is bounded.
- **Moving surfaces:** a rider stays supported through a full translating cycle and a full lift cycle; take-off inherits platform velocity once and clears it on landing; a conveyor carries only while in contact; ice keeps momentum more than three times longer than snow.
- **Crumble, spring, hazards:** a crumble tile warns, vanishes after 0.6–0.9 s and resets; a spring fires once per fresh contact; a sweeper hits after the expected quarter turn; a snowball hits a player standing in its lane.
- **Checkpoints and stars:** checkpoints activate only in order and only once; respawn uses the latest checkpoint's position and heading with velocity cleared; a star is awarded once and is not re-awarded after death, re-overlap or a new run; the start line fires once when crossed forwards.
- **Course (course.test.ts):** 30 ordered stages in six zones of five; 31 checkpoints on their pads; every spawn is safe for three seconds; 30 unique star ids, each over a surface; the teaching order is sweeper 8, moving 11, conveyor 13, ice 16, snowball 18, crumble 19, spring 22, each alone in its first stage, and stage 1 is plain hops. **An autopilot plays every one of the 30 stages through the real simulation with ordinary move-and-jump intents, with zero deaths, each in under 40 s**, plus six hazard stages with gentle help on.
- **Progress and Time Trial (progress.test.ts):** bow at checkpoint 1, one outfit per zone, Starlight at 30 stars; malformed, hostile and future saves fall back safely; locked outfits cannot be equipped from a save; restore uses checkpoint indices only; a restored trial is casual and keeps its elapsed time; time runs from the start line through falls to an ordered finish; skipped checkpoints or an unstarted run never produce a ranked time; pause, hidden, restore and assist latch casual, and the first reason is kept; encoding is monotonic (slower → lower), integer, bounded and rejects 0, fractions and more than two hours; the leaderboard shows `2:05.43`.
- **Browser (play.spec.ts):** a new player's first campaign run is timed and Ranked from the start line; real keyboard play of stage 1 to checkpoint 1 (bow granted, save written immediately, dock shows 2/30); walking off the edge respawns in under 600 ms with W working again; star pickup survives a reload; the wardrobe disables locked outfits and the locked Time Trial; Escape closes the panel before Study; Escape opens Study with simulation stopped and the save written, and returning resumes the same run; Time Trial starts at the start line with real keys, becomes casual after a shell pause, and finishes with a formatted time and no score recorded; three leave/re-enter cycles leave one game root, no hook and no geometry/texture growth; draw calls stay under 80 and triangles under 80k at each zone; portrait iPhone 13 emulation with three simultaneous CDP touch points (stick, look, jump) moves, turns and fires a real jump event before the plaza edge while the stick is held, with the Jump button below the dock and no horizontal overflow; landscape keeps tools above Jump.

The browser tests use the dev hook only for setup (placing on a star ledge, injecting a completed-campaign save, teleporting to stage 29) and for reading state.

## Evidence (`evidence/`)

`desktop-1440x900.png`, `phone-390x844.png`, `phone-landscape-844x390.png`, `checkpoint-and-recovery.png`, `campaign-and-trial-results.png` (a casual trial result: the teleport used for setup makes the run casual, which is the correct rule), `zone-1.png` … `zone-6.png`, and `interaction-stage1.webp` (an animated capture of real keyboard play: a deliberate fall and recovery, then stage 1 to the first checkpoint, including three more falls when the scripted key timing slipped under capture load, each recovered at the checkpoint).

## Performance

`scripts/perf/femboy-obby.mjs`, 1280×720, device pixel ratio 1, glass dock on, 5 s warm-up then 60 s of turning and walking with real key events. RAF intervals measure main-thread frame pacing, **not GPU time**. SwiftShader renders WebGL on the CPU, so these frame times describe this container, not phones or laptops.

| Run | Start | Frames | p50 frame interval | p95 frame interval | Draw calls (p50 / max) | Triangles (p50 / max) |
| --- | --- | --- | --- | --- | --- | --- |
| Normal | checkpoint 7 (Candy Cane Catwalk) | 1050 | 33.4 ms | 166.7 ms | 28 / 34 | 41.7k / 44.7k |
| Normal | checkpoint 12 (Cozy Knit Workshop), after review fixes | 935 | 49.9 ms | 183.4 ms | 32 / 36 | 41.7k / 57.5k |
| Normal | checkpoint 17 (Peppermint Ice Rink) | 863 | 50.0 ms | 199.9 ms | 28 / 36 | 43.6k / 45.7k |
| Normal | checkpoint 22 (Ornament Skyway) | 1097 | 33.4 ms | 166.6 ms | 27 / 38 | 42.9k / 43.0k |
| Low graphics | checkpoint 12, after review fixes | 892 | 66.6 ms | 183.3 ms | 31 / 34 | 41.7k / 57.5k |

In this container, frames are CPU-bound by SwiftShader at about 20–30 fps, so neither the 60 fps target nor the stable 30 fps low mode can be confirmed here. Low graphics renders at most 30 times a second and caps the pixel ratio at 1; at this device pixel ratio of 1 it saves nothing over normal, and its RAF p50 reflects skipped renders, not slower ones.

Renderer budgets (from `renderer.info`): at most 38 draw calls and 57.5k triangles in every measured frame, against the initial budgets of 80 and 80k. In the 1440×900 desktop screenshot test and in each of the six zone captures, draw calls stayed under 80 and triangles under 80k (asserted). The game chunk is about 119 kB of JavaScript, and its models and texture total about 220 kB.

**Not measured:** physical Android/iPhone/Chromebook frame rates, real 120 Hz displays (the 30/60/120 Hz parity is proven in unit tests with a simulated loop), GPU time and VRAM bytes.

## Online rankings

The game id is in `SCORED_GAMES`, `formatScore` decodes times, and the migration `netlify/database/migrations/20261107090000_femboy_obby_score.sql` adds `femboy-obby` to the score constraint. **It has not been applied**: it needs owner approval and database access, which this session does not have. Until it is applied, the server answers 409 `leaderboard-not-open` and the existing client keeps the score queued. No score was observed on the live board.

## Independent review

An independent reviewer read the full diff (commit `bbcbf15`) against the pack's spec. Every finding was checked against the code and fixed:

1. **Critical:** on touch, Jump did nothing while the move stick was held (`syncKeys` returned early). Fixed. The browser test now requires a jump event before the plaza edge with the stick held; it was confirmed failing on the old code and passing on the fix.
2. Restarting from the shell menu inherited the menu's pause, so the new run was always casual. A fresh attempt no longer inherits a pause from before it existed; covered by a browser test.
3. The valley floor followed the furthest stage reached, so on replays it could sit above the course or act as a ghost floor. It now follows the stage being played.
4. A finished timed run reopened as an endless casual timer. A finished timer is no longer saved.
5. Per-step and per-frame allocations: collision boxes are pooled, Euler and snowball scratch objects are reused, and the depenetration array is gone.
6. On the take-off frame, platform velocity was applied twice (about 5 cm). It is now applied once; a new unit test checks the take-off step exactly.
7. Checkpoints counted before a trial started. They now count only after the start line, the start line spans the plaza plus a half-width, and finishing an untimed trial says why.
8. The course now holds still while the wardrobe panel or result card is open; the wall clock keeps running.
9. A ranked label no longer flips to Casual after the finish.
10. Restart after a completed campaign starts again from stage 1.
11. The result button label is reset; the help suggestion warns that it makes a timed run casual; completion is derived from the furthest checkpoint instead of trusted from the save.
12. Models that finish loading after the game is closed are disposed.

## User follow-up: leaderboard ranks time to completion

At the user's request, every run that starts at the stage 1 start line is timed for the leaderboard, including a new player's first campaign run, not only the Time Trial that opens afterwards. The same eligibility rules apply. A timed campaign run is saved with its timer and comes back casual after a reload.
