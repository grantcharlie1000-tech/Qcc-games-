# Frosthop leaderboard activation

The Pages game already submits a completed ranked run as `2147483647 - milliseconds` under `femboy-obby`. The separate API on `infra/backend-move` must recognize that key; rebuilding Pages alone cannot open the board.

This change registers the API key and adds the gated migration `20261107120000_frosthop_backend_board`. The migration adds only Frosthop to the existing database constraint expression. It preserves all existing scores and allowed/closed games. It fails safely if the expected constraint is missing. It has a distinct name from main's frontend-era migration, which replaces the whole allowlist and should not be copied into this backend.

## Deployment

1. Verify the actual Vercel production project is connected to the intended backend ref and that its Neon database is the production database. Do not print connection strings or tokens.
2. Inspect `npm run db:status -- --expect-env production` and confirm no unrelated migrations are pending. Do not run a bulk migration blindly.
3. With approval for this deployment, set `QCC_APPROVED_MIGRATIONS=20261107120000_frosthop_backend_board` for the migration command and run `npm run db:migrate -- --expect-env production` against the verified database. Keep strict environment-marker checks.
4. Deploy the backend change. Vercel's build command does not run database migrations.
5. Check `https://nceastudy.pages.dev/.netlify/functions/leaderboard?game=femboy-obby&view=public` returns HTTP 200. Verify a legitimate signed-in completed ranked run synchronizes, fastest times rank first, and slower attempts do not replace a best. Do not create fake public scores.

No score reset is included. The current game uses the harder frosthop-v2 course; if a production inspection finds old v1 scores, preserve them and agree a separate versioning/archive plan before mixing incomparable times.

## Verification

The real local handler regression first reproduced HTTP 400, then passed registration/migration, two-player time ranking, best retention, private read, and guest rejection. Dedicated SQL tests verify preservation of existing scores/allowlist, no accidental Claimline activation, fail-closed missing constraint, and the explicit migration gate. Server typecheck/build pass.

Known baseline failures: the older Claimline-closed handler test expects 409 even though the baseline Quad Clash migration permits Claimline. Full frontend typecheck also references removed Netlify database dependencies in two social browser tests. These are outside this backend repair; do not claim the whole suite is green.
