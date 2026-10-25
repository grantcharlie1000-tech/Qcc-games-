# Movies & TV verification — 2026-10-25

## Completed checks

| Check | Result |
| --- | --- |
| `npm test -- --maxWorkers=1` | 122 test files, 2,740 tests passed. Includes game models, storage, Study, navigation, leaderboard integration and worker/update tests. |
| `npm test -- tests/movies` after final UI changes | 4 files, 11 tests passed: catalog/routes/search, fail-closed licensed sources, local storage, runtime privacy/CSP boundaries and mocked operator TMDB import. |
| Dedicated Chromium movie browser suite | 11 tests passed. Desktop/Chromebook/mobile widths, full-width launch/decorative posters, search/genres, list, episodes, unavailable playback, native licensed movie/TV fixture, Home reset, global Search, grid/episode scroll and focus restoration, Study scrolling/pause, blocked storage, failure/deep links and CSP enforcement. |
| `npm run build` | Passed, including TypeScript, media-rights preflight, Vite production bundle and offline manifest generation. Existing large-game-chunk warnings remain. |
| `node scripts/verify-movies.mjs` | Passed against production output at `/` and `/Qcc-games-/`. Zero external requests or page errors; no iframes/media/DNS hints on discovery; no movie content in worker caches or game pack; honest offline catalog failure; 18 game cards and 5 bundled decorations still available offline. |
| SVG parse validation and `git diff --check` | Passed. 13 original SVG files validated. |
| Independent review | Completed. Fixed shell focus/menu interference, detached-video progress writes, episode return scroll/focus, Home filter reset, global search scope, TV hero episode resolution and Study document scrolling. |

The source was frozen after the reference-based Netflix-style desktop/mobile redesign and its focused regression checks. Visual evidence is in [the evidence directory](evidence/movies/); source references and their application are recorded in [the design reference record](MOVIES_TV_DESIGN_REFERENCES.md).

## Full browser and existing game offline runs

Results are recorded here after the final runs complete.

WebKit is not installed in this environment. `npx playwright install webkit` was attempted; the environment network policy returned HTTP 403 `Domain forbidden` for the Playwright download host. This is a test environment limitation, not a passing WebKit result. The repository's existing CI installs browser engines and must verify WebKit before approval.

Earlier development runs were interrupted for requested redesign/review fixes, and one attempt lost a shared Vite server. They are not counted as final passes. Final runs use a separately owned server and separate artifact directories. One early concurrent unit run passed its assertions but encountered a Vitest worker RPC timeout; the subsequent complete unit run exited successfully with the 2,740 passes above.

## Privacy evidence and limits

Production network capture uses a clean Chromium context and records all application requests at root and repository subpath. Every observed request stays on the tested origin. Static inspection rejects provider code/URLs, frames, tracking, DNS hints and proxy integration in `src/movies`. Browser CSP tests inject external frame/media/image/script/fetch attempts and verify the effective blocking directives and absence of external responses. Browser event reporting can include CSP-blocked attempts; this is not a packet-level DNS capture or an audit of browser extensions or vendor background services.

The worker excludes the entire scoped `movies/` subtree and the offline builder excludes `dist/movies`. Only shared JS/CSS and inline original launch-card illustrations travel with the shell. First-party hosting must serve movie paths statically with no provider redirects/proxies or request-triggered upstream fetches. Existing opt-in game PeerJS permissions remain; the Movies section never initializes them. No FrameXTV or downstream resources, libraries, iframe controllers, proxies or extraction tools are integrated.

## Licensing and release limitations

No licensed full movie/episode media, TMDB credential, or approved TMDB logo was supplied. Consequently all starter playback is disabled and the shipped catalog is explicitly a starter selection with original summaries/illustrations, no ratings and limited episode coverage. A generated silent CC0 solid-color fixture tests the native movie and TV player; it is excluded from production output. The TMDB importer was tested with a mocked upstream, not a live API account. Production metadata caching/image terms, commercial status, approved attribution logo and individual media distribution rights require operator review. There is no DRM, geographic restriction or copyright bypass.

No merge or deployment was performed. Both commit and PR title carry `[skip netlify]` to suppress automatic Netlify branch/preview deployment. Existing CI may run verification jobs.
