# Gameplay correction implementation plan

**Goal:** Correct the four referenced games' visuals and direct manipulation, prioritising Animal Stack, with a viewport-filling shell and uninterrupted offline Study switching.

**Architecture:** Keep existing deterministic game engines/adapters and module API. The parent implements fixed game layers, scroll restoration and compact reference-game HUDs. Four GPT-6.1 Sol specialists own isolated game-only corrections and evidence; parent reviews and cherry-picks sequentially.

**Tech stack:** Vite, TypeScript, DOM/SVG/Canvas, existing Matter.js and lazy Three.js, Vitest and Playwright. No additional runtime dependency.

**Spec:** [Correction/ownership/viewport contract](../../GAMEPLAY_CORRECTION_CONTRACT.md), together with the user's full correction prompt and the supplied reference frames.

## Constraints and review focus

- Exactly twelve games; change only the four assigned modules and authorised shared viewport/input behavior.
- Preserve score formulas, valid moves, saves, pause, disposal, offline cache and Study Mode.
- No native fullscreen requirement, document scrolling behind games, accidental drag release drops, held-key repeated drops, convex hulls filling major animal gaps, mandatory Ball Run jump, heavy fluid simulation or reference-frame artwork in product assets.
- Review interrupted gestures (cancel/Esc/blur/resize), restored legacy saves, short landscape layouts, a waiting asynchronous mount and same-instance Study return.
- Stills are available; source videos are absent. The original rotation increment is unverified; the documented browser adaptation is 45° after the optional clarification received no answer. Distinguish browser emulation from physical-device evidence.

## Tasks

- [x] Inspect repository, skills and every supplied contact/sequence sheet; record root causes and reference gaps. Ask only the unresolved rotation question.
- [x] Freeze shared ownership/viewport contract, obtain a clean baseline and create four isolated correction worktrees.
- [x] Parent: reproduce document scrolling/layout failures with Playwright; implement fixed layers, compact HUDs, background scroll restoration and input-safe fitting. Verify portrait/landscape and Study transitions.
- [x] SOL-12: produce three-sprite preview + real scene + collider overlay. Parent compares before authorising expansion. Implement all six cutout silhouettes, aligned compound bodies, deliberate DROP, tap/drag distinction, rotation, keyboard, settlement and small bubble feedback. Test real tipping, stable support and falling.
- [x] SOL-02: slender glass rows and gold controls, coordinated level liquid clipping through lift/travel/tip/stream/return, actual source/destination clicks and keyboard selection; retain solver/rules and pause/save safety.
- [x] SOL-03: purple square inset board, bevelled cubes, smaller tray shapes with board-scale drag footprint, consistent touch offset, snap/invalid return and restrained clearing feedback; retain integer placement/scoring.
- [x] SOL-10: black void, indigo grid road, violet wireframe buildings, glossy magenta ball/obstacles and cyan speed gates; continuous steering, navigable ramps/dips/gaps, remove invented mandatory jumping. Preserve reliable collisions, disposal and WebGL fallback.
- [x] Review each handoff, run independent relevant checks and integrate sequentially. Obtain fresh independent whole-change review; fix important findings.
- [x] Run full unit/Chromium regression, actual interaction recordings, portrait/landscape captures and no-scroll/Study/offline root/subpath checks. Attempt available cross-browser checks and report unavailable hardware.
- [ ] Update evidence/deployment bundle, publish main through the existing connector workflow and verify automatic Netlify production commit.

## Verification commands

`npm test`, `npm run check`, `npm run build`, focused game/viewport Playwright tests, full Chromium suite, `npm run verify:offline`, `npm run verify:update`, actual SVG validator. Capture WebM browser videos for the requested interactions; screenshots alone are not acceptance. Coordinate one browser/GPU job at a time.
