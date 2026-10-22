# Test results

- `npx tsc --noEmit`: pass.
- `npx vitest run`: 106 files, 2,458 tests pass. The Corn Clicker part is 36 tests across `model.test.ts` and `pacing.test.ts`:
  - big numbers and formatting
  - bulk and Max purchases
  - no negative balances
  - gain accuracy
  - upgrade unlocks
  - golden stacking, refresh and expiry
  - tick-size independence
  - offline rate and cap
  - no repeated offline reward
  - clock moved backwards, and forward-back-forward
  - seed maths, unclaimed-only awards and kernel/seed spending
  - Replant keep/reset
  - save round trip, repair, v1 migration and export tampering
  - garden growth, mutation and harvest locked at planting
  - pests
  - achievements
  - pacing for active, idle, garden-farming and second-run bots
- Chromium (Playwright, `/opt/pw-browsers/chromium-1194`) against `vite` dev:
  - `tests/games/corn-clicker/play.spec.ts`: 5 pass. They cover fresh start with mouse and keyboard (once per press, held keys ignored), first producer, upgrade tooltip and purchase, bulk prices, and time away paying once. They also cover single-tab ownership and takeover; phone touch with tabs, tap-to-explain upgrades and a golden cob; garden by tap and by drag, ripening and harvest, Replant and a permanent upgrade; and export/import, confirmed Restart, damaged-save backup recovery and manual backup restore.
  - The Corn Clicker cases of `tests/e2e/study.spec.ts`, `viewport.spec.ts` and `shell.spec.ts` (18 cards) pass.
  - `viewport.spec.ts › Study restores normal reading scroll…` fails the same way before this change: it looks for an old `#/game/pool` link.
- `npm run build`: pass.
- An independent review found no critical issues. Its important findings are fixed:
  - an unreadable save is kept as a backup;
  - takeover always continues from storage, and revisions only rise;
  - nothing is collectable while paused, and the game no longer covers the shell's pause overlay;
  - garden harvest returns are fixed at planting.
  
  The minor findings are also addressed: the gain cache, short pauses frozen, non-owner tabs not writing, repeated clock jumps, an inert background behind modals, and the constants.
- Not run: WebKit, `verify:offline` and `verify:update`.
- Evidence: `tests/games/corn-clicker/evidence/*.png`.
