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

All database checks used disposable/local data. Hosted deployment and the included `20261108223000_last_light_score.sql` migration have not been applied remotely. Route verification covers adjacent real physics trajectories; it does not claim a human playthrough of all 40 stages.

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
