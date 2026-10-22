# Shared leaderboards

Open **Menu → Leaderboards**, choose a game and join with a public nickname.
The board lists the top 25 personal bests for that game and your own rank, including
when it is below the top 25. Every scored game is included (14); Globle has its own
puzzle statistics and no comparable points score.

Each browser keeps a random 256-bit private bearer token. Only its SHA-256 hash is
stored by the server or returned as the public player ID. Clearing browser storage
creates a new identity; a matching nickname does not grant control of another
player's scores. There is no account/login or cross-device identity recovery.
Nickname changes apply to that browser's existing leaderboard entries.

Joining publishes existing local bests. Subsequent personal bests sync at most once
per ten-second queue interval; opening/refreshing the board and reconnecting also
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

This runs Vite, the actual function handler and a persistent local Netlify database
under the ignored `.netlify/local-leaderboard/` directory. The default port is 4173;
set `PORT` to use another port. The ordinary `npm run dev` remains a frontend-only
server and reports online score service unavailability.

## Netlify activation

The existing Netlify site must deploy this code to make the feature public. The
function lives at `/.netlify/functions/leaderboard`; all reads and writes are
same-origin. `@netlify/database` enables Netlify's provisioning and automatic
migration runner. The committed migration creates separate player/score tables and
an ordered score index. Nothing writes to an unrelated database. No secret key is
embedded in the frontend. Function/database use follows the site's Netlify plan.

Use a Netlify build/deploy containing `package.json`, its lockfile, the migration,
function and frontend. A static `dist/` upload alone cannot activate the backend.
Existing GitHub Pages/static hosting can still serve every local game but will
show online boards as unavailable. This implementation has not been published to
the production site during this task.

The function validates game IDs, nickname, body size, positive integer scores,
origin and player identity, uses parameterized SQL and transactional upserts,
returns no-store responses, reuses its warm database pool, and has an IP request
limit. Tables have no PUBLIC grants and are accessed only by the server connection.

## Verification

Tests use the real local Netlify Postgres implementation and committed migration.
Separate tokens update one shared board, cannot lower an existing best, keep games
separate and cannot overwrite another identity. Invalid requests are rejected.
The browser test uses two isolated browser contexts connected to that real handler
and database, checks public ranking, own rank, nickname, mobile fit and cached
outage display. A separate real HTTP check exercises `dev:online` with two players.
Client tests cover offline retry, persistent queues, in-flight score improvements
and invalid saved rankings. Water Sort independently solves all 27 boards.
