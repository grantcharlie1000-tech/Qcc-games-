# QCC Social + QCC Chat: design spec

Binding design for the two apps described in [SPEC.md](SPEC.md). Implementers follow it literally. Where this file and SPEC disagree on product rules (limits, retention, access), SPEC wins; where they disagree on look, layout, copy or motion, this file wins. Decisions marked ⚑ are designer calls that the owner can change.

- Icons: [`src/apps/icons.ts`](../../src/apps/icons.ts) (`appIcon(name, label?)`). Use it for every glyph in both apps. Use `uiIcon` from `src/ui/icons.ts` only for shell glyphs that already exist (`menu`, `games`, …).
- Static mockup: [`design/mockups.html`](design/mockups.html), rendered to [`docs/evidence/social-chat/design-mockups.png`](../evidence/social-chat/design-mockups.png). The mockup's SVGs were generated from `icons.ts`; if a glyph changes, regenerate the mockup.
- References read: [qcc-design-system.md](references/qcc-design-system.md), [x-social-patterns.md](references/x-social-patterns.md), [snapchat-chat-patterns.md](references/snapchat-chat-patterns.md), [safety-and-media.md](references/safety-and-media.md), `src/theme.css`, `src/style.css`, `src/movies/style.css`, `src/ui/icons.ts`.

Contents: 1 Principles · 2 Tokens · 3 Shared components · 4 Shell and launcher · 5 Social routes · 6 Chat routes · 7 States and copy · 8 Chat status glyphs · 9 Icons · 10 Upload UI · 11 Accessibility · 12 Motion · 13 Implementation checklist · 14 Open concerns.

---

## 1. Principles

1. **Native first.** Both apps are QCC sections, built like Movies: black page, the existing liquid-glass island, `.ui-glass-sheet` dialogs, white primary buttons, zinc greys, `--font-sans`. Nothing in them should look like a third-party skin. No new glass material, no new focus style, no new easing curve.
2. **One accent each, used sparingly.** Social is violet, Chat is teal. The accent marks the current tab, links, mentions, the composer ring and the app's own tile. It is never a page background and never the only signal of state.
3. **Plain words, said once.** Short NZ English. Safety facts (friends only, not end-to-end encrypted, what is deleted when) are stated where they matter, in one sentence, without alarm or marketing. No "Welcome to…", no exclamation marks, no emoji in UI copy.
4. **State is shape plus text.** Every status (liked, saved, unread, sent, opened, pending, hidden) is carried by a shape or icon change and a word, then by colour. It must survive greyscale and the colour-blind setting.
5. **Calm motion.** Motion confirms an action or shows where something went. It never decorates a list someone scrolls all day, never runs on a keyboard shortcut, and stops under either reduced-motion trigger (section 12).

### Identity: distinct but native

| | QCC Social | QCC Chat |
| --- | --- | --- |
| Accent | `--social-accent: #a684ff` (violet-400) | `--chat-accent: #46ecd5` (teal-300) |
| Why this hue | The existing tokens are the Tailwind v4 palette (`--c-*` = zinc, `--c-rose` = rose-500, `--c-amber` = amber-400, `--c-green` = emerald-400, `--c-red` = red-400). Violet-400 is the same family and weight. It is clearly not X's blue or black, and not Snapchat's yellow. | Teal-300 from the same palette. Cooler than `--c-green` (so it is not read as "success") and clearly not Snapchat yellow, not a messaging-brand blue. |
| Mark | **Orbit**: a centre dot, an open ring and one satellite dot in the ring's gap. "You and the people around you." Not a bird, not an X. | **Fading bubble**: a capsule with a short tail and two dots trailing off to the right. "Messages that fade." Not a ghost. |
| Tile | Violet gradient tile, mark knocked out in dark ink (`social-tile`) | Teal gradient tile, mark knocked out in dark ink (`chat-tile`) |
| Wordmark | "QCC Social" (desktop), "Social" (phone top bar) | "QCC Chat" (desktop), "Chat" (phone top bar) |

### Contrast (WCAG relative-luminance math, computed for this spec)

| Foreground | Background | Ratio | Use |
| --- | --- | --- | --- |
| `#a684ff` violet | `#000` page | **7.37:1** | links, mentions, selected tab text |
| `#a684ff` | `#18181b` (`--c-900`) | 6.21:1 | accent text on raised panels |
| `#a684ff` | `#27272a` (`--c-800`) | 5.22:1 | accent text on hover rows |
| `#09090b` ink | `#a684ff` fill | 6.98:1 | text on violet pill ("3 new posts") |
| `#46ecd5` teal | `#000` | **14.22:1** | sender names, status words |
| `#46ecd5` | `#18181b` | 12.00:1 | |
| `#09090b` ink | `#46ecd5` fill | 13.47:1 | send button glyph, unread count |
| `#ffb900` amber (`--c-amber`) | `#000` | 12.19:1 | photo (snap) status, composer warning |
| `#ff637e` rose-soft (`--c-rose-soft`) | `#000` | 7.34:1 | liked heart and count |
| `#09090b` ink | `#ff637e` fill | 6.95:1 | unread badge text |
| `#ff6467` red (`--c-red`) | `#18181b` | 6.13:1 | over-limit count, danger text |
| `#9f9fa9` (`--c-400`) | `#000` / `#18181b` / `#27272a` | 8.01 / 6.75 / 5.68:1 | all muted text |
| `#71717b` (`--c-500`) | `#000` | **4.35:1 — fails** | never for text; placeholders use `--c-400` |
| `#fff` | avatar tints (section 3.2) | 7.72–10.27:1 | avatar initials |
| `#f4f4f5` | saved-message fill `#071815` | 16.61:1 | saved message text |

Non-text (3:1): the composer ring track uses `--c-700` (2.01:1 on black) and carries no information on its own; the progress arc in violet (7.37:1), amber or red does.

---

## 2. Tokens

Define once in `src/apps/apps.css` (imported by `src/apps/launcher.ts`, which the shell loads eagerly because the Apps tab and its badge live in the shell). Everything else uses existing tokens from `theme.css` and `src/style.css`.

```css
:root{
  /* Social */
  --social-accent:#a684ff;
  --social-accent-ink:var(--c-950);
  --social-accent-soft:rgb(166 132 255 / .16);
  --social-like:var(--c-rose-soft);
  --social-warn:var(--c-amber);
  --social-danger:var(--c-red);
  /* Chat */
  --chat-accent:#46ecd5;
  --chat-accent-ink:var(--c-950);
  --chat-accent-soft:rgb(70 236 213 / .14);
  --chat-text:var(--chat-accent);      /* text family glyphs and the friend's name */
  --chat-snap:var(--c-amber);          /* photo family glyphs */
  --chat-pending:var(--c-400);         /* requests, system lines */
  --chat-me:var(--c-300);              /* your own sender label */
  --chat-saved-bg:rgb(70 236 213 / .10);
  --chat-saved-edge:rgb(70 236 213 / .45);
  /* Shared */
  --app-badge:var(--c-rose-soft);
  --app-badge-ink:var(--c-950);
  --app-panel:var(--c-950);
  --app-panel-edge:var(--line);
  --app-top:calc(env(safe-area-inset-top,0px) + 64px);   /* content top under the floating top bar */
  --app-bottom:calc(var(--tabbar-h) + 2*var(--tabbar-gap) + env(safe-area-inset-bottom,0px)); /* above the island */
}
```

Existing tokens used throughout: `--c-*`, `--line*`, `--r-*` (8 / 12 / 16 / 24), `--font-sans`, `--font-mono`, `--t-fast` 150 ms, `--t` 200 ms, `--t-slow` 300 ms, `--ease` (`cubic-bezier(.4,0,.2,1)`, colour only), `--ease-out` (`cubic-bezier(.23,1,.32,1)`, `src/style.css` `:root`), `--ease-in-out` (`cubic-bezier(.77,0,.175,1)`, `src/style.css` `:root`), `--ease-drawer`, `--ease-glass`, `--ease-glass-pop`, `--gutter` (16 / 24 px), `--tabbar-h` 64, `--tabbar-gap` 12.

Type scale (both apps, `font-family:var(--font-sans)`; mono only for counts in the composer):

| Role | Size / line / weight | Colour |
| --- | --- | --- |
| Page title (`h1`) | 28/1.15/800, `letter-spacing:-.02em`; 32px from 640 | `--c-100` |
| Section heading (`h2`) | 17/1.3/700 | `--c-100` |
| Body (posts, messages) | 15/1.45/400 | `--c-100` |
| Focused post body (thread) | 17/1.45/400 | `--c-100` |
| Name | 15/1.3/600 (700 when unread in Chat) | `--c-100` |
| Handle, time, meta | 14/1.3/400 | `--c-400` |
| Small print, notes | 13/1.45/400 | `--c-400` |
| Labels on chips and badges | 11/1/700 | per component |
| Composer text | 17/1.4 (Social sheet); 16/1.4 (Chat, avoids iOS zoom) | `#fff` |

Spacing uses the values already in the codebase: 4, 6, 8, 10, 12, 16, 20, 24, 32, 44 (target), 56, 64.

---

## 3. Shared components

All live in `src/apps/` (`apps.css`, `ui.ts`) with the `apps-` class prefix, so both apps and the launcher share them. App-specific pieces use `social-` and `chat-`.

### 3.1 Section frame

Both apps mount like Movies (qcc-design-system.md section 4): `section.social-view` / `section.chat-view`, `position:fixed; inset:0 0 auto; height:100dvh; overflow:auto; overscroll-behavior:contain; z-index:30; background:var(--c-bg); color:#fff; font:15px/1.45 var(--font-sans); color-scheme:dark`. `body.social-active` / `body.chat-active` hide `.app-navigation` (add both to the `src/style.css` line 8 and 10–11 rules). Each view builds its own island with `createSectionNavigation('social' | 'chat')` (extend the scope union in `src/ui/navigation.ts`) and binds `autoHideTabbar(bar, this.root)`.

**Top bar** `.apps-top.ui-header` (copy `.movies-top`): fixed, `top:env(safe-area-inset-top,0px)`, transparent, `pointer-events:none`; `.ui-header-inner` `padding:6px max(12px, env(safe-area-inset-left)) 6px max(12px, env(safe-area-inset-right))`, 24px gutters from 640. Children are `.arcade-glass.floating-glass-group[data-glass-tone=light]` groups, `min-height:44px; padding:4px; pointer-events:auto; --glass-ink:#fff`, bound with `bindFloatingGroups`. Buttons inside: 36px min-height, `border-radius:20px`, no border, inherit colour; icon-only buttons are 36×36 inside a 44 group (the group is the touch target).

- **Brand group** `a.apps-brand` (left): 28px app tile mark + wordmark (16/18/800, `letter-spacing:-.025em`). Phone: "Social" / "Chat". From 768: "QCC Social" / "QCC Chat". Below 360px the wordmark is hidden; the link keeps `aria-label="QCC Social home"`.
- **Back group** (left, replaces the brand on child routes): one 36×36 button, `appIcon('back')` 20px, `aria-label` names the destination ("Back to feed", "Back to chats").
- Content starts at `padding-top:var(--app-top)` and ends at `padding-bottom:calc(var(--app-bottom) + 16px)`.

**Island** (bottom): the standard `.section-navigation` with the app's tabs and the shell's menu circle (`data-action=menu`, calls the `openMenu` callback as Movies does). Tabs use `appIcon` nav twins (outline at rest, fill when `aria-current=page`).

| App | Tabs (label, icon, target) |
| --- | --- |
| Social | Home `home` `#/social` · Search `search` `#/social/search` · Activity `activity` `#/social/activity` · Profile `profile` `#/social/u/<me>` · Apps `apps` (button, opens launcher) |
| Chat | Chats `chat` `#/chat` · Add friend `add-friend` `#/chat/add` · Apps `apps` (button) |

Set `aria-current="page"` on the tab for the current route yourself (nothing does it today). The Apps tab is `button.ui-tab[data-action=apps][aria-haspopup=dialog]` and carries the unread badge (3.6).

### 3.2 Avatar `.apps-avatar`

Sizes: 20 (chat group label), 32 (activity, blocked list, compose context), 40 (people results), 44 (posts), 48 (chat rows), 56 (chat info sheet), 80 phone / 96 from 640 (profile).

- `span.apps-avatar` circle, `overflow:hidden; flex-shrink:0; box-shadow:inset 0 0 0 1px rgb(255 255 255 / .08)`; `img` inside, `width:100%; height:100%; object-fit:cover; alt=""` (the name beside it is the label).
- Fallback (no avatar, or the image fails): the first code point of the display name (else username), upper-cased, `font-weight:700; font-size:calc(size * .42)`, `color:#fff`, background picked by a stable hash of the username (sum of char codes mod 6) from these tints, all ≥7.7:1 with white: `#4c3a8f #1f5c55 #6b4420 #6a2b45 #2f4a6b #4a5320`.
- Avatars that link to a profile are `a` elements with `aria-hidden="true" tabindex="-1"` when the name next to them is also a link (one tab stop per person).

### 3.3 Buttons

Reuse the existing styles; do not invent a new button.

| Use | Style |
| --- | --- |
| Primary (Publish, Follow, Send request, Log in / Sign up, Accept) | `.ui-btn.primary` but pill: `height:40px; padding:0 18px; border-radius:999px; font:700 15px/1 var(--font-sans)`; 36px tall `.small` variant inside rows |
| Secondary (Following, Edit profile, Decline, Try again, Unblock) | `.ui-btn.secondary`, same pill geometry |
| Danger (Delete everything, Block, Delete conversation) | secondary pill with `color:var(--c-red); border-color:rgb(255 100 103 / .45)`; hover `background:rgb(255 100 103 / .12)` |
| In sheets | `.game-button` / `.game-button.secondary` as the sheet already styles them; danger: `.game-button.secondary.apps-danger` with `color:var(--c-red)` |
| Icon buttons on the page | `button.apps-icon-btn`: 44×44 hit area, 20px icon, `border-radius:999px`, `background:none`, `color:var(--c-300)`; hover (fine pointer) `background:rgb(255 255 255 / .08); color:#fff` |
| Disabled | `opacity:.45; cursor:not-allowed`; keep the label, add the reason in a helper line (never colour alone) |

Press feedback on every button: `transform:scale(.97)` on `:active`, 160 ms `--ease-out` (section 12).

### 3.4 Segmented control `.apps-segmented`

Used for Following | Discover, People | Posts, and nowhere else. `role="tablist"`; each segment `button[role=tab][aria-selected][aria-controls]`. Inside a floating glass group in the top bar (feed) or a plain row (search). Segment: `min-height:36px; padding:0 14px; border-radius:20px; font:600 14px/1 var(--font-sans); color:rgb(255 255 255 / .78)`. Segments are equal width: the control is `display:grid; grid-auto-flow:column; grid-auto-columns:1fr; position:relative`. Selected: `color:#fff; font-weight:700` plus a sliding indicator `span.apps-segmented-pill` (`position:absolute; inset:4px auto 4px 4px; width:calc((100% - 8px) / N); background:rgb(255 255 255 / .16); border-radius:20px; box-shadow:inset 0 1px 0 rgb(255 255 255 / .2)`) moved with `transform:translateX(calc(100% * index))`. Arrow keys move between segments (roving `tabindex`). Tapping the selected segment again scrolls the feed to the top and merges any waiting posts.

### 3.5 Underline tabs `.apps-tabs` (profile)

`role="tablist"`, sticky (`position:sticky; top:var(--app-top)`), `height:48px`, `background:rgb(0 0 0 / .86); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px); border-bottom:1px solid var(--line)`. Tabs flex 1, `font:600 15px/1 var(--font-sans)`, unselected `--c-400`, selected `--c-100` with a 3px × 40px indicator, `border-radius:3px`, `background:var(--social-accent)`, centred under the label (`transform:translateX()`).

### 3.6 Badge `.apps-badge`

Unread messages plus incoming friend requests (`ChatSummary.unread + requests`). `min-width:16px; height:16px; padding:0 4px; border-radius:999px; background:var(--app-badge); color:var(--app-badge-ink); font:700 10px/16px var(--font-sans); text-align:center; box-shadow:0 0 0 2px rgb(0 0 0 / .35)`. On a tab: `position:absolute; top:3px; left:calc(50% + 4px)`. On the Chat tile: `top:-4px; right:-4px`, 20px tall, 12px text. Text: `1`–`9`, then `9+`. Hidden at 0. The number is `aria-hidden`; the control's accessible name gains it ("Apps, 3 new in Chat").

### 3.7 Panels, rows and lists

- Panel `.apps-panel`: `background:var(--app-panel); border:1px solid var(--app-panel-edge); border-radius:var(--r-2xl)` (16px); `padding:16px`.
- Row lists (activity, people, blocked, chat list) are edge-to-edge on phone with `border-bottom:1px solid var(--line)` between rows, not boxed cards. Row hover (fine pointer): `background:rgb(255 255 255 / .04)`.
- Post feeds are edge-to-edge on phone; from 640 the column has `border-inline:1px solid var(--line)`.

### 3.8 Inline notice `.apps-notice`

For non-blocking errors and rate limits. `role="status"` (errors that block a just-pressed action use `role="alert"`). Sits at the top of the content under the top bar, or directly under the control that failed (composer, add-friend form). `display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border:1px solid var(--line); border-radius:var(--r-xl); background:#18181b99; color:var(--c-300); font-size:13px; line-height:1.5` (the `.movies-catalog-status` look). Optional trailing `.ui-btn.secondary.small` ("Try again"). Leading icon 16px: `alert` (`--c-amber`) for warnings, `info` (`--c-400`) for notes. Dismiss button only when the notice does not clear itself.

### 3.9 Sheets

Every overlay is a `dialog.ui-glass-sheet` opened with `openSheet(dialog, trigger)`, with the standard head (`form[method=dialog].dialog-head > h2 + button.icon-button[aria-label="Close …"]`). That gives the existing open/close motion, backdrop, focus and fallbacks. App sheets: launcher (`#apps-dialog`), compose (`#social-compose`), photo viewer (`#social-photo`), report (`#apps-report`), confirm (`#apps-confirm`), shortcuts (`#social-shortcuts`), message menu on phone (`#chat-message-menu`), chat info (`#chat-info`), send photo (`#chat-send-photo`), snap viewer (`#chat-snap`, full-screen variant, 6.5). Add each id to the Escape cancel chain (qcc-design-system.md 3.5).

### 3.10 Skeletons `.apps-skeleton`

Placeholders with the real layout and height: post (44px circle, a 40% and a 25% bar on one line, then 3 bars 100/92/60%, optional 16:9 block), chat row (48px circle, 30% and 55% bars), activity row. Bars `height:12px; border-radius:6px; background:var(--c-900)`. Shimmer per section 12. Container `aria-busy="true"` and a visually hidden `role=status` "Loading posts…" / "Loading chats…". Show 6 post skeletons, 8 row skeletons.

### 3.11 Empty state `.apps-empty`

Centred, `padding:56px 24px; max-width:420px; margin:0 auto; text-align:center`. 48px icon or 64px tile mark in `--c-400` (tile marks keep their colour), `h2` 20/1.3/700 `margin-top:16px`, `p` 15/1.5 `--c-400` `margin:8px 0 20px`, optional button. Copy in section 7.

---

## 4. Shell: Apps tab and launcher

### 4.1 Apps tab

A sixth tab in the shell island (`main.ts:47`), after Study: `button.ui-tab[data-action=apps][aria-haspopup=dialog]` with `appIcon('apps')` and `<span>Apps</span>`, plus `.apps-badge` when signed in and the count is above 0.

Six tabs were measured in the real shell (Chromium, this session): at 390px each tab is 45px and "TV Shows" overflows; at 320px six 44px tabs overflow the bar. So:

- Below 440px the TV tab shows the short label **"TV"** (`<span class="tab-long">TV Shows</span><span class="tab-short">TV</span>`, the tab keeps `aria-label="TV Shows"`).
- Below 390px: `.app-navigation{--home-action:52px;--home-gap:8px}` (menu circle 52px). Result: 44px tabs at 360px.
- Below 360px: `--home-gap:6px` and `.app-tabbar.ui-tabbar .ui-tab{min-width:36px}`, so 36px tabs at 320px (the existing ≤359px rule already sets 9px labels). This passes WCAG 2.5.8 (24px) but not our 44px aim; see section 14.

Badge polling: `ChatSummary` every 60 s while signed in and the tab is visible (SPEC). Stop when hidden; refresh on `visibilitychange` to visible and on identity change.

### 4.2 Launcher sheet `#apps-dialog`

```
phone 390 (bottom sheet, existing .ui-glass-sheet geometry)
┌──────────────────────────────────────┐
│ Apps                             (×) │  h2 20/600
│ ┌───────────────┐ ┌───────────────┐  │
│ │ [tile 64]     │ │ [tile 64] (3) │  │  2-col grid, gap 12
│ │ QCC Social    │ │ QCC Chat      │  │  15/600 #fff
│ │ Posts, replies│ │ Friends-only  │  │  13/1.4 rgb(255 255 255/.72)
│ │ and follows   │ │ messages      │  │
│ └───────────────┘ └───────────────┘  │
│ [ Back to games ]                    │  only when opened inside Social/Chat
│ Not end-to-end encrypted. Reports go │  .menu-note
│ to QCC moderators.                   │
└──────────────────────────────────────┘
```

- Tile `a.apps-tile` (`href="#/social"`, `href="#/chat"`): `display:grid; gap:10px; align-content:start; min-height:156px; padding:16px; border-radius:20px; background:rgb(255 255 255 / .07); box-shadow:inset 0 1px 0 rgb(255 255 255 / .12); color:#fff; text-decoration:none`. Hover (fine pointer) `background:rgb(255 255 255 / .11)`. `:active` scale .97.
- Tile mark: `appIcon('social-tile')` / `appIcon('chat-tile')`, 64×64, inside `span.apps-tile-mark` with `color:var(--social-accent)` / `var(--chat-accent)` (the mark is tinted by `currentColor`). The Chat tile badge sits on the mark's top-right.
- The current app's tile has `aria-current="page"` and a 2px inset ring `box-shadow:inset 0 0 0 2px rgb(255 255 255 / .5)`.
- Selecting a tile closes the sheet, then navigates.
- "Back to games" is `a.game-button.secondary` to `#/collection`, full width, `margin-top:12px`.
- Note copy: "Not end-to-end encrypted. Reports go to QCC moderators."
- Opened from the shell Apps tab, the Social island Apps tab and the Chat island Apps tab, always with the trigger for `--sheet-origin`.

Desktop 1440: the same sheet, centred, 440px (existing ≥640 rule).

---

## 5. QCC Social

### 5.1 Routes

| Hash | Screen | Island tab |
| --- | --- | --- |
| `#/social` | Feed, Following | Home |
| `#/social/discover` | Feed, Discover | Home |
| `#/social/post/<id>` | Thread | (none) |
| `#/social/u/<username>` | Profile, Posts | Profile if mine |
| `#/social/u/<username>/replies` | Profile, Replies | |
| `#/social/u/<username>/photos` | Profile, Photos ⚑ (posts with media; drop the tab if the API cannot filter) | |
| `#/social/search` and `#/social/search?q=<text>&in=people\|posts` | Search | Search |
| `#/social/activity` | Activity | Activity |
| `#/social/settings` | Settings (profile, shortcuts, blocked, delete all) | Profile |

Compose, report, confirm, photo viewer and shortcut help are sheets, not routes. Unknown sub-routes show the not-found empty state.

### 5.2 Layout grid

| Width | Columns |
| --- | --- |
| < 640 | One column, full width. Posts edge to edge (`padding:12px 16px`). |
| 640–1099 | One column, `max-width:600px; margin:0 auto; border-inline:1px solid var(--line)`. |
| ≥ 1100 | Main column 600px + right rail 320px, `gap:32px`, centred (total 952px). Rail is `position:sticky; top:var(--app-top)` and holds: search field (links to the search route on Enter), "Keyboard shortcuts" panel (the list in 11.3, plus "Press ? for help"), and the safety note. No suggestions, no trends. |

The scroll container is `.social-view`. The island floats over the bottom at every width.

### 5.3 Feed (`#/social`, `#/social/discover`)

```
phone 390×844                                 desktop 1440×900 (≥1100)
┌────────────────────────────────────┐       ┌───────────────────────────────────────────────────────┐
│(◎ Social)        (Following|Discover)│       │      (◎ QCC Social)            (Following|Discover)    │
│                                    │       │      ┌──────────── 600 ──────────┐  ┌──── 320 ────┐   │
│  [ 3 new posts ]  ← pill, sticky    │       │      │(av) Write a post…   [photo]│  │ [search…  ] │   │
│ ────────────────────────────────── │       │      │────────────────────────────│  │ Shortcuts   │   │
│ (av) Name @handle · 3m         ··· │       │      │(av) Name @handle · 3m   ···│  │ j k n l r / │   │
│      Body text wraps here…         │       │      │     body…                  │  │ Safety note │   │
│      ┌────────── photo ─────────┐  │       │      │     [media]                │  └─────────────┘   │
│      └──────────────────────────┘  │       │      │     ↩ 2   ♡ 14   ⋰         │                    │
│      ↩ 2      ♡ 14      ⋰          │       │      │────────────────────────────│                    │
│ ────────────────────────────────── │       │      └────────────────────────────┘                    │
│                              (✎)   │ FAB   │                 ( island, centred 440 )   (≡)          │
│ (⌂ Home|⌕|∿|☺|∷ Apps)       (≡)   │       └───────────────────────────────────────────────────────┘
└────────────────────────────────────┘
```

- Top bar: brand group left; `.apps-segmented` (Following, Discover) in a glass group on the right. From 1100, the top bar inner width is 952px and the segmented control sits at the right end of the 600px main column (`grid-template-columns:600px 320px; gap:32px`).
- Feed list: `div[role=feed][aria-busy][aria-label="Following"]` of `article.social-post` (5.4). 20 per page; the next page loads when the last post is within 1.5 viewport heights; a "Show more posts" secondary button is always rendered after the last post as the keyboard fallback. End: `p.apps-end` "You're all caught up." (13px `--c-400`, centred, `padding:24px`).
- **New posts pill** `button.social-new-pill`: polled every 60 s while visible (⚑, SPEC sets no Social interval). If the reader is within 64px of the top, merge silently. Otherwise show the pill: `position:sticky; top:calc(var(--app-top) + 8px); margin:0 auto; z-index:5; display:flex; width:max-content; height:36px; padding:0 14px; gap:8px; border-radius:999px; background:var(--social-accent); color:var(--social-accent-ink); font:700 14px/1 var(--font-sans); box-shadow:var(--sh-lg)`, `appIcon('back')` rotated 90° (up arrow) 16px. Copy "1 new post" / "N new posts". Tap: scroll to top (instant under reduced motion), merge, focus the first new post. Scrolling to the top also merges and removes it. Never inserts above the reader automatically.
- **Compose FAB** (`< 1100`): `button.social-fab[aria-label="New post"]` with `appIcon('compose')` 24px; 56×56 circle, `background:#fff; color:#000; box-shadow:0 10px 28px -8px rgb(0 0 0 / .6)`, `position:fixed; right:max(16px, calc(env(safe-area-inset-right) + 16px)); bottom:calc(var(--tabbar-h) + var(--tabbar-gap) + env(safe-area-inset-bottom) + 16px); z-index:45`. At 390px its centre lines up with the menu circle. Hidden on thread, settings and search routes.
- **Inline composer** (`≥ 1100`, Following only): an `.apps-panel`-less row at the top of the column, `padding:12px 16px; border-bottom:1px solid var(--line)`: 44px avatar, a one-line field "Write a post" that expands into the full composer (5.6) in place on focus. No FAB at this width.

### 5.4 Post card `article.social-post`

```
grid: 44px | 1fr, gap 12, padding 12px 16px, border-bottom 1px var(--line)
(av44)  Display name  @handle · 3m                         [···]
        Replying to @sam                                  (feed only, 14 --c-400; @sam violet)
        Body text, pre-wrap, links/mentions in violet
        [media grid, margin-top 10]
        [↩ 2]      [♡ 14]      [⋰]                        (actions, margin-top 2)
```

- `article[aria-labelledby=<name id>][aria-describedby=<body id>][aria-posinset][aria-setsize=-1][tabindex=-1]` (focus target for j/k). The whole card opens the thread on click, except on links, buttons, media and selected text (check `getSelection().isCollapsed`).
- Header line: one row, `display:flex; align-items:baseline; gap:4px; min-width:0`. Name `a` 15/600 `--c-100`, ellipsis; `@handle` 15/400 `--c-400`, ellipsis, shrinks first; `·` and `time[datetime][title="<full>"]` 15 `--c-400`, no shrink. More button `apps-icon-btn` 36×36 visual (44 hit via `margin:-4px -8px -4px auto; padding:8px`), `appIcon('more')` 18px, `aria-label="More options for this post"`, `aria-haspopup="menu"`.
- Body `p.social-body`: 15/1.45, `white-space:pre-wrap; overflow-wrap:anywhere; margin:2px 0 0`. Runs of more than two blank lines collapse to two. Links: http(s) only, displayed as host + path truncated at 32 chars with "…", `rel="noopener noreferrer nofollow ugc" target="_blank"`, colour `--social-accent`, underline on hover/focus only. `@username` (pattern from accounts `^[a-zA-Z0-9_.-]{3,24}$`) links to the profile in violet. No hashtags (not in SPEC).
- Actions row `div.social-actions` (`role="group" aria-label="Post actions"`): `display:flex; justify-content:space-between; max-width:320px; margin-left:-10px`. Each `button.social-action`: `min-width:44px; height:40px; padding:0 10px; display:inline-flex; gap:6px; align-items:center; border-radius:999px; color:var(--c-400); font:13px/1 var(--font-sans); font-variant-numeric:tabular-nums`. Icon 18px. Counts hidden at 0; abbreviated `1.2k`, `12k`, `1.2m`, full number in `title`. Hover (fine pointer): reply `color:var(--social-accent); background:var(--social-accent-soft)`; like `color:var(--social-like); background:rgb(255 99 126 / .14)`; share `color:#fff; background:rgb(255 255 255 / .08)`.
  - Reply `appIcon('reply')`, `aria-label="Reply, 2 replies"`.
  - Like `appIcon('like')` / `appIcon('like-filled')`, `aria-pressed`, `aria-label="Like, 14 likes"`. Liked: filled icon and `color:var(--social-like)` on icon and count.
  - Share `appIcon('share')`, `aria-label="Share post"`: `navigator.share({url})` where available, else copy the link and show the notice "Link copied".
- Optimistic like: flip state and count at once, send the intended state (not a delta); on failure revert and show the notice "Couldn't like that. Try again." with "Try again".
- More menu (popover on fine pointers, `#social-post-menu` sheet on phone), items as 44px rows with icons: own post: "Delete post" (`trash`, danger, confirm 7.4); other's post: "Report post" (`report`), "Block @sam" (`block`, danger, confirm); both: "Copy link".
- **Media grid** `div.social-media`: `margin-top:10px; border-radius:16px; overflow:hidden; border:1px solid var(--line); display:grid; gap:2px; background:var(--line)`. Tiles are `button.social-media-tile` (opens the viewer at that index, `aria-label="Open photo 2 of 4"`) holding `img` (`thumb` variant, `loading="lazy" decoding="async" alt=""`, `width:100%; height:100%; object-fit:cover`). Missing or failed image: tile `background:var(--c-900)` with `appIcon('photo')` 24px `--c-500`.

| Photos | Container | Tiles |
| --- | --- | --- |
| 1 | `aspect-ratio` = the photo's `width/height`, clamped to 0.8 (4:5) … 1.78 (16:9); `max-height:510px` | one |
| 2 | `aspect-ratio:3/2`, `grid-template-columns:1fr 1fr` | side by side |
| 3 | `aspect-ratio:3/2`, columns `1fr 1fr`, rows `1fr 1fr`; first tile `grid-row:span 2` | big left, two stacked right |
| 4 | `aspect-ratio:3/2`, 2×2 | grid |

- **Photo viewer** `#social-photo`: full-screen dialog (`width:100vw; height:100dvh; max-width:none; max-height:none; border-radius:0; background:rgb(0 0 0 / .94)`, no glass). Full image `object-fit:contain`. Close (top-right, 44px glass circle, `aria-label="Close photo"`), previous/next 44px circles at the sides from 640 (keys ← →), counter "2 of 4" 13px `--c-300` top-centre. Swipe left/right on touch. Escape closes; focus returns to the tile.

States of a post:

| State | Rendering |
| --- | --- |
| Deleted with replies (tombstone) | Same grid; avatar slot is a 44px circle with `1.5px dashed var(--c-700)`; text "This post was deleted" 15 `--c-400`; no header, no actions. Not clickable. |
| Hidden by reports, author's view | Above the body: `div.social-flag` `display:flex; gap:8px; padding:8px 10px; border-radius:12px; background:rgb(255 185 0 / .10); color:var(--c-amber); font:600 13px/1.4`, `appIcon('alert')` 16px: "Hidden while reviewed. Only you can see this post." |
| Hidden or unavailable, other viewers | Thread placeholder like the tombstone: "This post is unavailable". Never says why. |
| Sending (own new post) | Inserted at the top at `opacity:.6` with time "Sending…"; actions disabled. On failure, the post is removed and its text goes back into the composer with the notice. |

### 5.5 Thread (`#/social/post/<id>`)

```
phone                                        
┌────────────────────────────────────┐       
│(←)                                 │  back to feed (or history parent)
│ Post                               │  h1.apps-title-sm 20/700
│ (av) parent · 2h                   │  ancestors (≤20), compact post cards
│  │   parent body                   │  2px connector line var(--line-strong)
│ (av) Focused Name                  │  focused post
│      @handle                       │
│      Larger 17px body…             │
│      [media]                       │
│      4:12 pm · 3 Nov 2026          │  14 --c-400
│      ──────────────────────        │
│      2 replies  14 likes           │  14, numbers 600 --c-100
│      ──────────────────────        │
│      ↩      ♡      ⋰               │
│ (av) [ Write a reply            ]  │  reply prompt
│ ────────────────────────────────── │
│ (av) reply … (post cards)          │
│      [ Show more replies ]         │
└────────────────────────────────────┘
```

- Page heading: `h1.apps-title-sm` "Post" (20/1.3/700, `padding:4px 16px 8px`), focus target on route entry.
- Ancestors: post cards with `padding-bottom:0` and a connector: `::before` on the avatar column, `left:37px` (16 + 22 − 1), `top:60px; bottom:-4px; width:2px; background:var(--line-strong); border-radius:1px`, running from below the avatar to the next avatar. A tombstoned ancestor keeps the line.
- Focused post: header is two lines (name 16/700, then `@handle`), no "Replying to" line, body 17/1.45, full timestamp `time` 14 `--c-400` (en-NZ, e.g. "4:12 pm · 3 Nov 2026"), counts row between two hairlines (`padding:12px 0`), actions row with 44px buttons spread across. `tabindex=-1`, `scroll-margin-top:var(--app-top)`; the view scrolls it into place on load.
- Reply prompt row: 32px avatar + `button.social-reply-prompt` styled as a field (`min-height:44px; border-radius:22px; padding:0 16px; background:rgb(255 255 255 / .06); color:var(--c-400); text-align:left`) "Write a reply". Phone (<640): opens the compose sheet in reply mode. From 640: expands in place into the composer (5.6) with "Reply" as the submit label.
- Replies: direct replies, paged 20, "Show more replies" secondary button. Each reply is a normal post card without the "Replying to" line.

### 5.6 Composer (sheet `#social-compose`, or inline)

```
┌──────────────────────────────────────┐
│ New post                         (×) │  h2; "Reply to @sam" in reply mode
│ (av32) Sam: "parent text clamp 2…"   │  reply mode only, 14 --c-400
│ ┌──────────────────────────────────┐ │
│ │ Write a post                     │ │  textarea 17/1.4, min 120, auto-grow ≤ 40dvh
│ └──────────────────────────────────┘ │
│ [thumb][thumb][thumb]                │  72×72, radius 12, gap 8 (section 10)
│ ──────────────────────────────────── │
│ (▣ photo)              14 (◔)  [Publish] │
│ 14 characters left                   │  helper / reason line, 13px
└──────────────────────────────────────┘
```

- Textarea: no border, `background:transparent`, `color:#fff`, placeholder `color:var(--c-400)` ("Write a post" / "Write a reply"), `resize:none`, `aria-label="Post text"`, `aria-describedby` = helper line id. Counting is Unicode code points (`codePoints()` from `src/social/shared.ts`).
- Footer row `display:flex; align-items:center; gap:12px; padding-top:12px; border-top:1px solid rgb(255 255 255 / .1)`.
  - Photo button `apps-icon-btn` with `appIcon('photo')`, `aria-label="Add photos"`, opens `input[type=file][accept="image/*"][multiple]`. Hidden when media is not configured (`SocialMe.media === false` or a 503 `media_not_configured`) or 4 photos are attached.
  - **Ring** `svg.social-ring` 24×24, `viewBox="0 0 24 24"`, `role="presentation"`: track `circle r=10 fill=none stroke=var(--c-700) stroke-width=2.5`; progress `circle r=10 stroke-width=2.5 stroke-linecap=round transform="rotate(-90 12 12)" stroke-dasharray=62.83 stroke-dashoffset=62.83*(1 - min(n/280,1))`. Colour: `--social-accent` up to 260; `--social-warn` 261–280; `--social-danger` above 280 (full ring). Hidden when the text is empty.
  - **Count** `span.social-count` 13/1 `--font-mono`, tabular, `min-width:3ch; text-align:right`: shown only from 261 (remaining "19" … "0") and over the limit ("-12", `--social-danger`, 700).
  - Publish `.ui-btn.primary` pill, label **"Publish"** (reply mode **"Reply"**). Disabled when: empty with no photos; over 280; a photo is not Ready; already sending (then the label is "Publishing…").
- Helper line `p.social-helper` 13/1.4 `--c-400`, `min-height:18px`, `aria-live="polite"`, updated at most once a second: "N characters left" (261–280), "Too long by N characters" (`--social-danger`), "Wait for photos to finish uploading", "Write something or add a photo" (only after a Publish attempt). Empty otherwise. One message at a time, in this order: too long, waiting for photos, characters left, the after-attempt hint. The numeric count beside the ring stays visible whatever the helper says.
- Closing with text or photos: confirm sheet "Discard this post?" with "Keep editing" (secondary) and "Discard" (danger). The draft is kept in memory per mode (new post, or reply keyed by parent id) until published or discarded; never persisted to storage.
- Success: close the sheet, insert the post at the top of Following (or as the first reply), move focus to it, announce "Post published." in the shell `#announcer`.

### 5.7 Profile (`#/social/u/<username>`)

```
phone 390                                        
┌────────────────────────────────────┐   banner full-bleed, 3:1 (130px at 390), max 200
│(←)                              [set]│   top bar floats over the banner; [set] = settings, own profile only
│▓▓▓▓▓▓▓▓▓▓▓▓ banner ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ (avatar 80)            [Follow] (···)│   avatar overlaps banner by 40, 4px ring var(--c-bg)
│ Display Name                       │   22/1.2/800
│ @sam  [Follows you]                │   15 --c-400; chip
│ Bio text up to 160 chars…          │   15/1.45
│ Member since March 2026            │   14 --c-400, no icon
│ 12 following   30 followers        │   numbers 600 --c-100, words --c-400
│ ┌ Posts ┬ Replies ┬ Photos ┐       │   sticky underline tabs
│ post cards…                        │
└────────────────────────────────────┘
```

- Banner `div.social-banner`: `aspect-ratio:3/1; max-height:200px; background:linear-gradient(135deg, var(--social-accent-soft), transparent 70%), var(--c-900)` when empty; `img` cover when set. From 640 it sits inside the 600px column with `border-radius:0` (column edges carry the line).
- Head block `padding:0 16px 12px`. Avatar 80 (96 from 640), `margin-top:-40px` (−48), `box-shadow:0 0 0 4px var(--c-bg)`.
- Actions (right of the avatar row, `align-self:end`): own profile "Edit profile" secondary (to settings); others: "Follow" primary / "Following" secondary (`aria-pressed`); tapping "Following" unfollows at once (no hover-label swap). More (`apps-icon-btn`, `aria-label="More options for @sam"`): "Copy profile link", "Block @sam" (danger, confirm).
- "Follows you" chip: `.ui-chip` look but `font:600 11px/1.4 var(--font-sans); text-transform:none; letter-spacing:0; color:var(--c-300); background:var(--c-900)`.
- Member since: `Intl.DateTimeFormat('en-NZ',{month:'long',year:'numeric'})` → "Member since March 2026".
- Counts: plain text, not links (no follower lists in SPEC).
- Tabs (3.5): Posts, Replies, Photos ⚑. Photos tab shows a 3-column grid of photo tiles (`aspect-ratio:1; gap:2px`) linking to their posts.
- Blocked by me: replace bio, counts and tabs with an `.apps-empty`: "You blocked @sam" / "You won't see each other's posts. Unblocking doesn't restore follows." / button "Unblock". Blocked by them, or the account doesn't exist: "This account is unavailable" (identical for both cases).
- Own profile top bar shows a settings button (`appIcon('settings')`, `aria-label="Social settings"`) in a right-hand glass group.

### 5.8 Search (`#/social/search`)

- Field row (sticky, `top:var(--app-top)`, `padding:8px 16px; background:rgb(0 0 0 / .86); backdrop-filter:blur(12px)`): `input[type=search]` `height:44px; border-radius:999px; padding:0 44px 0 42px; background:rgb(255 255 255 / .08); border:1px solid transparent; font:16px/1 var(--font-sans); color:#fff`, `appIcon('search')` 18px at `left:14px`, clear button 44px at the right when not empty (`aria-label="Clear search"`). Placeholder "Search people and posts". `aria-controls` the results.
- Under it, `.apps-segmented` (plain, no glass): "People" | "Posts". Default People; the choice is in the hash (`in=`).
- Debounce 300 ms; people from 1 character, posts from 2. Update the hash with `history.replaceState`.
- People rows: 40px avatar, name 15/600, `@handle` 14 `--c-400`, optional "Follows you" chip; whole row links to the profile; a "Follow"/"Following" small pill at the right (separate tab stop).
- Posts: normal post cards.
- A visually hidden `role=status` announces "8 people found" / "No posts match “zz”".
- `/` focuses the field from anywhere in Social (11.3).

### 5.9 Activity (`#/social/activity`)

- `h1` "Activity". List `ul.social-activity` of rows `li > a` (row is one link): `display:grid; grid-template-columns:24px 32px 1fr auto; gap:12px; align-items:start; padding:12px 16px; border-bottom:1px solid var(--line)`.
  - Kind icon 20px: like `like-filled` `--social-like`; reply `reply` `--social-accent`; follow `profile` `--social-accent` (fill twin).
  - Avatar 32.
  - Text 15/1.4: "**Sam** liked your post", "**Sam** replied", "**Sam** followed you"; then the snippet (post text or reply text) 14/1.4 `--c-400`, 2-line clamp, in quotes for likes ("“first day back…”").
  - Time 14 `--c-400`.
  - Target: like → the liked post; reply → the reply's thread; follow → the follower's profile.
- Last 50 items, newest first, no paging.

### 5.10 Settings (`#/social/settings`)

Back button to own profile; `h1` "Settings". Sections are `.apps-panel` blocks with `h2` above each (`margin:24px 16px 8px`; panels `margin:0 16px`; from 640 inside the 600 column).

1. **Profile**: avatar (80px preview + "Change photo" / "Remove" small secondary), banner (3:1 preview + "Change banner" / "Remove"), "Display name" input (≤40, counter "12/40" right-aligned 13px), "Bio" textarea (≤160, counter), Save primary pill (disabled until changed; "Saved" notice on success). Fields use the sheet field look on a panel: `min-height:44px; padding:10px 12px; border-radius:12px; background:rgb(255 255 255 / .06); border:1px solid transparent; font:16px/1.3 var(--font-sans)`. Photo controls hide when media is not configured; the note "Photos are unavailable right now." replaces them.
2. **Keyboard**: switch row "Single-key shortcuts" (default on; stored per device under `social:shortcuts` with `store.write`), and "Show shortcuts" link button opening `#social-shortcuts`.
3. **Blocked accounts**: rows (32px avatar, `@handle`, "Unblock" small secondary). Empty: "You haven't blocked anyone." Unblock asks nothing and shows the notice "Unblocked @sam. Follows aren't restored."
4. **Your data**: text "Delete everything you've posted or sent in QCC Social and QCC Chat." and the danger button "Delete all my Social and Chat data" → confirm (7.4).
5. Footer note 13px `--c-400`: "Reported posts and messages are reviewed by QCC moderators. Messages in Chat are not end-to-end encrypted."

---

## 6. QCC Chat

### 6.1 Routes

| Hash | Screen | Island |
| --- | --- | --- |
| `#/chat` | Chat list with requests | Chats |
| `#/chat/add` | Add friend | Add friend |
| `#/chat/with/<username>` | Conversation | hidden on phone; visible from 960 |

Snap viewer, send-photo, chat info, report, confirm and message menu are sheets. The snap viewer is never a route (a back button must not reopen a view-once photo).

### 6.2 Layout grid

| Width | Layout |
| --- | --- |
| < 960 | One screen at a time. List and add-friend are a single column (`max-width:600px` from 640). The conversation takes the whole view; the island is hidden (`data-hidden="true"`, as Movies' Up next does) and the composer docks to the bottom safe area. |
| ≥ 960 | Two panes in one panel: `max-width:1080px; margin:0 auto; display:grid; grid-template-columns:360px 1fr; height:calc(100dvh - var(--app-top) - var(--app-bottom) - 8px); border:1px solid var(--line); border-radius:var(--r-3xl); overflow:hidden; background:var(--app-panel)`. Left: the list (own scroll). Right: the conversation (own scroll, composer at the pane's bottom, above the island), or an empty pane "Pick a chat" with the chat tile mark. `#/chat/add` shows the form in the right pane. The island stays visible. |

### 6.3 Chat list (`#/chat`)

```
phone 390×844
┌────────────────────────────────────┐
│([chat] Chat)                        │
│ Chats                              │  h1
│ Friend requests · 2                │  h2 15/700 --c-300, only when incoming > 0
│ (av) Aroha  @aroha    [Accept][Decline]│
│ ────────────────────────────────── │
│ (av) Sam                     ● 3  │  name 16/700; badge
│      ◆ New photo · 2m              │  glyph 16 + status 14
│ (av) Mere                          │
│      ● New message · 5m            │
│ (av) Tama                          │
│      ◌ Sent · 1h                   │
│ (av) Ana                           │
│      ✓ Opened · 3h                 │
│ (av) Rangi                         │
│      ◉ Received · Mon              │
│ (av) Kiri                          │
│      [req] Request sent            │
│ Friends only. Not end-to-end       │  footer note 13 --c-400
│ encrypted. Reported messages can   │
│ be read by QCC moderators.         │
│ ([chat] Chats|[add+] Add|∷ Apps) (≡)│
└────────────────────────────────────┘
```

- `h1` "Chats" (`padding:4px 16px 12px`).
- **Requests** (incoming, only when any): `h2` "Friend requests · N" then rows: 48px avatar, name 16/600 + `@handle` 14 `--c-400`, then "Accept" (primary small) and "Decline" (secondary small) on the right; a more button (`aria-label="More options for @aroha"`) with "Block @aroha". On phone at <360px the two buttons move under the name.
- **Friends** `ul.chat-list`: each `li > a.chat-row[href="#/chat/with/<username>"]`: `display:grid; grid-template-columns:48px 1fr auto; gap:12px; align-items:center; min-height:72px; padding:12px 16px; border-bottom:1px solid var(--line)`.
  - Name 16/1.25/600 `--c-200`, ellipsis; **700 `--c-100` when unread**.
  - Status line `div.chat-status`: `display:flex; gap:6px; align-items:center; font-size:14px; color:var(--c-400)`; glyph 16px (section 8); status words; then ` · 2m`. For "New message" and "New photo" the words take the glyph colour and weight 600.
  - Right: unread count `span.chat-unread` (`min-width:22px; height:22px; padding:0 6px; border-radius:999px; background:var(--chat-accent); color:var(--chat-accent-ink); font:700 12px/22px var(--font-sans); text-align:center`), hidden at 0.
  - Accessible name of the row (the `a`): "Sam, New photo, 2 minutes ago, 3 unread". Glyphs are `aria-hidden`.
  - Order ⚑: unread first, then most recent activity; if the server already returns this order, keep it.
- **Sent requests** (outgoing) appear at the end of the list as rows with `status-request` and "Request sent" (not links; no unread).
- Footer note `p.chat-note` (13/1.5 `--c-400`, `padding:20px 16px`, `appIcon('lock')` 14px inline): "Friends only. Not end-to-end encrypted. Reported messages can be read by QCC moderators."
- Polling 15 s while visible (SPEC). Rows update in place (no re-render of the whole list, so focus stays).

### 6.4 Add friend (`#/chat/add`)

- `h1` "Add a friend". `p` 15/1.5 `--c-400`: "Type their exact QCC username. They'll get a request and can accept or decline."
- Form: label "Username" (13/600 `--c-300`), field with a fixed "@" prefix inside (`padding-left:30px`), `autocapitalize="none" autocomplete="off" spellcheck="false" inputmode="text"`, pattern `^[a-zA-Z0-9_.-]{3,24}$`, `maxlength=24`; "Send request" primary pill (full width on phone, auto from 640).
- After sending (same reply whatever happened on the server): notice `role=status` "Request sent. If @sam accepts, they'll appear in your chats." and the field clears.
- Invalid input: helper under the field "Usernames are 3–24 letters, numbers, dots, dashes or underscores." (`--c-red`).
- Note (13 `--c-400`, `margin-top:24px`): "There's no friend search or suggestions, so only people who know your username can send you a request."

### 6.5 Conversation (`#/chat/with/<username>`)

```
phone 390×844 (island hidden)
┌────────────────────────────────────┐
│(←) ( (av28) Sam            ) (ⓘ)   │  top bar: back · name button · info
│   [timer] Messages disappear 24    │  first item: system notice card
│        hours after they're viewed. │
│        Not end-to-end encrypted.   │
│              TODAY                 │  date separator
│ (av20) Sam · 4:02 pm               │  group label, teal name
│        Kia ora! Are you doing the  │  message
│        quiz later?                 │
│        I saved the answers [pin] Saved│  saved message (teal tint)
│ (av20) You · 4:05 pm               │  --c-300
│        Yes, after tea              │
│        ◇ Photo · Opened            │  my snap, opened
│   [timer] You set messages to      │  system line
│        disappear 7 days after sending.│
│ (av20) Sam · 4:10 pm               │
│        ┌──────────────────────┐    │  incoming snap tile (amber)
│        │ ◆ Photo · Tap to view│    │
│        │   View once          │    │
│        └──────────────────────┘    │
│                    ✓ Opened        │  receipt under my last message
│ ────────────────────────────────── │
│ (cam) [ Message Sam           ] (send)│  composer, safe-area bottom
└────────────────────────────────────┘
```

- Top bar: back group (`aria-label="Back to chats"`), a centre glass group `button.chat-peer` (28px avatar + name 15/600, ellipsis, `max-width:calc(100vw - 160px)`, opens chat info, `aria-label="Chat info for Sam"`), and an info button (`appIcon('info')`, `aria-label="Chat info"`). On desktop the same three controls form the pane header (`height:60px; padding:0 12px; border-bottom:1px solid var(--line)`) instead of the top bar.
- Messages container `div.chat-log[role=log][aria-label="Messages with Sam"][aria-live=polite][aria-relevant=additions]`, `padding:12px 16px` and bottom padding equal to the composer's height. Append new nodes only; never rebuild existing ones (keeps the live region quiet and focus stable).
- **Retention notice** (first item, always): `div.chat-system.chat-intro` centred, `max-width:300px; margin:8px auto 16px; padding:10px 14px; border-radius:16px; background:var(--c-900); font:13px/1.45 var(--font-sans); color:var(--c-400)`, `appIcon('timer')` 14px. Text follows the mode: "Messages disappear 24 hours after they're viewed. Not end-to-end encrypted." or "Messages disappear 7 days after they're sent. Not end-to-end encrypted."
- **Date separator** `div.chat-day[role=separator]`: "Today", "Yesterday", then "Mon 2 Nov" (en-NZ weekday short + day + month short), `font:700 11px/1 var(--font-sans); letter-spacing:.08em; text-transform:uppercase; color:var(--c-400); text-align:center; margin:20px 0 8px`.
- **Groups** (consecutive messages from one sender, no more than 10 minutes apart, not split by a system line or day): `section.chat-group` `margin-top:14px`.
  - Label row `div.chat-group-head` `display:flex; gap:8px; align-items:center; height:20px`: 20px avatar, name `font:700 13px/1 var(--font-sans)`, friend `color:var(--chat-text)` (display name), you `color:var(--chat-me)` ("You"), then ` · 4:02 pm` 13/400 `--c-400`.
  - Messages indented `padding-left:28px` (aligned with the name). No side bubbles, no coloured side bars.
- **Text message** `div.chat-msg` `position:relative; margin:2px 0 2px -10px; padding:6px 10px; border-radius:12px; font:15px/1.45 var(--font-sans); color:var(--c-100); white-space:pre-wrap; overflow-wrap:anywhere`. Links as in Social, in teal.
  - Hover (fine pointer) / `:focus-within`: `background:rgb(255 255 255 / .04)` and the options button appears (`button.chat-msg-more`, 32×32 visual, 44 hit, `position:absolute; right:-6px; top:-6px`, `appIcon('more')` 16px, `aria-label="Message options"`). On coarse pointers the button is not shown; tapping the message opens the menu.
  - **Saved**: `background:var(--chat-saved-bg); box-shadow:inset 0 0 0 1px var(--chat-saved-edge)`, and a trailing `span.chat-saved` (`appIcon('saved')` 14px + "Saved" 12/600, teal, `margin-left:6px`, nowrap). The word "Saved" is real text, so it is announced.
  - Press and hold 500 ms on a text message toggles Save (SPEC). Movement over 8px cancels the hold. Snaps cannot be saved.
  - Menu (`#chat-message-menu` sheet on phone, popover on fine pointers), 44px rows: "Save in chat" / "Unsave" (`save`/`saved`; text messages only), "Copy text", "Unsend" (mine, `trash`, danger, no confirm; shows the notice "Message unsent." with no undo), "Report message" (theirs, `report`, opens 7.3).
- **Snap items** `button.chat-snap` (incoming unopened) or `div.chat-snap` (others): `display:inline-flex; gap:10px; align-items:center; min-height:52px; padding:10px 14px; border-radius:16px; font:600 15px/1.2 var(--font-sans)`.
  - Incoming, unopened: `border:1.5px solid var(--chat-snap); background:rgb(255 185 0 / .08); color:#fff`; `status-snap-new` 20px amber; "Photo · Tap to view", second line "View once" 12/400 `--c-400`. `aria-label="Photo from Sam. View once. Opens now and is deleted after you close it."`
  - Incoming, opened: `status-snap-received` 18px, "Photo opened" 14/400 `--c-400`, no border.
  - Mine, unopened: `status-snap-sent` 18px amber, "Photo · Sent". Mine, opened: `status-snap-opened`, "Photo · Opened".
- **System line** `div.chat-system` (retention changes): centred, `appIcon('timer')` 14 + text 13/1.45 `--c-400`, `margin:14px auto`. Copy in 7.2.
- **Receipt** under your last message, right-aligned in the group: glyph 14px + "Sent" / "Opened" 12px `--c-400`. Only on the last of your messages.
- **Jump pill**: when a message arrives and the reader is more than 120px from the bottom: `button.chat-jump` "New message" with `appIcon('back')` rotated −90° (down), same geometry as the Social pill but `background:var(--chat-accent); color:var(--chat-accent-ink)`, `position:sticky; bottom:12px`, centred. Tap scrolls to the bottom.
- Opening the conversation scrolls to the newest message (or the first unread, if any, with the separator "New" in teal above it) and marks incoming messages viewed.
- Polling 4 s while open and visible (SPEC).

**Composer** `form.chat-composer`: phone `position:fixed; left:0; right:0; bottom:0; padding:8px 12px calc(8px + env(safe-area-inset-bottom)); background:rgb(0 0 0 / .86); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px); border-top:1px solid var(--line)`; desktop: in the pane, `position:sticky; bottom:0`, same look.
- Row `display:flex; gap:8px; align-items:flex-end`:
  - Camera `button.chat-camera` 44×44 circle `background:rgb(255 255 255 / .10)`, `appIcon('camera')` 20px, `aria-label="Send a photo"`; opens `input[type=file][accept="image/*"]` (no `capture`, so phones offer camera or library). Hidden when media is not configured.
  - `textarea` 1–5 rows, `min-height:44px; padding:11px 16px; border-radius:22px; background:rgb(255 255 255 / .08); border:1px solid transparent; font:16px/1.4 var(--font-sans); color:#fff`, placeholder "Message Sam", `aria-label="Message to Sam"`, `maxlength` none (count in JS).
  - Send `button.chat-send` 44×44 circle, `background:var(--chat-accent); color:var(--chat-accent-ink)`, `appIcon('send')` 20px, `aria-label="Send message"`. Disabled when empty, over 1000, or sending: `background:rgb(255 255 255 / .10); color:var(--c-500)`.
- Enter sends on fine pointers; Shift+Enter inserts a newline. On coarse pointers Enter inserts a newline (send button only). Ignore Enter while composing (IME).
- From 900 characters show `span.chat-count` "87 left" (12px, over 1000 "-12" in `--c-red`) above the right end of the field.
- Can't send (blocked, friendship gone, 403): composer replaced by `p.chat-closed` 14 `--c-400` centred: "You can't send messages in this chat."

### 6.6 Send-photo sheet `#chat-send-photo`

After picking a file: `h2` "Send a photo to Sam"; preview `img` `max-height:52dvh; width:100%; object-fit:contain; border-radius:16px; background:#000`; upload stage row (section 10); note 13px: "Sam can open it once. It's deleted after they close it, or after 30 days if it's never opened. Screenshots can't be blocked on the web."; buttons "Send photo" (primary pill, enabled when Ready) and "Cancel" (secondary; aborts the upload and removes it).

### 6.7 Snap viewer `#chat-snap`

Full-screen dialog: `width:100vw; height:100dvh; max-width:none; max-height:none; margin:0; padding:0; border:0; border-radius:0; background:#000`, no glass, no backdrop blur.

```
┌────────────────────────────────────┐
│ (av28) Sam · 2m           8s (×)  │  top overlay: gradient #000a→transparent, 88px
│                                    │
│          [ photo, contain ]        │
│                                    │
│ This photo is deleted when you     │  bottom note 12/1.4 --c-300, gradient
│ close it. Screenshots can't be     │
│ blocked on the web.                │
└────────────────────────────────────┘
```

- Opening: tapping the snap tile is the confirmation (the tile says "Tap to view"). The dialog opens with "Opening photo…" (15px `--c-300`, centred, `role=status`), then calls `open_snap`. The timer starts only when the image has decoded.
- **Countdown**: ⚑ `SNAP_VIEW_SECONDS = 10` (a UI constant in the Chat view module, not in `shared.ts`). The countdown is drawn as a ring around the close button, not as a separate pie: `button.chat-snap-close` 44×44 circle `background:rgb(255 255 255 / .14)` with `appIcon('close')` 20px, wrapped by `svg.chat-snap-ring` 52×52 (`viewBox="0 0 52 52"`): track `circle r=24 stroke=rgb(255 255 255 / .22) stroke-width=2.5`, progress `circle r=24 stroke=#fff stroke-width=2.5 stroke-linecap=round` rotated −90°, `stroke-dasharray=150.8`, offset from 0 to 150.8 over the view time. Beside it, the seconds "8s" (13/1 `--font-mono`, `#fff`, `aria-hidden`); a visually hidden `role=status` says "10 seconds" at the start and "3 seconds left" once.
- Closing: tap anywhere on the photo, the close button, Escape, or the timer reaching 0. Then the image `src` is revoked (`URL.revokeObjectURL`), the element removed, the row and thread item switch to opened, and focus returns to the thread item (now "Photo opened").
- `pause()` (tab hidden, Study, pagehide) closes the viewer: the photo is gone, as if closed.
- `img` has `alt="Photo from Sam"`, `draggable="false"`, `-webkit-touch-callout:none; user-select:none` (discourages casual saving; never claimed as protection).
- Failure (expired, already opened, network): "This photo can't be opened. It may have expired." and a "Close" secondary pill. The item becomes "Photo opened" if the server says it was opened, else stays as it was.

### 6.8 Chat info sheet `#chat-info`

```
┌──────────────────────────────────────┐
│ (av56) Sam                       (×) │  h2 = display name; @handle 15 muted
│        @sam                          │
│ Messages disappear                   │  .search-label style heading
│ ┌──────────────────────────────────┐ │  .setting-list as a radiogroup
│ │ 24 hours after viewing        ✓  │ │
│ │ 7 days after sending             │ │
│ └──────────────────────────────────┘ │
│ Either of you can change this. A note│  .muted 13
│ appears in the chat. Unopened        │
│ messages and photos are deleted after│
│ 30 days. Saved messages stay up to   │
│ 90 days.                             │
│ [lock] Not end-to-end encrypted. QCC │  .menu-note
│ moderators can read messages that    │
│ are reported.                        │
│ [ Report a message              ]    │  .game-button.secondary
│ [ Block Sam                     ]    │  danger
│ [ Delete conversation           ]    │  danger
└──────────────────────────────────────┘
```

- Retention: `div.setting-list[role=radiogroup][aria-label="Messages disappear"]` with two `label` rows, each a visually hidden `input[type=radio]` and a trailing `appIcon('check')` 20px in teal shown on the checked row; the row text 17px. Changing it saves at once; on failure revert and show the notice.
- "Report a message" opens 7.3 in message mode, listing the friend's last 10 messages still on the server as radio options (newest first, 2-line clamp each). With none: "There are no messages from Sam to report. You can still block them."
- "Block Sam" and "Delete conversation" go through the confirm sheet (7.4).

---

## 7. States, flows and copy

### 7.1 States every screen handles

| State | Rendering | Copy |
| --- | --- | --- |
| Signed out (Social) | `.apps-empty` with the 64px `social-tile`, primary "Log in / Sign up" (opens the existing `accounts-dialog`), link "Back to games" | **QCC Social** / "Short posts from other QCC players. Follow people, reply and like. Log in to see the feed." |
| Signed out (Chat) | same with `chat-tile` | **QCC Chat** / "Message friends one to one. You both have to accept before you can chat, and messages disappear after they're viewed. Log in to start." |
| Route loading (shell, lazy import) | existing `.loading` block | "Opening Social…" / "Opening Chat…" + "Back to games" |
| Route import failed (shell) | existing `.game-error` | "Social couldn't open. Check your connection and try again." / Chat likewise |
| First load | skeletons (3.10) | sr: "Loading posts…", "Loading chats…", "Loading messages…" |
| Load failed | `.apps-empty` with `alert` icon and "Try again" secondary | "Couldn't load this." / "Check your connection and try again." |
| Offline (`navigator.onLine === false`) | notice under the top bar, keeps any content already shown | "You're offline. New posts and messages will load when you're back online." |
| Service down (502/503 other than media) | load-failed layout | "Social is unavailable right now. Try again soon." / "Chat is unavailable right now. Try again soon." |
| Media not configured (503 `media_not_configured`, or `SocialMe.media === false`) | hide every photo, camera, avatar and banner upload control; text keeps working; no message except in settings | settings: "Photos are unavailable right now." |
| Rate limited (429, `Retry-After` honoured) | inline notice next to the control; the control stays enabled after the wait | table 7.2 |
| Storage full (507) | inline notice | "Photo storage is full right now. Try again later." |
| Not found | `.apps-empty` | "This page doesn't exist." / "Back to feed" or "Back to chats" |

Empty states:

| Where | Title | Text | Action |
| --- | --- | --- | --- |
| Following, follows nobody | Your feed is empty | Follow people to see their posts here. Discover shows everyone's posts. | "Go to Discover" |
| Following, follows people but no posts | Nothing new yet | Posts from people you follow will show up here. | — |
| Discover, no posts | No posts yet | Be the first to post something. | "New post" |
| Profile, Posts | No posts yet | — | — |
| Profile, Replies | No replies yet | — | — |
| Profile, Photos | No photos yet | — | — |
| Search, before typing | Search QCC Social | Find people by username, or posts by the words in them. | — |
| Search, no results | Nothing found | No people match “zz”. / No posts match “zz”. | "Clear search" |
| Activity | Nothing here yet | Likes, replies and new followers will show up here. | — |
| Thread, no replies | — (inline 14 `--c-400`: "No replies yet.") | | |
| Chat list, no friends | No chats yet | Add a friend by their exact username. They need to accept before you can chat. | "Add a friend" |
| Conversation, no messages | — (intro notice only, plus 14 `--c-400`: "Say kia ora to Sam.") | | |
| Desktop right pane, nothing open | Pick a chat | Your messages with friends open here. | — |

### 7.2 Copy reference

| Key | Text |
| --- | --- |
| Rate limit: post | "You've posted a lot this hour. Try again in N min." |
| Rate limit: like | "That's a lot of likes. Try again in N min." |
| Rate limit: follow | "You've followed a lot of people today. Try again tomorrow." |
| Rate limit: message (minute) | "You're sending messages quickly. Wait a moment, then try again." |
| Rate limit: message (day) | "You've sent a lot of messages today. Try again tomorrow." |
| Rate limit: friend request | "You've sent a lot of friend requests today. Try again tomorrow." |
| Rate limit: report | "You've sent a lot of reports today. Try again tomorrow." |
| Rate limit: upload | "You've added a lot of photos today. Try again tomorrow." |
| Like failed | "Couldn't like that. Try again." |
| Follow failed | "Couldn't follow @sam. Try again." |
| Post failed | "Couldn't publish. Your post is still here, so you can try again." |
| Message failed | "Not sent. Tap to try again." (on the message, 12px `--c-red`, the message at `opacity:.6`) |
| Link copied | "Link copied" |
| Post published (sr) | "Post published." |
| Post deleted | "Post deleted." |
| Unblocked | "Unblocked @sam. Follows aren't restored." |
| Blocked | "Blocked @sam." |
| Message unsent | "Message unsent." |
| Saved / unsaved (sr) | "Saved in chat." / "Removed from saved." |
| Retention changed by you | "You set messages to disappear 7 days after sending." / "You set messages to disappear 24 hours after viewing." |
| Retention changed by friend | "Sam set messages to disappear 7 days after sending." / "…24 hours after viewing." |
| Friend accepted (row status) | "You're now friends" (system-style status line until the first message) |
| Request incoming (row) | "Wants to be friends" |
| Request outgoing (row) | "Request sent" |
| Snap privacy note | "Screenshots can't be blocked on the web." |

### 7.3 Report sheet `#apps-report`

`h2` "Report post" / "Report message". In message mode, first a radio list of messages (6.8). Then:

- `p.muted`: post: "Tell us what's wrong. QCC moderators will look at it." Message: "A copy of this message goes to QCC moderators, even after it disappears."
- Categories, a `.setting-list[role=radiogroup]` of 44px rows (value → label): `spam` "Spam" · `harassment` "Harassment or bullying" · `hate` "Hate" · `sexual` "Sexual content" · `self-harm` "Self-harm" · `private-info` "Private information" · `other` "Something else".
- Choosing **Self-harm** shows a help card above the submit button (`.apps-panel` with `background:rgb(255 255 255 / .07)`, 15/1.5): "If you or someone else isn't safe right now, call 111. You can talk to someone any time: call or text 1737, or call Youthline on 0800 376 633." ⚑ Check these numbers before release.
- Note: `textarea` label "Anything else? (optional)", ≤500 with counter.
- Submit "Send report" (`.game-button`, disabled until a category is chosen). Then the sheet shows "Thanks. QCC moderators will review this." with "Block @sam too" (danger secondary) and "Done".

### 7.4 Confirm sheet `#apps-confirm`

Title, one paragraph, then a button row: "Cancel" (`.game-button.secondary`) first, the action (`.game-button.secondary.apps-danger`) last, side by side (`display:grid; grid-template-columns:1fr 1fr; gap:10px`). Initial focus on Cancel.

| Action | Title | Text | Button |
| --- | --- | --- | --- |
| Delete post | Delete this post? | If it has replies, it shows as "This post was deleted" so the thread still makes sense. | Delete |
| Block (Social or Chat) | Block @sam? | You won't see each other's posts or profiles, follows between you are removed, and you'll stop being friends in Chat. They won't be told. | Block |
| Delete conversation | Delete this conversation? | This removes every message and unopened photo for you and Sam. It can't be undone. | Delete |
| Discard post | Discard this post? | — | Discard (and "Keep editing") |
| Delete all data | Delete all your Social and Chat data? | This removes your profile, posts, likes, follows, blocks, friends, chats and photos. Posts with replies show as "This post was deleted". Reports you've made stay with moderators, without your name. Your QCC account and game progress stay. | Delete everything |

Delete all data adds a field before the buttons: label "Type your username to confirm", the button enabled only when it matches (case-insensitive). On success the view shows the Social signed-in empty profile state and the notice "Your Social and Chat data has been deleted."

---

## 8. Chat status glyphs (original system)

Two rules, each readable without colour:

- **Shape = what it is.** Circle = text message. Diamond = photo (view-once). Person = friend request. System lines use the timer.
- **Treatment = where it is.** Broken outline (four gaps) = sent, not seen yet. Ring with a check = opened by your friend. Solid = new for you. Ring with a centre dot = you've seen it.

Colour is the third cue: text glyphs `--chat-text` (teal), photo glyphs `--chat-snap` (amber), request `--chat-pending` (grey). Status words always sit beside the glyph. The colour-blind setting (`colorBlind`) needs nothing extra because shape and words already carry the meaning.

This deliberately differs from the reference app: there, direction is an arrow-versus-square shape, opened is an outline of that shape, and the hue encodes the media type in red, purple and blue. Here direction is the outline treatment, the shapes encode the kind, the hues are teal and amber, and there are no arrows or squares.

| `LastMessage` (kind, mine, viewed) | Glyph (`appIcon`) | Words in the list | Colour of words |
| --- | --- | --- | --- |
| text, mine, not viewed | `status-text-sent` (broken circle) | Sent | `--c-400` |
| text, mine, viewed | `status-text-opened` (= `status-opened`) | Opened | `--c-400` |
| text, theirs, not viewed | `status-text-new` (solid circle) | New message (2+: "N new messages") | teal, 600 |
| text, theirs, viewed | `status-text-received` (ring + dot) | Received | `--c-400` |
| snap, mine, not opened | `status-snap-sent` (broken diamond) | Photo sent | `--c-400` |
| snap, mine, opened | `status-snap-opened` | Photo opened | `--c-400` |
| snap, theirs, not opened | `status-snap-new` (solid diamond) | New photo | amber, 600 |
| snap, theirs, opened | `status-snap-received` | Photo viewed | `--c-400` |
| system | `timer` | Chat settings changed | `--c-400` |
| none yet (new friendship) | `status-text-received` | You're now friends | `--c-400` |
| outgoing request | `status-request` | Request sent | `--c-400` |

The glyph keeps its family colour even when the words are grey. Size 16px in rows, 18–20px in the thread, 14px in receipts. The status glyph SVGs have class `app-status-icon`; set `color` on them, not `fill`.

---

## 9. Icons (`src/apps/icons.ts`)

`appIcon(name, label?)` returns an inline SVG string: `aria-hidden="true"` and `focusable="false"` without a label; `role="img"`, `aria-label` and `<title>` with one. Icon buttons always carry their own `aria-label` and use the unlabelled icon.

| Group | Names | Style |
| --- | --- | --- |
| Navigation twins (`ui-icon ui-nav-icon app-icon`) | `apps home discover search activity profile chat add-friend` | 24 grid, stroke 1.75, `ui-icon-line` + `ui-icon-fill` groups; theme.css shows the fill on `[aria-current=page]`, `[aria-pressed=true]` and the minimized capsule |
| Outline (`ui-icon app-icon`) | `social settings compose reply like like-filled share more photo camera close back send block report trash save saved timer lock check plus info alert retry chevron-right` | 24 grid, stroke 2, round caps and joins, `currentColor` |
| Status (`ui-icon app-icon app-status-icon`) | `status-text-sent status-text-received status-text-new status-text-opened status-snap-sent status-snap-received status-snap-new status-snap-opened status-opened status-request` | as outline; section 8 |
| Tiles (`app-tile-mark`) | `social-tile chat-tile` | 48 grid, gradient of `currentColor`, mark in dark ink `#0b0a12`; a fresh gradient id per call |

`.ui-icon` is 16px by default (`theme.css:33`); size icons with the component rules above (`.apps-icon-btn .ui-icon{width:20px;height:20px}` etc.). `discover` is provided for a later "Discover" entry point; the Discover feed is reached by the segmented control, not a tab. All icons pass `.claude/skills/svg-skill/scripts/validate.sh` (checked when dumped to files).

---

## 10. Upload UI (Social photos, avatar, banner, Chat snaps)

One component, `apps-upload`, driven by `src/media/client.ts` stage callbacks. Stages and what the user sees:

| Stage | Trigger | Thumb overlay (72×72 in the composer; full preview in the snap sheet) | Label (11/600, centred at the bottom of the thumb, `padding:0 4px 10px`; 13px in the snap sheet). Stage names are internal; these words are what people see | Progress bar |
| --- | --- | --- | --- | --- |
| Compressing | file picked, browser shrink running | scrim `rgb(0 0 0 / .55)` | "Preparing…" | none |
| Uploading | XHR started | scrim | "Uploading 42%" | 3px bar at the bottom, `background:var(--social-accent)` (teal in Chat), `transform:scaleX(p)`, `transform-origin:left` |
| Processing | upload sent, waiting for the server | scrim | "Checking…" | bar full |
| Ready | server returned the media id | no scrim; a 20px `check` badge (`background:#fff; color:#000`, top-left) for 1.5 s, then nothing | sr: "Photo ready" | hidden |
| Failed | any error | scrim `rgb(0 0 0 / .7)`, `alert` 20px `--c-amber` | short reason (below) | hidden |

- Every thumb has a remove button: 28px circle (44px hit via a transparent `::before` inset −8px), `background:rgb(0 0 0 / .7); color:#fff`, `appIcon('close')` 14px, top-right, `aria-label="Remove photo 2"`. Remove aborts the request (AbortController) at any stage.
- Failed thumbs also show two `.ui-btn.secondary.small` buttons under the thumb (thumb column widens to 140px): "Retry" (`retry` icon) and "Remove". In the snap sheet they are full-size pills.
- Each thumb is `role="group" aria-label="Photo 2 of 3, Uploading 42%"`; one shared visually hidden `aria-live="polite"` region announces stage changes (not every percent: Uploading at 0, then Processing, Ready, Failed).
- Failure reasons (short label / notice text): too big "Too big" / "This photo is too big. Try a smaller one."; unsupported "Not supported" / "This file type isn't supported. Try a JPEG, PNG or WebP."; HEIC unreadable "Can't read" / "This photo format can't be read here. Try a JPEG or a screenshot."; network "No connection" / "Couldn't connect. Check your connection, then retry."; 429 "Limit reached" / the upload rate-limit copy; 507 "Storage full" / "Photo storage is full right now. Try again later."; quota "Limit reached" / "You've used all your photo space. Delete some posts to free it up."
- Publish / Send photo stay disabled until every attached photo is Ready; the composer helper explains why.
- Avatar and banner (settings) use the same stages on the preview itself.

---

## 11. Accessibility

### 11.1 Structure and roles

- Each view root: `section[aria-label="QCC Social"]` / `"QCC Chat"`, `tabindex=-1`. On every route change move focus to the page `h1` (`tabindex=-1`), or to the focused post on a thread, without scrolling jumps (`focus({preventScroll:true})` then the planned scroll).
- Feed: `role="feed"` with `aria-busy` while loading and `aria-label` = tab name; posts are `article` with `aria-posinset`, `aria-setsize="-1"`, `aria-labelledby` (name) and `aria-describedby` (body).
- Tabs: segmented controls and profile tabs are `tablist`/`tab`/`tabpanel` with roving `tabindex` and arrow keys.
- Chat list: `ul` of links; each link's text reads "Name, status, time, N unread". Requests are a separate `section[aria-labelledby]` with their heading.
- Conversation: `role="log"` (polite, additions only). Group heads are `h3` (visually 13px) so screen-reader users can jump between senders. System lines are `p` inside the log.
- Snap viewer: `dialog[aria-label="Photo from Sam"]`, focus starts on the close button.
- Live regions: shell `#announcer` for one-off confirmations ("Post published."), the composer helper (polite, ≤1/s), the upload region, the snap countdown status. Never announce poll refreshes except new messages in an open conversation (via the log) and the new-posts pill appearing ("3 new posts above" once per pill).

### 11.2 Focus order

- Social feed: top bar (brand, segmented) → new-posts pill (when present) → inline composer (≥1100) → posts in order (inside each: name, handle link, more, body links, media tiles, reply, like, share) → "Show more posts" → FAB → island tabs → menu circle. The FAB is after the feed so it never interrupts reading order.
- Thread: back → ancestors → focused post → reply prompt → replies → "Show more replies".
- Chat list: brand → requests (Accept, Decline, more per row) → chat rows → sent requests → note → island.
- Conversation: back → peer → info → log (links, message option buttons, snap buttons) → jump pill → camera → field → send. Opening a conversation puts focus on the field on fine pointers, and on a visually hidden `h1.sr-only` "Chat with Sam" (`tabindex=-1`, first in the log's parent) on coarse pointers so the on-screen keyboard doesn't pop up.
- Sheets: first focus on the first control that does the work (compose: the textarea; report: the first category or message radio; confirm: Cancel), otherwise the close button; Escape and focus return as `openSheet` already does.
- Rings: the shell's keyboard-only rings apply (`theme.css:27,340`). Add `:root[data-input="keyboard"] :is(.social-view,.chat-view) :focus-visible{outline:2px solid #fff;outline-offset:2px}`; text fields keep the inner-ring rule. Posts focused by j/k get `outline:2px solid #fff; outline-offset:-2px` (inside, so it isn't clipped).

### 11.3 Social keyboard shortcuts (desktop, fine pointer)

Active only when: Social is mounted, no dialog is open, no modifier (Ctrl, Meta, Alt) is held, the event target is not `input`, `textarea`, `select` or `[contenteditable]`, `event.isComposing` is false, and the "Single-key shortcuts" setting is on. Bind on the view root (`keydown`), not on `window`, so games and Study keep their keys.

| Key | Action |
| --- | --- |
| `j` / `k` | Focus next / previous post (`scrollIntoView({block:'nearest'})`, instant) |
| `o` or `Enter` (on a focused post) | Open the thread |
| `n` | New post (compose sheet; the inline composer from 1100) |
| `l` | Like or unlike the focused post |
| `r` | Reply to the focused post |
| `/` | Focus search (route to search if needed) |
| `?` | Shortcut help sheet `#social-shortcuts` |
| `Esc` | Close the open sheet (existing) |

The help sheet lists these in a two-column table with `.ui-kbd` keys. No shortcuts in Chat beyond Enter to send.

### 11.4 Targets, colour, text

- Every interactive element is at least 44×44 (visual size may be smaller; extend the hit area with padding or a transparent `::before`). Exception: the shell's tab bar below 360px (section 4.1).
- Adjacent icon actions keep ≥8px between hit areas.
- Status is never colour alone (sections 1, 8). Liked = filled icon + `aria-pressed` + count; saved = tint + pin + "Saved"; over-limit = red + negative number + helper text; unread = weight + words + count badge.
- Text never uses `--c-500` or darker (4.35:1 fails on black).
- Respect `prefers-contrast:more` and `prefers-reduced-transparency` through the existing glass and sheet fallbacks; app-specific translucent fills (composer bar, sticky field rows) become `background:#000` under both.
- `forced-colors:active`: status glyphs use `currentColor` so they follow `CanvasText`; the saved tint gets `border:1px solid CanvasText`.

---

## 12. Motion

Built with the animate skill's order (should it animate, purpose, tool, properties, curve and duration, interruption, exit, reduced motion). Library check (pick-ui-library): the repo has no UI framework, and every listed motion or component library (motion, Sonner, base-ui, NumberFlow, Virtuoso) is React-first or unnecessary here. Native `dialog` + `openSheet` already provides accessible sheets. **No library.** CSS transitions for state, CSS keyframes for constant loading motion, the Web Animations API (`element.animate`) for one-shot programmatic motion.

Curves are existing tokens only: `--ease-out` `cubic-bezier(.23,1,.32,1)` (enter/exit), `--ease-in-out` `cubic-bezier(.77,0,.175,1)` (on-screen moves), `--ease` (colour only), `--ease-glass-pop` (existing spring, badge only), `linear` (progress). For WAAPI pass the same strings (`'cubic-bezier(.23,1,.32,1)'`).

### 12.1 Table

| # | Animation | Trigger (frequency) | Purpose | Tool · properties | Duration · easing | Interruption | Exit | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Like pulse | Pointer tap on Like when it becomes liked (tens/day) | Feedback | WAAPI on the icon: `transform: scale(.8)→scale(1)`; plus a 1.5px rose ring `span` behind it: `transform: scale(.6)→scale(1.25)`, `opacity: .5→0` | icon 180 ms `--ease-out`; ring 280 ms `--ease-out` | A new tap cancels both (`anim.cancel()`) and applies the new state at once | — | No pulse; fill swap only |
| 2 | Unlike | Tap on a liked Like (tens/day) | — (state change) | none | — | — | — | — |
| 3 | Like via `l` key, any j/k move | Keyboard (100+/day) | none: keyboard disqualifies motion | none; focus moves instantly | — | — | — | — |
| 4 | Count roll | Your own like/unlike changes the visible count by ±1 (tens/day) | State indication | WAAPI on two stacked spans in an `overflow:hidden` box (height 1em): old `translateY(0)→(-100%)` + `opacity 1→0`; new `translateY(100%)→0` + `opacity 0→1` (reverse direction for −1) | 160 ms `--ease-out` | Cancel running roll, show the final number | — | Text swaps instantly |
| 5 | New-posts / new-message pill | Pill appears after a poll (occasional) | Spatial consistency (content is above / below) | CSS transition on `opacity` and `transform: translateY(-8px)→0` (Social, from above); `translateY(8px)→0` (Chat jump pill, from below); enter via `@starting-style` | enter 200 ms `--ease-out`; exit 150 ms `--ease-out` back to the start offset | Transition retargets | Leaves the way it came | Appears and disappears instantly (the shell reset removes the transition); no fallback needed |
| 6 | Composer ring progress | Every keystroke (100+/day) | none | `stroke-dashoffset` set directly, no transition | — | — | — | — |
| 7 | Composer ring colour | Crossing 260 or 280 characters (occasional) | State indication | CSS transition `stroke` | 150 ms `--ease` | Retargets | — | Instant colour (shell reset) |
| 8 | Send message (own) | Send in Chat (tens/day) | Spatial consistency (it came from the composer) | WAAPI on the new `.chat-msg`: `opacity 0→1`, `transform: translateY(8px)→0` | 180 ms `--ease-out` | If another message is sent during it, let both run (each is independent) | — | Appears in place |
| 9 | Incoming message | Poll adds messages while the reader is at the bottom (tens/day) | Preventing a jarring change | WAAPI per new group/message: `opacity 0→1`, `transform: translateY(6px)→0`; several at once stagger 40 ms, max 3 animated, rest instant | 200 ms `--ease-out` | Late arrivals start their own; nothing waits | — | Appear instantly |
| 10 | Own new post in feed | Publish succeeds (occasional) | Spatial consistency | WAAPI on the article: `opacity 0→1`, `transform: translateY(-6px)→0` | 200 ms `--ease-out` | — | — | Instant |
| 11 | Snap viewer open | Tap "Tap to view" (occasional) | Spatial consistency | Dialog `opacity 0→1` 160 ms; image `transform: scale(.96)→1` + `opacity 0→1` after decode | 220 ms `--ease-out` | Closing during it cancels and closes | see 13 | Opacity 0→1 over 120 ms via WAAPI (allowed: opacity only) |
| 12 | Snap countdown ring | While a snap is shown (occasional) | State indication (time left) | CSS transition on `stroke-dashoffset` from 0 to 150.8, started after decode | `SNAP_VIEW_SECONDS` × 1000 ms `linear` (progress never eases) | Closing early removes the element | — | No sweep: set the offset once per second (stepped), the "8s" text counts down |
| 13 | Snap viewer close | Tap, Esc, timer end (occasional) | Exit | WAAPI on the dialog: `opacity 1→0`, image `transform: scale(1)→(.98)`; then `close()` | 160 ms `--ease-out` | A second close request is ignored | — | Close instantly |
| 14 | Launcher, compose, report, info, confirm, send-photo sheets | Open/close (occasional) | Spatial consistency | Existing `.ui-glass-sheet` rules (opacity 180 ms; scale/translate 320 ms `--ease-glass-pop`; exit 180 ms `--ease-out`; backdrop fade). No new motion | as theme.css | as theme.css | as theme.css | as theme.css (and the shell reset) |
| 15 | Message menu popover (fine pointer) | Click "Message options" (tens/day) | Spatial consistency | CSS transition `opacity` + `transform: scale(.97)→1`, `transform-origin` at the trigger corner | 150 ms `--ease-out`; exit 120 ms | Retargets | Same path back | Instant |
| 16 | Route change in Social (feed ↔ thread ↔ profile …) | Navigation (tens/day) | none strong enough | no animation; scroll and focus restore | — | — | — | — |
| 17 | Chat list → conversation (phone, < 960) | Open a chat (tens/day) | Spatial consistency (going deeper) | WAAPI on the conversation root: `transform: translateX(16px)→0`, `opacity 0→1` | 200 ms `--ease-out` | A new navigation cancels it and renders the target | Back: the list root `translateX(-16px)→0` + opacity, 200 ms (mirrors the entry) | Instant swap |
| 18 | Unread badge pop | Badge goes from hidden to ≥1 (occasional) | State indication | CSS transition on `transform: scale(.8)→1` and `opacity 0→1`, using `@starting-style` when the badge is inserted | 240 ms `--ease-glass-pop` (existing spring, ~5% overshoot) | Retargets | Removed instantly at 0 | Instant |
| 19 | Badge count change (n → m) | Poll (occasional) | none | text change only | — | — | — | — |
| 20 | Skeleton shimmer | While loading (constant) | State indication (still loading) | CSS keyframes on `.apps-skeleton::after`: a 40%-wide `linear-gradient(90deg, transparent, rgb(255 255 255 / .06), transparent)` band, `transform: translateX(-100%)→(250%)` | 1200 ms `linear` infinite (constant motion, off the main thread) | Removed with the skeleton | — | Static bars (the shell reset removes the animation) |
| 21 | Upload progress bar | Upload progress events (occasional) | State indication | CSS transition on `transform: scaleX()` | 120 ms `linear` | Retargets to the latest value | Hides when Processing ends | Instant steps |
| 22 | Save / unsave in chat | Hold or menu (occasional) | State indication | CSS transition `background-color`, `box-shadow` | 150 ms `--ease` | Retargets | — | Instant |
| 23 | Segmented control pill, profile tab indicator | Tab change (tens/day) | Spatial consistency | CSS transition on `transform: translateX()` only. Segments are equal width, so the pill never changes size (no `width`, no `scaleX`, which would squash its rounded ends) | 200 ms `--ease-in-out` | Retargets | — | Instant |
| 24 | Button press (Publish, Follow, send, FAB, tiles, actions) | Press (tens/day) | Feedback | CSS `transform: scale(.97)` on `:active` (tiles .97, FAB .95) | 160 ms `--ease-out` | Transition | Release springs back on the same rule | None (shell reset, matching `.ui-btn`) |
| 25 | Follow ↔ Following | Tap (occasional) | State indication | CSS transition `background-color`, `color`, `border-color` | 150 ms `--ease` | Retargets | — | Instant |
| 26 | Inline notice | Error or limit (occasional) | Preventing a jarring change | `@starting-style` `opacity 0→1` | 150 ms `--ease-out` | — | Removed instantly | Instant |
| 27 | Hover tints on rows and actions | Hover, fine pointer only (tens/day) | Feedback | CSS transition `background-color`, `color` inside `@media (hover:hover) and (pointer:fine)` | 150 ms `--ease` | Retargets | — | Instant |

Never: `transition: all`, `scale(0)`, `ease-in`, animating `height`/`margin`/`top`, motion on keyboard shortcuts, typing indicators (not in the MVP), pull-to-refresh, scroll-reveal, confetti or particles.

### 12.2 Reduced motion implementation

- The shell already removes every CSS animation and transition (with `!important`) under `@media (prefers-reduced-motion:reduce)` and under `html.reduce-motion` (`theme.css:364-369`). So CSS motion in these apps needs no extra reduced rule, and a "gentler" CSS fallback would be killed anyway. Do not fight the reset.
- WAAPI is **not** covered by that reset. Every `element.animate()` call goes through one helper in `src/apps/ui.ts`:

```ts
export type Reduced=()=>boolean;
export const reducedMotion=(live?:Reduced):boolean=>
  (live?.()??false)
  ||document.documentElement.classList.contains('reduce-motion')
  ||matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Runs a one-shot animation unless motion is reduced; returns the Animation or null. */
export function motion(el:Element,frames:Keyframe[],options:KeyframeAnimationOptions,live?:Reduced,reducedFrames?:Keyframe[]):Animation|null{
  if(reducedMotion(live))return reducedFrames?el.animate(reducedFrames,{duration:120,easing:'ease',fill:'none'}):null;
  return el.animate(frames,{fill:'none',...options});
}
```

  Views receive the shell's live getter `()=>preferences.reducedMotion` in their constructor (as Movies does, `main.ts:235`) and pass it to `motion()`. Only rows 11 and 17's reduced alternatives use `reducedFrames` (opacity only); every other reduced alternative is "no animation".
- Keep the end state in the DOM/CSS, never in `fill:'forwards'`, so a cancelled or skipped animation still leaves the right state.
- Hover motion lives inside `@media (hover:hover) and (pointer:fine)`.
- Press-and-hold to save uses a timer, not an animation; show no progress fill (it is 500 ms).

### 12.3 Feel checks for the implementer

Play rows 1, 4, 5, 11–13, 17 and 18 at 4× slow-down in the DevTools Animations panel, and once on a real phone. Check the like ring doesn't clip inside the action button (`overflow:visible` on the button), and that the count roll box doesn't shift the row's width (fixed `min-width` in `ch`).

---

## 13. Implementation checklist (design side)

1. `src/apps/apps.css`: tokens (section 2), `apps-*` components (section 3), launcher, upload, report, confirm, skeleton, notice, badge. Import from `src/apps/launcher.ts`.
2. `src/apps/ui.ts`: `escape()`, `avatar()`, `relativeTime()` (en-NZ: "now", "5m", "3h", "2 Nov", "2 Nov 2025"), `fullTime()` ("4:12 pm · 3 Nov 2026"), `compactCount()`, `reducedMotion()`, `motion()`, link detection (http/https only) shared by both apps.
3. `src/apps/launcher.ts`: the Apps tab, badge polling, `#apps-dialog`.
4. `src/social/view.ts` + `src/social/style.css` (`.social-view` scoped, `social-*` classes); `src/chat/view.ts` + `src/chat/style.css` (`.chat-view`, `chat-*`). Follow the 37-point checklist in qcc-design-system.md section 7.
5. All user text through `textContent` or `escape()`; never `innerHTML` with user strings.
6. Verify at 320, 390, 768, 1100 and 1440 widths: no horizontal scroll, nothing under the island or the composer, focus rings visible, reduced motion with both triggers.

---

## 14. Open concerns

- **Six-tab shell bar below 360px.** With the rules in 4.1 the tabs are 36px wide at 320px (WCAG 2.5.8 AA passes at 24px; our 44px aim does not). The alternative is moving Study or My list out of the bar, which is an owner decision.
- **Profile Photos tab** needs an API filter for posts with media; drop the tab if the server does not provide one.
- **Snap view time** (10 s) and the **Social poll interval** (60 s) are designer choices; SPEC is silent on both.
- **Helpline numbers** in the self-harm card (111, 1737, Youthline 0800 376 633) must be checked before release.
- **Report from the chat info sheet** needs a list of the friend's recent messages; if the API cannot list them cheaply, keep reporting only in the message menu and remove the info-sheet button.
- **Save in chat** shows "Saved" without saying who saved it, because `MessageView.saved` is a boolean.
