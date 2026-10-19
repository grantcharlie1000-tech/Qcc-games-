# Pocket Arcade architecture

Exactly twelve games: Fruit Merge, Water Sort, Color Blocks, Tower, Snake, Minesweeper, Solitaire, Block Fill, Color Connect, Ball Run, Pool, Animal Stack. No factory game, currency, accounts, ads, tracking, backend, runtime CDN, or external runtime requests.

## Static shell

Vite 7, strict TypeScript, semantic DOM/CSS; no application framework. Hash routes `#/game/<id>` work at the origin root and any repository subpath. Vite's relative base `./` is authoritative. All assets use `import.meta.env.BASE_URL` or relative imports. Locally bundled Lilita One (OFL) supplies the bold, playful lettering. The nine user-provided images, inspected as the contact sheet and detailed originals under `/workspace/arcade-references`, set portrait proportions, dark rims, two-column mobile layout, saturated artwork and minimal header. The header replaces the original wallet and advertising control with a twelve-game indicator and working favourites filter.

`src/core/catalog.ts` contains twelve cards and lazy game loaders. A game imports no other game. Matter.js is only imported by physics games; Three.js only by Ball Run. `src/main.ts` owns routes, lifecycle, toolbar, pause overlay, rules dialog, autosave, settings, sound and favourites.

## Frozen module API

See `src/core/types.ts`. Each `src/games/<id>/index.ts` default-exports a `GameModule` with id, title, cover (relative art path), rules (plain text), and `mount(container, context)`. Mount returns a `GameInstance` synchronously or asynchronously. The instance implements pause, resume, restart, serialize, restore and dispose. Parent restores once after mount, snapshots every five seconds and on pause/leave/pagehide, and disposes before navigation. `restore(unknown)` must validate data and safely ignore an invalid or incompatible snapshot. `restart()` must fully reset the run and work while paused. Avoid unsaved entropy: serialize seeds, queues, progress and relevant physics bodies.

Context: readonly `id`, mutable-in-place readonly-facing `settings` (sound, reducedMotion, colorBlind), initial `highScore`; `setScore(number)`, `setLevel(string|number)`, `setStatus(string)`, `announce(string)`, `save(unknown)`, and `sound('tap'|'success'|'lose')`. Scores must be nonnegative and monotonically represent a run where appropriate; parent records maximum. All listeners, RAFs, timeouts, observers, bodies and GPU resources are owned and released by the module. Hidden pages pause; returning does not unexpectedly resume a real-time game.

## Shared presentation

Common classes: `.game-button`, `.game-button.secondary`, `.game-controls`, `.game-select`, `.game-help`, `.game-panel`, `.game-message`. Put game-specific CSS in its own directory, prefix selectors with its slug or an abbreviation. The host is `#game-stage` with available width approximately viewport minus 24px, max 1056px. Prefer responsive max-width game areas and logical board coordinates. Do not put another back/pause/restart/rules toolbar inside the game. Provide your own level/undo/hint/action controls where needed. Keyboard must not steal input from text fields or modal dialogs. Buttons need readable labels; canvas needs an accessible label and keyboard controls. Gate decorative motion on context settings.

## Persistence and privacy

Tiny snapshots/settings/scores use versioned localStorage envelopes and memory fallback. No IndexedDB is needed with these compact states. Blocked or full storage is reported truthfully in menu. Per-key dirty memory takes precedence over stale disk values after a quota error, preserving the latest session state. Settings sound defaults OFF. Audio uses local Web Audio oscillators after interaction. No analytics. Saves are never deleted by cache cleanup.

## Offline

Production service worker uses scope relative to the deployment base. Shell cache fills on visit; the explicit menu action caches every production chunk, cover, font and shell file using a generated content-hashed manifest and shows progress. An active-worker version handshake prevents mixing a waiting release with an older tab. Updates wait for older tabs to close before activation; only then are stale caches from the same scope removed. Cache read/write failures cannot turn a successful online fetch into a gameplay failure. Offline depends on a successful prior download, origin, device and browser storage policy; no policy bypass is promised.

## Isolation and integration

Parent branch `work` owns shared files, lockfile and deployment. Each SOL specialist receives one worktree `.worktrees/<slug>`, branch `game/<slug>` at the frozen shell commit. It may change only `src/games/<slug>/`, `tests/games/<slug>/`, `public/game-art/<slug>/`. Installed dependencies are shared via a symlink; no agent runs npm install or edits config. Six available child slots mean two batches of six, all explicitly GPT‑6.1 Sol. Parent reviews commits and independently executes checks, then cherry-picks one game at a time. Review feedback is assigned to the original implementer. No agents edit parent files concurrently.

## Deployment

`npm run build` typechecks, bundles and generates the complete offline manifest. `dist/` can be mounted at `/` or `/Qcc-games-/` unchanged. Netlify serves the static output under netlify.toml. GitHub Pages Actions verifies tests then uploads dist. Hash routes require no fallback rewrite. HTTPS/localhost is necessary for service workers. Deployment URLs are reported only after actual publication and verification.
