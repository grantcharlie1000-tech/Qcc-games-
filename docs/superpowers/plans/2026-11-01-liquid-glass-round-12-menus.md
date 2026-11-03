# Round 12 pass 2 — arcade menus and sheets

Use executing-plans inline and obtain one independent final review. The user's complete design brief authorizes implementation in this worktree, on top of `523487d`; commit locally and do not push.

## Scope and design

Keep native dialog semantics and every existing action. Opt the arcade's menu, rules, accounts and leaderboard dialogs into a neutral regular-glass sheet. Style game-owned options, statistics and multiplayer panels through presentation CSS only. Movies keeps the legacy sheet material. A panel supplies the only backdrop filter; inset groups use plain neutral fills, concentric radii and hairline separators. Mobile sheets have a decorative grabber. Entry has a small spring; exit is quicker; reduced motion removes both.

The existing dock is 52px tall. Increase the smaller desktop game action controls to 40–44px at fine-pointer widths of 1366px or more. Inspect Ball Run and Blockcraft at DSF 1/2; change optics only if a defect is observed.

## Tasks

- [x] Add failing browser coverage for tone propagation, grouped sheet geometry, native submenus, focus/Escape, fallback surfaces and desktop action sizes.
- [x] Implement scoped sheet tokens/layout/motion and desktop sizing. Keep game, account, score, storage and online logic unchanged.
- [x] Capture main menus and submenus for Snake, Fruit Merge, Pool, Minesweeper and home at both requested sizes. Compare against Apple references through multiple visual passes.
- [x] Obtain an independent review and resolve important findings.
- [x] Run check, unit tests, build, affected glass/dock specs and the full Chromium suite. Capture all 44 views, 44 crops, two presses and menus from production preview 4173.
- [x] Restore generated tracked evidence; inspect the source-only commit stat. Update the external Round 12 report with exact results and visual limitations. No push or deployment.

## Verification boundaries

Preserve names, roles, modal focus, Escape, keyboard order and every menu action. Check the light/dark ink, scrollable long sheets, native submenus and opaque accessibility fallbacks. Inspect both busy dock backgrounds at full resolution and all 21 games after desktop sizing. No edits to `src/movies/*`, ads, configuration, environment, databases, Netlify, scoring, saves, online play or game logic. Never commit PNG, WebM or generated evidence JSON.

Verification history: all258 glass/dock checks pass; full run984 passed,6 failed,2 skipped. Six selected reruns passed unchanged; the remaining Minesweeper exit-animation helper was corrected to native [open] and all13 Minesweeper tests pass. Every nonoptional case has a passing execution. A clean combined full run remains the Round13 completion gate.
