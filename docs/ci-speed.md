# PR CI timing

The target is less than ten minutes from workflow start to the last required
check. Timings below are estimates until this branch runs on GitHub; runner
queues, network failures and test regressions can exceed the target. No checks
are omitted to meet it, and job timeouts retain room for failure diagnostics.

## Before and expected after

Baseline: [successful PR run 41498544386](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/41498544386),
2 November 2026. Its jobs ran concurrently, so wall time follows the longest
path rather than the sum of job times.

| Check or job | Before | Expected after, including setup |
| --- | ---: | ---: |
| Full Chromium suite | 39m 17s, one worker | 8 shards, about 4–7m each, two workers |
| Full WebKit suite | 53m 30s, one worker | 8 shards, about 5–8m each, two workers |
| Browser report/required check | Included above | About 30–60s after both browsers' shards |
| Campaign regression (Chromium / WebKit) | 3m 20s / 1m 40s | About 1–3m, independent of full suites |
| Unit and native checks | 4m 11s inside build | About 4–5m, independent job |
| Production build + artifact | 19s inside build | About 30–60s, one build |
| Update audit | 5m 2s inside build | About 5–6m, after production build |
| Offline audit | 2m 59s inside build | About 3–4m, after production build |
| Required `build` check | 13m 14s, serial unit/build/update/offline work | About 6–8m for the parallel dependency path |
| Total PR wall time | About 53m 35s | **About 7–9m**, subject to the limits below |

The useful first approximation for WebKit test work is
`53.5 minutes / (8 shards × 2 workers) = 3.34 minutes`; startup, uneven test
durations, serial groups, artifact transfer and merging add to this. Dividing
only the browser suites would leave the old 13-minute build job above target.

## Workflow and coverage

- Eight shard jobs per browser use `--shard=i/8 --fully-parallel --workers=2`
  on standard `ubuntu-latest` runners. Each job runs two complementary native
  partitions: `--grep=games/blockcraft/` and `--grep-invert=games/blockcraft/`.
  This distributes the expensive 3D tests across all eight jobs; a single
  unpartitioned shard had concentrated them together. Both partitions run even
  when the first fails, and either failure fails the shard. Explicit serial groups remain serial.
  Test discovery finds **915 tests per browser**, up from the brief's 881;
  the combined shard sizes are `115, 115, 115, 115, 114, 114, 114, 113`.
  Blockcraft contributes `5, 5, 5, 5, 4, 4, 4, 4` tests and the remaining
  partition contributes `110, 110, 110, 110, 110, 110, 110, 109`. Comparing
  both partition inventories with the full inventory proves their union
  contains every original test exactly once.
- Both campaign regression checks still run independently and the campaign
  also remains in the full suites. No affected-game filtering, added skips,
  retries or reduced assertions are used.
- `Full browser suite (chromium)` and `Full browser suite (webkit)` remain the
  required check names. Their aggregate job waits for both browser matrices,
  merges its own browser's sixteen blob reports and requires its own matrix to
  succeed. A failure in one browser does not fail the other browser's result.
  Failed, cancelled, missing or skipped shards cannot produce a passing check;
  all sixteen report ZIPs (two per shard) must also be present. Blob artifacts retain traces and
  screenshots; merged HTML reports are `e2e-chromium` and `e2e-webkit`.
- `Unit and native checks` runs `npm test -- --maxWorkers=1`. `Build site` runs
  `npm run build` once and uploads `arcade-site`, including the hidden
  `.vite/manifest.json`. Separate update and offline jobs download exactly that
  build. The existing `build` check aggregates all three dependencies and fails
  unless unit/native checks, production build and both audits succeed. PR
  update verification retains `ARCADE_UPDATE_NATIVE_TRACE=1`.
- The source-aware browser tests keep the Vite dev server: they intercept
  `/src/...` requests and use development-only game hooks. Serving `dist` to
  them would change what they exercise. Only the built-site audits share `dist`.
- The shared setup action uses Node 22, `npm ci` and `setup-node`'s npm download
  cache. Browser binaries at `~/.cache/ms-playwright` have exact keys containing
  runner OS, architecture, browser and the **installed Playwright version**
  (currently 1.64.1). OS libraries are installed even on a cache hit, using the
  Ubuntu archive mirror. npm caches do not substitute for lockfile installs.
- Minesweeper's positive timer checks wait for the displayed value to change
  instead of sleeping 1.2 seconds at each of four viewport checks. Timed
  negative assertions, held input, autosave observation and stable-streaming
  windows keep their original meaning and remain intact.
- Playwright starts on port 4600 by default, supports `PLAYWRIGHT_PORT`, uses
  strict port binding, and refuses to reuse an existing server in CI.
  `ARCADE_URL` still supports an explicitly managed external server and reaches
  the multiplayer helpers as well as normal page fixtures.

## Local measurements and verification

Local host: shared Linux container, eight reported logical CPUs, 16 GiB memory,
Node 24.22.1, Playwright 1.64.1. CI uses Node 22 on separate standard runners.
These measurements include real tests, not just test discovery, but cannot
establish GitHub's final wall time.

| Verification | Observed result |
| --- | --- |
| Final partitioned WebKit shard 1/8, two workers | **400.22s (6m 40s)** including both command launches; 103 passed, 10 existing skips, 2 failed |
| Final Blockcraft partition | 258.12s including launch/collection (74.59s in Playwright's report); 2 passed, 1 existing skip, 2 failed |
| Final remaining-tests partition | 142.08s including launch/collection; 101 passed, 9 existing skips, **0 failed** |
| Initial unpartitioned WebKit shard 1/8, two workers | **368.97s (6m 9s)** including runner startup/reporting; 99 passed, 12 existing skips, 4 failed |
| Unit suite, one worker | 3,290 passed in 161 files; 276.63s |
| Production build | Passed; Vite build 7.94s plus validation/type checking/manifest |
| Native diagnostic helper | 7 passed |
| Campaign + changed timer tests, both browsers | Both timer tests and WebKit campaign passed; Chromium renderer crashed initially, then unchanged Chromium campaign passed alone in 39.0s |
| Workflow validation | actionlint 1.7.12 passed; final complementary partition inventories cover all 915 IDs exactly once per browser |
| Aggregate gates | 32 browser/result combinations, 125 build/result combinations and 4 partition-exit combinations and report counts 0/8/15/16/17 checked; only complete successful inputs pass |

An additional unpartitioned WebKit shard 3/8 concentrated the 3D games and
was interrupted after **696.09s (11m 36s)** with 39 tests still unrun. That
measurement prompted the complementary Blockcraft/remaining partitions; it is
not evidence that the earlier single-partition design met the target.

The initial timed shard failed the desktop focus-ring test and three
`liquid-glass.spec.ts` tests (press/swelling, cancelled press, and full hide).
Both focus-ring viewport cases passed unchanged on an isolated rerun in 12.5s.
The press/swelling case also passed unchanged, but the other two liquid-glass
cases failed on an isolated rerun; their intermittent failure cause remains
unresolved.
The local update audit timed out waiting for legacy L to install; the offline
audit timed out clicking Snake's disabled `Turn up` control. They remain mandatory CI
checks. The final partitioned shard still failed Blockcraft's keyboard/mouse controls
and pointer-lock fallback controls tests: both timed out waiting for the game
root to become ready. Its entire remaining-tests partition passed, including
the liquid-glass cases that failed earlier. These local failures must not be
presented as a passing full run.
The legacy-waiting update case passed with the matching Playwright Chromium
binary (124.70s), but the complete update/offline audits did not pass locally.
A separate self-managed-server timer run exceeded its 30-second test budget
on the contended host; both browser timer tests had passed in the targeted run.
Independent review found no material CI implementation defect, including in
the final complementary partitions and failure propagation.
Local audit copies changed only server ports to 4681/4675/4676 and wrote
evidence under `/tmp`; tracked verification scripts were not changed.

Reproduce a timed shard with a managed dev server in one terminal:

```sh
npm ci
npx playwright install --with-deps webkit
npm run dev -- --port 4600 --strictPort
```

In another terminal, time the same test command used by CI:

```sh
suite_status=0
time CI=1 ARCADE_URL=http://127.0.0.1:4600 \
  PLAYWRIGHT_BLOB_OUTPUT_DIR=blob-blockcraft xvfb-run -a \
  npm run test:e2e -- --project=webkit --shard=1/8 \
  --fully-parallel --workers=2 --reporter=line,blob \
  --grep=games/blockcraft/ --output=test-results/blockcraft || suite_status=1
time CI=1 ARCADE_URL=http://127.0.0.1:4600 \
  PLAYWRIGHT_BLOB_OUTPUT_DIR=blob-remaining xvfb-run -a \
  npm run test:e2e -- --project=webkit --shard=1/8 \
  --fully-parallel --workers=2 --reporter=line,blob \
  --grep-invert=games/blockcraft/ --output=test-results/remaining || suite_status=1
exit "$suite_status"
```

## Branch protection and operational limits

Keep the existing five required names: `build`, `Campaign regression (chromium)`,
`Campaign regression (webkit)`, `Full browser suite (chromium)` and
`Full browser suite (webkit)`. **No branch-protection change is expected** when
those are the current required names. Do not replace them with individual shard
checks; all shard and built-audit failures propagate to the aggregate checks.

There are 20 initially runnable jobs: 16 browser shards, two campaigns, unit
checks and the production build. Audits become runnable after the short build
finishes and use freed runner slots. Everything uses free standard runners;
the account's available concurrency and other workflows can still cause queues.
Cold caches retain browser download and OS dependency costs. Test-count
balancing cannot guarantee equal durations, and a single long serial group or
external multiplayer service can dominate a shard. After the first pushed PR,
check the slowest shard, both audit jobs, artifact setup and runner queue times
against the ten-minute target before treating the projection as confirmed.

References: [Playwright sharding and blob reports](https://playwright.dev/docs/test-sharding)
and [browser cache limitations](https://playwright.dev/docs/ci#caching-browsers).
