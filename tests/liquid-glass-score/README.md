# Locked Liquid Glass check

Implementation has not started. This check measures the QCC project targets in sections 10 and 11 of the reference at commit `5af9ec6c76e7799cf1880678b807ee18164d78a4` (PR #175). These targets are estimates for this project, not Apple constants or pixel parity claims.

Run from the repository root:

```sh
node scripts/check-liquid-glass.mjs
```

The last line is the number of failed scored assertions. Target: 0. Assertion failures exit 0 so hill-climb can compare counts. Infrastructure failures exit 2, retain a positive failure count, and prevent initialization or an accepted step. The fixed manifest requires both engines, both viewports, every backdrop and every assertion. Missing, duplicate or skipped measurement matrices cannot produce a passing score.

The check starts the existing Vite application on port 4600 and uses the repository Chromium and WebKit projects, one worker, DPR 1, dark appearance, 100% zoom, desktop 1280x844 and mobile viewport 390x844. These are desktop browser runs with an emulated viewport, not physical phone results.

The backdrop matrix contains black, white, mid-gray, saturated mixed color, a 1 CSS px grid, a bright local photo and a busy local photo. It exercises real section navigation and Movies navigation. Test DOM supplies only controlled backdrops and optical diagnostic geometry. It does not implement press, drag or accessibility behavior. The real app supplies the material, labels, actions and state.

Text contrast uses the computed foreground and screenshot pixels behind occupied glyph cores. It takes the worst sample rather than an average, requires nonzero samples and compares unrounded ratios to 4.5. A small conservative pixel bound accounts for WebKit's 1% hidden ink. Boundary contrast samples both sides of the silhouette, requires 3.0 and accepts a contrasting fill as a boundary. Background-only and foreground mask captures preserve the real compositing path.

Chromium refraction is measured with the exact rendered SVG lens and a zero-displacement reference of the same material. A missing measurable lens is a failure. Eight grid phases fit fractional pixel offsets along all four edge normals. Calibration rejects zero and excessive displacement. WebKit is explicitly exempt from displacement, while its surface visibility, action and contrast assertions still run. The 240x64 optical diagnostic changes only fixture geometry and hides foreground to isolate the material.

Pointer input presses the actual control, then samples its rendered response, release and cancel. Drag compares the painted selection position with pointer coordinates on each animation frame through repeated direction changes, and checks the real hit target against its original bounds. No drag behavior means a failure. Reduced motion samples the release trajectory for overshoot.

Chromium uses CDP reduced-transparency emulation. WebKit uses a real app opaque-surface override if available. Absence of that override is a scored failure. The check never injects an opaque fallback or fakes matchMedia. Near-opaque means at most 10% transmission when the backdrop changes between black and white. Actions, focus and refraction-off are separate assertions.

Frame timing records all requestAnimationFrame intervals during three paired 2.2 second scroll runs, alternates pair order and takes the median of each run's p95/p99. The effects-off comparison removes filters and decorative lens layers without changing layout or content. Baseline p95, baseline p99, effect p95, effect p99 and added p95 are separate assertions. A 1 ms reserve uses acceptance thresholds 19/32/2 ms, within the project's strict 20/33/3 ms budgets. Scheduling intervals are not GPU time.

Review PNGs and JSON reports are overwritten under `/workspace/liquid-glass/`. Images are never committed. `score-report.json` contains individual assertion evidence and raw frame intervals; `score-playwright.json` contains browser/OS metadata and measurement errors. Screenshots use `desktop-1280-*` and `mobile-390x844-*` names.

The holdout command is:

```sh
node scripts/check-liquid-glass-holdout.mjs
```

It runs the same measurement contract with three 30 second paired scroll runs and all ten existing glass e2e files. Their failures add to its count. Existing tests and helpers are locked without being weakened.

Physical iPhone/iPad Safari, Android, power/thermal state, GPU time and the 10 minute battery session are outside this environment. The battery session is intentionally omitted.
