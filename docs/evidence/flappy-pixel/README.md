# Flappy pixel art

Scenery and both birds use authored pixel grids and fixed palettes in `scenery.ts` and `pixel-sprites.ts`. No generated backdrop images are loaded.

- `desktop-marsh.png`: full viewport marsh, 1280 x 800.
- `desktop-winter.png`: full viewport winter village, 1280 x 800.
- `phone-winter.png`: winter village and overlaid glass controls, 390 x 844.
- `gameplay-winter.png`: scored flight captured by the browser test.
- `wingbeat-poses.png`: production sprite frames displayed in a temporary inspection board. Each input plays a downstroke and recovery, then holds the glide pose after 250 ms.

Local verification: 18 Chromium browser checks, 9 model tests, and `npm run build` passed. Browser checks cover both themes, desktop and phone layouts, native touch, keyboard and mouse input, pause, restoration, scoring, and wingbeat recovery. The independent source review found no blockers; its pixel alignment finding was fixed.
