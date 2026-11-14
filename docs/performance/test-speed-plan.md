# Test speed plan

Use the existing shared perf/test-speed worktree. Keep production and scoring assertions unchanged.

- Read the separate Liquid Glass harness without modifying its worktree.
- Measure the existing Chromium and WebKit suite on this machine.
- Compare server warmup and reject it if the measurements do not support it.
- Measure two workers for regular browser tests; reject the option if slower or failing.
- Cache exact Playwright browser revisions in glass CI while retaining OS dependency installation.
- Record measurements, skipped tests, integration limits and screenshots.
- Commit and open a PR. Independent review is arranged by the parent.
