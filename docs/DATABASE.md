# Database operations

QCC uses standalone Neon Postgres through a server-only `pg` pool. Browser code uses the same-origin accounts and leaderboard functions; it never receives a database URL. `netlify/lib/db.mts` lazily reads **only `DATABASE_URL`**, with max two connections, a one-second idle timeout, ten-second connection timeout and no keepalive ping. Remote connections require certificate-verified TLS. The build checks emitted JS and source maps for server database code/configuration.

## Two deployments, in order

1. Deploy the runtime-flags commit **before** the Neon switch. It retains the original integration and migration directory, so Netlify automatically applies `20261029090000_runtime_flags.sql` to the existing database. The environment table intentionally has no row; deploy-one code allows this legacy unknown marker. Runtime flags contain one `write_freeze=false` row. Include the sync fixes and their `20261028003000_account_sync_revisions.sql` migration in this first deployment. Confirm both migrations were applied before freezing.
2. Freeze and copy the old database using the external cutover runbook. Set the restored Neon environment marker to `production` and leave its freeze on. Set context-specific secret URLs, then deploy the Neon-switch commit exactly once. This commit removes the integration packages and moves every migration to `db/migrations/`; the marker is now mandatory in every context. No production changes were made while preparing this repository.

The external, uncommitted kit lives at `/workspace/qcc-neon-cutover/`. Its runbook includes dump/restore rehearsal, verification, reopening, and rollback. Keep the old database frozen permanently after successful cutover, then retire it in Netlify's Database UI after seven verified days. Verify a subsequent deploy does not recreate it.

## Context isolation and secret configuration

In Netlify environment variables, mark `DATABASE_URL` secret and scope it to **Builds + Functions**. Configure different values by deploy context:

| Deploy context | Database | Marker / `QCC_DB_EXPECTED_ENV` |
| --- | --- | --- |
| production | Neon root branch named `production`, pooled URL | `production` |
| deploy-preview and branch-deploy | one long-lived child branch named `preview`, pooled URL | `preview` |
| local development/tests | local PGlite or scratch Postgres | `development` |

Never create a `VITE_DATABASE_URL` or any other browser variable containing credentials. Runtime compares the marker against Netlify's deploy context (global context, then `CONTEXT`); `QCC_DB_EXPECTED_ENV`, when present, adds a second restriction and cannot override the context. Unknown contexts and mismatches return 503 before handlers run. Successful checks are cached per function instance. Marker changes therefore require recycling instances; never repoint an existing live branch to another environment.

`netlify.toml` runs `db:migrate -- --expect-env production` before production builds, and the preview equivalent for both preview contexts. A missing URL fails builds. Only preview contexts with explicit `QCC_ALLOW_NO_DB=1` may skip migration with a warning; their APIs remain unavailable. `npm run build` itself stays database-independent for static hosting and GitHub Pages CI.

Use the pooled URL for functions and ordinary migrations. The runner uses **transaction-scoped** advisory locks, with each migration and its history insert in the same transaction; no session lock relies on PgBouncer affinity. Use the **direct, non-pooled URL** for pg_dump/pg_restore and operator reconciliation. Roles used for migrations need schema DDL privileges; runtime can use a separate role with SELECT on environment/flags, SELECT/INSERT/UPDATE/DELETE on application tables and required sequence privileges. Never grant PUBLIC access to application tables. Inventory and rehearse grants with the intended roles; dumps exclude owner/ACL restoration.

## Migration commands

Set `DATABASE_URL` privately in the shell or a chmod-600 local env file, never in command arguments/history, chat or docs. Scripts print host and migration names/counts, never URLs, SQL parameters, or driver error details.

```sh
npm run db:status -- --expect-env development
npm run db:migrate -- --expect-env development --dry-run
npm run db:migrate -- --expect-env development
# Empty database only: explicit, matching environment bootstrap
npm run db:migrate -- --expect-env development --bootstrap-marker development
# Manual adoption, ONLY after inventory proves all files through this name were applied:
npm run db:migrate -- --expect-env production --baseline-through 20261028001000_minesweeper_difficulties
```

The runner discovers `db/migrations/*.sql` and `db/migrations/*/migration.sql`, normalizes names without `.sql`, rejects duplicate names, and sorts lexicographically. It applies **every unapplied file**, including files earlier than the latest applied name (with a warning). History is `public.qcc_schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`. Recorded SHA-256 mismatches abort before any new file runs. Each file rolls back on failure. Parallel invocations serialize schema/history changes via the same transaction advisory lock and recheck history before execution.

Read-only status/dry-run do not change the schema/history. On first apply, the runner adopts exact local-name matches from migration-history tables. Inspected `@netlify/database-dev@1.0.1/dist/main.js` uses **`netlify.migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`**, with filenames stripped of `.sql` (directory migrations use their directory name). It has no checksum. Production platform internals are not guaranteed by that dev implementation, so the runner also discovers other tables containing `migration` with name-like text columns and recognizes matching local names. Review inventory before adoption; use explicit `--baseline-through` only when existing history is unavailable and schema evidence supports it. Adoption establishes checksums from the reviewed current files; it cannot prove what SQL originally ran. Restored databases must preserve history tables. Adoption covers all ten deploy-one migrations, including `20261028003000_account_sync_revisions` and `20261029090000_runtime_flags`, using Netlify names without `.sql`; the cutover rehearsal verifies that no file is replayed. Never delete history to rerun DDL.

Bootstrap is allowed only if the marker **table is absent** and a matching `--bootstrap-marker` is supplied. A restored table with no marker row must be marked explicitly by the operator before running migrations. Never use bootstrap to bypass an environment mismatch.

All deployed migrations must use **expand/contract**: add compatible tables/columns/indexes first, deploy code that tolerates both schemas, backfill separately, and remove old structures only after the rollback window and stale clients/instances are accounted for. No destructive migration during cutover. Editing a previously applied file breaks checksums; add a new file instead.

### Rebasing PR #68

After this lands, rebase PR #68 and run `git mv netlify/database/migrations/20261028002000_minesweeper_score.sql db/migrations/`, keeping the filename. Its SQL must be idempotent-safe against the new schema. The runner warns about the older timestamp and applies it once even after the later sync-revisions and runtime-flags migrations are recorded. No files may remain in `netlify/database/migrations/`, because Netlify auto-applies that directory.

## Runtime freeze

```sql
UPDATE qcc_runtime_flags SET write_freeze=true, updated_at=now() WHERE id=true;
-- After successful verification and cutover:
UPDATE qcc_runtime_flags SET write_freeze=false, updated_at=now() WHERE id=true;
```

`isWriteFrozen(pool)` caches the database flag for ten seconds per instance; truthy `QCC_WRITE_FREEZE` (`1`, `true`, `yes`, `on`, case-insensitive) overrides it immediately and is OR'ed with the database value. Missing flags/errors fail closed. While frozen, every method other than GET/HEAD receives 503, `Retry-After: 120`, `Cache-Control: no-store`, and `{"error":"read_only","retryable":true}`. This includes signup, login (session creation), logout, score uploads and save/settings uploads. Reads remain available. The shared policy lives in `src/accounts/write-freeze.ts`, used by both handlers and the environment guard. Frozen authentication skips session touches; v2 sync reads use repeatable-read, read-only transactions without row write locks. The raw handler contract remains unchanged.

Wait at least 30 seconds after freezing and check mutation 503s. Then wait longer than the actual maximum configured Netlify invocation duration plus the ten-second cache TTL, and confirm no application writer transactions remain in `pg_stat_activity` before the final dump. Entry checks do not stop requests already reading a slow body. Unknown invocation limits or remaining writer transactions are a no-go; do not assume 30 seconds alone drains writers. Clients retain queued saves and scores locally and retry when service returns; verify that behavior on the sync-fix release before cutover. Login cannot pass while frozen: use an existing test session for frozen read smoke, then perform login/progress/logout immediately after reopening and freeze again if those checks fail.

## Free-tier budget and previews

Use one Neon Free project, one root `production` branch and **one shared long-lived `preview` child branch**, not per-PR branches. Shared previews share data and schema; coordinate migrations so concurrent preview deployments remain compatible. Reset preview from production only on demand, with anonymised or schema-only data, then set marker `preview` before any preview build/function can connect. Never expose real account hashes/saves through previews; do not put production URLs in preview env vars. Snapshot/reset a shared preview only when all preview users are idle.

As checked 2026-10-29, Free includes 100 CU-hours/project/month, 1 GB storage/project, 5 GB public egress/project/month, ten branches/project, up to 2 CU autoscaling, six hours restore history and one manual snapshot. Scale-to-zero occurs after five idle minutes and cannot be disabled on Free. Choose 0.25 CU minimum with maximum 0.25–0.5 CU. At 0.25 CU, 100 CU-hours buys roughly 400 active hours across branches; 24/7 compute would exceed the budget. Keep polling and database wakeups bounded, monitor compute/storage/egress, and prune temporary rehearsal branches. Large saves and pooled idle connections still count toward actual usage. Free is a budget, not an availability guarantee; retain offline dumps outside Git.

Sources: [Neon plans](https://neon.com/docs/introduction/plans), [Neon pooling](https://neon.com/docs/connect/connection-pooling), [Netlify migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/). Netlify documents automatic migrations under its old directory and manual systems elsewhere. Removing both packages and that directory removes the documented triggers; confirm retirement/reprovisioning behavior in the actual UI after cutover because platform internals were not accessible here.

## Local tests and development

`npm run dev:online` starts Vite plus real handlers and persistent PGlite under ignored `.netlify/local-leaderboard/`. Tests use `tests/support/local-db.ts` with in-memory PGlite and a loopback `pg-gateway` connection, requiring no GitHub Actions service or Netlify credentials. This is Postgres-compatible testing, not a substitute for the local native PostgreSQL dump/restore rehearsal. The original lockfile used PGlite 0.3.16; an isolated query of that exact version reported Postgres 17.5 (the replacement 0.3.15 also reports 17.5). The old gateway advertised 16.3 as a hardcoded value, so query `server_version` on real source/target. Neither Netlify production nor Neon server versions were inspected here. Use pg_dump/pg_restore at least as new as the actual source major version (planned PG17 or newer).
