# Correction skills — 19 October 2026

Independent discovery used `rg --files .agents/skills -g SKILL.md` in the isolated correction worktree (57 installed entries), plus the project registry in AGENTS.md, docs/WORKSPACE_SKILLS.md and docs/SKILL_INVENTORY.md. No new skill or runtime dependency was installed. Paths below are actual files read in this correction session; upstream provenance remains in the unchanged skills.lock.json.

| Exact local source | Concrete application |
| --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | Loaded entry point; its dispatched-subagent stop clause applies. Parent owns independent review/integration. |
| `.agents/skills/systematic-debugging/SKILL.md` | Traced the old card composition and missing floating piece to adapter/CSS; identified cancellation leaving a selected piece armed before editing. |
| `.agents/skills/svg-skill/SKILL.md`, `scenarios.md`, `scripts/validate.sh` | Original flat SVG cube with straight faces, explicit 32×32 viewBox, separate light top/left and dark right/bottom bevels. Shared `gem` geometry for board/tray/drag. Decorative SVG is aria-hidden; colourblind marks remain. Generated seven SVG variants and invoked the real validator, followed by XML parsing. |
| `.agents/skills/animate/SKILL.md` | Feedback and spatial consistency only: instant direct manipulation; 180ms invalid return, 250ms line streaks, 280ms small score/combo feedback. WAAPI transform/opacity, existing strong ease-out curve, cancellable on pause/resize/dispose. System and product reduced-motion settings suppress motion; keyboard placement is immediate. No idle decorative movement. |
| `.agents/skills/pick-ui-library/SKILL.md` | Checked current dependencies. Puzzle coordinate manipulation is outside its React sortable UI use case; retained native Pointer Events/WAAPI within the frozen no-framework/no-dependency architecture. No library installation claimed. |
| `.agents/skills/game-development/SKILL.md`, `game-development/web-games/SKILL.md`, `game-development/2d-games/SKILL.md`, `game-development/game-art/SKILL.md` | Retained turn-based deterministic model and DOM/SVG renderer, one cell unit across layers, original saturated flat shapes, no simulation loop or rigid-body system. |
| `.agents/skills/input-keyboard-mouse-touch/SKILL.md` | Unified actions, actual occupied-cell grabbing, stable-root pointer capture, explicit cancellation, one active primary pointer and held-key placement guard. This skill describes Phaser; no Phaser API was copied into DOM code. |
| `.agents/skills/geometry-and-math/SKILL.md`, `.agents/skills/scale-and-responsive/SKILL.md` | Pure logical grid versus display bounds, integer snapping, current bounding rectangles and responsive square board. Phaser geometry/ScaleManager APIs are inapplicable; `input.ts` performs the small native mapping. |
| `.agents/skills/test-driven-development/SKILL.md`, `writing-good-tests.md` | Five hand-derived coordinate/footprint tests were written and run before the mapping helper existed (missing-module red), then passed. Existing rules tests unchanged; new browser tests exercise actual input and interrupted gestures rather than source-string checks. |
| `.agents/skills/verification-before-completion/SKILL.md` | Fresh complete unit suite, TypeScript, SVG validation and recorded browser results in TEST_RESULTS.md. |
| `.agents/skills/requesting-code-review/SKILL.md` | Read review handoff requirements. Parent explicitly owns sequential independent review; no extra subagent was created. |

The installed animation skill recommends springs for momentum gestures, but these pieces have no inertia: pointer tracking and valid snapping are immediate; only the invalid return is eased. No physics simulation or unsupported performance claim is appropriate for integer polyomino placement.

No specialised standalone DOM input, polyomino geometry, or Playwright testing skill exists in the project registry. The Phaser input/geometry skills provide principles, not DOM documentation. The official MDN Pointer Events source was fetched and read in this session:

https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/pointer_events/index.md

Its capture, implicit release, pointercancel and touch-action sections inform stable-root capture, explicit loss/cancel handling and gesture suppression confined to board/tray. This is documentation research, not an invented skill invocation. The live board rectangle supplies viewport coordinates to the same lift/snap mapping on movement and release.

Actual visual references inspected: `blocks_and_ball_reference_sheet.jpg`, `11_blocks_board.png`, `12_blocks_combo.png` from `/tmp/arcade-gameplay-refs/arcade_visual_references/`. Reference stills are comparison-only and are not bundled as product art. No MP4 was supplied, so continuous original timing cannot be verified. Native Chromium CDP touch is browser emulation, not physical phone testing.
