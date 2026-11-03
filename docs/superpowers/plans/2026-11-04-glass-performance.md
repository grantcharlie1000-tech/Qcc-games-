# Performance-first glass implementation plan

> Execute inline using `executing-plans`; one independent review after the substantial changes.

**Goal:** Meet Charlie's November 4 performance, solid-white glyph and readable-menu requirements, which supersede the earlier per-frame optical fidelity requirement.

**Architecture:** Retain existing games, native dialog/sheet lifecycles and navigation geometry. Replace runtime SVG/WebGL backdrop processing with inexpensive CSS tint/rim/shadow. Remove adaptive glyph sampling. Use a stronger flat text backing for menus without adding filters.

**Tech stack:** Vite/TypeScript, CSS, Vitest and sequential Playwright Chromium/WebKit.

**Spec:** User's latest message: performance beats looks; white glyphs always; AA menu contrast measured from screenshot backdrops.

## Constraints and review focus

- Keep branch `ui/glass-safari-match`, gameplay and original game menus. Do not edit leaderboard code, Tetris control code, shooter or PRs #81/#82/#83.
- One suite/browser and one dev server at a time; ports47xx; stop task servers. Preserve the other run's work.
- No large/animated filters, stacked blur, full-width scroll blur, per-frame backdrop copies or scroll-driven ink sampling. Use `will-change` only if measured necessary.
- Compare main and final with identical Chromium frame-time sampling: mobile393×852 at 4× CDP CPU throttle and desktop. Record median/p95, raw samples and host limits; aim p95≈20ms and no regression from main.
- Every glass navigation/menu/button icon and label remains solid white over light/dark art and hover/press. No adaptive tint or recolouring halo.
- Audit glass menus over light/dark/busy backdrops, including canvases: 4.5:1 body, 3:1 large. Capture matching before/final states.
- Commit performance, `Icons stay solid white`, and `Readable glass menus` separately. Push feature branch, open PR if possible, never merge/deploy.
- Preserve dialog focus/scroll and swipe cancellation, safe areas, original menu palettes, forced-colour accessibility and cleanup when routes change.

### Task 1 — performance

Files: `src/ui/glass.ts`, `src/theme.css`, `src/ui/section-navigation.css`, `src/ui/game-sheet.css`, large glass CSS owners; `tests/e2e/glass-performance.spec.ts` and focused resource regression tests.

- [x] Add Playwright frame-time measurement and record an `origin/main` baseline from a detached worktree, then stop its server. Preserve before menu shots in identical controlled states.
- [x] Demonstrate current active filters/canvas copies with a failing runtime cost regression.
- [x] Remove live optical binding and filter layers; make selected-tab highlighting CSS-owned; eliminate animated layout transitions and unnecessary layer hints. Preserve source/game APIs.
- [x] Run cost guards and typecheck; commit and attempt push. Final gesture/navigation checks and the comparative benchmark follow after the glyph and menu changes.

### Task 2 — white glyphs

Files: `src/ui/glass-ink.ts`, `src/theme.css`, glass button owners, core/Playwright white-ink tests.

- [ ] Add failing checks for computed white SVG/label colour, opacity and no recolouring filter over light/dark art, hover/active and route/scroll states.
- [ ] Remove adaptive sampling/listeners/timers; enforce static white in the shared glass chrome without changing game artwork or coloured gameplay markers.
- [ ] Run focused tests; commit exactly `Icons stay solid white`; push.

### Task 3 — readable menus

Files: `src/theme.css`, shared sheet/native-glass CSS, Movies menu styles, screenshot contrast helpers and `tests/e2e/glass-readability.spec.ts`.

- [ ] Inventory every shared glass menu family and add screenshot-pixel contrast checks on actual glyph positions, over light/dark/busy backdrops and canvases. Watch affected examples fail.
- [ ] Add flat scrims and readable text/control fills without blur. Preserve original game menus, leaderboard/Tetris owners and input behavior.
- [ ] Run the complete audit in Chromium then WebKit; capture matching before/final views; commit exactly `Readable glass menus`; push.

### Task 4 — final evidence

- [ ] Run final benchmark against main and report median/p95 per scenario with honest target gaps.
- [ ] Independent review; fix substantive findings and rerun affected checks once.
- [ ] Typecheck, production build and serial full unit suite; relevant browser suites one at a time.
- [ ] Capture final mobile/desktop views and rebuild `final/safari-vs-ours.png` at the original comparison scale.
- [ ] Final feature push, create/update PR without merging, update external `REPORT.md` and preserve original iteration evidence.
- [ ] Stop task server, remove only own baseline worktree/scratch and verify branch state.
