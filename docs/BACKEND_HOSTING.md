# Backend hosting off Netlify

The static site (Vite, `dist/`) and the backend now deploy separately. The frontend reads the backend origin
from `VITE_QCC_API_BASE` at build time. If it is unset, the frontend calls the old same-origin Netlify paths.

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
5. Frontend host: set `VITE_QCC_API_BASE=https://<project>.vercel.app` and rebuild. The build adds that origin to
   `connect-src` in `dist/_headers`.

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

Shared limits in `src/accounts/shared.ts` allow 1 MiB per submitted save record, 2 MiB per sync request, and
2 MiB total per account. The total counts UTF-8 JSON bytes of each stored `{value, updated}` record,
including settings, favourites, best scores and game snapshots. It uses the final merged records and includes
keys omitted from the request. Account row locks serialize concurrent uploads across backend instances.
These limits budget for Neon Free's 0.5 GB storage and Vercel Hobby's 4.5 MB request-body limit.

Uploads that would exceed the total are rolled back and return HTTP 413 with
`{"error":"storage_quota","message":"Your saves are over the 2 MB limit."}`. Existing oversized accounts
remain readable and can upload replacements that bring their total below the cap; no data is removed.

Postgres capacity failures (`53100`, `53400`) and Neon project-size-limit errors return HTTP 507 with
`{"error":"storage_full","message":"Storage is full right now. Your progress is kept on this device."}`.
The client displays these messages, retains unsynced progress locally, and retries temporary capacity
failures with backoff. Quota rejections wait for a manual retry. Claimline saves are accepted; its leaderboard
remains closed and this change includes no database migration or schema change.

## Any Node host

```sh
npm ci && npm run build:server
PORT=8787 DATABASE_URL=... QCC_ALLOWED_ORIGINS=... npm run start:server
```

Set `QCC_TRUST_PROXY=1` when the server runs behind a proxy that sets `X-Forwarded-For`.

## Cloudflare Pages (frontend)

- Build command: `npm run build`
- Output directory: `dist`
- Root directory: `/`
- Environment variables: `NODE_VERSION=22` and `VITE_QCC_API_BASE`
- `public/_headers` is copied as-is. No `_redirects` file is needed, because the app uses hash routing.
