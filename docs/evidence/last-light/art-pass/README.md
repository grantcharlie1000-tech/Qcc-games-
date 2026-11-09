# Last Light art pass evidence

Production base re-fetched and verified as `730f397963303f08f1485f5da8b6869638a495af` on 9 November 2026. Work is on `codex/last-light-art`.

- `before-desktop.png`: untouched production renderer, same viewport and starting stage.
- `progress-desktop.png`: intermediate material/background pass, before removing the duplicate skyline.
- `after-world-1.png` … `after-world-5.png`: final Old Quarter, Mossworks, Clockworks, Frostline and Afterglow at 1440×900.
- `after-phone.png`: 390×844 with touch controls.
- `phone-dialogue.png`: live optional NPC conversation on touch layout.
- `gameplay.webm`: live keyboard-controlled fall, checkpoint return, jump and dash.
- `death-poses.png`: six sampled frames for all nine causes. Actual motion uses deterministic elapsed time and pauses with play.
- `browser-errors.json`: zero errors during the five-world/phone capture.

Verified:

- `npm run build`: passed TypeScript, Vite production build, host preparation and service-worker checks. Vite reports the repository's existing large-chunk advisory.
- `npm test -- tests/games/last-light`: all 289 existing model/campaign assertions passed across 13 files, including all 40 route reachability checks.
- After making the fall reaction visible before the lower world edge and adding its regression check: model/death tests passed, 31/31.
- `npx playwright test tests/games/last-light --project=chromium --workers=1 --output=test-results/last-light-final`: 42/42 passed. Covers responsive controls, real fall/retry, pause, nine death causes, all districts, camera/resizing fog anchoring, optional conversations/petting, exits, audio and saves.
- `git diff --check`: passed.

The fog test allows one RGB code value for Canvas gradient rounding between different target sizes, while requiring exact equality above the boundary and a consistent world-space fog sample below it.
