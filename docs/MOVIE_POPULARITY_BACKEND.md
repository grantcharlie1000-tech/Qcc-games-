# Popular in Marlborough: prototype aggregate backend

This is a **disabled-by-default server prototype**, not a deployed service. The Movies preference is on by default; users can switch it off in settings without a popup. Until an operator explicitly configures the separate backend, requests return `503 popularity_unavailable`. Do not imply the rail is live before that setup and an end-to-end check.

## What it measures

The client sends a report after 60 seconds of plausible advancing playback. Loading a page, seeking, or opening a title must not qualify. Reports contain no account identifier and are unverified client reports, **not verified people, students, residents, or fraudproof proof of watching**. Anyone using QCC can contribute; “Marlborough” is the rail name, not geolocation or verified school membership. No location is collected.

`POST /api/movie-popularity` accepts exactly `{titleId: "movie-123", token: "32 lowercase hex characters"}`. The token must be opaque and scoped to one title and UTC day, never an account ID, device fingerprint, stable browser ID, or historical watch record. It may be derived locally by hashing the title/day with a daily cryptographically random browser seed of at least 128 bits, provided that seed never leaves the browser and is replaced on the next contribution after a UTC day changes. This lets the client avoid persisting a list of viewed title IDs. Never backfill existing watch history. Opt-out stops all new report POSTs; already-contributed aggregates cannot be attributed back to someone to remove them. Accepted and duplicate submissions both return empty `204` responses.

`GET /api/movie-popularity` returns `{titleIds: ["movie-123"], windowDays: 7}` with at most 20 movies. It exposes neither counts nor daily breakdowns. All responses are `no-store`, with no CORS permission. Movie IDs are positive decimal IDs (up to 10 digits).

The ranking covers the current UTC day and previous six UTC days, not a rolling 168-hour window. Only daily buckets with **at least five accepted title/day tokens** participate. Those qualifying buckets are summed, descending by sum then ascending lexicographic title ID. Sub-threshold days never contribute to ranking. This deliberately prevents one regular device reporting on five different days from passing the threshold alone, without retaining a week of identifiers. It can suppress a movie watched by five different devices spread across five days. Daily random tokens mean these are approximate daily device reports, **not distinct weekly people**; one person can be counted on multiple days or devices. Even “device” is approximate because cleared storage and forged tokens can inflate it. Threshold suppression is not a guarantee of anonymity or protection against inference.

## Storage and concurrency

Use a **new, dedicated Cloudflare D1 database**, not existing leaderboard storage. Apply `docs/movie-popularity-schema.sql` to it and bind it to Pages as `MOVIE_POPULARITY_DB`. The SQL trigger increments the title/day aggregate only on a successful unique token insert, in the same SQLite transaction. Duplicate concurrent requests cannot increment it twice. D1 `batch` is transactional; there is no in-memory or read/modify/write counter fallback.

- `movie_popularity_tokens`: title/day and a server-HMAC hash of the title/day/random token, plus expiration at the next UTC midnight. No raw tokens. Logically retained at most 24 hours.
- `movie_popularity_daily`: title, UTC day number and aggregate count. Only seven UTC calendar days are used. There is no individual history table.
- `movie_popularity_rate`: an independently namespaced hourly HMAC of the trusted platform IP, attempt count and expiration at the next UTC hour. It contains no title, event token, raw IP or persistent cross-hour key. The rate limit is 120 valid-schema POST attempts per IP/hour, counting duplicates. A shared school network may hit this cap; tune only after assessing abuse and fairness. Do not add stable device identities to solve this.

Hashing uses WebCrypto HMAC-SHA-256 with a server-only secret of at least 32 characters, preferably 32 cryptographically random bytes encoded as hex. Never use a `VITE_` variable, client bundle constant, committed secret, query parameter, or frontend-accessible binding for it. Key rotation will reset effective dedup and hourly rate limits, so coordinate it rather than rotating per request.

## Required deployment configuration (not performed by this prototype)

1. Create the separate D1 database and apply the supplied schema with its trigger and indexes. Configure **preview separately from production**; do not bind preview to production data.
2. Bind `MOVIE_POPULARITY_DB` to that database in Cloudflare Pages. Save `MOVIE_POPULARITY_SECRET` through the platform's server secret configuration. Set server variable `MOVIE_POPULARITY_ENABLED=true` only when all other steps are ready.
3. Deploy the Pages Function adapter. Requests must go directly through Cloudflare Pages, where `CF-Connecting-IP` is platform-controlled. The handler deliberately does not trust `X-Forwarded-For`. Do not mount this adapter on an arbitrary server that forwards caller-supplied `CF-Connecting-IP`; that would make the throttle spoofable. No Netlify or local server adapter is included.
4. Configure scheduled cleanup in a separately reviewed Worker/operator job, at least hourly (more frequently if required). Pages Functions do not themselves provide a cron trigger. Each valid endpoint access already deletes expired token/rate rows and out-of-window aggregate rows, but **traffic-driven cleanup alone cannot guarantee physical deletion during idle periods**. Run the following parameterized statements in one D1 batch, where `now` is UTC epoch milliseconds and `today=floor(now/86400000)`:
   - `DELETE FROM movie_popularity_tokens WHERE expires_at <= ?` with `now`.
   - `DELETE FROM movie_popularity_rate WHERE expires_at <= ?` with `now`.
   - `DELETE FROM movie_popularity_daily WHERE day < ?` with `today-6`.
   With an hourly cleanup job, physical live-table retention can be up to one hour beyond logical expiry. Schedule more frequently for a tighter limit. Do not promise hard maximum deletion until this job is running and monitored. Review D1 backup/Time Travel retention, platform request logs, and access separately: SQL deletion does not erase retained backups. Disable request-body logging and never log raw tokens, IPs, secrets or report content.
5. Verify schema, origin handling, throttling, retention and opt-out end to end in preview using synthetic data. Confirm disabled/missing configuration shows an unavailable state without fabricated rankings. Only then consider production enablement after the relevant privacy review, particularly because students may be minors.

Deployment, database creation, secret creation, cleanup scheduling and infrastructure changes require separate authorization. None were performed for this prototype. Disable future collection immediately by removing `MOVIE_POPULARITY_ENABLED=true`; keep the cleanup job active when collection is disabled. The disabled endpoint does not touch the database, so it cannot clean up old rows itself.

## Request safety and limitations

POST requires a present exact same-origin `Origin` and JSON content type, a streamed body no larger than 1024 bytes, exact validated fields, and a trusted platform IP. Cross-site requests and unsupported methods are rejected. A client cannot configure retention, counts, ranking window, or suppression threshold. SQL parameters are bound. Failures return generic 503 responses without sensitive logging.

The same-origin check mitigates browser cross-origin submissions; it cannot authenticate curl/scripts. HMAC protects stored identifiers from casual correlation but does not verify playback. Someone who can submit many fresh tokens, use multiple IPs, or clear local storage can influence ranking. This is an approximate social discovery feature, never a basis for attendance, discipline, surveillance or individual conclusions. Production should consider platform-level request/abuse controls; per-IP application throttling is not comprehensive DDoS protection, and malformed requests and GET requests do not consume the POST bucket.

## Verification

`npm test -- tests/movies/popularity-api.test.ts` uses Node's real in-memory SQLite to execute the production schema, unique constraints, trigger, rate-limit UPSERT, transactional batches, ranking and cleanup. It exercises concurrent duplicate calls, per-title isolation, low-count suppression, ordering/limits, expiration, validation and generic error responses. It is not a live Cloudflare D1 deployment test. Run `npm run check` and the full unit suite too; the parent prototype report records final results.
