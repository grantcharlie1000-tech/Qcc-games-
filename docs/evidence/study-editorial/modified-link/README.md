# Games modified-link review correction

Review of checkpoint `43c8a319948a04af07d5711ce43b0fda759a41a7` found one minor issue: the delegated Games handler cancelled modified clicks and returned the current tab to the retained game.

The only product change requires primary button 0 and no Control, Meta, Shift or Alt before calling `preventDefault()` and the existing `onReturn()`. All modified clicks remain native. Ordinary primary click and keyboard Enter still use the retained-game lifecycle.

The new browser regression uses trusted Playwright mouse clicks with each modifier. A window-level bubble observer reads `defaultPrevented` after the Study handler without preventing or replacing the browser action. It checks that the current tab remains in Study and retains the same game instance, then checks ordinary click return. Any browser-created pages are closed as test cleanup; the test does not require a particular tab/window/download choice. Existing viewport tests retain native Enter coverage.

Before the fix, `red.txt` records the expected failure: `isTrusted=true`, `defaultPrevented=true` and the current document returned to `game-viewport`. Original trace, screenshot and error context remain at `/tmp/qcc-study-editorial-modified-failure/`. After the fix, `green.txt` records the focused test passing. Source was frozen for both runs and the final full run. No existing assertions, timeouts, skips or retries changed.

The follow-up build uses offline pack `0499990a7779` (69 files). The accompanying final logs/results supersede the previous checkpoint's final bundle evidence for this small handler correction. No publication or external settings/integration was performed.

Final frozen-source verification: **73/73 Chromium browser cases passed with the configured two workers; 266/266 units passed; TypeScript and production build passed.** Offline Color Blocks + Flappy Bird, all twenty chapters and retained-game return passed at `/` and `/Qcc-games-/`, with no chapter-change or external requests. The browser evidence is local Chromium only; unavailable WebKit/public targets and denied installers were not retried.

Commands:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright ARCADE_URL=http://127.0.0.1:4178 npx playwright test tests/e2e/study-editorial.spec.ts --grep 'modified Games clicks' --project=chromium
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright ARCADE_URL=http://127.0.0.1:4178 npx playwright test tests/e2e/study-editorial.spec.ts tests/e2e/study.spec.ts tests/e2e/viewport.spec.ts tests/games/flappy-bird/play.spec.ts tests/games/ball-run/play.spec.ts tests/games/water-sort/correction.spec.ts tests/games/color-blocks/correction.spec.ts --project=chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright ARCADE_GAMES=color-blocks,flappy-bird ARCADE_EVIDENCE_DIR=/tmp/qcc-study-editorial-modified-offline npm run verify:offline
```

No further product edits follow this verified correction. The parent coordinates exact follow-up review and publication decisions.
