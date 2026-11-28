# Automatic movie playback failure diagnostics

NCEAstudy reports observable playback failures **automatically**, with no diagnostic opt-in/opt-out, popup, code, or confirmation UI. A failed report never blocks playback or creates a visible notification. The existing **Before you watch** warning about third-party streaming is unchanged and is not a reporting dialog.

A cross-origin FrameXTV or archive iframe cannot expose its own video-host DNS lookups, individual network failures or stream URLs to the parent page. A failure reason is an observation, not proof of DNS filtering. An iframe `load` event may occur even after an error page has loaded. `no-playback-after-ready` may reflect autoplay restrictions, unsupported players or a blocked stream.

## Stored data

Every observable failed attempt triggers one best-effort POST to `/api/movie-failure-report`. The native client sends **exactly** `{reason,stage,online}` (fixed enumerations and a boolean). The backend adds `received_at` (UTC epoch milliseconds) and a database-generated integer row ID.

The dedicated table **`movie_playback_failures`** stores `id`, `received_at`, `reason`, `stage`, `online`. No account, movie/TV title, episode, watchlist, route URL, referrer, user agent, raw IP address, cookies or device ID is sent as a field or stored in this table.

To prevent unbounded writes, a separate `movie_playback_failure_rate` table temporarily stores an HMAC of the trusted Cloudflare-provided IP address, scoped to the current UTC hour, plus an attempt count and expiry. The IP address itself is never written to either table. The key is the existing server-only `MOVIE_POPULARITY_SECRET`. The cap is 500 valid attempts per network address per UTC hour. Shared school IP addresses mean this is a safety limit, not a user count.

The supported reason categories are `frame-load-timeout`, `frame-ready-timeout`, `frame-error`, `frame-csp-blocked`, `no-playback-after-ready`, `local-media-error` and `archive-frame-error`. Browsers may not raise error events for a blocked iframe's internal requests. Reports are not queued for later transmission if the reporting endpoint is unreachable.

## One-time deployment steps

1. In the Cloudflare dashboard, open the existing **movie popularity D1 database** bound to Pages as `MOVIE_POPULARITY_DB`, first in **Preview**. Apply [movie-failure-schema.sql](movie-failure-schema.sql) using D1's SQL console/CLI. Its `CREATE TABLE/INDEX IF NOT EXISTS` statements only add diagnostic structures.
2. Verify the two new tables and indexes in Preview; apply the identical migration to the **Production** D1 database. Do not reset or re-create the existing database, and do not run the whole popularity setup again.
3. Confirm Pages already has `MOVIE_POPULARITY_DB` and `MOVIE_POPULARITY_SECRET` in the correct environments. Both are existing movie-popularity settings; **no Resend email keys, address, extra D1 binding or diagnostic access code are needed**.
4. Only after both databases are migrated, deploy the Pages application with the new `/api/movie-failure-report` endpoint.
5. Redeploy the existing dedicated `workers/movie-popularity-cleanup.ts` scheduled Worker after migration, preserving its current D1 binding and cron trigger. It now deletes playback failures older than 30 days and hourly rate buckets past expiry alongside existing popularity cleanup. Publishing Pages alone does not update this separately deployed cleanup Worker.
6. Run controlled playback-error tests on Preview and inspect table rows. Do not generate synthetic reports in Production. Verify the scheduled cleanup Worker is running and check rate limiting.

To inspect the newest events privately from the D1 console:

```sql
SELECT datetime(received_at / 1000, 'unixepoch') AS time_utc,
       reason, stage, online
FROM movie_playback_failures
ORDER BY received_at DESC, id DESC
LIMIT 100;
```

There is no public GET listing endpoint. The POST endpoint validates exact fields, same-origin JSON, a 512-byte body cap, platform IP availability and a bounded per-hour rate. It returns no personal data.

## Retention and privacy

The scheduled cleanup deletes diagnostics after 30 days, but **only once the updated cleanup Worker has been deployed and remains active**. The table is not automatically purged by Cloudflare merely because a row is old; before deploying that Worker, manually clean up if needed. Cloudflare's D1 Time Travel backups and infrastructure/network logs have separate retention policies, so deleting rows does not guarantee immediate erasure everywhere.

Because students may be minors, document the automatic technical error collection in the site's general privacy notice and comply with the operator's privacy obligations, even though this release adds no in-player reporting UI. This feature must not be expanded to collect visitor identities, location, title IDs, detailed browsing logs, DNS requests or school-network fingerprints.

Browser signal visibility does not establish whether a connection failed because of DNS, TLS, firewall policy, a remote outage or browser autoplay rules. Diagnosing the exact blocking layer would require a permitted test environment with network access and logs.
