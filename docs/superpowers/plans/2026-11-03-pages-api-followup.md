# Pages API reliability follow-up implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Implement the user's storage-full contract, Hosting Lead's proxy contract and Cloudflare movies redirect fix on `feat/pages-api-proxy`.

**Architecture:** Keep the existing account and leaderboard handlers and durable client queues. Share a browser-safe storage-full message and server-side capacity-error classification across handler, runtime and adapter catches. Root Pages middleware uses explicit header allowlists and leaves `/api/movies` to its own Function.

**Tech stack:** TypeScript, Web Request/Response, Vitest, Playwright, existing local Postgres fixtures.

**Spec:** The follow-up request in this session; exact backend mirror instructions live in `docs/BACKEND_HOSTING.md`.

## Global constraints

- First merge `origin/main`; preserve its service-worker retirement and movies Function.
- Work on the requested branch; commit as Charlie Grant <grantcharlie1000@gmail.com>; do not push or modify `origin/infra/backend-move`.
- Capacity errors return HTTP 507 and exactly `{"error":"storage_full","message":"Storage is full right now. Your progress is kept on this device."}`; preserve local saves and pending scores.
- Proxy only accounts/leaderboard/turn. Forward Authorization, Content-Type, X-QCC-Sync, Accept plus trusted X-QCC-Client-IP and env X-QCC-Proxy-Secret; no Origin.
- Return status/body plus Content-Type, Retry-After, Cache-Control, ETag, Vary. No hardcoded backend origin. Pages project is `nceastudy`, Production and Preview.
- Include only `/.netlify/functions/*` and `/api/*` in the routing manifest. Movies fetch uses manual redirects and rejects every non-2xx.
- No live database, deployment, migration, or backend-branch changes. Browser tests use a 46xx port.

## Review focus

- Wrapped driver errors and failures during guard/adapter initialization must retain the 507 contract without exposing database details.
- A failed write/commit must roll back existing saves, scores and revisions; cleanup errors must not mask a capacity error.
- Signup's first sync and background leaderboard submissions must expose the message, including when a subsequent read succeeds.
- Reload, manual retry and identity changes must preserve unsent local progress without marking it acknowledged.
- Proxy spoofed headers and backend redirects must not leak the proxy secret or visitor credentials.

### Task 1: Merge and proxy/movies regressions

- [x] Fetch and merge `origin/main`; resolve `tsconfig.json` by including both `server` and `functions`; commit the merge with the requested identity.
- [x] Run baseline affected tests: 183 tests in 12 files passed.
- [x] Update `tests/pages/proxy.test.ts` for both invocation prefixes, exact header allowlists, trusted IP/secret, missing config, streams, 507 and movies bypass. Add Workers redirect-mode and non-2xx regressions to `tests/movies/catalog-api.test.ts`; observe failures.
- [x] Implement in `functions/_middleware.ts`, `public/_routes.json`, `server/movies-catalog.ts`; run the two test files to green. Update main's `tests/movies/pages-api.test.ts` expectation to manual redirects too.

### Task 2: Capacity responses and local recovery

- [x] Add regression tests in `tests/database/`, `tests/accounts/` and `tests/leaderboard/`: SQLSTATEs 53100/53400, Neon messages, wrapped errors, guard and adapter failures, account v1/v2, rollback/commit, client notices and durable queues; observe failures.
- [x] Add `src/core/storage-full.ts` and `server/storage-full.ts`; translate errors in accounts/leaderboard handlers, runtime guard and Netlify wrappers. Keep unrelated failures and account 413 limits unchanged.
- [x] Update account client error parsing and signup/sign-out notices. Update leaderboard client and both leaderboard views to expose storage-full notices, including background sends and successful reads after rejected writes.
- [x] Run affected Vitest tests to green. Add and run browser regressions proving the actual notices and retained saves/queues.

### Task 3: Mirror documentation, review and commit

- [x] Inspect backend ref read-only. Update `docs/BACKEND_HOSTING.md` with current routing, variables, header contract and exact equivalent files/adapter changes, preserving backend API-base and migration-path differences.
- [x] Run typecheck, complete Vitest suite and production build; verify the built routing manifest and preserved main changes.
- [x] Obtain an independent review, address material findings with regression tests and rerun affected checks.
- [x] Commit all follow-up work with the requested identity, verify SHA/clean branch/no push, and report files, tests and backend mirror instructions.

## Files changed by the follow-up

| Area | Files |
| --- | --- |
| Pages proxy and routing | `functions/_middleware.ts`, `public/_routes.json` |
| Movies | `server/movies-catalog.ts` |
| Capacity contract and server handling | `server/storage-full.ts`, `src/core/storage-full.ts`, `src/accounts/server.ts`, `src/leaderboard/server.ts`, `netlify/lib/runtime.mts`, `netlify/functions/accounts.mts`, `netlify/functions/leaderboard.mts` |
| Browser clients and status displays | `src/accounts/client.ts`, `src/leaderboard/client.ts`, `src/leaderboard/view.ts`, `src/leaderboard/sidebar.ts` |
| Account and database tests | `tests/accounts/server.test.ts`, `tests/accounts/sync-v2-client.test.ts`, `tests/accounts/storage-full.spec.ts`, `tests/database/storage-full.test.ts` |
| Leaderboard and proxy tests | `tests/leaderboard/server.test.ts`, `tests/leaderboard/client.test.ts`, `tests/pages/proxy.test.ts` |
| Movies tests | `tests/movies/catalog-api.test.ts`, `tests/movies/pages-api.test.ts` |
| Documentation | `docs/BACKEND_HOSTING.md`, this plan |

The preceding merge commit `af55cdd56fa3e95a8810af77ddc917a5f4828965` resolves
`tsconfig.json` and includes main's service-worker retirement and native movies Function.

## Execution record

- Used the requested checkout and branch directly; backend ref remained `56628e66b5569ab0575b98b0b570336c0c43ceff`.
- Proxy/movies regressions first failed on old headers/routing and unsupported redirects; all 64 tests passed after the changes.
- Capacity regressions first failed on generic 503s and code-only/generic client notices. Additional failing tests caught decimal size-limit messages, signup/sign-out notice replacement, and authentication COMMIT cleanup.
- Real local Postgres tests inject capacity errors after a prior save write, at leaderboard writes and at COMMIT, checking unchanged saves/scores/revisions and connection release. Cleanup failures preserve the original capacity error.
- Browser regressions were checked against the old leaderboard rendering and failed, then passed after restoring the changes.
- Independent review identified a stale recovery notice when consumers ignored an empty status notification. The browser test reproduced this in both an open dialog and a sidebar showing a different game; both clear after automatic retry without extra requests. No unresolved findings or deferred minors.
- Focused checks: 145 Vitest tests in 6 files passed; all four Chromium browser tests passed on port 4600, including local staging, login notices, successful reads after rejected writes, read failures and recovery. The additional sign-out regression first failed on its generic notice and passed in the final full suite.
- Final `npm test -- --maxWorkers=2 --reporter=dot`: **168 files, 3,411 tests passed**.
- Final `npm run check` and `npm run build`: passed; build retains the existing Vite large-chunk warning and verifies the retired service worker.
- `git diff --check`, built/source routing-manifest comparison, absence of `functions/.netlify`, absence of a default API origin, and preservation of main's service-worker code: passed.
- Independent review's scope exclusions match the request: backend application/deployment remain separate; existing manual-refresh retry deadlines remain unchanged. No additional approval, deployment, push or backend-branch edit was made.
