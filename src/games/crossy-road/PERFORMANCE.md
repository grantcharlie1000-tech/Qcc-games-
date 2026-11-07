# Crossy Road resource reduction

## Root cause and changes

The repository's existing production CPU profiles in `docs/evidence/perf-crossy-ballrun/after.json` show the shared HUD's synchronous `getImageData` dominating render stalls (1,734 ms of the recorded 3-second phone profile). This was explicitly left unresolved by the earlier game-only pass. Those are historical measurements, not a new benchmark.

- Crossy identifies its canvas as textured for the ink sampler. The existing ink function already returns the same white text and dark halo for every textured background, independently of sampled pixels. Avoid synchronizing the GPU to read pixels that cannot change the result. Keep all Liquid Glass rendering, sampling cadence, DOM compositing, accessibility handling, labels, layout and controls. Other games retain their existing pixel-sampling path.
- Retain static ground, trees, rocks, lilies and signal-post instance buffers until a visible cell boundary, lane replacement, resize or world-origin change invalidates them. Put animated water in its own small instance buffer. Traffic, snow, water, warning lights and effects still update every frame.
- Remove wholly hidden axis-aligned voxel faces and their unused vertex storage. Keep partial faces, rotated details, coincident paint and the external shadow silhouette. No models, collision bodies, gameplay rules or quality settings are removed.

## Reproducible resource measurement

`tests/games/crossy-road/scene-budget.test.ts` executes the real scene, geometry, terrain and instance buffers with only the WebGL/context boundary replaced. Each scenario runs 600 deterministic frames at 390×844 and 1366×768, including stationary, forward and sideways camera movement. The JSON reports are in `tests/games/crossy-road/evidence/performance/`.

At the final desktop stationary frame, submitted triangles fell from 269,484 to 230,332 (14.5%). Desktop forward streaming uploaded 27.3 MB rather than 37.1 MB (26.5% less). Separating animated water can add one draw call. Rounding the offscreen window outward can draw extra fringe objects: the final phone-forward snapshot submits 35,328 rather than 35,028 triangles. No FPS claim is inferred from this CPU-only harness; timings depend on JIT and host contention and are not hardware GPU measurements.

Run the candidate harness with:

```
CROSSY_RESOURCE_REPORT=/tmp/crossy-resources.json npx vitest run tests/games/crossy-road/scene-budget.test.ts
```

For the baseline report, the harness loaded unchanged `scene.ts` and `models.ts` from base commit `05214cd0` as temporary sibling modules via `CROSSY_BASELINE_SCENE`, then removed those temporary files. No existing branch or PR was edited.

## Browser verification

The focused `Crossy Road performance` workflow runs all Crossy gameplay/lifecycle tests in Chromium and WebKit plus shared ink regressions. A new test records the unchanged HUD with pixel sampling enabled and disabled in the same frozen scene, compares computed ink and pixels, and uploads both screenshots. A separate job builds the PR base and candidate and alternates three production benchmarks on the same runner, including phone CPU throttling. It does not deploy.

[Focused CI run 42322117235](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/42322117235) passed on production-code-equivalent commit `1e2fa05`: 74 Chromium tests, 73 WebKit tests plus one pre-existing unsupported native-touch skip. The new HUD comparison passed in both engines: score updates and resizing work, the optimized path makes no canvas copies, and re-enabling the original sampler preserves computed appearance and frozen mobile HUD pixels within the stated tolerance. This covers one controlled HUD view, not every possible visual or accessibility state. Shared ink regressions and existing gameplay, context-loss, restart, pause and rendering tests also passed.

[Fresh production evidence](../../../docs/evidence/perf-crossy-147/README.md) contains three alternating before/after runs on one CI SwiftShader software-GPU runner. Median phone p95 frame time changed from 366.7 to 183.3 ms; desktop from 666.7 to 350.1 ms. The dominant synchronous readback hotspot disappears from all six candidate CPU profiles. The phone reaches lower adaptive resolution sooner, and wall-clock input produces different scene mixtures, so these whole-system figures are not equal-resolution or real-device performance claims.

Local Chromium IPC remained prohibited even after an approved escalated attempt, and the separate cloud browser could not reach the isolated local preview. CI supplied browser validation instead. Hardware-GPU desktop and physical-phone measurements remain outstanding. The full repository browser suite is tracked separately from the focused results above.

## Local checks

- `npm run check`: passed.
- `npm run build`: passed, including the service-worker kill-switch verification. Existing large-chunk warnings remain.
- `npm test -- --maxWorkers=2`: 4,687 tests passed in 237 files.
- `npx vitest run tests/games/crossy-road/`: 648 tests passed in 19 files.
- New tests were observed failing before the fixes: redundant sampling-context creation, static terrain uploads during animation, and internal voxel faces retained. They pass after the fixes.
- An earlier unconstrained full-suite run had 4,683 passes and one unrelated `tests/social/server.test.ts` pagination timeout at its 5-second limit. The complete two-worker rerun above passed without changing that test.
- Independent review found no blocking production defect. Its camera-stability concern in the screenshot test was corrected by resetting to a frozen seeded view before either capture.
- Browser tests were discovered successfully (74 focused Chromium cases). Local execution is blocked as described above; the focused CI browser results are recorded separately above.
