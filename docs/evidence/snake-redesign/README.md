# Snake smooth redesign evidence

Snake now renders a continuous rounded body along the same deterministic 16 × 16 grid path, with direction-facing eyes, restrained food/eating feedback and live reduced-motion support. On a roomy 1440 × 1200 viewport, the garden and playable square are both **40% wider and taller**. Smaller viewports fit the board within both dimensions while keeping direction targets at 54 × 48 CSS px.

All comparisons start from current main `a7f7631d4f606667f23b016ad6091cb3899365e8`. The implementation is isolated to `redesign/snake-smooth`; no PR, push, merge or deployment was performed. No Astra review has been used for this implementation at the time of this draft; independent review remains pending.

## Measured before and after

Values below come directly from [baseline.json](baseline.json) and [after-sizes.json](after-sizes.json). Measurements are CSS pixels; both board dimensions are square. The old shell scaled the whole game on short screens. The new layout fits only the board and moves controls beside it when this provides more playable space.

| Viewport | Garden before → after | Playable square before → after | Controls after |
| --- | ---: | ---: | --- |
| 1440 × 1200 | 520 → **728** | 496 → **694.406** | Below; 54 × 48 |
| 1366 × 768 | 483.774 → **636** | 461.446 → **602.406** | Beside; 54 × 48 |
| 844 × 390 | 225.660 → **294** | 215.245 → **260.406** | Beside; 54 × 48 |
| 390 × 844 | 366 → **366** | 348 → **348** | Below; 54 × 48 |
| 320 × 568 | 281.328 → **296** | 264.220 → **278** | Below; 54 × 48 |

The tall desktop result is exactly 728 px outer and approximately 694.4 px playable (fractional CSS rounding). The phone retains its full-width playable cap. All five measured pages match their viewport width and height without overflow. Backing pixels follow displayed size × full DPR; the captured matrix includes DPR 2 and 3. Coordinator spot checks also confirmed DPR 4.

| Viewport | Before | After |
| --- | --- | --- |
| 1440 × 1200 | [Before](before-1440x1200.png) | [After](after-1440x1200.png) |
| 1366 × 768 | [Before](before-1366x768.png) | [After](after-1366x768.png) |
| 844 × 390 | [Before](before-844x390.png) | [After](after-844x390.png) |
| 390 × 844 | [Before](before-390x844.png) | [After](after-390x844.png) |
| 320 × 568 | [Before](before-320x568.png) | [After](after-320x568.png) |

[Game-over feedback](after-game-over.png) shows the replay state. [keyboard-interaction.zip](keyboard-interaction.zip) is the recorded browser trace. Its routed interaction used trusted ArrowRight, ArrowUp and ArrowLeft events; [after-sizes.json](after-sizes.json) records these trusted events for each viewport and reports no page errors.

## Timing and rules

`model.ts` is unchanged: one square per 160 ms, at most two queued turns, illegal reversals rejected, seeded food, ten points per apple, held-tail growth, vacating-tail legality and authoritative wall/body collision timing all remain intact. No speed setting or new rule was added.

Rendering uses the standard previous-to-current committed-edge projection at `elapsed / 160`. The visible position can trail the authoritative grid by one interval. A consumed turn starts its visible edge on that same tick, with no extra queued tick or easing delay; collision immediately opens the replay state on the authoritative collision tick. The body keeps original orthogonal corner vertices rather than joining independently interpolated segment centres across bends. This avoids diagonal shortcuts without predicting and retargeting a future move.

Pause freezes the fractional pose. Optional independently validated presentation history preserves its path and active food/eating feedback across reload while accepting legacy version-1 saves. Both live OS and app reduced motion use exact discrete grid poses and suppress the small food/eating effects. The art is original Canvas code with no Google assets or logos. See [the design sketch](../../snake-smooth-design.md) for geometry, growth, responsive sizing and compatibility details.

## Verification

- Focused Snake: **19 unit tests / 2 files** and strict TypeScript check pass after the final feedback-save fix. The final **7 Chromium Snake browser tests pass** (3 legacy cases + 4 smooth cases, 37.1 s, traces enabled), including pixel-identical reload during active growth/eating feedback. [snake-final-tests.txt](snake-final-tests.txt) records the final rerun. The browser checks cover continuous frames, midpoint input/queue rejection, pixel-identical paused reload, dropped RAF catch-up, turn-preserving resize, display/backing resolution, usable controls, live reduced motion and real cancelled touch gestures with page-error assertions. Details: [Snake TEST_RESULTS](../../../src/games/snake/TEST_RESULTS.md). Recorded final traces: [growth reload](growth-reload.zip), [touch interaction](touch-interaction.zip), [reduced-motion/cancellation](reduced-motion-cancellation.zip).
- Complete unit suite: **283 tests / 25 files pass** after the final feedback-save case, up from 274 baseline tests. Raw output: [unit-tests.txt](unit-tests.txt).
- TypeScript and production build: **pass after the final feedback-save fix**. Build output records 69 offline-pack files; [build.txt](build.txt).
- Full Chromium suite initial run: **142 passed / 18 failed (160 cases)**. Seventeen failures occurred before page creation because Playwright’s ffmpeg executable was absent (9 Ball Run and 8 Color Blocks correction cases); one Flappy Bird scored-flight assertion timed out with 0 instead of at least 1. All 7 Snake cases passed. The coordinator exposed the existing system `/usr/bin/ffmpeg` through a temporary `/tmp/qcc-snake-browsers/ffmpeg-1013/ffmpeg-linux` symlink with a scoped browser-path environment, then retried only the failed cases with `--last-failed --workers=1`. **All 18 retries passed**, so all **160 cases passed across the initial 142 passes and 18 successful retries**. No dependency or application source was changed for this environment repair. Raw output: [initial run](browser-tests.txt), [retry](browser-retry.txt).
- Root/subpath offline and Study checks across all **13 games pass** on the initial build. After the final feedback-save fix, production Snake offline checks at **both root and subpath pass** again. Raw output: [all-game checks](offline-tests.txt), [final Snake checks](offline-final-tests.txt); screenshots/results are in [offline/](offline/) and [offline-final/](offline-final/).
- Coordinator visual inspection: desktop, landscape and phone captures are clean. Independent Astra review remains **pending**.
- Performance: [performance.json](performance.json) records 180 active RAF intervals per sample at 1366 × 768, DPR 2. Both samples remained running with score 10 and no page errors. The profiler uses grid-aware synthetic steering solely to keep the run active; trusted keyboard and touch behavior are documented separately in the recorded interaction traces.

| CPU throttling | Median RAF | p95 RAF | Maximum RAF | Intervals over 33 ms |
| --- | ---: | ---: | ---: | ---: |
| 1× | 16.7 ms | 16.8 ms | 16.8 ms | 0 / 180 |
| 4× | 16.7 ms | 33.4 ms | 33.4 ms | 67 / 180 |

The unthrottled sample met a 60 Hz cadence. The 4× throttled sample has frequent dropped frames; the deterministic catch-up tests verify timing equivalence, but this result does not support a claim of uninterrupted 60 FPS under CPU throttling.

## Access and device limits

Real Chromium navigation to both `https://www.google.com/search?q=snake+game` and `https://www.google.com/fbx?fbx=snake_arcade` failed with `ERR_TUNNEL_CONNECTION_FAILED`; [baseline.json](baseline.json) preserves the exact errors. The reference pages were not visually inspected, and no exact Google-reference match is claimed.

WebKit browser installation was attempted but the CDN returned HTTP 403 (`Domain forbidden`), so WebKit was unavailable. No physical touch device or Chromebook was tested. Browser-frame/CPU measurements in this environment cannot establish physical-device performance. Existing baseline and legacy evidence are retained separately from these new captures.
