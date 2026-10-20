# Pocket Arcade

A static, private browser arcade with fourteen playable games: **Fruit Merge, Water Sort, Color Blocks, Tower, Snake, Minesweeper, Solitaire, Block Fill, Color Connect, Ball Run, Pool, Animal Stack, Flappy Bird and VoxeLibre**. Original SVG covers, a compact portrait-card library, favourites, local saves and an explicit offline download. No accounts, advertisements, currency, tracking or gameplay server.

[VoxeLibre](docs/VOXELIBRE.md) brings the upstream survival and creative game to the browser through a locally bundled Luanti WebAssembly engine. It downloads only after Play or World backups. A current desktop Chrome or Edge with the required graphics and WebAssembly features is recommended; the launcher checks support before downloading the game.

The latest [gameplay correction record](docs/GAMEPLAY_CORRECTIONS.md) includes the four referenced scenes, six Animal Stack cutouts, actual interaction recordings and viewport checks.

![The arcade library](docs/evidence/home-1366.png)

## Run and build

Node.js 22 and Python 3 are required. The first preparation downloads the pinned game and corresponding engine sources; subsequent runs verify and reuse the local files. A normal site build restores the already compiled engine from verified repository parts and does not compile C++.

```sh
npm ci
npm run prepare:voxelibre
npm run dev
```

```sh
npm run check
npm test
npx playwright install --with-deps chromium webkit
npm run test:e2e
npm run build
npm run verify:update
npm run verify:offline
```

The last two commands test the real production output using Chromium. `verify:offline` downloads the complete pack, disables network access, reloads and plays the thirteen compact games at both `/` and `/Qcc-games-/`, saves screenshots and records rendering intervals. VoxeLibre's native world lifecycle has separate [verification evidence](docs/VOXELIBRE.md); the generic game loop does not stand in for native gameplay. `verify:update` checks that an open pair of older tabs retains its cached game while a new release waits, then activates safely after both close. Set `CHROMIUM_PATH` to use a system Chromium binary when needed. Game tests and shell tests are under `tests/`; the [release report](docs/DELIVERY.md) distinguishes actual results from unavailable checks.

## Play and save

Choose one of **20 NCEA study topics** on the first visit in a tab, then open the game library. During any game, press **Esc** to pause and read your selected textbook chapter. The **Games** link restores the same game; change topics from the article selector. VoxeLibre remains open in its native pause menu: choose Continue to resume. The choice lasts for this browser session, and all chapters are bundled locally. See [Study Mode and its verification evidence](docs/STUDY_MODE.md).

Use the hamburger for Study Mode, search, sound, motion, colour-blind settings and **Make all games available offline**. Sound starts muted. Games offer a shared back, pause, restart and rules toolbar, plus their own controls. Mouse and trackpad use the same pointer controls; suitable games also accept keyboard and touch input.

Scores, settings, favourites and compact game snapshots stay in this browser's local storage. If storage is blocked or full, compact games continue in memory and the menu explains that progress cannot be retained. There is no cloud sync. Restart starts a new run in the compact games; leaving saves their current state. A hidden tab pauses real-time play.

VoxeLibre stores complete worlds in its separate native browser filesystem. **Back to library** waits for the engine to save and exit; **Restart** saves and returns to its launcher without deleting worlds. **World backups** exports and imports ZIP files, with every import added as a new copy. If world storage is unavailable, temporary play requires an explicit choice. Keep exported backups, especially before clearing site data or switching devices. Native worlds are not stored in the arcade's small localStorage snapshot.

Offline play requires a successful download on the same browser, device and origin, using HTTPS or localhost. The complete game download is about 100 MB including VoxeLibre; native world preparation can take several minutes on first use. Browser eviction, private browsing, managed-device policies and network controls can prevent retention. The app cannot bypass them. After an update, close older arcade tabs so the new worker can activate; download the new pack to make all of that release available offline. Source archives are available separately and are excluded from the offline play download.

## Deploy the same output

`npm run build` creates `dist/` with relative asset paths, hash routes and a service worker scoped to the directory in which it is served. The unchanged build supports an origin root and a repository subpath.

- **GitHub Pages:** enable GitHub Actions as the Pages source. The included [workflow](.github/workflows/pages.yml) runs verification and publishes `dist/` on pushes to `main` or `work`, or a manual dispatch. Repository Pages settings and account access are required.
- **Netlify:** import this repository. [netlify.toml](netlify.toml) sets `npm run build`, publishes `dist/`, selects Node 22 and sets security headers. No API keys or environment secrets are needed.
- **Other static hosting:** serve `dist/` over HTTPS with the cross-origin isolation headers in `public/_headers`. The service worker can provide the same headers on a subsequent controlled page load when the host cannot set them. No SPA rewrite is necessary because navigation uses `#/game/<id>`.

The Netlify project is **[Mauri Gazette](https://mauri-gazette.netlify.app)** (`mauri-gazette`), built from this repository's **main** branch. Publication is inspected through the Netlify connector; [deployment evidence and update status](docs/NETLIFY_DEPLOYMENT.md) distinguish published commits from local verification. The ready static ZIP is included there too.

## Code and artwork

Vite + strict TypeScript, semantic DOM/SVG/Canvas, Matter.js for the two stacking games, and Three.js loaded only by Ball Run. The library loads no game engines. Each game has a separate deterministic rules model and implements the shared [module contract](src/core/types.ts). See [architecture](ARCHITECTURE.md), [test plan](TEST_PLAN.md) and the [twelve specialist build record](docs/AGENT_BUILDS.md).

All twelve cover illustrations were remade with the installed [SVG generation skill](.agents/skills/svg-skill/SKILL.md). The authored sources are in `public/game-art/<id>/cover.svg`; `scripts/generate-covers.py` reproduces the cover set. See [artwork notes](docs/ARTWORK.md). Fonts are locally bundled with their OFL licence; [dependency and font notices](public/THIRD_PARTY_NOTICES.txt) also ship in the static build. No original reference screenshots or proprietary game artwork are distributed.

The repository's pre-existing agent skill collection remains intact; its original README is preserved in [workspace skill notes](docs/WORKSPACE_SKILLS.md). Each game records its actual loaded skills, documentation sources and gaps in its own `SKILL_USAGE.md`.

Flappy Bird uses an original marsh swift and reed-gate illustration. Ball Run now generates reproducible varied obstacles with a clear corridor and swept sphere collisions; older runs retain their original obstacle layout. See [local checkpoint and test evidence](docs/FLAPPY_BALL_RUN.md).
