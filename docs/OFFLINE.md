# Offline play

Download games once, then play them with no internet, including from the iPhone Home Screen in Airplane Mode.

## Using it

- **Downloads** is the last card in the library and is also in **Menu**. Each game shows its size and a Download button. The game menu has a Download action too.
- A download shows bytes done. It is only marked **Downloaded** after every file has been fetched, checked against the build's size and SHA-256, and found again.
- **Failed** keeps the files already fetched. **Retry** fetches only the rest.
- **Update needed** means a new version could not refresh that game, or the browser removed some of its files. **Update** repairs it.
- **Check for updates** looks for a new app version and confirms every download still has its files.
- Offline, the library shows a small **Offline** pill, and games that are not downloaded fade and say **Needs internet**.
- The installed app (Home Screen) opens straight to the games. Study is still one tab away.

All 29 games play offline in their local modes. Movies & TV can also play individual, previously downloaded rights-reviewed local MP4/WebM films and TV episodes; external streaming players and online catalog searches still need internet. Online rooms (Pool, Minecraft, Drift Club, Breachline, Chess), leaderboards, accounts, Social and Chat need internet. Account saves and scores made offline sync when the connection returns, through the existing [sync protocol](SYNC.md), which never creates duplicate records.

iOS can remove a web app's stored data when the device runs low on space, and Safari may clear it for sites not opened for a long time. The app asks the browser to keep its data (`navigator.storage.persist()`), but this is not guaranteed.

## How it works

| Part | File |
| --- | --- |
| Build: shell and per-game file lists with size and SHA-256, version stamped into `sw.js` | `scripts/offline-packs.mjs` |
| Build check: every listed file matches `dist` | `scripts/verify-offline-build.mjs` |
| Service worker | `public/sw.js` |
| Downloads, verification, deletion, storage | `src/offline/downloads.ts` |
| Worker registration and updates | `src/offline/worker.ts` |
| Downloads page | `src/offline/view.ts` |
| Browser suite (Chromium and WebKit) | `tests/recovery/offline.spec.mjs` |

Caches:

- `pocket-arcade-v3:shell:<version>`: the page, entry script, styles, fonts, icons and covers of one version. Online, the page comes from the network (the deployed version); offline, or after 3 seconds without an answer, from here, so it matches the downloaded games. Stored copies keep the site's security headers.
- `pocket-arcade-v3:files`: downloaded game files, shared by every game that uses them (Three.js is stored once) and kept across versions.
- `pocket-arcade-v3:meta`: one record per download (`partial`, `ready` or `stale`) listing its files. Cleanup keeps any file a record lists, so a download in progress is never cleaned up under itself.
- `qcc:movies:downloads-files:v1` and `qcc:movies:downloads-meta:v1`: separate, manually requested movie/episode files and their validated licence records. The worker serves these files, including video byte ranges on iPhone, without changing the games' caches.

Every stored file carries its SHA-256 in an `x-qcc-sha256` header, so checking "already have it" needs no body read. Online, a stored game file is only served if its hash matches the running version; an older copy is used only when the network fails.

### Updates

A new deploy changes `sw.js` only when content changes. The new worker fetches and verifies the new shell, then brings every downloaded game to the new version, fetching only changed files. If it goes offline part way, install fails and the current version keeps working. If a game cannot be refreshed (storage full, missing file), that game is marked **Update needed** instead of blocking the update; the next version tries it again.

The new version never takes over a running app. The library shows **Restart to update**; closing the app also lets it take over. Nothing appears during a game.

### Rules from the November 2026 outage

The old worker precached `index.html`. Cloudflare Pages answers that with a 308 to `/`, and browsers refuse a cached redirected response for a navigation, so returning visitors could not open the site. The current worker stores the page under the scope URL and rebuilds every response before storing it. A browser still running that old worker is taken over at once (its legacy caches are deleted), and the browser suite reproduces that exact failure.

## Picture in picture

The Movies & TV player has a **Picture in picture** button.

- **Local video files:** the browser's own picture in picture window (iPhone, Safari, Chrome, Edge).
- **Streaming player, Chrome and Edge on desktop:** the player moves into a Document Picture-in-Picture window, resuming at the last reported time, and moves back when the window closes.
- **Streaming player elsewhere (iPhone, Safari, Firefox):** a cross-origin player's video cannot be pulled out by this page. The button keeps the player loaded when you switch apps or tabs; the player's own picture in picture control gives the floating window (on iPhone, play full screen, then tap its picture in picture button). Whether a backgrounded stream keeps playing without that control is up to the browser.

Without picture in picture, hiding the page still stops the stream, as before. Escape to Study always stops it.

## Measured

Throttled Chromium (4x CPU, 1.6 Mbps, 150 ms) at 390 x 844, median of five runs, `scripts/perf/startup.mjs`. This stands in for an older iPhone; it is not a Safari measurement.

| | Before | After |
| --- | --- | --- |
| First library load | 9.5 s | 6.9 s |
| Returning launch | 9.6 s | 0.86 s |
| Transferred on first load | 1,653 KB | 1,133 KB |
| Open Suika Game / Snake / Pool | 1.01 / 0.41 / 0.99 s | 0.71 / 0.16 / 0.26 s |

Live check after release: the worker installed on https://nceastudy.pages.dev, Snake downloaded, the network was cut and Snake opened offline ([screenshot](evidence/offline/live-offline-snake.png)).

Changes behind these numbers: covers below the first rows load lazily, hashed assets are cached for a year (`public/_headers`), and the worker serves the entry script, styles and covers from the device. The page itself comes from the network when online (within 3 seconds), so a returning visitor always gets the deployed version. The current lit posters are larger files than the old flat ones, which accounts for part of the first-load transfer.
