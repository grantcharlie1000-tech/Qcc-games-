# Crossy Road

Design specification for game id `crossy-road`. The build plan is in [PLAN.md](PLAN.md); this file states the behaviour the build must meet.

## Overview

Crossy Road is an original endless lane-hopping game for QCC Games. A white voxel chicken-like bird hops across procedurally generated grass, roads with cars and trucks, rivers with logs and lily pads, and railway lines with trains behind a warning light, all drawn in an orthographic Three.js voxel scene. The score is the furthest row reached and is synced through the shared leaderboard under the key `crossy-road`. A run ends when the bird is hit, drowns, is swept off a log, or stalls: if it reaches no new furthest row for 7 seconds, steps three rows back, or falls three rows behind the auto-scrolling safe line, a cartoon UFO beams it up.

## Visual direction

- Name and identifiers: "Crossy Road", id `crossy-road`, route `#/game/crossy-road`, CSS prefix `hw-`, leaderboard key `crossy-road`.
- Hero: a white voxel chicken-like bird with a red comb, orange beak and legs, and small wings.
- Stall hazard: a cartoon UFO replaces the reference's eagle. Its rules are the reference's D5 and D6, with the same timing.
- Own work: voxel models, palette, decor (tall olive/lime box trees, purple-grey rocks/stumps), striped trains, UI and the game-over card. No assets, fonts, sounds or artwork from the reference are used.
- Use of the reference: Charlie requests close fidelity in camera, palette, proportions and timing. All geometry is authored in code; no original assets, logos, fonts or UI are copied. The cover is managed separately by the designer.

## Controls

| Action | Keyboard | Touch or pointer |
| --- | --- | --- |
| Hop forward | `W` or `↑` | Tap the playfield, or swipe up |
| Hop back | `S` or `↓` | Swipe down |
| Hop sideways | `A` or `←`; `D` or `→` | Swipe left or right |
| Pause | `P`, or the shell's pause | Shell toolbar pause |
| New run after game over | `Space`, `Enter` or `R` | Play again button |
| Study article | `Escape`, opened by the shell | Shell control |

- A swipe is a pointer movement of at least 24 CSS px whose dominant axis is at least 1.5 times the other. Any other touch is a tap, which hops forward.
- Touch uses pointer events with `touch-action: none` on the game host only.
- Key auto-repeat (`e.repeat`) is ignored. Keys are ignored while a `dialog[open]` exists or focus is in a text field.
- `Escape` is never captured, swallowed or prevented, so the shell always opens the Study article.
- The game-over card shows the cause, the score and the best, with a Play again button and visible keyboard focus. Rankings are opened through the shared shell Menu or its floating Top scores control; there is no game-owned rankings button.

## Rules

- The bird starts on row 0, column 4. Forward is +row. Columns run from 0 to 8, and the bird's centre must stay within `[-0.5, 8.5]`.
- One input is one hop of one tile: forward, back, left or right. The logic is discrete; only the visuals are smoothed.
- The score is the furthest row reached (`maxRow`). Stepping back does not lower it. Each new furthest row is reported with `ctx.setScore`.
- A hop lasts `HOP_TIME = 0.12 s`. Its height is `y = sin(p·π)·0.5` and its horizontal motion is linear, with rendered x `lerp(fromX, x, p)`. The logical row and column change at the start of the hop.
- While a hop runs, one further input is queued and starts at the exact landing time. Any further input during that hop is dropped. Key auto-repeat is ignored, so holding a key does not repeat hops.
- On land, sideways moves go to column ±1 and forward or back moves keep the column. From a log, a hop to a land or lily row lands on `round(x)`, a hop to another log row keeps `x`, and a sideways hop goes to `x ± 1`.
- A blocked move is a bonk. The target is a tree or rock, outside the band, or in a row below 0. The bird squashes in place. A bonk is not a death and does not reset the idle timer.
- Phases are `ready`, `running`, `dying` and `over`. Before the first hop there is no auto-scroll and no UFO. Time `t` advances in `ready`, `running` and `dying`, and stops when the run is over or paused.
- A hidden tab pauses the game, and returning to it does not resume play on its own.

## Deaths

| # | Death | Exact rule |
| --- | --- | --- |
| D1 | Car or truck | Checked every step, including mid-hop, against the **logical** row with the rendered x. |
| D2 | Train | Same overlap on a rail row. The track is empty and safe between passes. |
| D3 | Drowning | Only at a hop landing on a river or lily row with no support. Hopping into open water is legal and fatal. |
| D4 | Swept off a log | While grounded on a log, `x += dir·speed·dt`; a centre outside `[-0.5, 8.5]` means death. |
| D5 | UFO, idle | `t − lastProgress ≥ 7.0 s`, only after the first hop. The warning (spotlight ring and wobbling tone) is on from 5.0 s. Only a new furthest row resets the timer; sideways and backward moves do not. |
| D6 | UFO, behind | `row ≤ maxRow − 3`, or `row ≤ safeLine − 3`. Immediate. |

The bird's box is `[x − 0.3, x + 0.3]`. Vehicle and train boxes are their visual span less `VEHICLE_INSET = 0.1` at each end. Logs and pads support the bird when `x0 − 0.2 ≤ x ≤ x1 + 0.2` (`PLATFORM_GRACE`).

A death sets the phase to `dying` for 0.9 s (0.3 s with reduced motion), then to `over`, which shows the game-over card with the cause.

## Lane generation

New runs store `worldVersion=2`; saves without the field replay revision one unchanged. Each chunk has its own PRNG, `mulberry32(mix(seed, k))`, so chunk `k` does not depend on how many rows were requested. Difficulty is `d = clamp(row / 300, 0, 1)`. Hazard positions are pure functions of the lane and `t`. Rows below 0 form a fully blocked grass lane.

- Chunk 0 (rows 0–4) is grass with columns 2–6 clear.
- Chunk weights, lerped by `d`: grass 0.40 → 0.22, road 0.32 → 0.38, river 0.16 → 0.22, rail 0.12 → 0.18. A pick equal to the previous chunk kind becomes grass (or road after grass). Hazard chunks in a row: at most 2 before row 60, then at most 3; otherwise grass is forced.
- Thickness: grass 1–5 before row 20, else 1–3; road 1–2 before row 20, else 1–4; river 1/2/3 with probabilities 20/60/20 %, with an optional lily as the second row of a pair or middle row of three (p = 0.3); rail 1/2/3 with probabilities 63/25/12 % from the start.
- Road: speed `lerp(1.5, 4.5, d)` ±15 %; truck lanes with p `lerp(0.2, 0.4, d)` (trucks 2–3 tiles, compact cars 1.2, sedans/taxis 1.8); 2–5 movers per road pattern; each gap is `max(gapMin(speed), lerp(4.2, 3, d)·(0.85 + 0.6·r))`, with `gapMin(s) = max(3, 0.4 + s·(3·HOP_TIME + 0.25))` and `r` a PRNG draw in [0, 1); adjacent road rows take the opposite direction with p 0.7.
- River: speed `lerp(1.0, 2.6, d)` ±15 %; log lengths 2, 3 or 4 with weights .2/.6/.2 initially, lerped to .6/.3/.1; gaps `clamp(lerp(2, 4, d)·jitter, 2, min(4, 2·PLATFORM_GRACE + 2.5·speed))`; adjacent river rows alternate direction; lily rows have 3–5 static pads.
- Rail: train speed 18, length 12–20 tiles; period `max(5, lerp(9, 5, d)·jitter)` with a random phase; warning lead `WARN_LEAD = 1.1 s`, never below 1.0 s.
- Grass: obstacle density `lerp(0.10, 0.30, d)` per column (70 % trees, 30 % rocks); shade alternates by row parity; decorative edge obstacles at x −6 to −1 and 9 to 14, outside the band.
- Repair (deterministic): the generator tracks `reach`, the columns reachable from the row before. A grass row with no column that is both reachable and open clears the reachable column nearest the centre. A grass row with fewer than 3 open columns clears the columns nearest the centre until 3 are open. Hazard rows count as fully reachable; lily rows reach their pads.

Fairness invariants, unit-tested over 2,000 seeds × 400 rows (time-invariant gap checks on every lane; time-sampled checks on a 200-seed subset):

- F1 Reachability: a BFS from (row 0, column 4) reaches an open column in every row.
- F2 Open columns: every grass row has at least 3 open columns, and rows 0–4 keep columns 2–6 open.
- F3 Road gaps: every gap is at least `gapMin(speed)`, which is at least 3 tiles, leaving a free stretch of at least 2.5 tiles and a safe window of at least `3·HOP_TIME + 0.25 s`.
- F4 Land to river: every 3 s window has a log over a column reachable from the row before; the uncovered time `(gap − 2·PLATFORM_GRACE)/speed` is at most 2.5 s.
- F4 River to river: every 3 s window contains a log-to-log hop, with x covered by both rows at `t` and by the next row at `t + HOP_TIME`; coverage per passing log is `(len + 2·PLATFORM_GRACE)/(vA + vB)`, at least 0.4 s.
- F5 Rail warning: the light is on at least 1.0 s before the train front reaches the band.
- F6 Determinism: the same seed gives deep-equal lanes, independent of batch sizes, and identical hazard positions at identical `t`.
- F7 Lily rows: each has at least 3 pads in columns 0–8 and follows a log row. It may finish a two-row river or lie inside a three-row river; static pads remain reachable from a moving log.

## Camera

- Orthographic, pitched 45° down and yawed 20°, so lanes fall slightly to the right.
- Portrait: eight ground cells span the width (48.75 CSS px horizontal pitch at 390 wide). Landscape: fourteen central cells plus a dim edge cell on either side span the width, keeping the nine-column playable band dominant. This full-width adaptation trades vertical coverage for scale.
- Focus row target is `max(renderRow, safeLine + min(SAFE_LAG, maxRow))` after starting, with `SAFE_LAG = 2`, so it never moves backward. The bird sits about 35 % up from the bottom.
- Focus x target is `lerp(4, pose.x, 0.6)`, clamped to centre ±1 cell on a cropped phone, or ±2.4 cells on desktop.
- Smoothing factor is `1 − 0.9^(dt·60)`.
- Auto-scroll: after the first hop, `safeLine += lerp(0.35, 0.9, d)·dt` and `safeLine = max(safeLine, maxRow − SAFE_LAG)`. The safe line never decreases.

## Accessibility and safety

- `ctx.announce` reports the death cause, a new best, and pause and resume.
- Reduced motion (the shell setting) removes squash, camera shake and particles, and shortens the death animation from 0.9 s to 0.3 s. Hop, warning and UFO timers are unchanged.
- Colour is never the only cue. Trucks have a distinct cab, trains are striped and move, the rail lamp flashes and pulses with a bell, and the UFO warning is a pulsing ring with a wobbling tone.
- Keyboard-only and touch-only play are both complete. Death effects are cartoon-like, with no blood.
- The game makes no network requests; the shell handles score sync. There is no advertising, analytics, chat, user-generated content, name entry or external link.
- Sound is off by default. All sound is Web Audio oscillators; there are no audio files.

## Persistence

- `serialize()` stores `version`, `seed`, `t`, `phase`, the position (`row`, `x`), the hop state and queued input, the best row (`maxRow`), the idle and safe-line state (`lastProgress`, `safeLine`) and any death (including the visible contact pose). Nothing personal is stored.
- `restore()` validates every field (rows are capped at `MAX_ROW` = 50,000 so a tampered save cannot make the game regenerate an absurd number of rows). An invalid or incompatible snapshot starts a fresh run.
- A snapshot taken mid-hop or on a log resumes exactly. A Continue overlay waits for input before play resumes.
- The shell saves every five seconds and on pause, leaving the game and `pagehide`.
- Each new furthest row goes to `ctx.setScore` at once (a hop takes 120 ms, so there is nothing to throttle). Signed-in players' bests are queued for the shared leaderboard by the shell; guests keep local bests only.
- Scores are integers from 1 to 2147483647. A score of 0 is not submitted.
- Server-side ranking of `crossy-road` needs the migration `netlify/database/migrations/20261031120000_crossy_road_score.sql`, which needs owner approval.

## Performance

- Target 60 fps. School Chromebooks at 1366×768 must never drop below 45 fps.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 3))` with antialiasing enabled.
- Low quality starts automatically when the 2 s rolling average falls below 50 fps. It uses pixel ratio capped at 1.5, no shadow map, blob decals in place of shadows, and less decor.
- High quality uses a 4096-square hard shadow map and a tight, texel-snapped shadow camera following the visible ground; every vehicle, tree, rock, log and the bird casts a shadow. Darker base vertices provide baked ambient shading.
- At most about 120 draw calls per frame (under 40 in review captures): every repeated thing (lane strips, markings, trees, rocks, vehicles, train segments, logs, pads, signals, particles) is an instanced mesh, and each voxel model is one merged geometry.
- No per-frame allocation in the hot loop; geometries and materials are reused.
- The render loop stops on pause and when the tab is hidden.
- `dispose()` frees every geometry, material and render target, the renderer, the animation frame, timers, observers and listeners.
- Game chunk JavaScript stays within 60 KB gzip, beyond the shared Three.js chunk.

## Deviations from REFERENCE.md

- Charlie keeps the UFO in place of the eagle: warning at 5 seconds, swoop at 7 seconds without a new furthest row, or immediately at 3 rows back/behind. The saucer grabs and carries the bird off the top within 0.7 seconds.
- Charlie requests High rendering at device pixel ratio capped at 3, with antialiasing and crisp real shadow maps (overriding the pack's caps). The full-screen canvas paints behind the shared floating Liquid Glass controls, without a header strip or reserved band.
- Outcome and Continue cards use shared `ui-glass-sheet`, `arcade-sheet`, and `game-button` classes; no live HUD is drawn by the game.
- Compact car spans are 1.2 tiles; sedans and taxis are 1.8, overriding the pack’s 1-tile cars. Rendered body and collision spans agree; the generator still adds the same minimum free gap after each vehicle. The renamed id has its own save namespace.
- Road lanes use 2–5 movers per pattern; log lanes use three. The road gap base is 4.2 → 3 tiles, bounded by the same minimum crossing window.
- Lily-pad rows follow a log row, including log/lily pairs. Early triple rail crossings are supported; each track retains its own warning and quiet period.
- Logs and pads accept landings up to `PLATFORM_GRACE` = 0.2 tiles beyond their ends.
- The safe line is pulled up to within 2 rows of the best row, so the camera visibly creeps forward when the bird idles.
- River gaps are also capped by speed, so no column is uncovered for more than 2.5 s.
- Road gaps are also floored by speed, so each crossing window is at least `3·HOP_TIME + 0.25 s`.
- The rail warning never drops below 1.0 s; the reference allows 0.9 s at maximum difficulty.
- Generation stays at least 40 rows ahead of the best row. Rows are pruned 20 rows behind the best row, not 12 behind the camera, because landscape views show more rows.
- `?seed=` works only in development builds.
- The rail lamp alternates at 2.5 Hz rather than faster, staying under the three-flashes-a-second photosensitivity limit for saturated red; it also swells and rings, so the warning stays obvious.
