# QCC Social + QCC Chat: motion and visual audit

Task 10 audit of the implementation against [DESIGN.md](DESIGN.md) section 12 (motion), with the visual checks of sections 3.6, 4, 5, 6 and 8. Audited on 2026-11-04 against commit `42db650`, then fixed in the commit that adds this file. Built with the animate skill's order (should it animate, purpose, tool, properties, curve and duration, interruption, exit, reduced motion).

## 1. Method

- Read every `element.animate(`, CSS `transition`, `@keyframes` and `@starting-style` in `src/apps`, `src/social` and `src/chat`, and checked each against its row in DESIGN 12.1.
- `rg -n '\.animate\(' src/apps src/social src/chat` finds exactly two calls, both inside `src/apps/motion.ts` (`motion()`, the 12.2 helper). Every other WAAPI call is `motion(...)`, so the reduced-motion check (live preference getter, `html.reduce-motion`, the media query) covers all of them. There is no `transition: all` and no animated `scale(0)` or `ease-in`.
- CSS motion is covered by the shell reset (`src/theme.css:364-369`: `animation:none!important; transition:none!important` under `@media (prefers-reduced-motion:reduce)` and under `.reduce-motion`). The reset removes the *transition*, not the `:active` transform itself, so press scales needed their own reduced rule (row 24, fixed).
- Frames recorded in Chromium by freezing the Web Animations clock: `document.getAnimations()`, `pause()`, then `currentTime` at set times, then `page.screenshot`. Script: [`tests/apps/motion.spec.ts`](../../tests/apps/motion.spec.ts) (skipped unless `MOTION_SHOTS=1`), served with the real accounts, chat, social and media handlers exactly as `tests/social/screenshots.spec.ts` and `tests/chat/screenshots.spec.ts` do. It also logs every `element.animate` call (target, properties, duration) for the reduced-motion checks.

## 2. Audit table (DESIGN 12.1)

"Before" is commit `42db650`. "After" is this commit. Location is after the fix.

| # | Animation | Location | Before | After |
| --- | --- | --- | --- | --- |
| 1 | Like pulse | `src/social/components/post-card.ts:153-154`, ring CSS `src/social/style.css:89-90` | Properties, 180 / 280 ms, `--ease-out`, cancel-on-tap and reduced (no pulse) all matched. **Mismatch:** Enter or Space on the Like button also pulsed (only the `l` key was treated as keyboard), and the ring painted over the glyph rather than behind it. | Matches. `event.detail===0` (keyboard activation) skips the pulse (`post-card.ts:101`, rows 1 and 3); the glyph is `position:relative`, so the ring sits behind it. |
| 2 | Unlike | `post-card.ts` `apply()` | Matched (no motion; running pulse and roll cancelled). | Matches. |
| 3 | `l` / `j` / `k` | `src/social/view.ts:311-318` | Matched (no motion). | Matches. |
| 4 | Count roll | `post-card.ts:145-150`, `style.css:92-96` | 160 ms `--ease-out`, both directions, cancel and show the final number: matched. **Mismatch (12.3 feel check):** an empty count collapsed to width 0, so a 0 → 1 like widened the button and moved Share; empty reply counts did the same, so Like and Share did not line up from post to post. | Matches. Counts in the actions row keep `min-width:3ch` when empty (`style.css:97`): the row never shifts on a roll and the action columns align. |
| 5 | New-posts pill (Social) | `src/social/style.css:132-135`, `src/social/screens/feed.ts:84-94` | Matched: `@starting-style` from `translateY(-8px)` + opacity, 200 ms in, 150 ms out the same way, reduced = instant. Small gap: the leaving pill still took clicks for 150 ms. | Matches; `pointer-events:none` while leaving. |
| 5 | Jump pill (Chat) | `src/chat/style.css:148-151`, `src/chat/components/conversation.ts:386-396` | Enter matched. **Mismatch:** exit was instant (`hidden=true`), not 150 ms back down to `translateY(8px)`. | Matches. `setJump()` plays the 150 ms exit via `[data-leaving]`, then hides it; re-showing mid-exit retargets; instant under reduced motion. |
| 6 | Composer ring progress | `src/social/components/composer.ts:113` | Matched (offset set directly, no transition). | Matches. |
| 7 | Composer ring colour | `src/social/style.css:152` | Matched (`stroke` 150 ms `--ease`). | Matches. |
| 8 | Send message (own) | `conversation.ts:268-274` | 180 ms, 8px, `--ease-out`, independent runs: matched. **Mismatch:** only the `.chat-entry` moved; when the message started a new group its "You · time" line popped in unanimated above the sliding text. | Matches. A message that starts a group animates the group, so the name line travels with it. Row 8 vs row 9 now keyed on origin (send vs poll), not on `mine`, so your own messages arriving by poll from another device use row 9. |
| 9 | Incoming message | `conversation.ts:268-274`, `applyView()` | 200 ms, 6px, 40 ms stagger, max 3: matched. **Mismatch:** with `fill:'none'` and a delay, staggered messages showed at full opacity during their delay, then blinked to 0 and faded in. Group line popped as in row 8. | Matches. Delayed runs use `fill:'backwards'` (start state during the delay; the end state still lives in the DOM, 12.2). |
| 10 | Own new post | `post-card.ts:227`, `feed.ts:58`, `thread.ts:102` | Matched. | Matches. |
| 11 | Snap viewer open | `src/chat/components/snap-viewer.ts:126-134` | Dialog 160 ms fade, image `scale(.96)→1` + fade after decode, reduced = 120 ms opacity only: matched. **Mismatch (interruption):** closing during the open did not cancel it; the close fade restarted from opacity 1 (a flash). | Matches. The open animations are kept and cancelled on close; the exit starts from the current opacity and scale. |
| 12 | Snap countdown ring | `snap-viewer.ts:77-94` | Matched: `stroke-dashoffset` CSS transition, `SNAP_VIEW_SECONDS` × 1000 ms `linear`, started after decode; reduced = one step per second. | Matches (frames below; reduced offset after 1.3 s = 15.08 = one tenth). |
| 13 | Snap viewer close | `snap-viewer.ts:48-58` | Matched (160 ms opacity, image to `.98`, second close ignored, reduced = instant). | Matches; now starts from wherever row 11 had got to. |
| 14 | Sheets (launcher, compose, report, info, confirm, send-photo) | `src/ui/sheet.ts` + `theme.css` `.ui-glass-sheet`; `src/apps/sheets.ts:8` | Matched (all are `dialog.ui-glass-sheet` via `openSheet`; no new motion). | Matches. |
| 15 | Message / post menu popover | `src/chat/components/menu.ts:62-70`, `src/social/components/menus.ts:57-65`, CSS `chat/style.css:180-182`, `social/style.css:168-170` | Enter matched (150 ms, `scale(.97)`, origin at the trigger corner). **Mismatch:** exit was instant removal, not 120 ms back the same way. | Matches. `leave()` (`src/apps/motion.ts`) plays the 120 ms exit via `[data-leaving]` (inert, no pointer events, no longer an `.apps-popover` for the shell's Escape check). Escape, Tab and keyboard-chosen items still close at once (keyboard never animates). |
| 16 | Social route change | `src/social/view.ts` | Matched (no animation). | Matches. |
| 17 | Chat list → conversation (phone) | `src/chat/view.ts:203-234` | Entry matched (16px + opacity, 200 ms, cancel on navigation). **Mismatch:** the list's "back" slide ran on every phone list mount (first visit, sign-in, coming from Add friend), not only on the way back from a conversation; re-rendering an open conversation replayed the entry. Spec conflict: the table said "Instant swap" for reduced motion while 12.2 names row 17 as an opacity-only `reducedFrames` row. | Matches. The view remembers the last mounted route: the list slides back only after `with`, the conversation slides in only when arriving from elsewhere. Spec cell corrected to match 12.2 (opacity 0→1 over 120 ms), which is what the code does. |
| 18 | Unread badge pop | `src/apps/apps.css:25-28`, `src/apps/launcher.ts` `paintBadge()` | 240 ms `--ease-glass-pop`, `@starting-style`, removed instantly at 0: matched. **Mismatch:** the pop also played whenever a badge was first drawn with a count (the Chat tile each time the launcher opened, a newly mounted island). | Matches. The starting style is keyed on `[data-pop]`, set only when the count goes from 0 to 1 or more. The chat row count (`.chat-unread`, `src/chat/components/list.ts:106`) had the same problem on every list mount and gets the same gate: it pops only when a row already on screen gains a count. |
| 19 | Badge count change | `launcher.ts` | Matched (text change only). | Matches. |
| 20 | Skeleton shimmer | `src/apps/apps.css:79-80` | Matched (1200 ms linear, transform only; reset removes it). | Matches. |
| 21 | Upload progress bar | `apps.css:117`, `src/apps/upload-chip.ts:110` | Matched (`scaleX`, 120 ms linear). | Matches. |
| 22 | Save / unsave in chat | `src/chat/style.css:119` | Matched (`background-color`, `box-shadow`, 150 ms `--ease`). | Matches. |
| 23 | Segmented pill, profile tab indicator | `apps.css:50`, `apps.css:58` | Matched (`translateX` only, 200 ms `--ease-in-out`). | Matches. |
| 24 | Button press | `.social-action`, `.social-fab` (.95), `.apps-icon-btn`, `.apps-pill`, `.apps-tile`, `.chat-send`, `.chat-camera`, `.chat-snap` | Duration, curve and scales matched. **Mismatch (reduced):** the reset removed the transition but the `:active` scale still applied instantly (only `.ui-btn` and `.apps-tile` had a reduced rule). | Matches. One reduced rule for both triggers in `apps.css:150-152` sets `transform:none` on `:active` (the tile rule moved there from `launcher.css`). |
| 25 | Follow ↔ Following | `apps.css:37` (`.ui-btn.apps-pill`) | Matched. | Matches. |
| 26 | Inline notice | `apps.css:62-63` | Matched (`@starting-style` opacity, 150 ms, removed instantly). | Matches. |
| 27 | Hover tints | `social/style.css:48-50`, `chat/style.css:64,186` | Chat rows matched. **Mismatch:** Social post, person and activity rows and both menus' items changed tint instantly (no 150 ms `--ease` transition). | Matches; transitions added inside `@media (hover:hover) and (pointer:fine)`. |

Summary: 27 rows (28 with both pills). 17 matched as built; 11 had a mismatch and are fixed (rows 1, 4, 5 Chat, 8, 9, 11, 15, 17, 18, 24, 27; row 5 Social and row 13 got small hardening). 0 rows remain open.

## 3. Visual fixes found on the way

- **Apps badge on the islands (DESIGN 3.1, 3.6; open item from implementation).** `AppsLauncher` now exposes `subscribe()` (`src/apps/launcher.ts`), the shell passes it as `AppDeps.appsBadge` (`src/main.ts:228`, `src/apps/types.ts`), and `bindAppsBadge()` gives the Social and Chat islands' Apps tabs the same badge and accessible name ("Apps, 2 unread messages") as the shell's. Unsubscribed on dispose.
- **The badge lost its fill on every island, including the shell's.** The glass-ink pass treats every `span` in a tab as a glyph and gives it `.glass-ink` (`background:none`, adaptive ink), so the rose pill rendered as a bare superscript number. `src/ui/glass-ink.ts:199` now skips `.apps-badge`, which keeps its own fill and ink (6.95:1, DESIGN 1).
- **Publish had no visible label in the compose sheet (phone).** The sheet's glass-ink pass wraps every text node in a sheet in `span.glass-label` with white ink, including the text of `.ui-btn.primary` (white fill), so it read as an empty white pill (it is in the committed `social-composer-phone.png` before this change). It already skipped the cream `.game-button` primary; `src/ui/glass-ink.ts:181,206` now also skip `.ui-btn.primary` and `.apps-badge` (the Chat tile badge number was white on rose instead of `--app-badge-ink`).
- **Publish geometry.** DESIGN 3.3 makes Publish a 40px pill with 15px/700 text; it was a 32px `.ui-btn` with 12px text. It now carries `.apps-pill` (`src/social/components/composer.ts:70`).
- **`scale(0)`** on the report sheet's radio dot (static, not animated) replaced by `opacity` so the codebase has no `scale(0)` at all (`src/apps/apps.css:98-100`).
- **Badge text** was `1`–`99`, then `99+`; DESIGN 3.6 says `1`–`9`, then `9+`. Fixed in `launcher.ts`. (The chat row's own count, DESIGN 6.3, is a different component and keeps its number.)

## 4. Evidence

Frame strips (Chromium, 390 × 844, `deviceScaleFactor:1`) in [`docs/evidence/social-chat/motion/`](../evidence/social-chat/motion/):

| File | Row | What it shows |
| --- | --- | --- |
| `like-burst.png` | 1, 4 | 0 / 40 / 90 / 180 / 280 ms: glyph from `.8`, rose ring expanding and fading behind it, inside the button (not clipped); the count rolls up from below; Share does not move. |
| `new-posts-pill-enter.png` | 5 | 0 / 50 / 100 / 200 ms: invisible at 0, settles down 8px into place. |
| `send-message.png` | 8 | 0 / 45 / 90 / 180 ms: the whole new group (name line and text) rises 8px and fades in. |
| `chat-open-conversation.png` | 17 | 0 / 50 / 100 / 200 ms: conversation slides 16px from the right; the fixed composer stays pinned to the bottom during the move (no containing-block jump). |
| `snap-open.png` | 11 | 0 / 55 / 110 / 220 ms after decode: image from `.96` and transparent to full size. |
| `snap-countdown.png` | 12 | Ring at 0 / 2.5 / 5 / 7.5 / 9.9 s of the linear sweep. |
| `snap-close.png` | 13 | 0 / 40 / 80 / 159 ms: fade to black with the slight shrink. |
| `launcher-sheet-open.png` | 14 | 0 / 60 / 120 / 200 / 320 ms of the existing glass sheet opened from the Social island's Apps tab. |
| `launcher-badge.png`, `social-island-badge.png`, `shell-island-badge.png` | 3.6, 18 | The rose badge on the Chat tile, the Social island and the shell island. |

Feel check (animate skill): the like ring reads as feedback, not decoration, and is over before the next tap could land; the pill and jump pill arrive from the side the content is on and leave the same way; the conversation slide is short enough (16px) not to feel like a page transition; the snap opens softly and closes quicker than it opened; no entrance starts from nothing. Not checked: a real phone, and the 4× DevTools slow-down (12.3); the frozen-clock strips stand in for both.

## 5. Reduced motion

Checked for each trigger separately in `tests/apps/motion.spec.ts` (`reduced motion via media query`, `reduced motion via app setting`): the first uses `page.emulateMedia({reducedMotion:'reduce'})` with the app setting off; the second leaves the media query off, opens the island's Menu and checks "Reduce motion" (`#motion`, `preferences.reducedMotion`, `html.reduce-motion`). Both logged the same:

```
like:      waapi [] · css transitions []
press:     transform 'none' while the Like button is held
pill:      css transitions [] · opacity 1 · transform none (instant)
sheet:     css transitions [] · open at opacity 1, scale 1, translate 0
open chat: chat-pane-main [opacity] 120 ms      (row 17, allowed by 12.2)
send:      waapi [] · css transitions []
snap open: apps-sheet [opacity] 120 ms; chat-snap-img [opacity] 120 ms   (row 11, allowed)
countdown: ring transition 0s; offset 15.08 after 1.3 s (stepped once per second)
snap close: waapi []
```

The test asserts every WAAPI call under reduced motion animates `opacity` only, that the only ones are rows 11 and 17 (120 ms), and that no CSS transition or animation runs in the apps.

## 6. Commands

```sh
export CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome
MOTION_SHOTS=1 npx playwright test tests/apps/motion.spec.ts --project=chromium --workers=1
SOCIAL_SHOTS=1 CHAT_SHOTS=1 npx playwright test tests/social/screenshots.spec.ts tests/chat/screenshots.spec.ts --project=chromium
npx playwright test tests/social tests/chat tests/apps --project=chromium
npx tsc --noEmit
```

Results after the fixes (Chromium 1243 from `/opt/pw-browsers`):

- `npx tsc --noEmit`: clean.
- `SOCIAL_SHOTS=1 CHAT_SHOTS=1 MOTION_SHOTS=1 npx playwright test tests/social tests/chat tests/apps --project=chromium`: **50 passed** (5.4 min). That is the required regression set (45 tests) plus the five env-gated evidence specs, which regenerated every `docs/evidence/social-chat/social-*` and `chat-*` screenshot and the `motion/` strips. Every regenerated screenshot was looked at, at 390 × 844 and 1440 × 900.
- No test expectation was changed. The new spec `tests/apps/motion.spec.ts` only runs with `MOTION_SHOTS=1`.
- A first baseline run was made while these edits were landing (the Vite dev server hot-reloaded mid-test) and had 4 failures (snap countdown, launcher polling, composer login, feed polling). None reproduced in the two clean full runs afterwards, so they are recorded here as contaminated, not as regressions.

## 7. Remaining gaps

- **Not felt on a real phone, and not played at 4× in DevTools** (DESIGN 12.3). The frozen-clock strips show the poses at set times, not the feel of the curve in motion; one pass on a real phone is still owed, especially for the like ring and the snap open.
- **WebKit not run.** Only Chromium was used. `@starting-style` and `transition-behavior` need Safari 17.4+; older Safari shows the pills, popovers and badge without their entry (they still appear and work).
- **The phone FAB covers the Share action of whichever post scrolls under it** (`social-profile-phone.png`, `social-feed-phone.png`). That is the fixed-FAB layout DESIGN 5.3 asks for, not a regression; noting it in case the owner wants a bottom inset for the last post's actions.
- **Row 17 under reduced motion** keeps a 120 ms opacity fade. The table and 12.2 disagreed; the table cell now follows 12.2. If the owner prefers a pure instant swap, drop `reducedFrames` in `src/chat/view.ts` `animateIn()`.
- **Badge pop window.** The `data-pop` mark lasts 400 ms, so a badge hidden at that moment (the shell island while Social is open) can still pop if it is shown within that window. Harmless, and rare.
- No independent code review was run (this task ran without subagents); the evidence above is the verification.
