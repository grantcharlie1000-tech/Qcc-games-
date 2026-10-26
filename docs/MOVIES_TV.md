# Movies & TV

The full-width card opens a FrameXTV-referenced Movies & TV catalog with full-database search, genre filters, movie and series details, seasons, episodes, a local list and a playback screen. The original 18 games, saves, leaderboards and offline downloads remain separate.

## Provider and privacy model

The user explicitly authorized ordinary provider/image requests and requested that streaming remain enabled. The initial zero-contact requirement therefore no longer describes this implementation.

- **Artwork:** actual movie/TV posters and backdrops load from the allowlisted `image.tmdb.org` CDN. No generated movie pictures are included. Starter artwork paths and title IDs are recorded in `src/movies/artwork.ts` and `public/movies/catalog.json`. Optional imported snapshots can use locally cached TMDB artwork instead.
- **Playback:** supported numeric TMDB movie/TV IDs use the standard iframe URLs documented at [FrameXTV's API & Embed Documentation](https://framextv.cc/api): movie `/embed/<id>`, series `/embed/<id>/<season>/<episode>`. This is an iframe/control interface, not a REST discovery API. The default player origin in that documentation is `https://framextv.xyz`.
- **Always available controls:** Play is enabled for supported title identifiers; it is not disabled by an unverified-rights flag. TV hero Play selects the first included episode. Locally hosted, explicitly licensed MP4/WebM entries can take priority; a failed local file offers the external player.
- **Actual exposure:** TMDB receives image requests; FrameXTV and its downstream providers receive normal connection and playback information, including IP address and title/episode selection and timing. The embedded provider may use cookies, advertising or tracking. QCC cannot audit or guarantee provider behavior, availability or distribution rights. No claim of zero exposure or verified external-stream licensing is made.
- **Browser isolation:** the external frame is cross-origin and sandboxed with only `allow-scripts allow-same-origin`. Popups, top navigation, downloads, forms and pointer-lock permissions are not granted. Camera, microphone, location, clipboard, USB, serial and payment permissions are explicitly denied. Fullscreen/Picture-in-Picture are allowed. Referrers are suppressed. Parent-page provider scripts, stream extraction, proxies, DRM bypasses, account credentials and authentication tokens are not implemented.
- **CSP:** parent scripts, fonts, workers and media remain same-origin; images additionally allow TMDB; frames additionally allow only `framextv.xyz` and `framextv.cc`. Existing optional game PeerJS permissions remain. No first-party analytics or advertising scripts were added.
- **Local data:** `qcc:movies:v1` stores QCC's list and native-file progress locally, with memory fallback and a clear-data control. The stored list/progress table is not synchronized to any provider. Resuming a selected external stream sends only that title’s saved position as a documented seek control. External services can independently observe activity in their player. Catalog search runs through the same-origin /api/movies Netlify function and queries TMDB; search terms are never sent to FrameXTV. Search results are paginated. Details and one selected season's episodes load on demand. The service worker bypasses the endpoint so search queries and results are not persisted in its offline caches.

Study Mode and tab backgrounding unload the external iframe, stopping its media and network activity. Returning displays Resume stream; it does not silently recreate the provider. Native files pause and keep local progress; external progress messages are accepted only from the current frame and an exact approved origin, then saved locally. Escape opens Study while the parent page has keyboard focus; keys focused inside a cross-origin player belong to that player. The visible Study controls remain available on desktop and mobile.

## Metadata

The eight bundled titles remain a useful starter collection and offline fallback. With TMDB_READ_TOKEN configured in Netlify for function runtime, search queries TMDB's full movie/TV metadata index, paginates the results, and fetches full title and selected-season episode metadata as needed. The bundled sample is not the entire catalog.

The operator-only TMDB importer retrieves weekly trending selections (up to 24 movie/TV titles), details, ratings, posters, backdrops, up to 30 positive-numbered seasons per series, and episode information. Adult-marked results are skipped. No token is embedded in the browser. The live /api/movies function also reads TMDB_READ_TOKEN only on the server and never forwards the query to FrameXTV. The function provides search, trending results, title details and selected season episodes; it does not proxy playback.

```sh
TMDB_READ_TOKEN=... TMDB_LOGO_PATH=/path/to/approved-logo.png npm run movies:import
npm run build
```

The importer stages files and atomically switches metadata after success. A failed refresh preserves the previous catalog. Review [TMDB terms and attribution](https://developer.themoviedb.org/docs/faq), commercial status and image/data usage rights; supply an approved unmodified attribution logo for API snapshots. Metadata/image access does not establish streaming rights. Netlify now has TMDB_READ_TOKEN saved as a secret for Production and Deploy Preview with Functions and Runtime scopes. Deploy again after changing the variable so the published function receives the updated environment. The importer was integration-tested with a mock rather than run against a live account.

## Optional locally licensed files

`public/movies/licenses.json` is empty by default. To prefer a local MP4/WebM, provide a record with a movie key or `tv-19885:s1:e1`, `movies/media/<file>.mp4`, an accepted license ID (CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0, LicenseRef-QCC), required credit, a review document under `docs/rights/`, `reviewed: true`, `territory: Worldwide` and an unexpired ISO date. `scripts/movies-validate.mjs` verifies the record and that media/review files exist before builds. This is an operator-reviewed self-hosted option, not a licensing assertion about FrameXTV. No copyrighted video or DRM-removal/extraction code is shipped.

## Offline and testing

The `movies/` subtree is excluded from the games offline manifest and worker runtime caches. External image/player requests are not handled by the worker. The launch card retains plain title fallbacks if remote posters are unavailable offline; all games still use their existing offline assets. Movies requires network access for catalog/player use and is not part of “Make all games available offline”.

The workspace network policy currently denies direct requests to TMDB and FrameXTV; browser fixtures test integration/isolation without claiming live playback was verified. [Verification results](MOVIES_TV_TEST_RESULTS.md) record actual passes and limitations. [Design references](MOVIES_TV_DESIGN_REFERENCES.md) link the FrameXTV catalog and embed documentation. Dynamic catalog tests use mocked TMDB responses; the deployed TMDB endpoint cannot return full-catalog results until its server-side token is configured.
