# Aftertrace verification — 5 November 2026

**Completed locally (isolated game module, not a full QCC checkout):**
- TypeScript strict `tsc --noEmit` for the game files against a same-shape game-shell type interface: passed.
- Node-executed deterministic gameplay assertions: seeded movement simulation matches; drawing a trail enables one charged pulse; active line catches two enemies and awards a combo; three collisions end a run; valid snapshots restore into a resized arena and oversized/malformed saves are rejected: passed.
- Headless Chromium 144 interactive smoke via the DevTools protocol: game mounted, start action changed phase, simulated touch movement drew 31 trail points, pulse button ignited trace (0.82s), canvas resized from 390×844 to 1366×768, pause prevented simulation time advancing: passed. Captures were inspected for initial mobile, active mobile and active desktop layouts.

**Not yet completed:** full-repository `npm run check` / `npm test` / Vite build, deployed QCC route Playwright tests, real iPhone Safari, physical touch performance, and database migration execution. The browser test evaluated the same compiled module in an isolated page because this test environment blocks local HTTP navigation. It is not equivalent to a full integration test.

**Deployment gate:** `netlify/database/migrations/20261105120000_aftertrace_score.sql` is staged in the branch but must not be applied to a remote database without Charlie's separate approval; until then, score uploads will be queued or rejected as leaderboard-not-open.
