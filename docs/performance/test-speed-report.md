# Test infrastructure measurements, 2026-11-14

No score-loop speedup is established. Ship opt-in measurement tooling, explicit server ownership and browser download caching. Production code, assertions, score definitions and sample durations are unchanged. Warmup and extra workers were rejected.

Matched comparison: base 3821f655 and head 1f2526c, same Linux host, Node 24.22.1, Playwright 1.64.1 and installed dependencies. Independent git archives had cold Vite caches. The authoritative uncommitted harness was copied read-only from the climb-liquid-glass worktree. Only copied output destinations and server ports changed. Fresh servers, one worker, both engines and all four score matrices remained. Our runs were sequential. Another worktree ran hill-climb measurements concurrently, so these are shared-host observations.

| Command | Base seconds | Head seconds | Outcome |
| --- | ---: | ---: | --- |
| Full liquid-glass.spec.ts, both engines | 156.563 | 190.780 | Both 106 passed, 9 skipped, 1 failed |
| Frozen check-liquid-glass.mjs | 358.739 | 339.757 | Both 336 assertions, no infrastructure failures; scores 124 and 126 |

Two score outcomes changed: chromium/1280 timing/on-p95 and chromium/390 timing/added-p95 passed on base and failed on head. Every other assertion outcome matched. Numeric frame evidence differed. This does not establish identical scores. The apparent 5.3% wall reduction is not claimed as an optimization. The observed command range is 340 to 359 seconds with full coverage; an isolated floor requires a host without competing browser measurements.

Base failed WebKit minimized capsule at 1440px; head failed the same assertion at 320px. Both waited unsuccessfully for data-pill-ready=true. The earlier head Chromium Movies alignment failure remains a separate observation; these runs do not prove its cause. Neither suite is reported green.

Suite command: `PLAYWRIGHT_PORT=<port> node node_modules/@playwright/test/cli.js test tests/e2e/liquid-glass.spec.ts --workers=1 --reporter=json`. Score command: `PLAYWRIGHT_PORT=<port> node scripts/check-liquid-glass.mjs`. Suite ports 4891/4892; score ports 4893/4894. An initial interrupted run and a score collision on port 4600 were excluded. Raw logs, score reports, screenshots and timing JSON: `/tmp/qcc-speed-evidence`.

## Browser cache

Local command: `node node_modules/@playwright/test/cli.js install chromium webkit`, first with a new PLAYWRIGHT_BROWSERS_PATH, then the identical populated directory. Miss 10.605 seconds, hit 0.716 seconds, both exit 0. This excludes GitHub transfer and OS dependency installation. CI retains install --with-deps on hits and misses. No GitHub-hosted savings are claimed.

## Reusable comparison

`scripts/perf/compare-glass-infrastructure.py` freezes the supplied harness once, records hashes and revisions, runs full suite and scoring serially, isolates reports and ports, and compares assertion identities and outcomes. Python 3.12+, installed npm dependencies and browsers are required. No writes go to the source harness. No scoring servers are reused and no fixed waits are shortened. The harness remains opt-in rather than imported into this branch.

Earlier warmup averages: before 8.079 seconds, after 9.378 seconds, rejected. Earlier two-worker suite: 154.002 seconds with two failures versus subsequent serial 141.709 seconds, rejected. Concurrent host load prevents causal attribution.

`npm run check` and `git diff --check` passed. Python CLI help and compilation passed. Parent performs independent review. No production glass or test assertions changed. Long holdout was not run; no runtime or score claim is made for it.
