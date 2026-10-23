# Ball Run redesign — design

Date: 2026-10-23. Source brief: `Ball-Run-Reference.pdf` (10 pages, "Rebuild Reference for QCC Games", prepared 21 October 2026 from a 62-second Hard-mode recording). **Pages 1–9 only:** Charlie asked to ignore the final page (the condensed coding-agent prompt); everything this design takes from the brief is on pages 1–9. Plus Charlie's direct requests in this session:

1. Use the reference to redesign Ball Run.
2. The ball must **accelerate more slowly** and have a **much higher speed cap**.
3. **More obstacles**, placed **more randomly** and **more difficult** to get through.
4. (During the build) **The gates symbolise a permanent speed boost.**

The reference separates OBSERVED facts from PROPOSED web adaptations and UNKNOWN values. Every UNKNOWN that this design fixes is marked *design call* and lives in one editable configuration table.

## Intent

Ball Run should play like the recorded game: an automatically advancing glossy magenta sphere on a suspended indigo grid road, inside a black void lined by lavender wireframe towers. The road itself is the challenge — it curves, banks, narrows, crests and drops away — and magenta blocks must be threaded at speed. Runs start manageable and keep getting faster for minutes, rather than topping out after the first minute. Death is clear and immediate, retrying is one key or tap away, and per-difficulty records give each run a target.

## Goals

- Faithful look: palette `#000000` void, `#333B74` track, `#929BFB` grid, `#E500B1` sphere, `#B51CFA` blocks, `#00E7EF` boost; tall wireframe towers; perspective chase camera; open track edges with no guardrail.
- Track vocabulary from page 04: wide straight, narrow straight, offset transition, bend/S-curve, bank, crest/dip, boost arch, descent/landing. All are real geometry used by both rendering and physics.
- Continuous steering: drag anywhere on the play surface (relative — a new drag never teleports the ball), A/D and Left/Right through the same movement model. No lanes, no jump, no brake.
- Speed: slower acceleration than today and a much higher cap (numbers below).
- Obstacles: many more, randomly composed patterns, harder at higher difficulty and further into a run, but **every course always has a reachable route** for the ball's real steering limits.
- Easy / Medium / Hard setup panel (green / amber / coral), HUD with mode, score and the next record to beat, a death burst, and a Game Over panel with today's, this week's and all-time bests per difficulty.
- Lifecycle Ready → Playing ⇄ Paused → Dying → Game Over; P pauses/resumes, R plays again from Game Over, Escape keeps the shell's Study shortcut.

## Non-goals

- No audio reconstruction (the recording is silent). Existing shell tap/lose cues stay.
- No new runtime dependency, external asset, shader pipeline or post-processing.
- No change to the shell, leaderboard protocol or other games.
- No exact recreation of unknown original values (speed, FOV, scoring, generation); chosen values are editable and documented.

## Anti-goals (would be a failure even if it "works")

- An unwinnable section: a block wall with no reachable gap, a narrowing or shift the ball cannot physically follow, a drop the ball cannot clear at its current speed.
- Teleporting on a new drag, lane snapping, or an invisible lateral clamp holding the ball on the road.
- Simulation speed depending on render frame rate, hidden-tab catch-up, ticking score after death, double death handling.
- The recording's 79/143 values appearing as defaults for fresh profiles.
- Breaking existing saves into an error state, or losing an earned record.

## Constraints

- Lives in `src/games/ball-run/` (`model.ts` pure simulation and generation, `index.ts` Three.js renderer and DOM UI, `style.css`). Three r180 is already a dependency and is lazily loaded with the game module.
- Shell contract (`src/core/types.ts`): the shell owns back, pause, restart, rules, menu, the pause overlay, autosave via `serialize()`, and Escape → Study. `context.setScore` feeds the shell RECORD and the single global leaderboard.
- Fixed-step simulation (120 Hz) independent of frame rate; deterministic per seed so saves restore exactly.
- Software-WebGL CI (SwiftShader): keep draw calls and per-frame allocations low; reuse instanced buffers.

## Decided how (from the brief and requests)

### Speed (Charlie's requests: slower acceleration, much higher cap, gates are permanent boosts)

Charlie confirmed during the build that **the cyan gates are a permanent speed boost**. Speed is therefore a slow continuous ramp plus a permanent gain for every gate passed, capped:

`v(d) = min(cap, sqrt(v0² + 2·a·d) + gain × gatesPassed(d))`

Every gate spans the whole road, so a surviving run has passed exactly the gates behind it and speed stays a pure function of distance on a given course (which keeps the reachability guarantee exact). Gates are scheduled by running time, so their share of the acceleration is predictable.

| | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Start `v0` | 9 m/s | 11 m/s | 13 m/s |
| Continuous acceleration `a` | 0.03 m/s² | 0.045 m/s² | 0.06 m/s² |
| Gate gain (permanent) | +1.0 m/s | +1.25 m/s | +1.5 m/s |
| A gate every | 30–45 s | 25–40 s | 20–35 s |
| Cap | 40 m/s | 50 m/s | 62 m/s |
| Speed at 60 s (simulated) | ~12 m/s | ~15 m/s | ~20 m/s |
| Cap reached | ~9.5 min | ~7.5 min | ~7 min |

Today's game starts at 12 m/s, gains 0.14–0.26 m/s² and is capped at 22 m/s after ~50 s. Every tier now accelerates more slowly on average (Hard ~0.11 m/s² including gates), and the caps are about 2–3× today's. Lateral steering authority scales with speed (`6 + 0.16·(v − 12)` m/s, never below 5) so high speed stays steerable but each dodge costs more road.

### Boost gates (from the brief; permanence confirmed by Charlie; values design calls)

A gate is an arch (grid arch, magenta side walls, cyan chevrons) over a straight, full-width stretch of road. Crossing its entrance permanently adds the gate gain (none once at the cap). Feedback: a "Speed Up" label (or "Top Speed" when already capped) and a short magenta trail for 1.2 s. The side walls are solid but harmless: inside the arch the ball rolls along a wall instead of leaving the road (*design call*; a visible wall, not an invisible clamp). Steering keeps full authority in the air everywhere (*design call*, matching today's game). No obstacles inside the arch or in the first second after it.

### Obstacles (Charlie's request; generation is a design call)

Rows are spaced in **time**, not distance, so density holds as speed climbs: a new row every 1.0–1.8 s (Easy), 0.75–1.35 s (Medium), 0.55–1.05 s (Hard), tightening over the first ~600 m. Today's game averages one block every ~2–3 s with the centre always clear.

Seeded patterns: single block (random size and lateral position, including large blocks), gate wall with one gap, wall with two gaps, slalom (alternating blocks), zig-zag corridor, scatter field, edge pillars on narrow ribbons, and laterally sliding blocks (Medium/Hard). The minimum gap is 2.0 m (Easy), 1.7 m (Medium), 1.45 m (Hard) against a 0.76 m ball.

**Reachability guarantee:** the generator propagates the set of lateral positions reachable along the road (1 m steps) using the ball's real lateral authority at the worst-case speed for that stretch with a safety factor, intersected with road bounds and blocked intervals (sliding blocks block their whole sweep). A pattern is only accepted if a reachable gap survives; otherwise it re-rolls and finally falls back to a guaranteed-safe placement. An independent look-ahead bot in the tests drives the real simulation through every difficulty and many seeds, including at the speed cap.

### Track (from the brief; parameters design calls)

A seeded sequence of variable-length segments: wide straight, narrow ribbon (tapered), offset transition, S-bend, banked section (surface roll with gentle drift toward the low side), crest/dip (high enough speed briefly lifts off), drop (road ends, continues lower; always clearable at the speed there), boost gate, curved ribbon (Medium/Hard). Road width: Easy 6.2 m, Medium 5.4 m, Hard 4.8 m; ribbons 2.6 / 2.2 / 1.8 m. Rates of lateral shift and narrowing are bounded by the steering authority. The opening ~80 m is a clear warm-up.

### Records and scoring (brief's proposed defaults)

Score is whole metres travelled, frozen at the moment of death. Records are kept per difficulty: today's best (local calendar day), this week's best (Monday-start local week) and all-time best; stored in the game's save. *Design call (builder check):* records are committed exactly once when a run **ends, however it ends** — death, or abandoning an unfinished run through the shell's Restart. Leaving the game mid-run is not an ending (the run is saved and can be continued). Each commit also sends one final unthrottled score report, so the shell RECORD and the per-difficulty all-time can never disagree because of throttling. The HUD shows the smallest record still above the current score (ties show the broader scope: All time > This week > Today); after beating all, it shows the new best. The shell's global RECORD and online leaderboard keep receiving the score in metres, as today.

### Lifecycle and controls (brief)

Ready (setup panel) → Playing ⇄ Paused → Dying (one burst of magenta, cyan and white squares, ~0.9 s; input cleared, score frozen) → Game Over (dimmed world, score, difficulty badge, three records, Home → setup panel, Play Again). P toggles the shell pause; R plays again from Game Over; Escape is left to the shell. Pause, blur, tab hiding, pointer cancel and resize clear held input; resume never catches up hidden time.

### Shell integration (from the shell contract and sibling games)

- The shell keeps back, pause, restart, rules, menu, the pause overlay (z-index 20; game overlays stay below it), autosave and Escape. The game never binds Escape.
- **P** clicks the shell's `#pause-game` button exactly as Neon Coil does (`src/games/neon-coil/index.ts:113-117`), so the shell's label, overlay and save stay in sync; it ignores repeats, modifier keys, open dialogs and text fields (the difficulty slider is exempt).
- **R** at Game Over calls the same play-again path as the Play Again button (same difficulty, new seed). The shell's Restart button returns to the setup panel with a fresh course.
- **Home** on the Game Over panel returns to the game's own setup panel to change difficulty (*design call*: the shell's back arrow already leaves to the library).
- Accessible names: `Play`, `Continue` (restored run), `Play again`, `Home`. Shared checks that matched the old names (`tests/e2e/study.spec.ts:35`, `scripts/verify-offline.mjs:25`) are updated in the same change.
- `context.setScore` is throttled (at most a few calls per second plus one on death) because one call per metre at 60 m/s would write storage dozens of times a second. Status/level text keeps flowing for screen readers.
- Data attributes the tests read stay: `data-phase` (now also `dying`), `data-x`, `data-distance`, `data-grounded`, `data-ball-screen-x/y`, `data-aspect`, `data-draw-calls`, `data-geometries`; plus `data-difficulty`, `data-speed`, `data-boost` (Speed Up feedback showing), `data-gates`. The `.br-boost` "Speed Up" label still toggles `hidden`.
- Colour is never the only carrier: difficulty names are text, blocks and boost arches differ in shape, records have text labels.

### Saves

Version 4 snapshots hold the run (seed, difficulty, distance, lateral state, gate index and Speed Up feedback, phase) and records. Version 1–3 saves come from a different course: their in-progress position is not resumed (it could sit inside a new block); their all-time best is kept as Medium's all-time record (*design call*: the old pace sat between Medium and Hard; the shell RECORD is unaffected either way). A restored v4 run needs an explicit Continue.

### Reduced motion

Without reduced motion the camera's field of view widens gradually with speed (continuous, never a pulse or shake) and rolls part-way with banked road. With the shell's Reduce motion setting (or the OS preference), read at use time: fixed FOV, no camera roll, a smaller and gentler death burst (same 0.9 s timing), a shorter trail, and the Game Over panel fades without scaling. Gameplay speed is unchanged (it is the game).

### Performance budget

Today's scene is 7 draw calls / 3 geometries. New visuals reuse those instanced meshes where colour allows (arch rings join the grid mesh, chevrons the cyan mesh, tunnel walls a magenta mesh) and add at most a pooled trail and a pooled burst, hidden when unused. No per-step allocation in the simulation's hot path; course data is generated once per seed and cached.

## Left to the builder

Exact pattern weights per difficulty and distance, segment length ranges, tunnel/arch dimensions, particle counts, camera offsets, and the visual treatment of sliding blocks — within the constraints above and verified against the reference frames and the bot.
