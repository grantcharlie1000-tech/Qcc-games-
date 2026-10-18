# Qcc-games-

## Project skills

Read the relevant skill before work in its area. Canonical skill files live in `.agents/skills/`; Claude Code has matching copies in `.claude/skills/`.

At the beginning of a project work session, load `using-superpowers` and use its relevant workflow skills as the task develops.

| Work | Entry point |
| --- | --- |
| SVG icons, illustrations, scalable graphics | `.agents/skills/svg-skill/SKILL.md` |
| Animation and interaction motion | `.agents/skills/animate/SKILL.md` |
| UI library choices needed by an animation | `.agents/skills/pick-ui-library/SKILL.md` |
| Game design and development | `.agents/skills/game-development/SKILL.md`, then its relevant subdirectory |
| Planning, implementation, debugging and verification | `.agents/skills/using-superpowers/SKILL.md`, then the applicable Superpowers skill |
| Independent code review | `.agents/skills/requesting-code-review/SKILL.md` |
| Evaluating and applying review feedback | `.agents/skills/receiving-code-review/SKILL.md` |

Superpowers references such as `superpowers:systematic-debugging` name local skills in this installation. Resolve them to `.agents/skills/systematic-debugging/SKILL.md` (or the equivalent Claude directory), using the host's native skill mechanism when available. Supporting files resolve relative to the skill directory. Map upstream tool examples to tools actually available in the current environment.

## Working conventions

- Keep the user's current request and existing project decisions authoritative when applying skill guidance.
- Choose the application stack and game engine from the actual task; this repository does not yet select either.
- Use the game-development router's relevant platform and domain guides. Read nested guides directly when they are not separately exposed by the agent.
- Verify SVG chart geometry against the real data and check framework-specific markup syntax. Upstream examples are illustrative.
- Respect reduced-motion preferences and check the visual result when implementing motion.
- Use independent code review for substantial changes and report what was verified before declaring completion.
- Preserve the upstream licenses and provenance when updating skills. Edit the canonical copies first, then synchronize the Claude copies and lock file.
