# Movies & TV verification — 2026-10-25

## Final feature model

The user authorized normal provider/image requests, required actual movie pictures rather than generated art, and explicitly confirmed that streaming should remain enabled. The final implementation uses real TMDB image URLs and sandboxed FrameXTV embeds. It does not claim zero exposure, verified external streaming rights, or guaranteed provider availability. Generated movie artwork and preview screenshots containing it have been removed.

## Completed checks

| Check | Result |
| --- | --- |
| Feature unit/integration tests | 5 files, 13 tests passed: catalog/search/routes, constrained image URLs, local storage, operator importer, optional local media and documented provider URL/sandbox policy. |
| Final feature Chromium browser suite | 15 tests passed, including 320/390/768/1366 layouts and the movie scroller's overflow; real-art URL configuration; enabled movie/TV playback; list/search/Home; episode/grid scroll/focus; Study pause/unload/manual resume; native player; origin/source-checked local external progress and seek; blocked storage; CSP; parent isolation, popups/top-navigation/camera denial. |
| Production build | Passed TypeScript, optional local-media rights validation, Vite and offline manifest. Existing large game chunk warnings remain. |
| `node scripts/verify-movies.mjs` | Passed against production output at `/` and `/Qcc-games-/`, using explicit transport fixtures for approved image/player origins. Confirms lazy provider loading, sandbox/referrer policy, Study unloading, no movie content in worker/game pack caches, honest offline catalog failure and 18 game cards. Does not assert live provider/image availability. |
| Full unit suite before provider expansion | 122 files / 2,740 tests passed. A complete run including the final provider tests is recorded below when finished. |
| Existing offline game verifier | All 18 games plus Study exercised successfully at root; the first subpath run passed 5 games then timed out in Snake. A constrained rerun of Snake and the remaining 12 games passed at both root and subpath. Combined coverage includes all 18 games at both paths. |
| Independent review | Fixed shell focus/menu interference, teardown progress writes, Home/global search, TV hero episode resolution, movie/Study scrolling, iframe sizing, external progress persistence and origin/source checks. |

## Complete browser run and follow-up

The complete 714-case browser invocation exited with **316 passed, 393 failed, 4 skipped and 1 did not run**. This is not a green full-suite result.

- 354 WebKit cases could not launch because WebKit is missing. Its installer was attempted and blocked by the workspace network policy (HTTP 403).
- 34 Chromium cases could not create video-recording pages because Playwright's bundled FFmpeg was missing. The existing system FFmpeg was configured for a targeted rerun; results are recorded below after completion.
- Two online multiplayer cases initially could not find Playwright's bundled Chromium. Rerunning with `/usr/bin/chromium` reached the existing room-creation checks, but PeerJS room creation timed out. The environment's outbound policy does not allow the required PeerJS Cloud host. Online gameplay is not reported as verified.
- Two game checks timed out (Block Fill's full campaign and Neon Coil recovery) and one feature scroll check failed during ongoing UI/artwork changes. The feature scroll issue was fixed by preserving poster layout on load/error and passes in the final 15-test suite. The game cases are included in the isolated regression rerun.

A targeted 61-case game rerun and final complete unit run are in progress; exact results are added before completion. Earlier interrupted runs and timing failures are not counted as passes. New provider/layout browser tests use transport fixtures to isolate application correctness from live service availability; fixtures are not shipped in production.

## Network and licensing limits

The environment denies direct TMDB and FrameXTV access. Provider/image requests are permitted by application CSP as requested, but live image rendering and actual stream playback could not be confirmed here. `MOVIES_LIVE=1 node scripts/verify-movies.mjs` enables an explicit live audit in an environment with access. The default audit output identifies its fixture mode. It is not a packet capture or a guarantee about downstream tracking or device security.

The app supplies no DRM bypass, stream extraction, credentials, parent-page provider scripts or server-side streaming proxy. FrameXTV and downstream services can observe ordinary playback activity and may serve ads/use cookies. Browser isolation mitigates parent-page/device-capability risks; it does not establish content distribution rights or a clean downstream supply chain. QCC's list/progress are stored locally; a selected stream's resume position is sent as a normal seek control.

No TMDB API token/approved logo was supplied; the operator importer is mocked in integration tests. The starter catalog has 8 titles, real CDN artwork URLs, original summaries, no invented ratings and limited episode coverage. Configure a reviewed TMDB snapshot to broaden discovery and verify attribution/commercial terms. Optional local media remains subject to explicit documented rights review.

No merge/deployment is performed. Commit and PR title include `[skip netlify]` to suppress automatic Netlify branch/preview deployment. CI may run verification jobs.
