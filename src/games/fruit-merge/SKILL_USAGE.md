# Actual skill use and provenance

Independently inventoried the installed registry before implementation with `rg --files .agents/skills -g SKILL.md`. Sources and commits below come from the real `skills.lock.json`; no external skill package was installed. Paths are relative to the repository root. These are skill reads; the Matter source reads below are documentation research, not an invented standalone skill.

| Actual local skill read | Upstream provenance | Concrete influence |
|---|---|---|
| `.agents/skills/using-superpowers/SKILL.md` | obra/superpowers @ bb92a77741419a4ab5f06e711a283343f1ada0c3, `skills/using-superpowers/SKILL.md` | Read at session start as AGENTS.md requires; its explicit dispatched-subagent exception applies. No additional agents spawned. |
| `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md` | obra/superpowers @ bb92a77741419a4ab5f06e711a283343f1ada0c3, `skills/test-driven-development/` | Wrote rule and browser tests before engine and UI. Initial red run exposed the absent engine/module; later tests use real physics and real browser controls, not mocked calls. Hand-derived 9/15-point expectations catch scoring and chain regressions. |
| `.agents/skills/verification-before-completion/SKILL.md` | obra/superpowers @ bb92a77741419a4ab5f06e711a283343f1ada0c3, matching `skills/` path | Ran fresh type, unit, browser and SVG checks before completion. Results report Chromium only. |
| `.agents/skills/systematic-debugging/SKILL.md` | obra/superpowers @ bb92a77741419a4ab5f06e711a283343f1ada0c3, matching `skills/` path | Checked the failing pause test against focus behavior: Space was activating the shell's focused pause button. Focusing the basket tests the intended paused input boundary. Fixed the test rather than changing valid shell behavior. |
| `.agents/skills/game-development/SKILL.md` | vudovn/ag-kit @ 549ba3dc2eb1d40fccb5b6d792eba4101c80cd69, same `.agents/skills/` path | Router led to web, 2D, design and art guides; fixed-step input/update/render separation. |
| `.agents/skills/game-development/web-games/SKILL.md` | same ag-kit commit and local/upstream path | Chose raw Canvas with lazy bundled Matter; no large rendering framework, runtime assets, or new audio context. |
| `.agents/skills/game-development/2d-games/SKILL.md` | same ag-kit commit and local/upstream path | Circle bodies, logical coordinates, fixed timestep, clear gameplay layers. |
| `.agents/skills/game-development/game-design/SKILL.md` | same ag-kit commit and local/upstream path | Aim/drop/merge/reward loop, next preview, short feedback, early small fruits and explicit danger grace. |
| `.agents/skills/game-development/game-art/SKILL.md` | same ag-kit commit and local/upstream path | Consistent original vector-like portraits, warm basket palette, distinct seed/rind silhouettes and numbered colour-blind cues. |
| `.agents/skills/physics-matter/SKILL.md` | phaserjs/phaser @ 02d8931b626d9764c133cbb3fbf99966c03c757c, `skills/physics-matter/SKILL.md` | Rigid-circle, friction/restitution, sleeping and fixed-step concepts. It documents Phaser integration; no Phaser method was mistaken for a standalone Matter API. |
| `.agents/skills/particles/SKILL.md` | same phaserjs/phaser commit, `skills/particles/SKILL.md` | One-shot radial burst, finite lifetime, fading alpha and a hard 100-particle cap. Implemented with a tiny local Canvas array, not Phaser emitters. |
| `.agents/skills/graphics-and-shapes/SKILL.md` | same phaserjs/phaser commit, `skills/graphics-and-shapes/SKILL.md` | Primitive composition with circles, ellipse highlights, curves, clipping and layered outlines; APIs implemented with Canvas, not Phaser. |
| `.agents/skills/svg-skill/SKILL.md` | linyaosky/svg-skill @ 2103b92cb47f588a97a6c38aa6c40571fadbd4f8, `SKILL.md` | Authored new SVG portraits, gradients, clipping, accessible title, unique IDs and no embedded image. Ran its actual `scripts/validate.sh`. Parent requested the final cover replacement after this version was drawn. |
| `.agents/skills/animate/SKILL.md` | emilkowalski/skills @ 2d228630ba1446365f614a108cb8252f1feda202, `skills/animate/SKILL.md` | Decorative feedback is suppressed under reduced motion. Gameplay physics is separate from optional UI motion. No animation library or moving text controls introduced. |

## Official standalone Matter research

Read official `liabru/matter-js` tag `0.20.0`, matching the installed dependency, via these exact URLs:

- https://raw.githubusercontent.com/liabru/matter-js/0.20.0/src/core/Engine.js
- https://raw.githubusercontent.com/liabru/matter-js/0.20.0/src/body/Body.js
- https://raw.githubusercontent.com/liabru/matter-js/0.20.0/src/factory/Bodies.js
- https://raw.githubusercontent.com/liabru/matter-js/0.20.0/src/core/Sleeping.js
- https://raw.githubusercontent.com/liabru/matter-js/0.20.0/src/body/Composite.js

`Engine.update` recommends delta ≤1000/60. `collisionStart` happens before position and velocity solving; `collisionActive` happens later. Therefore listeners only collect candidate pairs, and merges remove/add bodies after the entire update. `Bodies.circle` approximates a circle with an even-sided polygon; numerical tests allow small floor tolerances. `Body.setVelocity` updates previous position and normalized speed; restoring direct raw fields would be wrong. `Sleeping.set(true)` resets previous positions and speed; snapshots explicitly retain sleep state. `Composite.remove` accepts an array; cleanup removes every body and clears the engine/event caches.

## Gaps and honest limits

The real registry contains no standalone Matter/Suika solver skill, no dedicated procedural Canvas fruit-art skill, and no physics simulation testing specialty. Phaser skills supply transferable concepts only. Direct official source inspection, deterministic Vitest fixtures and actual Chromium interactions fill those gaps. No claim of external skill invocation, physics certification, commercial rule parity, physical Chromebook performance or WebKit execution.
