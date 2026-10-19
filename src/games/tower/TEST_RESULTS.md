# Tower verification — 2026-10-19

Worktree `.worktrees/tower`, own Vite server on http://127.0.0.1:4184. All game runs use `/#/game/tower` through the real shell, not direct source imports.

| Actual command | Result |
| --- | --- |
| `npm run check` | TypeScript exit 0. |
| `npx vitest run tests/games/tower` | 15 tests passed, 1 file. |
| `npm test` | 19 tests passed, 2 files: 15 Tower + 4 core storage. |
| `ARCADE_URL=http://127.0.0.1:4184 npx playwright test tests/games/tower --project=chromium` | 4 passed, final run 25.3 seconds. |
| `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art/tower/skyline.svg` | 1 SVG passed, 0 failed. |
| `git diff --check` | No whitespace errors. |

Unit evidence covers literal left/right x-axis crops, both depth-axis directions, zero-overlap edge/miss, fair thin-edge tolerance, matching 30/60Hz perfect placement and reflected positions, score/combo reset, settling remainder, invalid extra drops, gradual speed, restored timing/direction/phase, caller-detached geometry, malformed snapshots and fifty consecutive full-size alternating perfect floors. Tests initially ran against stubs (10 failed / 1 passed) before implementation; the first browser run failed all three then-existing tests because no module was mounted.

Chromium evidence exercises actual Canvas mouse click, native Drop block button click, Space and Enter, touch tap, cropped width/depth read from the shell's saved snapshot, complete miss, loss action and toolbar restart, restart while paused, frozen clock/input across 5000ms of pause, save/reload, native modal keyboard activation, navigation disposal/re-entry with no duplicate drop, and nine perfect floors with camera follow. Phone width is 390px with 366px available stage width; document overflow assertion passes. Screenshots were opened and visually inspected.

- `tests/games/tower/evidence/chromium.png`: 390×844 real route, two imperfect floors and intact shell score/best/controls.
- `tests/games/tower/evidence/tall-tower.png`: 390×844, nine perfect floors, height/score/combo and following camera.
- `tests/games/tower/evidence/performance.json`: separate native clock sample in Chromium 154.0.8037.57, 90 RAF intervals, median 16.7ms, p95 16.7ms, max 16.8ms; zero page errors and zero external requests during mount/playfield sample. This is a shared container observation, not physical Chromebook/mobile performance evidence.

Known limits: WebKit executable `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` was checked with `existsSync` and is absent, so no WebKit claim. Touch was emulated in Chromium, not measured on physical hardware. Parent owns cover.svg and integration/offline production checks; cover is untouched. Independent final code review is requested from parent because the assigned isolation rules prohibit spawning more agents. The supplied skyline.svg and all in-game cuboid rendering are original.

During verification an intended imperfect second drop instead landed inside the documented perfect tolerance; test time was changed from 1450ms to 1300ms to test a real crop. Native Space on the dialog's default close button closed the dialog correctly; test now focuses and activates its explicit Let’s play control. Neither required relaxing the gameplay assertions.
