# Cloudflare Pages → Vercel API

The browser continues to call same-origin `/.netlify/functions/accounts`,
`/.netlify/functions/leaderboard` and `/.netlify/functions/turn`. Pages proxies
those three routes to the Vercel backend without changing frontend endpoints.

In **Cloudflare Pages project settings → Variables and Secrets**, set
`QCC_API_ORIGIN=https://qcc-games-api.vercel.app` for **Production and Preview**.
Use the actual backend origin, with no trailing slash or path; redeploy after
changing it. This is a server runtime variable, with no `VITE_` prefix. A preview
can use a different backend origin when its database is isolated appropriately.
Build command: `npm run build`; output directory: `dist`.

`functions/_middleware.ts` gates on `/.netlify/functions/` and rejects every route
outside the three-name allowlist with 404. Root middleware avoids depending on
undocumented handling of a `.netlify` function directory. The committed
`public/_routes.json` is copied unchanged to `dist/_routes.json` by Vite. Its only
include is `/.netlify/functions/*`; `exclude: []` means everything outside that
include bypasses Functions. Do not add `exclude: ["/*"]`, which would also disable
the API. Neither main nor this branch has `functions/api`, so `/api/*` is omitted.
Static HTML, assets and offline files do not consume Function invocations.
See Cloudflare's [routing](https://developers.cloudflare.com/pages/functions/routing/)
and [middleware](https://developers.cloudflare.com/pages/functions/middleware/) docs.

The proxy streams request/response bodies, preserves method, query, authorization,
cookies, Origin and sync headers, and removes Host on requests and hop-by-hop
headers in both directions, including names nominated by Connection. Redirects
are returned without following them with visitor credentials. The upstream fetch
has a 10-second abort deadline. An unset origin returns 503
`{"error":"backend not configured"}`; fetch/configuration failures return 502
`{"error":"backend unavailable"}`. Local errors use `Cache-Control: no-store`.
It logs neither bodies nor authentication headers. After response headers have
been streamed, a later upstream stream failure cannot change the HTTP status.

## Hosting Lead / PR deployment notes

Read-only audit: `origin/infra/backend-move` at
`56628e66b5569ab0575b98b0b570336c0c43ceff`. That branch was not edited.

- Vercel `vercel.json` already rewrites `/.netlify/functions/:route` to `/api/:route`.
  Point Pages at the reachable Vercel production hostname, not an authenticated
  deployment-protection/login page. If protection is enabled, Hosting Lead must
  configure access for the Pages server request before using that origin.
- Set Vercel **`QCC_ALLOWED_ORIGINS`** to the exact Pages production/custom origins
  and the preview pattern, for example
  `https://qcc-games.pages.dev,https://*.qcc-games.pages.dev,https://your-custom-domain.example`.
  Substitute the real names. Its wildcard matches one subdomain label; it does
  not include the bare project hostname. The proxy preserves browser Origin.
  `server/app.ts` checks this allowlist, then removes an approved cross-origin
  Origin before invoking the inner accounts/leaderboard handlers. Without the
  allowlist, writes from Pages return 403. This remains same-origin to browsers;
  no frontend CORS setup is needed.
- Existing server variables still apply: **`DATABASE_URL`** (pooled Neon URL),
  **`CLOUDFLARE_TURN_KEY_ID`**, **`CLOUDFLARE_TURN_API_TOKEN`**. No database secret
  belongs in Pages or the browser. `TMDB_READ_TOKEN` is for the separate movies
  backend; this proxy does not expose it or add a movies route.
- `server/app.ts` maps `VERCEL_ENV=production` to the production database marker
  and `preview` to the preview marker through `deploy-preview`. The
  `netlify/lib/runtime.mts` guard requires an existing, matching `qcc_environment`
  row. Set optional **`QCC_DEPLOY_CONTEXT`** / **`QCC_DB_EXPECTED_ENV`** only to
  the intended existing environment; mismatches return 503. A Pages Preview
  pointing to the production Vercel deployment uses that deployment's production
  context and database. **`QCC_WRITE_FREEZE`** or a database write freeze also
  rejects writes with 503; do not bypass these guards.
- The proxy replaces `X-Forwarded-For`, `X-Real-IP` and the legacy
  **`X-Nf-Client-Connection-Ip`** with `CF-Connecting-IP`, rather than appending
  untrusted visitor headers. The legacy header is necessary because
  `src/accounts/server.ts` reads it for persistent signup/login throttling.
  `server/app.ts` itself takes its IP as a function argument;
  **`server/vercel.ts`** supplies `X-Real-IP` first, then the first X-Forwarded-For
  entry. `server/node.ts` uses socket IP unless `QCC_TRUST_PROXY=1` enables XFF.
  Vercel documents that it overwrites X-Forwarded-For from external proxies, and
  X-Real-IP reflects that platform IP. Therefore forwarding these headers alone
  cannot guarantee visitor IPs at the outer per-IP limiter on Hobby. Hosting Lead
  must verify deployed behavior and, if rewritten, have the backend adapter use
  the preserved Cloudflare/legacy IP **only after authenticating the trusted
  Pages proxy** (for example a server-only shared-secret check), or configure a
  supported trusted proxy. Simply trusting a public custom header allows spoofing.
  No Hobby environment variable enables Vercel's Enterprise Trusted Proxy feature.
  This backend adapter/trust change is outside this branch. See
  [Vercel request headers](https://vercel.com/docs/headers/request-headers).

## Save/storage/body limit audit

The starting values below are from main at `0221bed` and the backend ref above.
Account shared/server code has the same limits in both; the backend client only
differs in how it chooses an API base. Main has no `server/` directory. Backend
`server/` routing and Netlify function wrappers add no account storage/body cap.

| Limit / enforcement | Before | This branch |
| --- | --- | --- |
| `src/accounts/shared.ts`: `MAX_KEY_BYTES`, UTF-8 JSON transfer record | 1,048,576 bytes (1 MiB) | unchanged |
| `MAX_BODY_BYTES`, streamed account sync PUT incl. envelope and Content-Length check | 2,097,152 bytes (2 MiB) | 1,048,576 bytes (1 MiB) |
| All stored keys for one account | no aggregate cap | `MAX_USER_BYTES`: 2,097,152 bytes (2 MiB) |
| `src/accounts/client.ts` ordinary upload batch | less than 2 MiB − 2,048 bytes | less than 1 MiB − `SYNC_BATCH_HEADROOM_BYTES` (2,048 bytes) |
| Client pagehide/keepalive batch | less than 60,000 bytes | unchanged; named `MAX_KEEPALIVE_BODY_BYTES` |
| Signup/login/logout JSON body | 2,048 bytes | unchanged; named `MAX_AUTH_BODY_BYTES` |
| `scripts/leaderboard-dev.mjs` account body buffer | hardcoded 2,097,152 bytes | shared `MAX_BODY_BYTES` |
| Account save rows: database `octet_length(value::text)` per row | 2,097,152 bytes of JSONB text | unchanged; no schema/migration edits |
| Save-key allowlist / count, `SAVE_KEYS` | main 50, backend 48; settings, favourites, game saves/bests and four Minesweeper bests | unchanged; one record per key |
| Favourites count | at most `GAME_IDS.length` (main 22, backend 21) | unchanged |
| Snapshot JSON shape | version 1 shell, matching nonnegative safe-integer timestamps, depth at most 64, safe keys and finite numbers | unchanged |
| `src/core/storage.ts` local data | browser localStorage quota; memory fallback on quota failure; no application byte cap | unchanged |
| Account count | no application-wide account count cap | unchanged |

The database row limit is in
`netlify/database/migrations/20261026090000_optional_accounts.sql` on main, and
`db/migrations/20261026090000_optional_accounts.sql` on the backend branch.
JSONB text formatting, row/index overhead and other tables consume space beyond
the logical account quota; 2 MiB is not a reservation or a physical disk cap.
The quota counts compact UTF-8 JSON of the complete `{key:{value,updated}}` map,
including keys and envelopes. It is checked after merges and semantic no-ops,
under the existing account row lock, before any writes. Both protocol versions
are covered, including concurrent uploads and replacements of existing keys.
An over-quota growing upload returns 413 atomically; it does not advance revisions.

**These requested targets tighten the limits discovered on main:** requests were
already allowed 2 MiB and total account data was unbounded. There was no smaller
per-user cap to raise. The 1 MiB record validator remains, but request envelope
and batching headroom mean a record near that boundary stays local. Snapshots
are indivisible; they are not split across requests. Multiple smaller records
can use the full 2 MiB quota over separate requests. A populated Blockcraft
world can still exceed the single-request cap. Browser queues/staging retain
unsent progress and report the reason. A quota rejection suspends automatic
uploads until manual sync or reauthentication, using existing error handling.
Quota-rejected batches do not prevent later shrinking batches from freeing
space. After any successful batch the client makes at most one additional pass
over rejected batches, then stages any remaining failures without a retry loop.
Proxy 502 responses use the existing network backoff, with integer deadlines
that survive reloads.

Existing data stays readable, including legacy records/accounts over new write
caps. Over-quota accounts may make non-growing or shrinking updates, even before
they get below the cap; nothing is removed to reclaim space. A newer, smaller
snapshot can free quota. Physical free-tier capacity remains shared by accounts,
sessions, attempts and leaderboards. Limits use the task's conservative **0.5 GB
Neon budget** and stay below Vercel's documented
[4.5 MB payload ceiling](https://vercel.com/docs/errors/function_payload_too_large).
They do not guarantee an unlimited number of accounts at full quota.

Other account restrictions remain: usernames 3–24 allowed characters, passwords
8–128 characters, fixed 60-day sessions; 60 signup attempts/IP/hour; failed logins
100/IP and 10/normalized username per 15 minutes. Netlify wrappers keep accounts
600, leaderboard 300 and TURN 20 requests/IP/minute; `server/app.ts` uses those
same per-instance rate windows on Vercel. TURN additionally allows 6 credential
requests/client/minute. Leaderboard JSON bodies stay at 2,048 bytes. No abuse
protection was relaxed. Game-specific model caps (for example Blockcraft's
200,000 edits) are independent of account storage and unchanged.

## Exact backend mirror checklist

Before the live backend receives these limits, mirror these files onto
`infra/backend-move` in a separate change:

1. **`src/accounts/shared.ts`**: set `MAX_BODY_BYTES=1024*1024`, add
   `MAX_USER_BYTES=2*1024*1024`, `MAX_AUTH_BODY_BYTES=2048`,
   `MAX_KEEPALIVE_BODY_BYTES=60000`, `SYNC_BATCH_HEADROOM_BYTES=2048`, `jsonBytes`
   and the free-tier comment; retain `MAX_KEY_BYTES=1024*1024`.
2. **`src/accounts/server.ts`**: shared auth/body constants and the locked,
   all-key, post-merge aggregate check with non-growing legacy allowance and 413.
3. **`src/accounts/client.ts`**: shared batching constants, the notice when
   an individual record cannot fit a request, retryable 502 handling, integer
   retry deadlines and bounded quota-recovery passes. Preserve that branch's `apiUrl`
   import/endpoint choice rather than overwriting it with this branch's file.
4. **`scripts/leaderboard-dev.mjs`**: replace the hardcoded account buffer cap
   with the shared SSR-loaded constant; preserve its host-neutral environment setup.
5. **`tests/accounts/server-v2.test.ts`**, **`tests/accounts/server.test.ts`** and
   **`tests/accounts/sync-v2-client.test.ts`**: new boundaries, quota, concurrent
   upload, quota-recovery batching, 502 retry, staging and legacy-data regressions
   and oversized-body 413 assertions. Preserve their backend-specific migration
   fixture paths (`db/migrations` rather than main's `netlify/database/migrations`).
   Update current-limit sections in **`docs/ACCOUNTS.md`** and **`docs/SYNC.md`**.

No size constant needs changing in **`server/app.ts`**, **`server/vercel.ts`**,
**`server/node.ts`**, **`netlify/functions/accounts.mts`**,
**`netlify/functions/leaderboard.mts`**, **`netlify/functions/turn.mts`** or
**`vercel.json`**: they delegate account body/storage validation to the shared
handler. The separate trusted-IP adapter follow-up above remains necessary if
Vercel rewrites the IP headers. Deploying this Pages branch alone does not change
live Vercel storage enforcement. Keep the Paper.io/Claimline leaderboard off;
do not mirror main's Claimline migration or add a leaderboard table for this task.

## Verification on this branch

- `npm run check`: passed.
- `npm test -- --maxWorkers=2 --reporter=dot`: 166 files, 3,374 tests passed.
- `npm run build`: passed; existing Vite chunk-size warning only.
- `dist/_routes.json` equals `public/_routes.json` and includes only the API prefix.
- Independent review's two recovery findings were reproduced and fixed with
  regressions for 502 retries across reload and quota-releasing later batches.
- No Playwright run or live deployment/database check; no UI, style, service
  worker source, schema or migration changes.
