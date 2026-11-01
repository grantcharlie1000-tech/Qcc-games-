# Liquid Glass in-game UI

Charlie’s supplied brief is the design authority: recover play space across all 21 games, using the home bar’s actual Liquid Glass implementation. Work is restricted to presentation, layout, UI interaction and its tests. No game rules, scoring, persistence, accounts, database, functions, film/player/ad code, pricing, environment or AI changes. Work remains on `ui/liquid-glass-ingame`; commit only, without push, merge or deployment.

## Shared controls

Replace the title/navigation and metrics rows with one compact capsule: Back on the left, useful game information in the centre, Menu/Pause on the right. Use `.ui-tabbar`, `.ui-tab`, `bindGlass` and existing glass tokens and sheet styling. Extend layout rather than reproducing material styles. Keep full title, best score, restart, rules, favourite, fullscreen, settings and rankings in the expanded menu. Opening the menu pauses; closing restores only a previously running game. Preserve Study, hidden-tab and native fullscreen lifecycle. Native dialogs provide focus containment; return focus to the dock. First-time/start guidance stays brief; instructions remain available in the menu.

Default placement is an in-flow bottom dock on mobile and desktop. Quadfall and Fivefold use a top dock because their input controls belong below the board. Full-screen scenes keep an unobtrusive top dock in their existing HUD exclusion space. Safe-area padding and the existing visual-viewport binding reserve space; the dock never covers board tiles or required touch controls. Desktop keyboard games may hide direction pads, with an explicit show-controls preference in the game menu. No new dependency or animation library.

## Catalogue decisions

| Game | Centre information | Play-area adaptation |
| --- | --- | --- |
| Fruit Merge | Score | Keep next fruit/drop beside basket; remove prose/evolution clutter from play |
| Water Sort | Level/difficulty | Keep undo/hint; move level selectors to menu; grow tube region |
| Color Blocks | Score | Keep board/tray; remove old header reservation |
| Tower | Floors/perfect streak | Move local stats into dock; keep Drop |
| Snake | Score | Keep touch steering; optional on PC; enlarge square garden |
| Neon Coil | Mass | Keep local arena ranking and boost; reuse existing top HUD space |
| Minesweeper | Flags/time | Keep Reveal/Flag below field; difficulty and zoom in options |
| Solitaire | Cards home | Keep stock/foundations/actions; trim repeated summary |
| Block Fill | Garden/coverage | Keep hint/undo/path actions; remove repeated heading |
| Color Connect | Pairs/coverage | Keep legend/hint/undo; puzzle selector in menu |
| Ball Run | Mode | Retain useful native score/target/speed HUD; compact glass around it |
| Pool | Turn/shot | Keep groups, power and pocket call; secondary choices in menu |
| Animal Stack | Score/animals | Keep drop and native scene geometry |
| Flappy Bird | Gates | Keep flap; enlarge flight scene |
| Globle | Puzzle/guesses | Keep input/globe/distance history; reduce duplicate heading |
| Blockcraft | Day | Preserve health, hotbar, aiming and touch movement |
| Maze Muncher | Score/level | Preserve lives/maze; touch pad optional on PC |
| Corn Clicker | Current resource information or concise farm state | Preserve production/store panels and tabs |
| Slipline | Level/hearts | Remove duplicated header; enlarge arrow board; keep hint |
| Quadfall | Score/level | Top dock; Hold/Next stay beside board; touch pad below |
| Fivefold | Daily/practice puzzle | Top dock; board and keyboard retain space; modes/stats in menu |

Builder decisions: exact dimensions and per-game arrangements are settled through actual screenshots, with the above information hierarchy and all existing actions preserved. Presentation helpers can expose existing UI state without changing the frozen game API or model. Reuse existing native game options where needed.

## Acceptance

Capture actual started-game states for every game with Chromium at 390×844, touch/mobile enabled, and 1366×768. Store PNGs only under `/workspace/qcc-liquid-glass/<round>/`. Open and inspect all 42 final images; fix and recapture until there are no observed layout defects. Check smaller/landscape screens, changing viewport, keyboard focus, reduced motion/transparency, pause/resume/restart, menu-to-rules/settings/Study transitions and lifecycle cleanup. Run typecheck, complete unit suite and all affected browser specs in configured Chromium/WebKit engines. Compare unrelated failures with `origin/main`. Independent review plus author diff audit precedes final commit. Write `/workspace/qcc-liquid-glass/REPORT.md` with all per-game decisions, changed files, exact test commands/counts, final screenshot paths and honest limitations.
