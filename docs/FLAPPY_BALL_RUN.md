# Flappy Bird and procedural Ball Run local checkpoint

Work is based on `375e2501dcd8241cdacb7b3b4f3af5eae2f84f41` in `grantcharlie1000-tech/Qcc-games-`, on local branch `feat/flappy-ball-run`. GitHub read-only PR search returned no open PRs; branch search and `git ls-remote` showed only main. A fetch confirmed remote main equals the saved checkout. The initial working tree was clean. No external push, PR, merge, release or deployment was performed. Parent coordinates independent Astra review; this thread spawned no agents.

## Result

Flappy Bird is a thirteenth lazy-loaded arcade game. Its original teal marsh swift and copper reed artwork is authored directly in Canvas and SVG. The shared shell supplies route, toolbar, best-score storage, status announcements, sound preferences, Study Mode, visibility pause and offline caching. Keyboard (Space/Up/W), mouse, native browser touch emulation and a semantic Flap button use the same action. Saved flights wait for explicit continuation. Restart clears the old flight and frame accumulator; disposal aborts handlers and cancels RAF. Action controls stay accessible in portrait and landscape; reduced motion removes decorative movement.

Ball Run now generates seeded varied block positions, sizes, sides and paired gates. The opening, ramp launches and cyan boost regions are clear. A centered sphere has at least 0.22m additional clearance through every generated obstacle section. A real steering controller crosses 2.5km across 64 seeds, including maximum base speed. Rendering and collisions consume the same block data. Version 3 saves include the generator version; existing version 1/2 runs retain their original hazard layout and progress. Restarts select the procedural layout.

Regression tests first reproduced Ball Run's missed lateral collision, NaN steering corruption and parity-only obstacles. Additional tests expose resized held input and diagonal reed corner contact. Exact swept sphere/circle tests cover tangent contact, rounded corner misses and zero motion. See the before-fix evidence in [evidence/flappy-ball-run](evidence/flappy-ball-run).

## Verification environment

Node 24.19.0; dependencies installed with the existing lockfile, with cache under `/tmp/qcc-npm-cache`. No package or lockfile changes. System Chromium uses software WebGL. Existing video tests use system `/usr/bin/ffmpeg` via `/tmp/qcc-playwright/ffmpeg-1013/ffmpeg-linux` symlink and `PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright`.

The combined Playwright FFmpeg/WebKit installer stopped on the FFmpeg download: HTTP 403 `Domain forbidden` from the browser distribution hosts. No policy bypass was attempted; installed local Chromium and FFmpeg were used. WebKit and physical touch/GPU hardware remain unverified.

## Review focus

Review deterministic model timing and restart, seed variation and fairness, circle/sphere collisions, legacy Ball Run snapshots, input lifetime across pause/Study/resize/disposal, action sizes at small viewports, and complete offline/catalog integration. Supporting source specs and skill usage are in each affected game's directory. Original twelve-game art, unrelated application behavior, deployment configuration, security/account settings and credentials are preserved.

## Final checks

- `npm test`: 23 files, **266 passed**. Includes 23 focused physics/generation/restore tests, 64 Ball Run seeds × 2.5km, 6,400 Flappy gate constraints, 100-gate pilots, frame-rate equivalence, exact corner/tangent contacts and malformed snapshots.
- `npm run build`: **passed**, including strict TypeScript and an offline manifest with 69 local files. Final build version `0696ed8f47bd` (compact small-screen overlay is the only change after the final physics offline run).
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright npx playwright test tests/games/flappy-bird tests/games/ball-run --project=chromium --workers=1 --output=/tmp/qcc-green-browser`: **17 passed**, 1.2 minutes. Chromium 154.0.8037.57. Actual keyboard/mouse/touch actions, score and state restoration, pause/Study, restart, renderer loss/fallback/disposal, procedural block contact, stable geometry allocation, controlled resize, DPR cap, 44px action buttons and viewport hits at 320×568, 390×844, 844×390 and 1366×768.
- `ARCADE_EVIDENCE_DIR=/tmp/qcc-offline-final npm run verify:offline`: **all 13 games passed at root and repository subpath**, with no external runtime requests, page errors or failed local assets. This run preceded the final collision refinement.
- `ARCADE_GAMES=flappy-bird,ball-run ARCADE_EVIDENCE_DIR=/tmp/qcc-offline-physics npm run verify:offline`: **both changed games passed at both paths on the final physics build**, including retained Study instances, offline actions, pause/save and restart. Its manifest version is `edaed86ff932`; the later compact overlay CSS is covered by the final browser checks and build.
- SVG validator: **2 passed**, 0 failures. `git diff --check`: passed.

The broad Chromium suite completed **147 passed / 3 failed**. Every failure also reproduced against unchanged base main in `/tmp/qcc-baseline`: `tests/games/block-fill/block-fill.spec.ts:19` (fast actual drag), `:74` (all twelve gardens via pointer), and `tests/games/tower/tower.spec.ts:47` (30-second tall-tower timeout). Their production files and tests were preserved. These are remaining pre-existing regression failures; the whole broad suite is not green. The baseline and broad outputs are included beside the focused passing output.

The resized-input regression was made independent of software-rendering frame rate using the controlled browser clock. It fails on unchanged main (movement 0.048m instead of >0.3m) and passes with the fix. No frame-rate claim for a physical device is made; renderer evidence is software WebGL with 7 draw calls and 3 geometries. Unit simulation remains fixed at 120Hz.

## Deliverables

- New game: `src/games/flappy-bird/{model.ts,index.ts,art.ts,style.css,SPEC.md,SKILL_USAGE.md,TEST_RESULTS.md}`; original cover `public/game-art/flappy-bird/cover.svg`.
- Ball Run: model, adapter, spec, skill usage, test results and deterministic/browser regressions in their existing directories.
- Reusable exact collision math: `src/core/collision.ts`. Catalog/types, catalog-driven shell count, offline verifier and count/Study/viewport integration tests support the thirteenth game. No dependency, lockfile or deployment configuration changes.
- New game screenshots: `tests/games/flappy-bird/evidence/{320x568,390x844,844x390,1366x768,gameplay}.png`.
- Ball screenshots: `tests/games/ball-run/evidence/{390x844,844x390,1366x768,procedural-restart}.png`.
- Library captures, offline phone captures, JSON results, before-fix reproductions and exact test outputs: `docs/evidence/flappy-ball-run/`.

The checkpoint is local and awaits the parent's publication decision. Independent Astra audit is recorded in the subsequent audit handoff. No existing Study functionality was expanded.
