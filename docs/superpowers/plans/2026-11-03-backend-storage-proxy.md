# Backend storage and proxy fixes implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` for implementation and `superpowers:requesting-code-review` for the final independent review. Track steps below.

**Goal:** Merge main into `infra/backend-move`, accept Claimline saves, authenticate proxy IPs, enforce account save quotas, and preserve local progress on storage failures.

**Architecture:** Keep the existing Neon pool and fetch router. Authenticate and sanitize headers in the Vercel adapter before routing. Enforce the total on merged save records inside the existing per-account locked transaction; share storage limits and error messages with the client.

**Tech stack:** TypeScript, Node crypto/net, pg, Vitest, isolated PGlite test databases, Vite/esbuild.

**Spec:** User request “Backend fixes on infra/backend-move (QCC Games Vercel backend)” in this session.

## Global constraints

- Work on `infra/backend-move`; merge `origin/main`, never rebase or push.
- Commit as Charlie Grant <grantcharlie1000@gmail.com>.
- No database migrations/schema changes, data deletion, or secrets in code.
- Keep Neon, `server/app.ts`, and `server/vercel.ts`.
- Do not enable Claimline/paper.io leaderboard storage or its upstream migration.
- Playwright may use only ports 46xx.
- Keep 1 MiB per-item and 2 MiB per-sync limits; total stored save records must not exceed 2 MiB per account.
- 413 quota response: `{"error":"storage_quota","message":"Your saves are over the 2 MB limit."}`.
- 507 full response: `{"error":"storage_full","message":"Storage is full right now. Your progress is kept on this device."}`.

## Review focus

- Trusted IPv4/IPv6 replaces spoofed headers; unset/wrong/duplicate secrets or invalid IPs cannot enable trust.
- Totals use UTF-8 bytes of final merged records, include untouched keys, and count replacements once.
- Separate handler instances/concurrent writes cannot race over the cap; rejected transactions preserve data and revisions.
- Database capacity failures during writes, connection acquisition, guard checks, and commits return safe 507 JSON without leaking driver details.
- Client errors remain visible after authentication and queued saves survive retries, reload, and sign-out staging.

### Task 1: Merge main and retain backend decisions

**Files:** `ARCHITECTURE.md`, `package.json`, `server/app.ts`, `tests/leaderboard/server.test.ts`; omit upstream Claimline migration.

- [x] Fetch main; start non-rebase merge; record conflicts.
- [x] Retain Neon test helpers, combine main's service-worker verification with backend build checks, and import shared movie catalog directly.
- [x] Verify Claimline v1/v2 save sync and leaderboard 409 against the unchanged schema.
- [x] Run targeted accounts/leaderboard/router tests and commit the verified merge.

### Task 2: Authenticate proxy IPs

**Files:** `server/vercel.ts`, `tests/server/vercel.test.ts`, `docs/BACKEND_HOSTING.md`.

**Interface:** Vercel HTTP method exports sanitize a cloned Request and pass a verified client IP to the existing router.

- [x] Write adapter tests for trusted IPv4/IPv6, overwrites, spoof stripping, disabled/mismatched secrets, invalid IPs, body preservation and fallback.
- [x] Run the adapter tests and observe failures before implementing.
- [x] Use `timingSafeEqual` on fixed-size secret digests, `isIP` validation, and sanitized headers before calling the app.
- [x] Run adapter tests and document server-only `QCC_PROXY_SECRET` plus the proxy's required headers.

### Task 3: Enforce total storage and classify capacity failures

**Files:** `src/accounts/shared.ts`, `src/accounts/server.ts`, new `src/accounts/storage-errors.ts`, `src/leaderboard/server.ts`, `netlify/lib/runtime.mts`, `server/app.ts`, accounts/leaderboard/database/server tests.

**Interfaces:** Shared `MAX_TOTAL_BYTES`, existing item/body constants and fixed error payloads; server-only `storageFullResponse(error: unknown): Response | undefined` recognizes capacity errors.

- [x] Add failing tests for exact total boundaries, accumulated batches, UTF-8, replacements/conflict winners, unchanged/legacy saves, account isolation, concurrent handler instances, rollback and SQLSTATE/Neon capacity errors.
- [x] Count all stored save records after merging while holding the account row lock; reject a final total over 2 MiB before upserts. Permit reads of pre-existing oversized accounts and replacements that bring them below the cap without deleting data.
- [x] Reuse safe 507 responses at database error boundaries, preserving ordinary errors and write-freeze behavior.
- [x] Run quota/capacity tests to green.

### Task 4: Preserve local saves and finish

**Files:** `src/accounts/client.ts`, `tests/accounts/sync-v2-client.test.ts`, hosting/sync docs.

- [x] Add failing tests for both player-facing messages, local/pending retention, quota blocking, capacity retry/reload and authentication-time errors.
- [x] Use storage error messages, retry 507 with existing backoff, and preserve the specific sync error after authentication.
- [x] Run `npm run build`, `npm run check:server`, `npm run build:server`, and `npm test`.
- [x] Obtain independent read-only review, resolve material findings with regression tests, commit fixes as requested, confirm clean branch and report SHAs/env variables.
