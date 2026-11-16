-- Apply to the EXISTING dedicated movie-popularity D1 database in Preview and Production
-- before deploying the failure-report handler. Adds tables only; no existing rows change.
CREATE TABLE IF NOT EXISTS movie_playback_failures (
 id INTEGER PRIMARY KEY,
 received_at INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN (
  'frame-load-timeout','frame-ready-timeout','frame-error','frame-csp-blocked',
  'no-playback-after-ready','local-media-error','archive-frame-error'
 )),
 stage TEXT NOT NULL CHECK(stage IN ('connecting','loaded','ready','playing')),
 online INTEGER NOT NULL CHECK(online IN (0,1))
);
CREATE INDEX IF NOT EXISTS movie_playback_failures_time ON movie_playback_failures(received_at);
-- Per-hour short-lived hashes stop a single network exhausting the shared D1 write budget.
CREATE TABLE IF NOT EXISTS movie_playback_failure_rate (
 bucket_hash TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL CHECK(attempts >= 0),
 expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS movie_playback_failure_rate_expiry ON movie_playback_failure_rate(expires_at);
