# Verification

- `npx tsc --noEmit`: passed.
- `npm run build`: passed; Vite reported the existing large-chunk warning.
- `npx vitest run tests/games/slipline/model.test.ts`: 4 passed, plus a separately run seed-wrap regression (1 passed). The model checks deterministic generation, 60-level greedy solvability and density, bounds and orthogonality, self-ray exclusion, lives, scoring, hint, snapshot rejection and a 150 ms largest-board budget.
- `npx vitest run tests/games/slipline/model.test.ts tests/accounts/server.test.ts tests/leaderboard/server.test.ts`: 29 passed, including real PostgreSQL account sync and leaderboard submission.
- Chromium: six game scenarios passed, plus a separate keyboard-selection test. WebKit: six game scenarios passed. The Study retention test for Slipline passed independently. Evidence is in `tests/games/slipline/evidence/`.
- The full unit run passed all 2,810 collected tests but exited with an unhandled Vitest worker RPC timeout. A second run with `--maxWorkers=2` passed 2,814 tests but exited with the same unhandled `onTaskUpdate` timeout. The first shared browser run had 35 passes and five failures during overlapping browser runs and Vite reloads; all five passed when rerun in isolation (5 passed).

Limits: no physical touch device or screen reader was tested. Reduced-motion clear feedback is immediate. The browser suite does not exhaustively cover every malformed snapshot, level size, or viewport named in the brief.

Review rerun (27 Oct 2026, after thinning strokes/heads on small boards and hiding the mouse focus ring): `npm run build` passed; `npx vitest run` 131 files / 2,815 tests passed, with the same unhandled `onTaskUpdate` worker timeout, which also reproduces on unmodified `main` under the same machine load (load average ~34); Chromium `tests/games/slipline`, `tests/e2e/study.spec.ts` and `tests/e2e/viewport.spec.ts`: 47 passed with one worker; `npm run verify:offline`: 19 games passed at root and subpath.
