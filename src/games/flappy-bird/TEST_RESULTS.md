# Local checkpoint test results

Base main: `375e250`. Branch: `feat/flappy-ball-run`. See [complete evidence and limitations](../../../docs/FLAPPY_BALL_RUN.md).

- `npm test`: 266 passed across 23 files (23 focused model tests across Flappy and Ball Run).
- `npm run build`: strict TypeScript, Vite and offline manifest passed (69 local files).
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright npx playwright test tests/games/flappy-bird tests/games/ball-run --project=chromium --workers=1 --output=/tmp/qcc-green-browser`: 17 passed in 1.2m; system Chromium 154, software WebGL, system FFmpeg.
- Both changed games passed offline at `/` and `/Qcc-games-/` on the final physics build. The compact 320px overlay CSS was then verified in the final focused run/build. All 13 games also passed offline before the final collision refinement.
- Original SVG validation and diff whitespace checks pass.

Exact browser/unit/build/seeded red-green/baseline outputs and offline JSON are in `docs/evidence/flappy-ball-run/`. Screenshots are in each game's `tests/games/<id>/evidence/`.

The broad suite has 147 passes and three failures also reproduced on unchanged main: Block Fill drag tests at lines 19 and 74 and Tower's 30-second tall-tower test at line 47. No unrelated code was changed. WebKit remains unavailable: the browser installer stopped at a prohibited FFmpeg download (HTTP 403 Domain forbidden); installed local Chromium/FFmpeg were used without bypassing network restrictions. No physical hardware testing is claimed. No external publication occurred.
