# Actual skill and documentation use

Discovery command: `rg --files .agents/skills -g SKILL.md`. Read project AGENTS.md, ARCHITECTURE.md, GAME_AGENT_GUIDE.md, TEST_PLAN.md and src/core/types.ts before implementation. These files are repository instructions, not skills.

| Exact loaded local source | Concrete influence |
| --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | Read at session start; its SUBAGENT-STOP clause applies to this assigned specialist. No further agents were spawned. |
| `.agents/skills/game-development/SKILL.md` | Routed to browser, mobile, 3D, art and design; separated input, fixed-step update and rendering. |
| `.agents/skills/game-development/3d-games/SKILL.md` | Perspective look-ahead camera; simple sphere/box colliders; batching; no costly shadows. |
| `.agents/skills/game-development/web-games/SKILL.md` | Lazy Three.js module, no runtime asset loading, pooled instances and explicit interaction before sound. |
| `.agents/skills/game-development/mobile-games/SKILL.md` | 52px touch buttons, portrait fit, DPR cap, no work while paused. |
| `.agents/skills/game-development/game-design/SKILL.md` | Safe opening, regular recovery sections, bounded gradual speed progression, clear retry loop. |
| `.agents/skills/game-development/game-art/SKILL.md` | Restrained neon palette, large obstacle silhouettes, striped ball and gap markings so hue is not the only signal. |
| `.agents/skills/input-keyboard-mouse-touch/SKILL.md` | Action abstraction, held directional input, release cleanup. Phaser-specific APIs were not used as Three.js APIs. Native pointer capture handles drag and touch holds. |
| `.agents/skills/svg-skill/SKILL.md` | Hand-authored scalable original cover, title/description, reusable gradients, empty title zone, local validation script. SVG direction buttons avoid emoji rendering. |
| `.agents/skills/test-driven-development/SKILL.md` | Wrote pure model tests before the model; observed missing-module failure then behavioral collision-test failure before green. |
| `.agents/skills/test-driven-development/writing-good-tests.md` | Real course/physics and browser inputs; no mocked game or test-only game API. |
| `.agents/skills/systematic-debugging/SKILL.md` | Traced browser import failure to shared Vite optimizer cache via HTTP504 evidence; isolated cache before retesting. Traced a touch test failure to input held too long and used RAF-based predicates. |
| `.agents/skills/verification-before-completion/SKILL.md` | Fresh typecheck, pure tests, browser tests, SVG validation, screenshot and truthful timing evidence before commit. |

## Upstream provenance

The checked-in `skills.lock.json` records `vudovn/ag-kit` commit `549ba3dc2eb1d40fccb5b6d792eba4101c80cd69` for game-development and its domain guides; `phaserjs/phaser` commit `02d8931b626d9764c133cbb3fbf99966c03c757c` for input-keyboard-mouse-touch; `linyaosky/svg-skill` commit `2103b92cb47f588a97a6c38aa6c40571fadbd4f8` for SVG; and `obra/superpowers` commit `bb92a77741419a4ab5f06e711a283343f1ada0c3` for workflow guides. All retain their repository licenses; no skills were installed or modified.

## Documentation consulted separately

- https://raw.githubusercontent.com/mrdoob/three.js/dev/docs/pages/WebGLRenderer.html — fetched and read relevant dispose, forceContextLoss, setPixelRatio and animation-loop documentation. Dev documentation is complemented by the installed-version source below.
- https://raw.githubusercontent.com/mrdoob/three.js/r180/src/renderers/WebGLRenderer.js — verified actual disposal removes internal listeners, frees caches and stops renderer animation; DPR and context-loss APIs.
- https://raw.githubusercontent.com/mrdoob/three.js/r180/src/objects/InstancedMesh.js — verified setMatrixAt requires instanceMatrix.needsUpdate and instance buffer disposal is separate from geometry/material disposal.

## Real gaps

The local inventory has no dedicated standalone Three.js API skill, procedural-track generator skill, or 3D kinematics solver guide. The 3D/web guides cover principles and GPU performance, but do not establish API correctness. Official Three source resolves API gaps; explicit constant-acceleration equations, sphere–AABB tests, analytic steering and deterministic navigability tests establish the custom simulation. No Phaser physics API was represented as a standalone Three physics solver. No Chromebook hardware was available for performance claims. Independent integration review belongs to the parent under the assigned isolation contract.
