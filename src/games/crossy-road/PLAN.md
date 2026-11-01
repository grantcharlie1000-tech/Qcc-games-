# Crossy Road Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Crossy Road, an original endless lane-hopping game (roads, rivers, railways), to QCC Games as game id `crossy-road`, scored on the shared leaderboard.

**Architecture:** Pure, seeded TypeScript logic (`config.ts`, `lanes.ts`, `generator.ts`, `world.ts`, `rules.ts`) holds every rule and is unit-tested in Node. `scene.ts` and `models.ts` draw one frame of that state with Three.js (orthographic voxel view). `input.ts` and `audio.ts` adapt the DOM. `index.ts` is the `GameModule`: fixed-step loop, shell contract, game-over card and a dev-only test hook.

**Tech Stack:** TypeScript (strict), Vite 7, Three.js 0.180 (already installed), Vitest 3, Playwright (Chromium only here).

**Spec:** `docs/crossy-road-pack/REFERENCE.md` (gameplay numbers and rules) and `docs/crossy-road-pack/PROMPT.md` (build brief). Deviations are listed below and repeated in `SPEC.md`.

## Originality decisions (lead's call)

The reference pack describes a remake of a specific commercial game. QCC builds an **original game in the genre** instead:

- **Name and id:** "Crossy Road", id `crossy-road`, route `#/game/crossy-road`, CSS prefix `hw-`, leaderboard key `crossy-road`. The branch stays `game/crossy-road` as instructed. The original name, logo, UI and characters are not used anywhere in the product.
- **Character:** an original voxel bunny (cream body, tall ears with pink insides, mint scarf), not a bird or chick.
- **Stall hazard:** a cartoon UFO replaces the eagle. The rules are unchanged (REFERENCE D5/D6): 7.0 s without a new best row, or 3 rows back, means the UFO beams the bunny up. Warning: a pulsing spotlight ring around the bunny plus a wobbling tone at 5.0 s.
- **Look:** QCC palette and our own voxel models, decor (round-canopy trees, boulders, flowers), mirrored camera yaw, striped trains and a QCC game-over card. Nothing is traced from the frames.

## Global Constraints

- Folder `src/games/crossy-road/`, tests `tests/games/crossy-road/`, cover `public/game-art/crossy-road/cover.svg` (viewBox `0 0 320 410`, no text, keep y 0..95 clear).
- No new runtime dependencies, no network, analytics or CDN. Three.js only, and only inside this game's lazy chunk. Web Audio oscillators only, sound OFF by default (`ctx.settings.sound`).
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`; Low quality uses 1.
- Never capture, swallow or `preventDefault` **Escape**. Ignore keys while a `dialog[open]` exists or focus is in a text field.
- Namespaced CSS (`.crossy-road`, `.hw-*`). Body fits 366 px width. Shared HUD only: `ctx.setScore(maxRow)`, `ctx.setLevel('Row N')`, no duplicate in-canvas HUD.
- All randomness from `mulberry32` (`src/core/random.ts`), seeded per chunk. Hazard positions are pure functions of `(lane, t)`.
- `restore` validates every field; invalid input means a fresh run. `dispose` frees every geometry, material, render target, the renderer, RAF, timers, observers and listeners.
- Do not change Movies/TV, ads, Netlify config/functions, env files, package dependencies, other games' behaviour, or PR #80's Liquid Glass work. Database: only the single `arcade_scores_game_id_check` migration (Task 9), local DB only.
- Subagents do **not** commit. The lead reviews each diff and commits in small conventional commits.

## Module layout and the pure/render split

| File | Owner | Responsibility |
| --- | --- | --- |
| `config.ts` | lead (Task 1) | Shared types (`Lane`, `RunState`, `PlayerPose`, `Dir`, `DeathCause`, …) and every tunable constant. Pure. |
| `lanes.ts` | lead (Task 1) | Hazard geometry as functions of time: movers, vehicle/train hits, rail warning timeline, log/pad support. Pure. |
| `generator.ts` | Sonnet A (Task 2) | Seeded chunk generator and fairness repair. Pure, no Three.js. |
| `world.ts` | Sonnet A (Task 2) | `World` row cache over the generator (`LaneSource`), pruning, test overrides. Pure. |
| `rules.ts` | Sonnet B (Task 3) | Hop/collision/death/UFO/score state machine, input buffer, serialize/restore. Pure. |
| `scene.ts`, `models.ts` | Sonnet C (Task 4) | Three.js orthographic voxel renderer, camera, quality tiers, dispose. Only files that import `three`. |
| `input.ts` | Sonnet D (Task 5) | Keyboard and pointer (tap/swipe) mapping to actions. Exports pure classifiers. |
| `audio.ts` | Haiku G (Task 6) | Web Audio oscillator sound table. |
| `index.ts`, `test-hook.ts`, `style.css` | lead (Task 8) | `GameModule`, loop, DOM card/hint/continue, shell contract, dev-only hook. |

Pure modules never touch `window`, DOM or Three.js, so Vitest runs them directly in the Node environment (`vite.config.ts` `test.environment: 'node'`).

## Core model (all values live in `config.ts`)

- Columns `0..8` (`COLS = 9`), start `(row 0, col 4)`, forward = `+row`. Tile centre at `x = col`. Player centre must stay in `[BAND_MIN, BAND_MAX] = [-0.5, 8.5]`.
- Hop: `HOP_TIME = 0.12 s`, arc `y = sin(p·π)·0.5`, linear XZ. The logical `row`/`x` change at hop **start** (scoring, D6). Rendered x during a hop is `lerp(fromX, x, p)`.
- Score = `maxRow` (highest row reached). Difficulty `d = clamp(row / 300, 0, 1)`.
- Time `t` advances in `ready`, `running` and `dying`; it stops in `over`. A fixed step `STEP = 1/60 s` drives `rules.step` with exact sub-stepping at hop landings.

## Generator and fairness invariants (REFERENCE §5)

- `chunkRng(seed, k) = mulberry32(mix(seed, k))`, so chunk `k` never depends on how many rows were requested. `World` caches rows; rows `< 0` are a fully blocked "hedge" grass lane; generation keeps `≥ 40` rows ahead of `maxRow` and prunes rows `< maxRow − 20` (the scene can show ~14 rows back).
- Chunk 0 = rows 0–4: grass, columns 2–6 clear. Later chunk kinds use weights lerped by `d`: grass 0.40→0.22, road 0.32→0.38, river 0.16→0.22, rail 0.12→0.18. A pick equal to the previous chunk kind becomes grass (or road after grass). Hazard chunks in a row: max 2 before row 60, then max 3, else forced grass.
- Thickness: grass 1–5 before row 20, else 1–3. Road 1–2 before row 20, else 1–4. River 1–3, with at most one lily row per river chunk, never first or last. Rail 1, or 2 adjacent tracks after row 120 (p = 0.25).
- Road: speed `lerp(1.5, 4.5, d)` ±15 %; truck lane with p `lerp(0.2, 0.4, d)` (trucks 2–3 tiles, cars 1); 3 movers per pattern; each gap `max(gapMin(speed), lerp(6, 3, d)·(0.85 + 0.6·r))` with `gapMin(s) = max(3, 0.4 + s·(3·HOP_TIME + 0.25))`; adjacent road rows take the opposite direction with p 0.7.
- River: speed `lerp(1.0, 2.6, d)` ±15 %; log lengths from {2,3,4} with weights w2 `lerp(.1,.6,d)`, w3 .3, w4 `lerp(.6,.1,d)`; gaps `clamp(lerp(2,4,d)·jitter, 2, min(4, 2·PLATFORM_GRACE + 2.5·speed))`; adjacent river rows alternate direction. Lily rows: 3–5 static pads.
- Rail: speed 18, length 12–20, period `max(5, lerp(9, 5, d)·jitter)`, random phase, warning lead `WARN_LEAD = 1.1 s` (never below 1.0).
- Grass: obstacle density `lerp(0.10, 0.30, d)` per column (tree 70 %, rock 30 %), shade = row parity, plus decorative `edge` obstacles for x −6..−1 and 9..14.
- Repair (deterministic): the generator carries `reach` (columns reachable in the last row). A grass row with no `reach ∧ open` column clears the reachable column nearest the centre. A grass row with fewer than 3 open columns clears the columns nearest the centre until 3 are open. Hazard rows are passable for reachability (`reach` = all 9). Lily rows' reach = pads.
- **F1–F7** are unit-tested over **2,000 seeds × 400 rows**. Time-invariant gap properties are checked analytically on every lane, and time-sampled checks run on every lane of a 200-seed subset:
  - F1: BFS from (0, col 4) reaches an open column in every row.
  - F2: every grass row has ≥ 3 open columns; rows 0–4 have columns 2–6 open.
  - F3: every road gap ≥ `gapMin(speed)` ≥ 3 tiles, so the free stretch is ≥ 2.5 and the safe window is ≥ 3·HOP + 0.25 s.
  - F4, land→river: every 3 s window has a log over a reachable column of the row before; uncovered time `(gap − 2·GRACE)/speed ≤ 2.5 s`.
  - F4, river→river: every 3 s window contains a log-to-log hop (x covered by both rows at t and by the next row at t + HOP_TIME). Coverage per passing log is `(len + 2·GRACE)/(vA + vB) ≥ 0.4 s`.
  - F5: the rail light is on ≥ 1.0 s before the train front reaches the band.
  - F6: same seed gives deep-equal lanes, independent of batch sizes, and identical hazard positions at identical t.
  - F7: a lily row has ≥ 3 pads in 0..8 and sits between two log rows, so every pad is reachable.

## Collision model (REFERENCE §4)

Axis-aligned, tile units. Player hitbox `[x − 0.3, x + 0.3]` (`PLAYER_HALF`); vehicle and train hitboxes are their visual span minus `VEHICLE_INSET = 0.1` per end. Logs and pads support the player when `x0 − PLATFORM_GRACE ≤ x ≤ x1 + PLATFORM_GRACE` (`0.2`, lead's choice for student-friendly landings).

| Rule | Exact behaviour |
| --- | --- |
| D1 car/truck | Every step, including mid-hop, against the **logical** row with the rendered x. |
| D2 train | Same overlap on a rail row. The track is empty and safe between passes. |
| D3 water | Only at hop landing on a river/lily row with no support. Hopping into open water is legal and fatal. |
| D4 swept | While grounded on a log, `x += dir·speed·dt`; centre outside `[-0.5, 8.5]` means death. |
| D5 UFO idle | `t − lastProgress ≥ 7.0 s` (only after the first hop). The warning flag is on from 5.0 s. Only a new max row resets the timer. |
| D6 UFO behind | `row ≤ maxRow − 3`, or `row ≤ safeLine − 3`. Immediate. |

Hop targets: on land, sideways moves `col ± 1` and forward/back moves keep the column. From a log, a hop to a land or lily row lands on `round(x)`, a hop to another log row keeps `x`, and a sideways hop goes to `x ± 1`. A target outside the band, into a tree or rock, or to row `< 0` is **blocked**: a bonk with no death and no timer reset. Input buffer: while a hop runs, one further input queues and starts at the exact landing time; more inputs are dropped. Key repeat is filtered in `input.ts`.

Death → phase `dying` for `DEATH_TIME = 0.9 s` (0.3 s reduced motion) → `over`.

## Camera (REFERENCE §6)

Orthographic, pitched 58° down, yawed −16° (mirrored from the reference so lanes rise to the right).

- Portrait: fit x ∈ [−1.5, 9.5] at the focus row to the width. Landscape: tile size `max(36, height/16)` CSS px.
- Focus row target = `max(renderRow, safeLine + SAFE_LAG)` (`SAFE_LAG = 2`), so it never moves backward. The player sits ~35 % up from the bottom.
- Focus x target = `lerp(4, pose.x, 0.6)`, clamped so the band stays on screen.
- Smoothing factor `1 − 0.9^(dt·60)`.
- Auto-scroll: after the first hop `safeLine += lerp(0.35, 0.9, d)·dt` and `safeLine = max(safeLine, maxRow − SAFE_LAG)`; it never decreases.

## Registration touch-points

`src/core/types.ts` (GAME_IDS), `src/core/catalog.ts` (`{id:'crossy-road',title:'Crossy Road',color:'#8fd3f5',ink:'#173a2a',accent:'#ff7e91'}`), `src/core/navigation.ts` (append entry 22), `src/main.ts` (`fillGames`), `src/game-viewport.css` (stage fill block), `src/leaderboard/shared.ts` (`SCORED_GAMES`), `scripts/verify-offline.mjs` (title, action, heavy-chunk list), `tests/e2e/study.spec.ts` (list + `gameAction`), `tests/e2e/viewport.spec.ts` (ids + canvas as primary control), `tests/accounts/server.test.ts` (`best:crossy-road`/`save:crossy-road` sync), `tests/leaderboard/server.test.ts` (ranks Crossy Road on the local DB), game-card counts 21→22 in `tests/core/storage.test.ts`, `tests/e2e/shell.spec.ts`, `tests/e2e/redesign-shell.spec.ts`, `tests/movies/movies.spec.ts` (count only; Movies code untouched), `README.md`, `ARCHITECTURE.md`. Migration: `netlify/database/migrations/20261031120000_crossy-road_score.sql`.

## Test matrix

| Area | File | Proves |
| --- | --- | --- |
| Hazard math | `tests/games/crossy-road/lanes.test.ts` | mover wrap/enumeration, hitbox insets, train timeline, warning window, platform grace, pads |
| Generator | `tests/games/crossy-road/generator.test.ts` | F1–F7 over 2,000 seeds × 400 rows, chunk rules, thickness, direction alternation, safe start |
| Rules | `tests/games/crossy-road/rules.test.ts` | D1–D6 fire exactly under their rule and not otherwise, buffer (max 1, dropped extras, landing start), blocked moves, score = max row, serialize/restore round-trip, invalid snapshots rejected, dying→over timing |
| Input | `tests/games/crossy-road/input.test.ts` | swipe threshold 24 px and 1.5× dominance, tap → forward, key map, Escape unmapped |
| Camera | `tests/games/crossy-road/camera.test.ts` | portrait fit and landscape tile size, focus never moves backward |
| E2E movement | `tests/games/crossy-road/movement.spec.ts` | W/↑/tap forward, S/↓ back, A/D/←/→, swipes, tree block, score only on new max |
| E2E deaths | `tests/games/crossy-road/deaths.spec.ts` | forced layouts: car, train (light ≥ 1 s before), drown, swept, UFO idle (none before 7 s, UFO after), UFO 3 rows back; card shows the cause; `death-*.png` |
| E2E fairness | `tests/games/crossy-road/fairness.spec.ts` | 200 rows via the hook: reachable open column on every grass row, road gaps ≥ min |
| E2E lifecycle | `tests/games/crossy-road/lifecycle.spec.ts` | Escape opens Study, restart, no console errors, no RAF after leaving, screenshots `chromium.png`, `phone-390x844.png`, `chromebook-1366x768.png` |
| Shell | `tests/e2e/study.spec.ts`, `tests/e2e/viewport.spec.ts` | retained instance and frozen autosave; fills 390×844 and 844×390 |

Commands: `npm run check`, `npm test`, `npx vitest run tests/games/crossy-road`, `npm run build`, `ARCADE_GAMES=crossy-road ARCADE_EVIDENCE_DIR=<scratch> CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/verify-offline.mjs`, `CHROMIUM_PATH=/opt/pw-browsers/chromium ARCADE_URL=http://127.0.0.1:4317 npx playwright test tests/games/crossy-road tests/e2e/study.spec.ts tests/e2e/viewport.spec.ts --project=chromium` against `npm run dev -- --port 4317`.

## Review Focus

1. **Restore mid-hop or mid-ride.** A save taken during a hop or on a log must resume exactly: full hop fields are serialized and replayed. A Continue overlay waits for input. Test: round-trip during a hop over water, then step to landing.
2. **Tab hidden or Study during a train warning.** Pause stops `t`. Resume does not change the serialized state. Test: the frozen-autosave check in `study.spec.ts`, plus a rules test that pause/resume needs no state change.
3. **Rapid inputs and key repeat.** Mashing ↑ during a hop must queue exactly one hop. Holding ↑ must not repeat. Test: rules buffer test; input test for `repeat`.
4. **Landscape Chromebook and tiny phones.** The band must never crop and nothing may overflow at 366 px. Test: camera fit unit test, viewport spec, phone/chromebook screenshots.
5. **Leaving during the death animation.** Dispose mid-`dying` must cancel RAF and free GPU resources, and restart while paused must work. Test: lifecycle spec (frame counter static after navigation); rules test that restart from `dying` gives a fresh run.

---

### Task 1: Shared contract (`config.ts`, `lanes.ts`)

**Files:**
- Create: `src/games/crossy-road/config.ts`, `src/games/crossy-road/lanes.ts`

**Interfaces:**
- Produces: every type and constant named in this plan. `lanes.ts` exports `forEachMover(lane, t, xMin, xMax, fn(x0, x1, mover, k))`, `vehicleHit(lane, x, t)`, `trainSpan(lane, t) → {x0, x1} | null`, `trainHit(lane, x, t)`, `railWarning(lane, t)`, `trainEntry(lane, t) → number` (entry time of the current/next pass), `platformAt(lane, x, t)`, `laneVelocity(lane)`.

- [ ] Write both files (lead).
- [ ] `npx tsc --noEmit` passes.
- [ ] Commit `feat(crossy-road): shared types, constants and hazard timelines`.

### Task 2: Generator and world (Sonnet A)

**Files:** Create `generator.ts`, `world.ts`, `tests/games/crossy-road/generator.test.ts`, `tests/games/crossy-road/lanes.test.ts`.

**Interfaces:** Consumes Task 1. Produces `chunkRng(seed, k)`, `initialState(seed) → GenState`, `generateChunk(state) → {lanes, state}`, `generate(state, minRows) → {lanes, state}`, `hedgeLane(row)`, and `class World implements LaneSource { constructor(seed); seed; lane(row); ensure(row); prune(belowRow); override(lanes); reach(row) }`.

- [ ] TDD the tests from the matrix (F6 first, then F1–F5, F7 and chunk rules), see them fail, implement, see them pass: `npx vitest run tests/games/crossy-road/generator.test.ts tests/games/crossy-road/lanes.test.ts`.

### Task 3: Rules (Sonnet B)

**Files:** Create `rules.ts`, `tests/games/crossy-road/rules.test.ts`.

**Interfaces:** Consumes Task 1 (a hand-built `LaneSource` in tests). Produces `createRun(seed)`, `input(s, dir, world) → 'hop'|'queued'|'dropped'|'blocked'|'ignored'`, `step(s, dt, world, reducedMotion?) → StepEvents`, `pose(s) → PlayerPose`, `idleTime(s)`, `ufoWarning(s)`, `serialize(s) → Snapshot`, `restore(data) → RunState | null`.

- [ ] TDD D1–D6, buffer, blocked, score, serialize/restore: `npx vitest run tests/games/crossy-road/rules.test.ts`.

### Task 4: Renderer (Sonnet C)

**Files:** Create `scene.ts`, `models.ts`, `tests/games/crossy-road/camera.test.ts`.

**Interfaces:** Consumes Task 1, plus `RunState`/`PlayerPose` from config. Produces `createScene(canvas, {quality}) → Crossy RoadScene` (`resize`, `render(SceneFrame)`, `setQuality`, `quality`, `stats`, `reset`, `dispose`) and pure `cameraFit(width, height) → {tilePx, halfWidth, halfHeight}`.

- [ ] Unit-test `cameraFit`; render a harness screenshot in Chromium; check that `dispose` leaves `renderer.info.memory` at zero.

### Task 5: Input (Sonnet D)

**Files:** Create `input.ts`, `tests/games/crossy-road/input.test.ts`.

**Interfaces:** Produces `classifySwipe(dx, dy) → Dir`, `keyAction(key) → Dir | 'pause' | 'again' | null`, `attachInput({target, signal, onDir, onPause, onAgain, enabled})`.

### Task 6: Sound (Haiku G)

**Files:** Create `audio.ts`. Produces `createSfx(enabled: () => boolean) → Sfx` (hop, bonk, hit, splash, bell, rumble, ufoWarn, beam, chime, dispose).

### Task 7: Registration, cover and docs (Haiku E/F/H)

**Files:** every touch-point above, `public/game-art/crossy-road/cover.svg`, `SPEC.md`, `SKILL_USAGE.md`.

### Task 8: Integration (lead)

**Files:** `index.ts`, `test-hook.ts`, `style.css`. Fixed-step loop, card (Play again / Rankings), hint, continue overlay, announce/setScore/setLevel/setStatus, auto-quality (2 s average < 50 fps → Low), WebGL fallback and context loss, dev-only `window.__crossy-roadTest`.

### Task 9: Migration (lead, separate commit, NEEDS CHARLIE APPROVAL)

Drop and re-add `arcade_scores_game_id_check` with the complete list from `20261030190000_minesweeper_score.sql` plus `'crossy-road'`. Verified only by the in-process `@netlify/database-dev` tests.

### Task 10: E2E specs (Sonnet E), verification, screenshots, review, `TEST_RESULTS.md`, push `game/crossy-road`.
