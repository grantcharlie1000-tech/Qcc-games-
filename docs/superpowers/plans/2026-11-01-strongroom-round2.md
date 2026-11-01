# Strongroom Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Rename the shooter, adopt the Liquid Glass shell, finish the M1 baseline, and implement M5 over QCC Room.

**Architecture:** Keep Three.js and the licensed Tiny Strike collision, weapon, bot and rendering modules. Replace its HUD/economy/round adapter with QCC glass UI and a host-owned simulation boundary. Pure TypeScript network modules provide packed inputs/snapshots, buffering, prediction/reconciliation and capsule rewind; Room remains the sole transport.

**Tech Stack:** Vite, TypeScript, Three.js r180, QCC Room/PeerJS, Vitest, Playwright.

**Spec:** `/workspace/qcc-shooter-work/design/DESIGN.md` in full, as overridden by the Round 2 user request (60/30 Hz host, 20/15 Hz snapshots; no character pipeline this round).

## Global Constraints

- Only `/workspace/qcc-shooter`, branch `game/shooter`; never change other worktrees or sessions.
- No env, Netlify config/functions, DB, ads or production changes. No push or deploy.
- Small commits; check, unit tests and build green. Evidence stays in `/workspace/qcc-shooter-work/`.
- Order: rename, real merge of `origin/ui/liquid-glass-ingame`, M1, M5.
- Escape is never bound; shared shell and shared glass controls; no global leaderboard submission.
- Harbor only this round; character refinement, M2/M3/M4/M6/M7 remain later work.

## Review Focus

- Reordered, duplicated or malicious input cannot advance a guest faster or fire more often.
- Snapshots received after round changes cannot restore an old round, health or pending inputs.
- Study and room pause clear held inputs without stopping guest receive/heartbeat work.
- Disconnect, host departure and dispose cancel transport work and free GPU/audio/listener resources.
- Tier changes preserve collision proxies, apply real rendering budgets and never recompile mid-round.

### Task 1: Rename and poster

**Files:** `src/games/strongroom/**`, `tests/games/strongroom/**`, `public/game-{assets,art}/strongroom/**`, catalog/types/navigation/main and offline verifier.
**Interfaces:** metadata exports `STRONGROOM` with id `strongroom`, title `Strongroom`; existing lazy GameModule contract remains.
- [x] `git mv` all owned directories; update references, classes and development hooks, install designer cover.svg.
- [x] Run `npm run check`, metadata/catalog tests and `npm run build`; commit rename.

### Task 2: Liquid Glass merge

**Files:** incoming PR #80 plus only actual conflicts.
**Interfaces:** use its existing immersive shell/GameInstance contract and `src/ui/glass.ts`, `sheet.ts`.
- [x] Fetch requested branch, verify 523487d ancestry and merge with a real merge commit.
- [x] Inspect conflicts, remove Strongroom temporary shim during adoption; check/build.

### Task 3: M1 quality, controls and UI baseline

**Files:** `strongroom/quality.ts`, `ui/hud.ts`, engine config/settings/input/world/render/effects/audio and new quality/control tests.
**Interfaces:** quality profile applies §10.2; `AutoQuality.sample(frameMs,now,hidden)` queues tier changes until round end. HUD provides menu/dismiss/settings/lobby hooks through GameInstance.
- [x] Write failing tests for default tier, render-scale timing/manual override, host guard, forbidden Escape and remap collisions; verify RED.
- [x] Delete economy/profile/old HUD/unused map code; retain Harbor collision and provenance. Implement tiers and shared glass UI, 3v3 baseline and seed hook.
- [x] Verify targeted tests, check/build; commit coherent slices.

### Task 4: Network primitives

**Files:** `strongroom/net/{protocol,input-buffer,prediction,history}.ts`, `tests/games/strongroom/net.test.ts`, minimal Room unreliable facade if absent.
**Interfaces:** numbered 30 Hz inputs with redundant last 3; versioned integer snapshots include round, tick, ack and entity state. `InputBuffer` deduplicates and bounds lead; `reconcile` replays only unacknowledged inputs; `CapsuleHistory` retains 1 s and clamps rewind to 200 ms.
- [x] Write failing packing, malformed input, reorder/loss, reconciliation, interpolation and rewind tests; verify RED.
- [x] Implement pure modules and Room unreliable integration with unchanged reliable defaults; run tests and commit.

### Task 5: Host authority and lobby

**Files:** `strongroom/net/{session,sim,transport}.ts`, game lifecycle and HUD, shared RoomPanel/RoomDialog, `tests/multiplayer/strongroom-online.spec.ts`.
**Interfaces:** host sim owns rounds, movement, hits/ammo/bots; future wall/gadget reliable events route through the same session. Guest predicts local motion, interpolates others at 100 ms, and submits only validated inputs. Development-only transport shim delays 75 ms each direction and drops 5% of unreliable packets.
- [x] Test authority, fire/LOS/bounds checks and round transitions before implementation.
- [x] Integrate create/join/invite, seats, bot fill and host options; 60 Hz host (30 on potato/check failure), 20 Hz snapshot (15 potato).
- [x] Implement Away, disconnect bot takeover, host pause/leave and reliable phase/combat events; commit after checks.
- [x] Run real two-browser direct/relay cases and impaired transport case; measure prediction error p95.

### Task 6: Verification, evidence and independent review

**Files:** Strongroom browser/lifecycle specs; external report, screenshots and profiles only.
- [x] Verify 10 mount/unmount cycles, first-load gzip bytes and production build.
- [x] Run Strongroom, Blockcraft and Pool online specs and full unit suite; report exact counts and external failures.
- [x] Capture desktop 1440×900, touch 844×390 DSF3 and 667×375 DSF2 required screens.
- [x] Profile potato Harbor 3v3 at CPU 4×/6×; record frame/fps quantiles, draw/triangle/heap/tick metrics.
- [x] Obtain independent code review, fix important findings with regressions, rerun affected checks.
- [x] Append Round 2 report (wire sizes, performance, test counts, known limits and M2–M7 remainder); commit source/tests/docs only.

## Verification record

- `npm run check`, `npm test` (3322 tests / 167 files), and production build passed.
- 15 unique Chromium cases passed: Strongroom 12, Blockcraft online 1, Pool online 2. The final combined run passed 14; a fractional-pixel expectation in the low-tier smoke test was corrected and that case passed separately.
- Root and repository-subpath offline Strongroom/Study restoration passed.
- First game entry is 1,109,246 B gzip, including shared code/font/icon, final poster and five GLBs.
- Final 60-second 150 ms RTT / 5% loss measurement: 912 corrections over 131 m; p95 position correction 0.0081 m.
- Independent review findings were fixed with regressions. Screenshots and the Round 2 report are in the user-authorized external work folder.
- SwiftShader CPU 4×/6× live-fire profiles measured 20 fps median; physical 30 fps slow-tail acceptance and successful external TURN gameplay remain unverified. Character processing and M2/M3/M4/M6/M7 remain the requested later scope.
- Keep `game/shooter` and this worktree for user review. Do not push or deploy.
