# R3: resize-dependent ranking stays stale

## Retained CI failure

Draft PR 5 published head `1e08484b890bb2d60ced32989bfc139d075acc44`. GitHub run `39416296107` checked out test merge `0254e4d1113304e8d64b87a5b27fb7b1b02012f0` against main `a7f7631d4f606667f23b016ad6091cb3899365e8`; its tree exactly matches the published head. The terminal browser result was **329 passed, 1 failed, 14 skipped**. Only the Neon Coil WebKit resize assertion failed: expected five ranking rows, received ten. All 288 unit tests passed; build, update and offline stages were skipped after the browser failure. The original logs and identity records remain byte-identical in `ci-first-failure/`.

## Classification and cause

This is a real UI synchronization defect, with a timing-dependent manifestation during running play. The assertion is not obsolete: the documented design and source both require top five when the viewport is narrow or short, and top ten otherwise. That requirement remains unchanged.

Previously `resize()` updated the renderer's view and canvas immediately, while the ranking was rebuilt only by `update()`. During play, that HUD update is throttled to once per 100 ms. The original resize test waited for canvas dimensions, then checked ranking rows; canvas readiness did not establish HUD readiness. ResizeObserver/native layout delivery and the test's simulated animation clock can expose that gap. The exact WebKit event ordering is inferred from the retained log and source, because its trace could not be materialized locally.

The more serious stopped-state case is reproducible in installed Chromium: ready, paused and dead worlds do not run the periodic HUD update at all. After resizing from desktop to a narrow or short viewport, ten rows remain indefinitely even after advancing the clock. A fourth regression freezes the clock in running play and also reproduces the same stale rows. These four strict five-versus-ten failures establish a product defect without requiring a WebKit-specific assumption.

The first attempted red run included server `ERR_CONNECTION_REFUSED` failures; those are retained and do not count as ranking reproductions. The authoritative unchanged-source red run is `sol61/red/snapshots.log`: all four cases fail on the intended ranking assertions, with no runtime errors. Full world snapshots before/after each resize are equal, so food, bot positions, mass, RNG and simulation time did not cause the row-count change.

## Narrow local correction

Sol 6.1 changes only `resize()` in the arena entry point: after resizing the renderer, clear the HUD throttle deadline and call the normal HUD update before drawing. The ordinary phase guard remains active; this is not a forced phase transition. The resize does not advance simulation, persist new progress, reset input, or repeat the death announcement. Simulation, renderer, CSS, existing games, host code and workflow settings are unchanged.

The existing resize/high-DPI test and its strict five/ten-row assertion are unchanged. Four added regressions cover ready, paused, dead and running states across desktop → portrait → desktop → short landscape without advancing the clock to make the HUD pass. They verify actual canvas readiness and row counts, exact world equality, unchanged best score, no new announcements/errors, and resumed movement where applicable. Red/green logs, screenshots and snapshots are preserved under `sol61/`.

Completed local validation: five targeted Chromium cases passed, then the complete **20-case arena Chromium suite passed** (one run on settled source). Strict TypeScript, all **288 unit tests across 25 files**, and the production build passed; the build produced a 72-file offline manifest with version `24046d9a038d`. Source/evidence hashes and commands are in `sol61/manifest.json`. Offline verification and renderer benchmarks were not repeated for this HUD-only correction; earlier results remain preserved. This local checkpoint is not yet independently reviewed.

## Limits and holds

Local WebKit remains unavailable after the previously recorded installer HTTP 403 `Domain forbidden`; no download retry or bypass was attempted. The failed CI screenshot/trace remains in GitHub artifact `12261214108` and reusable connector file `file_00000000b26481f5aabbf20c1730d183`. Local artifact materialization was blocked before bytes were received by proxy CONNECT `403 Forbidden`; its contents were not inspected locally. No corrected WebKit verification is claimed.

Opening PR 5 automatically deployed a Netlify preview. That was a deployment despite not being manually invoked; it should have been checked before publication under the user's no-deploy restriction. The parent disclosed the side effect. Read-only metadata confirmed production remains the previously published main commit `a7f7631d`. No further push, CI rerun, deployment-triggering write, hosting-setting change, preview deletion or promotion is authorized. The new correction is local only and requires a newly allocated Astra slot before independent review.
