# Mobile overhaul

Goal: fix the defects that make QCC feel like a desktop site on an iPhone, keeping the Liquid Glass look, the Study disguise and every feature.

## Method

- Built app (`npm run build`, `scripts/serve-built.mjs`), Chromium 1243 with touch emulation and CDP `Emulation.setSafeAreaInsetsOverride` for notch and home-indicator insets.
- Nine viewports: 320x568, 375x667, 390x844, 393x852, 430x932, 360x800, 768x1024, 844x390, 932x430.
- 20 shell screens per viewport and all 29 games at 390x844, 844x390 and 320x568, each with a screenshot and measured checks: page overflow, controls under 40 px, controls clipped, fixed controls inside safe areas, text under 11 px.
- Four read-only code audits of the games (touch input, cleanup, pause, rendering cost), each finding verified in code before acting.
- WebKit is not installed for this Playwright version, so no Safari engine run and no physical iPhone. Results are Chromium emulation.

## Findings and fixes

### P0 broken

1. Sheets cannot be closed by touch except with their X. The grab handle suggests a pull, but nothing responds, and the dimmed area does nothing. The sign-in sheet has no X at all, so on a phone the only way out is a choice inside it. Fix: shared `openSheet` dismissal, tap outside or pull down from the top, through the same cancel path as Escape. Sign-in gets an X.
2. Leaving browser fullscreen with a system gesture (Android back, iPad swipe) opens Study. That rule exists for desktop Escape, which WebKit swallows. Fix: only treat a fullscreen exit as Escape on a fine pointer.

### P1 mobile usability

3. Leaderboards: the "Refresh scores" button is squashed to a 30 px circle by the sidebar icon style sharing its class. Fix: scope the sidebar rule.
4. Menu search filters the library hidden behind the sheet. Fix: matching games listed under the field; the keyboard's Search key closes the sheet.
5. Seven game audio modules resume only from `suspended`. iOS reports `interrupted` after calls and backgrounding, so sound stays off. Fix: resume whenever not `running` or `closed` (the rule `core/music.ts` already uses).
6. Drift Club ignores safe areas: in landscape its controls sit under the side notch and the home indicator; portrait controls use 8 to 10 px text. Fix: edge to edge. The glass dock floats on the game instead of taking a band; the paper and the harbour run under the dock, the notch and the home indicator (the paper column grows by the inset), and only their contents keep clear. Readable portrait sizes. The dock's empty box no longer swallows taps meant for a game under it.
   Note: iOS reports no top inset in portrait in Safari or the installed app with the default status bar, so the notch only reaches the page in landscape.
7. Fivefold in landscape phones: the guess grid shrinks to about 13 px cells. Fix: grid beside the keyboard on short screens.
8. Chess in landscape phones: the mode menu is clipped at the top and under the dock. Fix: compact short-height menu.
9. Election: tabs, refresh and auto-refresh controls are 24 to 30 px tall. Fix: 44 px targets.
10. Animal Stack: drag and tap only start exactly on the animal's collider. Fix: touch slop for touch pointers.
11. Snake: swipes only register on the square canvas, not the space around it. Fix: listen on the whole stage.
12. Home Screen: older iOS needs the Apple web-app meta to open in standalone mode. Fix: Apple web-app meta and title. iOS ignores the SVG icon; the PNG icon comes in a separate commit by the owner.

### P2 performance

13. Maze Muncher draws every frame while paused (35 frames in 600 ms, measured). Fix: stop the loop when paused (0 frames after).
14. Breachline does not release its WebGL context on exit. Fix: `forceContextLoss()`.
15. Neon Coil joystick and Claimline ranking use `backdrop-filter` over canvases that repaint every frame. Fix: translucent fills.
16. Fruit Merge redraws twice per frame while aiming. Fix: let the running loop draw.
17. Quad Clash runs MSAA on 2x and 3x phone buffers. Fix: MSAA only below 2x. Crossy Road keeps MSAA: its rendering test requires antialiasing on 3x phones, and it already lowers its resolution when frames are slow.

### P3 polish

18. Tower ignores taps beside its portrait canvas in landscape. Fix: the whole game area takes the tap.

### Kept as is

- Study has no visible header or Return button: a tested, deliberate disguise. Its way back is the inline "games" link.
- Board cells under 40 px in Color Blocks, Minesweeper and Solitaire at 320 px are drag targets inside fixed boards; enlarging them would change the games.
- Tab labels at 9 to 10 px match native tab bars.
- Snake keeps drawing on its ready and game-over screens: its end-of-run reveal and apple animations run on that loop.
- Pause stopping the Maze Muncher loop has no browser test: the test runner throttles frames to about 8 a second, too few to tell the loops apart. It was measured directly instead.

## Verification

- `npm run check`, `npm test`, focused and full `npm run test:e2e` on Chromium, `npm run build`.
- New regression tests: sheet dismissal (tap outside, pull, sign-in close), fullscreen exit on touch and on desktop, refresh button size, menu search results, safe areas in Drift Club, Fivefold and Chess on landscape phones.
- After screenshots with the same script, a phone journey (library, game, pause, back, settings, Study, back) in portrait and landscape.
- Independent code review.
