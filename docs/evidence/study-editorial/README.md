# Local study editorial checkpoint

Implemented only in `/tmp/qcc-study-editorial`, branch `feat/study-editorial`, based on merged main `e78dbff0133a4e3b4158fc5c8b194962bdbdc3a2`. No publication or external integration.

- The 20 existing topic IDs, article titles, three section headings, worked examples, checks and diagrams remain intact. `topics.ts`, `session.ts` and `src/main.ts` are unchanged.
- `editorial.ts` adds 137–151 original, topic-specific words to each article. Counts are in `added-word-counts.json`.
- Four original SVG portraits accompany visibly labelled “Fictional contributor” bylines. Names and portraits do not represent real people or credentials.
- Three article structures vary opening composition, diagram placement and reading treatment. All retain five second-level headings and the original content sequence.
- Games is a visible normal navigation link with at least a 44px hit target. Its click handler prevents hash navigation and calls the existing retained-game return callback.
- The advertisement placeholder exists only within articles and reads “Advertisement placeholder / Ads are disabled.” No scripts, frames, tracking, third-party requests or consent flow were added.
- Typography uses local system fonts. Portraits and diagrams are eager raw SVG imports; all chapter changes remain request-free.

Screenshots `picker-{320,768,1366}.png` and `article-{320,768,1366}.png` are actual local Chromium captures. The article captures show chapter 20 after iterating through all twenty topics. Mobile, tablet and desktop screenshots were visually inspected.

## Verification

Final commands and results are recorded in the accompanying logs. Browser coverage includes all retained game instances, native reading keys, pointer/touch interruptions, manual pause, storage failure, focus restoration, three responsive editorial sizes and zero requests across all twenty chapter changes. Existing return tests changed only their expected accessible role/name from the former button to the Games link.

The full 13-game production offline run covered both `/` and `/Qcc-games-/` before the final visible-prose reading-time correction. A rebuilt final bundle is checked again offline for Color Blocks and Flappy Bird at both paths, including all twenty chapters and retained-game return. Separate result files identify the builds. Offline measurements use software WebGL in local Chromium, not physical hardware or public production.

## Preserved contaminated run

The initial broad browser run had 71 passes and one failed `viewport.spec.ts:58` native PageDown assertion. Its trace records an initial document GET at `2026-10-20T02:04:55.915Z` and a second GET at `02:04:59.061Z`, Vite reconnect messages, and replacement of the active reading page with the game during scroll polling. I edited `view.ts` during this run to correct the reading estimate; the dev-server reload contaminated that result. PageDown was recorded as not prevented. No assertion, timeout, skip or retry was relaxed.

Original failure evidence remains at `/tmp/qcc-study-editorial-failure/{trace.zip,error-context.md,test-failed-1.png,browser-contaminated.txt}`. Source was then frozen for the final configured two-worker run. WebKit is unavailable locally; the previously denied installer and public targets were not retried. This checkpoint provides local Chromium evidence only. Independent Astra review is coordinated by the parent after the commit.

Final results: **266 unit tests passed; 72/72 Chromium browser cases passed with the configured two workers; TypeScript and production build passed; 24/24 SVGs validated and parsed as XML.** Final offline pack is `a32ee8f2f48e` (69 files). Full13 and final2 offline runs both passed at root and repository subpath, with all twenty chapters, no external requests and no chapter-change requests.

Commands:

```sh
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright ARCADE_URL=http://127.0.0.1:4178 npx playwright test tests/e2e/study-editorial.spec.ts tests/e2e/study.spec.ts tests/e2e/viewport.spec.ts tests/games/flappy-bird/play.spec.ts tests/games/ball-run/play.spec.ts tests/games/water-sort/correction.spec.ts tests/games/color-blocks/correction.spec.ts --project=chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright ARCADE_EVIDENCE_DIR=/tmp/qcc-study-editorial-offline npm run verify:offline
PLAYWRIGHT_BROWSERS_PATH=/tmp/qcc-playwright ARCADE_GAMES=color-blocks,flappy-bird ARCADE_EVIDENCE_DIR=/tmp/qcc-study-editorial-offline-final npm run verify:offline
bash .agents/skills/svg-skill/scripts/validate.sh src/study/portraits src/study/diagrams
```

No local implementation blockers remain. WebKit and physical/public production testing are outside the local evidence. Publication remains unperformed; the parent owns independent review and further approval.
