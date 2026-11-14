# Test infrastructure measurements, 2026-11-14

## Result

Ship a Playwright browser download cache for the Chromium and WebKit glass CI jobs, and require explicit local server reuse. Do not ship Vite warmup or increased worker concurrency: measurements did not support either on this shared machine. No measured score speedup is claimed.

## Environment and method

Worktree: perf/test-speed, base origin/main 3821f655. Node 24.22.1, Playwright 1.64.1, Linux, Intel Xeon, eight available logical CPUs. Dependencies were already installed. The parent session 38355 could not be resumed from this agent; no npm ci process remained. No competing install was started.

Wall time uses Python time.monotonic around subprocess.run, including CLI, server startup and browser teardown. Browser projects, assertions, timeouts, screenshots on failure and traces on failure remained unchanged. Existing browser downloads and Vite dependency cache were warm. Other worktrees were running browser and Vitest jobs, so these are shared-machine samples, not isolated performance benchmarks.

| Experiment | Wall seconds | Outcome |
| --- | ---: | --- |
| Exploratory serial full file | 152.404 | 107 passed, 9 existing skips; config edited during execution, exclude from comparisons |
| Startup subset, before, sample 1 | 7.960 | exit 0 |
| Startup subset, warmup, sample 1 | 8.447 | exit 0 |
| Startup subset, before, sample 2 | 8.197 | exit 0 |
| Startup subset, warmup, sample 2 | 10.308 | exit 0 |
| Two workers, test-level parallelism, dedicated port | 154.002 | 105 passed, 9 skipped, 2 failed; Chromium D-Bus disconnect and abort in failure logs |
| Serial full file, dedicated port | 141.709 | 107 passed, 9 skipped, exit 0 |

Startup subset command: `npx playwright test tests/e2e/liquid-glass.spec.ts --workers=1 --reporter=list --grep 'the arcade pill sits under Games'`. Alternated before/after twice, changing only Vite server.warmup.clientFiles for src/main.ts. Mean before 8.079 seconds, after 9.378 seconds, approximately 16.1% slower. Warmup was removed.

Full serial command: `PLAYWRIGHT_PORT=4798 npx playwright test tests/e2e/liquid-glass.spec.ts --workers=1 --reporter=list`. Parallel experiment added `--fully-parallel --workers=2`. It was approximately 8.7% slower than the subsequent serial sample and failed, so no worker change is shipped. This ordering and concurrent host load prevent causal attribution.

One earlier parallel attempt reused another worktree's listener on port 4600. That run was stopped and discarded. Dedicated port 4798 was used afterward. The server ownership change prevents this silent cross-worktree reuse by default. Deliberate reuse remains available through PLAYWRIGHT_REUSE_SERVER=1; ARCADE_URL remains an explicit external-server option.

## CI cache

Glass CI now restores ~/.cache/ms-playwright using OS, architecture, browser and lockfile hash. The install command still runs with --with-deps on every run, including cache hits. Thus system packages and requested revisions are checked; a cache miss follows the existing installation path. Cache download and upload overhead may exceed savings for a particular runner. No GitHub-hosted before/after run was available locally, so saved CI seconds are unmeasured. No test command or assertion was changed in CI. Workflow path filters now include the relevant infrastructure files.

## Locked score integration boundary

Read only: /home/box/.t3/worktrees/Qcc-games-/climb-liquid-glass-3f28349dfd303692, including its uncommitted scripts, tests/liquid-glass-score and .hill-climb/liquid-glass/best.txt. The saved best output ends with 336 assertions and 124 failures. Those are historical source-worktree results, not measurements from this task.

The harness is absent from main. Importing it here would introduce a new scoring suite and its contract as part of an infrastructure PR. The minimal integration is therefore the shared Playwright infrastructure only; no partial or rewritten harness is added. The score config overrides its webServer and forces one worker, so it retains fresh-server isolation. Its check script removes ARCADE_URL and controls project coverage. Holdout retains its long paired runs and ten existing test files. Neither scoring command, aggregation, exit behavior, thresholds, durations nor production material code was edited.

This PR does not accelerate the locked verify/score loop. Safely measuring that requires an agreed harness integration and isolated timing runs after the harness is committed. Reusing its server or parallelizing its matrices without that work could alter frame interval results. No claim of identical numeric frame scores is made because the score harness was not run here. Independent review is arranged by the parent, not run by this agent.

## Repeat verification limitation

A second serial dedicated-port run took 180.041 seconds and returned 1: 106 passed, 9 skipped, 1 failed. The existing Chromium Movies pill at 1440px assertion timed out polling the 2px alignment threshold. The assertion and its timeout were retained. This repeat means the full suite cannot be reported as consistently green. A recheck attempted while the screenshot server owned port 4798 failed immediately on the port collision, confirming the new fail-fast ownership behavior.

`npm run check` passed. `git diff --check` passed. No production source or test assertion files differ from base.

The failed Movies case passed unchanged on targeted Chromium recheck: 1 passed in 4.8 seconds. This does not erase the full-run failure. Chromium and WebKit screenshots were captured separately at 390x844. A first WebKit screenshot attempt timed out waiting for a hidden tab bar; the final capture records the actual initial UI without forcing the bar visible.
