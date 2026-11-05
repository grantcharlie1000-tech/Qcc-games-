# QCC reference pack

Research collected 2026-11-05 (Haiku), evaluated and decided by Opus. Confidence: **[P]** official vendor/standards source, **[S]** press or teardown, **[U]** not independently confirmed — verify before citing. No proprietary code, artwork or branding is copied; only interaction patterns are adopted.

Each entry ends with QCC's **decision**: adopt, adapt, or avoid, weighed against QCC's own strengths (Liquid Glass, maximum game space, guest-first, fast on school laptops).

## Account entry — Apple HIG *Managing accounts* (secondary: Discord sign-up)
Sources: [P] https://developer.apple.com/design/human-interface-guidelines/managing-accounts · [S] https://ionos.com/digitalguide/server/know-how/discord-how-to-sign-up-an-account
Patterns: defer sign-in until needed; say why an account helps; fields and the active mode must be unmistakable; provide a clear in-app account-deletion path.
**Decision:** QCC already defers sign-in (guest-first) and explains why — keep. Adopt legible fields and an obvious mode control (done in batch 1). Adopt in-app account deletion (tracker: Account sync, High). Avoid forcing email verification — QCC collects no email by design.

## Bottom tab bar — Apple HIG tab bars, iOS 26 Liquid Glass
Sources: [P] https://developer.apple.com/design/human-interface-guidelines/tab-bars · [S] https://www.donnywals.com/exploring-tab-bars-on-ios-26-with-liquid-glass/ · [S] https://www.macstories.net/stories/ios-and-ipados-26-the-macstories-review/3
Patterns: 3–5 top-level tabs; short noun labels; glass on the navigation layer only; bar minimises on scroll; search as a trailing tab.
**Decision:** QCC's bar already minimises on scroll and keeps glass off content — keep. Five tabs plus Menu is at the upper limit; do not add more. Consider search as a trailing destination (tracker: Search, Medium).

## Sheets — Apple HIG Sheets / Modality
Sources: [P] https://developer.apple.com/design/human-interface-guidelines/sheets · [P] https://developer.apple.com/design/human-interface-guidelines/modality
Patterns: size to content; explicit close in addition to swipe; block dismissal with unsaved changes; never stack sheets.
**Decision:** Adopt "size to content" (batch 1 made the account sheet fit a 390×844 phone). The Social composer already guards discard. Audit for stacked sheets in Batch 2.

## Long-form reading — Wikipedia mobile, Apple News
Sources: [P] https://www.mediawiki.org/wiki/Reading/Web/Accessibility_for_reading · [S] https://engadget.com/2189693/apple-updates-liquid-glass-to-be-more-readable-and-customizable/
Patterns: solid surface behind body text; adjustable text size; ~16 px+ body; reader strips chrome.
**Decision:** Study reader already uses a solid paper surface — keep; never put glass behind article text. Adopt a text-size control (Batch 3).

## Leaderboards — Google Play Games Services
Sources: [P] https://developer.android.com/games/pgs/leaderboards · [P] https://developer.android.com/games/pgs/quality · [P] https://developers.google.com/games/services/bestpractices
Patterns: reachable at load and after game over; your rank window; locale-formatted scores with units; server-side score limits.
**Decision:** Keep QCC's existing leaderboard look (owner decision). Adopt an "View leaderboard" action on the game-over state (tracker: Leaderboard dialog, Medium). Server limits already exist.

## Social feed — X home timeline (secondary: Bluesky)
Sources: [P] https://help.x.com/en/using-twitter/twitter-timeline · [P] https://help.x.com/en/using-x/types-of-posts · [P] https://blueskyweb.zendesk.com/hc/en-us/articles/19002427251981-Moderation-and-Custom-Feeds
Patterns: Following vs Discover tabs; one-path reporting from the overflow menu; mute private, block explicit.
**Decision:** QCC matches the tab split and report flow — keep. Bluesky's lesson applies to auto-hide: reports should feed moderation rather than silently hide after 3 (tracker: Reports, owner decision). Avoid view/reach counters.

## Messaging & view-once — Snapchat Chat (secondary: WhatsApp view-once)
Sources: [S] https://petapixel.com/2021/08/04/whatsapp-adds-snapchat-like-view-once-disappearing-photos/ · [S] https://www.blur.me/blog/snapchat-screenshot-notification-guide/ (Snapchat's own help pages were not reachable — [U])
Patterns: distinct delivered/opened states; unopened media expires on a stated timer; explicit save action; the UI states what cannot be saved.
**Decision:** QCC already enforces single-open server-side and has explicit saving — keep. Adapt: state in-product that a web app cannot stop screenshots (honesty over Snapchat's native-only alerts). Avoid promising screenshot detection.

## Streaming catalog — Netflix (secondary: Apple TV app)
Sources: [P] https://netflix.com/tudum/articles/netflix-new-homepage-layout-user-guide · [S] https://www.engadget.com/entertainment/streaming/netflix-overhauls-its-tv-app-with-a-fresh-ui-and-responsive-recommendations-121511958.html
Patterns: Continue Watching as a home row; search in the header; glanceable tile metadata.
**Decision:** QCC already has rails and My list — keep. Avoid hover-only information (touch parity).

## Game library — Apple Games app / Apple Arcade
Sources: [P] https://support.apple.com/HT210413 · [S] https://mobilegamer.biz/apple-officially-reveals-new-games-app/
Patterns: continue-playing row; search tab; category rows.
**Decision:** The poster grid is QCC's strongest screen — do not redesign. Adapt only a small recently-played row (Batch 3), measured against first-screen game density.

## Games
| QCC game | Reference | Sources | Adopt | Avoid |
|---|---|---|---|---|
| Tetris (`quadfall`) | Tetris Guideline | [S] https://tetris.wiki/Tetris_Guideline | Verify hold, ghost, 7-bag, DAS ≈167 ms / ARR ≈33 ms, 0.5 s lock delay with 15-move reset | Infinite lock-down |
| Wordle (`fivefold`) | NYT Wordle | [S] https://www.techradar.com/news/wordle-hard-mode | Hard mode toggle, share grid, colour-blind palette in the share too | Hidden hard mode |
| Minesweeper | Google Minesweeper | [S] https://tutorialtactic.com/blog/how-to-play-minesweeper/ | First-click safety; visible flag-mode toggle (present) | Long-press firing on normal taps |
| Solitaire | Microsoft Solitaire Collection | [S] https://www.trueachievements.com/game/Solitaire-Collection/walkthrough/2 | Tap-to-auto-move, unlimited undo, hint (verify) | Autoplay without explicit action |
| Pac-Man (`maze-muncher`) | Google Pac-Man doodle | [S] https://en.wikipedia.org/wiki/Pac-Man_Google_Doodle | Buffered swipe turns (present); full-bleed maze (present) | Swipes that scroll the page |
| Snake | Google Snake | [U] fan guides only | Arrow/WASD + swipe (present); optional speed setting | Copying Google's apple art |
| Claimline | Paper.io 2 | [U] https://www.crazygames.com/game/paper-io-2 | Drag + keys steering, exposure shown on trail | Spam mirror sites as sources |

Primary sources for retro/arcade references were scarce; verify by playing the originals before tuning.
