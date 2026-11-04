# QCC design system and app-shell reference

Read-only reference pack for the two planned lazy sections, QCC Social (`#/social`) and QCC Chat (`#/chat`). Every claim cites `file:line` in `/home/user/Qcc-games-`. Paths below are relative to that root. Line numbers were read from the working tree on 2026-11-04.

Stack facts that shape everything below: Vite + strict TypeScript, vanilla DOM, no framework. There is one dark palette. The app has no `prefers-color-scheme` or `[data-theme]` switching anywhere in `src/` or `index.html`. The only light surface is Study mode, which forces `color-scheme:light` (`src/study/style.css:2`).

---

## 1. Tokens and shared CSS (`src/theme.css`)

The design tokens are on `:root` at `src/theme.css:2-18`. Shared component classes start at line 33.

### 1.1 Colour and line tokens (`theme.css:3-7`)

```css
--c-bg:#000;
--c-950:#09090b;--c-900:#18181b;--c-800:#27272a;--c-700:#3f3f46;--c-600:#52525c;
--c-500:#71717b;--c-400:#9f9fa9;--c-300:#d4d4d8;--c-200:#e4e4e7;--c-100:#f4f4f5;
--c-rose:#ff2056;--c-rose-soft:#ff637e;--c-amber:#ffb900;--c-red:#ff6467;--c-green:#00d492;
--line-faint:#ffffff0d;--line:#ffffff14;--line-strong:#ffffff26;
```

Other colours used in components but not tokenised: `#fff` and `#000` for primary buttons and the active pill (`theme.css:55,169`); cream `#ffe0a4` for the game and sheet primary (`src/style.css` line 1 `.game-button`; `theme.css:330`); `#191d1c` page background and `#f1eee5` text on `:root` in `src/style.css` line 1.

### 1.2 Fonts (`theme.css:8-9`, `src/style.css:1`)

- `--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif` (`theme.css:8`).
- `--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, ...` (`theme.css:9`).
- The only bundled face is `Arcade` (`src/assets/arcade-bold.ttf`, weight 800, `font-display:swap`), declared at `src/style.css:1`. It is the default on `:root` for the games shell. The Movies view overrides it with `font:15px/1.5 var(--font-sans)` (`src/movies/style.css:3`). Shell chrome sets `--font-sans` explicitly (`theme.css:67` for the tab bar, `theme.css:290` for sheets).
- Heading and body sizes that recur: sheet `h2` 20px/1.25 weight 600 (`theme.css:313`); sheet input and setting text 17px (`theme.css:318,322`); sheet muted text 15px and notes 13px (`theme.css:337-338`); rail heading 18px, 20px from 640px (`theme.css:180-181`); card title 12px, 14px from 640px (`theme.css:211-212`); card meta 11px mono (`theme.css:213`); chip 9px mono uppercase (`theme.css:174`); kbd 10px mono (`theme.css:53`); tab label 10px weight 500 (`theme.css:109`); button 12px, 14px from 640px (`theme.css:167,172`); hero title 24px, 36px at 640px, 48px at 768px (`theme.css:239,243,244`).

### 1.3 Radii, shadows, easing, durations, layout (`theme.css:10-17`)

```css
--r-sm:4px;--r-md:6px;--r-lg:8px;--r-xl:12px;--r-2xl:16px;--r-3xl:24px;
--sh-sm / --sh-md / --sh-lg / --sh-xl / --sh-2xl   /* layered black shadows, theme.css:11-15 */
--ease:cubic-bezier(.4,0,.2,1);--ease-drawer:cubic-bezier(.32,.72,0,1);
--t-fast:150ms;--t:200ms;--t-slow:300ms;
--page-max:1280px;--gutter:16px;--header-h:56px;--tabbar-h:64px;--tabbar-gap:12px;
@media (min-width:640px){:root{--gutter:24px}}           /* theme.css:19 */
```

Glass springs (`theme.css:20-22`): `--ease-glass` and `--ease-glass-pop` are `linear()` curves inside `@supports (transition-timing-function:linear(0,1))`. Their fallback is `--ease-drawer` (`theme.css:21`). Some components also define `--ease-out:cubic-bezier(.23,1,.32,1)` locally (`theme.css:69,285`), and `src/style.css` line 1 defines `--ease-out` and `--ease-in-out` on `:root` for the games shell.

Radii actually in use outside the tokens: sheets 32px (phone) and 28px (640px and up) (`theme.css:289,298`); tab bar pill 999px (`theme.css:69`); game-button 12px in the shell (`src/style.css` line 1) and 999px inside sheets (`theme.css:330`); sheet inputs 12px (`theme.css:318`); setting-list 16px (`theme.css:321`); header dock `--glass-radius` 26px (`theme.css:384`).

There is no formal spacing scale. The px values in use are 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 44, 48, 56 and 64. Use `--gutter` for side padding and the `--tabbar-*` vars for bottom clearance.

Layout variables:
- `--gutter` (16px, 24px from 640px): `.ui-container` padding (`theme.css:34`), hero and footer padding (`theme.css:236,247`).
- `--page-max` 1280px: `.ui-container` and `.ui-hero-content` max width.
- `--header-h` 56px: `.ui-header` height (`theme.css:37`).
- `--tabbar-h` 64px and `--tabbar-gap` 12px: floating tab bar height and offset (`theme.css:69`). Used for `#content` bottom padding in `src/style.css:10-11`.

### 1.4 Shared `ui-` classes

| Class | Where | Notes |
|---|---|---|
| `.ui-container` | `theme.css:34` | max-width `--page-max`, side padding `--gutter` |
| `.ui-header`, `.ui-header-inner`, `.ui-brand`, `.ui-brand-tile`, `.ui-wordmark` | `theme.css:37-46` | sticky, 56px, `#000000f2` with `blur(12px)` |
| `.ui-nav`, `.ui-pill` (`[aria-current=page]` and `[aria-pressed=true]` get white fill) | `theme.css:47-55` | header nav pills |
| `.ui-icon-btn`, `.ui-label` (screen-reader-only until 768px), `.ui-kbd` | `theme.css:51-63` | header icon button |
| `.ui-tabbar`, `.ui-tabbar-mini`, `.ui-scroll-edge`, `.ui-glass-lens`, `.ui-glass-glow` | `theme.css:65-165` | floating glass island and capsule |
| `.ui-tab` (and `[aria-current=page]` / `[aria-pressed=true]`) | `theme.css:109-112` | 44px min-height tab; the selected one is bold white |
| `.ui-btn` with `.primary`, `.secondary`, `.small` | `theme.css:167-173` | 32px, 40px from 640px; primary is white; secondary is `#18181bcc` |
| `.ui-chip` (`.rating` amber) | `theme.css:174-175` | mono 9px uppercase tag |
| `.ui-rail`, `.ui-rail-head`, `.ui-rail-row`, `.ui-rail-arrow` (`.prev`/`.next`), `.ui-count`, `.ui-rail-sub` | `theme.css:177-196` | horizontal scroll rows with arrows |
| `.ui-card`, `.ui-card-poster`, `.ui-card-placeholder`, `.ui-card-img`, `.ui-card-chips`, `.ui-card-play`, `.ui-card-caption`, `.ui-card-title`, `.ui-card-meta` | `theme.css:198-216` | 2:3 poster card |
| `.ui-grid` | `theme.css:218-222` | 2 cols, 3 at 640px, 4 at 768px, 5 at 1024px, 6 at 1280px |
| `.ui-images` hook and `.is-loaded` / `.is-failed` states | `theme.css:224-230` | set by `src/ui/images.ts` |
| `.ui-hero`, `.ui-hero-backdrop`, `.ui-hero-shade`, `.ui-hero-content`, `.ui-hero-badges`, `.ui-hero-title`, `.ui-hero-meta`, `.ui-hero-overview`, `.ui-hero-actions` | `theme.css:232-244` | 380-500px hero |
| `.ui-footer`, `.ui-footer-brand`, `.ui-footer-links` | `theme.css:246-253` | stacks below 768px |
| `.ui-drawer-handle` | `theme.css:256-257` | 40x4 grab bar on phones |
| `.ui-switch` | `theme.css:258-264` | 36x20 switch |
| `.ui-glass-sheet` | `theme.css:270-347` | Liquid Glass dialog material (section 1.6) |
| `.ui-nav-icon` | `theme.css:413-418` | outline and filled icon twins |

`.ui-pill` has no `.primary` form. The sheet's own primary is `.game-button` inside `.ui-glass-sheet` (`theme.css:330-336`). Shell-level `.game-button`, `.game-button.secondary` and `.icon-button` come from `src/style.css` line 1.

### 1.5 Glass tokens (`--glass-*`)

Two groups.

Island and nav material (`theme.css:68`, arcade tokens at `theme.css:373-388`):
- `--glass-tint`, `--glass-frost`, `--glass-tone`, `--glass-body`, `--glass-frost-body`, `--glass-rim-edge`, `--glass-glow`, `--glass-lift`, `--glass-pill`, `--glass-radius` (26px; 32px for `.section-tabbar`, `theme.css:394`).
- `--glass-ink` (`#fff`), flipped to `#0b1015` under `[data-glass-tone=light]` (`theme.css:391-393`). `--glass-solid` (`#20262b`, or `#f1f3f5` for light tone).
- `--glass-clear-fill`, `--glass-clear-blur`, `--glass-frost-fill`, `--glass-frost-blur` at `theme.css:277`.
- `--glass-adaptive-ink` and `--glass-local-halo` are written by `src/ui/glass-ink.ts` per sampled backdrop (`theme.css:426-433`).
- `--glass-glyph`, `--glass-glyph-icon` (`theme.css:386`) and `--ui-pill-x`, `--ui-pill-w`, `--ui-pill-on` (`theme.css:85`, set by `src/ui/glass.ts:130`).

Sheet material (`theme.css:277`), used by `.ui-glass-sheet` and the Movies "Up next" card:
```css
--glass-sheet-fill:var(--glass-frost-fill);     /* rgb(12 16 22 / .58); line 469 sets .90 on sheets */
--glass-sheet-body:var(--glass-frost-blur);     /* blur(20px) saturate(1.5) */
--glass-sheet-edge:rgb(255 255 255 / .3) rgb(255 255 255 / .14) rgb(255 255 255 / .14) rgb(255 255 255 / .3);
--glass-sheet-rim:inset 0 -1px 0 rgb(0 0 0 / .12);
--glass-sheet-lift:0 5px 16px rgb(0 0 0 / .15),0 1px 2px rgb(0 0 0 / .14);
```

### 1.6 Sheets (`.ui-glass-sheet`, `theme.css:270-347`)

- Base at `theme.css:284-296`. Phone: `width:calc(100% - 16px)`, `max-height:min(85dvh, ...)`, `padding:20px`, `border-radius:32px`, closed state `opacity:0; scale:.98; translate:0 28px`. Exit runs 180ms `--ease-out`.
- From 640px (`theme.css:297-299`): `width:min(440px, calc(100% - 32px))`, `max-height:min(86dvh,760px)`, `border-radius:28px`, `--sheet-from-scale:.94`, `--sheet-from-lift:12px`.
- Open (`theme.css:301-306`): opacity 180ms, scale and translate 320ms on `--ease-glass-pop`.
- Backdrop (`theme.css:309-311`): plain fade, 220ms in and 160ms out. No blur on the dim.
- Origin: `transform-origin:var(--sheet-origin,50% 100%)`, set by `openSheet` (see section 2.2).
- Content inside a sheet: `h2`, `.icon-button` (44px circle, `theme.css:315`), `input`/`select` (`theme.css:318`), `.setting-list` with native checkboxes restyled as a capsule switch (`theme.css:321-328`), `.game-button` as a cream 999px pill with `:active` scale .97 (`theme.css:330-334`), `.muted` and `.menu-note` (`theme.css:337-338`).
- Fallbacks: no backdrop-filter `rgb(18 22 28 / .94)` (`theme.css:342`); reduced transparency solid `rgb(28 28 32)` (`theme.css:343`); more contrast opaque with 2px border (`theme.css:344-347`); forced colours `Canvas`/`CanvasText` (`theme.css:348-358`).
- `.ui-glass-sheet` hides its scrollbar (`theme.css:469-470`).

`src/ui/arcade-sheets.css` adds a second layer, `.arcade-sheet`, with `--sheet-veil`, `--sheet-ink`, `--sheet-focus:#fff` and `color-scheme:dark` (`arcade-sheets.css:14,27`). `openSheet` adds this class only to the dialog ids in section 2.2.

### 1.7 Focus rings (`theme.css:24-31`, `theme.css:340`, `theme.css:443-446`, `src/style.css` line 1)

Input mode is set on `<html>` by `src/ui/focus.ts` (`data-input="keyboard"` or `"pointer"`). Rings show only in keyboard mode.

- Outside keyboard mode, every `a, button, input, select, textarea, [tabindex]` loses its focus outline. The `:where` wrapper keeps the specificity at zero (`theme.css:26`).
- Keyboard mode, Movies and tab bar: `outline:2px solid #fff; outline-offset:2px` (`theme.css:27`).
- Keyboard mode, tab bar and arcade glass: `outline:2px solid #fff; outline-offset:2px; box-shadow:0 0 0 6px #000` (`theme.css:446`). Game-glass and glass-control use `var(--glass-ink)` with `outline-offset:3px` (`theme.css:443`).
- Keyboard mode, sheets: `outline:2px solid #fff; outline-offset:2px` (`theme.css:340`).
- Text fields and selects get no outer ring in any mode. Focus brightens the border (`theme.css:30`). Keyboard focus adds an inner `box-shadow: inset 0 0 0 1px rgb(255 255 255 / .7)` (`theme.css:31`).
- Generic shell controls (anything in `#app` not covered above) use the games rule in `src/style.css` line 1: `:where(:root[data-input="keyboard"]) :is(button,a,input,select):focus-visible{outline:3px solid #ffe0a4;outline-offset:4px}`. A new section that uses `.ui-btn` outside Movies gets this cream ring, not the white one.
- Forced colours: `theme.css:359-361`.

### 1.8 Light and dark handling

- One dark palette. `color-scheme:dark` on `:root` (`src/style.css` line 1), `color-scheme:dark` on `.movies-view` (`src/movies/style.css:3`), and on `.arcade-sheet` (`arcade-sheets.css:14`).
- The only light surface is Study. `body.study-active` forces `background:#fff; color-scheme:light` (`src/study/style.css:2`), and `#study-view` has its own `--study-*` tokens (`src/study/style.css:3`).
- Glass ink is adaptive, not theme-switched. `data-glass-tone` (`light` or `dark`) selects a default ink variable (`theme.css:391-393`). `src/ui/glass-ink.ts` then samples the backdrop and writes `--glass-adaptive-ink` and `--glass-local-halo` where needed. `INK=[11,16,21]` and `CLEAR_VEIL=.2`, `NAV_VEIL=.36` (`glass-ink.ts:5,12`).
- `openSheet` sets `data-glass-tone` on arcade dialogs: `light` in Study, the game view's own tone in a game, `dark` in Movies, else `light` (`src/ui/sheet.ts:53`).

### 1.9 Reduced motion

Three triggers, all honoured by CSS:
1. `@media (prefers-reduced-motion:reduce)`.
2. `.reduce-motion` class on `<html>`.
3. The user's own setting `preferences.reducedMotion`, which main.ts writes as that class (section 3.4).

The shared rules:
- Global reset, excluding game internals and the tab bar: `theme.css:364-369`. It zeroes `animation`, `transition` and `scroll-behavior`, and sets `transform:none` on cards, buttons, tabs and card images. The `.reduce-motion` copy is at `theme.css:368-369`.
- Tab bar: `theme.css:146-165`. Nothing moves, scales or stretches. A single 150ms opacity cross-fade remains, and the rules use `!important` to beat the global reset.
- Glass controls: `theme.css:461-463`.
- Sheet game-button press: `theme.css:335-336`.
- Section nav: `src/ui/section-navigation.css:53-59`. Modal nav: `src/ui/modal-navigation.css:11-12`.
- Rails: `src/ui/rails.ts:38-43` takes a `reduced()` callback. It scrolls with `behavior:'auto'` instead of smooth.

The JS check used by UI code is `src/ui/glass.ts:135-137`:
```ts
function reduceMotion():boolean{
  return document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

Games read `context.settings.reducedMotion || matchMedia(...)` directly (e.g. `src/games/snake/index.ts:21`).

### 1.10 Breakpoints and pointer queries

Width (min-width unless noted): 359 max (`src/style.css:22`, shrinks nav insets), 360 (`theme.css:44,50`), 620 (`src/style.css:35`), 640 (`theme.css:19,56,82,172,257,297`), 650 max (`src/movies/style.css:16`), 699 and 767 bands (`src/movies/style.css:75,77`), 768 (`theme.css:57,62,195,244,253`), 1000 max (`src/movies/style.css:96`), 1024 (`theme.css:63,196,221`), 1240 (`src/style.css:36`), 1280 (`theme.css:222`).

Pointer and hover: `@media (hover:hover) and (pointer:fine)` is used for every hover style (for example `theme.css:54,123,173,217`). Display density: `@media (max-resolution:1.5dppx)` keeps glyph strokes at 0 on desktop density (`theme.css:283,435`).

Other preference queries honoured: `prefers-reduced-transparency:reduce` (`theme.css:141,343,459`), `prefers-contrast:more` (`theme.css:143,344,459`), `forced-colors:active` (`theme.css:145,348,359,460`).

### 1.11 z-index layers

| z | Element | Source |
|---|---|---|
| 60 | `.movies-next` (640px+), `.mp-overlay` | `src/movies/style.css:270`, `src/multiplayer/style.css:18` |
| 50 | `.ui-header`, `.ui-tabbar`, `.ui-tabbar-mini`, `.section-navigation`, `.app-navigation` | `theme.css:37,69,131`; `src/style.css` line 15 |
| 49 | `.ui-scroll-edge` | `theme.css:81` |
| 30 | `.movies-view` (fixed overlay), `.game-dock`, `#study-view .study-cookie-panel` | `src/movies/style.css:3`, `src/game-viewport.css:23`, `src/study/style.css:26` |
| 20 | `#pause-overlay`, `.lb-sidebar` | `src/style.css` line 1, `src/leaderboard/style.css:5` |
| 19 | `.game-sheet` | `src/ui/game-sheet.css:1` |
| 3-4 | `.floating-glass-group > *`, Movies card and media children | `src/ui/floating-controls.css:2`, `src/movies/style.css:260,267` |
| 2 | `.ui-card-poster::after`, `.ui-card-chips`, `.arcade-glass > .ui-glass-glow` | `theme.css:201,207,401` |
| 1 | `.ui-tab`, `.ui-card-play`, `.floating-glass-group`, `.glass-control` | `theme.css:109`, `src/ui/floating-controls.css`, `theme.css:440` |
| 0 / -1 / -2 | `.ui-glass-lens` (-1), `.ui-hero-shade` (-1), `.ui-hero-backdrop` (-2) | `theme.css:73,235,234` |

The header, tab bar and capsule all sit at 50, so the capsule and bar never stack over a sheet. Dialogs live in the browser top layer, which is above all of these.

---

## 2. `src/ui/` modules

Each module is listed with its exports and its use in the shell.

### 2.1 `icons.ts`

- Export `uiIcon(name: UiIcon): string` (`icons.ts:51-54`) and type `UiIcon` (`icons.ts:1`).
- Names: `grid, games, home, film, tv, bookmark, search, menu, study, play, info, plus, check, chevron-left, chevron-right, back, close, image`.
- Navigation names with a filled twin (`icons.ts:2,21-49`): `games, home, film, tv, bookmark, study, menu`. Other names use outline only.
- SVG style, outline icons (`icons.ts:53`): `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `aria-hidden="true"`, `focusable="false"`. Class `ui-icon`.
- Navigation style (`icons.ts:16-19,52`): stroke width 1.75, round caps and joins, class `ui-icon ui-nav-icon`. The markup holds two groups, `ui-icon-line` and `ui-icon-fill`. Theme CSS shows one or the other (`theme.css:415-417`).
- Base icon size `.ui-icon` is 16x16 (`theme.css:33`). Contexts that resize: tab bar capsule 20px (`theme.css:132`), card placeholder 24px (`theme.css:205`), card play 18px (`theme.css:209`), brand tile 20px (`theme.css:41`), sheet close 20px (`theme.css:316`), shell `.icon-button svg` 28px (`src/style.css` line 1).
- `main.ts` has its own local icon helper (`main.ts:36-39`) with stroke-width 2.6 and a different set: `menu, back, star, pause, play, restart, rules, fullscreen, exitfs, grid, close`. New sections should use `uiIcon`.

### 2.2 `sheet.ts`

- `openSheet(dialog: HTMLDialogElement, trigger?: Element | null): void` (`sheet.ts:49-60`).
  - For dialog ids `menu`, `game-options`, `rules-dialog`, `accounts-dialog`, `leaderboard-dialog`, it adds `arcade-sheet` and sets `data-glass-tone` (`sheet.ts:51-53`).
  - Calls `dialog.showModal()`, then `bindCloseControls(dialog)`, which applies `ui-tab arcade-glass glass-control sheet-close-glass` to `.dialog-head .icon-button` and binds glass to it (`sheet.ts:16-19`).
  - Sets `--sheet-origin` from the trigger's centre via `sheetOrigin` (`sheet.ts:40-45,57-59`). Without a trigger it removes the property, so the sheet grows from bottom centre.
- A `MutationObserver` disposes the glass bindings when the dialog detaches (`sheet.ts:28-35`).
- Usage pattern: `openSheet(menu, event.currentTarget as Element)` (`main.ts:396`). Movies' drawer and dialogs call it too (`src/movies/view.ts:812,933`).
- Dialog markup pattern (`main.ts:44`): `<dialog class="ui-glass-sheet" aria-labelledby="..."><form method="dialog" class="dialog-head"><h2 id="...">Title</h2><button class="icon-button" aria-label="Close ...">${icon('close')}</button></form>...</dialog>`. Close on `Escape` is native `cancel`.

### 2.3 `tabbar.ts`

- Export `autoHideTabbar(bar: HTMLElement, scroller: Window | HTMLElement): { reset(): void; dispose(): void }` (`tabbar.ts:49-161`).
- Export `nextTabbarState(state, y, max, typing)` (`tabbar.ts:18-35`). Pure logic covered by `tests/core/tabbar.test.ts`.
- Constants (`tabbar.ts:7-13`): `TABBAR_MINIMIZE=64` (px down to minimize), `TABBAR_EXPAND=32` (px up to expand), `TABBAR_TOP=64` (always expanded within this of the top), `TABBAR_FLOOR=120` (cannot minimize above this), `TABBAR_EDGE=24` (always shown this close to the end).
- Behaviour: `data-minimized="true"` is written on the bar. It shrinks to a capsule `button.ui-tabbar-mini` placed right after it (`tabbar.ts:52-58,117-122`). The capsule copies the current tab's icon (`tabbar.ts:126-130`) and is `aria-hidden` with `tabIndex=-1`. A tap on it calls `reset()` (`tabbar.ts:135`).
- Typing holds state: focus in `input`, `textarea`, `select` or contenteditable (`tabbar.ts:15,72,79`).
- The bar is not minimized inside `[data-sheet-hidden]` (`tabbar.ts:78`).
- `data-hidden="true"` is never written here. Movies sets it for Up next (`src/movies/view.ts:212`).
- Glass: `autoHideTabbar` calls `bindGlass(bar)` (`tabbar.ts:63`) and disposes it.
- Mini capsule: `arcade-glass-mini` class when the bar is `arcade-glass` (`tabbar.ts:55-58`).

### 2.4 `navigation.ts`

`createSectionNavigation(scope: 'app' | 'movies')` (`navigation.ts:5-17`) returns `{root, bar, menu}`.

Markup it produces:
```html
<nav class="{app|movies}-navigation section-navigation" aria-label="Sections">
  <div class="{app-tabbar|movies-mobile-nav} section-tabbar ui-tabbar arcade-glass" data-glass-tone="light">
    <!-- tabs: a.ui-tab / button.ui-tab -->
  </div>
  <button type="button" class="{app-menu|movies-menu} section-menu ui-tab arcade-glass glass-control"
          data-glass-tone="light" data-action="menu" aria-label="Open menu" aria-haspopup="dialog">
    <!-- menu icon -->
  </button>
</nav>
```

- `.section-navigation` is fixed, bottom, `z-index:50`, `pointer-events:none`, `max-width:440px` (`src/ui/section-navigation.css:15`). Its children turn `pointer-events:auto` (`section-navigation.css:18`).
- `.section-menu` sits at the right, a `--home-action` (64px) circle (`section-navigation.css:18`).
- In the shell it is created once at `main.ts:46` with `'app'`, then prepended to `#app` (`main.ts:48`).
- Movies creates its own with `'movies'` (`src/movies/view.ts:204`) and renders its tabs into `.movies-mobile-nav` (`src/movies/view.ts:986,1000-1001`). Its `.movies-top` header sits beside it.
- The shell's `.app-navigation` class is hidden in `body.in-game` and `body.movies-active` (`src/style.css` line 8) and when `[data-view-hidden]` is set (`src/style.css` line 9).

### 2.5 `glass.ts`

- `bindGlass(bar: HTMLElement): {dispose(): void}` (`glass.ts:199`). Attaches the pill, press and lens to a `.ui-tabbar`, `.section-menu` or `.glass-control`. Uses `data-glass` values `backdrop` (Chromium SVG lens) or `frost` (everywhere else). `off` for accessibility modes (`glass.ts:8,122-128`).
- `pillVars(tab)` returns `--ui-pill-x/w/on` (`glass.ts:130-133`).
- `isChromiumBrands`, `glassMode(brands, flags)` (`glass.ts:117-128`).
- `bindGlass` is bounded for `.section-tabbar`, `.section-menu` and `.floating-glass-group` (`glass.ts:204`).
- Also exported: the lens-field constants (`LENS_BEND=10`, `LENS_BEVEL=20`, `ARCADE_LENS_BEND=5`, `ARCADE_LENS_BEVEL=12`, `glass.ts:17-27`), `lensField`, `lensPng`, `lensDensity`.
- Glass is a dependency only where a bar or control is bound. A new section that uses `.arcade-glass` controls must call `bindGlass` on each one, or use `bindFloatingGroups` (section 2.8).

### 2.6 `focus.ts`

- `trackInputMode(root = document.documentElement)` (`focus.ts:27-31`). Wired once in `main.ts:41`. Sets `data-input` to `pointer` on any `pointerdown` and to `keyboard` on a qualifying `keydown`.
- `isKeyboardKey(key, target)` (`focus.ts:14-19`). `Tab` always counts. Lone modifiers and text entry do not.
- Text-entry targets: `TEXTAREA`, `SELECT`, editable content, and `INPUT` other than checkbox, radio, range, button or submit (`focus.ts:10,17`).

### 2.7 `images.ts`

- `watchImages(root): () => void` (`images.ts:5-18`). Adds `ui-images` to root and classifies `img.ui-card-img` and `img.ui-hero-backdrop` into `.is-loaded` or `.is-failed` from load and error events.
- `markImages(root)` (`images.ts:21-27`) classifies images that finished before the watcher attached.
- Use the classes `ui-card-img` or `ui-hero-backdrop` for images that need fade-in and placeholder behaviour. The placeholder is `.ui-card-placeholder` behind the image (`theme.css:202`).

### 2.8 `rails.ts` and `floating-controls.ts`

`rails.ts`:
- `bindRails(root, reduced: () => boolean): () => void` (`rails.ts:38-58`). Delegated arrow clicks (`[data-scroll="-1|1"]` inside `.ui-rail`), scroll-flag tracking, and a `ResizeObserver`. Returns a disposer.
- `updateRails(root)` (`rails.ts:30-36`) sets `data-can-prev` and `data-can-next` on each `.ui-rail`.
- Step is three quarters of the row width (`rails.ts:9-11`). Focus moves off a hidden arrow (`rails.ts:19-29`).
- Markup: `.ui-rail > .ui-rail-head + .ui-rail-body > (.ui-rail-arrow.prev[data-scroll="-1"]) + .ui-rail-row + (.ui-rail-arrow.next[data-scroll="1"])`. Confirm against `src/movies/view.ts` before copying.

`floating-controls.ts`:
- `createGameDock(options)` (`floating-controls.ts:6-22`): game-only dock with back link, HUD and menu button.
- `bindFloatingGroups(root): {dispose()}` (`floating-controls.ts:25`): glass for `.floating-glass-group` children. Movies calls it on `.movies-top` (`src/movies/view.ts:998`).

### 2.9 `modal-navigation.ts`

- `suppressNavigationUnderSheets()` (`modal-navigation.ts:8-57`). Called once at `main.ts:49`. Watches for `dialog` and `[role="dialog"]` panels and sets `data-sheet-hidden` and `inert` on `.section-navigation, .game-dock` while one is open. It also returns focus to the opener on close.
- It does not handle keys or Escape. Owners keep those (`modal-navigation.ts:6-7`).

### 2.10 Other ui modules (for completeness)

- `load-deadline.ts`: `loadWithDeadline(run, parent: AbortSignal, ms, timeoutError)` (`load-deadline.ts:3`). Used to bound a lazy load.
- `game-chrome.ts`, `game-sheet.ts`, `game-controls-adapter.ts`, `canvas-ink.ts`, `glass-background.ts`, `glass-frame-source.ts`, `glass-lens-profile.ts`, `webgl-glass.ts` (`bindSheetLens`, `webgl-glass.ts:399`), and `glass-ink.ts`: games and glass rendering. A new section should not need them beyond `bindGlass`, `bindSheetLens` (applied automatically by `openSheet`), and `bindGlassInk`.

---

## 3. `src/main.ts` shell

### 3.1 Route parsing and dispatch

- `route()` is `async function route()` (`main.ts:216-252`). Called from `hashchange` (`main.ts:431`), from `study` on first finish (`main.ts:91`), from the account change handler (`main.ts:477`) and from `finishEntry` (`main.ts:455`).
- Start: `if(!initialized) return` (`main.ts:217`). Then `tabbar.reset()` (`main.ts:218`), `accountRoutePending=false`, and if Study is open it is hidden and `showArcade()` runs (`main.ts:220-221`).
- Movies match (`main.ts:222`): `const isMovies=location.hash==='#/movies'||location.hash.startsWith('#/movies/');`
  - If `movies` already exists, it calls `movies.navigate(location.hash)` and returns (`main.ts:224`).
  - Otherwise it closes the menu, rules and leaderboards dialogs, bumps `generation`, calls `leave()`, calls `setChromeInert(true)`, and writes the loading markup (`main.ts:229-231`).
  - It `import()`s the view and storage in parallel (`main.ts:233`). It bails if `token!==generation`. Then it constructs the view (`main.ts:235`) and calls `navigate(location.hash)` (`main.ts:236`).
  - On failure it writes `.game-error` with a "Back to games" link (`main.ts:237`).
- Games match (`main.ts:240-252`): `entryFromHash(location.hash)` from `src/core/navigation.ts`. Non-game hashes fall through to `library()`.
- Hash constants: `collectionHash='#/collection'`, `entryHash(id)` gives `#/collection/<n>` (`src/core/navigation.ts:2-3`). Legacy `#/game/<id>` also parses.

The pattern for a new section is a new `if(isSocial)` / `if(isChat)` branch placed before `const wasInMovies=...` at `main.ts:240`. Movies is the only lazy non-game section today.

### 3.2 `leave()`, `setChromeInert()`, `library()`

- `setChromeInert(value)` (`main.ts:112-116`):
  ```ts
  const chrome=document.querySelector<HTMLElement>('.app-navigation')!;
  chrome.toggleAttribute('data-view-hidden',value);
  chrome.inert=value||chrome.hasAttribute('data-sheet-hidden');
  ```
  It hides and inerts the shell tab bar and menu while a full-page view owns the screen. The `data-view-hidden` attribute also hides it through CSS (`src/style.css` line 9).
- `leave(saveProgress=true)` (`main.ts:117-132`): disposes `movies`, calls `setChromeInert(false)`, calls `tabbar.reset()`, detaches fullscreen, disposes leaderboard sidebar, flushes leaderboards and saves progress, disposes the game instance and clears `activeId`, clears the autosave interval, removes `in-game` from `<body>`, and calls `syncViewportLock()`.
- `library()` (`main.ts:137-146`): renders the games grid into `#content`. Uses `textContent` for user text.
- Every route calls `leave()` before it renders. A new section must be disposed here or it will stay mounted.
- `accounts.beforeIdentityChange` calls `leave(false)` (`main.ts:470`). Any new section must also be disposed there. It runs on login, logout and cross-tab account change.

### 3.3 Menu and accounts dialogs

- The menu dialog `#menu` (`main.ts:44`) and the account dialog `AccountsView` (`src/accounts/view.ts`) are both `.ui-glass-sheet`.
- `openMenu(trigger?)` (`main.ts:393-397`): refreshes account text, pauses an active game, then `openSheet(menu, trigger)`. Wired to `.app-navigation [data-action="menu"]` (`main.ts:398`).
- `menu`'s `close` handler (`main.ts:405`): runs `dialogClosed()` and calls `library()` when there is no game, no Movies and no Study. It checks `!location.hash.startsWith('#/movies')`. A new section must add its own hash check here or closing the menu will paint the library over it.
- `AccountsView` (`src/accounts/view.ts:4-51`) is constructed at `main.ts:58` with the client, a `prepare` callback and a `done` callback. Opened from `#open-accounts` (`main.ts:480`), from leaderboards (`main.ts:59`), and at boot when there is no session and no guest choice (`main.ts:496`). Its dialog has id `accounts-dialog`.
- Cancel on the accounts dialog is treated as Play as guest (`src/accounts/view.ts:24`).

### 3.4 Preferences and reduced motion

- `preferences = store.settings()` (`main.ts:56`). Shape: `Settings {sound, reducedMotion, colorBlind, autoNextEpisode}` (`src/core/types.ts:3`). Default for `reducedMotion` is the media query (`src/core/storage.ts:37`).
- The three checkboxes `#sound`, `#motion` (reducedMotion), `#colour` (main.ts:422-428). On change they write `store.write('settings', preferences)` and toggle `html.reduce-motion` (`main.ts:426`).
- Initial apply: `document.documentElement.classList.toggle('reduce-motion', preferences.reducedMotion)` (`main.ts:429`). Also in `updateAccountMenu()` (`main.ts:468`).
- Movies receives a live getter: `()=>preferences.reducedMotion` (`main.ts:235`). A new section should do the same, so a toggle is seen without re-creating the view.

### 3.5 Study and Escape

- `openStudy(advance=false)` (`main.ts:187-199`): pauses Movies (`movies?.pause()`, `main.ts:188`), pauses the game, closes the menu, rules and leaderboard dialogs, calls `hideArcade()` and shows the article.
- `hideArcade()` / `showArcade()` (`main.ts:172-180`): toggle `body.study-active` and `app.inert`. `#app` gets `visibility:hidden` under `.study-active` (`src/study/style.css:4`).
- Global key handler (`main.ts:435-446`), capture phase on `window`:
  ```ts
  if(event.key!=='Escape'||(!activeId&&!movies&&!study.isOpen))return;   // main.ts:443
  event.preventDefault();event.stopImmediatePropagation();
  if(!event.repeat){if(study.isOpen)study.advanceArticle();else openStudy(true);}
  ```
  Escape opens Study only when a game is active, Movies is mounted, or Study is already open. A new section must add a flag to this gate, or Escape will do nothing there. The Movies test is the explicit `movies` variable, not the hash.
- Escape also closes an open dialog first (`main.ts:440`) and gives the game `dismissMenu` a turn (`main.ts:441`).
- While Study is open, all non-Escape keys are swallowed (`main.ts:442`). Keyup too (`main.ts:447`).
- `returnFromStudy()` (`main.ts:200-214`) calls `tabbar.reset()` (`main.ts:208`) and restores focus, with a fallback selector `'#game-stage'` / `'.movies-menu'` / `'.app-navigation [data-action="menu"]'` (`main.ts:212`). A new section should add its own fallback here.

### 3.6 Visibility, pagehide and tab bar

- `pagehide` calls `movies?.pause()` (`main.ts:432`). Any new section that holds media or timers needs a `pause()` added here.
- `visibilitychange` only pauses the game instance (`main.ts:433`).
- `tabbar.reset()` is called in `route()` (`main.ts:218`), `leave()` (`main.ts:120`) and after Study returns (`main.ts:208`). `reset()` expands the bar and re-bases travel on the current position (`tabbar.ts:143-148`).

### 3.7 Tab bar HTML: the exact app list

`main.ts:47`, in order:

| # | Markup | Hash / action | Icon |
|---|---|---|---|
| 1 | `a.ui-tab[href="#/collection"][aria-current="page"]` | `#/collection` | `games` |
| 2 | `a.ui-tab[href="#/movies/browse/movie"]` | Movies | `film` |
| 3 | `a.ui-tab[href="#/movies/browse/tv"]` | TV Shows | `tv` |
| 4 | `a.ui-tab[href="#/movies/list"]` | My list | `bookmark` |
| 5 | `button.ui-tab[data-action="study"]` | opens Study (`main.ts:399`) | `study` |

Labels are `Games`, `Movies`, `TV Shows`, `My list`, `Study`. `aria-current="page"` is written in the static markup on Games only. No code updates it on route change, so a new section either adds a tab with its own static markup and a separate `aria-current` update, or lives under the Games tab. The menu button is `.app-menu`, added by `createSectionNavigation` (`navigation.ts:13`).

Movies' tabs are rendered by `mobileNav()` (`src/movies/view.ts:986`). Their markup is `button.ui-tab[data-kind][aria-pressed]` and a Study button, not links.

---

## 4. `src/movies/view.ts` as the lazy-section template

### 4.1 Lazy load and mount

- Imported only inside `route()` (`main.ts:233`): `await Promise.all([import('./movies/view'), import('./movies/storage')])`.
- CSS is imported by the view module itself (`src/movies/view.ts:1`) and by `main.ts:2` for the global side.
- Persistent data is held outside the view. `movieStorage` is a module-level singleton (`main.ts:71,234`) so unsaved changes survive a visit to Games. A new section should do the same for its data layer.

### 4.2 Class shape and constructor

`export class MoviesView` (`src/movies/view.ts:96`):
- `readonly root = document.createElement('section')` (`view.ts:97`).
- Constructor (`view.ts:215-216`):
  ```ts
  constructor(container:HTMLElement, private storage:MovieStorage,
    private study:(advance?:boolean)=>void, private reducedMotion:boolean|(()=>boolean),
    private preferences:PlaybackPreferences={autoNext:()=>true,setAutoNext:()=>{}},
    private openMenu:(trigger:HTMLElement)=>void=()=>{}) {
    this.root.className='movies-view';
    this.root.setAttribute('aria-label','Movies and TV');
    this.root.tabIndex=-1;
    container.replaceChildren(this.root);
    document.body.classList.add('movies-active');
    ...
    this.root.focus();
  }
  ```
- Instantiation (`main.ts:235`): `new MoviesView(content, movieStorage, openStudy, ()=>preferences.reducedMotion, {autoNext, setAutoNext}, openMenu)`.
- The `study` callback is `openStudy` and the `openMenu` callback is the shell menu opener. Both come from `main.ts`, so the view never imports shell state.

### 4.3 Rendering into the content element

- `container` is `#content` (`main.ts:50`). `replaceChildren(this.root)` replaces the games library or loading block.
- `render()` (`view.ts:987-1006`) rewrites `this.root.innerHTML` with `header() + page + navigation`. Then it re-binds glass, images, rails and the player. Focus is kept through `keepingFocus()` (`view.ts:712-714`).
- `this.navigation.root` is preserved across renders (`view.ts:532`). Its tab bar is refilled from `mobileNav()` each render (`view.ts:1000`). This is the "island survives renders" pattern (`view.ts:203-204`).
- Escaping: a local `escape()` for every string that reaches `innerHTML` (`view.ts:25`). Use the same, or set `textContent`.

### 4.4 Event delegation

- One click listener on `root`, capture phase, reads `closest('a[href^="#"],button')`, and dispatches by `data-action` (`view.ts:1085-1116`). Also `input`, `change`, `keydown` and `focusin` listeners on `root` (`view.ts:228-233`).
- Listeners are removed in `dispose()` (`view.ts:1315`), along with an `AbortController` (`this.abort.abort()`).

### 4.5 Navigation inside the section: hash routes, not history

- A section change is a hash change. `navigate(hash)` (`view.ts:429-436`):
  ```ts
  navigate(hash:string){
    this.dismissWarning();
    if(this.confirmedPlayback!==hash)this.confirmedPlayback='';
    this.closeDrawer();
    this.applyRoute(hash);
    this.hideTabbar.reset();
  }
  ```
- Controls are `<a href="#/...">`. Back is a hash link, for example `.movies-detail-back` (`view.ts:849`). The view never calls `history.back()`.
- `applyRoute` (`view.ts:437`) parses with `parseMovieRoute(hash)`, keeps per-route scroll and focus in `positions`, and re-renders. If the route is unknown it renders a not-found state (`view.ts:439`).
- Focus restore on return uses `returnFocus` and `returnRail` (`view.ts:1085-1092` and `applyRoute`).
- `route()` re-enters via `movies.navigate(location.hash)` when the view already exists (`main.ts:224`).

### 4.6 Scroll container and tab bar

- `.movies-view` is `position:fixed; inset:0 0 auto; height:100dvh; overflow:auto; overscroll-behavior:contain; z-index:30` (`src/movies/style.css:3`). It is the scroller.
- `autoHideTabbar(this.tabbar, this.root)` binds the island to the view's own scroller, not `window` (`view.ts:236`). That is why the Movies comment says "Movies scrolls inside its own overlay".
- Movies keeps the shell `.app-navigation` hidden through `body.movies-active .app-navigation{display:none}` (`src/style.css` line 8). It uses its own `.movies-mobile-nav` inside the view.

### 4.7 Loading, empty and error states

Markup used, all from `view.ts` and `main.ts`:

- Route loading (shell): `<div class="loading"><p>Opening Movies &amp; TV…</p><a class="game-button secondary" href="#/collection">Back to games</a></div>` (`main.ts:231`). `.loading` is padded 60px 20px, centred, 18px/1.6 (`src/style.css` line 1).
- Route failure (shell): `<div class="game-error"><p>…could not load.</p><a class="game-button secondary" href="#/collection">Back to games</a></div>` (`main.ts:237`). `.game-error` is `#ffb6a5` (`src/style.css` line 1).
- View loading: `LOADING_TITLE` (`view.ts:34`): `<div class="movies-empty" role="status"><h1 tabindex="-1">Loading title details…</h1><p>…</p></div>`.
- View empty and failure in `render()` (`view.ts:997`): `.movies-empty` with `h1` "Opening the collection…" or "The collection is unavailable", with `role="status"` and a `p` for the error text.
- Inline notices: `.movies-catalog-status` with `role="status"` (`view.ts:1014`). Detail error with a `Retry title` button (`view.ts:1019`, class `ui-btn secondary small`).
- Network: `movieJson(url, signal, timeout=20000)` (`src/movies/network.ts:7`) throws `MovieNetworkError` with kind `network | timeout | service | invalid` (`network.ts:2`). Message builder at `network.ts:25`.

`.movies-empty` is styled in `src/movies/style.css` (lines 20, 35-40 and mobile overrides). Its prefix is `.movies-` under `.movies-view`.

### 4.8 Dispose and pause

- `pause()` (`view.ts:1306`): stops any next-up countdown, closes the drawer, saves progress, pauses video and replaces an external stream with "Stream paused" and a Resume button. Called by `openStudy` (`main.ts:188`), `pagehide` (`main.ts:432`) and `visibilitychange` (`view.ts:202`).
- `dispose()` (`view.ts:1315`): cancels all requests with `abort()`, bumps request counters, disposes rails, images, tab bar, menu glass and header glass, disconnects its observers, stops video, removes global listeners, removes `this.root`, and removes `movies-active` from `<body>`. This is the cleanup list a new section must mirror.

### 4.9 CSS convention

- All selectors are scoped under the root class, `.movies-view ...` for descendants (`src/movies/style.css:3-17`).
- Component classes are `movies-*` (`movies-empty`, `movies-top`, `movies-drawer`, `movies-next`, `movies-catalog-status`, ...).
- Shared components keep `ui-*`: `ui-header`, `ui-tabbar`, `ui-rail`, `ui-card`, `ui-hero`, `ui-btn`.
- Reduced motion for the section is `.movies-view *` (`src/movies/style.css:17`) plus `.reduce-motion .movies-view *`.
- Other sections use their own prefixes: `study-` (`src/study`), `lb-` (`src/leaderboard`), `account-` (`src/accounts/view.ts`), `mp-` (`src/multiplayer`), `ms-` (Minesweeper), `cc-`, `sol-`, `ff-`, `bc-` (Blockcraft), and `game-` for shell game chrome.
- Import the section's stylesheet from its module (`src/movies/view.ts:1` for `style.css`). Do not import it in `main.ts`, or it lands in the eager bundle.

---

## 5. `src/accounts/client.ts` API

### 5.1 Public surface

- `export interface Session {token: string; username: string}` (`client.ts:7`).
- `export class AccountsClient` (`client.ts:28`).
- `session(): Session | null` (`client.ts:38-41`). Reads `accounts:session` from storage and validates it. Returns `null` for guests or invalid data.
  ```ts
  session():Session|null {
    const value=this.storage.read<Session|null>(sessionKey,null);
    return value&&validSessionToken(value.token)&&validUsername(value.username)?value:null;
  }
  ```
- `onChange(listener: () => void): () => void` (`client.ts:42`). Returns an unsubscribe. Fired on login (`client.ts:130`), logout (`client.ts:161`), and cross-tab storage change (`client.ts:252`).
- `authenticate(action: 'signup' | 'login', username, password)` (`client.ts:114-132`).
- `logout(): Promise<void>` (`client.ts:153`).
- `flush(keepalive=false, pull=true): Promise<void>` (`client.ts:165`). Sends pending saves and pulls.
- `start(listenPagehide=true)` (`client.ts:258`). Wires `online`, `pagehide` and `storage` listeners.
- `dispose()` (`client.ts:264`).
- `message: string` (`client.ts:29`). Human status line shown in the menu (`main.ts:465`).
- `beforeIdentityChange: () => void` (`client.ts:29`), set by `main.ts:470`.
- Constructor `(storage = store, fetcher = globalThis.fetch.bind(globalThis))` (`client.ts:34`). The `fetcher` injection is how tests fake the network.

### 5.2 Endpoint, headers and auth

- `const endpoint = '/.netlify/functions/accounts'`, `sessionKey = 'accounts:session'` (`client.ts:14`).
- Request builder `response(action, method, body, token?, keepalive?)` (`client.ts:104-113`):
  ```ts
  const response=await this.fetcher(`${endpoint}?action=${action}`,{method,
    headers:{...(action.startsWith('sync')?{'X-QCC-Sync':'2'}:{}),
             ...(token?{Authorization:`Bearer ${token}`}:{}),
             ...(body!==undefined?{'Content-Type':'application/json'}:{})},
    ...});
  ```
- Action names used: `signup`, `login`, `sync&cursor=<n>` (GET, with `X-QCC-Sync: 2`), `logout`, `revoke` (`client.ts:117,120,146,161`). The server also dispatches `me` (`src/accounts/server.ts`).
- Bearer token format: `acct_` followed by 64 lowercase hex (`src/accounts/shared.ts:18`, regex `^acct_[a-f0-9]{64}$`). The server re-checks `^Bearer (acct_[a-f0-9]{64})$` (`src/accounts/server.ts:20`).
- A separate leaderboard profile token uses `^Bearer ([a-f0-9]{64})$` (`src/leaderboard/server.ts:46`). Do not mix the two.
- Username rule: `^[a-zA-Z0-9_.-]{3,24}$` (`shared.ts:16`). Password: 8 to 128 characters (`shared.ts:17`).

### 5.3 Timeouts and errors

- The accounts `response()` has no `AbortSignal` timeout. A hung request waits for the browser. Compare the leaderboard client, which uses `AbortSignal.timeout(8000)` (`src/leaderboard/client.ts:108-109`), and Movies, which uses 20000 ms (`src/movies/network.ts:7`).
- Errors: `class AccountRequestError extends Error {retryable, retryAt, status}` (`client.ts:27`). Retryable on 429, 502, 503 and 507 (`client.ts:110`). `Retry-After` is honoured (`client.ts:108-109`).
- 507 maps to `STORAGE_FULL_MESSAGE` from `src/core/storage-full.ts` (`client.ts:107`).
- Non-OK default message: `'Accounts are unavailable. Your progress stays on this browser.'` (`client.ts:107`).

### 5.4 Guidance for Social and Chat clients

- Read the token with `accounts.session()?.token`. It is `null` for guests. Send no `Authorization` header then, and render the signed-out state.
- Subscribe with `accounts.onChange(...)`. Unsubscribe in `dispose()`. `main.ts` does this with `route()` (`main.ts:477`), so a new section also gets a route refresh on account change.
- Keep the same `fetch` injection pattern as `AccountsClient` so Playwright can intercept with `context.route` (section 7).
- Respect the account identity check in `beforeIdentityChange` (`main.ts:470`). Cancel in-flight requests in `dispose()`.
- Add an explicit timeout with `AbortSignal.timeout(...)` because the accounts client has none.

---

## 6. Typography, icons, spacing summary

Quick reference for a new section.

- Body font: `var(--font-sans)` for section chrome. The Arcade face is used only for game-shell text (`src/style.css` line 1). Movies uses `font:15px/1.5 var(--font-sans)` on `.movies-view` (`src/movies/style.css:3`).
- Mono: `var(--font-mono)` for labels, chips and metadata (`theme.css:53,174,182,183,200,202,213`).
- Icons: `uiIcon()` from `src/ui/icons.ts`. 16px base, 20px in capsule and sheet close, 24px in placeholders.
- Spacing actually used in shared components: 8, 10, 12, 16, 20, 24 px, and 32px for sheet and footer bottom padding. Gutter 16/24 px.
- Touch targets: 44px minimum (`theme.css:109,315,167`; `.icon-button` in `src/style.css` line 1 is 42px). Use 44px.

---

## 7. Testing conventions

### 7.1 Unit tests: vitest, node environment

- `vite.config.ts:4-6` configures `test:{include:['tests/**/*.test.ts'], environment:'node'}`. There is no jsdom or happy-dom dependency in `package.json`.
- Pure logic is tested as functions. Examples: `tests/core/tabbar.test.ts` imports `nextTabbarState` and `TabbarScroll` from `src/ui/tabbar` (`tabbar.test.ts:1-2`). Also `tests/core/focus.test.ts`, `tests/core/sheet.test.ts`, `tests/core/rails.test.ts`, `tests/core/theme.test.ts`, `tests/core/images.test.ts`.
- DOM logic is not unit-tested here. Tests that need the DOM go to Playwright.
- `tests/accounts/client.test.ts` and `tests/accounts/server.test.ts` cover the accounts client and handler directly (fetcher injection).
- Script: `"test": "vitest run"` (`package.json`).

### 7.2 Browser tests: Playwright

- `playwright.config.ts`: `testDir './tests'`, `testMatch '**/*.spec.ts'`, timeout 30s, expect timeout 7s, `workers: process.env.CI ? 1 : 2`, projects `chromium` (Desktop Chrome, `--no-sandbox`, swiftshader WebGL) and `webkit` (Desktop Safari). `webServer` runs `npm run dev -- --port 4600 --strictPort` unless `ARCADE_URL` is set (`playwright.config.ts:6-41`).
- Specs live in `tests/e2e/*.spec.ts` (about 30 files, e.g. `shell.spec.ts`, `redesign-shell.spec.ts`, `sheet-navigation.spec.ts`, `focus-rings.spec.ts`, `navigation-material.spec.ts`, `dock-keyboard.spec.ts`, `arcade-sheets.spec.ts`), `tests/accounts/accounts.spec.ts`, `tests/movies/*.spec.ts`, `tests/study/*`, and so on.
- Helpers: `tests/game-menu.ts` exports `appSettings` (opens the menu), `gameAction(page, name)` and `pauseGame(page)`. Used in `accounts.spec.ts:2`.

### 7.3 Backing services in Playwright: `context.route` into real handlers

`tests/accounts/accounts.spec.ts:1-30` is the pattern to copy.

```ts
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler} from '../../src/accounts/server';
import {createLeaderboardHandler} from '../../src/leaderboard/server';

const database=new NetlifyDB({logger:()=>{}});
let pool:ReturnType<typeof getDatabase>['pool'];
let accounts:ReturnType<typeof createAccountsHandler>, leaderboard:ReturnType<typeof createLeaderboardHandler>;
test.beforeAll(async()=>{
  const connectionString=await database.start();
  await database.applyMigrations('netlify/database/migrations');
  pool=getDatabase({connectionString}).pool;
  accounts=createAccountsHandler(pool);
  leaderboard=createLeaderboardHandler(pool);
});
test.afterAll(async()=>{await pool?.end();await database.stop();});

async function connect(context:BrowserContext){
  for(const [name,handle] of [['accounts',accounts],['leaderboard',leaderboard]] as const)
    await context.route(`**/.netlify/functions/${name}**`,async route=>{
      const req=route.request();
      const result=await handle(new Request(req.url(),{method:req.method(),headers:req.headers(),
        body:['POST','PUT'].includes(req.method())?req.postData():undefined}));
      await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});
    });
}
```

- A Social or Chat function would be added the same way, with a `context.route('**/.netlify/functions/<name>**')` entry and a handler built from the function's `src/...` module.
- The `NetlifyDB` dev instance is used only in Playwright and in `tests/database/runtime.test.ts:2,8`.
- `connect(context, topic=true)` also seeds `localStorage` through `addInitScript` so the Study chooser does not block the test (`accounts.spec.ts:7`). Use the same to skip reading consent.

### 7.4 Movies spec style (for a page-level mock)

`tests/movies/network-recovery.spec.ts` uses `page.route('**/api/movies?*', route=>route.fulfill({json: ...}))` and `route.abort()` to simulate outages (lines 10-32). Use the same style for an external API. Keep any frame or image origins mocked too (`network-recovery.spec.ts:10-11`).

### 7.5 Test hooks available in the app

- `data-input` on `<html>` tells a spec whether keyboard or pointer mode is active (`src/ui/focus.ts:27`).
- `data-minimized` and `data-hidden` on `.ui-tabbar` (`tabbar.ts:69`, `movies/view.ts:212`).
- `data-sheet-hidden` on `.section-navigation` (`modal-navigation.ts:34`).
- `data-glass` and `data-glass-tone` on glass elements (`glass.ts`, `sheet.ts:53`).
- `.reduce-motion` on `<html>` (`main.ts:429`).

---

## 8. Checklist for a new lazy section

Integration points that the shell already exposes. Each item names the file and line that constrains it.

**Route and mount**
1. Add a hash branch in `route()` before the games code (`main.ts:222` pattern). Match `#/social` and `#/chat` exactly and also their sub-paths, as `isMovies` does (`main.ts:222`).
2. Set `const token=++generation; leave();` before mounting, so a stale async mount is discarded (`main.ts:229`).
3. Call `setChromeInert(true)` so the shell tab bar and menu are hidden and inert while the section owns the screen (`main.ts:230`). Or leave the shell visible if the section is meant to sit under it. Decide and keep it consistent.
4. Show a `.loading` block while the lazy import runs, and a `.game-error` with a "Back to games" link if it fails (`main.ts:231,237`).
5. Lazy-load with `await import('./social/view')` inside `route()`, not at module top level (`main.ts:233`).
6. Guard the import result with `if(token!==generation) return;` (`main.ts:233`).
7. Import the section's CSS from its own module, not from `main.ts` (`src/movies/view.ts:1`).

**Lifecycle**
8. Add the section's dispose to `leave()` (`main.ts:117-132`). Otherwise the view survives a route change.
9. `leave()` already runs inside `accounts.beforeIdentityChange` (`main.ts:470`). Dispose there too, through `leave`.
10. Expose `pause()` and call it from `openStudy` (`main.ts:188`) and from `pagehide` (`main.ts:432`). Pause timers, polling and media.
11. Make `dispose()` abort every request, clear every timer, disconnect every observer, and remove every global listener. Copy the list from `MoviesView.dispose` (`src/movies/view.ts:1315`).
12. Remove the section's `body` class in `dispose()` (`src/movies/view.ts:1315` removes `movies-active`).

**Tab bar and navigation**
13. Call `tabbar.reset()` on every route and every leave (`main.ts:218,120`). It is already done in `route()` and `leave()`. If the section binds its own island, call `reset()` on its `navigate()` too (`src/movies/view.ts:436`).
14. Use `createSectionNavigation('app')` for a shell-level island, or write a scoped version for a full-page section (`src/ui/navigation.ts:5`). Do not invent a second material.
15. Add the tab to the static list at `main.ts:47` if it belongs in the shell. Update `aria-current` on route change. No code does this today (section 3.7).
16. If the section keeps the shell tab bar, add its hash to the menu close guard at `main.ts:405`, or the library will render over it.
17. If the section hides the shell bar, use the `setChromeInert` path, not `display:none`. The attribute also feeds CSS (`src/style.css` line 9).
18. Add the section's class to the rules that hide `.app-navigation` (`src/style.css` line 8), and to the `#content` padding rules (`src/style.css` lines 10-11, 31) if the section is full-page.

**Dialogs, Escape and Study**
19. Open dialogs with `openSheet(dialog, trigger)`. Give the dialog `class="ui-glass-sheet"`. Add its id to the list at `sheet.ts:51` if it should get `arcade-sheet` and a glass tone.
20. Use the dialog markup from `main.ts:44`: a `form method="dialog" class="dialog-head"` with an `h2` and an `.icon-button` close.
21. Add the section to the Escape gate at `main.ts:443` (`!activeId&&!movies&&!study.isOpen`). Without this, Study cannot be opened from the section with Escape.
22. Include the section's open dialogs in the Escape cancel chain at `main.ts:304` and `main.ts:440`.
23. Make sure `returnFromStudy` (`main.ts:209-212`) has a fallback focus target for the section.
24. Keep `suppressNavigationUnderSheets()` (`main.ts:49`) in charge of hiding the shell nav under dialogs. Do not manage it by hand.

**Accounts and data**
25. Read the bearer token with `accounts.session()?.token` (`client.ts:38`). Send `Authorization: Bearer <token>` only when it exists. Expect `acct_` plus 64 hex (`shared.ts:18`).
26. Subscribe to `accounts.onChange` for identity changes. Unsubscribe on dispose (`client.ts:42`). Note that `main.ts:477` already calls `route()` on identity change, which re-mounts the section.
27. Give every request a timeout. The accounts client does not (`client.ts:104-113`).
28. Keep long-lived data in a module-level singleton outside the view, as Movies does with `movieStorage` (`main.ts:71,234`).
29. Use the `store` API (`src/core/storage.ts`, prefix `pocket-arcade:v1:`) for local state. Use `store.read`, `store.write`. Add new keys to `SAVE_KEYS` in `src/accounts/shared.ts` only if they should sync.

**Motion and preferences**
30. Read reduced motion through the live getter `()=>preferences.reducedMotion` (`main.ts:235`), and check `document.documentElement.classList.contains('reduce-motion')` as well (`glass.ts:136`, `movies/view.ts:234`).
31. Use `bindRails(root, reduced)` for any horizontal rail, so smooth scrolling honours the setting (`rails.ts:38`).
32. Don't add motion outside the shared rules. The global reset at `theme.css:364-369` and the `.reduce-motion` copy cover `.ui-btn`, `.ui-card` and `.ui-tab`. Anything custom needs its own `prefers-reduced-motion` and `.reduce-motion` rule, as `src/movies/style.css:17` does.

**Focus and input**
33. Do not remove the focus ring for keyboard users. Keep the `data-input` contract (`focus.ts`). Test with `:focus-visible` in Playwright after `keyboard.press('Tab')`.
34. Text inputs in the section get no outer ring, only the border and the inner ring from `theme.css:28-31`.
35. Call `trackInputMode` only once, in `main.ts:41`. Do not call it again from a section.

**Images, lists and states**
36. Use `.ui-card-img` and `.ui-hero-backdrop` for images so `watchImages` fades them in and handles failures (`images.ts:5`). Call `markImages` for images already in the DOM (`images.ts:21`).
37. Show loading, empty and error with `role="status"` and the existing `.movies-empty`-style pattern (section 4.7). Use `textContent` for user text (`main.ts:143`).

**Tests**
38. Add pure logic to `tests/**/*.test.ts` (node environment, `vite.config.ts:6`). Add DOM and flow tests to `tests/**/*.spec.ts` (`playwright.config.ts:7`).
39. For backend calls, mirror `tests/accounts/accounts.spec.ts:1-30`: `context.route` into the real handler with `NetlifyDB`.
40. Use `addInitScript` to skip the Study consent chooser in specs (`accounts.spec.ts:7`).
41. Run `npm run check` (`tsc --noEmit`) and `npm test`. The build also runs `scripts/movies-validate.mjs` and the sw kill switch check (`package.json` `build`).

**Visual**
42. Use `--gutter`, `--page-max`, `--tabbar-h` and `--tabbar-gap` for layout (section 1.3). Keep side padding at `--gutter`, so the phone gutter is 16px.
43. Use the `ui-container` class for page width (`theme.css:34`). Check the phone width (320 to 390) with no horizontal scroll.
44. Use the existing z-index layers in section 1.11. A sheet is always above the bar through the top layer. A full-screen section should use 30, as `.movies-view` does (`src/movies/style.css:3`).
45. Use `--sh-*` and `--r-*` tokens for new surfaces. Use `.ui-glass-sheet` for any glass dialog.
