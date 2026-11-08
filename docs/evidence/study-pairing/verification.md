# Final local verification

Latest ingress-capacity follow-up: **171/171 affected tests pass**; full serial
backend run is **5015 passed, 1 failed, 7 skipped** across 257 files. The sole
failure is the unchanged Claimline expectation described below. Canonical latest
logs are `ingress-focused-tests.txt`, `ingress-full-serial.txt`,
`ingress-broad-typecheck.txt`, `ingress-server-typecheck.txt` and
`ingress-server-build.txt`. Seven ingress regressions include 30 real local QCC
accounts completing 180 study calls and 150 successful protected-context
verifications behind shared NAT/egress. Independent review found no new high or
medium defect in the rate split. Limits are per application instance, not
distributed quotas. No deployment or remote database action occurred.

## Prior browser-ledger evidence

Authoritative backend base: `c964c982` (`infra/backend-move`, PR #151).
Pairing work is local branch `prototype/whetu-account-pairing`. No remote
migration, deployment, publication, PR edit or credential provisioning occurred.
Earlier `full-suite-final.txt`/`final-focused-tests.txt` logs predate the final
browser-ledger protocol; the `ledger-*` evidence below supersedes them.

| Check | Result |
| --- | --- |
| Final affected backend/account/migration suites | 164/164 passed, 11 files; `ledger-focused-tests.txt` |
| Strict host accounts + sync + final pairing-client suites | 57/57 passed, 3 files; host worktree command |
| Host broad TypeScript | Passed on latest main + integration work |
| Backend server TypeScript | Passed; `ledger-server-typecheck.txt` |
| Backend bundled server build | Passed; `ledger-server-build.txt` |
| Backend full suite on reconciled base | 5003 passed, 3 failed, 7 skipped; `ledger-full-suite.txt` |
| Two full-suite timing failures rerun in isolation | 38/38 passed; `isolated-timing-tests.txt` |
| `git diff --check` | Passed |
| Backend broad TypeScript | Passed after #151 reconciliation; `ledger-broad-typecheck.txt` |

## Full-suite failures, not hidden by focused passes

1. `tests/leaderboard/server.test.ts`, `keeps the Claimline leaderboard closed
   without changing the schema or other games`: expected HTTP409, got200. This
   unchanged test conflicts with the backend's existing Quad Clash migration
   allowing Claimline. PR #149 independently records the same baseline issue.
2. `tests/games/ball-run/christmas.test.ts`, whole-course runners-on-road scene:
   five-second timeout under full parallel load. Its 28-test file passed in the
   isolated rerun, including the failing case at approximately 3.2 seconds.
3. `tests/games/color-blocks/fair-deal.test.ts`, stored-witness replay: five-second
   timeout under full parallel load. Its 10-test file passed in isolation,
   including the failing case at approximately 3.7 seconds.

The final context-reuse/rate/pruning regressions were added after the full run,
observed RED, fixed, then passed in the final 164-test affected aggregate. No
claim that the whole final project suite is green is made.

Broad backend TypeScript now passes after #151 reconciliation. Earlier logs
from the old `4493e74b` base recorded removed-Netlify imports in social browser
specs; incoming changes resolved those diagnostics. Both current backend and
separate current-main host broad typechecks are green, as is the server bundle.

## Security-specific evidence

- Every strict host startup is quarantined until authoritative server selection,
  even with no localStorage marker or failed marker persistence.
- Real scrypt/session/store integration tests reject old confirmation after a
  browser selection switch while the original bearer session remains valid.
- Old context proof fails after selection change without logout or waiting for
  expiry. Exact same selection preserves its context.
- View-scoped cancellation of intent A leaves another tab's newer context B
  valid and emits no Set-Cookie. Old unscoped cancel is rejected.
- QCC session identity and Whetū signed-claims session ID bind pending challenges
  and contexts; same-account different bearer status is rejected.
- Existing consented pairs renew through host status only, with both live
  identities and exact selected session, without rewriting mapping timestamps.
- Valid contexts are reused; renewal writes are durably bounded to 12 per ten
  minutes/browser plus trusted-IP budget. Renewal prunes only that browser's
  expired contexts and retains active/other-browser rows.
- SQL tests exercise constraints, rollback, session expiry during writes,
  cancelled/replayed proofs, rate limits, save preservation and denied RLS/
  PUBLIC access. Independent review found the reload/cancel/growth issues that
  these final changes address; no remaining high identity bypass was found.

## Remaining evidence limits

The local PGlite + pg gateway uses one connection. It executes real
PostgreSQL-compatible transactions/constraints/RLS, but cannot establish actual
separate-connection lock scheduling on Neon/PostgreSQL. Multi-connection race
validation remains required before release.

Backend Whetū HTTP identity responses are controlled boundary fixtures, not live
Supabase sessions. Full private Next/Supabase/browser auth, same-origin Worker
routing, interrupted two-tab/provider flows and production-like capacity remain
separate runtime release gates. Feature/readiness flags stay disabled until
those gates are genuinely met.
