# QCC design system and app-shell reference

Read-only reference for the planned lazy sections QCC Social (`#/social`) and QCC Chat (`#/chat`). Paths are relative to `/home/user/Qcc-games-`. Line numbers come from the working tree as read on 2026-11-04.

Stack: Vite, strict TypeScript, vanilla DOM, no framework. The app has one dark palette. Nothing in `src/` or `index.html` switches on `prefers-color-scheme` or `[data-theme]`. The only light surface is Study, which sets `color-scheme:light` (`src/study/style.css:2`).

---

## 1. Tokens and shared CSS (`src/theme.css`)

### 1.1 Tokens on `:root` (`theme.css:2-18`)

```css
--c-bg:#000;  --c-950:#09090b; --c-900:#18181b; --c-800:#27272a; --c-700:#3f3f46; --c-600:#52525c;
--c-500:#71717b; --c-400:#9f9fa9; --c-300:#d4d4d8; --c-200:#e4e4e7; --c-100:#f4f4f5;
--c-rose:#ff2056; --c-rose-soft:#ff637e; --c-amber:#ffb900; --c-red:#ff6467; --c-green:#00d492;
--line-faint:#ffffff0d; --line:#ffffff14; --line-strong:#ffffff26;            /* theme.css:3-7 */
--font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","Noto Sans",Arial,sans-serif;
--font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
--r-sm:4px; --r-md:6px; --r-lg:8px; --r-xl:12px; --r-2xl:16px; --r-3xl:24px;  /* theme.css:10 */
--sh-sm / --sh-md / --sh-lg / --sh-xl / --sh-2xl                              /* theme.css:11-15 */
--ease:cubic-bezier(.4,0,.2,1); --ease-drawer:cubic-bezier(.32,.72,0,1);
--t-fast:150ms; --t:200ms; --t-slow:300ms;                                    /* theme.css:16 */
--page-max:1280px; --gutter:16px; --header-h:56px; --tabbar-h:64px; --tabbar-gap:12px; /* theme.css:17 */
@media (min-width:640px){:root{--gutter:24px}}                                  /* theme.css:19 */
```

- Glass springs `--ease-glass` and `--ease-glass-pop` are `linear()` curves inside an `@supports` block. They fall back to `--ease-drawer` (`theme.css:20-22`).
- `--ease-out:cubic-bezier(.23,1,.32,1)` is set locally on `.ui-tabbar` and `.ui-glass-sheet` (`theme.css:69,285`). The games shell defines it on `:root` in `src/style.css` line 1.
- Hard-coded values that recur in components: `#fff` and `#000` for the primary button and active pill (`theme.css:55,169`); cream `#ffe0a4` for game buttons (`src/style.css` line 1, `theme.css:330`); page background `#191d1c` and text `#f1eee5` (`src/style.css` line 1).
- No formal spacing scale. Values in use: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 44, 48, 56, 64 px.

### 1.2 Typography

- Arcade face: `@font-face` for `src/assets/arcade-bold.ttf`, weight 800, at `src/style.css:1`. It is the `:root` font of the games shell only.
- Sections and chrome use `var(--font-sans)`. The tab bar sets it on `.ui-tabbar` (`theme.css:69`). Sheets set it (`theme.css:290`). Movies sets `font:15px/1.5 var(--font-sans)` on `.movies-view` (`src/movies/style.css:3`).
- Mono (`--font-mono`) is used for chips, counts, kbd and card meta (`theme.css:53,174,182,200,213`).
- Sizes: sheet `h2` 20px (`theme.css:313`); sheet fields and settings 17px (`theme.css:318,322`); sheet muted 15px and note 13px (`theme.css:337-338`); rail heading 18px, then 20px at 640px (`theme.css:180-181`); card title 12px, then 14px (`theme.css:211-212`); card meta 11px mono (`theme.css:213`); chip 9px uppercase (`theme.css:174`); tab label 10px (`theme.css:109`); button 12px, then 14px (`theme.css:167,172`); hero title 24, 36, 48px (`theme.css:239,243,244`).

### 1.3 Shared `ui-` components

| Class | Lines | Notes |
|---|---|---|
| `.ui-container` | 34 | `max-width: var(--page-max)`, side padding `var(--gutter)` |
| `.ui-header`, `.ui-header-inner`, `.ui-brand`, `.ui-brand-tile`, `.ui-wordmark` | 37-46 | sticky, 56px, `#000000f2`, blur 12px |
| `.ui-nav`, `.ui-pill` (`[aria-current=page]` / `[aria-pressed=true]` → white) | 47-55 | header nav pills |
| `.ui-icon-btn`, `.ui-label` (sr-only below 768px), `.ui-kbd` | 51-63 | header icon button |
| `.ui-tabbar`, `.ui-tabbar-mini`, `.ui-scroll-edge`, `.ui-glass-lens`, `.ui-glass-glow` | 65-165 | floating glass island and capsule |
| `.ui-tab` (selected: `[aria-current=page]` / `[aria-pressed=true]`) | 109-112 | 44px min-height, bold white when selected |
| `.ui-btn` + `.primary` / `.secondary` / `.small` | 167-173 | 32px, 40px from 640px; primary white; secondary `#18181bcc` |
| `.ui-chip` (`.rating` amber) | 174-175 | mono 9px uppercase |
| `.ui-rail`, `-head`, `-body`, `-row`, `-arrow` (`.prev`/`.next`), `.ui-count`, `.ui-rail-sub` | 177-196 | horizontal scroll rows; card basis 130 → 165 → 185 → 195px |
| `.ui-card`, `-poster` (2:3), `-placeholder`, `-img`, `-chips`, `-play`, `-caption`, `-title`, `-meta` | 198-216 | poster card |
| `.ui-grid` | 218-222 | 2 cols; 3 at 640; 4 at 768; 5 at 1024; 6 at 1280 |
| `.ui-images` + `.is-loaded` / `.is-failed` | 224-230 | fade-in and failure states from `src/ui/images.ts` |
| `.ui-hero*` | 232-244 | hero, 380–500px tall |
| `.ui-footer*` | 246-253 | stacks below 768px |
| `.ui-drawer-handle` | 256-257 | 40x4 grab bar, phones only |
| `.ui-switch` | 258-264 | 36x20 switch |
| `.ui-glass-sheet` | 270-347 | glass dialog material (1.5) |
| `.ui-nav-icon` | 413-418 | outline and filled icon twins |

### 1.4 Glass tokens

Island and nav material (`theme.css:68`, arcade set `theme.css:373-388`):
- `--glass-tint`, `--glass-frost`, `--glass-tone`, `--glass-body`, `--glass-frost-body`, `--glass-rim-edge`, `--glass-glow`, `--glass-lift`, `--glass-pill`, `--glass-radius` (26px; 32px on `.section-tabbar`, `theme.css:394`).
- `--glass-ink` is `#fff`, and `#0b1015` under `[data-glass-tone=light]` (`theme.css:391-393`). `--glass-solid` is `#20262b` (`#f1f3f5` for light tone).
- `--glass-adaptive-ink` and `--glass-local-halo` are written per backdrop by `src/ui/glass-ink.ts` (`theme.css:426-433`).
- `--ui-pill-x`, `--ui-pill-w`, `--ui-pill-on` are written by `src/ui/glass.ts:130-133` and read at `theme.css:85`.

Sheet material (`theme.css:277`), shared by `.ui-glass-sheet` and the Movies "Up next" card:
```css
--glass-sheet-fill:var(--glass-frost-fill);     /* rgb(12 16 22 / .58); sheets use .90 (theme.css:469) */
--glass-sheet-body:var(--glass-frost-blur);     /* blur(20px) saturate(1.5) */
--glass-sheet-edge:rgb(255 255 255 / .3) rgb(255 255 255 / .14) rgb(255 255 255 / .14) rgb(255 255 255 / .3);
--glass-sheet-rim:inset 0 -1px 0 rgb(0 0 0 / .12);
--glass-sheet-lift:0 5px 16px rgb(0 0 0 / .15),0 1px 2px rgb(0 0 0 / .14);
```

### 1.5 Sheets (`.ui-glass-sheet`, `theme.css:270-347`)

- Phone (`theme.css:284-296`): `width:calc(100% - 16px)`, `max-height:min(85dvh, …)`, `padding:20px`, `border-radius:32px`. Closed state `opacity:0; scale:.98; translate:0 28px`. Exit 180ms `--ease-out`.
- From 640px (`theme.css:297-299`): `width:min(440px, calc(100% - 32px))`, `max-height:min(86dvh,760px)`, `border-radius:28px`.
- Open (`theme.css:301-306`): opacity 180ms; scale and translate 320ms `--ease-glass-pop`.
- Backdrop (`theme.css:309-311`): plain fade, 220ms in, 160ms out, no blur.
- Origin: `transform-origin: var(--sheet-origin, 50% 100%)`, set by `openSheet`.
- Contents: `h2`, `.icon-button` 44px circle (`theme.css:315`), fields 12px radius (`theme.css:318`), `.setting-list` with native checkboxes restyled as switches (`theme.css:321-328`), `.game-button` as a cream 999px pill (`theme.css:330-334`), `.muted`, `.menu-note` (`theme.css:337-338`).
- Fallbacks: no backdrop-filter `rgb(18 22 28 / .94)` (`theme.css:342`); reduced transparency `rgb(28 28 32)` (`theme.css:343`); more contrast opaque with 2px border (`theme.css:344-347`); forced colours (`theme.css:348-358`).
- Scrollbar hidden (`theme.css:469-470`).
- `src/ui/arcade-sheets.css` adds `.arcade-sheet` tokens: `--sheet-veil`, `--sheet-ink`, `--sheet-focus:#fff`, `color-scheme:dark` (`arcade-sheets.css:14,27`). Only the dialog ids listed in 2.2 receive that class.

### 1.6 Focus rings (`theme.css:24-31,340,443-446`; `src/style.css` line 1)

`src/ui/focus.ts` sets `data-input` on `<html>` to `keyboard` or `pointer`. Rings show only in keyboard mode.

- Pointer mode: `a, button, input, select, textarea, [tabindex]` lose their focus outline (`theme.css:26`, specificity held at zero by `:where`).
- Keyboard, Movies and tab bar: `2px solid #fff`, offset 2px (`theme.css:27`).
- Keyboard, arcade glass: `2px solid #fff`, offset 2px, plus `box-shadow:0 0 0 6px #000` (`theme.css:446`). Glass controls use `var(--glass-ink)` at offset 3px (`theme.css:443`).
- Keyboard, sheets: `2px solid #fff`, offset 2px (`theme.css:340`).
- Text fields and selects: no outer ring in any mode. Focus sets the border (`theme.css:30`). Keyboard adds `inset 0 0 0 1px rgb(255 255 255 / .7)` (`theme.css:31`).
- Other shell controls (generic `#app` buttons and links) get the games rule from `src/style.css` line 1: `:where(:root[data-input="keyboard"]) :is(button,a,input,select):focus-visible{outline:3px solid #ffe0a4;outline-offset:4px}`. A new section's plain `.ui-btn` gets this cream ring unless it adds its own rule.
- Forced colours: `theme.css:359-361`.

### 1.7 Light and dark

- One dark palette: `color-scheme:dark` on `:root` (`src/style.css` line 1), on `.movies-view` (`src/movies/style.css:3`) and on `.arcade-sheet` (`arcade-sheets.css:14`).
- Study alone is light: `body.study-active` sets `background:#fff; color-scheme:light` (`src/study/style.css:2`), with its own `--study-*` tokens (`src/study/style.css:3`).
- Glass ink is adaptive. `data-glass-tone` picks the default ink variable, and `glass-ink.ts` samples the backdrop. `INK=[11,16,21]`, `CLEAR_VEIL=.2`, `NAV_VEIL=.36` (`glass-ink.ts:5,12`).
- `openSheet` sets `data-glass-tone` on arcade dialogs: `light` in Study, the game's own tone in a game, `dark` in Movies, otherwise `light` (`src/ui/sheet.ts:53`).

### 1.8 Reduced motion

Three triggers, all honoured:
1. `@media (prefers-reduced-motion:reduce)`.
2. `.reduce-motion` class on `<html>`.
3. The user setting `preferences.reducedMotion`, which `main.ts` writes to that class (section 3.4).

Rules:
- Global reset, excluding `#game-stage` and the tab bar: zeroes `animation`, `transition`, `scroll-behavior`, and sets `transform:none` on `.ui-btn`, `.ui-tab`, `.ui-card`, `.ui-card-img`, `.ui-card-play` (`theme.css:364-369`, class copy at `theme.css:368-369`).
- Tab bar: nothing moves or stretches. One 150ms opacity fade remains, with `!important` to beat the reset (`theme.css:146-165`).
- Glass controls: `theme.css:461-463`. Sheet game-button press: `theme.css:335-336`.
- Section nav: `src/ui/section-navigation.css:53-59`. Modal nav: `src/ui/modal-navigation.css:11-12`.
- JS check, `src/ui/glass.ts:135-137`: `document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches`.
- Rails: `bindRails(root, reduced)` scrolls with `behavior:'auto'` when reduced (`src/ui/rails.ts:38-43`).

### 1.9 Breakpoints and queries

Widths: 359 max (`src/style.css:22`); 360 (`theme.css:44,50`); 620 (`src/style.css:35`); 640 (`theme.css:19,56,82,172,257,297`); 650 max (`src/movies/style.css:16`); 768 (`theme.css:57,62,195,244,253`); 1000 max (`src/movies/style.css:96`); 1024 (`theme.css:63,196,221`); 1240 (`src/style.css:36`); 1280 (`theme.css:222`).

Other queries: `(hover:hover) and (pointer:fine)` for every hover rule (`theme.css:54,123,173,217`); `(max-resolution:1.5dppx)` (`theme.css:283,435`); `(prefers-reduced-transparency:reduce)`, `(prefers-contrast:more)`, `(forced-colors:active)` (`theme.css:141-145,343-349,459-460`).

### 1.10 z-index layers

| z | Element | Source |
|---|---|---|
| 60 | `.movies-next` (640px+), `.mp-overlay` | `src/movies/style.css:270`, `src/multiplayer/style.css:18` |
| 50 | `.ui-header`, `.ui-tabbar`, `.ui-tabbar-mini`, `.section-navigation` | `theme.css:37,69,131`; `src/style.css:15` |
| 49 | `.ui-scroll-edge` | `theme.css:81` |
| 30 | `.movies-view` (fixed full-screen), `.game-dock`, Study cookie panel | `src/movies/style.css:3`, `src/game-viewport.css:23`, `src/study/style.css:26` |
| 20 | `#pause-overlay`, `.lb-sidebar` | `src/style.css` line 1; `src/leaderboard/style.css:5` |
| 19 | `.game-sheet` | `src/ui/game-sheet.css:1` |
| 3–4 | `.floating-glass-group > *`, `.ui-rail-arrow`, `.ui-card-chips`, `.ui-card-play` | `src/ui/floating-controls.css:2`, `theme.css:188,207,208` |
| 2 | `.ui-card-poster::after`, `.arcade-glass > .ui-glass-glow` | `theme.css:201,401` |
| 1 | `.ui-tab`, `.floating-glass-group`, `.glass-control` | `theme.css:109`; `src/ui/floating-controls.css:1`; `theme.css:440` |
| −1 / −2 | `.ui-glass-lens`, `.ui-hero-shade` (−1); `.ui-hero-backdrop` (−2) | `theme.css:73,235,234` |

Dialogs open with `showModal()`, so they sit in the top layer above all of these.

---

## 2. `src/ui/` modules

### 2.1 `icons.ts`
- Export `uiIcon(name: UiIcon): string` (`icons.ts:51-54`). Type `UiIcon` at line 1.
- Names: `grid, games, home, film, tv, bookmark, search, menu, study, play, info, plus, check, chevron-left, chevron-right, back, close, image`.
- Filled twins exist for `games, home, film, tv, bookmark, study, menu` (`icons.ts:2,21-49`). The rest are outline only.
- Outline style (`icons.ts:53`): `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, round caps and joins, `aria-hidden`, `focusable="false"`, class `ui-icon`.
- Nav style (`icons.ts:16-19,52`): stroke 1.75, round caps and joins, class `ui-icon ui-nav-icon`, with `ui-icon-line` and `ui-icon-fill` groups. CSS shows one at a time (`theme.css:415-417`).
- Sizes: `.ui-icon` 16px (`theme.css:33`); capsule 20px (`theme.css:132`); card placeholder 24px (`theme.css:205`); play 18px (`theme.css:209`); sheet close 20px (`theme.css:316`).
- `main.ts:36-39` has a second local helper with stroke 2.6 and names `menu, back, star, pause, play, restart, rules, fullscreen, exitfs, grid, close`. New code should use `uiIcon`.

### 2.2 `sheet.ts`
- `openSheet(dialog, trigger?)` (`sheet.ts:49-60`). For ids `menu`, `game-options`, `rules-dialog`, `accounts-dialog`, `leaderboard-dialog` it adds `arcade-sheet` and sets `data-glass-tone` (`sheet.ts:51-53`). It calls `showModal()`, then binds close buttons. Those get `ui-tab arcade-glass glass-control sheet-close-glass` and glass (`sheet.ts:16-19`).
- Origin: `sheetOrigin(trigger, sheet)` (`sheet.ts:40-45`) sets `--sheet-origin` from the trigger's centre. No trigger means bottom centre (`sheet.ts:57`).
- Pattern (`main.ts:44`): `<dialog class="ui-glass-sheet" aria-labelledby="…"><form method="dialog" class="dialog-head"><h2 id="…">Title</h2><button class="icon-button" aria-label="Close …">[close icon]</button></form>…</dialog>`.

### 2.3 `tabbar.ts`
- `autoHideTabbar(bar, scroller)` returns `{reset(), dispose()}` (`tabbar.ts:49-161`).
- `nextTabbarState(state, y, max, typing)` is the pure rule covered by `tests/core/tabbar.test.ts` (`tabbar.ts:18-35`).
- Constants (`tabbar.ts:7-13`): minimize after 64px down, expand after 32px up, always expanded within 64px of the top, cannot minimize above 120px, always shown within 24px of the end.
- Minimized: the bar gets `data-minimized="true"` and a capsule `button.ui-tabbar-mini` is inserted after it (`tabbar.ts:52-58,117-122`). The capsule copies the current tab icon (`tabbar.ts:126-130`), is `aria-hidden`, `tabIndex=-1`, and calls `reset()` on tap (`tabbar.ts:135`).
- Focus in a text field holds the state (`tabbar.ts:15,72,79`). `[data-sheet-hidden]` holds it too (`tabbar.ts:78`).
- `data-hidden` is never written here. Movies sets it for Up next (`src/movies/view.ts:212`).
- Binds `bindGlass(bar)` and disposes it (`tabbar.ts:63,157`).

### 2.4 `navigation.ts`
- `createSectionNavigation(scope: 'app' | 'movies')` returns `{root, bar, menu}` (`navigation.ts:5-17`).
- Markup: `nav.{app|movies}-navigation.section-navigation[aria-label=Sections] > [div.{app-tabbar|movies-mobile-nav}.section-tabbar.ui-tabbar.arcade-glass[data-glass-tone=light]] + [button.{app-menu|movies-menu}.section-menu.ui-tab.arcade-glass.glass-control[data-action=menu][aria-haspopup=dialog]]`.
- The shell builds one at `main.ts:46` and prepends it to `#app` (`main.ts:48`). Movies builds its own (`src/movies/view.ts:204`) and fills its bar from `mobileNav()` (`src/movies/view.ts:997`).
- `.section-navigation` is fixed, bottom, z 50, `pointer-events:none`, `max-width:440px` (`src/style.css:15`). `.section-menu` is a 64px circle at the right (`src/style.css:18`).
- `.app-navigation` is hidden in `body.in-game` and `body.movies-active` (`src/style.css` line 8) and when `[data-view-hidden]` is set (`src/style.css` line 9).

### 2.5 `glass.ts`
- `bindGlass(bar): {dispose()}` (`glass.ts:199`). Adds the selection pill, press, and lens. Mode is `data-glass`: `backdrop` (Chromium SVG lens) or `frost` (other browsers), or `off` for accessibility (`glass.ts:8,122-128`).
- `pillVars(tab)` (`glass.ts:130`). Bounded for `.section-tabbar`, `.section-menu`, `.floating-glass-group` (`glass.ts:204`).
- Lens constants `LENS_BEND=10`, `LENS_BEVEL=20`, `ARCADE_LENS_BEND=5`, `ARCADE_LENS_BEVEL=12` (`glass.ts:17-27`).
- Any new `.arcade-glass` control needs `bindGlass` on it, or a parent `bindFloatingGroups` (2.7).

### 2.6 `focus.ts`
- `trackInputMode(root?)` (`focus.ts:27-31`). Called once at `main.ts:41`. `pointerdown` sets `pointer`. A qualifying `keydown` sets `keyboard`.
- `isKeyboardKey(key, target)` (`focus.ts:14-19`): `Tab` always counts. Lone modifiers do not. Keys into text fields do not. Checkbox, radio, range, button and submit are control inputs.

### 2.7 `images.ts`, `rails.ts`, `floating-controls.ts`, `modal-navigation.ts`
- `watchImages(root)` (`images.ts:5-18`) adds `ui-images` and sets `.is-loaded` / `.is-failed` on `img.ui-card-img` and `img.ui-hero-backdrop`. `markImages(root)` (`images.ts:21-27`) handles images that finished before the watcher attached.
- `bindRails(root, reduced)` (`rails.ts:38-58`) handles arrow clicks on `[data-scroll]` inside `.ui-rail`, tracks scroll, and watches resizes. `updateRails(root)` (`rails.ts:30-36`) writes `data-can-prev` and `data-can-next`. Step is 0.75 of the row width (`rails.ts:9-11`). Focus moves off hidden arrows (`rails.ts:19-29`). Arrows are `.ui-rail-arrow.prev|next`, and the scroll row is `.ui-rail-row` (`theme.css:185,188-190`).
- `createGameDock` (`floating-controls.ts:6-22`) is games-only. `bindFloatingGroups(root)` (`floating-controls.ts:25`) binds glass to `.floating-glass-group` children, and Movies calls it on `.movies-top` (`src/movies/view.ts:998`).
- `suppressNavigationUnderSheets()` (`modal-navigation.ts:8-57`), called at `main.ts:49`, sets `data-sheet-hidden` and `inert` on `.section-navigation, .game-dock` while any dialog is open. It does not handle keys (`modal-navigation.ts:6-7`).
- `loadWithDeadline(run, parent, ms, timeoutError)` (`src/ui/load-deadline.ts:3`) bounds a lazy load.

---

## 3. `src/main.ts` shell

### 3.1 Routes
- `async function route()` (`main.ts:216-252`). Called from `hashchange` (`main.ts:431`), from the Study return (`main.ts:91`), from `finishEntry` (`main.ts:455`), and from account identity changes (`main.ts:477`).
- Start (`main.ts:217-221`): return if not initialised; `tabbar.reset()`; clear `accountRoutePending`; hide Study if open.
- Movies (`main.ts:222-239`): `const isMovies=location.hash==='#/movies'||location.hash.startsWith('#/movies/');`
  - If `movies` exists, `movies.navigate(location.hash)` and return (`main.ts:224`).
  - Otherwise close the menu, rules and leaderboard dialogs, `const token=++generation; leave(); setChromeInert(true);`, and write the loading block (`main.ts:229-231`).
  - `await Promise.all([import('./movies/view'), import('./movies/storage')])`, guarded by `token!==generation` (`main.ts:233`). Construct the view (`main.ts:235`), then `navigate` (`main.ts:236`).
  - On failure, `.game-error` with a "Back to games" link (`main.ts:237`).
- Games (`main.ts:240-252`): `entryFromHash` from `src/core/navigation.ts`. Anything else falls to `library()`.
- Hashes: `collectionHash = '#/collection'`, `entryHash(id) = '#/collection/<n>'` (`src/core/navigation.ts:2-3`).

A new section adds an `if(isSocial)` / `if(isChat)` branch in the same style, before `const wasInMovies` (`main.ts:240`).

### 3.2 `leave()`, `setChromeInert()`, `library()`
- `setChromeInert(value)` (`main.ts:112-116`) sets `data-view-hidden` and `inert` on `.app-navigation`, and `inert` also when `data-sheet-hidden` is set.
- `leave(saveProgress=true)` (`main.ts:117-132`): disposes `movies` (`main.ts:118`), restores chrome (`main.ts:119`), `tabbar.reset()` (`main.ts:120`), fullscreen, leaderboard sidebar, game chrome and menu, saves and flushes, disposes the game, removes `in-game`, and syncs the viewport lock.
- `library()` (`main.ts:137-146`) renders the games grid into `#content`, with user text set through `textContent`.
- `accounts.beforeIdentityChange = () => {generation++; leave(false);}` (`main.ts:470`). Login, logout and cross-tab account changes all pass through it, so a new section must be disposed by `leave()`.

### 3.3 Menu and accounts
- `#menu` (`main.ts:44`) and `AccountsView` (`src/accounts/view.ts`, id `accounts-dialog`) are both `.ui-glass-sheet`.
- `openMenu(trigger?)` (`main.ts:393-397`): refresh account text, pause a running game, `openSheet(menu, trigger)`. Wired at `main.ts:398`.
- `menu` close handler (`main.ts:405`): calls `library()` unless there is a game, Movies, or Study. It checks `!location.hash.startsWith('#/movies')`. A new section needs the same guard here.
- `AccountsView` is built at `main.ts:58` and opened from `#open-accounts` (`main.ts:480`), leaderboards (`main.ts:59`), and boot when there is no session and no guest choice (`main.ts:496`). Cancel counts as "Play as guest" (`src/accounts/view.ts:24`).

### 3.4 Preferences and reduced motion
- `preferences = store.settings()` (`main.ts:56`). Type `Settings {sound, reducedMotion, colorBlind, autoNextEpisode}` (`src/core/types.ts:3`). Default for `reducedMotion` is the media query (`src/core/storage.ts:37`).
- Checkboxes `#sound`, `#motion`, `#colour` (`main.ts:422-428`) write the setting and toggle `html.reduce-motion` (`main.ts:426`). Also applied at `main.ts:429` and `main.ts:468`.
- Movies gets a live getter, `()=>preferences.reducedMotion` (`main.ts:235`). Follow the same pattern.

### 3.5 Study and Escape
- `openStudy(advance)` (`main.ts:187-199`): `movies?.pause()` (`main.ts:188`), pause the game, close the dialogs, `hideArcade()`, show the article.
- `hideArcade()` / `showArcade()` (`main.ts:172-180`) toggle `body.study-active` and `app.inert`. `#app` is `visibility:hidden` under `.study-active` (`src/study/style.css:4`).
- Global key handler, capture phase on `window` (`main.ts:435-446`). The gate that decides whether Escape opens Study is:
  ```ts
  if(event.key!=='Escape'||(!activeId&&!movies&&!study.isOpen))return;   // main.ts:443
  ```
  Escape opens Study only for an active game, a mounted `movies`, or an open Study. A new section adds its own flag here, or Escape does nothing there.
- Escape first cancels an open dialog (`main.ts:440`) and gives the game `dismissMenu` a turn (`main.ts:441`). While Study is open, other keys are swallowed (`main.ts:442,447`).
- `returnFromStudy()` (`main.ts:200-214`) restores focus with fallbacks `#game-stage`, `.movies-menu`, `.app-navigation [data-action="menu"]` (`main.ts:212`). Add a fallback for the new section.

### 3.6 Visibility and tab bar
- `pagehide` calls `movies?.pause()` (`main.ts:432`). Add the new section's `pause()` here.
- `visibilitychange` pauses only the game (`main.ts:433`).
- `tabbar.reset()` runs in `route()` (`main.ts:218`), `leave()` (`main.ts:120`), and after Study (`main.ts:208`).

### 3.7 The app tab list (`main.ts:47`, in order)

1. `a.ui-tab[href="#/collection"][aria-current="page"]`: Games, icon `games`
2. `a.ui-tab[href="#/movies/browse/movie"]`: Movies, `film`
3. `a.ui-tab[href="#/movies/browse/tv"]`: TV Shows, `tv`
4. `a.ui-tab[href="#/movies/list"]`: My list, `bookmark`
5. `button.ui-tab[data-action="study"]`: Study, `study` (opened by `main.ts:399`)

`aria-current` is static markup on Games. Nothing updates it on route change. Movies uses `button.ui-tab[data-kind][aria-pressed]` plus a Study button (`src/movies/view.ts:986`).

---

## 4. `src/movies/view.ts` as the lazy-section template

### 4.1 Load and mount
- Imported only inside `route()` (`main.ts:233`). The module imports its own stylesheet (`src/movies/view.ts:1`).
- Data outlives the view: `movieStorage` is a module singleton (`main.ts:71,234`), so unsaved work survives a visit to Games.

### 4.2 Class shape and constructor
`export class MoviesView` (`src/movies/view.ts:96`), with `readonly root = document.createElement('section')` (`view.ts:97`).
```ts
constructor(container:HTMLElement, private storage:MovieStorage,
  private study:(advance?:boolean)=>void, private reducedMotion:boolean|(()=>boolean),
  private preferences:PlaybackPreferences={autoNext:()=>true,setAutoNext:()=>{}},
  private openMenu:(trigger:HTMLElement)=>void=()=>{}) {          // view.ts:215
  this.root.className='movies-view';
  this.root.setAttribute('aria-label','Movies and TV');
  this.root.tabIndex=-1;
  container.replaceChildren(this.root);                              // view.ts:216-217
  document.body.classList.add('movies-active');
  // listeners (221-231), watchers (232-236), then:
  this.root.focus();                                                  // view.ts:240
}
```
- Created at `main.ts:235` with `openStudy` and `openMenu` passed in, so the view never imports shell state.

### 4.3 Rendering into `#content`
- `container` is `#content` (`main.ts:50`). `replaceChildren` replaces the library or loading block.
- `render()` (`view.ts:987-1006`) rewrites `this.root.innerHTML` as `header() + page + navigation`, then rebinds glass, images, rails and the player (`view.ts:998-1005`).
- `this.navigation.root` survives renders (`view.ts:532`). Its bar is refilled from `mobileNav()` each render (`view.ts:997`).
- Focus is kept with `keepingFocus()` (`view.ts:712-714`).
- Every string that reaches `innerHTML` passes through a local `escape()` (`view.ts:25`).

### 4.4 Events
- Delegated listeners on `root`: `click` (capture, records return focus, `view.ts:221-226`), `input` (`:227`), `compositionend`, `change`, `keydown` (`:230`), `focusin`. The click dispatcher is `private click` at `view.ts:1085`, switching on `data-action`.
- Removed in `dispose()` along with `this.abort.abort()` (`view.ts:1315`).

### 4.5 Navigation inside the section
- A section change is a hash change. `navigate(hash)` (`view.ts:429-436`) dismisses warnings, closes the drawer, calls `applyRoute(hash)`, then `hideTabbar.reset()`.
- Back controls are `<a href="#/…">`, for example `.movies-detail-back` (`view.ts:849`). The view never calls `history.back()`.
- `applyRoute` (`view.ts:437`) parses with `parseMovieRoute`, saves per-route scroll and focus, and re-renders. An unknown route shows a not-found state.

### 4.6 Scroller and tab bar
- `.movies-view` is `position:fixed; inset:0 0 auto; height:100dvh; overflow:auto; overscroll-behavior:contain; z-index:30` (`src/movies/style.css:3`). It is the scroll container.
- `autoHideTabbar(this.tabbar, this.root)` binds the island to the view's own scroller, not `window` (`view.ts:236`).

### 4.7 Loading, empty and error states
- Route loading (shell): `<div class="loading"><p>Opening Movies &amp; TV…</p><a class="game-button secondary" href="#/collection">Back to games</a></div>` (`main.ts:231`). `.loading` is centred, 60px padding, 18px/1.6 (`src/style.css` line 1).
- Route failure (shell): `.game-error` with a back link (`main.ts:237`). Colour `#ffb6a5` (`src/style.css` line 1).
- View loading: `LOADING_TITLE` (`view.ts:34`), a `.movies-empty` with `role="status"`, `h1 tabindex="-1"` and a `p`.
- View empty or failed (`view.ts:997`): `.movies-empty` with `h1` "Opening the collection…" or "The collection is unavailable".
- Inline status: `.movies-catalog-status` with `role="status"` (`view.ts:1014`). Detail retry: `button.ui-btn.secondary.small[data-action=retry-title]` (`view.ts:1019`).
- Network errors: `movieJson(url, signal, timeout=20000)` (`src/movies/network.ts:7`) throws `MovieNetworkError` with kind `network | timeout | service | invalid` (`network.ts:2`). Messages at `network.ts:25`.
- `.movies-empty` rules are in `src/movies/style.css`.

### 4.8 `pause()` and `dispose()`
- `pause()` (`view.ts:1306`) cancels the next-up countdown, closes the drawer, saves progress, pauses video, and swaps an external stream for "Stream paused" with a Resume button. Called from `openStudy` (`main.ts:188`), `pagehide` (`main.ts:432`), and `visibilitychange` (`view.ts:202`).
- `dispose()` (`view.ts:1315`) aborts every request, bumps every request counter, disposes rails, images, tab bar, glass, header glass, the yield guard and the `AbortController`, stops video, removes global listeners, removes `this.root`, and removes `movies-active` from `<body>`. This is the cleanup checklist for a new view.

### 4.9 CSS conventions
- Selectors are scoped under the root class: `.movies-view …` (`src/movies/style.css:3-17`).
- Component classes use the section prefix: `movies-*`. Shared components keep `ui-*`.
- Reduced motion for the section: `.movies-view *` in `src/movies/style.css:17` and `.reduce-motion .movies-view *`.
- Other prefixes: `study-`, `lb-`, `account-`, `mp-`, `ms-`, `cc-`, `sol-`, `ff-`, `bc-`, and `game-` for shell game chrome.

---

## 5. `src/accounts/client.ts` API

### 5.1 Public surface
- `export interface Session {token: string; username: string}` (`client.ts:7`).
- `export class AccountsClient` (`client.ts:28`). Constructor `(storage = store, fetcher = globalThis.fetch.bind(globalThis))` (`client.ts:34`). The `fetcher` argument is how unit tests inject a fake (`tests/accounts/client.test.ts:11`).
- `session(): Session | null` (`client.ts:38-41`): reads `accounts:session` and validates the token and username. `null` for guests.
- `onChange(listener): () => void` (`client.ts:42`). Fires on login (`client.ts:130`), logout (`client.ts:161`) and cross-tab change (`client.ts:252`).
- `authenticate('signup' | 'login', username, password)` (`client.ts:114-132`).
- `logout()` (`client.ts:153`), `flush(keepalive=false, pull=true)` (`client.ts:165`), `start(listenPagehide=true)` (`client.ts:258`), `dispose()` (`client.ts:264`).
- `message: string` (`client.ts:29`) is the menu status line (`main.ts:465`). `beforeIdentityChange` is set by `main.ts:470`.

### 5.2 Endpoint, headers, token
- `endpoint = '/.netlify/functions/accounts'`, `sessionKey = 'accounts:session'` (`client.ts:14`).
- `response(action, method, body, token?, keepalive?)` (`client.ts:104-113`) sends `${endpoint}?action=${action}` with `Authorization: Bearer <token>` when a token is given, `Content-Type: application/json` when there is a body, and `X-QCC-Sync: 2` for sync actions.
- Actions in the client: `signup` and `login` (`client.ts:117`), `sync` (flush), `sync&cursor=<n>` (pull, `client.ts:120,205`), and `logout` (`client.ts:161`). The server also dispatches `me` (`src/accounts/server.ts`).
- Token format: `acct_` plus 64 lowercase hex (`src/accounts/shared.ts:18`). The server re-checks `^Bearer (acct_[a-f0-9]{64})$` (`src/accounts/server.ts:20`).
- The leaderboard profile token is different: `^Bearer ([a-f0-9]{64})$` (`src/leaderboard/server.ts:46`).
- Username `^[a-zA-Z0-9_.-]{3,24}$` (`shared.ts:16`). Password 8 to 128 characters (`shared.ts:17`).

### 5.3 Timeouts and errors
- The accounts request has no `AbortSignal` timeout. Leaderboards use `AbortSignal.timeout(8000)` (`src/leaderboard/client.ts:108-109`). Movies uses 20000 ms (`src/movies/network.ts:7`).
- `AccountRequestError` carries `retryable`, `retryAt`, `status` (`client.ts:27`). Retryable on 429, 502, 503, 507 (`client.ts:110`). `Retry-After` is honoured (`client.ts:108-109`).
- 507 maps to `STORAGE_FULL_MESSAGE` (`client.ts:107`). Default text: "Accounts are unavailable. Your progress stays on this browser."

### 5.4 Guidance for Social and Chat
- Read `accounts.session()?.token`. It is `null` for guests, so send no header and show the signed-out state.
- Subscribe with `accounts.onChange`. Unsubscribe in `dispose()`. `main.ts:477` already re-runs `route()` on identity change, which re-mounts the section.
- Inject `fetcher` the same way, so Playwright can intercept (section 6).
- Add `AbortSignal.timeout(...)` to every request. The accounts client does not.

---

## 6. Testing

### 6.1 Unit: vitest, node environment
- `vite.config.ts` test block: `include: ['tests/**/*.test.ts'], environment: 'node'`. No jsdom or happy-dom is installed.
- Pure logic is unit-tested: `tests/core/tabbar.test.ts` (imports `nextTabbarState`), `focus.test.ts`, `sheet.test.ts`, `rails.test.ts`, `images.test.ts`, `theme.test.ts`. Accounts logic: `tests/accounts/client.test.ts`, `server.test.ts`, `merge.test.ts`.
- Script: `npm test` runs `vitest run`. `npm run check` runs `tsc --noEmit`.

### 6.2 Browser: Playwright
- `playwright.config.ts`: `testMatch '**/*.spec.ts'`, timeout 30s, expect 7s, `workers: CI ? 1 : 2`. Projects `chromium` (Desktop Chrome, swiftshader WebGL) and `webkit` (Desktop Safari). `webServer` runs `npm run dev -- --port 4600 --strictPort` unless `ARCADE_URL` is set.
- Specs in `tests/e2e/` (about 30, e.g. `shell.spec.ts`, `sheet-navigation.spec.ts`, `focus-rings.spec.ts`, `navigation-material.spec.ts`), `tests/accounts/accounts.spec.ts`, `tests/movies/*.spec.ts`.
- Helpers: `tests/game-menu.ts` exports `appSettings`, `gameAction`, `pauseGame`.

### 6.3 Backends via `context.route` into real handlers
`tests/accounts/accounts.spec.ts:1-30` is the pattern.
```ts
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler} from '../../src/accounts/server';
const database=new NetlifyDB({logger:()=>{}});
test.beforeAll(async()=>{
  const connectionString=await database.start();
  await database.applyMigrations('netlify/database/migrations');
  pool=getDatabase({connectionString}).pool;
  accounts=createAccountsHandler(pool);
});
async function connect(context:BrowserContext){            // accounts.spec.ts:12
  await context.route('**/.netlify/functions/accounts**',async route=>{
    const req=route.request();
    const result=await accounts(new Request(req.url(),{method:req.method(),headers:req.headers(),
      body:['POST','PUT'].includes(req.method())?req.postData():undefined}));
    await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});
  });
}
```
- A Social or Chat function follows the same route pattern with its own handler.
- `connect()` also uses `addInitScript` to seed the Study consent and topic in storage (`accounts.spec.ts:13`), so the Study chooser does not block the test.
- Page-level mocks use `page.route('**/api/…', route => route.fulfill({json}))` and `route.abort()` for outages (`tests/movies/network-recovery.spec.ts:10-32`).


## 7. Checklist for a new lazy section

**Route and mount**
1. Add an `if(isX)` branch to `route()` before the games code (`main.ts:222` pattern). Match the exact hash and its sub-paths.
2. Start with `const token=++generation; leave();` and check `token!==generation` after each `await` (`main.ts:229,233`).
3. Call `setChromeInert(true)` if the section takes the full screen (`main.ts:230`). Keep the shell nav visible otherwise. Be consistent.
4. Show a `.loading` block during the lazy import, and a `.game-error` with a "Back to games" link on failure (`main.ts:231,237`).
5. Use `import()` inside `route()`, not at module top level. Import the section's CSS from its own module (`src/movies/view.ts:1`), not from `main.ts`.

**Lifecycle**
6. Dispose the section in `leave()` (`main.ts:117-132`). `leave()` also runs for identity changes (`main.ts:470`).
7. Expose `pause()` and call it from `openStudy` (`main.ts:188`) and `pagehide` (`main.ts:432`).
8. In `dispose()`, abort requests, clear timers, disconnect observers, remove global listeners, remove the body class, and remove the root. Copy `MoviesView.dispose` (`view.ts:1315`).
9. Keep long-lived data in a module singleton outside the view (`main.ts:71,234`).

**Tab bar and navigation**
10. Call `tabbar.reset()` when routing (`main.ts:218,120`). A section with its own island calls `reset()` in its `navigate()` (`view.ts:435`).
11. Use `createSectionNavigation(scope)` for a navigation island (`src/ui/navigation.ts:5`). Do not invent a second glass material.
12. If the section is a shell tab, add it to the static list at `main.ts:47` and update `aria-current` yourself. Nothing does this today.
13. Add the section to the menu close guard at `main.ts:405`, or the library renders over it.
14. Add the section's class to the `.app-navigation` hide rule (`src/style.css` line 8) and to the `#content` padding rules (`src/style.css` lines 10-11, 31) if it is full screen.

**Dialogs, Escape, Study**
15. Open dialogs with `openSheet(dialog, trigger)` and give them `ui-glass-sheet`. Add the id at `sheet.ts:51` if it needs `arcade-sheet` and a glass tone. Use the dialog markup at `main.ts:44`.
16. Add the section's flag to the Escape gate at `main.ts:443`. Without it, Study cannot open from the section.
17. Add the section's dialogs to the Escape cancel chain (`main.ts:304,440`).
18. Give `returnFromStudy` (`main.ts:212`) a focus fallback for the section.
19. Let `suppressNavigationUnderSheets()` (`main.ts:49`) hide the shell nav under dialogs. Do not manage this yourself.

**Accounts and data**
20. Read `accounts.session()?.token` (`client.ts:38`). Send `Authorization: Bearer <token>` only when it exists. The token must match `acct_` plus 64 hex (`shared.ts:18`).
21. Subscribe with `accounts.onChange` and unsubscribe on dispose (`client.ts:42`).
22. Add `AbortSignal.timeout` to every request. The accounts client has none.
23. Use `store.read` and `store.write` (`src/core/storage.ts`, prefix `pocket-arcade:v1:`). Add keys to `SAVE_KEYS` (`src/accounts/shared.ts`) only if they should sync.

**Motion and preferences**
24. Read the live getter `()=>preferences.reducedMotion` (`main.ts:235`). Also honour `html.reduce-motion` and `prefers-reduced-motion` (`glass.ts:135-137`).
25. Use `bindRails(root, reduced)` for any rail (`rails.ts:38`).
26. Custom motion needs its own `prefers-reduced-motion` and `.reduce-motion` rules, as `src/movies/style.css:17` shows. The global reset (`theme.css:364-369`) covers only the shared classes.

**Focus and input**
27. Keep the `data-input` contract. Do not add a second tracker. `trackInputMode` runs once (`main.ts:41`).
28. Text fields take no outer ring, only the border and inner ring (`theme.css:28-31`).
29. Check keyboard focus with `:focus-visible` in Playwright, after `keyboard.press('Tab')`.

**Images, lists, states**
30. Use `ui-card-img` and `ui-hero-backdrop` for images, so `watchImages` handles fade-in and failure (`images.ts:5`). Call `markImages` for images already in the DOM (`images.ts:21`).
31. Use `role="status"` for loading, empty and error text, and the `.movies-empty` pattern (section 4.7). Use `textContent` for user text (`main.ts:143`).

**Visual**
32. Use `--gutter`, `--page-max`, `--tabbar-h`, `--tabbar-gap` (section 1.1). Use `.ui-container` for width (`theme.css:34`). Check 320 and 390 px widths for no horizontal scroll.
33. Use the z-index layers in section 1.10. A full-screen section takes z 30, as `.movies-view` does (`src/movies/style.css:3`).
34. Use `--r-*` and `--sh-*` tokens. Use `.ui-glass-sheet` for any glass dialog.

**Verification**
35. Add pure logic as `tests/**/*.test.ts`, and flows as `tests/**/*.spec.ts`.
36. Back API calls with the real handler, as in section 6.3.
37. Run `npm run check`, `npm test`, and the relevant Playwright specs. The full build also runs `scripts/movies-validate.mjs` and `scripts/verify-sw-kill-switch.mjs` (`package.json` `build`).
