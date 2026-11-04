# Cloudflare Pages → Vercel API

The browser calls same-origin `/.netlify/functions/accounts`,
`/.netlify/functions/leaderboard`, `/.netlify/functions/turn`, `/.netlify/functions/social`,
`/.netlify/functions/chat` and `/.netlify/functions/media`. Root
`functions/_middleware.ts` proxies exactly those six paths. It does not depend
on a `functions/.netlify` dot-folder. Unknown or deeper legacy paths return 404.
`/api/movies` runs `functions/api/movies.ts` and `server/movies-catalog.ts` on
Pages, through the middleware's `next()`.

In **Cloudflare Pages project `nceastudy` → Settings → Variables and Secrets**,
configure **both Production and Preview**, then redeploy:

| Runtime binding | Value |
| --- | --- |
| `QCC_API_ORIGIN` | Actual backend origin, for example `https://qcc-games-api.vercel.app`; no path, query, credentials or fragment |
| `QCC_PROXY_SECRET` | Server-only secret shared with the backend; use a secret binding, never a `VITE_` variable |
| `TMDB_READ_TOKEN` | Server-only TMDB read token for the native Pages movies Function |

There is **no default backend origin or proxy secret**. Missing/blank origin or
secret returns no-store JSON 503 `{"error":"backend not configured"}` without
fetching. Invalid origins and upstream failures/timeouts return no-store JSON
502 `{"error":"backend unavailable"}`. The proxy never logs the secret, headers
or request bodies. Build command: `npm run build`; output directory: `dist`.
Preview can use a separate backend and secret when its database is isolated.

`public/_routes.json` is copied unchanged to `dist/_routes.json`:

```json
{"version":1,"include":["/.netlify/functions/*","/api/*"],"exclude":[]}
```

These are the only invocation prefixes. Static HTML, assets and retired-worker
files bypass Functions. Do not add `exclude: ["/*"]`: it would disable both
APIs. See Cloudflare's [routing](https://developers.cloudflare.com/pages/functions/routing/)
and [middleware](https://developers.cloudflare.com/pages/functions/middleware/) docs.

The proxy preserves method, raw query and streaming body. It forwards only
`Authorization`, `Content-Type`, `X-QCC-Sync` and `Accept` from the visitor. It
sets `X-QCC-Client-IP` from Cloudflare's `CF-Connecting-IP` when present and
`X-QCC-Proxy-Secret` from the runtime binding. Visitor-supplied QCC proxy/IP
headers are discarded. It sends no `Origin`, cookies, forwarding chains or
legacy Netlify IP header. It returns the upstream status/body and only
`Content-Type`, `Retry-After`, `Cache-Control`, `ETag` and `Vary` headers. The
upstream fetch uses manual redirects and a 10-second deadline; credentials and
the secret are never followed to a redirect destination. A later failure after
a response stream begins cannot change its status.

The movies fetch also uses `redirect: 'manual'`. Workers implements only
`follow` and `manual`; `error` throws before making the request. Every non-2xx,
including redirects, fails metadata retrieval (404 keeps the existing
`title_unavailable` response; other failures return 502). See the
[Workers Request API](https://developers.cloudflare.com/workers/runtime-apis/request/#properties).

## Physical database capacity

`server/storage-full.ts` recognizes Postgres SQLSTATE **53100** (`disk_full`),
**53400** (`configuration_limit_exceeded`), Neon project-size-limit messages,
and wrapped causes/pool errors. It returns exactly:

```http
HTTP/1.1 507 Insufficient Storage
Content-Type: application/json
Cache-Control: no-store

{"error":"storage_full","message":"Storage is full right now. Your progress is kept on this device."}
```

Accounts (including save sync v1/v2 and authentication), leaderboards, the
runtime environment/flags guard, and both Netlify adapter initialization catches
use this contract. Transaction cleanup retains the original capacity error.
Failed writes/commits roll back saves, scores and revisions. No data is deleted
to reclaim space, and driver messages/SQL/connection strings are not returned.
Unrelated service failures, environment mismatches and write freezes retain
their existing 503 behavior. Logical per-account/request quotas still return
413; they are separate from the shared **0.5 GB Neon Free** physical budget.

The browser displays the shared human-readable message instead of the error
code in account sync/login/sign-out and leaderboard dialog/sidebar statuses. A rejected
background score upload keeps its notice even if a subsequent ranking read
succeeds. Local saves, durable account staging and queued scores remain intact;
507 uses the existing persisted retry backoff and clears on successful recovery.
Signup's initial failed sync also retains the capacity notice.

## Save/body limit audit retained from the preceding branch change

| Limit | Backend ref before mirroring | This branch |
| --- | --- | --- |
| `MAX_KEY_BYTES`, UTF-8 JSON transfer record | 1 MiB | 1 MiB |
| `MAX_BODY_BYTES`, full streamed sync request | 2 MiB | 1 MiB |
| All keys stored for one account | Unbounded | `MAX_USER_BYTES=2 MiB` |
| Ordinary client batch, including cursor/revisions | Below 2 MiB − 2,048 bytes | Below 1 MiB − `SYNC_BATCH_HEADROOM_BYTES=2048` |
| Keepalive request | Below 60,000 bytes | `MAX_KEEPALIVE_BODY_BYTES=60000` |
| Auth JSON body | 2,048 bytes | `MAX_AUTH_BODY_BYTES=2048` |
| Save row JSONB text constraint | 2 MiB | Unchanged |
| Leaderboard JSON body | 2,048 bytes | Unchanged |

The account quota counts compact UTF-8 JSON of the entire merged
`{key:{value,updated}}` map, including untouched keys and semantic no-ops. It is
checked under the account row lock before writing. Existing over-quota saves
remain readable; non-growing/shrinking updates remain allowed. A growing
rejection is atomic and does not advance revisions. Snapshots are indivisible;
a record near 1 MiB may not fit its request envelope and stays local. The client
attempts later shrinking batches and makes at most one extra pass over logical
quota rejections after progress, then retains any failures without a retry loop.
These are logical limits, not reserved physical capacity: rows, indexes,
sessions, authentication attempts and leaderboards share the database budget.

Usernames, password requirements, fixed 60-day sessions and abuse limits remain:
60 signups/IP/hour; failed logins 100/IP and 10/username/15 minutes. Netlify and
the backend router retain accounts 600, leaderboard 300, TURN 20 requests/IP/minute;
TURN additionally allows 6 credential requests/client/minute. No schema,
migration, game-save model cap or live database was changed.

## Exact equivalent change on `origin/infra/backend-move`

Read-only comparison ref: **`56628e66b5569ab0575b98b0b570336c0c43ceff`**. That
branch was not checked out, modified or pushed. Deploying this Pages branch
alone does not update the Vercel handlers. Apply the following in a separate
backend change; do not wholesale merge the frontend/game history.

1. Add **`src/core/storage-full.ts`** and **`server/storage-full.ts`** unchanged.
   Port the capacity checks before generic catches in **`src/accounts/server.ts`**,
   **`src/leaderboard/server.ts`**, **`netlify/lib/runtime.mts`**,
   **`netlify/functions/accounts.mts`**, and **`netlify/functions/leaderboard.mts`**.
   Port the rollback/error-preservation and authentication COMMIT cleanup changes.
   Preserve the backend's existing game list and migration layout.
2. **`server/app.ts`** has an additional lazy database/factory catch in `build()`
   absent from this Pages checkout. Import
   `isStorageFullError, storageFullResponse` from `./storage-full`; change that
   `catch` to `catch(error)` and return `storageFullResponse()` when classification
   matches, before its existing generic 503. Do the same in **`server/node.ts`**'s
   outer catch before its existing 500 fallback, writing the response status,
   headers and JSON body. Vercel delegates to `createApp`; **`server/vercel.ts`**
   needs no separate capacity catch.
3. Port the account-client 507 parsing/retry, initial-signup and sign-out notices in
   **`src/accounts/client.ts`**; preserve its `apiUrl('accounts')` endpoint/import.
   Port 507 handling, status notifications and notice recovery in
   **`src/leaderboard/client.ts`**; preserve `apiUrl('leaderboard')`. Port the
   status rendering/subscription changes in **`src/leaderboard/view.ts`** and
   **`src/leaderboard/sidebar.ts`**. Do not import Claimline's unrelated behavior
   when transferring these hunks.
4. That backend ref still implements `fetchTmdb` inside
   **`netlify/functions/movies-search.mts`**. Change its `redirect: 'error'` to
   `redirect: 'manual'` and retain `if (!result.ok)` before JSON parsing. This is
   equivalent to this branch's **`server/movies-catalog.ts`** change; no Pages
   movies adapter is needed on the backend.
5. Mirror the preceding quota change too: **`src/accounts/shared.ts`** gets
   `MAX_BODY_BYTES=1024*1024`, `MAX_USER_BYTES=2*1024*1024`,
   `MAX_AUTH_BODY_BYTES=2048`, `MAX_KEEPALIVE_BODY_BYTES=60000`,
   `SYNC_BATCH_HEADROOM_BYTES=2048` and `jsonBytes`; keep `MAX_KEY_BYTES=1024*1024`.
   Port **`src/accounts/server.ts`**'s locked all-key merge/quota/no-op check and
   legacy non-growing allowance. Port **`src/accounts/client.ts`**'s batching,
   unsendable-record notice, 502 retry, integer retry deadlines and bounded 413
   recovery. **`scripts/leaderboard-dev.mjs`** must use the shared cap while
   preserving its backend-specific environment setup. Update **`docs/ACCOUNTS.md`**
   and **`docs/SYNC.md`** to the current limits.
6. Port the capacity regressions from **`tests/database/storage-full.test.ts`**,
   **`tests/accounts/server.test.ts`**, **`tests/accounts/sync-v2-client.test.ts`**,
   **`tests/accounts/storage-full.spec.ts`**, **`tests/leaderboard/server.test.ts`**
   and **`tests/leaderboard/client.test.ts`**. Keep backend fixture migrations at
   `db/migrations` (this branch uses `netlify/database/migrations`). Also port
   the preceding quota/server-v2 regressions and 413 expectation. Add equivalent
   manual-redirect/non-2xx tests in **`tests/movies/catalog-api.test.ts`** against
   its existing movies handler; omit the Pages-only middleware/adapter import.
   Extend **`tests/server/app.test.ts`** to cover a database-factory capacity
   exception, matching environment/flags failures, and the trusted-IP cases below.

### Required backend handling of the new trusted-IP headers

Set the same server-only **`QCC_PROXY_SECRET`** on the Vercel backend's matching
Production and Preview environments. The Pages IP header must be authenticated
before either the outer router or account auth limiter trusts it. The backend
ref currently ignores `X-QCC-Client-IP` and reads a different, spoofable legacy
header for account throttling. Make this precise change in **`server/app.ts`**:

- Import `timingSafeEqual` from `node:crypto` and `isIP` from `node:net`. Accept
  `request.headers.get('X-QCC-Client-IP')` only when `isIP(value)` is nonzero and
  a nonempty configured `env.QCC_PROXY_SECRET` equals `X-QCC-Proxy-Secret` using
  equal-length buffers and `timingSafeEqual`. Never log either secret.
- Before the `limited()` call, choose `ip = authenticatedProxyIp || clientIp ||
  'unknown'`. Use this IP for both the existing router limiter and TURN handler.
- Before invoking the inner handler, clone the headers. Remove
  `X-QCC-Proxy-Secret`, `X-QCC-Client-IP` and visitor `X-Nf-Client-Connection-Ip`.
  Set `X-Nf-Client-Connection-Ip` to the chosen IP for the unchanged account
  signup/login limiter. Preserve the existing approved-Origin removal for
  direct cross-origin requests; Pages itself sends no Origin.
- Test valid/missing/wrong secret, malformed/comma-separated IP, forged legacy
  headers, IPv4/IPv6, separate visitors' rate-limit buckets and direct requests'
  platform-IP fallback. Unauthenticated custom headers must never change a
  rate-limit subject. **`server/vercel.ts`** and **`server/node.ts`** can retain
  their platform/socket IP arguments: the shared router selects the trusted IP.

Vercel's existing `vercel.json` rewrite from `/.netlify/functions/:route` to
`/api/:route` remains. Use a reachable production origin without an intervening
login/protection redirect. Keep backend `DATABASE_URL`, TURN credentials,
strict database environment markers and optional `QCC_WRITE_FREEZE` controls.
`QCC_ALLOWED_ORIGINS` remains relevant for browsers using that branch's explicit
API base directly; Pages server requests have no Origin and do not need a CORS
allowlist entry. Keep the Paper.io/Claimline leaderboard migration off that
backend; do not add its table/constraint change as part of this work.

## Verification

Local regression tests exercise the real handlers with isolated local Postgres,
capacity errors injected at writes/commits, runtime/adapter failures, browser
notices/retained progress, proxy headers/streams and the Pages movies route.
Typecheck, full Vitest, production build, built routing-manifest comparison and
independent code review are recorded in the follow-up implementation plan.
Live Pages/Vercel configuration, trusted-IP backend deployment and the live Neon
project were not changed or claimed verified.
