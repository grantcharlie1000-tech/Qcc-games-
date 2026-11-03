# Backend hosting off Netlify

The static site (Vite, `dist/`) and the backend now deploy separately. The frontend uses same-origin API paths through the Cloudflare Pages proxy by default.
An explicit `VITE_QCC_API_BASE` build setting can instead point it directly at the backend.

## What the backend serves

| Route | Old Netlify path | Needs |
| --- | --- | --- |
| `/api/accounts` | `/.netlify/functions/accounts` | Postgres |
| `/api/leaderboard` | `/.netlify/functions/leaderboard` | Postgres |
| `/api/turn` | `/.netlify/functions/turn` | Cloudflare Realtime TURN key (503 without it) |
| `/api/movies` | `/api/movies` | TMDB read token (503 without it) |
| `/api/health` | none | nothing |

PeerJS signalling uses the public `0.peerjs.com` server, so it does not depend on the host.
`server/app.ts` provides the parts Netlify used to supply:
- a CORS allow-list
- per-IP rate limits (accounts 600/min, leaderboard 300/min, turn 20/min, movies 600/min, per warm instance)
- standard `CDN-Cache-Control` headers
- the deploy-context mapping for the database guard

## Vercel (Hobby, free, no card) + Neon (Free, no card)

1. Neon: sign in with GitHub, create a Free project, and copy the **pooled** connection string.
2. Load the data: follow the `qcc-neon-cutover` runbook to copy the old Netlify Database into Neon, then run
   `npm run db:migrate`. This writes to production, so get Charlie's go-ahead first.
3. Vercel: sign in with GitHub and import the repo. Leave the build settings alone, because `vercel.json` sets them.
4. Set these environment variables in Vercel (names only):
   - `DATABASE_URL`
   - `QCC_ALLOWED_ORIGINS`, e.g. `https://qcc-games.pages.dev,https://*.qcc-games.pages.dev`
   - `TMDB_READ_TOKEN`
   - `CLOUDFLARE_TURN_KEY_ID`
   - `CLOUDFLARE_TURN_API_TOKEN`
   - `QCC_PROXY_SECRET` when requests arrive through the trusted Cloudflare Pages proxy (server-only)
   - Optional: `QCC_DEPLOY_CONTEXT`, `QCC_DB_EXPECTED_ENV`, `QCC_WRITE_FREEZE`
5. Pages frontend: configure `QCC_API_ORIGIN` and the matching `QCC_PROXY_SECRET` runtime bindings as below.
   For a direct browser connection, set `VITE_QCC_API_BASE=https://<project>.vercel.app` and rebuild; the build
   adds that origin to `connect-src` in `dist/_headers`.

`VERCEL_ENV` maps to the database guard like this: production → `production`, preview → `deploy-preview`.
The database marker row (`qcc_environment`) must match.

### Client IPs through the Pages proxy

Set a matching `QCC_PROXY_SECRET` on Vercel and the trusted proxy; keep it out of `VITE_*` variables and
browser code. The proxy must overwrite `X-QCC-Proxy-Secret` with that secret and `X-QCC-Client-IP` with the
client IP supplied by Cloudflare, rather than forwarding values from the browser.

The Vercel adapter compares fixed-size secret digests with a constant-time comparison and accepts only a
single valid IPv4/IPv6 address. A verified address replaces `x-nf-client-connection-ip` for accounts and is
also used by the router's per-IP rate limits. Without a configured secret, with a mismatch, or with an invalid
address, the adapter strips both incoming client-IP headers and keeps the existing Vercel IP fallback for
router rate limits (`x-real-ip`, then the first `x-forwarded-for` address). Proxy headers, including the secret,
are removed before routing. This trust mechanism applies to the Vercel entry point.

### Save storage on the free tiers

Shared limits in `src/accounts/shared.ts` allow 1 MiB per submitted save record, 1 MiB per sync request, and
2 MiB total per account. The total counts compact UTF-8 JSON bytes of the full `{key:{value,updated}}` map,
including settings, favourites, best scores and game snapshots. It uses the final merged records and includes
keys omitted from the request. Account row locks serialize concurrent uploads across backend instances.
These limits budget for Neon Free's 0.5 GB storage and Vercel Hobby's 4.5 MB request-body limit.

Uploads that would exceed the total are rolled back and return HTTP 413 with
`{"error":"storage_quota","message":"Your saves are over the 2 MB limit."}`. Existing oversized accounts
remain readable and can upload non-growing replacements, including reductions that remain over the cap; no data is removed.

Postgres capacity failures (`53100`, `53400`) and Neon project-size-limit errors return HTTP 507 with
`{"error":"storage_full","message":"Storage is full right now. Your progress is kept on this device."}`.
The client displays these messages, retains unsynced progress locally, and retries temporary capacity
failures with backoff. The client tries later shrinking batches and makes at most one further pass over deferred quota rejections after progress, then waits for manual recovery. Crossy Road and all current game saves are accepted. Unknown save keys and future game keys are ignored in both sync versions, including unknown v2 base keys; they create no rows or revisions. Otherwise valid favourites records containing unknown game ids are also skipped without modifying the stored list. Invalid JSON, envelopes, revision values and recognized save values still return 400. Claimline saves are accepted; its leaderboard
remains closed and this change includes no database migration or schema change.

## Any Node host

```sh
npm ci && npm run build:server
PORT=8787 DATABASE_URL=... QCC_ALLOWED_ORIGINS=... npm run start:server
```

Set `QCC_TRUST_PROXY=1` when the server runs behind a proxy that sets `X-Forwarded-For`.

## Cloudflare Pages frontend → Vercel API

The browser calls same-origin `/.netlify/functions/accounts`,
`/.netlify/functions/leaderboard` and `/.netlify/functions/turn`. Root
`functions/_middleware.ts` proxies exactly those three paths. It does not depend
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

| Limit | Earlier backend limit | Merged limit |
| --- | --- | --- |
| `MAX_KEY_BYTES`, UTF-8 JSON transfer record | 1 MiB | 1 MiB |
| `MAX_BODY_BYTES`, full streamed sync request | 2 MiB | 1 MiB |
| All keys stored for one account | 2 MiB of records | `MAX_USER_BYTES=2 MiB` |
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
