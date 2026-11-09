# Last Light platforming-first revision — 9 November 2026

The current revision prioritizes movement and timing. Every exit works without interaction; story, machinery and the final narrative choice are optional. Results appear immediately. Mounted steam/electrical emitters, compact pressure regulators and world-space building construction replace the confusing isolated fixtures.

- `npm run build`: **PASS**, including TypeScript, Vite, host preparation and service-worker retirement. The existing unrelated bundle-size advisory remains.
- Regression command `npx vitest run tests/games/last-light tests/core/posters.test.ts tests/core/storage.test.ts tests/accounts tests/leaderboard`: **472/472 pass in 21 files**. Includes local Postgres account, save and ranking checks. The campaign, composition, checkpoint, guidance and continuous-journey subset also passed separately: **220/220**.
- Full six-phase difficulty audit: **40/40 pass**. The sampled start-to-exit graph includes optional routes and deliberately ignores hazards when probing a repeated full jump/midair-dash policy. The tutorial requires at least one control change, the remaining Quarter levels at least two and all later levels at least three. Focused checks confirm the final optional-memory adjustments in levels 12 and 38. This bounded audit is not an exhaustive proof over every possible technique.
- All forty legal-input recordings complete through the actual **120 Hz model with interaction disabled and zero deaths**. Every route starts at the real spawn and moves solely through input; checkpoints, positions, speeds and encounter state are never assigned during traversal. Independent replay verifies every recording.
- Chromium UI coverage: **18 cases pass** across the UI suite and the independently rerun opening replay. Keyboard movement/dash/retry/pause, phone multi-touch and cancellation, maps, journal, optional dialogue, saves, results-first ending, artwork states and audio lifecycle pass. The opening replay sends DOM keyboard events to the actual game instance, preserves each 120 Hz input step and batches rendering through the real fixed-step loop to avoid flooding the browser graphics queue.
- All **122 campaign checks** and **44 composition checks** pass, including optional memory return routes, headroom, fixtures and moving sweeps. Optional discoveries do not create exit requirements.
- All paired timed barriers are visible from their stable approach in the 320px and 390px camera audit. Gate emitters show an amber warning before collision resumes. Safe, active, warning and disabled steam states were inspected, along with crumble fracture/fall/rebuild and pursuit HUD states.
- The campaign retains **916 main ledges** and has **408 authored hazards**. Transit ledges below 200px have a **96px median**, with final precision catches as small as **40px**; flags and observation decks remain broad. The previous campaign's permissive constant-hop policy cleared 32 complete levels and admitted every local main transition, which exposed the earlier difficulty problem.
- Current expert scripted clears span **15.208–28.983 seconds**, median **24.058 seconds**, totalling **15m51s**. These recordings demonstrate playability, not an average human completion time or a subjective difficulty rating.
- Desktop, 320px and 390px visual checks cover connected masonry/supports, mounted machinery, readable play space and optional contextual interaction. The voxel poster remains covered by the poster regression suite. Physical-device and WebKit testing were not performed.

Publication uses the existing isolated [Last Light playtest](https://last-light-playtest.nceastudy.pages.dev/#/game/last-light) and verifies its source revision through `deploy-info.json`. Production and the separately documented shared-score database migration remain separate.

---

## Historical journey rebuild verification

# Last Light journey rebuild verification — 9 November 2026

The play-test follow-up replaces the short maps and unclear objective flow. The isolated deployment target is [Last Light play-test](https://last-light-playtest.nceastudy.pages.dev/#/game/last-light); its source revision is checked through `deploy-info.json`. Production and the shared database remain separate.

- Final production build: **PASS**, including TypeScript, Vite, Whetū host preparation and service-worker retirement. The existing unrelated large-bundle advisory remains.
- Final regression command `npx vitest run tests/games/last-light tests/core/posters.test.ts tests/core/storage.test.ts tests/accounts tests/leaderboard`: **498/498 pass in 20 files**, including real local Postgres account and ranking checks.
- Chromium suite against a Vite server with hot reload disabled: **18/18 pass**. The opening is completed through ordinary keyboard actions; phone multi-touch, conversation, map, journal, save restore, ending, artwork states and audio lifecycle pass.
- New journey coverage: **73 checks pass**. All forty recorded 120 Hz input witnesses complete every required objective with zero setbacks. The witnesses move only through legal inputs, without teleporting between platforms. [record-journeys.mjs](record-journeys.mjs) regenerates them; [journey.test.ts](journey.test.ts) independently replays them.
- The original preview's scripted median clear was **4.863 seconds**; the rebuilt median is **22.783 seconds**, with a **14.300–28.392 second** range. Total active scripted campaign traversal rises from **3m38s to 15m10s**. These are automated routes, not estimates of average human completion time.
- Tower shortcut searches cover all eight tower chapters. The shortest goal routes found by the real-trajectory graph retain their complete main routes. Other chapters also have conservative minimum-travel checks that ignore obstacles and allow constant maximum movement speed.
- The campaign has **916 main ledges, 160 named encounter sectors, 131 safe flags, 270 hazards, 120 memories and twelve extended alternate paths**. All 876 intended main connections and 52 alternate-chain connections pass physics checks. All optional memories have an onward route; alternate paths preserve access to required tasks.
- The full **122 campaign regressions** and **44 composition regressions** pass, including terrain headroom, pickup/fixture clearance, mission persistence and all forty exit conditions.
- Additional browser input replays clear chapters **2, 20 and 40** with zero setbacks or page errors. They use actual DOM keyboard events, dismiss conversations through their UI button, and control animation-frame timing for deterministic verification; physics and rendering run through the real game instance.
- Independent 320px, 390px and desktop review confirms named next-action guidance, wheel shutdown feedback, rescue/exit transitions, map section selection and native touch panning. Native touch play crosses the first six opening landings, including its first long dash crossing, without a setback. Earlier clipping and hint-label issues were corrected and rechecked.
- Save regressions cover the latest reached flag, backtracking without checkpoint rollback, machinery state persistence, old one-flag saves and removal of the obsolete hidden escape-lamp requirement without discarding chapter progress.

No live database migration is part of this journey revision. Shared server-side score storage still requires the separately documented backend release; guest play saves locally.

## Historical first-overhaul verification

Current source is on `improve/last-light-world`, based on the existing Last Light release. No live deployment or production database write was performed.

- `npm run build`: PASS. TypeScript, production Vite output, Whetū preparation and the retired-service-worker verification all pass. Existing unrelated large-bundle advisory remains.
- `npx vitest run tests/games/last-light tests/core/posters.test.ts tests/core/storage.test.ts tests/accounts tests/leaderboard`: **411/411 tests pass across 17 files**, including real local Postgres migrations, account/cloud-save merges and public/personal ranking behavior.
- `npx playwright test tests/games/last-light --project=chromium --workers=1 --reporter=list`: **18/18 pass**. Includes actual keyboard completion of the opening stage, jump/dash/retry/pause, simultaneous native touch/cancel, resize, save restore, new-run confirmation, final choice, conversation/journal/map, material collapse/rebuild, character poses, reduced motion and native music lifecycle.
- All 40 campaign routes: actual 120 Hz trajectories reach every platform, mission connection and optional memory, with a return path to the exit. Physics checks were strengthened rather than relaxed for the layout revision.
- **44 composition tests** independently compare foreground artwork and markers with terrain art/sweeps, hazards, pickups and other mission objects. Includes the original cramped Chapter 4 fixture, compact/tree selection and completion-travel bounds.
- Art review: all 40 maps checked at spawn/checkpoint/exit; detailed actual-pixel terrain audit covers 416 platforms. No remaining foreground-through-terrain, physical platform overlap or sub-32-pixel shared-column squeeze. Sparse dressing reserves all critical approaches. Nine goal-art variants pass solid-pixel clipping checks.
- Responsive UI: 320×568, 390×844, 844×390 and 1280×800 reviewed. Dialogue pauses reading time; automatic memory pickups do not interrupt movement. All 40 narrow-phone hints fit the reserved footer, at least 8 pixels outside gameplay and 12 pixels above controls.
- Difficulty review: 129 authored hazards, escalating 11/23/28/31/36 by district; special surfaces increase from 40 to 106. Four intended launches require dash in sampled trajectories. Every platform width and the tutorial layout are preserved. All checkpoints are stationary stone.
- Five escape chapters have continuous, full-objective, zero-death solutions under their escalating 88–140 px/s pursuit. Those solutions were also replayed through the actual Chromium keyboard handlers/render loop: five clears, no browser errors. Timed waits and air braking remain necessary.
- Legacy progress: original interleaved spark/key/dash IDs map correctly; stage/checkpoint/time/setbacks remain. Last Light million-scale local/cloud/server bests convert without changing other games. Per-chapter banking prevents a slow later chapter from removing earlier earned bonuses.
- Original voxel cover uses the shared poster generator and passes all artwork markup/frame checks.
- Independent Astra art/composition and challenge reviews have no outstanding blocking findings. Scratch screenshots, audits and replay data are retained under ignored `work/last-light/`.

The all-game database migration test allows 15 seconds for its 27 authenticated submissions, avoiding a 5-second test timeout during concurrent build/browser load. The final complete regression run passed. Browser validation used Chromium and emulated phone input; physical-device and WebKit testing were not performed.

---

## Historical verification of the original implementation

# Last Light verification — 8 November 2026

- `npm run build`: passed, including TypeScript, Vite production output, Whetū host preparation and the service-worker retirement check. Vite retains the project's existing large-chunk advisory.
- `npm test -- tests/games/last-light tests/navigation.test.ts tests/leaderboard tests/accounts/shared.test.ts`: 110 tests passed. Covers all 40 stage routes, jumps and dash, moving/spring/crumble/ice/belt physics, hazards, keys, sequential unlocks, ending, score ordering, save validation, account-backed rankings, public/personal views and retry behavior.
- `npm test -- tests/core/storage.test.ts`: 10 tests passed, including the updated 26-game catalog and storage regressions.
- `npx playwright test tests/games/last-light/play.spec.ts --project=chromium --workers=1`: 4 tests passed. Exercises keyboard movement and short jump/dash taps, pause/resume, shared Restart from play and the native pause menu, restore, help, new-run confirmation, sequential unlocks, campaign completion, simultaneous native touch input, cancellation and portrait/landscape resize.
- SVG validation: both original cover and title assets passed.
- Independent review: no outstanding findings after correcting shared Restart behavior. Reviewer also reached every required key in all 32 gated stages and checked 390×844, 320×568 and 844×390 layouts, including native touch scrolling of the landscape help screen.

## Complete browser → server → database flow

Started `npm run dev:online` with its local Postgres-compatible database and all repository migrations. Created a disposable local account, played stage 1 through actual keyboard input, and lit the beacon with zero deaths. The browser posted `last-light` score `1603940`; the real leaderboard endpoint returned HTTP 200 and personal rank 1. The cloud-save endpoint returned the cleared stage and the same personal best. The visible leaderboard displayed the account's record. No browser errors occurred. See [captured response metadata](../../../docs/evidence/last-light/online-check.json) and [leaderboard screenshot](../../../docs/evidence/last-light/online-leaderboard.png).

## Visual evidence

[Desktop entry](../../../docs/evidence/last-light/desktop-entry.png) · [Desktop play](../../../docs/evidence/last-light/desktop-play.png) · [Phone play](../../../docs/evidence/last-light/phone-play.png) · [Landscape Frostline](../../../docs/evidence/last-light/landscape-play.png)

All database checks used disposable/local data. At the time of the original implementation checks, hosted deployment and the included migration had not been applied remotely. See the release follow-up below. Route verification covers adjacent real physics trajectories; it does not claim a human playthrough of all 40 stages.

## Courier animation follow-up

The courier now has a detailed shaded sprite, eight-frame distance-based running, idle breathing/blinking, rising/falling/wall/dash/landing/respawn/beacon poses, scarf and lantern follow-through, dust and bounded dash echoes. The cover uses the same detailed courier artwork.

- `npm test -- tests/games/last-light/model.test.ts`: 53 tests passed.
- `npx playwright test tests/games/last-light --project=chromium --workers=1`: 5 tests passed, including a renderer test for distinct run frames, unchanged physics state, identical paused frames, reduced-motion behavior, and clearing animation history on retries, stage changes and new runs.
- Independent review found no outstanding issues after adding death-count resets for keyboard/menu retries. The reviewer also checked fixed particle/echo pool sizes after 10,000 ticks.
- Native Chromium screenshots inspected at desktop and phone sizes. [Pose sheet](../../../docs/evidence/last-light/character/poses.png), [desktop](../../../docs/evidence/last-light/character/desktop.png), [phone](../../../docs/evidence/last-light/character/phone.png), and [gameplay recording](../../../docs/evidence/last-light/character/gameplay.webm).
- Production build and SVG validation passed. The recorded keyboard playthrough cleared stage 1 with zero deaths using the new renderer.

## Soundtrack follow-up

Composed the original “A Light Left On”: 32 bars at 108 BPM, 71.111111 seconds, A minor, synthesized melody/answer/arpeggios/pad/bass/percussion, a quieter bridge and lifted return. `scripts/compose-last-light.mjs` renders and masters it from the source score. Audio follows QCC’s existing Sound preference and game lifecycle.

The renderer measured peak 0.86, RMS 0.12565 and loop boundary difference 0.000457. Independent Chromium verification decoded the MP3 to exactly 71.111111 seconds with boundary difference 0.000761; pause/blur preserved position, and leaving stopped sources and closed the context without browser errors. The source score/asset test checks all 32 bars, timing, pitch bounds and measured audio. Native browser tests cover opt-in behavior, real decoding/looping, pause/resume, mute, new-run rewind, exit cleanup, and an audio download finishing while paused.

Soundtrack verification passed: production build; 54 score/physics tests; all 8 Last Light browser tests. The built MP3 matches the source asset byte for byte.

## Production integration follow-up

The release preserves the latest production login/Study safeguards and Drift Club's public reference 26. Last Light is reference 27, bringing the library to 27 games.

- Full integrated unit run: **5,033 passed, 7 skipped** across 253 passing files and one skipped concurrency file.
- Integrated production build: passed.
- Chromium: **14 passed**, covering Last Light gameplay, courier animation, original music, Christmas music policy and existing Drift Club behavior.
- Backend release checks: **35 passed**, including signed-in rankings, best-score preservation, cloud saves, marker mismatch, repeat migration and preservation of restricted predecessor constraints.
- Independent release integration review: no outstanding findings.
- [API release #158](https://github.com/grantcharlie1000-tech/Qcc-games-/pull/158) deployed revision `5f154ec30699e3c48aef7e372d07efb650328205`. Its production build applied only `20261108223000_last_light_score`; the live Pages proxy returned HTTP 200 for Last Light and existing Snake boards, and HTTP 401 for an unauthenticated score submission. Vercel reported no runtime errors after deployment.

Frontend release and publication are tracked in [production release #159](https://github.com/grantcharlie1000-tech/Qcc-games-/pull/159).
