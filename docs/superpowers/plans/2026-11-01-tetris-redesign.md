# Tetris Redesign Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, with an independent whole-branch code review. Steps use checkboxes for tracking.

**Goal:** Give Quadfall the shared Liquid Glass dock, a large unobstructed board, and reliable mobile Tetris gestures.

**Architecture:** Keep the existing deterministic canvas model and scoring/save/report API. Separate pointer recognition and keyboard repeat timing into game-local helpers. Cache canvas sizes in ResizeObserver, render dirty state through rAF, and keep DOM reports event driven. Reuse the host dock and native glass dialog styling.

**Tech Stack:** Existing TypeScript, Canvas 2D, CSS, Vitest, Playwright; no new libraries.

**Spec:** User's detailed redesign request and `src/games/quadfall/SPEC.md` (updated with final controls).

## Global Constraints

- Work only on ui/tetris-redesign in /workspace/qcc-tetris. Use ports 4195/4196.
- Preserve scoring, high-score reporting, saving, and leaderboard behavior.
- Never edit protected shared glass/shell/CSS/e2e files listed in the user request.
- Shared changes limited to Quadfall HUD field configuration and host Escape routing/removing the obsolete touch-grid setting.
- Capture untouched before shots, matching after shots, game over, contact sheet and gesture video outside git.
- No push, merge, or deployment. Small verified commits; restore tracked evidence before each commit.

## Review Focus

- Pointer cancellation, second fingers, dialog opening, and piece changes during a drag must never trigger a second action on a new piece.
- Slow downward drags versus fast downward flicks must retain distinct scoring and avoid double soft/hard drops.
- Focused native buttons, key repeat, lost focus and resuming must not accidentally drop or keep moving pieces.
- Rotation and viewport changes must preserve the run, keep previews off the spawn area, and maintain DPR sizing without frame-time layout reads.
- Game-over sheets must permit dock/menu access, keyboard replay, correct best score, and save restoration.

### Task 1: Input timing and gesture helpers

**Files:** Create `src/games/quadfall/input.ts`; extend `tests/games/quadfall/model.test.ts`.
**Interfaces:** Actions: left/right/cw/ccw/soft/hard/hold. Gesture recognizer consumes pointer positions, time and cell size; returns whole-cell actions and one terminal tap/flick/hold. Repeat helper uses 133 ms DAS and 33 ms ARR; soft repeat uses 33 ms.

- [x] Add tests for exact cell tracking, drag reversal, soft drop, flick, hold, cancellation and repeat timing. Run and observe failure.
- [x] Implement helpers, preserving model scoring/500 ms lock/15-reset behavior.
- [x] Run Quadfall unit tests and TypeScript check. Commit passing helpers/tests.

### Task 2: Board, HUD, lifecycle and gestures

**Files:** `src/games/quadfall/{index.ts,style.css,SPEC.md}`, `src/ui/game-chrome.ts`, `src/main.ts`, `tests/games/quadfall/{play,layout}.spec.ts`; optional test helper in this test directory.
**Interfaces:** Existing GameContext and GameInstance; host dock reads score plus game-root level/lines attributes. Native nonmodal game-over glass dialog, shared modal menu for Escape.

- [x] Replace legacy e2e expectations with tests for shared dock/no grid/header, 88% phone width, all gestures and keys, start/replay, save/line-clear, pause/cancellation, and viewport/DPR invariants. Observe failing requested behavior.
- [x] Implement top-band previews, maximum-height board, minimal start prompt, glass game-over sheet and bindings using Task 1 helpers.
- [x] Make renderer dirty/event driven with cached sizing and a 150 ms line-clear flash/collapse and optional vibration; reduced motion uses a gentle static flash.
- [x] Run check, units, build and Quadfall chromium/webkit e2e. Commit verified implementation.

### Task 3: Visual evidence and independent review

**Files:** External evidence in `/workspace/qcc-liquid-glass/tetris/`; only fixes and tests in the scoped source/test files.

- [x] Inspect 320x568, 390x844, 430x932, 844x390 and 1366x768; capture after start/mid-game/game over and labelled contact sheet; record gesture demo.
- [x] Request fresh independent code review of base 8a68e52 to final work.
- [x] Fix material findings with regression tests; run required affected checks.
- [x] Restore tracked evidence, commit any final fixes, leave branch ready for supervisor.


## Final verification

- `npm run check`: passed.
- `npm run build`: passed (existing large-chunk warning only).
- `npm test -- --maxWorkers=2 --minWorkers=1`: 161 files, 3,284 tests passed.
- `ARCADE_URL=http://127.0.0.1:4195 npx playwright test tests/games/quadfall --project=chromium --project=webkit --workers=1`: 64 passed, 2 WebKit native-fullscreen skips.
- Independent review: four Important findings fixed with failing-then-passing regressions: held-Space replay, tablet preview overlap, fullscreen exit routing (including delayed duplicate notices), and results dismissal/dock access.
- Local DPR 3 probe: 120 frames at 60 fps, 16.8 ms p95, zero game geometry reads during frames; 360×720 CSS board backed by 1080×2160 pixels.
- External evidence: `/workspace/qcc-liquid-glass/tetris/` contains before/after start and mid-game shots, game over, `TETRIS_BEFORE_AFTER.jpg`, and `gestures-after.webm`.
- Shared edits are limited to Quadfall HUD fields in `src/ui/game-chrome.ts` and Quadfall host Escape/fullscreen routing and removal of its obsolete touch-grid setting in `src/main.ts`. Protected shared files are unchanged.
- No push, merge, or deployment.
