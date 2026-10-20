# Continuous Snake — initial coordinator verification

**Historical source-specific run:** final post-audit results and exact-runtime independent review are in [final verification](post-audit/effect-version-final/verification.md). Art, sizing and contact code are unchanged by the later save-validation/effect corrections, so captures and profiling below retain their stated provenance.

Source checkpoint: `511ed3bc51e47dd4b1f53b32c072b0ae4c95174d`, isolated branch `redesign/snake-smooth`. All checks below ran after the final junction-rounding fix. Source/test files remained identical to that commit; this evidence is an additional local commit. Independent Astra review is next. Nothing was published or deployed.

## Results

- [All unit tests](all-unit-tests.txt): **300 passed / 25 files**. The [36 focused Snake cases](unit-tests.txt) include contact sweeps, moving and held tails, growth, full victory, turn deadlines, invalid saves, legacy conversion and tiny numerical boundaries.
- [Production build](build.txt): TypeScript and Vite passed; offline pack contains 69 files, version `cc4b6f9ba90f`. [Strict TypeScript](typecheck.txt) also passed independently.
- [Final Chromium integration](coordinator-browser-tests.txt): **9 passed, 49.6 s** — eight Snake cases plus retained Study/autosave/return. This is the final-source run; earlier eight-case outputs are historical.
- [Built offline verification](offline-tests.txt), [structured results](offline/offline-results.json): Snake play, save, restart and retained Study passed at `/` and `/Qcc-games-/`, with no external requests, page errors or failed assets. The other games' browser suites were not rerun on this candidate; all their unit tests ran above.
- [Independent model stress](independent-model-stress.txt): **1,000 seeds / 88,674 input windows**, each comparing one large update with 1 ms partitions and requiring an exact JSON restore. An independent distance calculation verified **323 losses at contact** and no running penetration. A **16,924-leg** seeded garden run reached **256 segments / 2,530 points**, with equivalent 160 ms and mixed partitions, periodic restore and final restore. Near-junction and invalid elapsed-160 checks pass. The log includes exact source SHA-256 fingerprints.
- [Browser captures](browser-capture.txt), [measurements and saved states](browser-evidence.json): five viewport sizes fit without horizontal or vertical page overflow. Real keyboard and native CDP touch input, cancellation, fractional pause/reload, wall contact and version-1 conversion passed with no page errors or external requests. Three apple-free, effect-free cropped frames at [240](motion-240.png), [272](motion-272.png) and [304 ms](motion-304.png) differ during the same leg, demonstrating continuous travel rather than stationary grid frames.

## Size and visual evidence

The [original baseline](../baseline.json) was measured before implementation. Dimensions are CSS pixels, garden outer width / playable width; both are square.

| Viewport | Before | After |
| --- | ---: | ---: |
| 1440 × 1200 | 520 / 496 | **728 / 694.4** |
| 1366 × 768 | 483.8 / 461.4 | 636 / 602.4 |
| 844 × 390 | 225.7 / 215.2 | 294 / 260.4 |
| 390 × 844 | 366 / 348 | 366 / 348 |
| 320 × 568 | 281.3 / 264.2 | 292 / 274 |

The roomy garden is 40% wider and taller; smaller screens cap it to the available width and height. The final 320 px result is slightly smaller than the earlier fallback because the clearer turn instructions occupy additional status height. Touch targets remain at least 48 px. The focused test also verifies paused DPR 2 → 3, resize during a turn, exact state retention, backing-pixel coherence and corner clipping that does not hide the head before contact.

After screenshots: [roomy desktop](after-1440x1200.png), [short desktop](after-1366x768.png), [short landscape](after-844x390.png), [phone](after-390x844.png), [narrow phone](after-320x568.png). The coordinator visually inspected the roomy/narrow views and the [upward wall-contact canvas](wall-up-canvas.png); [game-over feedback](wall-up-feedback.png) is captured separately.

Trace evidence: [continuous save/growth](continuous-save-growth.zip), [event-time input and stalled/stale RAF](event-time-stalled-raf.zip), [paused DPR/resize](paused-dpr-resize.zip), [native phone controls](native-touch.zip), [retained Study](retained-study.zip), [keyboard motion/collision](keyboard-motion-collision.zip), [touch cancellation/steering](touch-cancel-and-steer.zip), [legacy conversion and continuation](legacy-conversion-continuation.zip).

The legacy browser fixture retained body, score, seed, food, direction, queue, phase and ticks through 10 seconds of active browser-clock time while held. It archived the old 93 ms waiting fraction, continued only after the explicit button, consumed the saved turn, and then restored the new fractional pose and pixels exactly. See the [continuation screen](legacy-safe-continuation.png) and structured snapshots.

## Performance and limits

[Real-RAF profiling](performance.json) used 180 delivered frames per scenario at 1366 × 768, DPR 2. Normal Chromium: median/p95 **16.7/16.7 ms**, maximum 16.8 ms, no frames above 33 ms. Fourfold CPU throttling: median/p95 **16.7/33.4 ms**, maximum 66.6 ms, **72/180** frames above 33 ms. Both remained running at score 10 with no errors. This measures this container's browser cadence, not physical phone or Chromebook performance. The speed remains fixed at one cell per 160 ms; tests change frame cadence rather than a nonexistent speed setting.

The profiler uses a synthetic steering controller; trusted input evidence is separate. Its [initial controller failure](performance-initial-controller-failure.txt) is retained: the row-coordinate parser consumed sentence punctuation after fractional coordinates, so it failed to steer. The corrected parser produced the [successful output](performance-tests.txt). No product code changed for that correction.

Original artwork uses no Google logos/assets. Actual Google Search/Snake navigation failed with `ERR_TUNNEL_CONNECTION_FAILED` and was not visually inspected; WebKit installation failed with CDN HTTP 403. These original failures remain in the parent evidence directory. All model/browser development failures and their corrections remain linked in the [candidate history](README.md). No physical touch hardware or assistive technology was tested. Reduced motion suppresses cosmetics while essential authoritative travel stays continuous.
