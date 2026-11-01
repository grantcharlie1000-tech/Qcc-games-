# Liquid Glass Round 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Use the available space in Pool, Flappy Bird and desktop Water Sort, then inspect every game again.
**Architecture:** Preserve the shared home glass component. Pool chooses a portrait or clockwise landscape rendering of the same model coordinates and inverse-maps native input; CSS reserves the canvas, HUD and footer without scaling down text. Water Sort changes only tube layout and sizing. Flappy Bird uses a taller portrait presentation of its existing logical flight.
**Tech Stack:** Existing TypeScript, Canvas, CSS, Vite, Vitest and Playwright.
**Spec:** `docs/superpowers/specs/2026-10-31-liquid-glass-ingame-design.md`, refined by the user's Round 6 brief.

## Global Constraints

- Presentation/rendering/input mapping only. No physics, rules, scoring, persistence/network protocol, account, movie/player/ad, DB, function, environment or prompt changes.
- Keep the user's accepted Minesweeper, Wordle and shared dock styling.
- Stay on `ui/liquid-glass-ingame`; commit locally, no push/merge/deployment.
- Start final captures at round-9, all 21 games at 390×844 touch/mobile and 1366×768. Open all 42, at most three further full passes. PNGs stay outside the repo.

## Review Focus

- Portrait Pool pointer coordinates, hit radius, aiming/pull power, placement and keyboard screen axes must reach the unchanged model; orientation changes cancel held strokes.
- Pocket names and numbered destinations must match both views, including an 8-ball finish and mixed-orientation online players.
- Pool status/player names/in-hand text must not shrink or obscure the table on 320px and short screens.
- Water Sort must preserve pour alignment and hit targets while resizing or changing between one/two rows.
- Flappy Bird must keep every gate and boundary visible, with reachable Flap and unchanged flight simulation.

### Task 1: Pool portrait rendering and usable layout

**Files:** `src/games/pool/{index.ts,input.ts,render.ts,style.css}`, presentation registration in `src/main.ts` and `src/game-viewport.css`; `tests/games/pool/`, `tests/multiplayer/pool-online.spec.ts`, `scripts/pool-verifier-shot.mjs`.
**Interfaces:** Existing model/online commands remain unchanged. `tablePoint(..., portrait=false)` and `drawTable(..., portrait=false)` choose view transforms only. Pool uses the existing native-size stage registration instead of scaling its entire UI.

- [x] Add failing portrait mapping and layout regressions: table height at least 420px at 390×844, readable status/selector, real native aiming/pull, placement, cancel on orientation change; confirm RED.
- [x] Implement portrait canvas projection and inverse input; maintain upright text and correctly named pocket choices. Put status and pocket choice together below the table; reserve a power gutter. Keep PC landscape and readable actual text.
- [x] Adapt existing pointer evidence helpers to both orientations without removing assertions; run Pool unit/browser checks. Expected: PASS, including direct input and unchanged online state.

### Task 2: Flappy Bird and Water Sort space

**Files:** `src/games/flappy-bird/style.css`, `src/games/water-sort/{index.ts,style.css}`, Water Sort scene width in `src/game-viewport.css`; `tests/e2e/ingame-space.spec.ts` and relevant game specs.
**Interfaces:** Existing simulation/session and semantic DOM actions unchanged; only presentation dimensions/row arrangement change.

- [x] Add layout tests reproducing Flappy's large unused vertical bands and Water Sort's narrow PC column. Expected: FAIL before changes.
- [x] Use the remaining phone flight-panel height. Give Water Sort a wide desktop stage, one row when tubes fit, larger proportional tubes and grouped Undo/Hint; preserve two rows on phones and dense levels. Arrow-key focus follows the displayed row count.
- [x] Run shared spacing and affected game tests. Expected: PASS with actual controls and pours.

### Task 3: Complete evidence, review and delivery

**Files:** capture script only if needed, external `/workspace/qcc-liquid-glass/` reports/screenshots, this plan.
**Interfaces:** Consumes final UI; no application behavior changes.

- [x] Capture round-9 (and only necessary complete follow-up rounds); open all 42 per round, fix layout findings. Expected: no observed dead-space imbalance, tiny essential text, clipping or overlap in final requested sizes.
- [x] Run `npm run check`, `npm test`, `npm run build`, shared dock/space and all Pool, Flappy Bird, Water Sort browser specs; attempt WebKit and online Pool. Record exact counts and baseline/environment failures.
- [x] Strict self-audit and independent code review; resolve material findings and retain coverage. Preserve generated evidence outside git.
- [x] Commit on the requested branch; append Round 6 to REPORT.md, refresh final paths/per-game changes and print the Round 6 section.
