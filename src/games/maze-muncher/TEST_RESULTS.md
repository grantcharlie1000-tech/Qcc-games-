# Test results

- `npx tsc --noEmit`: pass.
- `npx vitest run`: 100 files, 2395 tests pass, including 13 Maze Muncher model tests covering maze connectivity and dead ends, buffered turns, walls, tunnel wrap, fright and the 200/400/800/1600 combo, eyes returning home, lives and game over, level clear, the extra life, each chaser's target, determinism with exact restore, and invalid snapshots.
- Chromium 140 (Playwright, `/opt/pw-browsers/chromium-1194`) against `vite` dev: `tests/games/maze-muncher/play.spec.ts` (2 pass), `tests/e2e/shell.spec.ts` (6 pass, 17 cards), `tests/e2e/viewport.spec.ts` (both orientations pass with Maze Muncher included) and the Maze Muncher Study retention test pass.
- `npm run build`: pass (offline pack generated).
- Not run: WebKit, `verify:offline` and `verify:update`.
- Evidence: `tests/games/maze-muncher/evidence/desktop.png` and `phone.png`.
