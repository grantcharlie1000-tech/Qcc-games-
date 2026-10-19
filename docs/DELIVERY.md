# Pocket Arcade delivery record

Workspace: `/workspace/Qcc-games-`, branch `work`. Repository: https://github.com/grantcharlie1000-tech/Qcc-games-, deployment source branch `main`. Exactly twelve games are implemented and integrated. All twelve game specialists actually used GPT-6.1 Sol, with separate worktrees, original rule engines, skill discovery, tests and reviewed handoffs; see [the build record](AGENT_BUILDS.md). No factory game or shared economy was added.

## Revised cover art and visual evidence

The original posters were replaced at the user's request using the installed [SVG skill](../.agents/skills/svg-skill/SKILL.md). All twelve covers are bespoke original vector illustrations. [Artwork notes](ARTWORK.md) identify the generator, source, validation and ZIP. The SVG validator reports **22 passed, 0 failed**, including the twelve covers and game assets.

The nine supplied reference images were inspected before the shell contract and compared with actual Playwright captures. The library preserves the dark header/divider, cream indicator, broad purple favourites pill, thick rounded card rims, uppercase labels/underlines, saturated mechanic-specific art and two portrait columns at 390px. It expands to three columns at 768px and six at 1366px. Source screenshots and proprietary assets are not distributed.

- Library: [390×844](evidence/home-390.png), [768×1024](evidence/home-768.png), [1366×768](evidence/home-1366.png).
- [Replacement SVG cover ZIP](evidence/arcade-cover-art.zip).
- Each game: production screenshots at 390×844, 768×1024 and 1366×768 under [release evidence](evidence/release/). Phone screenshots also come from the completely offline repository-subpath run. Full-page images may be taller than the viewport because the game controls scroll vertically.
- [All twelve phone screens](evidence/release/games-390.jpg) [tablet screens](evidence/release/games-768.jpg) and [desktop screen contact sheet](evidence/release/games-1366.jpg).

## Study Mode

The first visit in a tab offers 20 NCEA-related topics across eight subjects. The choice survives reload through sessionStorage. Esc pauses and saves the current game synchronously, then opens an original full-page textbook chapter; Return restores the retained game instance. Native reading keys, modal dialogs, late imports, interrupted drags, manual pause and hidden-page return are covered. Articles and all 20 labelled SVG diagrams are in the shell bundle, with no switch-time requests. See [topics, sources, implementation and screenshots](STUDY_MODE.md).

## Twelve-game status

“Playable” below means actual Chromium gameplay and integrated checks; it does not imply unperformed WebKit or physical-device certification. All games implement shared pause, restart, rules, local save/restore and disposal. Logic/browser columns count the final game-specific tests; shell tests are additional.

| Game | Status and implemented gameplay | Engine | Logic / browser cases | Offline root / subpath |
|---|---|---|---|---|
| Fruit Merge | Playable: aim/drop, physical equal-fruit merges and chains, next fruit, settled danger grace and best score | Canvas + Matter.js | 16 / 5 | Passed / passed |
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
| Animal Stack | Playable: distinct compound animals, mass/rotation/balance, height/support scoring and physical toppling | Canvas + Matter.js | 14 / 4 | Passed / passed |

Pool's coherent local simplifications from WPA are disclosed in its visible rules and [spec](../src/games/pool/SPEC.md): only the 8 pocket is called; fixed opening rack/breaker; simplified break foul choices and automatic break-8 respot; no spin or tournament conduct rules. Solitaire uses standard seeded deals, which are not promised to be winnable. Ball Run displays a useful fallback if WebGL2 is unavailable. These are stated product limits, not hidden placeholders.

## Executed release checks

| Check | Actual result | Evidence |
|---|---|---|
| Strict TypeScript + Vite production build | Passed; pack `43dc049b82cb` | [build output](evidence/release/build.txt) |
| Integrated Vitest logic/storage/catalogue | **228 passed, 0 failed**, 17 files | [JSON](evidence/release/unit-results.json) |
| Full Chromium gameplay/Study suite | **105 passed, 0 failed, 0 flaky**, 3.8 minutes | [run output](evidence/release/chromium-e2e.txt), [JSON](evidence/release/chromium-results.json) |
| Final production Solitaire interactions | **8 passed, 0 failed** | [output](evidence/release/solitaire-study-production.txt) |
| Final production Study keyboard/restoration | **4 passed, 0 failed** | [output](evidence/release/study-final-production.txt) |
| Production offline gameplay + Study | **24/24 game checks**, **20 articles at each of two paths** | [results](evidence/release/offline-results.json) |
| Two-release/two-tab worker update | Passed; scores preserved | [results](evidence/release/update-results.json) |
| Study SVG validation | **20 passed, 0 failed** | [skill/generator notes](../src/study/SKILL_USAGE.md) |

The full 105-case run includes all 75 existing game/shell cases, 28 new Study cases and two paused-render cases. It preceded a final **text-only** Solitaire instruction correction: selecting the same card again clears selection, since Esc now opens Study. All eight Solitaire cases and four affected Study cases then passed against the final emitted production build; final unit/offline/update checks also use that build. No gameplay engine changed after the full run. The original cover-art validator separately passed 22 SVG assets.

Interactions use real mouse/trackpad-equivalent pointer, keyboard and native Chromium touch input, with genuine legal moves, wins/losses, undo/hints, saves and restoration. Study tests verify every game's serialized state remains frozen through the six-second autosave window, same-instance return, all topic choices, first visit/fresh tabs, blocked storage, menus/rules, a delayed import, native Space scrolling, keyboard topic changes, a live card drag and focus restoration. The [independent review](evidence/study-review.md) caught and resolved retained game keyboard handlers, reading offsets, hidden Canvas work and a queued menu-close rebuild. Original game owners supplied isolated adapter and text fixes; see [handoffs](AGENT_BUILDS.md).

## Production offline and updates

A fresh browser context cached all 57 required files, disabled network access, reloaded and played all 12 games at `/`, then repeated on a separate origin under `/Qcc-games-/`. Each game performed actual input, pause/save/restart and Study return. All 20 chapters were switched at each path. Study switches made **zero requests**; external requests, failed assets and page errors were also **zero**. Initial menus kept Matter.js/Three.js and game chunks lazy. Offline pack: **43dc049b82cb**. See [results](evidence/release/offline-results.json) and [run output](evidence/release/offline-check.txt).

The real two-version/two-tab update test removed an old lazy chunk from the server. An old tab still played it offline from its complete pack. The next worker waited until both old tabs closed, then activated, removed stale caches and preserved the high score. [Update evidence](evidence/release/update-results.json).

Downloads are specific to browser, device, storage partition and origin. Private browsing, eviction or managed policy may prevent retention. Cache cleanup does not delete scores. Offline caching cannot bypass device/network controls. New releases require a fresh complete pack.

## Measurements and payload

One synthetic Escape was synchronously dispatched inside each cached game at each path: 24 samples, **13.8ms median**, 7.9–36.7ms range. This measures the handler including pause/serialization/render setup; it excludes input delivery and paint. Trusted keyboard events are tested separately. These are container measurements, not hardware response guarantees.

Forty-five consecutive RAF intervals were sampled after one interaction in each game, with one browser active. Puzzle games may be idle: these are scheduler samples, not simulation throughput or sustained FPS.

| Game | Root median / p95 (ms) | Subpath median / p95 (ms) |
|---|---|---|
| animal-stack | 16.7 / 33.3 | 16.7 / 16.7 |
| ball-run | 16.7 / 16.7 | 16.7 / 16.8 |
| block-fill | 16.7 / 16.8 | 16.7 / 16.8 |
| color-blocks | 16.7 / 116.7 | 16.7 / 16.8 |
| color-connect | 16.7 / 16.8 | 16.7 / 50.0 |
| fruit-merge | 16.7 / 33.4 | 16.7 / 33.4 |
| minesweeper | 16.7 / 16.8 | 16.7 / 16.8 |
| pool | 16.7 / 16.8 | 16.7 / 16.8 |
| snake | 16.7 / 16.7 | 16.7 / 16.7 |
| solitaire | 16.7 / 16.8 | 16.7 / 16.8 |
| tower | 16.7 / 16.8 | 16.7 / 16.8 |
| water-sort | 16.7 / 66.7 | 16.7 / 66.7 |

The headless Linux Chromium run uses software WebGL. These figures do not certify a physical Chromebook, managed Mac, GPU, trackpad or sustained 60 FPS. Ball Run's existing lifecycle test checks renderer disposal and its in-game unsupported-WebGL fallback.

[Payload](evidence/release/payload.json): entry JavaScript **116,203 bytes / 35,682 gzip**, entry CSS **16,066 / 4,677 gzip**, plus a local font of approximately 28KB. The larger entry includes every original chapter and inline diagram so reading never loads another file. Total required offline bytes: **1,159,744**, counting repeated root/index responses and licence notices, across 57 requests. Matter.js and Three.js remain lazy. Gzip sizes are calculated from built files, not measured host transfers. Third-party/font licences ship in `THIRD_PARTY_NOTICES.txt`.

## Deployment and remaining verification

`npm ci`, `npm run dev`; `npm run build` produces `dist/`. The same build serves at root and repository subpath using hash routes and relative assets. Service workers require HTTPS or localhost. [Netlify configuration](../netlify.toml) and [Pages Actions](../.github/workflows/pages.yml) are checked in. No application secrets or backend are needed.

Study Mode is published at **https://mauri-gazette.netlify.app**, verified through the requested Netlify connector: ready production deploy `6ad5fcc65c43d750cebd7d5c`, source commit `2dbfce1`, published 2026-10-19T11:19:48.900Z. **Automatic deployment from main was observed and verified.** [Publication evidence](NETLIFY_DEPLOYMENT.md) records the matching source tree and update path. Direct live-origin browser/HTTP access is blocked by this environment's proxy; host headers and live-origin offline behavior remain unverified. GitHub Pages publication is not claimed.

**WebKit and physical devices remain unverified.** The actual WebKit attempt failed before launch because `webkit-2370/pw_run.sh` is missing; official download hosts previously returned policy403. [Launch evidence](evidence/study-webkit-unavailable.txt). Chromium 154.0.8037.57 keyboard, pointer and viewport checks passed, including 390×844, 768×1024 and 1366×768. No physical Chromebook, managed Mac, screen-reader or sustained hardware-performance test was available. Cross-browser/hardware acceptance therefore remains incomplete; no unavailable check is labelled passed.
