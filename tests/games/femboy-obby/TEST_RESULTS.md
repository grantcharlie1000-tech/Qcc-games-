# Femboy Frosthop — test results

Recorded 7 November 2026 on the `claude/modest-carson-vvksac` branch, in a Linux cloud container. "Browser" below means **Chromium 153 headless with SwiftShader (CPU) WebGL** through the real shell at `/#/game/femboy-obby`. No physical phone, tablet or GPU was available. WebKit was not run.

## Commands and outcomes

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` (`npm run check`) | passes |
| `npx vitest run tests/games/femboy-obby` | 4 files, see totals below, all passing |
| `npx vitest run` (whole repository) | 237 files, 4758 tests, all passing (before the review fixes; rerun below) |
| `npm run build` | passes; the game is its own lazy chunk (~119 kB plus the shared Three.js chunk) and the library entry does not import it |
| `ARCADE_URL=http://127.0.0.1:4631 CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/games/femboy-obby --project=chromium --trace off` | 10 tests, all passing |
| `node scripts/perf/femboy-obby.mjs <url> 60 <checkpoint> [low]` | see Performance |

## What the automated checks prove

- **Controller (sim.test.ts):** standing is exact; diagonal speed is normalised; the standing apex is 1.6–1.75 units with about 0.75 s airtime; a running jump clears a 4-unit gap and not 5.4; early release trims the jump; coyote time works at 80 ms and not at 160 ms; a jump pressed 100 ms early is buffered once; a fall at the speed cap lands on a 0.2-unit platform (no tunnelling); a low ceiling stops the jump without launching through; a 0.3 step is climbed. The 30, 60 and 120 Hz render loops, with a 0.2 s frame spike, produce the same simulation, and catch-up is bounded.
- **Moving surfaces:** a rider stays supported through a full translating cycle and a full lift cycle; take-off inherits platform velocity once and clears it on landing; a conveyor carries only while in contact; ice keeps momentum more than three times longer than snow.
- **Crumble, spring, hazards:** a crumble tile warns, vanishes after 0.6–0.9 s and resets; a spring fires once per fresh contact; a sweeper hits after the expected quarter turn; a snowball hits a player standing in its lane.
- **Checkpoints and stars:** checkpoints activate only in order and only once; respawn uses the latest checkpoint's position and heading with velocity cleared; a star is awarded once and is not re-awarded after death, re-overlap or a new run; the start line fires once when crossed forwards.
- **Course (course.test.ts):** 30 ordered stages in six zones of five; 31 checkpoints on their pads; every spawn is safe for three seconds; 30 unique star ids, each over a surface; the teaching order is sweeper 8, moving 11, conveyor 13, ice 16, snowball 18, crumble 19, spring 22, each alone in its first stage, and stage 1 is plain hops. **An autopilot plays every one of the 30 stages through the real simulation with ordinary move-and-jump intents, with zero deaths, each in under 40 s**, plus six hazard stages with gentle help on.
- **Progress and Time Trial (progress.test.ts):** bow at checkpoint 1, one outfit per zone, Starlight at 30 stars; malformed, hostile and future saves fall back safely; locked outfits cannot be equipped from a save; restore uses checkpoint indices only; a restored trial is casual and keeps its elapsed time; time runs from the start line through falls to an ordered finish; skipped checkpoints or an unstarted run never produce a ranked time; pause, hidden, restore and assist latch casual, and the first reason is kept; encoding is monotonic (slower → lower), integer, bounded and rejects 0, fractions and more than two hours; the leaderboard shows `2:05.43`.
- **Browser (play.spec.ts):** real keyboard play of stage 1 to checkpoint 1 (bow granted, save written immediately, dock shows 2/30); walking off the edge respawns in under 600 ms with W working again; star pickup survives a reload; the wardrobe disables locked outfits and the locked Time Trial; Escape closes the panel before Study; Escape opens Study with simulation stopped and the save written, and returning resumes the same run; Time Trial starts at the start line with real keys, becomes casual after a shell pause, and finishes with a formatted time and no score recorded; three leave/re-enter cycles leave one game root, no hook and no geometry/texture growth; draw calls stay under 80 and triangles under 80k at each zone; portrait iPhone 13 emulation with three simultaneous CDP touch points (stick, look, jump) moves, turns and jumps together, with the Jump button below the dock and no horizontal overflow; landscape keeps tools above Jump.

The browser tests use the dev hook only for setup (placing on a star ledge, injecting a completed-campaign save, teleporting to stage 29) and for reading state.

## Evidence (`evidence/`)

`desktop-1440x900.png`, `phone-390x844.png`, `phone-landscape-844x390.png`, `checkpoint-and-recovery.png`, `campaign-and-trial-results.png` (a casual trial result: the teleport used for setup makes the run casual, which is the correct rule), `zone-1.png` … `zone-6.png`, and `interaction-stage1.webp` (an animated capture of real keyboard play: a deliberate fall and recovery, then stage 1 to the first checkpoint, including three more falls when the scripted key timing slipped under capture load, each recovered at the checkpoint).

## Performance

`scripts/perf/femboy-obby.mjs`, 1280×720, device pixel ratio 1, glass dock on, 5 s warm-up then 60 s of turning and walking with real key events. RAF intervals measure main-thread frame pacing, **not GPU time**. SwiftShader renders WebGL on the CPU, so these frame times describe this container, not phones or laptops.

PERF_TABLE

Renderer budgets (from `renderer.info`): PERF_BUDGET

**Not measured:** physical Android/iPhone/Chromebook frame rates, real 120 Hz displays (the 30/60/120 Hz parity is proven in unit tests with a simulated loop), GPU time and VRAM bytes.

## Online rankings

The game id is in `SCORED_GAMES`, `formatScore` decodes times, and the migration `netlify/database/migrations/20261107090000_femboy_obby_score.sql` adds `femboy-obby` to the score constraint. **It has not been applied**: it needs owner approval and database access, which this session does not have. Until it is applied, the server answers 409 `leaderboard-not-open` and the existing client keeps the score queued. No score was observed on the live board.

REVIEW_SECTION
