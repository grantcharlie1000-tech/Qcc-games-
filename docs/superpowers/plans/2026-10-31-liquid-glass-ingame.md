# Liquid Glass in-game UI Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Give all 21 games more play space with one shared Liquid Glass dock.

**Architecture:** Reuse the home island and native glass sheet. The shell owns lifecycle/actions; game presentation supplies concise HUD data and existing secondary controls. Keep game models and the frozen context API unchanged.

**Tech Stack:** Existing Vite, TypeScript, semantic DOM/CSS, Playwright and Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-liquid-glass-ingame-design.md`

## Global constraints

- Interface layout and presentation ONLY. No gameplay/scoring/accounts/DB/functions/movies/ads/pricing/env/prompts changes.
- Only branch `ui/liquid-glass-ingame`; commit, never push/merge/deploy.
- Real active-game screenshots at 390×844 with touch and 1366×768; PNGs outside git.
- Reuse `src/ui/glass.ts`, `src/theme.css`, existing input/focus/sheet/lifecycle mechanisms.

## Review focus

- Closing nested menus, Study or hidden tabs must not unexpectedly resume.
- Difficulty/mode selectors must remain operable after relocation, including delegated events.
- Dynamic boards and changing visual viewport must not collide with the dock.
- Touch controls must keep usable hit areas; mouse-only layouts must allow enabling them.
- Disposing/re-entering games must remove observers, glass filters and UI event listeners.

### Task 1: Shared dock and menu

Files: `src/main.ts`, `src/ui/game-chrome.ts`, `src/game-viewport.css`, `src/theme.css`, `tests/e2e/ingame-glass.spec.ts`.

Interfaces: consumes existing `bindGlass` / `openSheet`; produces presentation-only `setGameHud(container, items)` and secondary-controls registration with cleanup. Existing score/level/status callbacks and action IDs remain available.

- [ ] Write browser coverage for actual pause/resume, rules/settings transitions, accessible focus, useful centre metrics, dock-stage separation and lifecycle.
- [ ] Run focused browser tests and observe missing-dock failures.
- [ ] Implement dock, menu and responsive exclusion geometry; preserve score/storage callbacks.
- [ ] Run focused coverage and typecheck; commit.

### Task 2: Catalogue adaptation and visual evidence

Files: relevant `src/games/*/index.ts` presentation sections and styles; `scripts/capture-ingame.mjs`; affected browser tests.

Interfaces: consumes Task 1’s HUD/secondary-control helpers; no model API changes.

- [ ] Inspect all game layouts and record per-game choices from the spec.
- [ ] Adapt local presentation; preserve all essential actions and control hit areas.
- [ ] Capture every started game at both requested sizes; inspect every image, fix/re-shoot defects.
- [ ] Update old-toolbar browser assertions without removing behavioural coverage.
- [ ] Verify dynamic board, short viewport, focus/preferences and pause cases; commit.

### Task 3: Verification, review and delivery

Files: review fixes, report and plan progress only.

Interfaces: consumes all prior changes and screenshot evidence.

- [ ] Run `npm run check`, `npm test`, affected Chromium and WebKit specs; diagnose and compare unrelated failures with `origin/main`.
- [ ] Independently review the full diff and audit it as author; fix verified findings and rerun affected checks.
- [ ] Capture and personally inspect the full final screenshot round.
- [ ] Write `/workspace/qcc-liquid-glass/REPORT.md`, commit branch changes and print report; no publication.
