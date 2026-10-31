# Movies & TV verification — 2026-10-30

These are the results for the streaming-style redesign and the glass island.

CI ran on bcc9197 ("Verify and deploy arcade", run 285) and passed every job:

| Check | Result |
| --- | --- |
| Unit tests (`npm test`) | Passed |
| Build, `verify:update` and `verify:offline` | Passed |
| Campaign regression, Chromium and WebKit | Passed |
| Full browser suite, Chromium | 828 passed, 1 skipped |
| Full browser suite, WebKit (Desktop Safari, two device pixels per CSS px) | 785 passed |

The later commits were checked in Chromium before they were pushed. The pull request shows CI for the latest commit.

| Commit | Checks |
| --- | --- |
| 303c3db, Movies focus, search, look and tests | `npm run check`; 365 unit tests in `tests/core` and `tests/movies`; 432 browser tests in `tests/movies` and the four glass specs |
| db48f6d and 4b0627b | 25 rail tests, 14 lens tests and 33 lens unit tests |
| b76d116, main's #77 merged in | the study spec, 36 passed |

What these runs do not cover:

- WebKit runs as Desktop Safari at two device pixels per CSS px. An iPhone draws three, and no CI job runs on an iPhone.
- Playback runs against local fixture pages. No real streaming provider is contacted.
- The island's label legibility was judged by measurement in Chromium over the games' real artwork, not by a committed test.

---

# Movies & TV verification — 2026-10-25

This is the record from 2026-10-25, before the streaming-style redesign and the glass island. It is kept as history.

## Final feature model

The user authorized normal provider/image requests, required actual movie pictures rather than generated art, and explicitly confirmed that streaming should remain enabled. The final implementation uses real TMDB image URLs and sandboxed FrameXTV embeds. It does not claim zero exposure, verified external streaming rights, or guaranteed provider availability. Generated movie artwork and preview screenshots containing it have been removed.

## Completed checks

| Check | Result |
| --- | --- |
| Feature unit/integration tests | 5 files, 13 tests passed: catalog/search/routes, constrained image URLs, local storage, operator importer, optional local media and documented provider URL/sandbox policy. |
| Final feature Chromium browser suite | 16 tests passed, including 320/390/768/1366 layouts and the movie scroller's overflow; real-art URL configuration; enabled movie/TV playback; list/search/Home; episode/grid scroll/focus; Study pause/unload/manual resume; native player; origin/source-checked local external progress and seek; blocked storage; CSP; parent isolation, popups/top-navigation/camera denial. |
| Production build | Passed TypeScript, optional local-media rights validation, Vite and offline manifest. Existing large game chunk warnings remain. |
| `node scripts/verify-movies.mjs` | Passed against production output at `/` and `/Qcc-games-/`, using explicit transport fixtures for approved image/player origins. Confirms lazy provider loading, sandbox/referrer policy, Study unloading, no movie content in worker/game pack caches, honest offline catalog failure and 18 game cards. Does not assert live provider/image availability. |
| Final complete unit suite | **123 files / 2,742 tests passed**, with a successful exit. |
| Existing offline game verifier | All 18 games plus Study exercised successfully at root; the first subpath run passed 5 games then timed out in Snake. A constrained rerun of Snake and the remaining 12 games passed at both root and subpath. Combined coverage includes all 18 games at both paths. After enabling direct artwork, the updated offline audit also passed Snake plus Study at both paths, with only the narrowly approved library-thumbnail requests recorded separately from game-asset failures. Offline card rendering does not initiate new image requests. |
| Independent review | Fixed shell focus/menu interference, teardown progress writes, Home/global search, TV hero episode resolution, movie/Study scrolling, iframe sizing, external progress persistence and origin/source checks. |

## Complete browser run and follow-up

The complete 714-case browser invocation exited with **316 passed, 393 failed, 4 skipped and 1 did not run**. This is not a green full-suite result.

- 354 WebKit cases could not launch because WebKit is missing. Its installer was attempted and blocked by the workspace network policy (HTTP 403).
- 34 Chromium cases could not create video-recording pages because Playwright's bundled FFmpeg was missing. The existing system FFmpeg was configured for a targeted rerun; results are recorded below after completion.
- Two online multiplayer cases initially could not find Playwright's bundled Chromium. Rerunning with `/usr/bin/chromium` reached the existing room-creation checks, but PeerJS room creation timed out. The environment's outbound policy does not allow the required PeerJS Cloud host. Online gameplay is not reported as verified.
- Two game checks timed out (Block Fill's full campaign and Neon Coil recovery) and one feature scroll check failed during ongoing UI/artwork changes. The feature scroll issue was fixed by preserving poster layout on load/error and passes in the final 16-test suite. Both game cases subsequently passed in the targeted rerun.

The targeted 61-case game rerun recorded 59 passes and 2 failures; the remaining Ball Run restart and Block Fill touch cases both passed in a separate, idle 2-case rerun. Thus every case in that targeted set has a passing result, but the earlier full-suite run remains red and is not relabelled as a clean single run. The final complete unit run exited successfully with 123 files and 2,742 tests passed. An earlier concurrent unit run passed its assertions but reported one Vitest worker RPC timeout; it is not counted as a successful suite. Earlier interrupted runs and timing failures are not counted as passes. New provider/layout browser tests use transport fixtures to isolate application correctness from live service availability; fixtures are not shipped in production.

## Follow-up after the full hosted run

On head `742894e`, the hosted browser job completed 697 tests, skipped 26 and failed one Chromium Blockcraft multiplayer assertion in 46.4 minutes. The test used an ordinary chest click, which correctly picked the diamonds up to the cursor, then incorrectly expected them in the inventory. It now uses the game's Shift-click quick-move. The existing local Chromium chest UI test passed with that interaction.

The follow-up [hosted run #135](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/40239708391) on `49d123c` passed all five jobs: Chromium 361 passed / 1 skipped (32.4 minutes), WebKit 337 passed / 25 skipped (23.4 minutes), both campaign regressions, and the build/unit/update/offline job. Across browsers that is 698 passed, 26 skipped and no failures. Chromium and WebKit now run in separate parallel jobs, reducing total browser wall time from 46.4 minutes to 32.4 minutes; Chromium also runs the online multiplayer scenarios that WebKit skips.

## Network and licensing limits

The environment denies direct TMDB and FrameXTV access. Provider/image requests are permitted by application CSP as requested, but live image rendering and actual stream playback could not be confirmed here. `MOVIES_LIVE=1 node scripts/verify-movies.mjs` enables an explicit live audit in an environment with access. The default audit output identifies its fixture mode. It is not a packet capture or a guarantee about downstream tracking or device security.

The app supplies no DRM bypass, stream extraction, credentials, parent-page provider scripts or server-side streaming proxy. FrameXTV and downstream services can observe ordinary playback activity and may serve ads/use cookies. Browser isolation mitigates parent-page/device-capability risks; it does not establish content distribution rights or a clean downstream supply chain. QCC's list/progress are stored locally; a selected stream's resume position is sent as a normal seek control.

No TMDB API token/approved logo was supplied; the operator importer is mocked in integration tests. The starter catalog has 8 titles, real CDN artwork URLs, original summaries, no invented ratings and limited episode coverage. Configure a reviewed TMDB snapshot to broaden discovery and verify attribution/commercial terms. Optional local media remains subject to explicit documented rights review.

Commits and the PR title include `[skip netlify]` to suppress automatic Netlify branch/preview deployment. CI verification jobs still run. The PR description and check timeline carry the final hosted run result.
