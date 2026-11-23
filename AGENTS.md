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
| Phaser 4 engine setup and subsystems | `.agents/skills/game-setup-and-config/SKILL.md`, then the relevant Phaser skills such as `scenes`, `loading-assets`, `physics-arcade`, or `physics-matter` |
| Planning, implementation, debugging and verification | `.agents/skills/using-superpowers/SKILL.md`, then the applicable Superpowers skill |
| Codebase simplification and dead-code cleanup | `.agents/skills/reclaim-code-entropy/SKILL.md` |
| Independent code review | `.agents/skills/requesting-code-review/SKILL.md` |
| Evaluating and applying review feedback | `.agents/skills/receiving-code-review/SKILL.md` |

Superpowers references such as `superpowers:systematic-debugging` name local skills in this installation. Resolve them to `.agents/skills/systematic-debugging/SKILL.md` (or the equivalent Claude directory), using the host's native skill mechanism when available. Supporting files resolve relative to the skill directory. Map upstream tool examples to tools actually available in the current environment.

## Working conventions

- Keep the user's current request and existing project decisions authoritative when applying skill guidance.
- Choose the application stack and game engine from the actual task; this repository does not yet select either.
- When working with Phaser 4, load the relevant official engine skills. Their `src/...` source maps refer to the upstream `phaserjs/phaser` repository at the commit in `skills.lock.json`; they are not paths to local application files.
- Use the game-development router's relevant platform and domain guides. Read nested guides directly when they are not separately exposed by the agent.
- Verify SVG chart geometry against the real data and check framework-specific markup syntax. Upstream examples are illustrative.
- Respect reduced-motion preferences and check the visual result when implementing motion.
- Use independent code review for substantial changes and report what was verified before declaring completion.
- Preserve the upstream licenses and provenance when updating skills. Edit the canonical copies first, then synchronize the Claude copies and lock file.

## Working rules from the owner

- Do what the owner asks, exactly. His instructions come before skill guidance and your own preferences.
- Keep everything simple: the simplest design and the simplest code that does the job.
- Keep menu and UI text minimal. A few clear words, no filler, no paragraphs.
- Only write tests that check real behaviour. No filler tests.
- Do not use em dashes in anything you write.
- Take screenshots while you work, and paste them in the chat when your run finishes.
- Liquid Glass is see-through and floats on top of the game. Never move, shrink or band off a game, scene or page to make room for glass controls (the game dock, tab bar, menu buttons). The scene runs underneath the glass. Only things the player must read or press keep clear of it, inside the game's own layout.
- The notch, Dynamic Island and home indicator work the same way: backgrounds and scenes run to the screen edges, and only controls and essential text keep clear of them.
- Icons: use RuneIcons (https://www.runeicons.com/icons) as the icon source or for inspiration. The GitHub repo is https://github.com/Runeicons/runeicons. Brand logos on that site are not covered by the icon licence. Follow each brand's own rules for those.

## Simple code

- Write the simplest code that solves the problem. Do not add layers, options or abstractions that the task does not need.
- Before you finish, read your change again and check that it is the best solution to the problem. If a smaller or clearer solution exists, use it.
- Delete code that your change makes unused.

## How to write to the owner

- Write about 80% of the way to ASD-STE100 Simplified Technical English (the plain English in aircraft maintenance manuals).
- Use short sentences with one idea each. Use simple, common verbs and the active voice.
- Do not use idioms, jargon or filler.
