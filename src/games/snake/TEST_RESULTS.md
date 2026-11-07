# Snake test results (v3 grid rework)

Commands run (dev server on port 5199; system Playwright Chromium at /opt/pw-browsers/chromium):

- `npx tsc --noEmit`: pass.
- `npx vitest run tests/games/snake`: **19 passed** (model 14, presentation 5).
- `npx vitest run` (whole repository): **221 files / 4380 tests passed**.
- `CHROMIUM_PATH=/opt/pw-browsers/chromium ARCADE_URL=http://127.0.0.1:5199 npx playwright test tests/games/snake tests/e2e/viewport.spec.ts tests/e2e/study.spec.ts tests/e2e/festive.spec.ts tests/e2e/play-surface.spec.ts tests/e2e/live-glass.spec.ts tests/e2e/webgl-glass-lens.spec.ts tests/e2e/sheet-navigation.spec.ts --project=chromium --trace off`:
  - **99 passed, 1 skipped, 1 failed**.
  - The failure was `study.spec.ts` › minesweeper, which timed out under parallel load. Run alone afterwards it passed 2/2 (`--repeat-each 2`).
- Frame cost: 1 s of fake-clock play took about 350 ms of wall time, both before and after the rework. Real-time rAF measured 63 fps headless.

Evidence: `tests/games/snake/evidence/chromium.png` (mouth opening as the head nears an apple).

Limitations:
- Only Chromium was exercised; WebKit was not run.
- Google's own Snake sources could not be fetched during research, so "Google-like" behaviour follows widely known traits rather than measured values.
