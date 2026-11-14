# Browser test infrastructure

Each run owns its Vite server by default. Choose a free `PLAYWRIGHT_PORT` when other worktrees are running. A port collision fails visibly instead of testing a different worktree. For deliberate reuse, start this worktree's server yourself and set `PLAYWRIGHT_REUSE_SERVER=1`. `ARCADE_URL` still selects an explicitly managed external server. CI always starts its own server unless an external URL was explicitly supplied.

The Glass regression workflow caches browser downloads by OS, architecture, browser and package-lock hash. It still runs `playwright install --with-deps` on hits to install system dependencies and validate revisions. A lockfile change invalidates the cache. No tests are filtered or removed by this change.

The uncommitted score harness in the separate climb worktree is not imported here. Its config overrides `webServer` and forces one worker. Keep that override: score frame intervals, paired run order, sample durations, matrix completeness, failure counts and infrastructure exit status are part of the locked contract. The source harness remains authoritative and needs an independent merge before main can run it. Copying only its launcher would leave broken imports and could suggest scoring coverage that main does not have.
