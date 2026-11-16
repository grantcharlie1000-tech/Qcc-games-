# Chess AI implementation plan

Base contract: `25c0f8d34568001aa9f4a32a96031c8827393b10`, merged PR #186.
Specification: the owner's chess AI task and `docs/CHESS_AI_INTEGRATION.md`.

The user supplied the design, implementation order, ownership boundaries and
delivery authorization. This plan executes that specification without changing
the frozen integration contract or any game files.

## Architecture and constraints

Vite discovers tiny provider manifests eagerly and implementations lazily.
Each provider instance owns its Worker, requests and cancellation resources.
All engine files load locally under the configured relative base. Search never
runs on the UI thread. Only provider folders, engine tests/benchmarks and
`public/chess-engines/` change. Existing dependencies are installed from the
lockfile, with no shared dependency or configuration changes.

## Tasks

- [x] Confirm merged contract, instructions and exact signatures; branch from it.
- [x] Beginner: implement seeded perception, development, capture awareness and
  weighted decisions for 300/500/700/900. Test legal moves, special moves,
  tactical awareness, invalid FEN, budgets, cancellation and disposal.
- [x] Neural: inspect actual Dala/Maia/LC0 releases, model licenses and browser
  runtimes. Integrate only genuine inference when practical. Leave unsupported
  modes unavailable and document concrete reasons.
- [x] Stockfish: package a pinned, licensed single-threaded WASM build with
  corresponding source; implement UCI handshake, limited and unrestricted
  search, history, analysis, cancellation, stale isolation and cleanup.
- [x] Calibration: seeded, color-balanced games and tactical fixtures; measure
  relative strength, failures, timings and uncertainty. Tune significant gaps.
- [x] Browser: exercise actual Workers and WASM from a production-style subpath
  in desktop Chromium, mobile emulation and WebKit where executable. Capture
  metrics and screenshots. Distinguish emulation from real device testing.
- [x] Review: independent code review, fix material findings, run full
  tests/typecheck/build. See VERIFICATION.md for the six reproduced existing
  Last Light failures; all provider checks and production build passed.
- [ ] Delivery: publish PR and coordinate with the game owner. Merge remains
  blocked by those existing repository failures.

## Review focus

Abort during loading or search must settle and release resources. A canceled
UCI response must never satisfy a newer request. Multiple games need separate
Workers. Corrupt or absent assets must fail explicitly. Scores must be White
oriented. Terminal positions must not invent a move. Models must not load on
the homepage. No target Elo is reported as a measured platform rating.

## Implementation decisions

- Stockfish.js 19.0.1 lite single-threaded is the initial practical build.
  The full single-threaded engine is about 100 MB and exceeds Cloudflare Pages'
  25 MiB per-file limit. Maximum uses unrestricted genuine lite search, with
  this network-size limitation disclosed.
- Beginner and fallback identities stay accurate in provider manifests.
- Dala's large released transformer networks require validated inference;
  merely shipping their names or weights would not constitute an engine.
