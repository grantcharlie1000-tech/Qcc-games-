# Blockcraft test results

Branch `feat/blockcraft` from main `fbac0a5`. Chromium 141.0.7390.37 headless (`/opt/pw-browsers`) with software WebGL (SwiftShader), on a 4-core cloud container. No physical device or WebKit was tested.

- `npx tsc --noEmit`: passes.
- `npx vitest run`: 293 passed in 25 files. The 19 Blockcraft model tests cover seeded noise; deterministic chunks; cross-border trees; dry spawn; generation and meshing speed (≈1.3 ms and ≈1.1 ms per chunk under Vitest); face culling across chunks; greedy merging (a flat chunk top is one quad; mixed tiles never merge); lowered water surfaces; the shared quad index; edits surviving unload; edit validation and limits; landing and jump height; walls and ceilings; un-embedding; swimming; and the raycast hit and face normal.
- `npx playwright test tests/games/blockcraft --project=chromium --repeat-each=2`: 14 of 14 passed. The specs cover:
  - **Desktop:** real pointer-lock mouse look, mining and placing with mouse buttons, digit and wheel selection, walking, and a jump from a tapped Space.
  - **Study and save:** Escape releases the mouse and opens Study with a frozen snapshot; pause stops input; reload restores position, counters, slot, view and edits.
  - **Restart and exit:** restart makes a fresh world; leaving forces WebGL context loss.
  - **Touch:** CDP touch drives drag-to-look, tap to mine, long-press to place, the movement stick and ▲ jump.
  - **Robustness:** malformed saves are ignored, and terrain still streams when the `Worker` constructor throws or the worker script fails to load.
- Full Chromium suite (`npx playwright test --project=chromium`): 159 passed, 4 failed. Blockcraft's own failure was a test that read the ground height mid-fall; it now waits for `data-grounded` and passes, as above. The other three fail independently of this change:
  - **Flappy Bird layout** (`play.spec.ts:60`): fails at all four sizes on unchanged main `fbac0a5` too.
  - **Color Blocks touch evidence** (`correction.spec.ts:60`): `video.saveAs` finds no `.webm`. The environment ships Playwright's ffmpeg 1011 while the test wants 1013, and the substituted binary records no video.
  - **Block Fill touch trace** (`block-fill.spec.ts:53`): passed 2 of 2 on re-run, so it was load-sensitive under parallel workers.
  The shell tests now expect 14 games and pass, as do the viewport and Study tests that include Blockcraft.
- `npm run build`: passes; the offline pack has 86 files, including the hashed worker.
- `ARCADE_GAMES=blockcraft node scripts/verify-offline.mjs`: passes at `/` and `/Qcc-games-/`. It downloads the pack, disables the network, reloads, sees 14 cards, walks, switches to Study and back with an unchanged snapshot, then pauses, saves and restarts. No external requests, failed assets or page errors.

Performance and comparison with upstream are in [docs/BLOCKCRAFT.md](../../../docs/BLOCKCRAFT.md). Screenshots: `tests/games/blockcraft/evidence/chromium.png` (1366×768) and `touch-390.png` (390×844 touch).
