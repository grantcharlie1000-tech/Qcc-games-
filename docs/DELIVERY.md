# Pocket Arcade delivery record

Workspace: `/workspace/Qcc-games-`, branch `work`. Configured repository remote: https://github.com/grantcharlie1000-tech/Qcc-games- (this checkout has not been pushed). Exactly twelve games are implemented and integrated. All twelve game specialists actually used GPT-6.1 Sol, with separate worktrees, original rule engines, skill discovery, tests and reviewed handoffs; see [the build record](AGENT_BUILDS.md). No factory game or shared economy was added.

## Revised cover art and visual evidence

The original posters were replaced at the user's request using the installed [SVG skill](../.agents/skills/svg-skill/SKILL.md). All twelve covers are bespoke original vector illustrations. [Artwork notes](ARTWORK.md) identify the generator, source, validation and ZIP. The SVG validator reports **22 passed, 0 failed**, including the twelve covers and game assets.

The nine supplied reference images were inspected before the shell contract and compared with actual Playwright captures. The library preserves the dark header/divider, cream indicator, broad purple favourites pill, thick rounded card rims, uppercase labels/underlines, saturated mechanic-specific art and two portrait columns at 390px. It expands to three columns at 768px and six at 1366px. Source screenshots and proprietary assets are not distributed.

- Library: [390×844](evidence/home-390.png), [768×1024](evidence/home-768.png), [1366×768](evidence/home-1366.png).
- [Replacement SVG cover ZIP](evidence/arcade-cover-art.zip).
- Each game: production screenshots at 390×844, 768×1024 and 1366×768 under [release evidence](evidence/release/). Phone screenshots also come from the completely offline repository-subpath run. Full-page images may be taller than the viewport because the game controls scroll vertically.
- [All twelve phone screens](evidence/release/games-390.jpg) [tablet screens](evidence/release/games-768.jpg) and [desktop screen contact sheet](evidence/release/games-1366.jpg).

## Twelve-game status

“Playable” below means actual Chromium gameplay and integrated checks; it does not imply unperformed WebKit or physical-device certification. All games implement shared pause, restart, rules, local save/restore and disposal. Logic/browser columns count the final game-specific tests; shell tests are additional.

| Game | Status and implemented gameplay | Engine | Logic / browser cases | Offline root / subpath |
|---|---|---|---|---|
| Fruit Merge | Playable: aim/drop, physical equal-fruit merges and chains, next fruit, settled danger grace and best score | Canvas + Matter.js | 16 / 4 | Passed / passed |
| Water Sort | Playable: legal contiguous pours, nine solver-verified levels in three difficulties, undo/hint, homogeneous-tube win | Pure stacks + SVG | 52 / 6 | Passed / passed |
| Color Blocks | Playable: three-piece 8×8 placement, exact drag ghost, simultaneous row/column clears and combos, legal-move loss | Integer grid + DOM/SVG | 10 / 9 | Passed / passed |
| Tower | Playable: timed alternating-axis drops, overlap cropping, falling overhangs, perfect combos and follow camera | Geometry + Canvas | 15 / 4 | Passed / passed |
| Snake | Playable: fixed-step growth, queued arrows/WASD, swipe/buttons, wall/self loss and replay | Grid + Canvas | 10 / 3 | Passed / passed |
| Minesweeper | Playable: safe first reveal, flood, flags, chords, timer, three board sizes and touch long press | Seeded grid + DOM | 17 / 6 | Passed / passed |
| Solitaire | Playable: 52-card draw-one Klondike, valid sequence moves, foundations, stock recycling, undo/hint and legal completion | Pure card rules + DOM | 14 / 8 | Passed / passed |
| Block Fill | Playable: twelve increasing single-path coverage puzzles, fast tracing, backtrack, undo and current-state solver hint | Graph search + SVG | 8 / 6 | Passed / passed |
| Color Connect | Playable: twelve verified pair puzzles, no crossing, required full coverage, redraw/erase/undo/hint and redundant shapes | CSP + SVG/DOM | 11 / 10 | Passed / passed |
| Ball Run | Playable: real 3D descent, steering/jump, navigable recycled track, gaps/obstacles, falls, distance and best run | Lazy Three.js/WebGL2 | 8 / 4 | Passed / passed |
| Pool | Playable: physical rack/break, solids/stripes, turns/fouls/ball-in-hand, called 8, local computer and pass-and-play | Fixed-step circles + Canvas | 40 / 6 | Passed / passed |
| Animal Stack | Playable: distinct compound animals, mass/rotation/balance, height/support scoring and physical toppling | Canvas + Matter.js | 14 / 3 | Passed / passed |

Pool's coherent local simplifications from WPA are disclosed in its visible rules and [spec](../src/games/pool/SPEC.md): only the 8 pocket is called; fixed opening rack/breaker; simplified break foul choices and automatic break-8 respot; no spin or tournament conduct rules. Solitaire uses standard seeded deals, which are not promised to be winnable. Ball Run displays a useful fallback if WebGL2 is unavailable. These are stated product limits, not hidden placeholders.

## Executed release checks

| Check | Actual result | Evidence |
|---|---|---|
| Strict TypeScript + production Vite build | Passed; complete 57-file offline manifest | [build output](evidence/release/build.txt) |
| Integrated Vitest rules/storage | **223 passed, 0 failed**, 16 files | [JSON results](evidence/release/unit-results.json) |
| Integrated Chromium gameplay suite | **75 passed, 0 failed**, 3.0 minutes | [run output](evidence/release/chromium-e2e.txt) |
| Final Minesweeper production interaction suite | **6 passed, 0 failed**, 19.6 seconds | [production run](evidence/release/minesweeper-production-e2e.txt) |
| Original SVG validation | **22 passed, 0 failed** | Installed skill validator; [art notes](ARTWORK.md) |

The 75-case suite preceded the final Minesweeper CSS asset-only correction. All six Minesweeper cases, including the new image URL/decode assertion, were then independently rerun against the final emitted production output. Other game implementations were unchanged. The stricter production offline asset gate was observed failing on the old output with `/assets/game-art/minesweeper/tile.svg` HTTP503; that [expected red result](evidence/release/minesweeper-asset-red.txt) is retained.

Game interactions cover mouse/trackpad-equivalent pointer input, keyboard, native Chromium touch, genuine wins/losses, undo/hints, pause/restart, local restore, malformed snapshots and exit/re-entry. They are not screenshot-only smoke tests. Examples include a twelve-garden pointer playthrough; actual 8-ball winning and losing pots; legal card moves and full foundations; a real keyboard jump across a 3D gap; merge/danger behavior; a six-animal transient-impact restore; and a touch flag held longer than two seconds.

The parent also independently cross-reviewed all games and shared services. Corrected defects included storage quota fallback reading stale disk data, cache write failures disrupting successful online requests, premature worker activation, games mounting behind open dialogs, a legal Solitaire hint fallback, Animal Stack impact restoration, Minesweeper long-hold release, Water Sort's exact homogeneous goal, Color Connect gesture save transactions/focus, and a production CSS asset URL that hid covered Minesweeper tiles. Browser fixture writes now wait for route disposal, and the Pool restore assertion uses a paused test clock to compare exact ball state.

## Production offline and updates

**24/24 offline gameplay checks passed**: twelve games at `/`, then the same twelve at `/Qcc-games-/`, on two separate local origins. Each fresh browser context downloaded the complete 57-file pack, disabled network access, reloaded the library and performed real in-game input, pause/save/restart and library navigation. Final pack version: `bf379fc014bf`. All tested viewports fit without horizontal document overflow. Required local requests had **zero HTTP errors or failed fetches**, external runtime requests were **zero**, and page errors were **zero**. Both initial menus kept heavy game chunks lazy. Stale scope caches were removed while an existing high score survived. See [offline results](evidence/release/offline-results.json) and [run output](evidence/release/offline-check.txt).

The real two-version/two-tab update test also passed: the deployed old lazy chunk was deliberately removed from the server, yet the old tab still played it offline from its pack. The new worker waited until both old tabs closed, then activated, cleaned old caches, preserved the high score and loaded the new lazy chunk. See [update results](evidence/release/update-results.json).

A completed download is specific to that browser, device, storage partition and origin. It does not transfer between GitHub Pages and Netlify. Browser eviction, private mode or managed-device policy may remove or disable storage. Cached play does not bypass device/network controls. A fresh version requires its own pack download. Waiting updates retain older tabs' chunks until all those tabs close; scores live separately and survive cache cleanup.

## Measurements and payload

Forty-five consecutive RAF intervals were sampled after one interaction in each game, with one browser active. Puzzle boards may be idle after that interaction; these are scheduler samples, not simulation throughput or sustained FPS.

| Game | Root median / p95 (ms) | Subpath median / p95 (ms) |
|---|---|---|
| Fruit Merge | 16.7 / 33.4 | 16.7 / 33.4 |
| Water Sort | 16.7 / 66.7 | 16.7 / 33.4 |
| Color Blocks | 16.7 / 16.8 | 16.7 / 16.8 |
| Tower | 16.7 / 16.7 | 16.7 / 16.8 |
| Snake | 16.7 / 16.7 | 16.7 / 16.7 |
| Minesweeper | 16.7 / 16.8 | 16.7 / 16.8 |
| Solitaire | 16.7 / 16.8 | 16.7 / 16.7 |
| Block Fill | 16.7 / 16.8 | 16.7 / 16.8 |
| Color Connect | 16.7 / 50.0 | 16.7 / 16.8 |
| Ball Run | 16.7 / 16.8 | 16.7 / 16.7 |
| Pool | 16.7 / 16.8 | 16.7 / 16.8 |
| Animal Stack | 16.7 / 16.8 | 16.7 / 16.7 |

These short RAF samples describe frame scheduling in this shared headless Linux container, using software WebGL; they are not sustained game benchmarks or measurements on a school Chromebook, managed Mac, touch device or physical trackpad. Concurrent browser runs produced slower samples too; individual game evidence retains those results. No universal 60 FPS claim is made. Ball Run reports nine draw calls and four geometries, and its lifecycle test verifies the old WebGL context is lost after disposal.

The build payload is recorded in [payload.json](evidence/release/payload.json). Entry JavaScript is 17,058 bytes (6,527 gzip), entry CSS 7,957 bytes (2,700 gzip); the bundled font is approximately 28KB. The full offline manifest contains 57 requests, 1,052,240 bytes uncompressed including repeated root/index content and bundled third-party notices. Matter.js and Three.js are lazy game dependencies; initial-menu requests were checked to exclude heavy game chunks. Ball Run's Three.js-containing chunk is approximately 491KB raw / 125KB gzip. Gzip figures are calculated from built files; actual host compression depends on hosting configuration. Sourcemaps are excluded from the required offline pack. The distributed [third-party notices](../public/THIRD_PARTY_NOTICES.txt) include the dependency and font licences.

## Deployment and remaining verification

`npm ci`, `npm run dev` for local development; `npm run build` produces `dist/`. The same output serves at `/` and `/Qcc-games-/`. Hash routes need no SPA rewrite. Service workers require HTTPS or localhost. [Pages Actions](../.github/workflows/pages.yml) runs unit/browser/build/production checks before publishing; [Netlify config](../netlify.toml) builds and publishes the static output with local-only CSP. No application secrets are required. See [README](../README.md) for all commands.

**No hosted deployment was performed or verified, and no live URL is claimed.** An account must enable Pages or connect the repository to Netlify. Local static-server verification is not a substitute for checking a published origin.

**WebKit remains unverified.** Its Playwright executable is absent (`webkit-2370/pw_run.sh`); attempts to download from the official Playwright hosts were rejected with policy HTTP403. Actual launch failed before page interaction. Chromium 154.0.8037.57 is available and used. CI is configured to install Chromium and WebKit; those future results are not claimed. Seven native CDP touch cases are explicitly Chromium-only; the other interactions target both engines. Physical managed-device, screen-reader and sustained hardware-performance validation remain outstanding. Cross-browser acceptance is therefore incomplete even though all twelve games are playable in the verified Chromium environment.
