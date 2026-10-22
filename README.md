# Pocket Arcade

A static, private browser arcade with sixteen playable games: **Fruit Merge, Water Sort, Color Blocks, Tower, Snake, Neon Coil, Minesweeper, Solitaire, Block Fill, Color Connect, Ball Run, Pool, Animal Stack, Flappy Bird, Globle and Blockcraft**. Original SVG covers, a compact portrait-card library, favourites, local saves and an explicit offline download. No accounts, advertisements or currency. Gameplay stays local; optional shared leaderboards use a Netlify score service.

The latest [gameplay correction record](docs/GAMEPLAY_CORRECTIONS.md) includes the four referenced scenes, six Animal Stack cutouts, actual interaction recordings and viewport checks.

![The arcade library](docs/evidence/home-1366.png)

## Run and build

Node.js 22 is recommended.

```sh
npm ci
npm run dev
# Or run the real local shared-score API and database:
npm run dev:online
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

The last two commands test the real production output using Chromium. `verify:offline` downloads the pack, disables network access, reloads and plays every game at both `/` and `/Qcc-games-/`, saves screenshots and records rendering intervals. `verify:update` checks that an open pair of older tabs retains its cached game while a new release waits, then activates safely after both close. Set `CHROMIUM_PATH` to use a system Chromium binary when needed. Game tests and shell tests are under `tests/`; the [release report](docs/DELIVERY.md) distinguishes actual results from unavailable checks.

## Play and save

Choose one of **20 NCEA study topics** on the first visit in a tab, then open the game library. During any game, press **Esc** to pause/save and read your selected textbook chapter. **Return to Arcade** restores the same game; change topics from the article selector. The choice lasts for this browser session, and all chapters are bundled locally. See [Study Mode and its verification evidence](docs/STUDY_MODE.md).

Use the hamburger for Study Mode, search, sound, motion, colour-blind settings and **Make all games available offline**. Sound starts muted. Games offer a shared back, pause, restart and rules toolbar, plus their own controls. Mouse and trackpad use the same pointer controls; suitable games also accept keyboard and touch input.

Scores, settings, favourites and compact game snapshots stay in this browser's local storage. If storage is blocked or full, play continues in memory and the menu explains that progress cannot be retained. Game snapshots do not sync between devices. Open **Menu → Leaderboards** to view shared scores for the fourteen scored games. Join with a public nickname to sync your personal bests; offline scores queue until the connection returns. Globle retains its own statistics and has no score leaderboard. Restart starts a new run; leaving a game saves its current state. A hidden tab pauses real-time play.

Offline play requires a successful download on the same browser, device and origin, using HTTPS or localhost. Browser eviction, private browsing, managed-device policies and network controls can prevent retention. The app cannot bypass them. After an update, close older arcade tabs so the new worker can activate; download the new pack to make all of that release available offline.

## Deploy the same output

`npm run build` creates `dist/` with relative asset paths, hash routes and a service worker scoped to the directory in which it is served. The unchanged build supports an origin root and a repository subpath.

- **GitHub Pages:** enable GitHub Actions as the Pages source. The included [workflow](.github/workflows/pages.yml) runs verification and publishes `dist/` on pushes to `main` or `work`, or a manual dispatch. Repository Pages settings and account access are required.
- **Netlify:** import this repository. [netlify.toml](netlify.toml) sets `npm run build`, publishes `dist/`, selects Node 22 and sets security headers. The shared score function and `netlify/database/migrations/` are deployed alongside the site. Netlify provisions the database from the installed `@netlify/database` integration; no browser API keys or manually configured application secrets are needed. Database availability and usage follow the site’s Netlify plan.
- **Other static hosting:** serve `dist/` over HTTPS. No SPA rewrite is necessary because navigation uses `#/game/<id>`.

Shared online leaderboards require the Netlify function and database; static-only hosts continue to run the games but cannot serve the shared scores. See [leaderboard setup and verification](docs/LEADERBOARDS.md).

The Netlify project is **[Mauri Gazette](https://mauri-gazette.netlify.app)** (`mauri-gazette`), built from this repository's **main** branch. Publication is inspected through the Netlify connector; [deployment evidence and update status](docs/NETLIFY_DEPLOYMENT.md) distinguish published commits from local verification. The ready static ZIP is included there too.

## Code and artwork

Vite + strict TypeScript, semantic DOM/SVG/Canvas, Matter.js for the two stacking games, Three.js loaded only by Ball Run, Globle and Blockcraft, and globe.gl only by Globle. The library loads no game engines. Each game has a separate deterministic rules model and implements the shared [module contract](src/core/types.ts). See [architecture](ARCHITECTURE.md), [test plan](TEST_PLAN.md) and the [twelve specialist build record](docs/AGENT_BUILDS.md).

All twelve cover illustrations were remade with the installed [SVG generation skill](.agents/skills/svg-skill/SKILL.md). The authored sources are in `public/game-art/<id>/cover.svg`; `scripts/generate-covers.py` reproduces the cover set. See [artwork notes](docs/ARTWORK.md). Fonts are locally bundled with their OFL licence; [dependency and font notices](public/THIRD_PARTY_NOTICES.txt) also ship in the static build. No original reference screenshots or proprietary game artwork are distributed.

The repository's pre-existing agent skill collection remains intact; its original README is preserved in [workspace skill notes](docs/WORKSPACE_SKILLS.md). Each game records its actual loaded skills, documentation sources and gaps in its own `SKILL_USAGE.md`.

Blockcraft is an endless block-building sandbox based on the MIT-licensed [Minecraft-Javascript-Edition](https://github.com/ashish0kumar/Minecraft-Javascript-Edition). It was rebuilt for speed: worker-thread terrain, greedy-meshed chunks with baked ambient occlusion, a 7-byte-vertex shader, procedural textures and adaptive resolution. It needs no image files. See [the optimisation record and benchmarks](docs/BLOCKCRAFT.md).

Flappy Bird uses an original marsh swift and reed-gate illustration. Ball Run now generates reproducible varied obstacles with a clear corridor and swept sphere collisions; older runs retain their original obstacle layout. See [local checkpoint and test evidence](docs/FLAPPY_BALL_RUN.md).
