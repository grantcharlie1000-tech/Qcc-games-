# Mauri Gazette arcade delivery — referenced gameplay correction

Workspace: `/workspace/Qcc-games-`, branch `work`. Repository: https://github.com/grantcharlie1000-tech/Qcc-games-. Production source branch: **main**, automatically connected to **https://mauri-gazette.netlify.app**. Publication evidence is maintained in [the deployment record](NETLIFY_DEPLOYMENT.md).

This pass corrects **Animal Stack, Water Sort, Color Blocks and Ball Run**, plus shared viewport/input behavior. The other eight game source modules and all twelve library covers remain unchanged from the Study release. No game was replaced or added. The four assigned specialists actually used GPT-6.1 Sol in isolated worktrees, discovered/read installed skills and supplied reviewed game-only commits; see [handoffs](AGENT_BUILDS.md) and each module's `SKILL_USAGE.md`.

## Visual and interaction evidence

The parent manually compared real sprite/portrait/landscape/interaction captures with the supplied stills. The ZIP contained no MP4s, so exact source timing/camera feel and the native rotation increment remain unverified. The **45° tap rotation is a documented browser adaptation**. No full-arcade visual-equivalence claim is made for the eight games without detailed gameplay references.

- Animal Stack: [six original silhouettes](../tests/games/animal-stack/evidence/six-sprite-preview.png), [real portrait](../tests/games/animal-stack/evidence/final-390x844.png), [tall landscape](../tests/games/animal-stack/evidence/tall-844x390.png), [actual touch/keyboard/physics WebM](../tests/games/animal-stack/evidence/actual-touch-tap-drop-tip-stable-fall.webm). Neck-first/support/fall segments use explicitly restored real-physics poses; they are not an uninterrupted random run. A separate replayable five-animal save proves tall-stack framing and inverse pointer mapping.
- Water Sort: [real pour sequence](../tests/games/water-sort/evidence/correction-motion-sheet.jpg), [pour/return WebM](../tests/games/water-sort/evidence/correction-pour-390x844.webm).
- Color Blocks: [portrait](../tests/games/color-blocks/evidence/correction-390x844.png), [mouse drag WebM](../tests/games/color-blocks/evidence/mouse-drag.webm), [native touch-emulation WebM](../tests/games/color-blocks/evidence/touch-drag.webm).
- Ball Run: [portrait](../tests/games/ball-run/evidence/390x844.png), [drag/held-key/ramp-gap WebM](../tests/games/ball-run/evidence/ramp-gap.webm), [motion sheet](evidence/correction/ball-motion.jpg).

All games occupy a fixed available browser viewport, with no native fullscreen requirement or document scrolling behind play. Landscape composition preserves aspect and physics units. Shared fitting also covers growing Solitaire piles, large Minesweeper inner scrolling, Pool ball-in-hand panels and 320px toolbar hit targets. Library/Study scrolling and the prior library position are restored. [Independent review and resolved findings](evidence/correction/independent-review.md).

## Twelve-game status

“Passed” means actual local Chromium interaction and offline verification, not physical-device or WebKit certification. Logic/browser counts are game-specific; shared shell/Study/viewport checks are additional.

| Game | Current status | Logic / browser cases | Offline root / subpath |
|---|---|---|---|
| Fruit Merge | Preserved: physical dropping and equal-fruit merging | 16 / 5 | Passed / passed |
| Water Sort | Corrected: slender glass and coordinated level liquid pours | 57 / 15 | Passed / passed |
| Color Blocks | Corrected: bevelled cubes, full-footprint drag and snap | 15 / 17 | Passed / passed |
| Tower | Preserved: overlap-cropping precision stacker | 15 / 4 | Passed / passed |
| Snake | Preserved: fixed-step grid snake | 10 / 3 | Passed / passed |
| Minesweeper | Preserved: safe first click, flood reveal, flags and chords | 17 / 6 | Passed / passed |
| Solitaire | Preserved: Klondike stock, tableau, foundations and undo | 14 / 8 | Passed / passed |
| Block Fill | Preserved: single non-overlapping full-coverage path | 8 / 6 | Passed / passed |
| Color Connect | Preserved: non-crossing paired paths with full coverage | 11 / 10 | Passed / passed |
| Ball Run | Corrected: real 3D steering, ramps, gaps, boosts and hazards | 9 / 8 | Passed / passed |
| Pool | Preserved: offline eight-ball, AI and pass-and-play | 40 / 6 | Passed / passed |
| Animal Stack | Corrected: six rigid cutouts, drag/tap, deliberate DROP and real tipping | 27 / 13 | Passed / passed |

## Final integrated verification

| Check | Actual result | Evidence |
|---|---|---|
| TypeScript and production build | Passed | [build output](evidence/release/build.txt) |
| Vitest | **252 passed, 0 failed**, 22 files | [output](evidence/release/unit-check.txt), [JSON](evidence/release/unit-results.json) |
| Full Chromium | **139 passed, 0 failed/flaky/skipped**, 6.8 minutes | [output](evidence/release/e2e.txt), [JSON](evidence/release/chromium-results.json) |
| Final Water capture follow-up | **15 passed**, including real capture and every cancellation path | [parent output](evidence/correction/water-capture-parent-review.txt), [JSON](evidence/correction/water-final-results.json) |
| Original SVG artwork validator | **30 passed, 0 failed** | [output](evidence/correction/svg-validation.txt) |
| Offline production | All 12 games and 20 chapters at both paths; zero external requests, failed assets, page errors or Study-switch requests | [output](evidence/release/offline-check.txt), [JSON](evidence/release/offline-results.json) |
| Two-version/two-tab worker update | Old cached game survives; update waits; stale caches cleaned; high score retained | [output](evidence/release/update-check.txt), [JSON](evidence/release/update-results.json) |
| WebKit | Unavailable before browser launch: missing executable | [actual attempt](evidence/correction/webkit-unavailable.txt) |

The full regression ran on source `0a0fb35`. The subsequent scoped Water Sort capture patch changed only its input adapter and tube touch-action; its rules, solver, levels and session stayed unchanged. All 15 Water cases were independently repeated after that patch, followed by shared viewport/Study checks and final production unit/build/offline/update verification. Other game modules received no later source edits.

The full suite includes actual game inputs, pause/restart/save/restore, all twelve retained Study instances, interrupted gestures, native keyboard reading, reduced motion and native Chromium touch emulation. Parent focused checks and original-specialist evidence are under [correction evidence](evidence/correction/). A deliberately interrupted earlier run and its resolved native-scroll test timing are identified there; they are not counted as a final pass.

## Offline, payload and measurements

Production offline pack **d1b885f03c1f** contains 65 required requests, **1,202,348 bytes** counting repeated root/index responses and notices. Entry JavaScript is **118,014 bytes / 36,365 gzip**; entry CSS **22,517 / 5,822 gzip**. All 20 original chapters/inline SVG diagrams are local. Matter.js and Three.js remain lazy and are absent from the initial library's game-engine requests. Gzip sizes are calculated from built files, not host transfers. [Payload data](evidence/release/payload.json), [ready static ZIP](evidence/mauri-gazette-netlify.zip).

Forty-five RAF intervals per game/path were sampled with one browser active. These are scheduler observations, including idle puzzle frames, rather than sustained simulation/GPU throughput. Software WebGL is variable. Ball Run reports seven draw calls and three geometries; resource disposal/context-loss/re-entry are exercised separately.

| Corrected game | Root median / p95 (ms) | Subpath median / p95 (ms) |
|---|---|---|
| Water Sort | 16.7 / 16.7 | 16.7 / 16.8 |
| Color Blocks | 16.7 / 16.8 | 16.7 / 100.0 |
| Ball Run | 66.7 / 116.7 | 66.7 / 83.4 |
| Animal Stack | 16.7 / 16.8 | 16.7 / 66.7 |

Twenty-four synchronous Esc-handler samples measured **15.4ms median**, 7.7–29.4ms range, including pause/serialization/article setup but excluding input delivery and paint. These measurements do not certify physical Chromebook/Mac performance or a 60 FPS target.

Offline use requires successfully caching this release on the same device, browser and origin. Storage may be blocked, evicted or disabled by managed policy. It cannot bypass network/device controls. Old offline tabs retain their release until closed; reopen and download the new pack after an update.

## Compatibility and remaining verification

Animal Stack v1 piles use incompatible geometry: the game explains the fresh-pile reset and retains the old score as the record. New v2 poses save normally. Ball Run rebases v1 height onto the revised terrain while retaining seed/distance/best. Other game saves preserve their formats. Study retains the same mounted instance across Esc/Return.

No physical Chromebook, managed Mac, real trackpad, Safari/WebKit, screen-reader or hardware GPU benchmark was available. Chromium pointer and touch emulation are not real-device testing. Direct live-origin browser/HTTP access is blocked by the environment proxy; Netlify production state/source is verified through the requested connector. Local production root/subpath checks do not certify live-origin headers or policy behavior. GitHub Pages deployment is configured but not claimed published.

Run `npm ci`, `npm run dev`; build with `npm run build`. The same `dist/` supports Netlify root and GitHub repository subpaths through relative assets/hash routes. [Architecture](../ARCHITECTURE.md), [test plan](../TEST_PLAN.md), [detailed correction record](GAMEPLAY_CORRECTIONS.md), [Study feature](STUDY_MODE.md). No backend, runtime CDN, ads, accounts, currency or telemetry is required.
