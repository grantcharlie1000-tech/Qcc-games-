# Iron Meridian prototype verification

Historical prototype checkpoint. Current native decompilation, port and verification results are in [NATIVE_VERIFICATION.md](../../../docs/iron-meridian/NATIVE_VERIFICATION.md). These prototype results do not establish native parity.

Executed on Windows on 17 November 2026. All changes remain uncommitted. No push, deployment or native HOI4 execution occurred.

## Automated checks

- `npx.cmd vitest run tests/games/iron-meridian tests/navigation.test.ts`: 37 passed, 0 failed. This includes 31 simulation tests, 4 geometry tests and 2 stable-route tests.
- `npm.cmd run check`: passed. The final `npm.cmd run build` also executes TypeScript checking.
- `ARCADE_URL=http://127.0.0.1:4668 CHROMIUM_PATH=<installed Chromium> npx.cmd playwright test tests/games/iron-meridian/play.spec.ts tests/games/iron-meridian/stale-project.spec.ts --project=chromium --workers=1 --reporter=list`: 7 passed, 0 failed, 2.9 minutes.
- `npm.cmd run build`: passed on final source. Vite transformed 1,233 modules. The build emitted Breachline mixed-import and large-chunk warnings, with no compilation failure.
- `node --input-type=module -e "import {verifyOfflineBuild} from './scripts/verify-offline-build.mjs'; await verifyOfflineBuild();"`: passed. All 41 shell files and all 30 game packs match built byte lengths and SHA-256 values. The verifier was explicitly imported because its direct-entry URL comparison does not execute the check correctly on Windows.

Production offline version: `957fabaa11edb3e3`. Iron Meridian's game pack contains `assets/index-S0Otv7rf.js` (100,105 bytes) and `assets/index-DEuD4qAP.css` (20,733 bytes). The shell contains the original cover (23,425 bytes). All five runtime TypeScript sources embedded in the final game's source map match the current source files exactly. These are build identity and offline packaging checks, not performance measurements.

`IRON_MERIDIAN_BUILT=1 ARCADE_URL=http://127.0.0.1:4669 CHROMIUM_PATH=<installed Chromium> npx.cmd playwright test tests/games/iron-meridian/offline.spec.ts --project=chromium --workers=1 --reporter=list`: 1 passed, 0 failed, 23.9 seconds. The real Downloads flow cached the production pack; the page was closed, networking was disabled, a fresh page reopened the game, and a campaign successfully advanced to day one.

## Browser behavior established

The real app route exercises factory reassignment, equipment stockpiles, construction, two simultaneous research jobs, national focus completion, equipment/manpower reservation and division deployment. A second journey waits for war justification, declares war and issues real offensive routes.

Viewport checks at 390 by 844 and 844 by 390 verify full-screen Canvas bounds, no horizontal document/panel overflow, reachable headquarters panels and separation between essential panel controls and the floating app dock. Screenshots were also captured at 1440 by 900. These are browser viewport checks, not physical-device acceptance.

Study pauses a running campaign across ten seconds of controlled browser time. The Return link resumes it, and reload restores a stopped campaign clock. A focused native select can retain an older queue presentation; clicking a completed project's stale button now leaves the next project intact. Restart from the paused app menu returns to an enabled nation selector and a fresh day-zero campaign.

The first browser runs exposed real clock-control replacement and paused-restart defects. Both were reproduced before focused fixes, and the final seven-test run passes. Other early failures came from the absent expected Chromium executable, concurrent Vite source reloads, the Windows watcher locking a newly created probe, an incorrect Escape-to-return assumption and an ambiguous Return-link locator. Final tests use the installed Chromium executable, a stable source tree, ignored report/artifact paths, and the actual Study Return control.

Browser executable: `C:/Users/charlie/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe`. WebKit and physical touch hardware were not tested. The shared preview twice timed out during navigation/guest interaction; its tabs were closed. Automated app verification used the repository's Playwright lane.

## Independent review

OpenAI agents separately implemented simulation, cartography and static investigation. A fresh OpenAI reviewer examined simulation, renderer, UI, integration and evidence claims. No Critical or Important source findings remained after fixes for construction-cap reconciliation, stale combat attackers, sparse save arrays, obsolete justifications, stale unit selection, stale construction cancellation and phone camera bounds. Parent browser tests subsequently found and verified the clock and restart fixes. The review does not establish native HOI4 equivalence or exhaustive balance.

## Evidence and limits

Screenshots are in `tests/games/iron-meridian/evidence/`: desktop setup/campaign/orders, phone and landscape setup/campaign/map, plus the production catalog cover and offline campaign after the final check. The navy scene and province map continue beneath the floating glass and to screen edges.

The original implementation has six fictional nations, 84 provinces, three fixed land templates, ten technologies, eight national focuses, one abstract air region and sea zone, a province supply graph, local AI and an alliance/conquest victory condition. Full HOI4 reverse engineering and parity remain incomplete. At this historical prototype checkpoint the native executable had not been run, disassembled or decompiled. Subsequent actual decompilation and bounded ports are documented separately. Historical/global content, complete designers, doctrines/commanders, weather, resistance/occupation policy, peace conferences, subjects, intelligence operations, special projects, DLC behavior, multiplayer and native save compatibility are not implemented. See `docs/iron-meridian/RESEARCH.md` for the exact evidence boundary.
