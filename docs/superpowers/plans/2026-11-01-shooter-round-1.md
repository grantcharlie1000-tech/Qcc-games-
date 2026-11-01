# Shooter Round 1 Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement this plan task by task. The user has authorized implementation and small commits in the existing `game/shooter` worktree; proceed inline, with an independent whole-branch review.

**Goal:** Import playable offline Tiny Strike into QCC and add an optional unreliable Link channel without changing existing callers.

**Architecture:** Keep Tiny Strike's Three client modules behind QCC's lazy game entry. A mount adapter owns its DOM, input subscriptions, renderer, audio, pause/resume, and disposal. Use the existing play surface and asset/offline pipeline. Extend PeerJS Links with a second negotiated data channel and a binary-framed reliable fallback.

**Tech stack:** Existing TypeScript, Vite, Three 0.180, PeerJS 1.5.5, Vitest, Playwright; imported client JavaScript has a local declaration boundary.

**Spec:** The user's “Shooter Round 1 — import Tiny Strike into QCC Games + unreliable data channel” request in this session. The separate R6 design is outside this round.

## Global constraints

- Work only in `/workspace/qcc-shooter`, branch `game/shooter`; read-only import source `/workspace/qcc-shooter-work/tinystrike` at `04db555c4fc9f43fef3325c37930ad97a0c27aa3`.
- Slug `shooter`, title `Shooter (WIP)`, one metadata constant where practical.
- Preserve ISC and gfx MIT notices unchanged; inventory all imported assets with CC0/MIT/ISC provenance.
- No upstream server, worker, wrangler, directory, leaderboard client, WebSocket transport, or videos. No QCC score submission.
- No production, deployment, push, ads, environment, Netlify, functions, or database changes. No new dependencies unless necessary.
- Full viewport, full devicePixelRatio, no full-width banner, native desktop pointer lock, mobile touch, Escape opens Study.
- Check, complete unit suite, build, and Blockcraft/Pool online Playwright suites must be run. Screenshots/report outside git at the requested paths.

## Review focus

- Study during active pointer lock or touch input releases held actions, pauses simulation, and resumes safely.
- Leaving/reopening a game releases global listeners, audio, render targets, GLTF resources, and stale async callbacks.
- Relative/base-prefixed model URLs and all imported files appear in the offline manifest.
- Late or unsupported second-channel creation, closing channels, and failed sends preserve reliable delivery and isolate listeners.
- Home routing stays lazy and existing game/transport behavior stays unchanged.

### Task 1: Baseline and additive unreliable transport

**Files:** `src/multiplayer/transport.ts`, `tests/multiplayer/transport.test.ts`.

**Interfaces:** Existing `send(text:string)` / `onData(cb)` unchanged. Optional `sendUnreliable?(message:string|ArrayBuffer):void` and `onUnreliable?(cb:(message:string|ArrayBuffer)=>void):void` on Link. PeerJS creates negotiated channel id 7, unordered, zero retransmits on both sides.

- [x] Install existing lockfile dependencies if missing; run baseline check/tests/build and record initial entry bytes outside git.
- [x] Write and run failing tests using a fake paired RTCPeerConnection and mocked PeerJS signaling. Assert second-channel options, bidirectional text/binary, fallback before open/unsupported/send error, callback separation, late PC availability, and closure.
- [x] Implement the optional channel and tagged binary fallback; leave Room and existing Links untouched.
- [x] Run transport tests, full unit tests, and check; commit the transport change.

### Task 2: Client import, assets, and arcade integration

**Files:** `src/games/shooter/**`, `public/game-assets/shooter/**`, `public/game-art/shooter/cover.svg`, `src/core/catalog.ts`, `src/core/types.ts`, `src/main.ts`, `tests/games/shooter/play.spec.ts`.

**Interfaces:** A `GameModule` matching Blockcraft/Pool, with mount returning `GameInstance`. Shared metadata provides id/title/cover; the existing glob remains the lazy-loading boundary. Import declarations are scoped to this game rather than weakening TypeScript globally.

- [x] Write browser tests for library entry, rendered bot game, full drawing-buffer DPR, pointer lock, movement/shooting, P/menu, Escape/Study, resume, disposal/reentry, touch drag/stick/fire, offline assets and no online UI/requests. Run the initial missing-game test to demonstrate failure.
- [x] Copy only client dependencies and runtime assets; preserve both license files; write an explicit ASSETS inventory and credit in rules/menu.
- [x] Replace the page bootstrap with a mount function and lifecycle ownership; use playBox from the shared play surface, abortable listeners, scoped CSS, full DPR, safe pause/resume/disposal and asset URLs.
- [x] Disable upstream online/leaderboard/career UI and remove its network implementations. Retain bots, maps, weapons, profile appearance, and gameplay settings.
- [x] Add metadata, catalog/type registration, full surface styling and a simple SVG placeholder using the SVG skill. Add no score callbacks.
- [x] Run check, build, new game browser tests; inspect desktop and phone screenshots; commit the import/integration.

### Task 3: Regression, review, report

**Files:** Necessary fixes and tests in this worktree; `/workspace/qcc-shooter-work/REPORT.md`, screenshots under `shots/r1/`.

**Interfaces:** Existing Playwright suites remain authoritative for Pool and Blockcraft online behavior. All evidence files remain outside git.

- [x] Run `npm run check`, `npm test`, `npm run build`; record test counts and chunk/asset bytes against baseline.
- [x] Run both online suites, all Pool suites, and feasible Blockcraft/play-surface suites against this worktree on a private local port; record passed/failed/skipped counts and any external blockers honestly.
- [x] Verify models and licenses in offline pack, no prohibited files/requests, and lazy initial loading; capture 1440x900 desktop and 844x390 DSF3 touch screenshots.
- [x] Request independent review of the branch; reproduce and fix important findings with focused tests; rerun affected checks.
- [x] Write Round 1 report covering imports/drops, licenses, integration, transport API, counts, sizes, known issues; commit remaining code fixes in logical commits. Leave branch clean, unpushed.
