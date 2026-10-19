# Skills and concrete application

Independent discovery: `rg --files .agents/skills -g SKILL.md` in this worktree. No skills were installed and no other game implementation was imported. Exact local files below were read; upstream repository/commit provenance comes from the existing `skills.lock.json`.

| Local skill/source | Application |
| --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | Read first workflow entry. Its subagent stop clause applies to this specialist. No nested agent was started, matching the explicit scope restriction. |
| `.agents/skills/game-development/SKILL.md` | Routed to web, 2D, design and art. Separated action input, pure state transitions and rendering; no continuous simulation for a turn-based puzzle. |
| `.agents/skills/game-development/web-games/SKILL.md` | Browser-native DOM/SVG is sufficient for 64 cells, avoiding an unnecessary engine; pause belongs to host lifecycle, no external assets or autoplay audio. |
| `.agents/skills/game-development/2d-games/SKILL.md` | One logical cell size, layered board/gems/ghosts and simplified integer collision checks for clear silhouettes. |
| `.agents/skills/game-development/game-design/SKILL.md` | Observe–place–clear loop, rewarding consecutive clearing choices, accessible input alternatives and balanced shuffle-bag variety instead of punishing random rerolls. |
| `.agents/skills/game-development/game-art/SKILL.md` | Approachable soft vector palette, dark rim, gem bevels and value contrast; seven redundant marks plus shape names prevent reliance on hue. |
| `.agents/skills/geometry-and-math/SKILL.md` | Pure-data geometry, integer floor snapping and saved deterministic RNG. This is a Phaser-specific skill; its API examples were not treated as standalone browser APIs and Phaser is not used. |
| `.agents/skills/input-keyboard-mouse-touch/SKILL.md` | Unified pointer actions, explicit drag start/move/end, hit bounds, per-action keyboard handling and pausing input. Adapted principles to DOM Pointer Events rather than calling Phaser APIs. |
| `.agents/skills/scale-and-responsive/SKILL.md` | Logical versus displayed dimensions; every pointer event uses live display bounds. No canvas or pixel-ratio renderer is needed for resolution-independent SVG. |
| `.agents/skills/graphics-and-shapes/SKILL.md` | Simple grouped primitives for gem silhouettes, lighting and marks. Renderer uses DOM/SVG rather than Phaser Graphics. |
| `.agents/skills/svg-skill/SKILL.md` and `scenarios.md` illustration section | Directly authored original SVG, fixed viewBox, unique gradient IDs, reusable gem composition, decorative accessibility, explicit XML validation. The parent requested ownership of cover regeneration, so only gameplay art and `spark.svg` were authored. |
| `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md` | Wrote pure-rule fixtures before the model; first run failed because the model did not exist, followed by nine passing rule tests. Hand-checked crossing-line expectations, actual browser input and later seeded-run tests exercise real state rather than mocks. |
| `.agents/skills/verification-before-completion/SKILL.md` | Fresh scoped unit, full unit, TypeScript and real Chromium checks; counts and screenshot in TEST_RESULTS.md. |
| `.agents/skills/requesting-code-review/SKILL.md` | Read review workflow; the explicit parent instruction forbids extra agents. Requested independent integration review from the parent, who owns that review. No fabricated review result. |

Provenance: game-development family: `vudovn/ag-kit` at `549ba3dc2eb1d40fccb5b6d792eba4101c80cd69`; Phaser skills: `phaserjs/phaser` at `02d8931b626d9764c133cbb3fbf99966c03c757c`; SVG: `linyaosky/svg-skill` at `2103b92cb47f588a97a6c38aa6c40571fadbd4f8`; workflow: `obra/superpowers` at `bb92a77741419a4ab5f06e711a283343f1ada0c3`. All retain upstream MIT licensing in the untouched skills tree.

## Gaps and documentation actually read

No local specialist skill for polyomino placement algorithms, row/column reconciliation, puzzle generators or standalone DOM drag/drop was discovered. These gaps were addressed with the explicit rules in SPEC.md, exhaustive integer-anchor legal-move scanning, simultaneous line-union removal, shuffle-bag invariants and deterministic/browser tests. Phaser math/input guides informed structure, not unsupported API use.

Read official browser documentation from MDN's source repository:

- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/setpointercapture/index.md — capture target owns subsequent pointer events until release or pointerup; stable root capture keeps a drag alive while tray SVG is redrawn; touch-action none on actual drag surfaces.
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/getboundingclientrect/index.md — bounds are viewport-relative and include border/padding; board has neither, and client coordinates share that coordinate space. Bounds are read each event, including after scroll or resize.
- https://raw.githubusercontent.com/RisticDjordje/BlockBlast-Game-AI-Agent/main/README.md — secondary rules reference for 8×8, three pieces, completed rows/columns and successive-clear combos. Original algorithm, score policy and visuals are independently authored. Documentation research is not skill invocation.

Network policy blocked the App Store listing. No official scoring claim or official balance parity is made. Trackpad-equivalent input means the browser's normal mouse Pointer Events; no physical trackpad or phone was available. WebKit was not installed and is not claimed tested.
