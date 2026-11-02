# Backend fixes verification

Work completed on `infra/backend-move`, with local commits authored by Charlie Grant
<grantcharlie1000@gmail.com>. Nothing was pushed. No external database was accessed; no migrations,
schema changes, or data deletion were performed against an external database. Migration files are
unchanged from the starting commit `56628e6`.

## Merge and conflict resolutions

Merged `origin/main` (`f494064`) using merge commit `06bda285297866191b29556d87701dab9cccebc3`.
No rebase or force-push was used.

| Conflict | Resolution |
| --- | --- |
| `ARCHITECTURE.md` | Kept the Neon database boundary and documented Claimline saves with a closed leaderboard. |
| `package.json` | Combined main's service-worker kill-switch verification with the backend client/database boundary and Pages headers checks. |
| `tests/leaderboard/server.test.ts` | Retained the standalone `LocalDB`/`pg` test helpers and verified Claimline's 409 response against the unchanged schema. |
| Claimline leaderboard migration added under the renamed directory | Excluded the upstream migration entirely. No Claimline leaderboard schema was enabled. |

Follow-up integration fixes imported the movie catalog directly from `server/movies-catalog.ts` and
converted the upstream Claimline browser test from removed Netlify dependencies to the existing local
database helper. That test now verifies retained queued scores while the leaderboard stays closed.

## Behavior

- Claimline save snapshots and best scores sync successfully through v1 and v2.
- Vercel authenticates the Pages proxy secret using constant-time digest comparison. Verified IPv4/IPv6
  replaces spoofed headers and supplies the router's rate-limit IP. Unverified headers and the proxy
  secret are stripped before routing; unset configuration disables trust.
- Account save totals are capped at 2 MiB, counting UTF-8 JSON records after merging, including untouched
  keys. The existing account row lock serializes uploads. Rejections return the specified 413
  `storage_quota` payload without changing saves or revisions. Per-item and sync caps remain 1/2 MiB.
- Database capacity failures return the specified 507 `storage_full` payload across account, leaderboard,
  guard and pool-creation paths. Failed writes/commits roll back; cleanup cannot hide the original error.
- The client displays both storage messages and retains local and staged progress. Database-full retries
  use durable backoff; quota errors wait for manual retry. Sign-in preserves the specific sync error.

## Files directly changed for these fixes

In addition to the upstream changes brought by the merge:

- `ARCHITECTURE.md`, `package.json`
- `server/app.ts`, `server/vercel.ts`
- `src/accounts/shared.ts`, `src/accounts/storage-errors.ts`, `src/accounts/server.ts`, `src/accounts/client.ts`
- `src/leaderboard/server.ts`, `netlify/lib/runtime.mts`
- `tests/accounts/server-v2.test.ts`, `tests/accounts/storage.test.ts`, `tests/accounts/sync-v2-client.test.ts`, `tests/accounts/accounts.spec.ts`
- `tests/server/vercel.test.ts`, `tests/server/storage-errors.test.ts`
- `tests/leaderboard/server.test.ts`, `tests/games/claimline/leaderboard.spec.ts`
- `docs/BACKEND_HOSTING.md`, this report, `docs/superpowers/plans/2026-11-03-backend-storage-proxy.md`

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | Passed, including service-worker and client/database boundary checks. Existing large-chunk warnings remain. |
| `npm run check:server` | Passed. |
| `npm run build:server` | Passed. |
| `npm test -- --maxWorkers=2` | 172 files, 3,398 tests passed. |
| Focused Chromium tests, `ARCADE_URL=http://127.0.0.1:4601` | 3 passed: both storage messages/local-save reload retention and Claimline's closed leaderboard. |
| `git diff --check` | Passed. |

The Claimline regression reproduced HTTP 400 with the pre-merge game list and passed after restoration
of the merged game list. Proxy, quota, capacity, cleanup and client regressions were observed failing
before their corresponding fixes. Database tests use isolated local PGlite instances.

Independent read-only review found no Critical or Important issues. One deferred test limitation:
the local concurrency test uses a single-connection pool and checks locking SQL/order, so true
contention across separate PostgreSQL connections was not exercised. Unrelated upstream game/UI
changes were merged unchanged and excluded from the backend review.

## Environment variables

New: set matching server-only `QCC_PROXY_SECRET` values on Vercel and the trusted Pages proxy. The proxy
must overwrite `X-QCC-Proxy-Secret` and `X-QCC-Client-IP` using its configured secret and Cloudflare's
client IP. Never expose the secret through a `VITE_*` variable. With the backend variable unset, trust
is disabled and spoofed proxy/IP headers are still stripped.

Keep the existing `DATABASE_URL` and `QCC_ALLOWED_ORIGINS` configuration. `VERCEL_ENV` supplies the deploy
context; existing optional database guards/freeze overrides remain supported. `TMDB_READ_TOKEN` and
`CLOUDFLARE_TURN_KEY_ID`/`CLOUDFLARE_TURN_API_TOKEN` are unchanged service-specific settings.
`VITE_QCC_API_BASE` is needed only when the frontend calls a separate backend origin directly.
No environment variables are needed for the storage limits. See [hosting configuration](BACKEND_HOSTING.md).
