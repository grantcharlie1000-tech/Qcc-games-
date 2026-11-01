# Crossy Road remake for QCC Games: reference pack

Game id: `crossy-road`. Title: **Crossy Road**. Route: `#/game/crossy-road`.
This pack lives at `docs/crossy-road-pack/` on branch `ref/crossy-road-pack`.

- `frames/tMMSS.jpg`: 24 key frames from Charlie's reference video (720x1560 portrait phone capture, 480 px wide copies). The name is the timestamp, e.g. `t059.jpg` = 0:59.
- `contact-sheet.jpg`: all 24 frames in an 8x3 grid.
- `PROMPT.md`: the build brief for the implementing agent.

Use the frames for **gameplay, camera, scale, timing and lane look** only. **Do not copy** the original's UI, menus, fonts, characters, logos, sounds or art assets. Build everything as original QCC work.

---

## 0. What to ignore from the video

| In the video | In our remake |
|---|---|
| Title screen, character select, menu buttons, settings and ads | None of it. The QCC shell already provides the Games / live-info / Menu dock. |
| Gift box / prize machine / coin-spend unlock / character collection | Gone. There is **exactly one character**, an original voxel chick-like "QCC hopper" in QCC colours. |
| Coins counter, coin pickups | Leave them out (no economy). An optional cosmetic pickup counter is **not** wanted. |
| Original top-left score font / top-right coin UI | Score goes to the shell via `ctx.setScore` (the dock's centre live info). A minimal in-canvas score is fine only if the shell hides it. Follow Ball Run's pattern. |
| Branded characters, Disney/other skins, music | None. Use Web Audio oscillators only, sound OFF by default (repo rule). |

## 1. Core loop

- The world is a vertical stack of **rows (lanes)**, each 1 tile deep. The player starts on row 0 at the centre column. Forward = +row (up the screen / away from the camera).
- **Playable width: 9 columns** (`col 0..8`, start at `col 4`). Lanes visibly extend ~4 tiles further each side in **darkened** colour (decor only; you cannot step there). Vehicles and logs spawn and despawn in the dark zone so they slide in naturally.
- One input = one hop of exactly one tile (forward, back, left, right). Hops are grid-snapped. Smooth the visuals only; logic is discrete.
- **Score = highest row index ever reached** (furthest forward). Stepping back does not lower it. It is shown live through `ctx.setScore(score)`. This makes the shell track the best and queue the leaderboard sync (see §7).
- Run ends on any death (§4). Show a QCC-styled game-over card with Score, Best, **Play again** (also Space/Enter/tap) and **Rankings** (`ctx.openRankings?.()`).

## 2. Controls (full screen, touch + keyboard)

| Action | Keyboard | Touch |
|---|---|---|
| Hop forward | `W`, `↑` | **Tap** anywhere on the playfield, or swipe up |
| Hop back | `S`, `↓` | Swipe down |
| Hop left/right | `A`/`D`, `←`/`→` | Swipe left/right |
| Pause | `P` (and the shell's own pause / Menu) | Shell Menu |
| Restart after death | `Space`, `Enter`, `R` | Tap the "Play again" button |
| Study / subject article | `Escape`: handled by the shell already. **Do not** capture or `preventDefault` Escape. | – |

- Swipe threshold: ≥ 24 CSS px and dominant axis ≥ 1.5× the other; otherwise treat as a tap (forward). Use pointer events with `touch-action: none` on the canvas host. Never block page-level gestures outside the game stage.
- **Input buffer:** while a hop animates, queue at most **1** further input. Run it the instant the hop lands. Extra presses during the same hop are dropped. Key auto-repeat (`e.repeat`) is ignored, so holding a key does not spam hops.
- Rotation-agnostic: everything works in portrait phone (390x844) and landscape Chromebook (1366x768).
- **Blocked moves:** hopping into a tree/rock or outside col 0..8 does nothing. Play a tiny "bonk" squash in place. It is **not** a death and does **not** consume the idle timer reset.

## 3. Hop feel

- Hop duration **120 ms** (tunable 100–150). Arc height 0.5 tile: `y = sin(p·π)·0.5`. Ease XZ linearly.
- Character faces the hop direction (instant yaw snap at hop start).
- **Squash-and-stretch:** a short pre-hop squash (scaleY 0.8, 40 ms) is visual only. **Do not delay** the logical move; the input→move latency must be ≤ 1 frame.
- Logical position changes **at hop start** for forward/back progress and scoring. Collision with cars/trains uses the *rendered* interpolated position (see §4).
- Respect `prefers-reduced-motion` and the shell's reduced-motion setting: no camera shake, no squash, no splash particles, and shorter (or no) death animations. Gameplay timing stays the same.

## 4. Deaths: every one shown in the video, with exact rules

All collision is **axis-aligned in tile units** with forgiving hitboxes. The player's hitbox is 0.6 tiles wide, centred on the rendered position. Vehicles' hitboxes are their visual length minus 0.1 tile per end. On death: freeze input, play the death animation (≤ 900 ms, ≤ 300 ms reduced-motion), then the game-over card.

| # | Death | Video | Rule |
|---|---|---|---|
| D1 | **Hit by car / truck (squash)** | 0:59–1:00 (`t059`, `t100`) | Player on a road row and their x-interval overlaps a vehicle's x-interval. **Side hit** (vehicle drives into you) → character flattened sideways and carried a little. **Hop into the vehicle** → flattened against it. Both are just "squashed" in logic. The check runs every frame, including mid-hop, against the row the player is logically in. |
| D2 | **Hit by train** | 0:50–0:51, 1:11 (`t050`, `t051`, `t111`) | Same overlap rule on a rail row. The train is a long fast vehicle (≥ 12 tiles) that crosses the whole width. Death animation: knocked off-screen. **Warning:** the signal light starts flashing red with a bell tone **≥ 1.0 s** (default 1.1 s; never under 0.9 s even at max difficulty) before the train's front enters the playable area. The track is otherwise empty and safe. |
| D3 | **Drown (miss the log)** | 1:21 (`t121`) | Player lands on a river row and is **not** on a log or lily pad. The landing x is tested against floating platforms at landing time. Splash animation, character sinks. There is no "blocked" behaviour: hopping into open water is legal and fatal. |
| D4 | **Carried off-screen on a log** | (see river frames `t115`–`t125`) | While riding a log the player moves with it (x += log.vx·dt). If the player's centre leaves the playable band (x < -0.5 or x > 8.5, i.e. past the darkened edge) → death (swept away). When the player hops off a log, they snap to the **nearest integer column** of the landing row. If that column is outside 0..8, the hop is blocked. |
| D5 | **Eagle: idle too long** | 0:27–0:30 (`t027`, `t028`, `t030`) | If the player has **not reached a new maximum row for 7.0 s** (original ≈ 5 s; we are kinder for students; tune 6–8 s), the eagle swoops in from the top of the screen and carries the player away. Sideways and backward moves do **not** reset the timer. Give a **visual + audio warning at 5.0 s** (screech tone, shadow appears). |
| D6 | **Eagle: fell behind the camera** | 0:27–0:30 | The camera scrolls forward on its own (§6). If the player's row is ≥ **3 rows behind** the camera's "safe line", or the player has moved **3 rows back** from their max row, the eagle comes immediately (no warning beyond the shadow). |

Notes:

- Lily pads are fully safe and static. Logs are safe.
- Water edges: players cannot stand on the dark-zone part of a log beyond col 0..8 (rule D4).
- Grass, trees and rocks are never lethal. Trees and rocks just block.
- There are no other death types. Do not add police cars with sirens, cliffs or anything else.
- The death cause is announced via `ctx.announce('Hit by a car')` and similar, for screen readers. Keep wording neutral and student-friendly (no gore: squash is a cartoony flatten, then fade).

## 5. Procedural lane generation

All randomness comes from **one seeded PRNG**: reuse `mulberry32(seed)` from `src/core/random.ts`. Seed = `Date.now() ^ runCounter` for normal play, and `?seed=` / a test hook for deterministic tests. Generation is a **pure function** in `src/games/crossy-road/generator.ts`: `(seed, fromRow, count, prevState) → Lane[]`. Keep it free of Three.js so Vitest can test it directly.

### Lane types

```ts
type Lane =
  | { kind:'grass';  row:number; shade:0|1; blocked:boolean[9] /* tree|rock per col */; decor:... }
  | { kind:'road';   row:number; dir:-1|1; speed:number /*tiles/s*/; vehicle:'car'|'truck'; spacing:number; phase:number }
  | { kind:'rail';   row:number; dir:-1|1; period:number /*s between trains*/; phase:number }
  | { kind:'river';  row:number; dir:-1|1; speed:number; logLen:2|3|4; gap:number; phase:number }
  | { kind:'lily';   row:number; pads:boolean[9] }   // static river row with pads
```

Vehicles, logs and trains are **deterministic functions of time** (position = phase + speed·t, wrapped over a cycle length). That makes the state replayable and serializable, and lets tests compute danger at any time t without simulation drift.

### Chunk algorithm

Generate in **chunks** ahead of the player. Always keep ≥ 30 rows generated ahead of the camera, and dispose rows > 12 behind it.

1. Rows 0–4 are always grass with no obstacles in cols 2–6 (a safe start).
2. Pick the next chunk type by weighted random using difficulty `d = clamp(row/300, 0, 1)`:
   - grass: 0.40 → 0.22
   - road: 0.32 → 0.38
   - river: 0.16 → 0.22
   - rail: 0.12 → 0.18
   - **Never two rail chunks in a row.** Never more than two hazard chunks without at least one grass row in between until row 60. After that, at most three in a row.
3. Chunk thickness:
   - grass 1–3 (1–5 early)
   - road 1–4 (1–2 before row 20)
   - river 1–3; lily-pad rows count as river and appear as at most one row in any river chunk, never first
   - rail exactly 1, occasionally 2 adjacent tracks after row 120
4. **Per-row parameters** (lerp by d, then jitter ±15% with the PRNG):
   - **Road:** speed 1.5 → 4.5 tiles/s. Cars are 1 tile, trucks 2–3 tiles (truck share 0.2 → 0.4). One vehicle type and one direction per lane. Spacing between vehicle fronts 7 → 4 tiles, **never a gap under 3 tiles** (≥ 2.5 tiles of empty road at the player's line). Adjacent road rows prefer opposite directions (70%).
   - **River:** log speed 1.0 → 2.6 tiles/s. Log length 4 → 2 (weighted, min 2). Gap between logs 2 → 4 tiles, **max 4**. Adjacent river rows **must** alternate direction.
   - **Rail:** train speed 18 tiles/s, length 12–20 tiles. Period 9 → 5 s with a random phase. Warning lead ≥ 1.0 s.
   - **Grass:** tree/rock density 0.10 → 0.30 per column. Two greens alternate by row parity (as in the original).

### Fairness guarantees (must be unit-tested)

The generator owns these invariants. Write tests that run ≥ 2,000 seeds × 400 rows.

- **F1 Path through grass:** for every pair of consecutive non-hazard rows, at least one open column in row r is also open in row r+1 *or* reachable by sideways moves within row r. Simplest proof: run a BFS over the static grid (grass blocks only, hazards treated as passable) from the start column. **Every generated row must contain a reachable open column.** If not, delete the blocking obstacles (regenerate deterministically).
- **F2 At least 3 open columns** in every grass row, and the column directly ahead of the start is open in rows 0–4.
- **F3 Road gaps:** at any time t, in any road lane, the free stretch of road containing *some* column in 0..8 is ≥ 2.5 tiles. The time from one vehicle's back passing a column to the next vehicle's front reaching it is ≥ 3× hop duration + 0.25 s.
- **F4 River reachability:** for each river row r (entered from r-1), within any 3 s window there exists a time when a log/pad covers some column c in 0..8 that the player can be at on row r-1. Test this by sampling t in 0.05 s steps. For river→river transitions, the next row's logs must overlap the current log's span for ≥ 0.4 s within every period (the "≤ 1 tile reach" rule from the original).
- **F5 Rail warning:** the light flashes ≥ 1.0 s before the train front enters cols 0..8, at all difficulties.
- **F6 Determinism:** same seed → identical lanes (deep-equal) and identical hazard positions at identical t.
- **F7 Never generate** a lily-pad row with 0 pads in cols 0..8 or with all pads unreachable from the row before.

## 6. Camera

- **Orthographic** camera looking down the forward axis at roughly the original's angle: pitched ~55–60° down, yawed ~15–20° so lanes run slightly diagonal (voxels read better at an angle). Use a fixed frustum height in tiles. Fit the 9-column playable band plus ~1 tile margin to the viewport width on portrait phones. On landscape, show more rows (keep the zoom so tiles are ≥ 36 CSS px).
- The camera follows the player's **x** softly (lerp 0.1/frame, clamped so the band stays on screen) and **z** with a forward bias. The player sits ~35% up from the bottom (portrait).
- **Auto-scroll:** the camera's minimum forward position advances at 0.35 → 0.9 rows/s (by d), but only after the first hop. It never moves backward. Lag behind it → D6 eagle.

## 7. Leaderboard and save

- Use the **existing** system exactly as other scored games do:
  - `ctx.setScore(score)` on each new max row. The shell stores the best locally for guests and signed-in players, and queues `leaderboards.sync.queue('crossy-road', best)` for signed-in accounts.
  - `ctx.submitRecord?.()` / `ctx.openRankings?.()` from the game-over card, like Quadfall/Flappy.
  - Add `'crossy-road'` to `SCORED_GAMES` in `src/leaderboard/shared.ts`.
- **DB note (schema change):** `arcade_scores` has a CHECK constraint `arcade_scores_game_id_check` listing allowed `game_id`s. Server-side ranking of `crossy-road` therefore needs a **new migration** in `netlify/database/migrations/` following `20261030190000_minesweeper_score.sql` (drop + re-add the constraint with the full current list + `'crossy-road'`). This is a database schema change and must be approved by Charlie: see PROMPT.md for how to handle it.
- `serialize()` / `restore()`: store seed, current row, max row, elapsed time `t`, player pos and the alive flag. `restore` must validate every field and fall back to a fresh run if invalid. Never store anything personal.
- Score validity: positive integer ≤ 2147483647. Score 0 isn't submitted.

## 8. Art direction (original, QCC style)

- **Voxel / low-poly boxes.** Everything is built from `BoxGeometry`, merged per lane with `mergeGeometries`, or `InstancedMesh` for repeated trees/cars/logs. Flat-shaded `MeshLambertMaterial` (or `MeshStandardMaterial` with low roughness detail). Vertex colours or small palettes. **No textures, no downloads, no CDN.**
- One `DirectionalLight` with **hard shadows** (shadow map ≤ 1024, PCF off or basic) + hemisphere light. Drop shadows to blob decals on Low quality.
- Palette (bright, readable, colour-blind-safe redundancy):
  - grass `#8fd14f`/`#86c946` alternating; dark zone ×0.65
  - road `#4b4f58` with dashed lane marks
  - rail sleepers brown + steel rails
  - water `#4fc3f7` with a lighter foam strip
  - logs `#8d5a3b`; lily pads `#3fa34d`
- Vehicles are chunky boxes with windows in 5–6 bright colours. **Trucks have a distinct cab shape** and trains are long and striped. Hazard identity must not depend on colour alone (shape + motion).
- The rail warning light is a pole with a lamp that flashes red **and** grows/pulses (redundancy) + bell.
- The character is an original small voxel bird or hopper (white/cream body, QCC-accent beak/scarf). It must not be a copy of the original chicken.
- The game-over card, buttons and any overlay use QCC's own design tokens (Liquid Glass style when PR #80 lands). No original Crossy Road branding or fonts.

## 9. Sound (Web Audio oscillators only, default OFF via `ctx.sound`)

| Event | Sound |
|---|---|
| hop | short 40 ms square blip, pitch +2 st on forward |
| bonk (blocked) | low thud |
| car passing near | optional soft whoosh |
| truck/car hit | crunchy noise burst (not scary) |
| train warning | 2-tone bell loop while the light flashes |
| train pass | low rumble |
| splash | filtered noise drop |
| eagle warning | rising screech-ish sweep |
| every 25 rows | small chime (the original plays a "kachunk" every 50) |

## 10. Accessibility and student safety

- Keyboard only and touch only both fully playable. Visible focus on the card buttons.
- `ctx.announce` for: new best, death cause, paused/resumed.
- Colour-blind redundancy (shapes, motion, light pulse).
- `prefers-reduced-motion` honoured (§3).
- No ads, no analytics, no network calls from the game, no chat, no user-generated content, no external links. Death effects are cartoony with no blood.
- Leaderboard names are already validated/filtered by the existing system. Don't add new name inputs.

## 11. Performance targets

- **School Chromebooks** (Celeron/MediaTek, 4 GB, integrated GPU) at 1366x768: steady **60 fps**, never below 45 fps. **Phones** (mid-range Android, iPhone 11+) at 390x844: 60 fps.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`. On Low quality (auto-drop if the 2 s rolling average < 50 fps) use pixelRatio 1, no shadow map, and fewer decor instances.
- ≤ ~120 draw calls. Merge static lane geometry per chunk. Instance the vehicles/logs/trees. Reuse geometries/materials (no per-frame allocation in the hot loop).
- Pause the RAF loop when `pause()` runs or the tab is hidden. `dispose()` frees every geometry, material, render target and the renderer, and removes all listeners.
- JS for the game chunk ≤ 60 KB gzip on top of the shared three chunk (lazy-loaded via the existing loader).

## 12. How the original was made (research summary, for context)

- Hipster Whale (Matt Hall, Andy Sum) built it in about 12 weeks in **Unity**. Ben Weatherall made the art in **Qubicle** voxels. It took inspiration from Frogger and Flappy Bird ("endless Frogger"). [Polygon, GDC 2015](https://www.polygon.com/2015/3/3/8142247/crossy-road-earnings-10-million-gdc-2015/); [GDC Vault: "Crossy Road: A Whale of a Time"](https://gdcvault.com/play/1021898/Crossy-Road-A-Whale-of); [Game Developer](https://www.gamedeveloper.com/business/video-deconstructing-the-successful-design-of-i-crossy-road-i-); PocketGamer.biz "making of Crossy Road" interview.
- Design pillars: one-tap grid hops with "really obvious hit boxes and sharp edges", an angled camera because voxels look better that way, and **procedural** lanes as the key addition.
- Eagle: about **5 s** without forward progress, or **3 rows back**, triggers the eagle. Sideways moves don't reset it. The screen creeps forward over time. [Crossy Road wiki: Eagle](https://crossyroad.fandom.com/wiki/Eagle); Gamezebo Crossy Road tips guide; Arqade (gaming.stackexchange) answer on the eagle.
- Rivers: logs must be within reach; riding a log out of the lit area or missing a log is death. Rails: the red light means a train in about 1–2 s. Crossy Road fandom wiki: River and Railroad pages.
- One vehicle type and direction per lane; lily pads are safe; stay central. Playable width is 9 tiles, with darker tiles outside it and two alternating grass greens. Gamezebo; an archive.org Crossy Road strategy guide.
- Web clones (structure ideas only, write our own code): the freeCodeCamp / javascriptgametutorials Three.js tutorial (OrthographicCamera, lane metadata, delta-time movement with wraparound); simondoesstuff/crossy-road ("leash" target + arc smoothing); Jacky-111111 clone (input buffer, squash on landing, culling behind); iam-pankaj gist (sin-arc hop).

## 13. Frame index

| Frame | What it shows |
|---|---|
| t003–t017 | start area, grass rows with trees, first roads, hop pose and camera angle |
| t020–t024 | multi-lane roads, mixed car/truck lanes |
| t027–t030 | idling → eagle swoop death (D5/D6) |
| t035–t047 | river with logs and lily pads, more roads |
| t050–t051 | rail warning light → train hit (D2) |
| t055–t059, t100 | dense road → car squash (D1) |
| t105–t111 | rail tracks, second train death |
| t115–t125 | river crossing, riding logs → drowning splash (D3), log drift (D4) |
