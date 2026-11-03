# Round 11 — Apple material implementation plan

> **For agentic workers:** Use `executing-plans` to implement the authorized brief in this worktree. Use an independent final reviewer.

**Goal:** Make the arcade dock and home bar read as clear, raised Apple-style glass over the game's surface, with usable controls in all 21 games.

**Architecture:** Keep the existing browser capability, disposal, focus and tabbar machinery. Opt the arcade into a convex lens profile and scoped material tokens; Movies retains the legacy profile and styling. Give the dock three independent surfaces and continue game backgrounds through the reserved control area without changing playable coordinates.

**Tech stack:** Existing TypeScript, CSS, SVG displacement maps, Vitest and Playwright; no dependencies.

**Spec:** User's “Round 11: make the glass actually look like Apple Liquid Glass” brief and `/workspace/qcc-liquid-glass/refs/`.

## Global constraints

- Work on `ui/liquid-glass-ingame`; commit locally, never push, merge or touch PR #80.
- No changes to Movies, ads, Netlify config, environment, database, scoring, saves, online play or game logic.
- No committed PNGs. Evidence belongs in `/workspace/qcc-liquid-glass/round-11/`.
- Preserve all 21 games, responsive layout, keyboard/focus and home hide/minimize behavior.
- Reduced transparency, more contrast and forced colors use opaque bordered surfaces. Reduced motion removes elastic effects.

## Review focus

- Three independently refracting objects must retain the real backdrop, including at device scale 2.
- Layout changes must reserve space for every interactive control, including short screens and Wordle's keyboard.
- Clear dark and pale light materials need readable glyphs without heavy text shadows.
- Movie material and filter behavior must stay unchanged despite shared code.
- Route disposal, resize and accessibility changes must remove stale filters, observers and press state.

### Task 1: Material and separate dock objects

**Files:** `src/theme.css`, `src/ui/glass.ts`, `src/ui/game-chrome.ts`, `src/ui/tabbar.ts`, `src/main.ts`, `src/game-viewport.css`, glass unit/e2e tests.

**Interfaces:** `.arcade-glass` opts into the arcade material; `data-glass-tone="light|dark"` selects tint and ink. `bindGlass` continues to return `dispose()`; default consumers retain their material. Each `.game-dock` child is its own glass surface.

- [x] Add tests for separate lenses/gaps, backdrop coverage, adaptive tone, press/reduced motion and opaque fallbacks; observe expected failures.
- [x] Add a convex squircle bezel using Snell refraction, preserving the legacy map by default; test inward rim sampling and stationary centre.
- [x] Scope the new tint/rim/shadow/clear blur to arcade surfaces; use a restrained scale lift and existing spring tokens.
- [x] Extend each game's presentation background under the dock with reserved play space; keep game logic untouched.
- [x] Run focused unit/browser checks and inspect first captures.

### Task 2: Capture and visual refinement

**Files:** `scripts/capture-ingame.mjs`; evidence outside Git.

**Interfaces:** `<id>-<format>.png`, `<id>-<format>-dock.png`, `home-<format>.png`, `home-<format>-dock.png`; mobile 390×844 touch DSF2, desktop 1366×768.

- [x] Extend capture coverage to home and 24px-margin dock crops; capture through production preview on 4173.
- [x] Open every game's crop and compare representative light/dark crops next to Apple references.
- [x] Iterate material/layout where evidence shows problems; put final images in `round-11/` and document honest limitations.

### Task 3: Verification, review and local commit

- [x] Run `npm run check`, `npm test`, `npm run build`.
- [x] Run Chromium glass/material/menu/redesign/Movies suites and every spec that touches the dock; record exact passed/skipped/failed counts.
- [x] Request independent review of the scoped diff and visual evidence; resolve material findings and verify affected behavior.
- [x] Confirm protected paths and committed image list are unchanged; commit locally.
- [x] Append and print “Round 11 — Apple material” in the external REPORT.md with checks, visual assessment and browser differences.

## Execution notes

The user supplied an explicit implementation brief and authorized execution. The native implementation and final independent review proceed without another design approval. Background classification follows the actual rendered surface, which is dark for several games the brief groups as light examples; light and dark variants are both exercised explicitly.
