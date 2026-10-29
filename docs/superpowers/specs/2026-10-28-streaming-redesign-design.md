# Streaming-style redesign and reliable playback

Date: 2026-10-28. Requested by the user: "Crawl [FrameXTV], reverse engineer their system and steal their reliability. Then redesign our UI from the ground up to be practically identical to theirs." The user confirmed the scope ("the whole site, games included, should look like their app" and "titles fail to start in our Movies section even though they play on FrameXTV") and asked to start without further questions.

`frametv.xyz` is a parked domain. The reference is FrameXTV (`framextv.xyz`, which redirects to `framextv.cc`), the player our Movies section already embeds.

## 1. Intent and success

- **Look:** the arcade and Movies & TV share one visual system that a FrameXTV user would recognise: a black page, zinc surfaces, a sticky blurred header, a mobile tab bar, static feature heroes, horizontal poster rails, 2:3 media cards with chips and a hover play disc, and the same detail and watch page layouts.
- **Reliability:** when a playback server fails, the player recovers automatically (or with one click when it cannot tell), remembers the server that worked, resumes at the saved time, and never opens a player for an episode that does not exist. Metadata loads survive brief outages.
- **Nothing regresses:** games, saves, favourites, leaderboards, accounts, Study Mode, the offline pack, the privacy posture and the CSP keep working. Existing tests pass, or are updated deliberately where this design changes markup (section 11).

## 2. Boundaries

1. **Original work only.** FrameXTV's code, stylesheets, icons, logo, wordmark, artwork and copy are not reused. Their measured sizes, colours and layouts (section 3) are reference values for our own CSS and templates. Copy is written fresh. Icons are drawn for this project.
2. **Brand:** "Mauri Study Notes" with the existing mauri mark (pinned by branding tests). Legal and privacy sentences that name "QCC" as the operator keep their wording.
3. **Playback boundary unchanged:** sandboxed cross-origin iframe (`allow-scripts allow-same-origin`), `referrerpolicy="no-referrer"`, progress accepted only from the current frame and an approved origin, commands posted only to the exact provider origin. No stream extraction, proxying, DRM handling or token forwarding. No calls to FrameXTV's private endpoints (their API host, `/api/providers`, `/api/stream/*`), no `origin=internal`, no server-side provider probes.
4. **Study Mode stays a disguise:** Escape always opens Study (it also closes any open drawer), and `document.title` stays static on every route so a tab never names what is playing.
5. **Scope of restyling:** the shell (header, library, menus, dialogs, in-game toolbar and metrics) and Movies & TV. Game internals (`#game-stage` contents) and the light Study reading view are not restyled.
6. **No new runtime dependencies.** Plain TypeScript templates and CSS. No framework or Tailwind.

## 3. What the reference does (crawl summary)

FrameXTV's DevTools guard sends automated browsers to `about:blank` within seconds. We did not work around it. Everything below comes from its public CSS and JavaScript read as text, so values are declared, not rendered. The full reports are in the session scratchpad.

- **Stack:** React 19, React Router, TanStack Query, Tailwind v4, Lucide icons, a Vite build behind Cloudflare.
- **Visual system:** dark only. Page `#000`; zinc surfaces `#09090b`, `#18181b`, `#27272a`, `#3f3f46`; text `#fff`, `#e4e4e7`, `#d4d4d8`, `#9f9fa9`, `#71717b`. Primary buttons are white with black text. Rose `#ff2056` marks saved items and progress. Amber `#ffb900` marks ratings. System sans fonts, monospace for metadata and badges. Radii 4, 6, 8, 12, 16 and 24 px. Default motion 150 ms `cubic-bezier(.4,0,.2,1)`. Breakpoints 640, 768, 1024 and 1280 px. Content max width 1280 px, side padding 16 px (24 px from 640 px).
- **Pages:** sticky 56 px header (black at 95%, 12 px blur, 1 px white/5% border) with a logo, nav pills and a right-hand search and list group. Below 640 px the nav pills give way to a fixed five-tab bottom bar (57 px). A static home hero, rails of 2:3 cards, and listing pages with a filter bar. The detail page has a blurred backdrop, a poster, chips, actions, season pills, episode rows, a cast row and a recommendations rail. The watch page has a 16:9 player, a control row (previous, episodes, next, autoplay), an episode drawer and an auto-next card.
- **Reliability:**
  - Their player fails over between its own servers (12 s first-frame and 8 s stall watchdogs, at most 4 providers, a 45 s budget, failed servers remembered for 5 minutes). Their watch page never switches iframes automatically.
  - Requests carry timeouts and abort on navigation. One aggregated home request seeds every rail.
  - Query caches use 10 to 15 minute stale times and 3 retries, and keep previous results while refreshing.
  - Resume uses a `t` (seconds) URL parameter once progress passes 15 s. Image cards fall back individually.
- **Not to copy:** they post messages to `'*'`, never check message origins, embed without a sandbox and send no security headers.

## 4. Design tokens

A new `src/theme.css`, imported before every other stylesheet, defines the tokens. Both sections use them.

| Token | Value |
|---|---|
| `--c-bg` | `#000` |
| `--c-950`, `--c-900`, `--c-800`, `--c-700`, `--c-600` | `#09090b`, `#18181b`, `#27272a`, `#3f3f46`, `#52525c` |
| `--c-500`, `--c-400`, `--c-300`, `--c-200`, `--c-100` | `#71717b`, `#9f9fa9`, `#d4d4d8`, `#e4e4e7`, `#f4f4f5` |
| `--c-rose`, `--c-rose-soft`, `--c-amber`, `--c-red`, `--c-green` | `#ff2056`, `#ff637e`, `#ffb900`, `#ff6467`, `#00d492` |
| `--line-faint`, `--line`, `--line-strong` | white at 5%, 8% and 15% |
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif` |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` |
| `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`, `--r-2xl`, `--r-3xl` | 4, 6, 8, 12, 16, 24 px |
| `--sh-sm` | `0 1px 3px #0000001a, 0 1px 2px -1px #0000001a` |
| `--sh-md` | `0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a` |
| `--sh-lg` | `0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a` |
| `--sh-xl` | `0 20px 25px -5px #0000001a, 0 8px 10px -6px #0000001a` |
| `--sh-2xl` | `0 25px 50px -12px #00000040` |
| `--ease`, `--t-fast`, `--t`, `--t-slow` | `cubic-bezier(.4,0,.2,1)`, 150 ms, 200 ms, 300 ms |
| `--page-max`, `--gutter` | 1280 px; 16 px, 24 px from 640 px |
| `--header-h`, `--tabbar-h`, `--tabbar-gap` | 56 px; 64 px (the floating island's height, amended in section 15); 12 px |
| `--ease-drawer` | `cubic-bezier(.32,.72,0,1)`, the iOS-like sheet curve used by the tab bar's hide and show |

Type scale (sizes below 640 px, then from 640 px; colours as tokens):

| Role | Size and weight |
|---|---|
| Wordmark | 16/18 px, 800, tracking -0.025em; second word `--c-400` |
| Nav pill | 12 px, 500 (700 when current) |
| Hero title | 24 / 36 / 48 px (from 768 px), 800, tracking -0.025em |
| Hero badge, card chips | 10 px and 9 px mono, 600 to 700, uppercase, tracking 0.05em |
| Hero meta, card meta | 12 px and 11 px mono, `--c-300` and `--c-400` |
| Overview | 12/14 px, line-height 1.625, `--c-300` |
| Rail heading | 18/20 px, 700, tracking -0.025em |
| Card title | 12/14 px, 600, one line with ellipsis |
| Buttons | 12/14 px, 700 for primary and 500 for secondary |

Focus is stronger than the reference for accessibility: `:focus-visible { outline: 2px solid #fff; outline-offset: 2px }` everywhere. The Movies rule that removes outlines is deleted.

## 5. Shared components (`ui-` classes in `theme.css`)

Templates add these classes beside the existing hook classes (for example `class="game-card ui-card"`), so both sections render identically from one stylesheet.

- **`.ui-header`:** sticky, z-index 50, `--header-h` tall, black at 95%, `backdrop-filter: blur(12px)`, bottom border `--line-faint`. Inner row max `--page-max`, padding 0 12/24 px, gap 8/12 px.
  - `.ui-brand` is a 28 px white rounded tile holding the mauri mark, then the wordmark.
  - `.ui-pill` (nav item): padding 6×12 px, radius 8 px, 12 px text, `--c-400`. Hover: white on `--c-900` at 80%. Current (`aria-current="page"` or `aria-pressed="true"`): white fill, black text, 700, `--sh-sm`.
  - `.ui-icon-btn` (right-hand actions): 36 px minimum, radius 8 px, border `--line`, background `--c-950` at 80%, 16 px icon. Its label is visible from 768 px and visually hidden below that, so the accessible name stays.
- **`.ui-tabbar`** (amended in section 15, at the user's request): at every width, phones and desktop alike, a floating glass island rather than a flat bar. From 640 px the header's section pills stay as well, and the island adds My list and Study.
  - **Shape:** fixed, `left`/`right` 12 px, `bottom: calc(var(--tabbar-gap) + env(safe-area-inset-bottom))`, at most 440 px wide and centred, `min-height: var(--tabbar-h)`, 6 px padding, fully rounded (pill).
  - **Glass:** a dark tinted fill of at least 70% opacity (so labels keep 4.5:1 over bright art), a `backdrop-filter` of 24 px blur with saturation 1.8, a 1 px white border at about 12%, an inner top highlight, a soft drop shadow, and a faint specular sheen across the top. With no `backdrop-filter` support, or under `prefers-reduced-transparency: reduce`, the fill becomes near-opaque. Under `prefers-contrast: more` the border strengthens.
  - **Items:** five, each at least 54×44 px, with a 16 px icon and a 10 px label. Others use `--c-300`. The current item is white 700 on a rounded glass lozenge. Press scales to .95. With a fine pointer, hovering an item turns it white on a faint lozenge.
  - **Hide on scroll:** scrolling down by more than a small threshold slides the island down past the screen edge (`transform` only, `var(--t)` with `--ease-drawer`). Scrolling up by the threshold brings it back. It always shows near the top and near the end of the page, on pages too short to scroll, after every navigation, and whenever focus is inside it. While hidden it ignores pointer input. Under reduced motion it fades instead of sliding.
  - **Content clearance:** page content keeps enough bottom padding to clear the island when it is shown.
- **`.ui-btn`:** primary is white with black text; secondary is `--c-900` at 80% with a `--c-700` border and `--c-200` text. Height 32/40 px, radius 8 px, press scale .98.
- **`.ui-chip`:** mono 9 to 10 px, radius 4 px, black at 85% background, `--line` border, `--c-300` text. Rating variant is amber; saved variant is rose.
- **`.ui-rail`:**
  - Head: an h2, a count pill (10 px mono, rounded-full, `--c-900` at 60%, `--line-faint` border), and an optional mono subtitle.
  - Row: flex, gap 10/16 px, horizontal scroll, hidden scrollbar, `overscroll-behavior-x: contain`, `scroll-snap-type: x proximity`, padding 4 px.
  - Arrows: 32/40 px circles in `--c-950` at 90% with `--line-strong` borders and `--sh-xl`, offset 12/16 px outside the row. They appear on rail hover or `:focus-within`, are always shown on keyboard focus, and are hidden when the row cannot scroll that way.
  - Scroll step: 75% of the row width, smooth unless motion is reduced.
- **`.ui-card`:**
  - Size: rails use widths of 130 / 165 (640) / 185 (768) / 195 px (1024); grids fill their column.
  - Poster: 2:3, radius 8 px, `--c-900` background, `--line-faint` border, `--sh-md`.
  - Chips: type chip top-left and rating or score chip top-right, both 8 px inset.
  - Hover (hover-capable pointers only): border `--line-strong`; image scale 1.03 and brightness 1.05 over 300 ms; black 35% overlay; a 40 px white play disc rising 4 px over 200 ms; title turns white. `:focus-within` shows the overlay too.
  - Caption: 8 px top padding, title, then mono meta.
  - Image state: until it loads, a pulse skeleton; on load, a 300 ms fade-in; on error, a placeholder with an icon and the title in 10 px mono.
- **`.ui-grid`:** 2 / 3 (640) / 4 (768) / 5 (1024) / 6 (1280) columns, gap 10/16 px.
- **`.ui-hero`:**
  - Size: static, `clamp(380px, 50vh, 500px)` below 640 px and `clamp(420px, 46vh, 500px)` from 768 px. Content is bottom-left with 32/40 px bottom padding.
  - Backdrop and overlays: backdrop at opacity .7 with two overlays (bottom-up black, black 50%, transparent; left-to-right black, black 60%, transparent).
  - Content: a badge row, the title (max 672 px), a mono meta line, the overview (clamped to 2 lines, 3 from 640 px, max 576 px) and a button row (gap 10/12 px).
- **`.ui-footer`:** `--c-900` top border, black background, mono 12 px `--c-400`. The brand row comes first, then links separated by `•` in `--c-800`. It stacks below 768 px.
- **`.ui-skeleton`:** `--c-900` at 80%, radius 8 px, 2 s opacity pulse. Static when motion is reduced.
- **Modal panel:** the overlay is black at 85% with a 12 px blur. The panel is `--c-950` with a `--c-800` border, radius 16 px and `--sh-2xl`. Below 640 px drawers become bottom sheets (radius 24 px at the top, at most 85vh tall, with a drag handle bar).

Motion runs on `transform` and `opacity` only. `prefers-reduced-motion: reduce` and the site's `.reduce-motion` class remove the transforms, the pulse and the slides, and make smooth scrolling instant.

## 6. Arcade (games)

### 6.1 Header (`header.topbar.ui-header`)

- **Left:** `a.site-brand.ui-brand[href="#/collection"]`. Its text must stay exactly "Mauri Study Notes", with the `.mauri-mark` SVG kept.
- **Nav** (from 640 px, `nav[aria-label="Site sections"]`):
  - `a.count-pill.ui-pill[href="#/collection"][aria-current="page"][aria-label="21 games"]` holds a grid icon, the label "Games" and the count in a small badge.
  - `a.ui-pill[href="#/movies/browse/movie"]` "Movies".
  - `a.ui-pill[href="#/movies/browse/tv"]` "TV Shows".
- **Right:**
  - `button.header-search.ui-icon-btn[aria-label="Search games"]` opens the menu and focuses `#search`.
  - `button.favourites-pill.ui-icon-btn[aria-pressed]` has a star and the label "Favourites" (the label changes from "FAVOURITES"; one test updates).
  - `button.hamburger.icon-button.ui-icon-btn[aria-label="Open menu"]`.
- **Tab bar:** at every width (section 15), `nav.app-tabbar.ui-tabbar[aria-label="Sections"]` is a sibling after `<main>`. Its items are Games (`#/collection`), Movies (`#/movies/browse/movie`), TV Shows (`#/movies/browse/tv`), My list (`#/movies/list`) and a Study button (`data-action="study"`, named "Study").
  - It is hidden and inert whenever `.topbar` is: in a game, and while Movies & TV is open.
  - `main#content` reserves its height on phones.

### 6.2 Home (`#/collection`, `library()`)

```
<h1 class="sr-only">Mauri Study Notes · Games</h1>        (pinned)
<section class="arcade-hero ui-hero">                     (hidden while searching or filtering favourites)
<div class="game-grid" aria-label="Game library">          (container: flex column, gap 24/32 px)
  a.movies-launch                                          (feature banner: full width, poster wall, unchanged hooks)
  [Continue playing rail: a.continue-card items, only when saves exist]
  [Puzzle games rail] [Arcade action rail] [Classics & sandbox rail]   (each game once, catalog order)
  — or, while searching or filtering: one results section using .ui-grid, or p.empty-library —
</div>
<footer class="site-footer ui-footer">
```

- **Game metadata:** each entry in `src/core/catalog.ts` gains `genre` ('Puzzle' | 'Arcade' | 'Classic') and a `blurb` of at most 110 characters, written fresh (see the plan).
  - Puzzle: Block Blast, Water Sort, Suika Game, Minesweeper, Block Fill, Flow Free, Slipline, Tetris and Wordle.
  - Arcade: Stack, Flappy Bird, Ball Run, Snake, Slither.io and Pac-Man.
  - Classic: Animal Stack, Solitaire, Pool, Globle, Minecraft and Corn Clicker.
- **Game card** (`a.game-card.ui-card`): keeps `href` and `aria-label="Play {title}"`.
  - Poster: the cover SVG, `object-fit: cover`, on the game's `--card` colour.
  - Chips: a type chip with the genre (uppercase). When there is a best score, a score chip `★ {best}`.
  - Caption: an h3 title and mono meta ("Puzzle · Saved", "Puzzle · New" or "Puzzle · Best 120").
  - Each game appears exactly once in the library (tests count 21 `.game-card`).
- **Continue playing card** (`a.continue-card`, `aria-label="Continue {title}"`): 16:9 cover crop at 160/190/210 px wide, with the title and "Saved {relative time}" from the save's `updated` time, most recent first.
- **Hero:**
  - Featured game: the most recently saved game ("Continue playing" badge, button "Continue"). With no saves, a daily pick (`games[dayNumber % games.length]`, "Game of the day" badge, button "Play now").
  - Backdrop: the cover, blurred (28 px) and scaled to 1.15 at opacity .55. From 768 px the crisp cover also shows as a poster on the right.
  - Content: chips (genre, best score), an h2 title, mono meta, the blurb, and buttons: the primary link, plus a favourites toggle `[aria-pressed]` reading "Add to favourites" / "In favourites".
  - Button names must not contain "Play {title}".
- **Movies & TV launch card:** keeps its markup contract (link "Movies & TV" exactly, eight `w185` mini posters in an `aria-hidden` wall, no nested controls, gradient fallback, white heading, full width of `.game-grid`). It is restyled as a gradient module card (radius 12 px, `--c-800` border) with a tilted poster wall.
- **Footer:**
  - Brand: the brand tile, "Mauri Study Notes", and the tagline "Games, films and revision in one place".
  - Links: Games, Movies, TV Shows, and Leaderboards (a button opening the existing dialog).
  - Then the existing note "21 games. No ads. Optional accounts."

### 6.3 Menus and dialogs

- **Menu:** `#menu` becomes a right-hand sheet (`min(420px, 100vw)` wide, full height, `--c-950`, left border `--line`, radius 16 px on the open side). Sections are separated by `--line-faint`. Ids, labels and order stay the same.
- **Rules, accounts and leaderboards dialogs:** use the modal panel.
- **Buttons:** `.game-button` inside dialogs and the menu uses the `.ui-btn` styles (primary white, secondary zinc). `.game-button` inside `#game-stage` is unchanged.

### 6.4 Game view

- **Toolbar** (`.game-toolbar`): `--c-950` at 95% with a `--line-faint` bottom border. The title is 16 to 18 px, 700, sans. Icon buttons get radius 8 px, a `--line` border and a `--c-900` at 80% background.
- **Metrics** (`.game-metrics`): mono 10 px uppercase labels in `--c-400` and white 16 to 18 px values. `.record-crown` turns amber.
- **Pause overlay:** uses the modal panel.
- **Layout is fixed:** sizes, flex bases and the reference-game overlay layout in `game-viewport.css` stay exactly as they are, because tests measure the stage. `#game-stage` keeps the Arcade font explicitly, so game text does not change.
- **Background:** black.

## 7. Movies & TV

### 7.1 Routes

`parseMovieRoute` keeps its existing results. `#/movies` returns `{play:false}` exactly. New routes:

| Hash | Route |
|---|---|
| `#/movies/browse/movie` | `{play:false, kind:'movie'}` |
| `#/movies/browse/tv` | `{play:false, kind:'tv'}` |
| `#/movies/list` | `{play:false, kind:'list'}` |

The view derives `kind` from the route. Nav buttons set the hash; clicking the current section resets the query and genre in place. The search button goes to `#/movies` and focuses `#movies-search`. Query and genre stay in memory.

### 7.2 Header (`header.movies-top.ui-header`) and tab bar

- **Brand:** `a.movies-brand.ui-brand[href="#/movies"][aria-label="Movies and TV home"]`, with the same tile and wordmark.
- **Nav** (from 640 px): buttons `[data-kind]` named "Home", "Movies", "TV Shows" and "My list", with `aria-pressed` set for the current section (names pinned).
- **Right:**
  - The search toggle `.movies-search-toggle` ("Search movies and TV").
  - `a.movies-back[href="#/collection"][aria-label="Games"]` (grid icon, "Games" from 768 px).
  - `button.movies-study` "Study Mode", with an `Esc` kbd from 768 px. It is hidden below 640 px.
- **Tab bar** (`nav.movies-mobile-nav.ui-tabbar`, at every width per section 15): Home, Movies, TV Shows, My list, Study.

### 7.3 Home (`#/movies`)

- **Hero** (`.movies-hero.ui-hero`): the featured title is the first trending title, else the first catalog title (starter: Interstellar).
  - Badge "Featured film" or "Featured series", plus a rating chip.
  - `h1[tabindex=-1]` holds the title text only, with no link inside.
  - Meta: `{year} · Movie|Series · {up to three genres joined by " / "}`, then the clamped overview.
  - Buttons:
    - `button.movies-primary.ui-btn[data-play-route]` "Play" (pinned exactly).
    - `a.ui-btn.secondary[href=detail]` "Details".
    - `button.movies-hero-list[data-list][aria-pressed][aria-label="Add {name} to my list" | "Remove {name} from my list"]`, shown at every width.
  - The old "Streaming available · External player" note and the duplicate title link are removed.
- **Filter bar** (`.movies-filterbar`, styled as the reference's listing filter bar: `--c-950` at 60%, radius 16 px):
  - `label.movies-search` with an sr-only "Search movies and TV" and `input#movies-search` (pinned).
  - `select#movies-genre[aria-label="Genre"]`, built from bundled and loaded titles.
- **Results** (`#movies-results`, no longer an `aria-live` region; `p.movies-result-count[role=status]` announces counts):
  - **Unfiltered:**
    - Continue watching: `a.movies-continue` with a 16:9 backdrop, a 4 px rose progress bar when the duration is known, and `aria-label="Resume {name}"`.
    - My list, when it has entries.
    - Then rails from the aggregated API (section 8.5), or the starter rails ("Movies you'll love", "TV shows to get lost in", "Sci-Fi & Fantasy") when the API is unavailable.
  - **Filtered** (query or genre): `.movies-result-count`, `div.movies-results-grid.ui-grid` of `.movies-poster` cards, the catalog status line with "Retry search" (pinned), and pagination.
  - **When the trending request fails without a search:** show one quiet line ("Showing the starter selection. The full catalog is unavailable right now.") with a "Retry" button. The search-error copy appears only after a search.
- **Poster card** (`a.movies-poster.ui-card[aria-label="Details for {name}"][data-title]`, pinned):
  - Type chip FILM or SERIES; rating chip `★ x.x` when known.
  - No title overlay on the art (the duplicate is removed).
  - Caption: title, then mono meta (`year · Movie|Series`).
- **Rails:** `section.movies-shelf.ui-rail`. Arrow buttons stay named "Previous {name}" and "Next {name}".

### 7.4 Section pages (`#/movies/browse/movie`, `#/movies/browse/tv`) and My list (`#/movies/list`)

- **Section pages:**
  - Title block: h1 "Movies" or "TV Shows" with a fresh one-line subtitle, then the filter bar.
  - Rails from `?rails=movie` or `?rails=tv`. Fallback: bundled titles of that kind, as one grid.
  - A genre or query switches to the filtered grid.
  - A genre with the API available also asks the server for that genre (`?type=…&genre=…&page=n`) and merges the results with local matches.
- **My list:**
  - Title block "My list" with a count, then `.movies-results-grid` of saved titles (pinned).
  - Titles render from stored snapshots, so remote titles survive a reload.
  - Empty state: "Your list is empty", "Open a title and choose Add to my list to save it here.", and "Explore all titles" (`data-action="reset"`).

### 7.5 Title detail (`#/movies/{id}`)

- **Header** (`section.movies-detail`):
  - Backdrop: blurred (backdrop, else poster) at opacity .35, blur 64 px, scale 1.1, with the same two overlays as the hero.
  - Poster: `img.movies-detail-art[alt="Poster for {name}"]`, 160 / 208 (640) / 240 (768) / 288 px (1024), 2:3, radius 12 px, `--c-800` border, `--sh-2xl`.
  - Info column:
    - Chips: type, year, rating, runtime (`{h}h {m}m`).
    - h1 `[tabindex=-1]`, then genre chips and the overview.
    - Actions:
      - Movie: `button.movies-primary[data-play]` "Play movie" (pinned), with "Resume at {m:ss}" beneath when progress is at least 15 s.
      - TV: a primary link to the first episode, or the resume episode: "Play S{s} E{e}" or "Continue S{s} · E{e}".
      - Every title: `button[data-list][aria-pressed]` "Add to my list" / "In my list" (pinned).
    - Then `p#movies-unavailable` as a small mono note.
  - The "Back to browsing" link and the "Playback information" link are removed (one test updates).
- **TV:** `section.movies-episodes`.
  - Heading "Seasons" with "{n} seasons".
  - Season pills: `div.movies-season-pills[role=group][aria-label="Seasons"]` holds `button[data-season][aria-pressed]` labelled with the season name plus the episode count. They replace `select#movies-season`, and two tests update. A pill navigates to that season's first episode, loading it on demand as today.
  - Episode rows (`article.movies-episode`):
    - 16:9 thumbnail: the still when present, else the backdrop or poster. It has an "EP {n}" chip and is wrapped in an `aria-hidden` `tabindex=-1` link.
    - Text: h3 name, then mono meta (air date, runtime, rating).
    - Overview clamped to 2 lines.
    - `a[aria-label="Play {episode name}"]` "Play" (pinned).
    - A rose progress bar when the episode has progress.
- **Cast row:** shown when `cast` is present. Up to 12 people as 96/112 px cards: 3:4 photo or initials, name, character.
- **"More like this" rail:** shown when `related` is present.

### 7.6 Watch page (`…/play`)

`div.movies-player` is a CSS grid. Its direct children, in order:

1. `a.movies-detail-back[aria-label="Back to {name}"]`, showing "Back" (pinned name).
2. `h1[tabindex=-1]`.
3. Optional `h2` "S{s} · E{e} — {episode}" (pinned as a direct child).
4. `div.movies-watch-actions` (list toggle).
5. `div.movies-screen`.
6. `div.movies-servers`.
7. TV only: `div.movies-episode-controls`.
8. `p#movies-player-status`.

- **`.movies-screen`:** 16:9 (`aspect-ratio`), max width 1152 px, radius 16 px from 640 px (full bleed below), `--c-800` border, `--sh-2xl`, black. `data-title`, `tabindex` and `aria-label="Player area"` stay.
  - Contents: `.movies-media` (the iframe fills it), a connecting overlay, `.movies-next`, the sr-only announcement, the fullscreen button (top-right, translucent, named "Full screen") and the resume pill.
- **Connecting overlay** (`.movies-connecting`): a spinner and "Connecting to Server {n}…". After 8 s it adds "Taking a while? Try another server." It hides on the first sign of life (section 8.1).
- **Servers** (`div.movies-servers[role=group][aria-label="Servers"]`):
  - Buttons `button[data-server][aria-pressed]` show "Server {n}" with the provider name in small mono and a status dot (trying, working, failed).
  - `button[data-action="reload-stream"]` "Reload player" (pinned).
  - Help: "If a server will not start we try the next one automatically. You can also pick one." For VidSrc it adds "This server starts from the beginning."
  - These replace `select#movies-source` and "Try another source".
  - The failover status line (`p.movies-failover[role=status]`) lives here.
- **Episode controls** (`div.movies-episode-controls`, TV):
  - Previous (`a.ui-btn`, name "Previous episode") and Next (primary, "Next episode"). At the ends they render as disabled buttons named "First episode" and "Final episode".
  - Episodes: `button[data-action="episodes"]` showing the current "S{s} · E{e}". It opens the episode drawer.
  - `label.movies-auto-next` with `input#movies-auto-next` ("Auto next episode", pinned), styled as a switch.
  - Below 768 px the controls wrap into two rows.
- **Episode drawer:** `dialog.movies-drawer[aria-label="Select episode"]`, opened with `showModal()`. It holds season pills and episode rows (thumbnail, name, runtime), with the current episode highlighted in rose.
  - Below 640 px it is a bottom sheet; from 640 px a centred panel 672 px wide.
  - `pause()`, `navigate()` and `dispose()` close it. Escape opens Study (boundary 4), which pauses and closes it.
- **Auto-next** (`.movies-next[role=dialog][aria-label="Up next"]`): restyled as a card in the screen's bottom-right corner (full-width overlay below 640 px). It keeps the h2 "Up next: …", "Playing in {n}", "Play now" (primary) and "Cancel". It adds a 10 s progress bar that does not animate when motion is reduced.
- **Resume pill:** "Resumed at {m:ss}" in the top-left of the screen for 4 s when playback starts at the saved time.

### 7.7 Footer

`footer.movies-footer.ui-footer`:

- A brand row and section links.
- The existing privacy, attribution and streaming disclaimer paragraphs, with wording unchanged.
- `button[data-action="clear"]` and `p.movies-storage[role=status]`.

## 8. Reliability

### 8.1 Playback supervisor (`src/movies/playback.ts`, pure and unit tested)

- **States per attempt:** `connecting`, then `loaded`, then `ready` (any accepted message), then `playing` (a progress message). Any attempt can end in `failed` with a reason of `blocked`, `no-load` or `no-ready`.
- **Signals:**
  - The iframe `load` event.
  - `securitypolicyviolation` in our document with `effectiveDirective === 'frame-src'` during an attempt. This catches providers that redirect to hosts outside our CSP.
  - Accepted provider messages (FrameXTV also sends `frameXTV:ready` and `frameXTV:ended`).
  - A user server choice.
- **Watchdogs:** 15 s for `load`. For providers that announce readiness (FrameXTV), 12 s from `load` to `ready`. For providers that only report playback (VidLink, VixSrc) or never report (VidSrc), the page cannot judge, so after 12 s it shows the "Taking a while?" prompt instead of switching.
- **Automatic failover:** only for servers the app picked, not the user. On `failed`, move to the next server in order. Skip servers that failed for this media in the last 5 minutes (in-memory, module level). Stop after 4 attempts or 45 s.
  - When exhausted, show "This title would not start on any server." with "Try again", which clears the failure memory for this media and restarts at the first server.
  - A manual pick that fails shows the failure and suggests the next server, but does not switch by itself.
- **Order:** the remembered working server first, then FrameXTV, VidLink, VixSrc, VidSrc. The first `playing` signal stores that server in movie storage (section 8.4).

### 8.2 Provider parameters

- **FrameXTV:** `/embed/{id}[/{s}/{e}]?autoplay=1&muted=0` plus `&t={seconds}` when saved progress is at least 15 s. This replaces the post-load seek handshake.
- **VidLink and VixSrc:** `autoplay=true`, plus `startAt` from 15 s, plus `nextbutton=false` for VidLink.
- **VidSrc:** unchanged.
- **`FRAME_ALLOW`:** adds `autoplay` and `encrypted-media`. Every existing `'none'` denial stays. The sandbox is unchanged.

### 8.3 Episode validation

The player never builds a provider iframe for an episode that is missing from a loaded season. It shows "Episode unavailable" with a link back to the title instead. When the season is not loaded yet, the current optimistic behaviour stays, and the check applies once the metadata arrives.

### 8.4 Movie storage (`qcc:movies:v1`, backward compatible)

New optional fields:

- `titles`: id → `{id, kind, name, year, poster, backdrop?}` for listed and in-progress titles, capped at 200 and pruned to those ids.
- `meta`: media key → `{duration?, updated}`.
- `provider`: the last server that played.

Invalid entries are dropped on load. Nothing else is written, and no other key is used.

### 8.5 Metadata

**Client** (`src/movies/query.ts`, unit tested):

- An in-memory cache of at most 100 URLs, with in-flight de-duplication.
- Stale times: 5 minutes for search, 15 minutes otherwise.
- Retries for GET: up to 2, at 500 ms then 1500 ms, abort-aware. Only network errors and HTTP 429, 502 and 504 are retried. Timeouts and 503 `catalog_not_configured` are not.
- On failure it returns the cached copy, marked stale, if one exists.
- The view keeps showing previous results while the next page or query loads.

**Server** (`netlify/functions/movies-search.mts`, unit tested):

- `?rails=home|movie|tv` fans out to TMDB with `Promise.allSettled` and returns `{rails:[{id,title,titles}]}`. A rail that fails is omitted, and the endpoint returns 502 only when every rail fails.
  - home: trending all, popular movies, popular TV, top-rated movies, Action, Comedy, Science Fiction, Thriller.
  - movie: trending, popular, now playing, top rated, Action, Comedy, Drama, Horror, Science Fiction.
  - tv: trending, popular, on the air, top rated, Drama, Comedy, Crime, Sci-Fi & Fantasy, Mystery.
- `?type=movie|tv&genre={name}[&page=n]` uses TMDB discover by popularity. The genre name is validated against the function's genre table.
- `?id=…` adds `append_to_response=credits,recommendations`: `cast` (at most 12: name, character, photo `w185`) and `related` (at most 12 titles).
- Season episodes add `still` (`w300`), `airDate` and `rating`. `imageAsset` (client and server) accepts `w300`.
- Successful non-search responses add `Netlify-CDN-Cache-Control: public, durable, s-maxage=900, stale-while-revalidate=3600`. The browser `cache-control: no-store` header and every existing error code stay.

**Images:** `loading="lazy" decoding="async"` on cards (the hero is eager with `fetchpriority="high"`), with a skeleton, fade-in and placeholder (section 5).

## 9. Accessibility

- A visible focus ring everywhere, including the restored Movies outlines.
- Rail arrows are keyboard reachable and visible on focus.
- At least 44 px touch targets in the tab bars and drawer rows.
- A hidden tab bar shows again whenever focus enters it, so keyboard users never tab into an off-screen control.
- Body text at `--c-300` and above. `--c-500` only for decorative or 14 px-plus text.
- Hover effects only under `(hover:hover) and (pointer:fine)`. Touch layouts keep their controls visible.
- Reduced motion as in section 5.
- The drawer and dialogs use native `<dialog>` focus handling.
- Live regions are limited to status lines.

## 10. Non-goals

- Anime, API-docs, history, wallet and token pages.
- Share buttons and trailers (YouTube is outside our CSP).
- Theatre mode and a keyboard-shortcut dialog.
- Server-side provider probes and API mirrors.
- Caching Movies in the service worker.
- Restyling Study Mode or game internals.
- Changing the iframe sandbox.

## 11. Test impact (deliberate updates)

| Test | Change |
|---|---|
| `tests/e2e/shell.spec.ts` | `FAVOURITES` becomes `Favourites` |
| `tests/movies/movies.spec.ts` | The season select becomes season pills (2 places). The "Playback information" link becomes the "Play movie" button. `?autoplay=0` becomes `?autoplay=1`. The external-progress test asserts `t=42` in the iframe `src` instead of a seek message. |
| `tests/movies/provider.test.ts` | Exact URLs gain autoplay and start-time parameters, and `FRAME_ALLOW` gains `autoplay` and `encrypted-media` |
| Other movies specs | Kept passing. Pinned names and classes are listed in sections 6 and 7 |

New tests:

- **Unit:** the playback supervisor, the query cache and retry, provider URLs, storage snapshots, and the API rails, genre, credits and stills.
- **End-to-end:**
  - Failover after a `frame-src` violation and after a load timeout.
  - The remembered server, and the manual pick that does not auto-switch.
  - Episode validation.
  - The arcade hero, rails and tab bar.
  - Movies section routes.
  - No horizontal overflow at 320, 390, 768 and 1366 px.
  - Visible focus in Movies.
  - Reduced motion.

The shell and branding specs rewrite `docs/evidence` screenshots. The regenerated images are committed as evidence of the new look.

## 12. Calls made without the user

1. One wordmark in both headers; legal copy keeps "QCC".
2. Search stays on the Movies home, as the reference's listing pages do, rather than moving to a separate page.
3. The three-way game categories and the blurbs.
4. A focus ring stronger than the reference's, and reduced-motion support, which the reference lacks.
5. A static `document.title`, for the Study disguise.
6. Autoplay on with delegated permission, and a start time via URL. This matches the reference's own watch page.
7. Automatic failover only for automatic picks.

## 13. Open question for the user (not blocking)

The reference embeds its player without a sandbox. Ours keeps `allow-scripts allow-same-origin`, which blocks popups and top navigation. If titles still fail on every server after this work, the remaining likely cause is a provider that refuses to run sandboxed. Relaxing it would expose visitors to popups and ads, so the choice is the user's.

## 14. Verification

- `npm run check`, `npx vitest run` and `npm run build`.
- Playwright `tests/movies`, `tests/e2e`, `tests/accounts` and `tests/leaderboard` in Chromium. In this workspace that needs `ARCADE_URL` and `CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`.
- Screenshots at 1440×900 and 390×844 of every page and state in sections 6 and 7, reviewed against sections 3 to 5.
- A reduced-motion pass and a keyboard pass.

## 15. Amendments

- **2026-10-29, user request: glass island tab bar.** The user asked for the phone bottom bar to be "an Apple glass island that disappears on scroll down". This replaces the reference's flat bar for that one component, in both the arcade and Movies & TV, because both use `.ui-tabbar`. Section 5 holds the new look and behaviour. The behaviour lives in one shared helper, `src/ui/tabbar.ts`, which the arcade binds to the window scroll and Movies binds to its own scrolling view. The glass is original CSS (tint, blur, saturation, highlights); no Apple assets or code are used.
- **2026-10-29, user request: "For pc too".** The island shows at every width, not only below 640 px, with the same hide-on-scroll behaviour. On desktop the header keeps its section pills (the reference's look), so the island repeats Games, Movies and TV Shows and adds My list and Study. Content clearance applies at every width. Hover feedback for fine pointers is added.
