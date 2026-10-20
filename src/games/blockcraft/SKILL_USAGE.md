# Blockcraft: skills and sources used

Read AGENTS.md, ARCHITECTURE.md, GAME_AGENT_GUIDE.md, TEST_PLAN.md and `src/core/types.ts` before work.

| Installed source loaded | Application |
| --- | --- |
| `.agents/skills/game-development/SKILL.md` | Fixed 60 Hz simulation separated from rendering; input mapped to actions. |
| `.agents/skills/game-development/3d-games/SKILL.md` | Frustum culling and batching (one merged mesh per chunk); no real-time shadows; simple box collider; first-person camera. |
| `.agents/skills/game-development/web-games/SKILL.md` | Its optimisation priorities in order: no image assets (procedural atlas), lazy chunk shared with Ball Run's Three.js, no per-frame allocation in hot paths, merged draw calls, and terrain generation in Web Workers. Pause when hidden. |
| `.agents/skills/game-development/mobile-games/SKILL.md` | Capped pixel ratio plus adaptive resolution, touch stick and buttons, tap/long-press actions, interruption handling. |
| `.agents/skills/svg-skill/SKILL.md` | Original cover in the required 320×410 frame, top band kept clear, generated reproducibly from a script. |
| `.agents/skills/test-driven-development/SKILL.md` | Model tests for noise, terrain, meshing, physics, raycast and edit validation. Browser tests drive real mouse, keyboard and CDP touch input. |
| `.agents/skills/systematic-debugging/SKILL.md` | CPU profiles of the mesher (padded-copy and import-indirection hot spots) and of the page while moving. Traced the placement and spawn reports to their root causes before changing code. |
| `.agents/skills/verification-before-completion/SKILL.md` | Fresh unit, browser, build and offline runs are recorded in TEST_RESULTS.md. |

Official sources checked: Three.js r180 `WebGLRenderer`, `ShaderMaterial` (GLSL3 prefix defines, fog chunks, `colorspace_fragment`) and `WebGLGeometries` (disposing a geometry also releases its index, so the shared quad index is detached first). MDN Pointer Lock API and Pointer Events.
