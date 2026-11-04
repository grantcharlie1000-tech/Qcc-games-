# Skill usage: Quad Clash

Skills read from this repository (canonical copies in `.agents/skills/`, Claude copies in `.claude/skills/`):

| Skill | Path | Influence |
| --- | --- | --- |
| using-superpowers | `.claude/skills/using-superpowers/SKILL.md` | Session workflow: skill check before work. |
| brainstorming | `.claude/skills/brainstorming/SKILL.md` | Opened with one clarifying question. The user handed the design over ("Up to u"), so the choices are stated in SPEC.md as my calls. |
| game-development (router) | `.agents/skills/game-development/SKILL.md` | Fixed-timestep loop with interpolated rendering, and a state-machine style bot brain. |
| 3d-games | `.agents/skills/game-development/3d-games/SKILL.md` | Simple box colliders behind richer visuals, raycasts for line of sight, and shadows limited to fine-pointer devices. |
| web-games | `.agents/skills/game-development/web-games/SKILL.md` | Three.js for a rendering-focused 3D game, pausing when hidden, audio only after interaction and pooled effects. |
| svg-skill | `.agents/skills/svg-skill/SKILL.md` | Cover and the `icons.ts` weapon and UI icon set (19 icons) hand-written to its rules (aria-hidden decorative icons, `currentColor` UI icons, no ids), each checked with `scripts/validate.sh` (PASS). |

Not applicable: the Phaser skills (no Phaser here) and the multiplayer skill (bots only; the shared PeerJS layer is not used).

Research: a web search on the genre's conventions (modes, weapon classes, respawns). The results were low-quality pages, so only broad genre conventions were used. No assets, names, maps or numbers were taken from any game.
