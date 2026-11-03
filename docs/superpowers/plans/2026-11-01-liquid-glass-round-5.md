# Liquid Glass Round 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Correct the spacing and small dock text identified in Charlie's Round 5 feedback, then re-audit all 21 games.

**Architecture:** Retain the existing shared Liquid Glass dock and game adapters. Correct CSS sizing and alignment at their source; keep square boards proportional and controls in reserved space.

**Tech Stack:** Vite, TypeScript, CSS, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-liquid-glass-ingame-design.md`, as refined by the user's Round 5 request.

## Global Constraints

- Layout/presentation and verification only; no game logic, scoring, account, DB, function, movie, player, ad, pricing, environment or prompt changes.
- Use the existing `ui-tabbar`, `ui-tab`, `bindGlass` and glass material; do not duplicate them.
- Work and commit on `ui/liquid-glass-ingame`; no push, merge or deployment.
- Capture every game at 390×844 with mobile touch and 1366×768. Open all 42 final screenshots. Save PNGs outside the repository.

## Review Focus

- Large Minesweeper boards must retain scroll/pan access after centring the small board with its controls.
- Wordle must keep square tiles and reachable keys when browser toolbars reduce the viewport height.
- Longer HUD values and narrow 320px displays must fit after enlarging dock labels and icons.
- Full-screen game docks must stay inside existing HUD reservations without covering input or gameplay.
- Other mobile games must have balanced board/control groups, not large isolated empty bands.

### Task 1: Correct spacing and shared readability, then verify the catalogue

**Files:** `src/game-viewport.css`, `src/games/minesweeper/style.css`, `src/games/fivefold/style.css`, other game presentation CSS only if the full visual pass reveals a defect; `tests/e2e/ingame-glass.spec.ts`; external screenshot/report artifacts.

**Interfaces:** Consumes the existing dock classes and native game DOM. Produces the same selectors, state, lifecycle and event bindings with corrected rendered geometry.

- [x] Extend browser regressions to catch separated Minesweeper controls, Wordle's large keyboard gap, and unreadably small dock type/icons. Run the focused cases before CSS changes; expect failures reproducing the feedback.
- [x] Centre Minesweeper's board/status/toggle as a group while constraining oversized fields. Balance Wordle's board/keyboard group and use available width for square tiles. Raise shared dock labels to at least 12px, values to at least 18px and icons to 24px while retaining 44px targets and a compact dock.
- [x] Run the focused regressions; expect all passing. Inspect large-board, narrow and short-viewport cases using existing game/layout tests.
- [x] Run `node scripts/capture-ingame.mjs round-5`; expect 42 captures with no page errors. Open every image; correct any observed presentation defects and recapture a complete final round (at most three additional passes).
- [x] Run `npm run check`, `npm test` and relevant shared/game Playwright specs in Chromium and WebKit. Record exact commands/counts; compare unrelated failures with `origin/main` e54c41b.
- [x] Audit the diff and obtain a fresh independent review. Resolve material findings and verify affected cases. No generated PNGs in the commit.
- [x] Commit the correction on the requested branch, update `/workspace/qcc-liquid-glass/REPORT.md`, and print its Round 5 section.
