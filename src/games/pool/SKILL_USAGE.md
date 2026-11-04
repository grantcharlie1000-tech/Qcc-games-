# Skill usage — Pool remake (2026-11-04)

Read and applied from this repository's skills:

| Skill | Influence |
| --- | --- |
| `.agents/skills/game-development/SKILL.md`, `web-games`, `2d-games` | Separate simulation, rules, AI, rendering and input; fixed-timestep deterministic physics; raw Canvas 2D for a small custom game with no runtime assets. |
| `.agents/skills/test-driven-development/SKILL.md` | Physics and rules behaviour pinned by unit tests (stun/follow/draw, english off cushions, every pocket, fouls, 8-ball outcomes, saves) and browser tests that drive the real controls. |
| `.agents/skills/verification-before-completion/SKILL.md` | Fresh unit, type-check, build and Chromium runs before reporting; screenshots reviewed at phone, tablet and desktop sizes. |
| `.agents/skills/requesting-code-review/SKILL.md` | Independent review of the rewrite before completion. |

References for the physics model: W. Leckie and M. Greenspan, “An event-based pool physics simulator” (Advances in Computer
Games, 2006); S. Mathavan, M. R. Jackson and R. M. Parkin, “A theoretical analysis of billiard ball dynamics under cushion
impacts” (Proc. IMechE C, 2010). Rules follow the WPA eight-ball rules with the simplifications listed in `SPEC.md`.
