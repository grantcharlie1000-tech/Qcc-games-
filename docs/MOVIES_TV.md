# Movies & TV

A full-width cinema card in the games grid opens `#/movies`. The section has local search, movie/series filters, genres, shelves, title details, seasons, episodes, a native playback screen and a local watchlist. Escape opens the existing Study Mode and pauses video. Returning keeps the section mounted. Back to Games restores the grid position and launch-card focus. The original 18 games, IDs, leaderboard APIs and saves are unchanged.

## Privacy architecture and provider assessment (2026-10-25)

Inspected [FrameXTV's API & Embed Documentation](https://framextv.cc/api), including search-indexed documentation when the page's client-rendered body was unavailable to the reader. The workspace network policy blocked direct retrieval; the documentation reader/search returned the embed specification. It describes an HTML iframe player using TMDB IDs, season/episode paths, query settings and postMessage control/telemetry, plus multiple extraction/fallback providers. It does not establish a REST discovery service, licensed distribution rights, an isolated licensed download feed or a zero-data distribution contract. The documentation is not proof of streaming rights.

Decision: **no FrameXTV integration**. There is no embed URL builder, runtime SDK, proxy, extraction code, download process, backend endpoint, background provider job or fallback player. Neither FrameXTV nor any downstream provider receives browser traffic or user-triggered server traffic. A title proxy would reveal selection and timing and is expressly excluded. The only runtime catalog/registry/media requests address static resources on this site's origin. JSON fetches omit credentials/referrers, refuse redirects and avoid browser caching. Media must be under `movies/media/`; CSP restricts media to this origin, blocking external redirects. Hosting must serve these paths as static files, never rewrite or proxy them upstream or attach title-triggered upstream services.

CSP is delivered in both HTML (including GitHub Pages) and Netlify HTTP headers: self scripts, images, workers and media; no frames/objects; no inline scripts or eval; no external fonts. Existing opt-in game multiplayer connect permissions for PeerJS are preserved. Movies never initializes multiplayer or leaderboard calls. `no-referrer` and disabled DNS prefetch accompany the policy. No movie DNS/preconnect/prefetch hints, trackers, advertising or analytics are added. The dormant AdSense account metadata was removed; no ad scripts were present or added. This is an application/resource audit, not a packet capture or a promise about extensions, browser-vendor background activity, hosting access logs or compromised hosting.

`qcc:movies:v1` is a separate localStorage namespace for list and progress. Search and route history remain in memory/browser navigation; no third-party synchronization exists. Clear-data removes list and progress together. Blocked storage falls back to memory with a visible warning. The site's own web server may log static URLs; configure first-party retention appropriately. Do not add request logging, analytics or third-party error reporting for movie activity.

## Metadata and artwork

The shipped **starter selection** contains eight real titles, original summaries, original poster artwork and generated genre illustrations and a small series episode sample. It is explicitly labelled; no invented ratings, current-trending claims, official movie posters or TMDB data are shipped. Starter episode coverage is deliberately limited and not an assertion of complete series coverage.

For production discovery, the operator can run:

```sh
TMDB_READ_TOKEN=... TMDB_LOGO_PATH=/path/to/approved-logo.png npm run movies:import
npm run build
```

Keep the token in the operator's secret environment, never in a Vite variable or committed file. The importer retrieves the same fixed weekly-trending selection for everyone (up to 24 movies/series), movie/series details, up to 30 positive-numbered seasons per series and episode metadata, posters and ratings. Adult-marked results are skipped. It writes a static same-origin snapshot atomically after success, with an approved unmodified local PNG logo and TMDB's attribution notice. A failed refresh preserves the previous catalog; refresh is a manual operator command, never an HTTP route, user action, search request or playback request. No scheduled workflow or external publication was enabled. Search covers the snapshot only; it is not the entire TMDB catalog. Poster files and old snapshots need operator review/cleanup. Logo brand compliance remains an operator check.

Review [TMDB's terms and FAQ](https://developer.themoviedb.org/docs/faq): developer/non-commercial use requires attribution; commercial use needs appropriate licensing. An API key, approved logo and permission to cache/redistribute the particular images/data are release prerequisites. Metadata rights do **not** grant streaming rights. The importer is integration-tested with a mock upstream; a real import was not run because no token/logo was supplied.

## Licensed playback configuration

`public/movies/licenses.json` is empty by default. No playable film/episode was supplied or independently licensed for this repository, so every starter title honestly displays disabled playback. Its information screen explains why. A generated CC0 test fixture exercises the actual native player without connecting to a provider.

To enable an owned or licensed file, place a static MP4/WebM in `public/movies/media/`, document the review in `docs/rights/<slug>.md`, and add an entry:

```json
{
  "key": "movie-157336",
  "path": "movies/media/approved-film.mp4",
  "license": "LicenseRef-QCC",
  "credit": "Rights holder and required attribution",
  "evidence": "docs/rights/approved-film.md",
  "reviewed": true,
  "territory": "Worldwide",
  "expires": "2027-01-01"
}
```

A series episode uses a key like `tv-19885:s1:e1`. This is a schema example, **not permission to stream those titles**. Supported license IDs are CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0 and LicenseRef-QCC (a documented bespoke distribution license). Do not set `reviewed` merely because a URL works or content appears publicly accessible. Review the chain of rights, exact file, download/redistribution permission, music, artwork, attribution/share-alike obligations, worldwide territory, term, hosting terms and absence of tracking in the delivery chain. A trusted operator's documented review is required; code cannot adjudicate copyright. Geographic/DRM-dependent sources are intentionally unsupported. Expired, incomplete, remote, traversal, query-bearing or unknown-license records are rejected. The production build also checks that media and review files exist. Browser native controls support play/pause, seek, volume and fullscreen; progress is saved locally every five seconds and on pause/leave. Backgrounding and Study pause playback; it never auto-resumes after Study. Playback errors show an honest error and never load another provider. No DRM removal, extraction, bypass or rehosting of unlicensed material is implemented.

## Offline boundary

`movies/` is excluded from the generated games offline pack and the service worker's runtime response/cache handling at both root and repository subpaths. Movie catalog, art, rights registry and media are online-only and receive `Cache-Control: no-store` on Netlify. Tiny original decorative posters are inline in the shell, so the library card remains intact offline. Shared section JS/CSS may be retained with shell code for consistent updates; no movie content/media is downloaded by “Make all games available offline”. An offline Movies route shows a retry message and back navigation. Game cache namespaces, update protocol and save keys remain unchanged.

See `MOVIES_TV_TEST_RESULTS.md` for executed checks and limitations. No merge or deployment is authorized by this change.
