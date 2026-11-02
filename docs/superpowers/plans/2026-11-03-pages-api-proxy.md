# Pages API proxy and account storage implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Restore same-origin account, leaderboard and TURN calls on Pages and bound account sync storage within the requested free-tier budget.

**Architecture:** Root Pages middleware handles only `/.netlify/functions/` and allowlists three routes. An explicit Vite public routing manifest excludes every other path from Function invocation. Account limits live in the existing shared account module; the server checks merged storage under the existing account transaction lock before any writes.

**Tech stack:** TypeScript, Web Request/Response, Vite, Vitest and the existing isolated local database test fixtures.

**Spec:** User task in this session (both parts); deployment findings are recorded in `docs/BACKEND_HOSTING.md`.

## Global constraints

- Work in this checkout on `feat/pages-api-proxy`; commit as Charlie Grant <grantcharlie1000@gmail.com>; do not push.
- Keep frontend endpoints same-origin and preserve request credentials and response streams.
- No UI/style, service worker, live database, schema or migration edits. Keep Claimline leaderboard deployment disabled.
- Inspect `origin/infra/backend-move` read-only and provide exact mirror instructions.
- Use 1 MiB request bodies and 2 MiB per-account logical UTF-8 JSON storage. Retain the 1 MiB record validator and account authentication abuse limits.
- Preserve existing over-quota saves for reading and allow non-growing updates; never delete data to meet a quota.
- Playwright, if needed, must use ports 46xx.

## Review focus

- Connection-nominated hop headers, credentials, multiple Set-Cookie headers and client IP spoofing: proxy tests.
- Static bypass and unknown/deeper route rejection: middleware and manifest tests.
- Redirects and timeouts must not leak credentials to another upstream: proxy tests.
- Storage quota must include untouched keys, actual merge winners and concurrent uploads: account server tests.
- Request size must count UTF-8 bytes and retain/stage unsendable browser data: client and server tests.

## Task 1: Pages proxy

- [x] Add `tests/pages/proxy.test.ts`: allowlist, static `next`, missing environment 503, upstream errors/timeouts 502, method/query/body/headers/IP, response streaming, cookie headers and redirects.
- [x] Run targeted Vitest and observe missing-handler failure.
- [x] Add `functions/_middleware.ts` with a typed minimal Pages context, hop-header stripping, trusted Cloudflare IP replacement, manual redirects and a 10 second abort signal.
- [x] Add `public/_routes.json` version 1, include only `/.netlify/functions/*`, exclude `[]`; no `functions/api` exists on main. Include `functions` in TypeScript checking.
- [x] Run targeted tests and verify the built manifest after Task 3.

## Task 2: Account limits

- [x] Add server boundary/quota/atomicity/concurrency/legacy preservation tests and client batching/staging tests; run and observe failures against the old 2 MiB request cap and absent aggregate quota.
- [x] Update `src/accounts/shared.ts`: `MAX_BODY_BYTES=1024*1024`, `MAX_USER_BYTES=2*1024*1024`, named auth/keepalive limits and UTF-8 save-size helper with free-tier rationale. Keep `MAX_KEY_BYTES=1024*1024`.
- [x] Update `src/accounts/server.ts` to merge all stored keys, preserve semantic no-ops, check the aggregate quota under the account lock and reject growing over-quota writes atomically with 413.
- [x] Update `src/accounts/client.ts` to use named keepalive/body limits and report records that cannot fit a request without dropping local data. Use the full serialized envelope to measure batches with cursor/revision headroom.
- [x] Update `scripts/leaderboard-dev.mjs` to consume the shared request cap through Vite SSR instead of hardcoding 2 MiB.
- [x] Update the oversized-body status expectation in the existing v2 test to 413, retaining all malformed-cursor/revision checks.
- [x] Run all affected Vitest tests.

## Task 3: Deployment notes, verification and commit

- [x] Write `docs/BACKEND_HOSTING.md` with Pages Production/Preview `QCC_API_ORIGIN`, Vercel origin/deploy/database guards, header behavior, old/new limit audit and exact mirror file list.
- [x] Update stale current limits in `docs/ACCOUNTS.md` and `docs/SYNC.md`.
- [x] Run `npm run check`, `npm test -- --maxWorkers=2`, `npm run build`; compare `dist/_routes.json` with the public source and check representative static exclusions.
- [x] Obtain independent read-only review of the full diff, resolve material findings and run affected verification again.
- [x] Check the final diff for scope, commit all task files with the requested identity, verify commit and clean worktree, and report results without pushing.


## Execution record

- Used the requested checkout/feature branch directly; no worktree, remote branch or deployment changes.
- Proxy tests first failed because the handler was absent, then all 22 passed.
- Limit tests first demonstrated the old >1 MiB request acceptance, unbounded cumulative storage and oversized single batches; all 94 targeted account/proxy tests passed after implementation.
- Independent review identified two important client recovery issues: proxy 502 was nonretryable, and a quota-rejected first batch prevented later shrinking saves from freeing space. Both were reproduced with failing tests and fixed. The 502 reload regression also exposed fractional retry deadlines rejected by state loading; rounding upward preserves the existing deadline contract.
- Quota recovery uses at most one additional pass after successful batches; remaining failures stay staged without an automatic retry loop. Both immediate and previously blocked recovery regressions passed against the real local test handler.
- Final typecheck and build passed, with the existing Vite large-chunk warning. The built routing manifest matches the source exactly.
- Review limitation: live Cloudflare runtime behavior, deployed Vercel IP rewriting and backend mirror deployment require Hosting Lead verification; none was changed or claimed verified here.
- Final verification after review fixes: `npm run check` and `npm run build` passed; full Vitest suite passed all 3,374 tests in 166 files. `node --check scripts/leaderboard-dev.mjs`, `git diff --check`, and the final built routing manifest comparison passed. No Playwright was needed.
