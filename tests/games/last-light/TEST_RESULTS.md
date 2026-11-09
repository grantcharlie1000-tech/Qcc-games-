# Last Light overhaul verification — 9 November 2026

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
