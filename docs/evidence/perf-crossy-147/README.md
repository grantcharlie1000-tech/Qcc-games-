# Crossy Road production measurements (PR #147)

Measured on 7 November 2026 in [GitHub Actions run 42321140724](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/42321140724). Six JSON summaries are preserved here. [The full artifact](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/42321140724/artifacts/13553791129) also contains screenshots and compressed raw CPU profiles.

- Baseline: `05214cd0619e940242269d45f28888347fe9bea9`.
- Candidate: CI's test-merge commit `e197495bd91bf1fbaa0806fabccd544abcb201aa`, whose tree `23242779bc2f1e2f9fdd7bf1adbc22a3db51f7e4` exactly matches PR code commit `613d0112afcb7b89ca775fba9241d0103be66312`. Subsequent HUD-test selector correction does not alter production code.
- Chromium 156.0.8078.0, ANGLE SwiftShader **software GPU**, Ubuntu CI runner.
- Alternate baseline/candidate three times on the same runner, one browser/page at a time. Both production builds use the same existing `scripts/perf/crossy-ballrun.mjs --crossy-only` harness without modification.
- 390×844 phone profile starts at device scale 3 and uses 4× CPU throttling. 1366×768 desktop uses device scale 1, unthrottled CPU. The normal adaptive-resolution controller remains enabled and unchanged.
- Per profile: 2-second warmup, 15-second unprofiled rAF measurement, separate 3-second CPU profile. Real key/button input and automatic retries after deaths. The seed and initial save are fixed; frame sequences and phase mixtures differ with wall-clock timing.

## Results

| Profile | Pair | FPS before → after | p95 frame ms before → after | p99 frame ms before → after |
| --- | --- | --- | --- | --- |
| Phone | 1 | 9.46 → 11.38 | 300.0 → 183.3 | 600.0 → 350.1 |
| Phone | 2 | 8.86 → 11.85 | 366.7 → 183.3 | 583.3 → 350.0 |
| Phone | 3 | 8.77 → 10.54 | 400.0 → 216.7 | 583.3 → 366.6 |
| Desktop | 1 | 3.97 → 5.52 | 883.3 → 316.6 | 1000.0 → 666.6 |
| Desktop | 2 | 4.99 → 5.69 | 533.3 → 350.1 | 783.3 → 433.3 |
| Desktop | 3 | 5.06 → 5.43 | 666.7 → 383.3 | 899.9 → 516.7 |

Across-run medians: phone FPS 8.86 → 11.38 and p95 366.7 → 183.3 ms; desktop FPS 4.99 → 5.52 and p95 666.7 → 350.1 ms. All runs completed with no recorded page errors.

Raw CPU profile sample totals for `getImageData`:

- Phone before: 1,421.05 / 1,050.54 / 1,083.08 ms. After: 0 / 0 / 0 ms.
- Desktop before: 2,378.32 / 1,914.61 / 2,122.66 ms. After: 0 / 0 / 0 ms.

This removes the dominant synchronous readback hotspot without removing the Liquid Glass compositor. Zero sampled time is a profile observation, not an assertion that every browser operation costs zero.

## Limits

These are whole-system software-renderer results, **not real-device FPS or an equal-resolution microbenchmark**. The optimized phone reaches DPR 1 after 4.42–4.97 seconds, versus 5.33–6.95 seconds before, so some of its FPS improvement includes spending more time at lower resolution. The desktop remains at DPR 1 throughout. Both use the same quality-controller code and thresholds.

The input driver is wall-clock based, so gameplay phase mixtures and positions differ between runs. The screenshots are useful for inspecting overall appearance but are not deterministic pixel-parity captures. Three short runs show a consistent direction, not a universal percentage improvement. Absolute FPS is low because a CPU software renderer is doing the entire game and glass workload. Hardware-GPU desktop and physical-phone measurements remain outstanding. Retained heap results are noisy and do not establish a memory saving.

Separate deterministic scene tests compare matrix/color output, invalidation, GPU upload bytes and geometry counts; those do not claim browser FPS. The browser HUD test separately compares sampled and optimized rendering in one frozen mobile scene.

## Independent CI rerun

[Run 42322117235](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/42322117235) repeated the same three paired benchmarks after the test-selector-only correction. The six summaries are preserved in `rerun/`; [raw profiles and screenshots](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/42322117235/artifacts/13553782912) remain in its artifact. Candidate test-merge commit: `a7a400ee653bfe1dd4603c11cb36f59f531baddc` (PR head `1e2fa05`). No production code changed between the two runs.

- Phone median FPS: 12.25 → 13.64; p95: 266.7 → 166.6 ms; p99: 483.3 → 233.3 ms.
- Desktop median FPS: 5.54 → 6.39; p95: 533.3 → 299.9 ms; p99: 833.3 → 399.9 ms.
- All three pairs again improve, with no recorded page errors. All six candidate CPU profiles again show zero sampled `getImageData` time; before profiles range from 901.61–1,054.94 ms phone and 1,494.60–2,009.11 ms desktop.
- The phone reaches DPR 1 after 4.05–4.47 seconds after, compared with 5.15–5.48 seconds before. The same caveats above apply. The differing absolute FPS across CI runs reinforces why these numbers should not be generalized to hardware devices.

## HUD comparison

That rerun passed 74 focused Chromium cases and 73 WebKit cases, with one existing unsupported WebKit native-touch skip. The new test exercises visible score changes and resize, verifies zero optimized canvas copies, re-enables the original readback in the same frozen scene, and compares computed style plus screenshot pixels.

The two screenshot attachments are **byte-identical within each browser**: Playwright deduplicated `hud-optimized` and `hud-original-sampling` to the same SHA-1-named image (`4be38123258f54e243403ed7f1b7e9398ea6be06.png` Chromium; `b2f307a5ebac64d83d41ae5218440b4b0f6865fd.png` WebKit). Both were visually inspected. This checks one frozen mobile HUD state, not every possible state or cross-browser pixel equivalence.

- [Chromium report and screenshot](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/42322117235/artifacts/13552903535)
- [WebKit report and screenshot](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/42322117235/artifacts/13553488748)
