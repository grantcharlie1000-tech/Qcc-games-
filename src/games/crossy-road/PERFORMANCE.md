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

Local fresh browser profiling was attempted but could not start Chromium: its IPC socket was prohibited by this executor even after an approved escalated run. The available cloud browser could not reach the isolated local preview. Browser visual parity, real before/after FPS and real-device testing therefore remain pending CI or a supported browser-capable executor. Do not describe them as passed before inspecting those results.

## Local checks

- `npm run check`: passed.
- `npm run build`: passed, including the service-worker kill-switch verification. Existing large-chunk warnings remain.
- `npm test -- --maxWorkers=2`: 4,687 tests passed in 237 files.
- `npx vitest run tests/games/crossy-road/`: 648 tests passed in 19 files.
- New tests were observed failing before the fixes: redundant sampling-context creation, static terrain uploads during animation, and internal voxel faces retained. They pass after the fixes.
- An earlier unconstrained full-suite run had 4,683 passes and one unrelated `tests/social/server.test.ts` pagination timeout at its 5-second limit. The complete two-worker rerun above passed without changing that test.
- Independent review found no blocking production defect. Its camera-stability concern in the screenshot test was corrected by resetting to a frozen seeded view before either capture.
- Browser tests were discovered successfully (74 focused Chromium cases), but local browser execution remains blocked as described above. CI status is separate from these local checks.
