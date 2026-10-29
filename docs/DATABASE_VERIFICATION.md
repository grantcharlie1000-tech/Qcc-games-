# Combined sync and standalone database verification — 2026-10-29

All checks are local. No production database, Netlify/Neon API, deployment or push is involved. Logs are retained under ignored `.netlify/`.

Deploy one includes the three sync commits and the consolidated runtime freeze/environment guard, while retaining `@netlify/database` and Netlify's migration directory. It passed TypeScript, the production build and the full two-worker Vitest suite: **140 files, 2,930 tests**. The focused real-database runtime/accounts/leaderboard checks passed **60 tests**.

Deploy two moves all **ten** unchanged SQL files into `db/migrations/`, including `20261028003000_account_sync_revisions.sql` and `20261029090000_runtime_flags.sql`. No `netlify/database/migrations/` directory remains. Functions use the standalone pool; sync tests and the measurement script use the local PGlite harness.

Combined TypeScript and focused database/v2 checks passed: **36 tests across four files**. The tests adopt every exact Netlify tracker name without `.sql`, including sync revisions and runtime flags, without replay. An explicit PR #68 timestamp probe applies after later migrations, records history, and does not run twice. The runner already supported out-of-order application; no runner behavior change was needed.

Final combined checks:

- `npx tsc --noEmit`: passed.
- `VITEST_MAX_FORKS=2 VITEST_MIN_FORKS=1 npx vitest run`: **142 files, 2,938 tests passed**, no runner errors. After adding explicit creation of the ignored migration-test scratch directory for clean CI checkouts, the six migration tests passed again.
- `npm run build`: passed, including the client database boundary check; existing bundle-size warning.
- Chromium + WebKit, `tests/accounts tests/leaderboard tests/e2e`: **235 passed, 3 skipped**. This includes every spec referring to account sync.
- Chromium `tests/games/snake/smooth.spec.ts:48`: **passed on both unmodified main and the combined branch** in standalone runs. The previously recorded navigation timeout did not reproduce.
- Generated browser evidence was restored with `git checkout --`; newly generated evidence files were removed.

The external kit at `/workspace/qcc-neon-cutover/` stays outside Git. Its regenerated `REHEARSAL.md` records the actual combined migrations on isolated native PostgreSQL 17: freeze returned write 503/read 200, dump/restore matched all tables/schema/sequences with zero FK orphans, and migration adoption recognized **all ten names, zero files replayed, zero pending**. Existing-password HTTP login/progress/logout passed. V2 sync passed frozen reads, ack-only writes, idempotent lost-response retry and empty deltas; rollback reconciliation matched all application/native-history tables and exact revision/cursor state, then a resumed write advanced the cursor once. Control tables are explicitly excluded only after changing their environment/freeze/history state.

`node --test /workspace/qcc-neon-cutover/kit.test.mjs`: **8 tests passed**. New regressions cover revision integrity, exact server-revision copying, and rejected target save/cursor drift. Rollback requires the immutable cutover baseline, rejects unexpected writes to the old database during dry-run/apply, and checks revision integrity before transaction commit or sequence changes. Independent review found these drift hazards; a final review confirmed both fixes and found no remaining material issue in the requested scope.

Logs: `.netlify/combined-{tsc,vitest,build,playwright,snake}.log`, `.netlify/main-snake.log`, `.netlify/cutover-{rehearsal,kit-tests}.log`, and `.netlify/combined-review.md`. The old system PostgreSQL cluster was not started; scratch server files remain under ignored `.netlify/cutover-pg/`.
