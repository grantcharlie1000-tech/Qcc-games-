# Test results

Chromium against the Vite server on port 5193; results recorded on 2026-10-27.

- `npx vitest run tests/games/fivefold/model.test.ts`: 11 passed.
- `npx vitest run tests/accounts/server.test.ts`: 16 passed against local Postgres, including Fivefold save and best keys.
- `ARCADE_URL=http://127.0.0.1:5193 npx playwright test tests/games/fivefold --project=chromium --workers=1`: 4 passed.
- `npm run check`: passed. `npm run build`: passed, with Vite's existing large-chunk warning.
- `npx vitest run`: 2,810 passed, 3 failed in Blockcraft performance budgets, and one worker RPC timeout during concurrent work. The failures measured meshing at 3.05 ms/chunk (limit 2 ms), and lighting at 3.92 and 3.93 ms/chunk (limit 3 ms).

The requested full Chromium run was repeated after an initial run had trace-directory conflicts from concurrent Playwright invocations. See final run result below. Phone, desktop and statistics screenshots are in `evidence/`, and the requested copies are at `/workspace/words-phone.png`, `/workspace/words-desktop.png` and `/workspace/words-stats.png`. Measured 320×568, 390×844 and 1366×768 layouts had no horizontal document overflow and kept the keyboard inside the stage. WebKit and physical devices were not tested.

- `ARCADE_URL=http://127.0.0.1:5193 npx playwright test tests/games/fivefold tests/e2e/study.spec.ts tests/e2e/viewport.spec.ts tests/e2e/shell.spec.ts --project=chromium`: 49 passed, 1 failed. Blockcraft's Study retention test timed out after 60 seconds while waiting for navigation to finish. All Fivefold tests, both all-game viewport loops and the Fivefold Study retention test passed.
- `npx vitest run tests/games/blockcraft/light.test.ts tests/games/blockcraft/mesher.test.ts --maxWorkers=1`: 74 passed, including the three performance tests that failed in the concurrent full run.
- Final `npx vitest run`: 131 files and 2,819 tests passed; exit code 1 because Vitest reported one unhandled `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC error.
