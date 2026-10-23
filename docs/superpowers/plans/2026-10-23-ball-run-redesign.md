# Ball Run Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Ball Run to the reference brief: a seeded course of curves, banks, ribbons, crests, drops and boost gates; slower acceleration to a much higher speed cap, with each gate a permanent speed boost; many more, randomly composed, harder (but always passable) obstacles; Easy/Medium/Hard setup; a death burst; and per-difficulty today/week/all-time records.

**Architecture:** Pure, deterministic modules (`config.ts` contract → `course.ts` generator → `model.ts` simulation, plus `records.ts`) run under Vitest's node environment. `scene.ts` is the only Three.js file; `index.ts` owns DOM UI, input, lifecycle and shell wiring. Rendering and collision read the same obstacle poses from the course.

**Tech Stack:** TypeScript (strict), Vite, Three r180 (already a dependency), Vitest (node env), Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-10-23-ball-run-redesign-design.md`. Reference brief: `/root/.claude/uploads/903b7eb9-d5b0-5b08-9e2c-a0eef9d45be8/3304d0d7-Ball-Run-Reference.pdf` (rendered pages: `/tmp/claude-0/-home-user-Qcc-games-/903b7eb9-d5b0-5b08-9e2c-a0eef9d45be8/scratchpad/pdf/page-*.jpg`). **Use pages 1–9 only; Charlie asked to ignore the final page (page-10).** Shared contract (already written, do not change names without the controller): `src/games/ball-run/config.ts`.

## Global Constraints

- All tuning lives in `src/games/ball-run/config.ts` (`CONFIG`, constants). Numbers there are the spec's design calls; use them, do not re-derive them.
- `course.ts`, `model.ts`, `records.ts` import nothing from Three or the DOM (Vitest runs in `node`).
- Fixed 120 Hz step (`STEP`); simulation must never depend on render frame rate; no `Date.now()`/`Math.random()` in pure modules (dates are passed in).
- Same seed + difficulty ⇒ identical course regardless of query order or how far ahead it was generated.
- No new runtime dependency, external asset, shader or post-processing. Code style: match the repository (compact TypeScript, short comments only where a reason is not obvious).
- Shell owns back, pause, restart, rules, menu, pause overlay (z-index 20), autosave and Escape. The game never binds Escape and keeps its overlays below z-index 20.
- Records are stored only inside the game snapshot passed to `context.save` (no own localStorage keys).
- Reduced motion = `context.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches`, read at use time.
- Accessible names: `Play`, `Continue`, `Play again`, `Home`, slider `Difficulty`, help toggle `How to play`. Existing headings/links stay: `Graphics interrupted`, `3D graphics unavailable`, `Choose another game`.
- Data attributes on `.ball-run`: `data-phase`, `data-x` (3 dp), `data-distance` (3 dp), `data-grounded`, `data-ball-screen-x/y` (5 dp), `data-aspect` (5 dp), `data-draw-calls`, `data-geometries`, `data-difficulty`, `data-speed` (2 dp), `data-boost` (`true` while Speed Up feedback shows), `data-gates` (gates passed), `data-score`.
- Draw calls while running ≤ 11, geometries ≤ 4 (today 7/3); instanced buffers allocated once and reused.
- Do not commit; the controller handles git. Do not edit files outside your task's list.

## Review Focus

1. A course that kills a perfect player: every pattern, road feature and speed must leave a reachable route → Task 3 bot traverses every difficulty, many seeds, from the start and at the speed cap.
2. A run abandoned via shell Restart, or a throttled score report, silently losing a record → Task 5 tests Restart-mid-run commits once and the final score report is sent.
3. Date edges: Sunday→Monday week rollover, new year, DST days, a stored future/garbage key → Task 1 tests.
4. Stale input across lifecycle edges (held key through death, pause, Study, Game Over → Play again, resize, pointer cancel) → Task 5 tests in the browser.
5. Old saves (v1–3) and malformed v4 snapshots: never throw, keep records, never resume an old course position → Task 3 tests.

---

### Task 1: Records

**Files:**
- Create: `src/games/ball-run/records.ts`
- Test: `tests/games/ball-run/records.test.ts`

**Interfaces:**
- Consumes: `Difficulty`, `DIFFICULTIES`, `isDifficulty` from `config.ts`.
- Produces:
  - `interface DifficultyRecords { allTime: number; day: string; dayBest: number; week: string; weekBest: number }` (`day`/`week` are `'YYYY-MM-DD'` local keys, `''` when unset)
  - `type Records = Record<Difficulty, DifficultyRecords>`
  - `emptyRecords(): Records`
  - `dayKey(date: Date): string` — local calendar date
  - `weekKey(date: Date): string` — local date of that week's Monday
  - `viewRecords(records: Records, difficulty: Difficulty, now: Date): { today: number; week: number; allTime: number }` — stale day/week read as 0
  - `commitScore(records: Records, difficulty: Difficulty, score: number, now: Date): Records` — returns a new object; resets stale day/week before comparing; ignores non-finite/negative scores
  - `type TargetScope = 'today' | 'week' | 'allTime' | 'new'`
  - `nextTarget(view: { today: number; week: number; allTime: number }, score: number): { scope: TargetScope; label: string; value: number }` — labels `TODAY`, `THIS WEEK`, `ALL TIME`, `NEW BEST`
  - `restoreRecords(value: unknown): Records` — never throws; invalid entries become empty; integers clamped to `0..2147483647`

- [ ] **Step 1: Write the failing tests** in `records.test.ts`:
  - `weekKey(new Date(2026, 9, 25))` (Sunday) is `'2026-10-19'`; `weekKey(new Date(2026, 9, 26))` (Monday) is `'2026-10-26'`; `weekKey(new Date(2027, 0, 1))` is `'2026-12-28'`; `dayKey(new Date(2026, 9, 23, 23, 59))` is `'2026-10-23'`.
  - DST: for every day of 2026, `weekKey` is a Monday (`new Date(key+'T12:00').getDay()===1`) and `dayKey(d)` round-trips through `new Date(y, m-1, d)`.
  - `commitScore`: a later day keeps week/all-time and resets today; a later week resets today and week; a lower score never lowers any value; the result is a new object (input unchanged).
  - `nextTarget({today:51,week:51,allTime:143}, 0)` → `{scope:'week',label:'THIS WEEK',value:51}`; at 52 → all-time 143; at 144 → `{scope:'new',label:'NEW BEST',value:144}`; `nextTarget({today:20,week:51,allTime:143}, 5)` → today 20; all zeros at 0 → `NEW BEST` 0.
  - `restoreRecords` of `null`, `{}`, `{easy:{allTime:NaN}}`, `{hard:{allTime:-4,day:'nope'}}` yields valid records with zeros/`''` and no throw; a valid object round-trips through JSON.
  - Fresh profiles start at zero: `emptyRecords()` has no 79 or 143 anywhere.
- [ ] **Step 2:** `npx vitest run tests/games/ball-run/records.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `records.ts`. Build Monday dates with `new Date(y, m, d - ((getDay()+6)%7))` (never millisecond arithmetic, which breaks on DST days).
- [ ] **Step 4:** Re-run → PASS.

### Task 2: Course generator

**Files:**
- Create: `src/games/ball-run/course.ts`
- Test: `tests/games/ball-run/course.test.ts`

**Interfaces:**
- Consumes: everything in `config.ts`.
- Produces: `getCourse(seed: number, difficulty: Difficulty): Course` (the `Course` interface in `config.ts`), memoised by `seed:difficulty` keeping at most 6 courses (evict oldest). Also export `reachStep(speed: number, metres: number): number` = `REACH_SAFETY * lateralSpeed(speed) * metres / speed` for reuse in tests.

**Track model (decided):**
- Elevation `e(d) = -SLOPE·d + local(d)`; every segment starts and ends with `local = 0`, `bank = 0`, `width = CONFIG.roadWidth`; centre is continuous and always within `±CENTER_LIMIT`.
- Segment length scale `s(d) = clamp(speed(d)/14, 1, 3.5)` applied to these unscaled ranges; feature amplitudes are not scaled:
  - `warmup`: first segment only, `WARMUP` m straight at centre 0, flat.
  - `straight` 24–48 m; local rise `0.3·sin²(πt)`.
  - `bend` 40–70 m; `c = c0 + A·sin(2πt)`, `|A|` 0.8–2.0 limited by `CENTER_LIMIT`.
  - `offset` 18–28 m; `c = c0 + (c1−c0)·smoothstep(t)`, `c1` in `±CENTER_LIMIT`, `|c1−c0| ≥ 1.2`.
  - `ribbon` 40–70 m; width eases to `ribbonWidth` over the first 25 %, holds, eases back over the last 25 % (smoothstep).
  - `ribbonBend` 50–80 m; ribbon plus `A·sin(2πt)`, `|A|` 0.6–1.2.
  - `bank` 30–50 m; `bank = B·sin²(πt)`, `|B|` = 0.5–1 × `maxBank`, random sign.
  - `crest` 30–60 m, `local = H·sin²(πt)`, H 1.5–3.5; `dip` 30–50 m, H −1.0 to −2.0.
  - `drop`: approach 20–30 m with `local` rising to `h` (2–4) by smootherstep (zero slope at the lip); gap `G` 2–4 m with `ground=false` and elevation = landing level (`local = 0`); landing pad ≥ `max(20, maxSpeed·sqrt(2h/GRAVITY) + 12)` m flat. Clamp `G ≤ speed(lip)·sqrt(2h/GRAVITY) − 1.2` so it is always cleared at the speed there.
  - `gate`: 30 m straight, full width, centre constant, `tunnel=true`. Gates are **scheduled, not drawn**: the generator integrates running time (`Σ length / speed`) and inserts a gate segment once the time since the previous gate (or since distance 0) reaches an interval drawn from `CONFIG[d].gate.interval`; the next segment is always a `straight`. `Gate.clearEnd = end + speed(end)·1.0`. Gate index counts from 0; `gatesBefore(d)` counts gates with `start ≤ d`; `speed(d) = speedAt(difficulty, d, gatesBefore(d))`.
- Selection between gates: weighted by `CONFIG[d].segments`; no `drop` after a `drop`.
- Universal traversability: before accepting a segment, run the reachability pass **backwards** over it from the full allowed band at its end; the result at its start must cover the whole allowed band. If not, retry with length ×1.5 (twice), then substitute a `straight`.

**Reachability pass (decided):** sets of disjoint `[lo, hi]` world-x intervals for the ball centre, stepped every 1 m (and exactly at obstacle distances):
- allowed band: `[c − w/2 + m, c + w/2 − m]`, `m = EDGE_SUPPORT + 0.12` (in a tunnel `m = RADIUS`), minus each obstacle whose depth span ± `(RADIUS + 0.06)` covers the step: its horizontal extent `±(w·cos b + h·sin b)/2` around the pose x, ± `(RADIUS + 0.06)`; sliders block their whole sweep.
- forward step: shift by `BANK_DRIFT·sin(bank)·Δ/v`, dilate by `reachStep(v, Δ)`, intersect with the next allowed band. `v` is `course.speed(d)` (exact: gates are unavoidable).

**Obstacle rows (decided):**
- Row cursor starts at `WARMUP + 10`. Gap to the next row: seconds drawn from `lerp(introInterval, rowInterval, p)`, `p = clamp((d − WARMUP)/rampDistance, 0, 1)`, times `speed(d)`. After `restEvery` rows, skip `restSeconds`·speed.
- No obstacles in: warmup; `[gate.start − 5, gate.clearEnd]`; ribbon/ribbonBend segments; `[lip − 8, gapEnd + 12]` around each drop; the middle 40 % of crests and dips.
- Patterns (weights `CONFIG[d].patterns`, `hw` = minimum half-width over the pattern span, `g = minGap`, all blocks inside `|u| + w/2 ≤ hw − 0.05`):
  - `single` w 0.8–1.6, h 0.9–2.2, depth 0.8–1.6, random u.
  - `bigBlock` w 1.8–min(2.8, 2hw−g−0.2), h 2.2–3.2, depth 1.6–3.
  - `pair` two singles at one distance.
  - `gate` one gap of width g..g+0.9 at a random position; edge-to-gap blocks (omit any side narrower than 0.3); h 1.0–1.8, depth 0.7–1.2.
  - `doubleGate` two gaps ≥ g separated by a block ≥ 0.6 (falls back to `gate` if the road is too narrow).
  - `slalom` 3–5 edge-anchored blocks covering 45–60 % of the width, alternating sides, 0.35–0.5 s apart.
  - `zigzag` 3–4 gates 0.4–0.6 s apart, gap centres alternating sides by ≥ 0.6·hw.
  - `scatter` 4–7 cubes 0.6–0.9 over 1.0–1.5 s.
  - `slider` 1 (Hard: 1–2) blocks w 0.9–1.4, amplitude 0.6–1.6 clipped to keep the sweep on the road, period 1.4–2.6 s, phase 0–2π. Weight 0 on Easy.
  - `wallRun` one edge-anchored block covering 35–50 % of the width, depth 6–14 m.
- Acceptance: propagate the reachability set through the pattern span; accept only if it never empties and is at least 0.25 m wide at every blocked step. Up to 6 attempts (fresh pattern each), otherwise no row (advance by half the gap).
- Two seeded PRNG streams (road, rows) derived from `seed` and the difficulty index (e.g. mulberry32 of a hash); generation is lazy and sequential: `sample`/`forEachObstacle` call an internal `ensure(d)` that keeps road ≥ 400 m and rows ≥ 300 m past `d`.

- [ ] **Step 1: Write the failing tests** in `course.test.ts` (seeds 1–24 unless stated, all three difficulties):
  - determinism: two fresh `getCourse` instances (clear by requesting 7 other courses) agree on `sample` at 500 random distances and on every obstacle to 3 km, whether queried near-first or far-first.
  - continuity: at every segment boundary and every 0.25 m to 5 km, `center`, `width`, `bank`, `elevation` are continuous (|Δ| < 0.05 per 0.25 m) except across a drop gap; `|center| ≤ CENTER_LIMIT`; `ribbonWidth ≤ width ≤ roadWidth`; `|bank| ≤ maxBank`.
  - opening: `[0, WARMUP]` is straight, centre 0, no obstacles; `sample(0).center === 0`.
  - vocabulary: within 6 km every difficulty produces bend, offset, ribbon, bank, crest, drop and gate segments (Medium/Hard also ribbonBend); gates arrive every `gate.interval` seconds of running (check the integrated time between consecutive gates lies within the interval, ±1 segment).
  - clear zones: no obstacle overlaps a gate clear zone, ribbon, drop exclusion zone or warmup; every obstacle lies on the road surface (`|offset|` + half-width, sweep included, ≤ half-width at its distance).
  - drops: for each drop, a point mass leaving the lip at `speed(lip)` along `-SLOPE` and falling under `GRAVITY` lands ≥ 1 m past the gap and before the pad ends even at `maxSpeed`.
  - density: measured over 1–6 km at `course.speed` (clear zones included), blocks per second ≥ 0.6 (Easy), ≥ 0.9 (Medium), ≥ 1.3 (Hard) and rows per second ≥ 0.35 / 0.5 / 0.7 — the old game averaged ~0.4 blocks per second; Hard > Medium > Easy.
  - variety: over 6 km, Hard uses ≥ 8 pattern kinds, sliders appear on Medium/Hard and never on Easy; 32 seeds give ≥ 28 distinct first-five-row layouts.
  - feasibility (independent of the generator's internals): re-run the interval reachability over 0–6 km for each seed/difficulty using `reachStep` with 0.95× the reach and assert the set never empties.
- [ ] **Step 2:** `npx vitest run tests/games/ball-run/course.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `course.ts` (`getCourse`, `reachStep`; internal segment and row generation as decided above). `pose()`: `x = c + offset + slide`, surface point `y_s = e − (x − c)·tan b`, box centre `x + sin b·h/2`, `y_s + cos b·h/2`, `roll = b`.
- [ ] **Step 4:** Re-run → PASS; also time 20 km of generation for Hard (target < 150 ms) and report it.

### Task 3: Simulation, saves and the bot

**Files:**
- Replace: `src/games/ball-run/model.ts`
- Replace: `tests/games/ball-run/model.test.ts`
- Create: `tests/games/ball-run/bot.ts`, `tests/games/ball-run/bot.test.ts`

**Interfaces:**
- Consumes: `config.ts`; `getCourse` (Task 2); `Records`, `emptyRecords`, `restoreRecords` (Task 1); `sweepSphereBox` from `src/core/collision.ts`.
- Produces:
  - `createRun(seed: number, run: number, difficulty: Difficulty): Run` — phase `ready`, distance 0, x 0, grounded on the surface.
  - `runSpeed(run: Run): number` = `getCourse(seed, difficulty).speed(distance)`.
  - `steer(body: {x: number; vx: number}, input: number, dt: number, lateral: number): void` — analytic first-order response at `STEER_RESPONSE` toward `clamp(input,−1,1)·lateral` (frame-rate independent, as today).
  - `step(run: Run, input: number, dt: number): void` — ignores `dt ≤ 0`, `dt > 0.05`, non-finite `dt`/`input`; mutates `run`.
  - `interface Snapshot { version: 4; difficulty: Difficulty; records: Records; run: Run | null }`
  - `restoreSnapshot(value: unknown): { difficulty: Difficulty; records: Records; run: Run | null; migrated: boolean } | null`

**Step semantics (decided):**
- running: speed `v = runSpeed`; steer with `lateralSpeed(v)`, then `x += BANK_DRIFT·sin(bank)·dt`; inside a tunnel clamp x to `c ± (w/2 − RADIUS)` and zero `vx` when clamped (harmless walls); `distance += v·dt`, `elapsed += dt`, `speedUpTime = max(0, speedUpTime − dt)`; crossing a gate `start` with `gate.index > gateIndex` sets `gateIndex = index` and `speedUpTime = GATE_FEEDBACK` (the speed gain itself comes from `course.speed`).
- support: `ground && |x − c| ≤ w/2 − EDGE_SUPPORT`; surface centre height `S = surfaceHeight + RADIUS/cos(bank)`.
- grounded & supported: implied `vyS = (S_new − S_old)/dt`; if `(vyS − vy)/dt < −GRAVITY` lift off keeping `vy`, else `height = S_new`, `vy = vyS`. Grounded & unsupported: airborne keeping `vy`.
- airborne: `height += vy·dt − GRAVITY·dt²/2; vy −= GRAVITY·dt`; land when supported, `height ≤ S_new` and the previous height was ≥ previous `S − 0.05`.
- fall: airborne and `height < S(at x clamped onto the road) − FALL_DEPTH` → `phase='dying'`, `reason='fall'`, score frozen.
- blocks: for each obstacle overlapping `[min(d0,d1) − RADIUS, max(d0,d1) + RADIUS]` (widen by `maxDepth`), take poses at old and new `elapsed`, move both ball endpoints into the box frame (translate, rotate by `−roll` about the forward axis) and `sweepSphereBox` against `[0,0,0]`/half-sizes. Hit → `phase='dying'`, `reason='block'`, ball stays at its pre-step position, `score = floor(old distance)`.
- `score = floor(distance)` while running.
- dying: `dyingTime += dt`; a `fall` keeps moving forward and falling (visual), a `block` stays frozen; at `DYING_DURATION` → `phase='over'`.
- `ready`/`over`: no-op.

**Restore (decided):** v4 validates every field (finite, `isDifficulty`, phase, integer seed `1..0xffffffff`, run `1..1e8`, `|x| ≤ 50`, `|vx| ≤ 40`, `|vy| ≤ 200`, distance `0..1e8`, `gateIndex === course.gatesBefore(distance) − 1`, `0 ≤ speedUpTime ≤ GATE_FEEDBACK`, score = floor(distance) unless dying/over, grounded ⇒ height within 0.01 of `S`); a `dying` snapshot restores as `over`; an invalid run gives `run: null` but keeps valid records. v1–v3 (flat objects with `version` 1–3 and a finite `best ≥ 0`) → `{difficulty:'medium', records: emptyRecords() with medium.allTime = floor(best), run: null, migrated: true}`. Anything else → `null`.

- [ ] **Step 1: Write the failing tests** in `model.test.ts`:
  - speed: integrating `d' = course.speed(d)` numerically (gates included) for seeds 1–8, the speed after 30 s and 60 s is below the old curve's (`v = min(22, 12 + 0.012·d)` integrated the same way) for every difficulty, so acceleration is slower; `course.speed` is non-decreasing in distance, exceeds 22 m/s later in the run, and reaches exactly 40/50/62 (and never more).
  - gates: driving a run across gate 0 sets `gateIndex` 0 and `speedUpTime = GATE_FEEDBACK` exactly once; speed just after the gate exceeds speed just before by the gate gain (± the ramp over that metre) and **stays** higher (still ≥ that gain above the no-gate ramp 10 s later); at the cap a gate adds nothing but still fires feedback; `runSpeed` never exceeds `maxSpeed`.
  - steering: `steer` at 30 Hz vs 144 Hz equal to 1e-10; lateral authority at 50 m/s exceeds 12 m/s.
  - bank drift: on a bank segment with input 0 the ball drifts toward the low side.
  - crest: at the speed cap a run lifts off over a crest and lands; at start speed it stays grounded.
  - drop: a run with input steering to the road centre crosses every drop in the first 6 km on all difficulties (grounded after each gap).
  - tunnel walls: holding input 1 inside a tunnel keeps the ball on the road with `x = c + w/2 − RADIUS`.
  - edge fall: holding input 1 outside tunnels → `dying` with `reason 'fall'`, score frozen thereafter, then `over` after `DYING_DURATION`.
  - block: placing the ball in front of the first block at the speed cap → `dying` with `reason 'block'`; position frozen; no tunnelling for a 0.7 m-deep block.
  - sliders: the same ball path hits a slider at one `elapsed` and misses it half a period later.
  - non-finite input/dt leave the run unchanged.
  - restore: v4 round-trip (running, airborne, mid Speed Up feedback) continues identically for 300 steps; each invalid field → `run:null` with records kept; `dying` → `over`; v1 `{version:1,…,best:143}` → medium all-time 143, `run:null`, `migrated:true`; garbage → `null`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `model.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Bot.** `bot.ts` exports `driveBot(run: Run, metres: number): { run: Run; steps: number }`. It re-plans every 6 steps with its own interval reachability (0.85 of real lateral authority, real `runSpeed` over the horizon, horizon `max(120, 2.5·speed)` m, 1 m steps), backtracks a concrete x per metre, and steers with `input = clamp(k1·(xTarget(d + 0.12·v) − x) − k2·vx)`. `bot.test.ts`: for each difficulty, 12 seeds × 3000 m from the start, and 4 seeds × 1500 m starting 200 m past the first distance where `course.speed` reaches the cap (set `distance`, `gateIndex = gatesBefore − 1`, `x = center`, `height = S`, grounded), all end `running`. On a failure, report seed, difficulty, distance and the nearest obstacles, and determine whether the generator or the bot is at fault before changing either.
- [ ] **Step 6:** `npx vitest run tests/games/ball-run` → all PASS; report suite time (target < 30 s).

### Task 4: Renderer

**Files:**
- Create: `src/games/ball-run/scene.ts`

**Interfaces:**
- Consumes: `config.ts` types/constants, `getCourse` and `Course.pose` (Task 2). Reads `Run` fields only (no `model.ts` import).
- Produces:
  - `interface SceneOptions { reducedMotion(): boolean }`
  - `interface FrameView { run: Run; course: Course; speed: number }`
  - `interface SceneStats { calls: number; geometries: number; aspect: number; ballScreenX: number; ballScreenY: number }`
  - `interface BallRunScene { resize(width: number, height: number): void; render(view: FrameView): void; reset(): void; readonly stats: SceneStats; dispose(): void }`
  - `createScene(canvas: HTMLCanvasElement, options: SceneOptions): BallRunScene` — throws if a WebGL2 renderer cannot be created.

**Visual decisions:**
- Palette: clear `#000000`; road `#333B74`; grid/arches `#929BFB`; ball `#E500B1` glossy (Phong, bright specular, deep-purple underside via hemisphere light); blocks `#B51CFA` with per-instance shade variation and a lit top; sliders `#E500B1`; tunnel walls magenta; chevrons and the arch entrance `#00E7EF`.
- Road: instanced tiles (roll = bank, pitch from gradient), lateral grid lines at 5 lane offsets across the width including the edges (surface height honours bank), cross lines every 2 m; nothing drawn in drop gaps; render range `min(260, 160 + 1.6·speed)` m with fog `[60 + speed, 150 + 1.6·speed]`. Positions relative to an origin distance that moves in 0.5 m steps (rebuild only when it changes) and reference height `−SLOPE·origin`.
- Towers: the existing static repeating city of instanced dark boxes plus one line buffer, moved outward so inner faces are ≥ 5.6 m from x = 0; scrolls with distance as today.
- Boost gate: semicircular rings of bars every 3 m through the arch (grid mesh), magenta side walls (block mesh via instance colour), cyan chevrons on the road (cyan mesh), a cyan entrance ring.
- Trail while `speedUpTime > 0`: up to 18 (reduced motion 8) shrinking, fading magenta spheres at past ball positions sampled every 0.5 m of travel; one instanced mesh (transparent), hidden when unused.
- Burst while `phase === 'dying' && reason === 'block'`: 40 (reduced 14, no outward spread, fade only) cubes coloured magenta/cyan/white; positions are an analytic function of `dyingTime` with velocities from a hash of `run.seed`, so pause and restore are exact; ball hidden. For `fall` the ball stays visible.
- Camera: behind 3.6 m / above 1.8 m, follows ball x and height, looks ahead; FOV `64 + 10·clamp((speed−12)/50, 0, 1)` and roll `0.5·bank` unless reduced motion.
- `stats` are updated each render from `renderer.info` and the projected ball centre.

- [ ] **Step 1:** Write a scratch harness (outside the repo, in the scratchpad) that mounts the scene on a page via Vite and renders fixed `Run` snapshots at: straight, bend, bank, ribbon, crest, drop gap, inside a gate arch with `speedUpTime > 0`, a block death at `dyingTime` 0.2 s, and at 50 m/s; capture 390×844 and 1366×768 screenshots with Chromium (`/opt/pw-browsers/chromium`, `--use-angle=swiftshader`).
- [ ] **Step 2:** Implement `scene.ts` until the screenshots match the reference pages 02–06 in composition and palette (compare side by side), the ball stays round at both aspects, and `stats.calls ≤ 11`, `stats.geometries ≤ 4`.
- [ ] **Step 3:** `npm run check` errors are confined to the files Task 5 replaces (old `index.ts` imports); report them.

### Task 5: Game module, UI and browser tests

**Files:**
- Replace: `src/games/ball-run/index.ts`, `src/games/ball-run/style.css`
- Replace: `tests/games/ball-run/play.spec.ts`
- Modify: `tests/e2e/study.spec.ts:35` (button regex → `/^(Play|Continue)$/`), `scripts/verify-offline.mjs:25` (button regex → `/^(Play|Continue|Play again)$/`)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: the default-exported `GameModule` (`id 'ball-run'`, title `Ball Run`, cover unchanged) with new `rules` text describing difficulties, steering, blocks, gates (permanent speed boosts), P/R, records.

**UI decisions:**
- Panels (each a `.br-panel`, centred, rounded, over a dimmed world, below z-index 20, clear of the 52 px bottom strip): setup (`BALL RUN`, instructions, inline-SVG face badge — green smile / amber flat mouth / coral angry with horns —, difficulty name in its colour, a thick rounded `<input type=range min=0 max=2>` named `Difficulty` with `aria-valuetext`, a `Play` button in the difficulty colour, a purple `How to play` toggle revealing controls help); continue (`Your run is waiting`, mode and metres, `Continue`); game over (`GAME OVER`, reason line `You hit a block` / `You fell off the track`, `Score` + number, difficulty badge, three rows Today's best / Week's best / All-time best with a "new" marker when this run set it, `Home` house-icon button → setup, `Play again`). Game Over enters with opacity + scale 0.96 → 1 over 250 ms `cubic-bezier(0.23,1,0.32,1)` (opacity only under reduced motion).
- HUD (pointer-events none, ~58–82 px from the top, centred): `<MODE> MODE` + score; target label/value from `nextTarget` (today amber, week pink, all-time teal, new best gold); `.br-speed` readout; `.br-boost` toggling `hidden` while `speedUpTime > 0`, reading "Speed Up" (or "Top Speed" when the gate added nothing because the cap was reached).
- Lifecycle: `ready` (setup) → Play → `running` ⇄ shell pause → `dying` → `over`. Restored `running` v4 → continue panel; migrated legacy save → setup on Medium with a status line saying the course is new and the best was kept. Shell Restart → setup with a fresh course of the same difficulty. Play again (button or R) → new seed, same difficulty, straight to `running`. Home → setup. Changing the slider builds a fresh `ready` run for that difficulty (the world behind the panel updates).
- Records: commit exactly once per run when it ends — on the `running → dying` transition, or when shell Restart abandons a `running` run with score > 0 — via `commitScore(records, difficulty, score, new Date())`, then `context.setScore(score)` unthrottled and `context.save(snapshot)`.
- `context.setScore` while running: at most every 250 ms and only when the score changed. `setLevel('<Label> mode')` once per run; status/announce at start, death and restore.
- Input: drag (relative, as today, 6 m per canvas width) and A/D/arrows feed one steering value; P clicks `#pause-game` (Neon Coil pattern: skip repeats, modifiers, open dialogs, text fields — but not the range slider); R at `over` (not paused, no dialog) plays again. Clear input on pause, blur, pointer cancel/lost capture, resize, death, restart, Study.
- Loop: fixed `STEP` accumulator (cap one frame at 0.1 s), stops when paused/ready/over/context lost; runs through `dying`.
- `serialize()` returns a `Snapshot`; `restore()` uses `restoreSnapshot`.
- Keep the WebGL fallback and context-loss behaviour (save kept, `Graphics interrupted`, no Start button).

- [ ] **Step 1: Write the failing browser tests** in `play.spec.ts` (Chromium; keep the video and evidence conventions):
  - fresh profile: setup shows Medium, slider keyboard → Hard updates face/label/colour and `data-difficulty`; no `79`/`143` anywhere; Play starts (`data-phase running`, speed rises).
  - drag and held keys steer; a fresh drag does not teleport; P pauses (shell label `Resume game`, distance frozen), P resumes; Escape → Study keeps working with held keys.
  - seeded v4 save in front of a block → Continue → crash → burst (`data-phase dying`) → Game Over panel with score, Hard badge and records; R → new run running; Home → setup; reload keeps records.
  - shell Restart mid-run commits the score into today's best (visible in the next Game Over / HUD target).
  - legacy v1 save with best 143 → setup on Medium; HUD target shows `ALL TIME 143` after Play.
  - gates: seeded save before gate 0 → `data-boost true`, `.br-boost` observed visible, `data-gates` 1 and `data-speed` stays above its pre-gate value after the label hides.
  - viewports 390×844, 844×390, 1366×768: canvas fills, `data-aspect` matches, ball screen y in 0.60–0.80, no document scroll, setup and Game Over panels fully on screen; screenshots of straight, curve, boost, collision and results into `tests/games/ball-run/evidence/`.
  - WebGL loss and WebGL-unavailable fallbacks (existing assertions, new names); resize during a held key keeps steering; repeated restarts keep `data-geometries` constant.
- [ ] **Step 2:** Run `CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/games/ball-run --project=chromium --workers=1` → FAIL.
- [ ] **Step 3:** Implement `index.ts` and `style.css`; update the two regexes.
- [ ] **Step 4:** Re-run → PASS. Then `npx playwright test tests/e2e/study.spec.ts tests/e2e/viewport.spec.ts tests/leaderboard/sidebar.spec.ts --project=chromium --workers=1 -g "ball-run|viewport"` → PASS; `npm run check` → clean; `npm test -- --maxWorkers=1` → PASS.

### Task 6: Verification and documentation (controller)

- [ ] Full unit suite, type check, build, focused + shared browser specs, `ARCADE_GAMES=ball-run npm run verify:offline`, `git diff --check`.
- [ ] Compare the five-moment evidence set (straight, curve, boost, collision, results) with the reference pages.
- [ ] Update `src/games/ball-run/SPEC.md` (current design first, history kept), append `TEST_RESULTS.md` and `SKILL_USAGE.md` checkpoints, add `docs/BALL_RUN_REDESIGN.md`, README line if Ball Run is described there.
- [ ] Independent whole-branch review; fix confirmed findings.
