# Actual verification results

Executed 2026-10-19 in `/workspace/Qcc-games-/.worktrees/fruit-merge`, branch `game/fruit-merge`. Isolated Vite was started with `npm run dev -- --port 4181`; all browser actions used `http://127.0.0.1:4181/#/game/fruit-merge`, never the parent's shared server.

| Command | Actual result |
|---|---|
| `npm run check` | PASS, tsc --noEmit, exit 0; final run after documentation at 08:45 UTC |
| `npx vitest run tests/games/fruit-merge` | PASS, 1 file, 16 tests, 101ms test time, exit 0 at 08:43:37 UTC |
| `npm test` | PASS, complete isolated-worktree suite: 2 files, 20 tests (16 game + 4 shared storage), exit 0 at 08:43:50 UTC |
| `ARCADE_URL=http://127.0.0.1:4181 npx playwright test tests/games/fruit-merge --project=chromium` | PASS, 4 tests, 35.5s, exit 0; final run completed after 08:43:50 UTC |
| `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art/fruit-merge/cover.svg` | PASS, 1 SVG, 0 failures, exit 0 |

The first test-first unit run failed because the engine module did not exist yet. The initial browser run failed because the game module did not exist yet. A later browser run exposed a test focus issue: pressing Space while the shell's pause button remained focused activated that native button. The test now focuses the basket before testing paused game input, waits for animation frames, dispatches the normal pagehide save event, and compares the complete unchanged snapshot. Final runs above have no failures. Playwright emitted the environment's `NO_COLOR`/`FORCE_COLOR` warning; no browser page errors were recorded.

Browser executable: `/usr/bin/chromium`, actual version `Chromium 154.0.8037.57` (Debian GNU/Linux 13). Playwright's Desktop Chrome device preset overrides the user-agent string reported in the performance JSON; the executable version above comes from `chromium --version`.

## Covered behaviors

- Clamped drop aim, drop cooldown, balanced seeded queue, four-tier spawn limit, blocked spawn fairness, 90-body budget without consuming fruit.
- Three-way collision deduplication, equal-tier-only merges, final-tier behavior, repeated active contact deduplication, 9-point successive combo and 15-point actual chain merge.
- Real numerical Matter integration settling against the floor and staying within walls; restored moving simulation continues with equivalent bodies/positions/score/queue.
- Falling/spawning protection, newborn settling protection, full settled grace before loss, danger reset below the line, no drops after loss.
- Snapshot velocities, score, timers, combo, seed and previews; atomic rejection of malformed values, duplicate IDs, NaN, invalid queue and negative score.
- Restart from a lost state, dynamic-body cleanup on disposal.
- Actual mouse aiming (serialized first x≈108), pointer click drops, arrow and Space input, actual touchscreen taps, a scored merge from real drops, shared rules dialog.
- Pause halts input and simulation; restart while paused; navigation saves and restores; three repeated exit/re-entry cycles; invalid host save ignored; visible loss from a supported restored stack, restart score reset, retained best.
- No horizontal document overflow at 390, 768 and 1366 CSS pixels. All three sizes captured and the phone screenshot visually inspected. Original fruit faces and board text remained legible; surrounding text contrast was corrected following the initial screenshot.

## Evidence

- `tests/games/fruit-merge/evidence/chromium.png`: actual 390×844 viewport, full-page screenshot after eight real touch drops and resulting merges.
- `tests/games/fruit-merge/evidence/chromium-768.png`: 768×1024 viewport.
- `tests/games/fruit-merge/evidence/chromium-1366.png`: 1366×768 viewport.
- `tests/games/fruit-merge/evidence/performance-chromium.json`: 60 consecutive requestAnimationFrame intervals on the live phone-sized board. Mean 54.72ms, p95 149.9ms, max 250.1ms in this run. This shared Linux execution container was under concurrent test load; these are observed scheduling intervals, not a guarantee of 60fps and not a physical Chromebook benchmark. Physics uses bounded fixed steps, so large scheduling gaps cannot feed a giant delta to Matter.

## Limits and known defects

No known functional defect remains in the exercised flows. WebKit was not executed: this environment has system Chromium and browser downloads are blocked by policy. No claim of Safari/touch-device hardware testing. Offline packaging, final global cover art, production build/base-path deployment and twelve-game integration are parent-owned checks. This commit contains the original improved local cover; parent requested a final replacement after integration. Publisher rule-page access was denied, documented in SPEC.md; this is an explicitly specified local rules variant.
