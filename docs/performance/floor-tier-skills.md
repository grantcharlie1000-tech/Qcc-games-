# Floor-tier skill record

The scheduler cannot attest the model id. Each surface group below names the worker mode that was requested: Grok 4.7 fast mode. Five workers were dispatched. The apps worker finished its collectors. The others stalled and were not resumed. The parent process then finished the remaining collectors and the corn-clicker, drift-club, and quadfall floor pictures.

Predicted fps is the minimum of the two floor layouts from the shipped collectors (`tests/perf/surfaces.test.ts`). A site-wide number is not the result.

| Group | Worker | Surfaces | Minimum predicted fps |
| --- | --- | --- | --- |
| shell-glass | Grok 4.7 fast mode | home, festive, liquid-glass | 89.6 (home, 1280×720) |
| apps | Grok 4.7 fast mode | movies, tv, study, accounts, leaderboards, chat, social, predictions, election, santa, downloads | 252.9 (movies, 1280×720) |
| 2d-dom | Grok 4.7 fast mode | fruit-merge, water-sort, color-blocks, tower, snake, neon-coil, minesweeper, solitaire, block-fill, color-connect, pool, animal-stack, flappy-bird, maze-muncher, corn-clicker, slipline, quadfall, fivefold, claimline, drift-club, chess | 71.5 (quadfall, 1280×720) |
| three | Grok 4.7 fast mode | ball-run, globle, crossy-road, quad-clash, femboy-obby | 120.3 (femboy-obby, 1280×720) |
| heavy-sim | Grok 4.7 fast mode | blockcraft, breachline, last-light, iron-meridian | 188.5 (blockcraft, 1280×720) |

Display stays at 60 Hz. Fruit Merge `STEP` stays `1000/60`. Drift Club `FPS` stays 60. Quad Clash potato pacing stays a cheaper picture at `FLOOR_DISPLAY_HZ` 60, not a 30 Hz display cap.

## Skills

Each `.agents/skills/**/SKILL.md` is listed once.

- actions-and-utilities: Not applicable. The app does not import Phaser.
- animate: Applied to festive. The overlay stays six snowflakes, and reduced motion still disables decorative motion.
- animations: Not applicable. The app does not import Phaser.
- audio-and-sound: Not applicable. The app does not import Phaser.
- brainstorming: Applied to quadfall, drift-club, and corn-clicker. The scored frame is the in-play board, court, or farm backdrop, not the idle menu.
- cameras: Not applicable. The app does not import Phaser.
- curves-and-paths: Not applicable. The app does not import Phaser.
- data-manager: Not applicable. The app does not import Phaser.
- diagnosing-superpowers: Not applicable. This task did not diagnose a superpowers session.
- dispatching-parallel-agents: Applied to the five groups in the table. Stalled workers were not resumed; the parent finished corn-clicker, drift-club, and quadfall.
- events-system: Not applicable. The app does not import Phaser.
- executing-plans: Applied to the floor-tier plan. Collectors call the shipped update or render, then `predictFps`.
- filters-and-postfx: Not applicable. The app does not import Phaser.
- finishing-a-development-branch: Not applicable. No branch was integrated.
- game-development: Applied to drift-club and corn-clicker by routing the floor picture through web-games and 2d-games. This was not a Phaser project setup.
- game-development/2d-games: Applied to drift-club, corn-clicker, quadfall, fruit-merge, last-light, color-blocks, and iron-meridian. Floor pictures batch scenery into a few fills. Drift Club went from 634 draws to 52. Corn Clicker's desktop backdrop went from 1493 draws to 7. Quadfall's stacked board is 211 draws and 71.5 fps. Color Blocks scores a legal 50-block in-play board through the shipped restore (110.8 fps at 1280×720, 127.5 at 390×844). Iron Meridian's shipped map paint draws the fitted province bitmap and the selection marker in 5 draws (425.2 fps at 1280×720, 639.9 at 390×844). Fixed sim steps were not changed.
- game-development/3d-games: Applied to ball-run, globle, crossy-road, quad-clash, and femboy-obby. Floor quality scales triangles and effects. The collectors still call the shipped render. The slowest of these is femboy-obby at 120.3 fps.
- game-development/game-art: Applied to last-light and corn-clicker. The floor picture draws the real visible actors or the same sky, hills, and field in bands. It is a quality scale, not a new asset pipeline.
- game-development/game-audio: Not applicable. Sound is not on the scored paint path.
- game-development/game-design: Not applicable. Win, lose, scoring, and controls were not changed.
- game-development/mobile-games: Applied to the 390×844 layout of every surface. Corn Clicker still hides the farm column below 900px, which is the shipped phone layout.
- game-development/multiplayer: Not applicable. No networking or sync path was changed.
- game-development/pc-games: Not applicable. This is not a desktop store build.
- game-development/vr-ar: Not applicable. There is no headset path.
- game-development/web-games: Applied to drift-club, corn-clicker, and iron-meridian. The 16.67 ms budget is met by fewer draws and less stacked fill, at a displayed 60 Hz, with no live frame sample. Iron Meridian sizes the map buffer with the floor pixel cap.
- game-object-components: Not applicable. The app does not import Phaser.
- game-setup-and-config: Not applicable. The app does not import Phaser.
- geometry-and-math: Not applicable. The app does not import Phaser.
- graphics-and-shapes: Not applicable. The app does not import Phaser.
- groups-and-containers: Not applicable. The app does not import Phaser.
- input-keyboard-mouse-touch: Not applicable. The app does not import Phaser.
- loading-assets: Not applicable. The app does not import Phaser.
- particles: Not applicable. The app does not import Phaser.
- physics-arcade: Not applicable. The app does not import Phaser.
- physics-matter: Not applicable. The app does not import Phaser.
- pick-ui-library: Not applicable. No UI library was added.
- receiving-code-review: Not applicable. No review notes were waiting.
- reclaim-code-entropy: Applied to drift-club `harbourFloor` and the corn-clicker scene bands. They reuse the existing projector, palette, and court data.
- render-textures: Not applicable. The app does not import Phaser.
- requesting-code-review: Not applicable. A review was not requested.
- scale-and-responsive: Not applicable. The app does not import Phaser. Both floor CSS sizes are measured directly.
- scenes: Not applicable. The app does not import Phaser.
- sprites-and-images: Not applicable. The app does not import Phaser.
- subagent-driven-development: Applied to shell-glass, 2d-dom, three, heavy-sim, and apps, each as a Grok 4.7 fast mode worker. The parent wrote the collectors those workers did not finish.
- svg-skill: Not applicable. No new SVG was authored. Slipline keeps its existing board.
- systematic-debugging: Applied to corn-clicker and drift-club. The desktop corn frame was a one-time 1493-rect backdrop bake. Drift Club's 634 draws were the harbour and plank board. The phone corn frame had already skipped that bake.
- test-driven-development: Applied to `tests/perf/surfaces.test.ts` and `tests/perf/predicted-fps.test.ts`. The tests import the shipped predictor and collectors.
- text-and-bitmaptext: Not applicable. The app does not import Phaser.
- tilemaps: Not applicable. The app does not import Phaser.
- time-and-timers: Not applicable. The app does not import Phaser. Display stays at 60 Hz.
- tweens: Not applicable. The app does not import Phaser.
- using-git-worktrees: Not applicable. The work was edited in the current workspace.
- using-superpowers: Applied to this record. Every `.agents/skills/**/SKILL.md` is named once above.
- v3-to-v4-migration: Not applicable. The app does not import Phaser.
- v4-new-features: Not applicable. The app does not import Phaser.
- verification-before-completion: Applied to the predicted-fps vitest gate. A browser frame sample is not the evidence.
- writing-plans: Not applicable. The goal plan already existed and was followed.
- writing-skills: Not applicable. No skill file was edited.
