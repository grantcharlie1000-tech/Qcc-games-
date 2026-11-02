# Round 12 Liquid Glass implementation plan

> **For agentic workers:** Use executing-plans inline; obtain one independent final review.

**Goal:** Bring arcade glass closer to the supplied Apple references: neutral clear interiors, crisp luminous rims, clean bezel optics, compact HUDs and a separate home Menu lens.

**Architecture:** Keep the existing opt-in arcade material and legacy Movies path. The home navigation group contains a five-tab lens and an independently bound Menu circle. Retain the existing scroll controller and coordinate companion visibility/focus within the arcade group. HUDs shrink to their content inside the existing reserved dock area.

**Tech stack:** TypeScript, CSS, SVG displacement maps, Vitest and Playwright Chromium.

**Spec:** User's Round 12 brief and `/workspace/qcc-liquid-glass/refs/`.

## Global constraints

- Work in this worktree on `ui/liquid-glass-ingame`; commit locally, never push or change the PR.
- No edits to Movies source, ads, configuration, environment, databases, Netlify, scoring, saves, online play or game logic.
- Keep keyboard order, accessible names, scroll minimize/hide and accessibility preferences.
- No committed PNG/WebM/evidence JSON. Restore regenerated evidence before commit.
- Final production captures: 44 full views, 44 dock crops and two held presses in `round-12/`; preserve manifest schema.

## Review focus

- Home Menu remains reachable when minimized, restores focus after dialogs, and disappears with the home navigation on game/Movies routes.
- Short and multi-stat HUDs remain centered and fit at 320px, 390px and desktop, including growing live values.
- DSF 1/2/3 maps stay monotonic, clamp within the sampled backdrop, and leave the central area undistorted.
- Light controls and neutral dark controls retain 4.5:1 glyph contrast, including hover/press and opaque fallbacks.
- Movies material remains unchanged; diagnose flaky test readiness rather than masking animations or weakening assertions.

### Task 1: Compact controls and home navigation

Files: `src/main.ts`, `src/style.css`, `src/game-viewport.css`, `src/theme.css`, `src/ui/glass.ts`, `tests/e2e/apple-glass.spec.ts`, affected legitimate home-menu locators, `scripts/capture-ingame.mjs`.

Interfaces: `.app-navigation` groups `.app-tabbar` and `.app-menu`; the tab bar still owns scroll state. `.glass-control` identifies an independent interactive lens; `.game-glass` remains supported.

- [x] Add failing tests for content-sized HUDs, five home tabs plus separate Menu, keyboard order, minimize/hide/focus, and both fallback surfaces.
- [x] Implement structure/layout and update capture union to the home navigation group.
- [x] Run affected glass, focus and shell specs; inspect phone/desktop crops.

### Task 2: Optical material and visual iterations

Files: `src/theme.css`, `src/ui/glass.ts`, `tests/core/glass.test.ts`, `tests/e2e/apple-glass.spec.ts`, `tests/e2e/lens-refraction.spec.ts`.

Interfaces: Preserve legacy default lens field; arcade uses an explicitly bounded convex bezel. Shared neutral tint/rim tokens cover home and game lenses, with regular home diffusion and clear in-game interiors.

- [x] Add checks for central identity, finite edge samples, no folds, uniform home material and actual rendered contrast.
- [x] Reduce colour amplification, sharpen specular arcs, add a faint inner luminous line and refine the bezel.
- [x] Capture at least three visual passes; build/open matching-height Apple comparisons and record honest critiques.
- [x] Verify all 21 games, both sizes, held presses and accessibility variants.

### Task 3: Reliability, verification and local delivery

Files: Movies test readiness only if evidence warrants it; external report/evidence in `/workspace/qcc-liquid-glass/`.

Interfaces: Existing fixtures and production preview; capture format unchanged.

- [x] Reproduce/instrument the three Movies flakes and fix test synchronization at the observed boundary if necessary.
- [x] Obtain independent code review; resolve important findings.
- [x] Run `npm run check`, `npm test`, `npm run build`, focused glass/dock specs and the full Chromium suite; record exact counts.
- [x] Capture all final images from production preview 4173 and open all dock crops plus `APPLE_COMPARISON.jpg`.
- [x] Restore `docs/evidence`, `tests/games/*/evidence/*`, and tracked PNGs; commit source/tests only and verify commit stat.
- [x] Append and print the Round 12 report, including remaining material/fallback differences.
