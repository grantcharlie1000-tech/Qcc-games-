# Shared leaderboards

Open **Menu → Leaderboards**, choose a game and log in to share scores. Anyone can read rankings; guests can keep playing and saving locally.
The board lists the top 25 personal bests for that game and your own rank, including
when it is below the top 25. Every scored game is included (15); Globle has its own
puzzle statistics and no comparable points score. Corn Clicker ranks lifetime
kernels harvested. They outgrow 32-bit scores, so it submits `floor(log10(kernels) × 10000)`
and boards show the decoded total to four significant figures.

Score submissions require an unexpired, non-revoked account session. The server derives
both player identity and public username from that session; client nicknames,
account flags and player IDs grant no authority. Session validation runs in the
same transaction as the score write, after the bounded request body arrives.

Legacy guest tokens cannot submit scores. Their pending offline queues are not
replayed when signing in, and signup does not migrate historical guest scores.
Existing leaderboard rows remain readable and unchanged by this policy change;
any cleanup is a separate operation. Scored guest runs and bests stay separate on
signup, so they cannot silently repopulate the public board. Logout restores them
for local guest play. Existing account-owned bests still synchronize on login.

Subsequent personal bests sync at most once
per three-minute queue interval; opening/refreshing the board and reconnecting also
flush the queue. Pending improvements persist before any request. Lower scores
never overwrite a best, and equal scores do not change the tie-break timestamp.
Scores are reported by the local games; this is a casual scoreboard, not a
server-authoritative competition or an anti-cheat system.

When the network is unavailable, games continue normally. Previously loaded boards
are explicitly labelled cached, pending scores remain local, and API requests bypass
the service worker so an old ranking cannot masquerade as a fresh response.

## Run locally

```
npm ci
npm run dev:online
```

This runs Vite, the actual function handler and a persistent local PGlite database
under the ignored `.netlify/local-leaderboard/` directory. The default port is 4173;
set `PORT` to use another port. The ordinary `npm run dev` remains a frontend-only
server and reports online score service unavailability.

## Netlify activation

The existing Netlify site must deploy this code to make the feature public. The
function lives at `/.netlify/functions/leaderboard`; all reads and writes are
same-origin. A server-only `pg` pool connects to standalone Neon. Migrations live in `db/migrations/` and run before context builds. Production and preview secrets and database environment markers must agree; see [database operations](DATABASE.md) for configuration, the two-deployment cutover and runtime write freeze. No database credentials are embedded in the frontend.

Use a Netlify build/deploy containing `package.json`, its lockfile, the migration,
function and frontend. A static `dist/` upload alone cannot activate the backend.
Existing GitHub Pages/static hosting can still serve every local game but will
show online boards as unavailable. This implementation has not been published to
the production site during this task.

The function validates game IDs, body size, positive integer scores,
origin and the signed-in account session, uses parameterized SQL and transactional upserts,
separates public cached rankings from private no-store own-rank responses, reuses its warm database pool, and has an IP request
limit. Tables have no PUBLIC grants and are accessed only by the server connection.

## Verification

Tests use PGlite through a loopback Postgres gateway and the committed migrations, with no Netlify account or CI database service.
Separate tokens update one shared board, cannot lower an existing best, keep games
separate and cannot overwrite another identity. Invalid requests are rejected.
The browser test uses two isolated browser contexts connected to that real handler
and database, checks public ranking, own rank, account identity, guest/login recovery, mobile fit and cached
outage display. A separate real HTTP check exercises `dev:online` with two players.
Client tests cover offline retry, persistent queues, in-flight score improvements
and invalid saved rankings. Water Sort independently solves all 27 boards.


## Traffic and cache policy

The expanded sidebar has no polling timer. It refreshes on open, manual Refresh, score submission, reconnect and stale visibility regain. Score retries retain durable per-account deadlines and respect hidden tabs and Retry-After. Public `view=public` responses contain only shared entries and have a 30-second browser/60-second CDN TTL plus five-minute stale-while-revalidate; `view=personal` returns only the authenticated own-rank entry and is private/no-store. Unopted requests keep the previous response format. The server write freeze and full protocol/measurement details are documented in [SYNC.md](SYNC.md).
