# Movies source safety implementation plan

**Goal:** Implement the supplied source tagging, archive-only playback and per-play warning requirements in the existing Movies UI.
**Constraints:** Working tree only; no game/save APIs, game functions, database or migration changes. Archive fixture stays in tests. Use port 4651 for browser checks.

- [x] Add source parsing, strict static validation/import defaults and archive provider URL refusal, with unit tests.
- [x] Add a native warning dialog before third-party navigation and at the player rendering boundary for deep links; default cancel focus, trap, Escape cancellation and focus restoration. Confirmation belongs only to the current playback route/session; fresh play/resume/auto-next asks again.
- [x] Render archive titles through the archive iframe only, without provider UI or supervision; show licence credit. Add archive.org to both frame policies.
- [x] Add browser fixtures and warning/archive regression tests, adapt existing specs and audit script, document source and matching rules.
- [x] Run TypeScript, all Vitest, build, Chromium Movies and Movies-related e2e tests; independent review; fix findings and stop Vite.

The user's supplied task is the implementation specification and execution authorization. Tests exercise provider refusal with numeric archive IDs, malformed sources, cancelled warnings with zero requests, fresh and direct play routes, and archive isolation.

Verification: TypeScript and build passed; 159 Vitest files / 3,253 tests passed; 324 Chromium Movies tests passed; 94 Movies-related shell e2e tests passed; eight warning/archive WebKit tests passed; production isolation audit passed at root and subpath. Independent review findings were fixed and rechecked. Vite on port 4651 was stopped. An earlier heavily concurrent unit run exceeded a terrain timing threshold and hit a worker RPC timeout; the isolated full rerun passed (terrain ~1 ms against 4 ms limit).
