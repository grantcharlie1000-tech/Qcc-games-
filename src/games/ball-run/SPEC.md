# Ball Run

Current design: the 2026-10-24 redesign with the 2026-10-25 road-contact and boost repair and Charlie's 2026-10-27 request for higher speed and wider obstacle spacing on every difficulty. Start speeds, gate gains and speed caps are 20% higher; group intervals, internal pattern intervals and the buffer after a group are 50% longer. The game is built from pages 1–9 of Charlie's `Ball-Run-Reference.pdf` (a 62-second Hard-mode recording; page 10 was set aside at Charlie's request). The reference cannot reveal speeds, sizes or generation rules, so every number below is a remake design call. Per-difficulty tuning and the shared constants live in `config.ts`; segment lengths, margins and flight-zone sizes are the constants at the top of `course.ts`, segment amplitude ranges and clear-zone distances are set in its `addSegment()`, and pattern sizes are in its `build()`; camera, pool and render numbers are in `scene.ts` (most at its top); input and UI timings, such as the 250 ms score throttle and 6 m of steering per canvas width, are in `index.ts`. Change a number where it lives. Design record: `docs/superpowers/specs/2026-10-23-ball-run-redesign-design.md`; plan and rulings: `docs/superpowers/plans/2026-10-23-ball-run-redesign.md`; delivery checkpoint: `docs/BALL_RUN_REDESIGN.md`. Earlier designs are kept under History.

A glossy magenta sphere rolls forward by itself along a suspended indigo grid road in a black void, between lavender wireframe towers. The road curves, banks, narrows, crests and drops away, and magenta blocks must be threaded at speed. There is no jump, brake or lane snapping. Hitting a block or rolling off the edge ends the run.

## Modules

`config.ts` is the shared contract (tuning, constants and types). `course.ts` generates the seeded road, gates and obstacle rows. `model.ts` is the fixed-step simulation and save format. Saves retain the v4 record envelope and carry course revision 3 on the run; older live runs start a fresh course while keeping their per-difficulty records, because tuning changes the speed-dependent seeded track. `records.ts` holds per-difficulty records. These four are pure: no Three.js, DOM, `Date.now()` or `Math.random()`. `scene.ts` is the only Three.js file. `index.ts` owns the DOM panels and HUD, input, the loop and the shell contract. Rendering and collision read the same obstacle poses from the course.

## Difficulties and tuning

| | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Start speed | 10.8 m/s | 13.2 m/s | 15.6 m/s |
| Continuous acceleration | 0.0432 m/s² | 0.0648 m/s² | 0.0432 m/s² |
| Speed cap | 48 m/s | 60 m/s | 74.4 m/s |
| Gate gain (permanent) | +3.0 m/s | +3.6 m/s | +3.6 m/s |
| A gate every (seconds of running) | 30–45 | 25–40 | 20–35 |
| Road width / ribbon width | 6.2 / 2.6 m | 5.4 / 2.2 m | 4.8 / 1.8 m |
| Narrowest route opening | 2.0 m | 1.7 m | 1.45 m |
| Rows every (full intensity) | 1.5–2.7 s | 1.02–1.8 s | 0.72–1.35 s |
| Rows every (start of run) | 2.4–3.6 s | 1.95–3.0 s | 1.5–2.4 s |
| Ramp to full intensity, from the end of the warm-up | 700 m | 600 m | 500 m |
| Rest: after this many rows | 10–14 | 12–16 | 16–20 |
| Rest length | 3–4.5 s | 2.5–3.5 s | 1.8–2.6 s |
| Maximum bank | 0.20 rad | 0.26 rad | 0.32 rad |
| Colour (always with its name) | green `#2bb24c` | amber `#e2a21b` | coral `#f0524f` |

Segment weights between gates (straight / bend / offset / ribbon / ribbonBend / bank / crest / dip / drop): Easy 30/20/15/8/0/8/8/4/4, Medium 22/18/15/8/4/10/8/4/5, Hard 15/16/15/9/6/12/8/4/6.

Pattern weights (single / pair / gate / doubleGate / slalom / zigzag / scatter / slider / wallRun / bigBlock): Easy 30/18/16/10/8/4/6/0/6/4, Medium 18/14/16/10/10/8/8/8/5/5, Hard 10/12/16/10/12/12/9/12/5/6.

Shared constants: ball radius 0.38 m (0.76 m wide); gravity 20 m/s² (snappier than Earth so flights read at arcade speed); base slope 0.12; fixed step 1/120 s; steering response 10/s; bank drift 6 m/s per unit sin(bank), toward the low side; the generator relies on 0.7 of the ball's lateral authority (`REACH_SAFETY`); 80 m clear warm-up; road centre within ±2 m of x = 0 so the tower canyon frames it; "Speed Up" feedback 1.8 s; dying 0.9 s; a ball 1.5 m below the road is lost; physical support ends at the actual road edge under the sphere contact point. The 0.133 m inset remains a conservative route-generation margin only.

## Speed model and permanent gates

Speed is a pure function of distance on a given course:

`v(d) = min(cap, sqrt(v0² + 2·a·d) + gain × gatesPassed(d))`

The square-root ramp is constant acceleration in time. Every gate spans the whole road, so a surviving run has passed exactly the gates behind it; this keeps speed, and so the reachability guarantee, exact. Gates are scheduled by integrated running time, not drawn at random. Crossing a gate entrance adds its gain for the rest of the run; at the cap it adds nothing and the label reads "Top Speed" instead of "Speed Up". The 1.8 s label and cyan trail are feedback only; the speed readout grows and turns cyan during that interval, without camera shake or a FOV pulse.

Revision 3 multiplies the start speed, gate gain and cap by 1.2 and acceleration by 1.44, giving a 20% higher speed at the same distance and gate count. Gates are scheduled by running time, so their positions and the generated road change. The first entrance still gives a noticeable permanent step, with a retained test requiring at least 18%. Hard puts more acceleration into gates and less into the continuous ramp. The first-minute test retains a gradual-opening guard against the former arcade ramp raised by the same 20%; speed never decreases and reaches exactly 48 / 60 / 74.4 m/s and never more.

Lateral authority grows with speed, `max(5, 6 + 0.16·(v − 12))` m/s (5.8 m/s at 10.8 m/s, 16 m/s at 74.4 m/s), so high speed stays steerable but each dodge costs more road. Steering is an analytic first-order response toward input × authority, exact for any step.

## Course

A seeded sequence of variable-length segments. Two mulberry32 streams (road and rows) are seeded from a hash of the seed and difficulty and generated lazily and strictly in order, so a seed and difficulty give the same course however it is queried. Courses are memoised (six most recent). Every segment starts and ends flat, level and full width, so all seams are continuous.

- `warmup`: the first 80 m, straight, flat, centred, no blocks.
- `straight` 24–48 m with a gentle 0.3 m rise; `bend` 40–70 m, sway 0.8–2 m; `offset` 18–28 m, a smoothstep shift of at least 1.2 m.
- `ribbon` 40–70 m, tapering to the ribbon width and back; `ribbonBend` 50–80 m, a ribbon that sways 0.6–1.2 m (Medium and Hard).
- `bank` 30–50 m, rolled by 0.5–1 × the maximum bank; the ball drifts toward the low side.
- `crest` 30–60 m, 1.5–3.5 m high; `dip` 30–50 m, 1–2 m deep. These two are not lengthened with speed, so fast runs lift off as on reference page 04; their height is capped at `8·L/(π·v)` (launch at most about 8 m/s upward), never below 1.0 m (crest) or 0.6 m (dip).
- `drop`: a 20–30 m approach rising 2–4 m with zero slope at the lip, a 2–4 m gap with no ground, then a landing pad of at least `max(20, cap·sqrt(2h/g) + 12)` m. After normal speed scaling, the approach is lengthened if needed to keep its downward curvature below 98% of gravity at its lip speed, preventing a premature launch and a second launch at the lip. The gap is clamped so it is always cleared at the speed there.
- `gate`: a 30 m full-width straight arch, always followed by a straight.

Drawn segment lengths (straight, bend, offset, ribbon, ribbonBend, bank, and the straight that replaces a rejected segment) and a drop's approach scale by `clamp(speed/14, 1, 3.5)`; the warm-up, gates, a drop's gap and pad, and the flat run-out before a deferred gate (as long as needed to clear the flight zone, at least 5 m) do not. Segment kinds are chosen by an exact-proportion credit scheduler, so short courses still show every kind and long courses match the weights; a drop never follows a drop. Before a segment is accepted, a backward reachability pass from its end must cover the whole allowed band at its start; otherwise it is retried longer (×1.5, twice) and finally replaced by a straight.

## Obstacles

Rows are spaced in time, so density holds as speed climbs: the gap to the next row is drawn from the start-of-run interval easing to the full-intensity interval over the ramp distance, times the speed there. Spacing is start to start, and a row never starts sooner than 0.525 s after the previous pattern's last block. After a set number of rows comes a rest. All row and pattern intervals are 50% longer than revision 2; at a corresponding 20% higher speed this gives roughly 80% more physical distance, while retaining extra time to react. Protected stretches and rejected patterns can further widen actual gaps.

Patterns: `single` (random size and position), `bigBlock`, `pair`, `gate` (a wall with one gap), `doubleGate` (two gaps, falling back to `gate` on narrow road), `slalom` (3–5 edge-anchored blocks alternating sides 0.525–0.75 s apart), `zigzag` (3–4 walls whose gaps alternate sides 0.6–0.9 s apart), `scatter` (4–7 cubes over 1.5–2.25 s), `slider` (blocks sliding sideways with a 1.4–2.6 s period; one, or up to two on Hard 0.675–1.05 s apart; never on Easy) and `wallRun` (one edge-anchored block 6–14 m deep). Scatter's wider span reduces average density but does not guarantee a minimum gap between every cube. Every block lies inside the road; every opening counted as a route is at least the minimum gap.

No blocks in: the warm-up; from 5 m before a gate to one second past its exit; ribbons and ribbonBends (as on reference page 04); from 8 m before a drop lip to 12 m past where the ball lands at that speed; the middle 40 % of crests and dips; and every predicted flight (below).

Blocks are posed on the road surface they stand on, rolled with the bank. The pose extends the box down to stay seated on sloped road, so collision and rendering both use the pose's half sizes, never the block's nominal height. Blocks that would need too much extension, or whose road shifts or rolls too much under them, are rejected.

Historical redesign density before the 2026-10-25 gate retuning, over 1–6 km, seeds 1–24, clear zones included: 0.867 / 1.214 / 1.476 blocks/s and 0.491 / 0.613 / 0.686 rows/s (Easy / Medium / Hard). The old game averaged about 0.4 blocks/s.

## Reachability guarantee

The generator tracks the set of lateral ball-centre positions still reachable along the road, as disjoint intervals stepped every metre and at every block boundary. Each step shifts the set by bank drift, dilates it by 0.7 of the ball's real lateral authority at the course speed there (exact, because gates are unavoidable), and intersects it with the allowed band: the road less a 0.253 m edge margin (inside an arch, less the radius), less every block widened by radius + 0.06 m. Sliders block their whole sweep. A pattern is accepted only if the set never empties, every surviving route is at least 0.25 m wide at every blocked step, openings narrower than the minimum gap are not counted, and the rest of the segment stays reachable. Up to six fresh patterns are tried; otherwise the row is skipped.

How it is proven (see `TEST_RESULTS.md`):

- An independent re-implementation of the interval check in `course.test.ts`, at 0.95 of the generator's reach, stays open over 0–6 km for seeds 1–24 on every difficulty.
- A minimum-gap test checks every step of every row against the spec's literal 2.0 / 1.7 / 1.45 m, measuring the widest opening between block faces or out to the outer side of a ball still supported at the road edge. Gaps that are not routes can be narrower (scatter cubes may sit 0.1 m apart).
- A look-ahead bot (`tests/games/ball-run/bot.ts`) drives the real `step()`: it plans the lag-free position with the model's exact steering, using at most 0.85 of the authority, and must survive 12 seeds × 3000 m from the start and 4 seeds × 1500 m past the cap on every difficulty, plus three Hard cap regression seeds.
- Out-of-suite sweeps covered 1000 seeds of the interval check and hundreds of bot runs; exact grid searches confirmed the tight spots where earlier bots failed.

The generator's model ignores the ball's 0.1 s steering lag; the 0.7 safety factor covers it, and the bot, which models the lag, is the evidence.

## Flights

The ball leaves the road only where the road curves away along its line faster than gravity at its speed (or the ground ends), and its ballistic step must clear the road. A gate's speed gain or a steering reversal on a bank never launches it. In the air it keeps full steering. It lands only from above, on supported road.

While building the road, the generator runs a point mass along it with the model's own step and lift-off rule. Every predicted flight gets a block-free zone from 6 m before take-off to 13 m past landing (5 m and 12 m plus a 1 m margin for step phase), with landing taken where the low edge of a bank meets the ball. A gate that falls due inside a flight zone is deferred behind a flat run-out. A crest or dip drawn under a flight or inside its zone is built as a straight, so no flight chains into another launch. The tests do not count flights under 1 cm (invisible skims); the generator zones them anyway.

Historical measurement before revision 3 (bot-driven, seeds 1–40, start to 4 km past the then-current cap): at most 0.958 s in the air, at most 2.58 m above the road beneath on crests and dips (4.0 m on drops), longest 38 / 47 / 58 m; no landing within 12 m of a block and no gate entered airborne. These figures describe the earlier tuning; the generator and flight tests enforce clearance on the current course.

## Records

Score is whole metres travelled, frozen at the moment of death. Each difficulty keeps today's best (local calendar day), this week's best (local week starting Monday) and the all-time best. Day and week keys are built from calendar fields, never millisecond arithmetic, so DST days and New Year are safe; stale or future keys read as 0. Fresh profiles start at zero.

Records are committed exactly once when a run ends, however it ends: at death, or when the shell's Restart abandons a running run with a score above 0. Leaving the game mid-run is not an ending; the run is saved. Each commit also sends one final unthrottled score to the shell, so the shell RECORD and leaderboard always receive the final score in metres. While running, `setScore` is called at most every 250 ms and only when the score changed.

The HUD shows the smallest record still above the current score (ties show the broader scope: All time > This week > Today), then NEW BEST. Game Over shows the three records with a NEW marker for each one this run set.

## Lifecycle and controls

Ready (setup panel) → Playing ⇄ Paused → Dying (0.9 s) → Game Over.

- Setup: `BALL RUN`, short instructions, a face badge (green smile, amber flat mouth, coral angry with horns) beside the difficulty name, a `Difficulty` slider, `Play` in the difficulty colour and a `How to play` toggle. Changing the slider builds a fresh course behind the panel.
- Steering: drag anywhere on the canvas (relative; 6 m per canvas width; a new drag starts from where the ball is), or hold A/D or Left/Right. Both feed one steering value.
- P clicks the shell's `#pause-game` (ignoring repeats, modifier keys, open dialogs and text fields, but not the slider), so the shell's label, overlay and save stay in sync. R at Game Over plays again. Escape is left to the shell's Study shortcut.
- Death: a block hit freezes the ball and replaces it with a burst of magenta, cyan and white cubes; a fall keeps the ball visible as it drops. Input is cleared and the score frozen.
- Game Over: `GAME OVER`, the reason (`You hit a block` / `You fell off the track`), the score, the difficulty badge (with a crown when a record was set), the three records, `Home` (back to setup) and `Play again` (same difficulty, new seed). It enters with opacity and a 0.96 → 1 settle over 250 ms on `cubic-bezier(0.23, 1, 0.32, 1)`.
- Shell Restart returns to setup with a fresh course. A restored running run waits behind `Your run is waiting` / `Continue`.
- Pause, blur, tab hiding, pointer cancel or lost capture, death, restart and Study clear held input. A resize ends a drag (it maps canvas pixels to metres) but held keys keep steering. The loop is a fixed-step accumulator capped at 0.1 s per frame; it stops while paused, ready, over or after context loss, and never catches up hidden time.
- The shell owns back, pause, restart, rules, menu, the pause overlay (z-index 20), autosave and Escape. Game panels sit at z-index 10, clear of the toolbar and the 52 px bottom strip. The HUD (mode, score, next target, speed) sits in the toolbar row centred over the track; on screens too wide for that it stops at 1020 px, so it always stays at least 12 px clear of the pause button.

The page exposes `data-phase`, `data-x`, `data-distance`, `data-grounded`, `data-ball-screen-x/y`, `data-aspect`, `data-draw-calls`, `data-geometries`, `data-difficulty`, `data-speed`, `data-boost`, `data-gates` and `data-score` for tests.

## Saves and legacy migration

Version 4 snapshots hold the difficulty, the records and the run (seed, run counter, phase, distance, lateral state, height and vertical speed, elapsed time, gate index, Speed Up time, dying time, score, reason), plus the NEW marks of a finished run. Records live only in this snapshot; the game keeps no storage of its own. Restore never throws. It validates every run field (finite and in range, seed 1..0xffffffff, distance at most 1e6 m before the course is touched, gate index consistent with the course, a grounded ball resting on supported road); an invalid run is dropped and the records kept. A `dying` snapshot comes back as Game Over. A restored Game Over keeps only the NEW marks today's records still confirm and refocuses `Play again`.

Version 1–3 saves come from the old course: their position is never resumed (it could sit inside a new block). Their best becomes Medium's all-time record (the old pace sat between Medium and Hard) and the game opens on Medium setup with a note saying the course is new and the best was kept; with a best of 0 it opens the plain setup.

## Rendering

One Three r180 WebGL 2 renderer, `antialias: false`, pixel ratio capped at 1.5, clear colour `#000000`. Palette: track `#333B74`, grid `#929BFB`, sphere `#E500B1`, blocks `#B51CFA`, boost `#00E7EF`; towers `#232764` with `#8890f2` lines.

- Road: instanced tiles rolled by bank, pitched by gradient and yawed along the centre line, at 0.5 / 1 / 2 m detail; five longitudinal lines (thicker centre) and cross lines every 2 m; nothing drawn in drop gaps. Range `min(260, 160 + 1.6·v)` m with fog from `60 + v` to `150 + 1.6·v`. Rebuilt only when the 0.5 m origin moves.
- Towers: a pooled city of 192 instanced boxes plus one line buffer, inner faces at least 5.6 m from the centre, repeating every 56 m and descending with the slope.
- Gate: lavender rings every 3 m, magenta side walls 1.5 m high with pink posts and rails, a cyan entrance ring and forward-pointing cyan chevrons. The walls are solid but harmless: inside the arch the ball rolls along them instead of leaving the road.
- Speed Up trail: up to 18 history samples every 0.5 m; shrinking cyan spheres from 0.6 m to 3.4 m behind the ball.
- Burst: 40 cubes, positions an analytic function of dying time and the seed, so pause and restore are exact; each fragment is kept above the drawn road under it.
- Camera: 3.6 m behind and 1.8 m above, following the ball's height and 85 % of its offset; looks ahead and pitches down when the ball is high above the road (reference page 04). Vertical FOV `64 + 10·clamp((v − 12)/50, 0, 1)`; wide aspects are narrowed so the horizontal view never exceeds 82°, keeping the ball at its portrait screen height. Camera roll is half the bank. A fall keeps the camera and drawn ball inside the tower canyon.

Budget: at most 11 draw calls and 4 geometries while running. Measured: 6–8 calls and 3 geometries in every scene (box, sphere, city lines), constant across restarts. Instance pools (tiles 420, grid 3400, blocks and walls 320, cyan 200, trail 18, burst 40) are allocated once and uploaded by used range. A warm-up render at creation compiles every shader. `model.ts` allocates nothing of its own in steady state; the course calls `model.step()` makes leave about 150–200 B per step, and the shared exact sphere-box test it runs only inside a block's swept bounds allocates a little more. A road rebuild still allocates about 47–76 KB per render, from two independent heap-sampling runs (see TEST_RESULTS.md). No shadows, post-processing or custom shaders.

Missing WebGL 2 shows `3D graphics unavailable` with `Choose another game` and leaves any save untouched. Context loss saves the run and shows `Graphics interrupted` until exit and re-entry. Disposal releases geometry, materials, instances, observers, listeners, the frame loop, the renderer and its context.

## Reduced motion

Read at use time from the shell's Reduce motion setting or `prefers-reduced-motion`. Gameplay speed is unchanged. With it: a fixed FOV (one per aspect), no camera roll, no pitch-down over drops or tilt after a fall; a burst of 14 cubes that only fade, with the same 0.9 s timing; a trail that ends 1 m behind its first sphere (at most 2); and a Game Over panel that fades without scaling. Without it, the FOV widens continuously with speed (never a pulse or shake) and the camera rolls with banks.

## Accessibility

- Accessible names: `Play`, `Continue`, `Play again`, `Home`, the `Difficulty` slider (with `aria-valuetext`) and `How to play` (with `aria-expanded`). Headings `Graphics interrupted` and `3D graphics unavailable`, link `Choose another game`.
- Colour is never the only carrier: difficulty names are text, blocks and arches differ in shape, records have text labels, and SVG icons are `aria-hidden` beside text.
- Status and announcements at start, death and restore (including a restored Game Over and a migrated best). `setLevel` names the mode.
- Focus: the canvas is a Tab stop only while it steers; `Play again` takes focus at Game Over (also after reload), `Play` after Home, and the `Graphics interrupted` heading on context loss when focus was in the game.
- Button labels keep the reference's white-on-colour look but carry a dark edge in a shade of their own fill (edge against fill 4.2–4.9:1). Plain white against the amber and green fills stays below 3:1 by strict WCAG, which ignores text shadows. The speed readout is opaque with a hard outline, so it stays readable over arch bars.
- Panels fit without scrolling from 320×480 to 1920×1080, including 568×320 with the legacy note; help scrolls inside its panel with Play pinned below it.

## History

### Gameplay correction (2026-10-19)

A perspective 3D endless runner in a black void: elevated indigo road and pale violet grid, tall gridded structures on both sides, glossy magenta ball and block hazards, cyan chevrons and acceleration gates. Three loads only through the existing lazy game module. No new dependency, external asset or shader pipeline.

Drag horizontally on the canvas to choose a continuous lateral position. Hold Left/Right or A/D for continuous steering. There is no jump action or mandatory onscreen directional UI. Ramps supply launch velocity; gravity carries the ball across three-metre gaps to lower landing surfaces. Each 24m section has continuous full-width seams, and every obstacle leaves a navigable center corridor. Narrow sections still permit deliberate steering. The opening 72m introduces rolling, a cyan acceleration zone and a ramp gap before the first obstacle.

Fixed 120Hz simulation; exponential steering integrates analytically. Forward speed rises from 12 to 22m/s, with smooth local boosts of up to 40% in cyan zones. Distance score is floor(metres); best remains the maximum distance. Edge falls and sphere/box collisions end the run.

The game root fills its parent's entire stage. The renderer uses the real canvas aspect at each resize; short/wide displays extend the black scene. Shared shell controls and pause overlay remain parent-owned. The module supplies only its distance/record HUD and start/retry/loss/fallback messages.

Pause/blur/cancel/resize clear input and capture. Restored runs require explicit Continue. v2 saves store absolute terrain elevation for real ramp physics. v1 snapshots preserve seed, distance, best and phase, rebasing their old relative height onto the new course and retaining airborne velocity. The changed terrain is disclosed in Continue text; old airborne state cannot reproduce obsolete jump-course geometry exactly.

The city uses fixed instanced boxes plus one combined grid-line buffer. Road/grid/obstacle/gate buffers are reused. Disposal releases geometry, materials, instances, observers, events, RAF, renderer and context. Missing WebGL shows a visible exit; context loss saves the run and requires exit/re-entry.

Stills support composition, not exact continuous motion or original timing. See TEST_RESULTS.md for actual evidence and limits.

### Procedural obstacle correction (2026-10-19)

New runs use a strong seed/section hash to vary block side, longitudinal placement, dimensions, and occasional paired gates. Opening sections, gap ramps and cyan speed gates stay clear. All generated blocks remain inside the road and leave at least 0.22m beyond a centered sphere's radius; sections meet continuously. A 64-seed driver traverses 2.5km per seed including maximum base speed. Generation uses section indices, so no mutable obstacle queue can leak across restart.

The renderer consumes the exact width/height/depth/position data used by the sphere collider. Collision tests minimize the distance along the full three-dimensional motion segment to an AABB, including lateral contact, tangents, rounded-corner misses, and zero-length motion. Nonfinite input is ignored. Version 3 snapshots carry course 1 (original obstacle layout) or course 2 (procedural layout). Versions 1 and 2 migrate with the original hazards and retain seed, progress, best score and terrain height; restarting chooses a fresh procedural course.
