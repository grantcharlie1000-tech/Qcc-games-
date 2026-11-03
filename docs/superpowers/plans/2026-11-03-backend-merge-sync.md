# Backend merge and tolerant sync implementation plan

> **For agentic workers:** Use the local executing-plans workflow for implementation and requesting-code-review for the final independent review.

**Goal:** Finish the existing origin/main merge into infra/backend-move and prevent unsupported saves from blocking supported games.

**Architecture:** Keep the Neon/Postgres backend and Vercel proxy trust boundary. Normalize sync input at the accounts handler before validating supported saves; retain main's client batching and shared named limits.

**Tech Stack:** TypeScript, Postgres, Vite, Vitest.

**Spec:** The user's merge task and resolution rules in this session.

## Global constraints

- Finish and commit the existing merge as Charlie Grant <grantcharlie1000@gmail.com>; do not push, abort, or rebase.
- Preserve constant-time QCC_PROXY_SECRET authentication and spoofed-header stripping in server/vercel.ts.
- Use one set of limits: 1 MiB per request/record, 2 MiB per user, HTTP 413 storage_quota, HTTP 507 storage_full.
- Retain every main game id and the Pages proxy/client updates.
- Keep Claimline's leaderboard closed; do not change schemas or migrations.
- Never print secrets; any Playwright run must use a 46xx port.

## Review focus

- Unknown save keys and future game ids in saves/bases must not block known saves or create rows/revisions.
- Invalid sync shapes, cursors, revisions and supported save values still return 400 atomically.
- Quota and capacity failures retain local/staged data and do not partially write.
- Both legacy and incremental sync accept Crossy Road saves and bests.
- Main's new tests must use this branch's local Postgres harness, without Netlify Database dependencies.

## Tasks

- [x] Resolve the conflicts, retaining backend setup and both sides' relevant regressions; consolidate limits and capacity classification.
- [x] Add and run failing real-handler tests for unknown keys/future ids and Crossy Road in both protocols; implement filtering and verify malformed inputs still fail.
- [x] Run npm run build, npm run check:server, npm run build:server, and full npm test; resolve integration failures.
- [x] Obtain independent review, verify no migration/schema changes and no conflict markers, and prepare the authorized merge commit.

## Execution decisions

- Work in the requested checkout: the merge is already in progress, so creating another checkout would not finish the user's merge.
- Preserve main's legacy over-quota allowance for non-growing writes and count the full merged UTF-8 JSON map.
- Retain the branch's structured quota response and player-facing message alongside main's bounded quota recovery.
- Skip an otherwise valid favourites record containing future game ids as a whole, preserving the prior list and never acknowledging a partially filtered value.
- Keep main's distinct oversized-request response; account quota rejections retain HTTP 413 `storage_quota`.

## Verification

- `npm run build`: passed, including typecheck, service-worker and client/database-boundary checks; Vite reports large-chunk warnings.
- `npm run check:server`: passed.
- `npm run build:server`: passed for Node and Vercel entries.
- `npm test`: 189 files and 4,140 tests passed.
- Targeted Chromium checks: 7 passed on port 4601, covering quota/full-storage messages, retained local/staged saves and Claimline's closed leaderboard.
- Independent review: no Critical or Important findings, including the final favourites behavior.
- Confirmed no database migration/schema changes; Vercel proxy trust boundary and standalone database setup unchanged; main's full game catalog retained.
- Unknown-key and favourites regressions were observed returning 400 before their respective fixes; malformed supported values still return 400 atomically.
