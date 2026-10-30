# Movies & TV

Movies & TV opens from the Movies, TV Shows and My list tabs on the glass island at the bottom of the games screen. It has search over the full TMDB catalog, genre filters, rails, movie and series pages, seasons and episodes, a device-local list and a watch page. The games, saves, leaderboards and offline downloads stay separate.

Screenshots of each screen are at the end of this page.

## Provider and privacy model

The user explicitly authorized ordinary provider and image requests, and asked that streaming stay enabled. The initial zero-contact requirement therefore no longer describes this implementation.

- **Artwork:** actual movie and TV posters and backdrops load from the allowlisted `image.tmdb.org` CDN, at approved TMDB sizes. No generated movie pictures are included. Starter titles and their artwork URLs are recorded in `public/movies/catalog.json`: each has a poster URL, and only some have a backdrop URL. Optional imported snapshots can use locally cached TMDB artwork instead.
- **Playback:** the watch page loads one of four public iframe players: FrameXTV, VidLink, VixSrc or VidSrc (see Playback). The FrameXTV documentation at [FrameXTV's API & Embed Documentation](https://framextv.cc/api) describes the movie `/embed/<id>` and series `/embed/<id>/<season>/<episode>` routes. It names `https://framextv.xyz` as the default player origin. The app uses `https://framextv.cc` directly, because the `.xyz` host adds a cross-domain redirect (`src/movies/provider.ts`).
- **Local files:** explicitly licensed MP4 or WebM entries take priority over the four players. A file that fails to play shows "The local file could not be played." in the status line. It does not start a streaming server.
- **Actual exposure:** TMDB receives image requests. The metadata function receives search text and sends it to TMDB; no streaming server receives it. A streaming server receives normal connection and playback information, including its IP address, the title and episode being played, and timing. Its player may use cookies, advertising or tracking. QCC cannot audit or guarantee provider behaviour, availability or distribution rights. No claim of zero exposure or verified streaming licensing is made.
- **Browser isolation:** the player is a cross-origin iframe with `sandbox="allow-scripts allow-same-origin"` and nothing more, so popups, top navigation, forms and downloads are not granted (`FRAME_SANDBOX`, `src/movies/provider.ts`). Its `allow` list grants fullscreen, picture-in-picture, autoplay and encrypted media. Camera, microphone, geolocation, clipboard, USB, serial and payment are denied (`FRAME_ALLOW`). Referrers are suppressed. Parent-page provider scripts, stream extraction, proxies, DRM bypasses, account credentials and authentication tokens are not implemented.
- **CSP:** `netlify.toml`, `public/_headers` and `vite.config.ts` carry the same policy. Images additionally allow `image.tmdb.org`. Frames allow only `framextv.xyz`, `framextv.cc`, `vidlink.pro`, `vixsrc.to`, `vidsrc.to` and `archive.org`. Scripts, fonts, workers and media stay same-origin. The existing optional PeerJS permissions for games remain. No first-party analytics or advertising scripts were added.
- **Local data:** `qcc:movies:v1` stores QCC's list, progress, title snapshots, durations and the remembered server (see Storage). The stored list and progress are not synchronized to any provider. Catalog search runs through the same-origin `/api/movies` Netlify function, which queries TMDB. Search terms are never sent to a streaming server. The service worker bypasses `/api/movies` and the `movies/` folder, so catalog responses are not kept in its offline caches.

Study Mode and tab backgrounding unload the player, stopping its media and network activity. Returning shows "Stream paused" with a Resume stream button; it does not silently recreate the player. Native files pause and keep local progress. Provider messages are accepted only from the current frame and an approved origin, then saved locally. Escape opens Study while the page has keyboard focus, and it closes the episode drawer if that is open. Keys focused inside a cross-origin player belong to that player. With the Menu, rules, accounts or leaderboard sheet open, Escape closes that sheet first. On the games library, with no game or Movies & TV page open, Escape does nothing. Study is on the island at every width, and in the Movies header from 640 px.

## Design system

Movies & TV and the tab bar share one set of tokens and components.

- **Tokens** are CSS custom properties on `:root` in `src/theme.css`. They cover the colour scale (`--c-bg`, then `--c-950` to `--c-100`), rose, amber and red, the lines, the fonts, the radii (4, 6, 8, 12, 16 and 24 px), the shadows, the motion (`--ease`, `--t-fast`, `--t`, `--t-slow` and the glass curves), the page width (1280 px), the gutter (16 px, or 24 px from 640 px) and the header and bar heights. `src/main.ts` imports this file first.
- **Shared components** use the `ui-` prefix in the same file: the header and brand, pill and icon buttons, the tab bar, buttons, chips, rails, cards, grids, the hero, the footer, the switch and the glass sheet. Movies templates add these classes beside their own hook classes.
- **Helpers** live in `src/ui/`: `icons.ts` (inline SVG icons), `images.ts` (image load states), `rails.ts` (rail arrows and scrolling), `tabbar.ts` (minimizes the island into a capsule on scroll), `glass.ts` (the pill, the press and the refraction), `sheet.ts` (where a sheet grows from) and `focus.ts` (whether the reader is using the keyboard, which decides if focus rings show).
- **Breakpoints** are 640, 768, 1024 and 1280 px.
- **Header:** sticky, 56 px tall, black at 95% with a 12 px blur and a faint bottom border. Section pills show from 640 px. The header's action labels, and the Esc hint, show from 1024 px.
- **Cards:** 2:3 posters with a type chip and a rating chip. On hover-capable pointers, and on focus, a play disc appears. Until an image loads, a pulse shows; it fades in over 300 ms, and a failed image leaves the placeholder with its title.
- **Rails:** a heading with a count, then a row that scrolls by 75% of its width. Arrows appear on hover for fine pointers, and when focus is inside the rail. Movies rails size their cards from the row width (see Known gaps).
- **Hero:** static, 50vh (clamped between 380 and 500 px) below 768 px and 46vh (420 to 500 px) from 768 px. The backdrop sits at 70% opacity under two gradient shades.
- **Footer:** a brand row, then links separated by small dots. It stacks below 768 px.
- **Motion:** transforms and opacity, plus the Up next countdown bar's width. On hover, card art also brightens by 5%, through a filter transition over 300 ms. `prefers-reduced-motion` and the site's `.reduce-motion` class remove the transitions and animations, so pulses, slides and the countdown bar's width change at once.
- **Focus:** rings show only when the reader uses the keyboard. `src/ui/focus.ts` sets `data-input` on `<html>` to `keyboard` on Tab or another key that is not typing, and to `pointer` on any press. A tap or click draws no ring, not even the browser's own. In keyboard mode every ring on Movies and the tab bar is a 2 px white outline with a 2 px offset, including the Auto next switch (`src/theme.css`, `src/movies/style.css`). Text fields and selects never take an outer ring: focus brightens their border, and keyboard use adds an inner ring on the rounded edge. Headings that take focus in code have no ring of their own, except the heading of an empty state (not found or loading), which takes the keyboard ring. On the library, the gold focus ring is keyboard-only too; the games' own rings are unchanged.

### Where the reference values come from

The redesign copies no code or assets from FrameXTV. Its measured values are reference points for QCC's own CSS. The values were read as declared text from FrameXTV's public stylesheet and script. They were not checked on a rendered page.

- FrameXTV's anti-DevTools guard stopped its pages from rendering for automated inspection. We did not bypass it.
- The measurements come only from what could be observed without bypassing protections.
- No FrameXTV code, CSS, icons, logo, wordmark, artwork or wording is used. The interface is original work under the Mauri Study Notes brand.

The reference notes are in [design references](MOVIES_TV_DESIGN_REFERENCES.md).

## Glass tab bar and sheets

The arcade and Movies & TV share a floating glass tab bar (`.ui-tabbar`). Its glass, selection pill and press behaviour are original CSS, SVG and TypeScript. They follow Apple's published Liquid Glass guidance. No Apple assets, fonts or code are used.

- **Size and place:** the bar floats 12 px above the bottom edge, plus the safe-area inset. It is at most 440 px wide and at least 64 px tall, with fully rounded ends. Each item is at least 54 by 44 px, with a 16 px icon and a 10 px label. Below 360 px the arcade's bar is inset 8 px and its labels step down to 9 px.
- **Items:** Movies has five: Home, Movies, TV Shows, My list and Study. The arcade has six: Games, Movies, TV Shows, My list, Study and Menu. The arcade's Menu item keeps the accessible name "Open menu". The bar shows at every width.
- **Minimize on scroll:** after 64 px of continuous downward travel, once the page is at least 120 px from the top, the bar shrinks over 300 ms into a glass capsule that keeps the current tab's icon. The tabs and the pill fade out in the first 80 ms. Scrolling up 32 px, or a tap on the capsule, expands it without navigating. The bar is always expanded within 64 px of the top, within 24 px of the end, on pages too short to scroll 120 px, after every navigation, and while keyboard focus is inside it. While a text field has focus, the state holds, so typing and the on-screen keyboard never change it. The capsule is hidden from assistive technology and out of the tab order, and Tab into the bar expands it. Under reduced motion the two states only cross-fade, over 150 ms. Movies checks scrolling on its own view; the arcade checks the window (`src/ui/tabbar.ts`, `src/main.ts`).
- **Hidden or yielding:** the arcade's bar is removed while a game is open (`body.in-game`), while Movies shows its own bar (`body.movies-active`), and while it is inert. Movies' bar and its capsule stay hidden while the Up next card shows.
- **Glass:** the bar is clear. A 35% dark tint sits over the backdrop, which keeps its own contrast and colour (`--glass-tint`). In Chromium the lens blurs the backdrop by 3 px, bends it, then applies saturation 1.9 and brightness 1.03 (`--glass-frost` and `--glass-tone` in `src/theme.css`). Other browsers frost the bar instead, as the two bullets below describe. A directional rim lights the top left edge brightly and the bottom right edge faintly. Labels and icons carry a dense halo that hugs each glyph, so only the strokes' immediate surround darkens. Labels are 90% white, and the current item is white and bold on a 16% white pill with its own rim. The pill slides and stretches between items with a spring, and a press swells it.
- **Refraction:** in Chromium, the lens bends what is behind the bar. Its backdrop is blurred, then bent by an SVG displacement map (`src/ui/glass.ts`). The map is built at the screen's device pixel density, clamped to 1 to 3 device pixels per CSS px, and it is rebuilt when that density changes. The bend is up to 10 px at the top and bottom rims, and half that at the two ends. It falls to nothing over a 20 px bevel inside the rim, so the centre stays still and nothing folds. In the Chromium test (`tests/e2e/lens-refraction.spec.ts`), rows 3 to 11 of the top rim and rows 53 to 61 of the bottom rim of the 64 px bar stay unbent, although the map bends them. The cause is not established.
- **Frost (Safari, the iPhone browsers and Firefox):** only Chromium draws an SVG filter inside a backdrop filter, so these browsers frost the bar instead. The bar blurs what is behind it with its own backdrop filter: blur 10 px, saturation 1.8 and brightness 1.04 (`--glass-frost-body`). A glow layer (`.ui-glass-glow`) lights the rim, and in the frost it blends with plus-lighter. On phones (below 640 px), a soft scroll edge (`.ui-scroll-edge`) sits under the bar: a 6 px blur behind a mask gradient, with a faint dark gradient. It takes no taps, stays while the bar is minimized, and fades with the full hide. The mirror, an SVG scene of copied images, is removed.
- **Fallbacks:** under `prefers-reduced-transparency`, `prefers-contrast: more` and forced colours, the bar has no lens or frost. Under reduced transparency it is a 97% fill. Under more contrast it is a 96% fill with a 1 px border at 40% white. Without `backdrop-filter` support it is a 96% fill. Forced colours use system colours, drop the backdrop filter, and outline the pill. The capsule takes the same fallbacks.
- **Sheets:** the Menu, rules, accounts and leaderboard dialogs, and the Movies & TV episode drawer, are glass sheets (`.ui-glass-sheet`). On phones they are bottom sheets, inset 8 px from the edges. From 640 px they are centred panels at most 440 px wide, except the episode drawer, which is 600 px wide. The Menu, rules and episode drawer grow from the control that opened them, and the accounts and leaderboard sheets grow from the bottom centre (`src/ui/sheet.ts`). Every sheet leaves in 180 ms. The glass is a 28 px blur over a dark fill at 62% opacity. Controls inside a sheet use plain fills, and the one tinted action is cream. Reduced transparency and more contrast make the sheet opaque, and forced colours use system colours. The sheet's material comes from its own `--glass-sheet-*` tokens in `src/theme.css`.
- **Movies controls on glass:** the Up next card takes the sheets' glass surface from one rule in `src/theme.css`. Its tint is denser, at 74% against the sheets' 62%, so white text keeps 4.5:1 over a white frame. Play now is the white capsule, and Cancel is a neutral glass capsule. Its buttons have a white focus ring. The genre select is a glass capsule, at least 44 px high, with a chevron and a white focus ring. It stays a native select, so its open list is the browser's own. Under reduced transparency, more contrast and forced colours, the card and the episode drawer are opaque, like the sheets. The Movies glass tests check that white text on the card keeps 4.5:1 over a bright white frame, and that the drawer's text keeps 4.5:1 over dark and white frames, at 390 and 1440 px.
- **Forced colours on Movies:** the Movies buttons, season pills, episode rows, genre select and Up next buttons get a 2 px system-colour edge. The pressed season is underlined. The playing episode row has a 4 px leading edge and an underlined title. The countdown track is outlined in the system text colour, and the drag handle is drawn in that colour too.
- **Menu:** the Menu sheet holds the search field, a "Favourites only" switch, the sound, motion and colour settings, and the account section. Favourites and search moved into it when the top bar was removed.
- **Games:** the games keep their original look: posters, the gold focus ring and their own controls. The game of the day was removed, and the arcade has no top bar.

## Routes

`N` is the TMDB ID. `S` and `E` are the season and episode numbers.

| Hash | Shows |
| --- | --- |
| `#/movies` | Home: a hero, then Continue watching and My list when they have titles, then rails. The starter rails show until the rails arrive, and if they fail. |
| `#/movies/browse/movie` | The Movies section, with rails. |
| `#/movies/browse/tv` | The TV Shows section, with rails. |
| `#/movies/list` | My list, from saved titles. |
| `#/movies/movie-N` or `#/movies/tv-N` | The title page. |
| `#/movies/tv-N/season/S/episode/E` | The series page, with season S shown and its episodes listed. |
| `#/movies/movie-N/play` | The watch page for a movie. |
| `#/movies/tv-N/season/S/episode/E/play` | The watch page for one episode. |
| `#/movies/tv-N/play` | The unnamed TV play route. It shows "Episode unavailable" with the line "This link doesn't name an episode." and a "Choose an episode" link to the title page. No provider is contacted. |
| Any other hash | "That page could not be found." with a link back to browsing. Any stream stops, and the heading takes focus. |

- A section button changes the hash and resets the search and genre. Pressing the current section again re-renders it in place.
- The search button goes to `#/movies` and focuses the search field.
- The season pills on a series page go to that season's first episode.
- Typing updates the results in place. The search field keeps its node, focus and caret, and the count and status lines keep their nodes. Text that is still being composed is searched once, when the composition ends. On a browse page, a change to My list redraws the results the same way, so a typed query stays.
- A title whose details fail to load shows the error with a Retry title button. Retry takes the button away while the title loads. If the title fails again, focus returns to the button, unless the reader moved focus elsewhere during the load. When the title loads, focus moves to its heading.
- A rail keeps its scroll through a redraw of the same page. A season picked on a title page, with its season pills or in the episode drawer, stays on that page, so its rails keep their scroll. A rail of another page starts at its beginning.
- A new section resets the genre. The typed search stays in memory while the page is open.

## Playback

### Servers and parameters

The player tries servers in order: the remembered server first, then FrameXTV, VidLink, VixSrc and VidSrc.

| Server | Player origin | Movie and episode URLs | Start time | What it reports |
| --- | --- | --- | --- | --- |
| FrameXTV | `https://framextv.cc` | `/embed/{id}`, or `/embed/{id}/{season}/{episode}`, with `autoplay=1&muted=0` | `&t={seconds}` | Ready and playback messages |
| VidLink | `https://vidlink.pro` | `/movie/{id}`, or `/tv/{id}/{season}/{episode}`, with `autoplay=true` and `nextbutton=false` | `startAt={seconds}` | Playback messages only |
| VixSrc | `https://vixsrc.to` | `/movie/{id}`, or `/tv/{id}/{season}/{episode}`, with `autoplay=true` | `startAt={seconds}` | Playback messages only |
| VidSrc | `https://vidsrc.to` | `/embed/movie/{id}`, or `/embed/tv/{id}/{season}/{episode}`, with no autoplay parameter | None. It starts from the beginning. | Nothing |

- A start time is sent only from 15 seconds (`START_THRESHOLD`, `src/movies/provider.ts`). Earlier positions start from the beginning. Positions above 30 days are ignored.
- FrameXTV's messages are accepted from `framextv.cc` and `framextv.xyz`. Each other server's messages are accepted only from its own origin (`providerSignal`).
- A series URL names the season and episode of the route.

### Failover limits

These values are in `src/movies/playback.ts`.

| Limit | Value |
| --- | --- |
| Load timeout, from the start of an attempt to the frame's load event | 15 s |
| Ready timeout, FrameXTV only, from load to its ready message | 12 s |
| Slow prompt, for the other servers, from load | 12 s |
| Maximum attempts for one title | 4 |
| Time budget for one failover run | 45 s |
| Failure memory, per title and server, in memory only | 5 minutes |

- An attempt fails with the reason `no-load`, `no-ready` or `blocked`. A frame-src policy violation blocks an attempt at any time, even while it plays (`securitypolicyviolation` in `src/movies/view.ts`).
- Automatic failover applies only to servers the app picked. A failed attempt moves on to the next server in order. Servers that failed for the same title in the last five minutes are skipped.
- When the attempts or the time budget run out, or no server is left, the page shows "This title would not start on any server." with a "Try again" button.
- The budget starts again when a stream starts playing, and when a playing stream fails.
- The first playback report from a server stores it as the remembered server. A stored value that is not one of the four servers is ignored.
- **Manual pick:** choosing a server button starts that server for this title. If it fails, the page says "Server N didn't start. Try Server M." and does not switch by itself. A pick counts as manual only on the title it was made on. On other titles, it starts first, and its failure there triggers the automatic failover. A pick that failed on its watchdog comes back if its own frame later reports ready or playback.
- **Try again** clears the failure memory for this title, drops any manual pick and starts again from the top of the server order. Focus moves to the player screen.
- **Reload player** restarts the stream without clearing failures. Focus stays on the button.
- **Servers that cannot report:** VidSrc sends no messages, so the page cannot judge it. Before its frame loads it has the 15 s load timeout. After that, only a frame-src violation can fail it. Once it loads, its button stays idle, it never gets the slow prompt, and no timer moves the page on from it. It is never remembered. It cannot start at a saved time, so the watch page does not offer Resume for it, and its help line says it starts from the beginning.
- **Playback-only servers:** VidLink and VixSrc report playback but not readiness. If no playback report arrives 12 s after the frame loads, the slow prompt appears. The slow prompt never switches the server on its own. Only a load timeout before the frame loads, or a frame-src violation, moves the page on.

### On the watch page

- **Connecting overlay:** "Connecting to Server N…" covers the screen while an attempt connects. It hides when the frame loads.
- **Slow prompt:** "Taking a while? Try another server." appears as a row under the screen, above the server buttons, with a button for the next server. It goes away when the attempt moves on. It never appears for VidSrc.
- **Servers row:** a "Server N" button for each server, with the provider name and a status dot: amber while trying, green while working and red when failed. The row also has the "Reload player" button and a help line: "If a server will not start we try the next one automatically. You can also pick one."
- **Failover line:** "Server N didn't start. Trying Server M…" appears when the page moves on by itself. If that server had played, it reads "Server N stopped. Trying Server M…". A manual pick that fails reads "Server N didn't start. Try Server M." (or "stopped", if it had played), and it does not switch by itself. The line clears when a server reports playback.
- **Resume:** a movie's "Resume at m:ss" note, and a "Resumed at m:ss" pill for four seconds, appear only from 15 seconds, and only for a server that can start at a saved time.
- **Episode check:** a series episode that is not in a loaded season gets no provider frame. The page shows "Episode unavailable" with a link to the season's first episode, or to the title. While the season is still loading, the player starts, and the check runs when its episodes arrive.
- **Episode controls** (series only): Previous, the episode button that opens the drawer, Next, and the Auto next switch. At the first and last episode, Previous and Next are disabled and named "First episode" and "Final episode". Previous is also disabled, as "Previous episode unavailable", at the first episode of a season when an earlier season is listed but its episodes are not loaded, so the last episode before it is not known.
- **Focus after recovery:** Reload player and Resume stream keep focus on their control. When automatic failover runs out, the panel takes the player's place and focus stays on the control that had it. In each case, if that control has gone, focus goes to the page heading.
- **Episode drawer:** a modal dialog with season pills and episode rows. It is a glass sheet, and it grows from the episode control that opened it. Below 640 px it is a bottom sheet inset 8 px from the edges, with a drag handle. From 640 px it is a centred panel, `min(600px, 100% - 32px)` wide. Season pills use a translucent fill with a white label, and a long season name wraps inside its pill. Episode rows have no fill of their own, except the playing row and a hover fill. The playing episode has a white bold title, a 16% rose fill and a 3 px rose bar on its leading edge, and its meta is `--c-200`. The close button is the sheet's round icon button. Opening the drawer cancels an Up next countdown.
- **Screen:** the player area keeps a 16:9 ratio and is at most 1152 px wide. It runs full width below 640 px, and has a 16 px radius from 640 px.

## Auto next episode

TV episodes offer **Auto next episode**, on by default. At the end of an episode, an "Up next" card offers Play now or Cancel, and counts down for ten seconds. The card sits in the screen's bottom-right corner, or fills the screen below 640 px. It uses the glass surface described under Glass tab bar and sheets, so it is opaque where the sheets are. Play now is the white capsule, and Cancel is a neutral glass capsule. Cancel returns focus to the control that had it before the card took it. A provider frame or a video is never the target, so focus goes to the screen instead. Below 400 px the card's type and gaps tighten, so its buttons fit at 320 px. Its bar shrinks over the ten seconds, as a white bar on a translucent track. The bar does not animate when motion is reduced. The countdown follows the current season's episode order, then the first episode of the next numbered season. The final episode has no countdown. A finished episode is saved at zero. The preference is saved with settings and syncs for signed-in users. Watch progress and lists remain on this device.

End detection uses the native video's `ended` event, or a provider's playback report within one second of a known duration. Some servers do not report this, so no countdown appears for them. QCC changes the selected episode; the external player may still require its own play action.

Full screen expands the QCC screen when the browser supports it and keeps that screen open when advancing. Provider-owned fullscreen exits to reveal the overlay. Cancel, navigation, tab hiding, Study Mode and opening the episode drawer cancel the countdown. A browser exit from fullscreen that the view did not start, such as Escape, is handled as follows. If the episode drawer is open, the exit cancels it and closes it, and Study does not open. Otherwise the exit cancels the countdown and opens Study, which moves to another reading style of the same chapter when one is available, as Escape does. Study does not open if the page is hidden or suspended, the view has been disposed, or the screen has left the page. The view's own exits, from the Full screen button and from the exit that reveals Up next over a fullscreen player, do not open Study. Escape keeps the site's Study hotkey, and returning from Study leaves the stream paused on the same episode.

## Storage (`qcc:movies:v1`)

Movies uses its own key, separate from game saves, scores and sync. The record has these fields:

| Field | Holds | Notes |
| --- | --- | --- |
| `list` | Title IDs in My list, in the order added | Only the first 200 are kept when the record loads. A title added after the 200th is dropped at the next load. |
| `progress` | Media key to saved position, in seconds | Keys are `movie-N` or `tv-N:sS:eE`. Positions are capped at 30 days. |
| `titles` | Title ID to a snapshot of its ID, kind, name, year, poster and backdrop | Kept while the title is in My list or has a saved position above zero. Titles outside My list share a cap of 200, and the oldest go first. Artwork must be an approved TMDB size or a local `movies/` path. |
| `meta` | Media key to duration and update time | The duration is in seconds, above zero and at most 30 days. An entry with a longer duration is dropped when the record loads. The update time is in milliseconds. |
| `provider` | The remembered server ID | Ignored unless it is one of the four servers. |

- Invalid entries are dropped when the record loads. Nothing else is written, and no other key is used.
- Progress is saved about every five seconds while a title plays, and when playback pauses or ends. A finished title is saved at zero, so it leaves Continue watching. An early report, before the 15-second start point, does not replace a saved resume point. A position is written only after the media has reported a time in this visit, so opening a title and leaving at once writes nothing.
- **Clear my list & watch history** (in the footer) removes the list, progress, titles, meta and the remembered server. It writes an empty record under the same key. The in-memory failure memory and query cache are not cleared. They last only for the page.
- If storage cannot be read or written, the page keeps the data in memory for this visit, and the footer says that browser storage is unavailable. When a write is refused, the changes stay in memory, and the next write that succeeds saves them. Another tab's writes are adopted when they arrive, unless this page holds changes it could not save. A browser reload starts from the stored record, so changes that were never saved are lost. Data saved before the refusal is still there.

## Metadata and API

The eight bundled titles remain a useful starter collection and offline fallback. With `TMDB_READ_TOKEN` configured in Netlify for function runtime, search queries TMDB's full movie and TV metadata index, paginates the results, and fetches full title and selected-season episode metadata as needed. The bundled sample is not the entire catalog.

**Client** (`src/movies/query.ts`, `src/movies/network.ts`)

- Responses are kept in memory, for up to 100 URLs. They are fresh for 5 minutes for search and genre requests, and for 15 minutes for rails, title pages and seasons.
- A request is retried up to two more times, after 500 ms and then 1500 ms, for network errors and HTTP 429, 502 and 504. Timeouts and 503 are not retried.
- When a request still fails, the cached copy is shown and marked stale, if there is one. This covers HTTP 429 and 5xx responses, timeouts, network errors and unreadable bodies. Other responses, such as a 404, are never replaced by stale data.
- Requests time out after 20 seconds. The license file has a 5-second limit, and its failure never blocks the catalog.
- While a new page or query loads, the page keeps the previous results on screen. If the new query fails, the previous query's titles are cleared. A later page of the same query keeps its titles.

**Function** (`netlify/functions/movies-search.mts`)

Requests use GET on `/api/movies`. The TMDB read token is read on the server only. Without it, the function answers 503 `catalog_not_configured`.

| Request | Returns |
| --- | --- |
| `?rails=home`, `?rails=movie` or `?rails=tv` | `{rails:[{id, title, titles}]}`, with every rail of that set requested at once. Home has eight rails, Movies nine and TV nine. Each rail has at most 20 titles. |
| `?type=movie` or `?type=tv`, with `genre=NAME` and `page=N` | One page of TMDB discover results, sorted by popularity. NAME must be in the function's genre table. |
| `?q=TEXT`, with `type` set to all, movie or tv, and `page=N` | One page of TMDB search results. TEXT is up to 100 characters. Without `q`, `type` gives the week's trending titles. |
| `?id=movie-N` or `?id=tv-N`, with optional `season=S` | Title details, with cast, related titles and, for a series, its seasons and the episodes of season S, or of the first season. |

- **Rails:** each rail is one TMDB list, such as trending, popular, top rated, now playing, on the air or a genre. The rail requests run together. A rail that fails is left out, and the function answers 502 only when every rail fails.
- **Rail names:** Home has Trending now, Popular movies, Popular TV, Top rated movies, Action, Comedy, Science fiction and Thrillers. Movies has Trending movies, Popular, In cinemas, Top rated, Action, Comedy, Drama, Horror and Science fiction. TV has Trending TV, Popular, On the air, Top rated, Drama, Comedy, Crime, Sci-Fi & Fantasy and Mystery.
- **Credits:** up to 12 cast members, each with a name and a character. A member has a `w185` photo only when TMDB supplies one. Without a photo the card shows initials.
- **Related titles:** up to 12, from TMDB's recommendations.
- **Seasons and stills:** a series lists its positive-numbered seasons, up to 100. Each season lists up to 300 episodes, with a `w300` still, an air date that must be a real calendar date, and a rating. A rating needs at least one vote.
- **Time limits:** the function gives each TMDB request 8 seconds. The browser allows 20 seconds, which covers two sequential TMDB requests.
- **Errors:** 400 for `invalid_title`, `invalid_season`, `invalid_rails`, `invalid_type`, `invalid_genre`, `invalid_page`, `query_too_long` (over 100 characters) and `query_too_short` (one character). 404 for `title_unavailable`. 405 for `method_not_allowed`. 502 for `metadata_unavailable` and `invalid_metadata`. 503 for `catalog_not_configured`.
- **Season and response failures:**
  - An invalid season number, a `season` outside 1 to 999 or one that is not a whole number, is a 400 `invalid_season`. TMDB is not called.
  - A named season that fails, from a TMDB error or a season without an episodes array, is a 502 (`metadata_unavailable` or `invalid_metadata`). It is not cached.
  - A bare title request whose default season fails returns the title with that season empty, as a 200 without the CDN header. The CDN does not keep this incomplete answer, so the next request can retry. The page shows "Episodes for this season aren't available right now." with a Retry episodes button. Retry asks for the season by name. The browser's own in-memory cache still keeps the empty answer for 15 minutes.
  - A named season that the title does not list is answered with the title and no episodes for that season, as a 200 with the CDN header. That answer does not change, so the CDN keeps it like any complete answer.
  - A search, browse or genre response without a `results` array is a 502 `invalid_metadata`. A rail without one is left out, and the endpoint answers 502 only when every rail fails.
  - TV details without a `seasons` array are a 502 `invalid_metadata`, and they are not cached.

**Caching headers**

- Every response carries `cache-control: no-store`, so browsers keep nothing.
- A successful response that is not a search also carries `Netlify-CDN-Cache-Control: public, durable, s-maxage=900, stale-while-revalidate=3600`. That is 15 minutes at the CDN, then up to an hour of stale-while-revalidate.
- A request with `q`, even a blank one, never gets the CDN header.
- A rails response gets the CDN header only when every rail request succeeded and every rail has titles. A partial answer goes out without it, so the next request tries again.
- A title response for a bare request, one that names no season, gets the header unless its default season failed. An incomplete answer is not cached, so the next request can retry. A named season that fails is a 502 with no header.
- Error responses never get the CDN header.
- Static files under `/movies/`, such as the bundled catalog, are served with `no-store` by `netlify.toml` and `public/_headers`.

**Importer**

The operator-only TMDB importer retrieves weekly trending selections (up to 24 movie and TV titles), details, ratings, posters, backdrops, up to 30 positive-numbered seasons per series, and episode information. Adult-marked results are skipped. No token is embedded in the browser. The live `/api/movies` function also reads `TMDB_READ_TOKEN` only on the server and never forwards the query to FrameXTV. The function provides search, trending results, rails, genre pages, title details, credits, related titles and selected-season episodes. It does not proxy playback.

```sh
TMDB_READ_TOKEN=... TMDB_LOGO_PATH=/path/to/approved-logo.png npm run movies:import
npm run build
```

The importer stages files and atomically switches metadata after success. A failed refresh preserves the previous catalog. Review [TMDB terms and attribution](https://developer.themoviedb.org/docs/faq), commercial status and image/data usage rights; supply an approved unmodified attribution logo for API snapshots. Metadata and image access does not establish streaming rights. As of 2026-10-30, Netlify has TMDB_READ_TOKEN saved as a secret for Production and Deploy Preview, with the Functions and Runtime scopes. Deploy again after changing the variable so the published function receives the updated environment. The importer was integration-tested with a mock rather than run against a live account.

## Source tags and Archive.org playback

Every static title requires a `source` declaration. The current eight bundled titles are all `{ "type": "third-party" }`; none has a genuine public-domain or openly licensed Archive.org copy. TMDB imports also write this declaration. Missing or malformed declarations fail the build validator; the browser safely treats them as third-party. Search, rails, related titles and remote detail responses always remain third-party, regardless of a source claim in their response.

An operator-reviewed Archive.org entry uses `{ "type": "archive", "archiveId": "item_identifier", "license": "Short license statement", "evidence": "Review URL or collection note" }`. The identifier accepts only 1–100 ASCII letters, digits, dots, underscores and hyphens. License text must be nonblank and at most 200 characters; evidence must be nonblank and at most 2,000 characters. Source tags describe the reviewed copy, not the age or reputation of a title. A public-domain claim requires documented review of the specific copy and applicable rights; being hosted by Archive.org alone is insufficient. Do not relabel a third-party title without this review.

Archive playback uses `https://archive.org/embed/<archiveId>`, with `sandbox="allow-scripts allow-same-origin allow-presentation"`, fullscreen enabled and no referrer. Popups and top navigation remain disabled. It has no server picker or provider failover, including when its title has a numeric TMDB ID. Third-party playback shows a warning on every play attempt before an external player is created; acknowledgement is not remembered. The warning offers Go back and Continue; Go back has default focus, Escape cancels, and focus returns to the opening control. Archive playback does not use that third-party warning.

## Optional locally licensed files

`public/movies/licenses.json` is empty by default. To prefer a local MP4 or WebM, provide a record with a movie key or `tv-19885:s1:e1`, `movies/media/<file>.mp4`, an accepted license ID (CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0, LicenseRef-QCC), required credit, a review document under `docs/rights/`, `reviewed: true`, `territory: Worldwide` and an unexpired ISO date. `scripts/movies-validate.mjs` verifies the record and that media and review files exist before builds. This is an operator-reviewed self-hosted option, not a licensing assertion about FrameXTV. No copyrighted video or DRM-removal or extraction code is shipped.

## Offline and testing

The `movies/` subtree is excluded from the games offline manifest and worker runtime caches. External image and player requests are not handled by the worker. All games still use their existing offline assets. Movies needs network access for catalog and player use, and it is not part of "Make all games available offline".

The browser tests never contact a streaming provider: fixture pages stand in for every provider origin, so they test integration and isolation without claiming that live playback was verified. The [verification results](MOVIES_TV_TEST_RESULTS.md) record the redesign's results from 2026-10-30, and the 2026-10-25 record from before it. [Design references](MOVIES_TV_DESIGN_REFERENCES.md) link the FrameXTV catalog and embed documentation. Dynamic catalog tests use mocked TMDB responses. As of 2026-10-30, the deployed TMDB endpoint cannot return full-catalog results until its server-side token is configured.

## Running the end-to-end tests locally

1. Start the Vite dev server with `npm run dev`. Vite prints its address, normally `http://localhost:5173`.
2. In another terminal, point Playwright at that address and at a Chromium binary, then run the Movies specs:

```sh
ARCADE_URL=http://localhost:5173 CHROMIUM_PATH=/path/to/chromium npx playwright test --project=chromium tests/movies
```

3. Run WebKit with `--project=webkit` instead. It needs `npx playwright install webkit` once.

- `ARCADE_URL` sets the base address. When it is set, Playwright does not start a server, so the dev server must already be running. When it is not set, Playwright starts `npm run dev -- --port 4173` itself.
- `CHROMIUM_PATH` names a Chromium binary for the Chromium project. Leave it out and, outside CI, the project uses `/usr/bin/chromium` when that file exists. Otherwise, and in CI, it uses Playwright's own browser (`npx playwright install chromium`).
- The other suites are `tests/e2e`, `tests/accounts`, `tests/leaderboard`, `tests/games` and `tests/multiplayer`. Name them after `npx playwright test`, or leave the path out to run every spec.
- The Movies specs route the streaming origins and the TMDB image host to local fixture pages, so the tests do not contact a real provider.
- Unit tests run with `npx vitest run`, the type check with `npm run check`, and the build with `npm run build`.

## Open question for the owner

The reference embeds its player without a sandbox. Ours keeps `allow-scripts allow-same-origin`, which blocks popups and top navigation. If titles still fail on every server after this work, the likely cause is a provider that refuses to run in a sandbox. Relaxing the sandbox would expose visitors to popups and ads, so the choice belongs to the owner. Nothing has been changed for this question.

## Known gaps

These differ from the reference values or from the design spec, or they are limits of the current build.

- Movies poster cards are one fifth of the row width above 1000 px, about 3.5 cards up to 1000 px, and 60% of the row up to 650 px. Continue watching cards use their own fractions of the row.
- Rose marks progress bars and the episode that is playing. Saved items have no rose chip.
- The episode counts on season pills are hidden from screen readers.
- The metadata cache does not merge requests that are still in flight, so two identical requests at the same moment both go out.
- Labels on the island are judged by the dark halo around each letter. The median of the ring around a glyph is the measure, with a target of at least 4.5:1. That was measured on 2026-10-30 in Chromium over the games' real artwork. The lightest single pixel inside a letter can be lower over very bright art.
- Under reduced motion, a sheet's dimmed backdrop still fades in, with no movement.
- Outside Chromium the island does not refract. Safari, the iPhone browsers and Firefox frost what is behind it instead.
- In Chromium, the backdrop does not bend rows 3 to 11 of the top rim or rows 53 to 61 of the bottom rim of the 64 px island.
- My list keeps its first 200 titles when the record loads. A title added after that is dropped the next time the record loads.

## Screenshots

These screenshots were taken at 1440 × 900. The phone versions are 390 × 844 and have the same names, with `-390` in place of `-1440`. Both sizes are at one device pixel per CSS px. Posters, backdrops and episode stills are shown as plain placeholders, so no TMDB artwork is stored in the repository. The live site loads that artwork from TMDB. The player is the local test fixture, not a real stream.

Games and shell:

- [Games library with the tab bar](evidence/redesign/arcade-home-1440.png)
- [A game open](evidence/redesign/arcade-game-1440.png)
- [The Menu sheet](evidence/redesign/arcade-menu-1440.png)

Movies & TV:

- [Movies home](evidence/redesign/movies-home-1440.png)
- [Movies section](evidence/redesign/movies-movies-1440.png)
- [TV Shows section](evidence/redesign/movies-tv-1440.png)
- [My list](evidence/redesign/movies-list-1440.png)
- [Movie page](evidence/redesign/movie-detail-1440.png)
- [TV page](evidence/redesign/tv-detail-1440.png)
- [Watch page with the episode drawer open](evidence/redesign/watch-drawer-1440.png)
- [Watch page with the Up next card](evidence/redesign/watch-up-next-1440.png)
- [Watch page with a failover](evidence/redesign/watch-failover-1440.png)
- [Search results](evidence/redesign/search-1440.png)
