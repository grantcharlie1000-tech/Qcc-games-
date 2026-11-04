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

## Egg character update (2026-11-04)

Used the canonical using-superpowers, brainstorming, game-development (3d-games, web-games, game-art), svg-skill, requesting-code-review and verification-before-completion guides. Kept Three.js and the existing simulation. The user supplied the character direction; the egg silhouette, face, house band and feet are original procedural geometry. Cover art is hand-written SVG. Independent review identified shoulder coverage and eye/headshot alignment; both were fixed and covered by regression tests.

## Supplied satellite-image correction

Used the existing game-development, 3d-games and verification workflows to trace the supplied image into shared render/collision boxes. Roof/landmark placements retain source pixel coordinates in `campus-layout.ts`. Heights and interiors remain estimates. The screenshot is viewed directly from the attachment; no image generation, blocked-host download or external image redistribution is involved.

## Low-spec optimisation

Used systematic-debugging to establish before/after render and startup evidence, plus the existing web-games/3d-games guidance for batching, pixel budgets, pooled effects and fixed-step separation. Independent review caught pacing remainder/visual-time errors; both were corrected and tested at multiple display refresh rates.

## Texture quality and full-detail Potato

Applied the existing game-art and web-games guidance to a consistent painted material palette: detail at player distance, quiet wear and material edges, bounded tiling images and no new asset downloads. The user's instruction to preserve quality supersedes the earlier low-resolution Potato profile: both presets now share the same picture, with only render pacing differing. Used requesting-code-review and verification-before-completion for the texture shader, resource lifetime and preset parity checks.

Weapon textures/models follow the same art and performance workflow: small neutral material sheets tinted by the original school palette, low-polygon chamfers, static part batching and shared texture ownership. Independent review checked manifold geometry/winding and caught sight/lens placement details before final visual verification.
