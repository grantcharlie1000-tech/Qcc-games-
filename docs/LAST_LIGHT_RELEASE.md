# Last Light API release

The frontend release adds the Last Light campaign and its shared account leaderboard. This backend branch registers `last-light` for scores, cloud saves and favourites.

Production builds run `scripts/migrate-last-light.mjs` after the server checks/build. It passes only `20261108223000_last_light_score.sql` to the existing guarded migration runner, using the platform's existing database connection and requiring its `production` environment marker. Preview/local builds skip this step. Repeated production builds are no-ops through migration history/checksum tracking.

The migration extends the installed game constraint with `last-light`; it preserves existing restrictions and score rows. It does not apply any unrelated pending migrations. A missing constraint or marker mismatch stops deployment.

Verified locally: server TypeScript check and bundle; 35 tests covering real database scores, personal bests, cloud saves, migration idempotency, restricted predecessor constraints, untouched pending migrations, marker mismatch and existing leaderboard behavior. All data in these checks was disposable.
