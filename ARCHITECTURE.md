# Pocket Arcade architecture

Twenty-one games: Fruit Merge, Water Sort, Color Blocks, Tower, Snake, Neon Coil, Minesweeper, Solitaire, Block Fill, Color Connect, Ball Run, Pool, Animal Stack, Flappy Bird, Globle, Blockcraft, Maze Muncher, Corn Clicker, Slipline, Quadfall, Fivefold. No factory game, currency, ads, tracking or runtime CDN. Username/password accounts are optional; guests keep local-only saves. External requests are limited to optional account/save sync and the shared leaderboard (same origin), the Movies & TV images and streaming players described below, and, only when a player opens online play in Pool or Blockcraft, PeerJS Cloud signalling plus a same-origin TURN credential function (see [online multiplayer](docs/MULTIPLAYER.md)).

## Static shell

Vite 7, strict TypeScript, semantic DOM/CSS; no application framework. Hash routes `#/game/<id>` work at the origin root and any repository subpath. Vite's relative base `./` is authoritative. All assets use `import.meta.env.BASE_URL` or relative imports. Locally bundled Lilita One (OFL) supplies the bold, playful lettering. The nine user-provided images, inspected as the contact sheet and detailed originals under `/workspace/arcade-references`, set portrait proportions, dark rims, two-column mobile layout, saturated artwork and minimal header. The original wallet and advertising control was removed, and the later top bar too. The library has no header. A glass tab bar at the bottom holds Games, Movies, TV Shows, My list, Study and Menu, and favourites and search live in the Menu sheet.

`src/core/catalog.ts` contains twenty-one cards and lazy game loaders. A game imports no other game. Matter.js is only imported by physics games; Three.js only by Ball Run, Globle and Blockcraft; globe.gl only by Globle. Blockcraft also starts module Web Workers (`src/games/blockcraft/world/worker.ts`, emitted as a hashed same-origin asset and included in the offline pack) for terrain generation, and falls back to time-sliced main-thread generation if workers are unavailable. `src/main.ts` owns routes, lifecycle, toolbar, pause overlay, rules dialog, autosave, settings, sound and favourites.

Shared presentation for Movies & TV and the tab bar: `src/theme.css` holds the design tokens and the `ui-` components, and it is imported first. `src/ui/` holds the icons, image load states, rail scrolling, the tab bar that minimizes into a capsule on scroll, the glass island (its pill, press and lens), the sheet helpers and the input mode that decides whether focus rings show (`focus.ts`). Games keep their own styles.

## Study Mode

`src/study/` contains 20 original NCEA-related textbook chapters, eager raw SVG diagrams, sessionStorage validation and reading UI. An account/guest entry prompt precedes Study on a new browser; the guest choice is remembered locally. A first visit in a tab selects a topic before play. The shell captures Escape before native dialog cancellation and game-local keys, pauses/serializes synchronously and retains the instance/DOM. Visibility plus inert preserves Canvas dimensions; keyboard capture isolates retained global handlers while preserving native reading defaults. Return restores focus/scroll and resumes only a previously running game in a visible tab. Changing chapters or following contents never imports a module, fetches content or changes the hash route. [Feature guide and evidence](docs/STUDY_MODE.md).

## Frozen module API

See `src/core/types.ts`. Each `src/games/<id>/index.ts` default-exports a `GameModule` with id, title, cover (relative art path), rules (plain text), and `mount(container, context)`. Mount returns a `GameInstance` synchronously or asynchronously. The instance implements pause, resume, restart, serialize, restore and dispose. Parent restores once after mount, snapshots every five seconds and on pause/leave/pagehide, and disposes before navigation. `restore(unknown)` must validate data and safely ignore an invalid or incompatible snapshot. `restart()` must fully reset the run and work while paused. Avoid unsaved entropy: serialize seeds, queues, progress and relevant physics bodies.

Context: readonly `id`, mutable-in-place readonly-facing `settings` (sound, reducedMotion, colorBlind), initial `highScore`; `setScore(number)`, `setLevel(string|number)`, `setStatus(string)`, `announce(string)`, `save(unknown)`, and `sound('tap'|'success'|'lose')`. Scores must be nonnegative and monotonically represent a run where appropriate; parent records maximum. All listeners, RAFs, timeouts, observers, bodies and GPU resources are owned and released by the module. Hidden pages pause; returning does not unexpectedly resume a real-time game.

## Shared presentation

Common classes: `.game-button`, `.game-button.secondary`, `.game-controls`, `.game-select`, `.game-help`, `.game-panel`, `.game-message`. Put game-specific CSS in its own directory, prefix selectors with its slug or an abbreviation. During play, `.game-view` is a fixed `100dvh` layer and document scrolling is locked. Animal Stack, Water Sort, Color Blocks, Ball Run and Blockcraft fill `#game-stage` and reserve the compact shared HUD; their portrait scene-width variables are defined in `src/game-viewport.css`. The other eight existing logical layouts are uniformly fitted by `src/core/viewport-fit.ts`, observing natural root and available dimensions without changing physics units. Body-level drag ghosts remain untransformed. Leaving play or entering Study restores document scrolling; leaving for the library restores its prior offset. Prefer logical board coordinates and map input through current bounding rectangles. Do not put another back/pause/restart/rules toolbar inside the game. Provide your own level/undo/hint/action controls where needed. Keyboard must not steal input from text fields or modal dialogs. Buttons need readable labels; canvas needs an accessible label and keyboard controls. Gate decorative motion on context settings.

## Persistence and privacy

Tiny snapshots/settings/scores use versioned localStorage envelopes and memory fallback. No IndexedDB is needed with these compact states. Blocked or full storage is reported truthfully in menu. Per-key dirty memory takes precedence over stale disk values after a quota error, preserving the latest session state. Settings sound defaults OFF. Audio uses local Web Audio oscillators after interaction. No analytics. Saves are never deleted by cache cleanup. Optional accounts collect only a public username and scrypt password hash; fixed 60-day sessions store only token hashes on the server. Account saves sync through a same-origin no-store function; the service worker excludes all function routes. Login keeps existing guest progress separate; sign-up imports it. Logout removes account data from this browser and restores its guest backup. Cloud sync uses content tracking, durable per-account pending keys and versioned server revisions; idle/background polling is disabled. Public leaderboard reads are cacheable and own-rank reads stay private. See [accounts](docs/ACCOUNTS.md) and [sync](docs/SYNC.md) for merge rules, protocol, measurements and security details.

## Offline

Production service worker uses scope relative to the deployment base. Shell cache fills on visit; the explicit menu action caches every production chunk, cover, font and shell file using a generated content-hashed manifest and shows progress. An active-worker version handshake prevents mixing a waiting release with an older tab. Updates wait for older tabs to close before activation; only then are stale caches from the same scope removed. Cache read/write failures cannot turn a successful online fetch into a gameplay failure. Offline depends on a successful prior download, origin, device and browser storage policy; no policy bypass is promised.

## Isolation and integration

Parent branch `work` owns shared files, lockfile and deployment. Each SOL specialist receives one worktree `.worktrees/<slug>`, branch `game/<slug>` at the frozen shell commit. It may change only `src/games/<slug>/`, `tests/games/<slug>/`, `public/game-art/<slug>/`. Installed dependencies are shared via a symlink; no agent runs npm install or edits config. Six available child slots mean two batches of six, all explicitly GPT‑6.1 Sol. Parent reviews commits and independently executes checks, then cherry-picks one game at a time. Review feedback is assigned to the original implementer. No agents edit parent files concurrently.

## Deployment

`npm run build` typechecks, bundles and generates the complete offline manifest. `dist/` can be mounted at `/` or `/Qcc-games-/` unchanged. Netlify serves the static output under netlify.toml. GitHub Pages Actions verifies tests then uploads dist. Hash routes require no fallback rewrite. HTTPS/localhost is necessary for service workers. Deployment URLs are reported only after actual publication and verification.

## Referenced gameplay corrections

The four corrected games, isolated specialist handoffs, original cutout/art geometry, interaction recordings, compatibility changes and verification limits are documented in [the correction record](docs/GAMEPLAY_CORRECTIONS.md). Animal Stack uses a rendering-only camera safety floor for rotated/tall cutouts; world coordinates and pointer inverse mapping remain consistent.

## Globle

`src/games/globle/` is a globe.gl country-guessing game (see its [SPEC](src/games/globle/SPEC.md)). It fills `#game-stage` directly (`fillGames` in `src/main.ts`) instead of the uniform scale fit, because a CSS transform would break WebGL pointer mapping. Distances between the 197 playable countries are precomputed from Natural Earth 1:10m boundaries by `scripts/build-globle-data.mjs` and bundled with separately simplified 1:50m display outlines; regenerate both with `node scripts/build-globle-data.mjs` (then `node scripts/build-globle-cover.mjs` for the cover). Land is drawn as one merged vertex-coloured mesh plus one border mesh, built in 10 ms slices.

## Corn Clicker

`src/games/corn-clicker/` is an incremental game (see its [SPEC](src/games/corn-clicker/SPEC.md)). Like Globle it fills `#game-stage` (`fillGames` in `src/main.ts`; the stage is an inline-size container so the game switches from three panels to tabs below 900 px). Unlike the other games, time keeps counting while it is paused or closed: the next tick credits gaps of up to a minute at full rate and longer gaps by its offline rules, so the Study retention test checks only its frozen autosave. It keeps two extra localStorage keys beside the shell's save: `corn-clicker:lock` (one tab owns the farm; others step aside and return the latest save from storage from `serialize()`) and `corn-clicker:backups` (five rolling snapshots).

## Online multiplayer

`src/multiplayer/` is the one shared online layer: `room.ts` (host-created PeerJS/WebRTC star rooms, admission by protocol/game/version, seats, heartbeats, host pause, clean endings), `protocol.ts` (codes, names, envelopes, framing of large messages), `transport.ts` (PeerJS, lazily imported, and the relay detection), `ice.ts` with `turn-server.ts` and `netlify/functions/turn.mts` (temporary Cloudflare TURN credentials, rate-limited), and `panel.ts` (Create room, Join by code, Copy invite link, Leave room). Pool (`src/games/pool/online.ts`) and Blockcraft (`src/games/blockcraft/net/`) build on it; the host is authoritative in both. Blockcraft systems see players through `game.net` and `engine/players.ts`, so offline behaviour is the single-player behaviour. Online state never replaces the shell's single-player saves. Details, setup and limitations: [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

## Movies & TV

`src/movies/` is the Movies & TV section. `src/main.ts` loads it lazily on the `#/movies` routes. The Movies, TV Shows and My list tabs on the glass island open those routes. Its storage (`qcc:movies:v1`) is a separate namespace, never used by game ranking, saves or sync. Real title images come from TMDB's allowlisted image CDN, with optional locally cached operator imports. No generated movie artwork is shipped.

- `view.ts` renders the pages and the watch page. `model.ts` parses routes, titles and rails.
- `query.ts` and `network.ts` fetch `/api/movies` with timeouts, retries and an in-memory cache of up to 100 URLs.
- `provider.ts` builds the four public iframe URLs, the sandbox and the permission list. `playback.ts` is the failover supervisor, which is pure and unit tested. `storage.ts` holds the list, progress, title snapshots, durations and the remembered server.
- `netlify/functions/movies-search.mts` is the same-origin function. It calls TMDB with a server-side read token for search, rails, genres, title details, credits, related titles, seasons and stills. It sends a CDN cache header only on complete, non-search answers.
- The Content-Security-Policy in `netlify.toml`, `public/_headers` and `vite.config.ts` allows TMDB images and five streaming origins in frames. `public/sw.js` bypasses `/api/movies` and `movies/`.

The player is a cross-origin iframe with the sandbox `allow-scripts allow-same-origin` and nothing more. No popups, top navigation, downloads, camera, microphone, location, clipboard, USB, serial or payment capabilities are granted. Parent-page scripts remain same-origin. Study and tab hiding unload the iframe, and a Resume stream button starts it again. Optional reviewed local media takes priority and plays in a video element. A file that fails shows an error line and does not switch to a streaming server. No streams are extracted or proxied, and no DRM or access controls are bypassed. External provider availability, rights and tracking are not guaranteed. Routes, failover limits, storage and the API are described in [Movies & TV](docs/MOVIES_TV.md).

`movies/` and external resources stay outside the games offline manifest and worker caches. `scripts/movies-import.mjs` is an operator-only TMDB snapshot command; `scripts/movies-validate.mjs` validates optional self-hosted media rights. See [provider and setup details](docs/MOVIES_TV.md).

## Fivefold

Fivefold fills the stage with a responsive DOM board and keyboard. Its deterministic model stores both modes, seeded practice and statistics in the host snapshot; daily puzzles use the Auckland calendar. See [its spec](src/games/fivefold/SPEC.md).
