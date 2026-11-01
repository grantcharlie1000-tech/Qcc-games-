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
   - Optional: `QCC_DEPLOY_CONTEXT`, `QCC_DB_EXPECTED_ENV`, `QCC_WRITE_FREEZE`
5. Frontend host: set `VITE_QCC_API_BASE=https://<project>.vercel.app` and rebuild. The build adds that origin to
   `connect-src` in `dist/_headers`.

`VERCEL_ENV` maps to the database guard like this: production → `production`, preview → `deploy-preview`.
The database marker row (`qcc_environment`) must match.

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
