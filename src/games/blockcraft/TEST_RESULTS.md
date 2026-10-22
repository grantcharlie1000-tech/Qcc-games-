# Blockcraft test results

Branch `feat/blockcraft` after the final review fixes and the merge of `main` (Neon Coil, Globle, leaderboards, the Study
redesign), so the arcade has 16 games. Chromium 141.0.7390.37 headless with software WebGL (SwiftShader) and Playwright
WebKit (the Desktop Safari project, device scale 2), on a 4-core cloud container that other browser runs shared.
No physical device was tested.

## Whole repository, as CI runs it

- `npx tsc --noEmit -p .`: passes. `npx vitest run`: 2374 tests in 97 files pass.
- `npx playwright test` (every spec, Chromium and WebKit, 2 workers, the Vite dev server CI uses): 587 passed, 20 skipped,
  3 failed in 30.8 minutes. Every Blockcraft test passes: 35 per browser, of which the two CDP touch tests
  skip on WebKit. The 3
  failures are in other games and fail the same way on unmodified `main` (`a6105cf`) in this container: Flappy Bird's
  "original scene and controls fit" (a toolbar control off screen; on `main` it failed at 320, 390 and 844 wide), Color
  Blocks' touch evidence (`video.saveAs` finds no recording: the container has Playwright's ffmpeg 1011, the tests want
  1013) and Pool's WebKit verifier-readiness check (power 74 % instead of 75 %).
- `npm run build` passes (offline pack 106 files). `npm run verify:update` passes.
  `npm run verify:offline` passes: all 16 games download, play offline and switch to Study and back at `/` and
  `/Qcc-games-/` (32 of 32), with no page errors, external requests or failed assets.

## Blockcraft in detail (before the merge of `main`)

- `npx tsc --noEmit -p .`: passes.
- `npx vitest run`: 2131 tests in 86 files pass. The Blockcraft suites (`tests/games/blockcraft/*.test.ts`, 1857 tests in
  62 files) cover every feature area with DOM-free fakes (`helpers/fake-game.ts`): terrain, light, meshing, renderer helpers,
  the atlas and its mipmaps, entities and every mob family, player and controls, survival, inventory and screens, crafting
  and smelting, interaction, world ticks, weather, sound, advancements and their toasts, the HUD, block and item art, and the
  engine's saves (edit segments and older flat lists, the entity store of unloaded chunks, a farm of more than 200 animals
  saved whole, the world border, the save kept without WebGL 2).
- Browser specs, run one file at a time (`tests/games/blockcraft/*.spec.ts`, 11 files):
  - `play`: boot, mouse look, mining and placing, inventory, mode switch, Study pause and one-click resume, reload restore
    and WebGL disposal; survival mining time; malformed saves; terrain when a worker throws or its script is missing (404);
    the save kept without WebGL 2; the shell's Keep playing resuming at once and Restart asking before it replaces the
    world, also while a world is still loading (844x390 touch); a desktop screenshot.
  - `controls`: keyboard and mouse (walk, sprint, jump, creative flight, hotbar, wheel, F1/F3, text fields), drag-to-look
    without pointer lock, CDP touch (stick, look, jump, sneak, hold ring, layout) and a mocked gamepad.
  - `hud`: layout and state rendering at 1366x768, 390x844 and 320x568, the action bar, menus, options, the death and
    lost-graphics screens.
  - `interaction`: mining with drops, placing, doors, buckets and the crafting table.
  - `screens`, `screens-look`: crafting, smelting, chests, armour, the creative picker, and every screen's vanilla GUI
    geometry and pixels at 1366, 390, a landscape phone and touch.
  - `entities`, `passive-look`, `hostile-look`, `render-sky`, `weather`: the entity draw-call budget, mob models, sky, fog,
    hand, overlays, rain, snow and lightning.
- Chromium: all 11 files pass (play 8, controls 4, hud 4, interaction 1, screens 5, screens-look 5, entities 1, render-sky 2,
  weather 2, passive-look 1, hostile-look 1). `interaction` passed 8 of 8 repeats once its right click became a short press
  (a 120 ms press held across a slow frame could last the 4-tick repeat delay and use twice; it did so at `63f0fc1` too).
  `tests/e2e/study.spec.ts`, `viewport.spec.ts` and `shell.spec.ts`: 42 passed.
- WebKit: all 11 files pass or skip with a platform reason (play 8, controls 3 + 1 skipped, hud 4, interaction 1, screens
  4 + 1 skipped, screens-look 5, entities 1, render-sky 2, weather 2, passive-look 1, hostile-look 1), and
  `tests/e2e/study.spec.ts` passes 30 of 30. `render-sky` passed 12 of 12 fresh runs once its colour checks read the drawn
  frame back in the same task (a canvas screenshot could catch WebKit after it presented and cleared the frame: black, in 3
  of 10 earlier runs). Headless Playwright WebKit never grants pointer lock (every
  `requestPointerLock()` fires `pointerlockerror`; Safari itself supports it), so the specs drive the game's drag-to-look
  and click/hold fallback there, the path a player without the lock takes. The two CDP touch tests skip outside Chromium
  (native CDP touch is Chromium-only, as in the other games' specs). Committed evidence pictures are written by Chromium
  only; other browsers write theirs to the test output folder.
- `npm run build`: passes; the Blockcraft chunk is 841 kB (308 kB gzip), its worker 64 kB, and the offline pack has 86
  files. `npm run verify:update`: passes. `npm run verify:offline`: all 14 games pass offline at `/` and `/Qcc-games-/` (its
  Blockcraft step answers the Restart confirmation and lets go of the mouse that one-click resume captures). In earlier
  runs, one of five Blockcraft-only runs reported a failed local asset whose URL the script does not print; the full runs
  were clean.

Performance and the comparison with upstream are in [docs/BLOCKCRAFT.md](../../../docs/BLOCKCRAFT.md), measured with
`scripts/blockcraft-perf.mjs`. Screenshots:
`tests/games/blockcraft/evidence/` (Chromium).
