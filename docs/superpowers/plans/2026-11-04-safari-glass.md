# Safari glass and iOS sheets implementation plan

> **For agentic workers:** Use `executing-plans` to implement this plan inline, with one independent review of the final branch.

**Goal:** Match the supplied Safari material and finish sheet gestures, live canvas glass, and navigation alignment.

**Architecture:** Retain Vite/TypeScript, Chromium's SVG displacement, and the shared WebGL2 canvas lens. Use one near-clear optical recipe for navigation and game controls; use a light, readable frost for sheets. Keep gestures and scroll locking in the existing shared sheet lifecycle.

**Tech Stack:** TypeScript, CSS, Canvas2D/WebGL2, Vitest, Playwright Chromium and WebKit.

**Spec:** The user's November 4 task and reference images in `/home/box/shared/`.

## Global constraints

- Work on `ui/glass-safari-match`; fetch/rebase first, following `npm ci`.
- One test suite/browser and one server at a time, ports 47xx; stop servers afterwards.
- Preserve gameplay and all original start menus except Slither's existing glass sheet.
- No taglines, numbered instructions, D-pads, or Flap button; no shooter or PR #81/#82/#83 changes.
- Never print secrets; no main push, merge, or deployment.
- Small logical commits; attempt `git push -u origin ui/glass-safari-match` after each goal.
- Before images must come from `origin/main`; final images and report go in `/workspace/glass-versions/safari-match-nov4/`.

## Review focus

- Sheets reopened during a pending close must not inherit the old gesture or scroll lock.
- Native scrolling, form controls, nested sheets, pointer cancellation and multiple touches must remain usable.
- Canvas glass must update after each completed game frame, including when motion is reduced or GPU support is absent.
- Safe areas must move navigation companions together without changing either painted height.
- Frost and adaptive ink must remain readable over both bright and dark artwork.

### Task 1: Baseline and shared material

**Files:** `src/theme.css`, `src/ui/section-navigation.css`, `src/ui/glass-ink.ts`, `src/ui/arcade-sheets.css`, `src/ui/native-glass.css`, relevant existing material tests.

**Interfaces:** Preserve `bindGlass`, `glassInk`, the SVG map API and all game-facing classes. CSS tokens own the shared clear and frosted materials.

- [x] Capture mobile 393×852 and desktop home, sheet, Claimline and Crossy from a detached `origin/main` baseline, then stop that server.
- [x] Verify the current unit baseline serially. Record failures rather than broadening task scope.
- [x] Replace navigation's dark veil and heavy blur with near-clear tint, subtle softening and a bright thin rim; retain edge displacement.
- [x] Make sheets light and frosted enough for plain dark text; align ink selection with the new clear material.
- [x] Run material/contrast checks and inspect actual screenshots, then commit and attempt push.

### Task 2: Finish handle dismissal and scroll lock

**Files:** `src/ui/sheet.ts`, `src/ui/sheet-swipe.ts`, `src/ui/scroll-lock.ts`, handle-bearing custom panels, `tests/e2e/sheet-swipe.spec.ts`.

**Interfaces:** Preserve `openSheet(dialog, trigger?)`, `bindSheetSwipe`, `lockPageScroll(): () => void`, and the owners' cancel/close behavior.

- [x] Reproduce handle/body drag, scrolled body, cancellation, focus return, nested locks and navigation cleanup in one serial browser suite.
- [x] Add failing coverage for missing behavior before changes.
- [x] Fix only the shared gesture/lifecycle gaps, including every sheet with a visible handle; preserve native scrolling and controls.
- [x] Verify long drag/flick/short drag, cancellation, reopening, reduced motion and background scroll restoration; commit and attempt push.

### Task 3: Live canvas material on iOS

**Files:** `src/ui/webgl-glass.ts`, `src/ui/webgl-glass.css`, `src/ui/glass-frame-source.ts` if necessary, `tests/e2e/webgl-glass-lens.spec.ts` or a focused regression suite.

**Interfaces:** Keep existing game frame publishers and rendering/simulation behavior. Reuse one shared context, bounded crops and frame delivery; no independent animation loop.

- [ ] Inspect real Claimline, Crossy and Snake source/lens geometry and frame delivery, then demonstrate the stale path with a changing canvas fixture.
- [ ] Write failing same-frame pixel checks and fallback/preference coverage.
- [ ] Ensure visible lens output follows current canvas pixels every frame, including CSS fallback paths where needed; bound copies and avoid per-frame pixel readbacks.
- [ ] Verify pause/hidden/navigation idling and source cleanup; record host CPU measurements and real-phone limits; commit and attempt push.

### Task 4: Navigation alignment

**Files:** `src/style.css`, `src/ui/section-navigation.css`, navigation regression tests.

**Interfaces:** Keep current navigation semantics and minimized states. One shared height/bottom anchor includes the safe-area offset once.

- [ ] Add a failing geometry check with an emulated nonzero bottom safe area.
- [ ] Fix actual painted nav/hamburger height and vertical alignment at mobile and desktop sizes.
- [ ] Verify expanded, minimized and keyboard-focus states; commit and attempt push.

### Task 5: Final evidence and review

- [ ] Run `npm run check`, `npm run build`, and `npm test -- --maxWorkers=1 --no-file-parallelism` serially.
- [ ] Run relevant Playwright suites serially, Chromium first and WebKit after, with one worker.
- [ ] Capture final mobile/desktop images and make an exact-scale Safari/ours crop comparison.
- [ ] Obtain independent branch review, address material findings, and rerun affected checks.
- [ ] Write the requested external `REPORT.md` with commits, push status, tests and real-iPhone gaps; stop servers and verify clean branch state.
