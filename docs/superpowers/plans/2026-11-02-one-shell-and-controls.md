# One shell, shared sheets and floating controls implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The requested worktree is already isolated. Implementation stays inline; independent review is read-only.

**Goal:** Finish CI repairs, then make all five sections one persistent shell, with matching control geometry, honest draggable sheets and a reusable compact game dock.

**Architecture:** The app owns one navigation element, glass binding and scroll/collapse controller for its lifetime. Movies and Study supply route/scroll context instead of constructing navigation. Shared sheet gestures and typed dock presentation live under `src/ui/`; games continue to own their models, actions and state.

**Tech Stack:** Existing TypeScript, DOM/CSS, Vite, Vitest and Playwright. No new UI dependency or engine.

**Spec:** Supervisor's 2 November follow-up in the current conversation (steps 3–9), plus `/workspace/codex-briefs/POLISH-AUDIT-CHECKLIST.md`. Evidence directories are under `/workspace/qcc-liquid-glass/`.

## Global constraints

- Commit each requested step separately on `ui/liquid-glass-ingame`; never push, merge, touch the PR or trigger deployment.
- No PNG, WEBM or evidence JSON in commits. Restore generated `docs/evidence`, `tests/games/*/evidence/*` and tracked PNGs before committing.
- Do not change Movies data/catalog/network/provider/playback/storage/model logic, ads, configuration/environment, scoring, saves or online logic.
- Astra owns the glass recipe in `theme.css`, `glass.ts`, `glass-ink.ts` and related material files. Consume existing material classes; subsequent work changes geometry, structure, typography and interactions only. Any required material-value fix is reported instead.
- Other Sol runs own game directories. Keep this run in shared shell/UI code; supply a backwards-compatible typed dock API and document it for Water Sort/Crossy Road consumers.
- Preserve accessible names/actions, focus traps, Escape, keyboard navigation, reduced motion and opaque accessibility fallbacks.

## Review focus

- A persistent navigation root must survive Movies redraws, Study's app-inert overlay, nested sheets and browser history without stale scroll listeners or material flashes.
- The Games slot always routes to the library, while the existing Study return shortcut can retain its established game-resume behavior.
- Dragging content may dismiss only at scroll top; form controls, native fullscreen, pointer cancellation and nested sheets keep their normal actions.
- Compact control/action/stat combinations at 320px and landscape must remain legible and avoid playable cells; all hit targets remain at least44px.
- Screenshot/contrast fixtures must observe stable geometry and actual rendered ink, with unchanged 4.5:1 thresholds and explicit missing-ink failures.

### Task 1: Finish CI (step 3), confirm banners (step 4)

**Files:** `scripts/verify-offline.mjs`, `scripts/verify-update.mjs`, contrast/browser helpers and the failing specs only. Existing `a466f16` contains the full-suite shell corrections.

- [x] Read every supplied CI failure and map it to existing corrections or a reproducible remaining issue.
- [x] Add a regression for partially rasterized contrast masks; retain low-contrast and missing-ink rejection. Fix readiness/measurement without reducing4.5:1.
- [x] Use canonical Games back control in verify:offline, including native-menu/pointer-lock readiness. Replace its removed Snake D-pad interaction with a real keyboard turn and verify the saved direction/queue.
- [x] Retry the existing natural online discovery event when an in-flight update check coalesces a menu discovery. Exact build identity, explicit activation, offline retention and quota assertions remain unchanged.
- [x] Prove build plus full verify:offline, update scenarios and affected specs. For any alleged environment-only online failure, retain earlier-baseline evidence; change no online implementation.
- [x] Restore generated evidence, audit the staged paths and commit CI fixes. Confirm `8a68e52` already landed the paint-free/floating-header work.

### Task 2: Matching Menu geometry (step 5)

**Files:** `src/style.css`, `src/ui/section-navigation.css`, a dedicated geometry e2e and capture helper.

**Interface:** shared navigation's `--home-action` consumes the actual bar height. Existing glass classes/recipe stay unchanged.

- [ ] Add failing Games/Movies/TV tests at320/390/1366 for equal circle/bar heights and top/bottom edges, no overlap and44px targets; cover collapsed/keyboard-restored states.
- [ ] Unify only dimensions/radii/spacing. Use a documented compact size at narrow/landscape breakpoints if necessary; all controls in an individual game dock keep one height.
- [ ] Capture production after views beside existing `menu-size/before-*.png`, build/open `MENU_SIZE_BEFORE_AFTER.jpg`, run targeted geometry/glass/focus checks and commit separately.

### Task 3: One persistent shell (step 6)

**Files:** `src/ui/navigation.ts`, `src/ui/tabbar.ts`, shared navigation CSS, `src/main.ts`, Movies UI ownership/markup/CSS and Study UI integration. No Movies transport/model/playback changes.

**Interfaces:** one app-owned navigation controller exposes current section and active scroller; the five stable destinations are Games, Movies, TV Shows, My list and Study. Movies is the entry to Movies home. Owners borrow the controller, never append/recreate its node.

- [ ] Write `one-shell/AUDIT.md` with every DOM, CSS, state, event, focus, sheet and top-control fork, including exact locations and ownership risks. Independent read-only review informs the audit.
- [ ] Capture before switching/collapse videos and Charlie's Games→Movies→first-slot repro before modifying ownership.
- [ ] Add failing identity/button-order/route tests including Study→Games, equal bounding boxes/material styles and equal scrolling behavior on each tab.
- [ ] Move navigation lifetime to the app outside route roots and Study's inert app content; select/rebase one scroll source and preserve collapse state. Remove Movies-only navigation construction/styles/controllers and route-dependent button actions.
- [ ] Share top-control presentation and sheet lifecycle while retaining each section's contextual actions. Update legitimate descendant/label locators.
- [ ] Capture/open `ONE_SHELL_BEFORE_AFTER.jpg`, `REPRO_BEFORE_AFTER.jpg` and before/after switching/repro recordings. Run targeted shell/Movies/Study/focus/update/offline selector smoke checks, review and commit separately.

### Task 4: Menu stats, icons and material structure (step 7)

**Files:** `src/main.ts`, shared game-chrome/stats presentation, shell icons and nonmaterial sheet layout CSS.

- [ ] Open Charlie's Snake menu shot; measure label/value fonts and baselines across all21 game menus. Add failing stats and distinct-icon assertions.
- [ ] Render extra stats using the same label/value component as Score/Best without changing game-owned values or callbacks. Use a trophy/podium for Leaderboards, retaining Favourite's star.
- [ ] Sample five sheet heights and inspect nested groups/backdrop boundaries. Remove an accidental nested material structurally; if the remaining difference requires Astra's recipe values, document the exact cause and requested fix instead of editing them.
- [ ] Capture before/after evidence, verify menu actions/accessibility, review and commit separately.

### Task 5: Shared interactive sheet dismissal (step 8)

**Files:** `src/ui/sheet.ts` and focused shared sheet-gesture/layout modules, main installation, unit/browser drag tests.

**Interface:** retain `openSheet(dialog, trigger)` and native dialog close/cancel callbacks; install one enhancement for every sheet that presents a grab handle.

- [ ] Record `sheets/drag-before.webm` and add failing native pointer tests for distance/velocity dismissal, snap-back, scrolled-content refusal, pointer cancellation and game resume.
- [ ] Track downward drag1:1 from handle/header or top-scrolled content; resist upward handle movement. Fade the existing backdrop proportionally without changing its recipe.
- [ ] Dismiss past about30% distance or sufficient velocity through the same close path as X/Keep playing; otherwise spring back. Support touch, pen and mouse, with immediate settling under reduced motion.
- [ ] Preserve native content scrolling/form interaction and focus through nested sheets. Capture `drag-after.webm`, run sheet/Movies/game-menu checks, review and commit separately.

### Task 6: Compact typed game dock (step 9 and addenda)

**Files:** `src/ui/floating-controls.ts`, `src/ui/game-chrome.ts`, `src/game-viewport.css`, shared UI type declarations and main presentation wiring only.

**Interface:** preserve `createGameDock({backHref,backIcon,menuIcon})` and `{root,back,hud,menu}`. Add typed1–3 stats, up to2 icon actions and placement (`top-left`/`top-center`) through an optional controller/context API. Existing games continue through the existing mirroring adapter.

- [ ] Capture Snake/Tetris/Pac-Man/Globle at390×844 and1366×768 before changing the dock. Open all supplied screenshots.
- [ ] Add failing tests for equal control heights with the bottom circle, menu/more glyph rather than pause, consistent stat baselines, actions at320 and all21 game geometries at320/390/844×390/1366.
- [ ] Overlay a compact safe-area-aware floating cluster and reclaim the former dock-row reservation. Keep playable cells/input clear, using existing free margins and responsive compact layout rather than full-width painted chrome.
- [ ] Expose typed stats/action setters and placement with disposal. Enable top-left for neon-coil centrally; choose the general default from measured collisions/evidence and document it. The other run owns its leaderboard position.
- [ ] Document the exact backwards-compatible API in `dock/API.md` and REPORT.md for Water Sort and Crossy's star. Capture/open before/after views and commit separately.

### Task 7: Standing polish and final verification

**Files:** audit/capture script and legitimate UI/test corrections only; external evidence/report files.

- [ ] Run the full checklist on every game menu/HUD/start/game-over state where present, plus every shell sheet, at390×844/DPR3 in Chromium/WebKit and1366×768; inspect light/dark variants and320px overflow.
- [ ] Save findings/fixes and evidence links in `lg/polish-audit/AUDIT.md`; build/open `AUDIT_SHEET.jpg`. Do not claim ready to push with unresolved findings or cross the explicit protected-source constraints.
- [ ] Run check/unit/build, targeted specs per step, then one final full Chromium pass and offline/update verification. Retain exact counts, failures/corrections and native limitations.
- [ ] Restore all regenerated evidence, audit every local commit for binaries/evidence JSON, leave the worktree clean, update REPORT.md and report local commits. Supervisor owns pushes.
