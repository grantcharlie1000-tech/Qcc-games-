# Qcc-games-
Shen

Project workspace with SVG, animation, game development, Phaser engine, Superpowers, and code review skills prepared for coding agents.

## Included skills

| Area | Skill package | Source |
| --- | --- | --- |
| SVG assets | `svg-skill` | [linyaosky/svg-skill](https://github.com/linyaosky/svg-skill) |
| Animation | `animate`, with its `pick-ui-library` companion | [emilkowalski/skills](https://github.com/emilkowalski/skills) |
| Game development | `game-development` and its platform/domain guides | [vudovn/ag-kit](https://github.com/vudovn/ag-kit) |
| Game engine | Official Phaser 4 skill pack: 28 subsystem skills | [phaserjs/phaser](https://github.com/phaserjs/phaser/tree/02d8931b626d9764c133cbb3fbf99966c03c757c/skills) |
| Development workflow | The Superpowers skill collection | [obra/superpowers](https://github.com/obra/superpowers) |
| Code review | Superpowers `requesting-code-review` and `receiving-code-review`, including the reviewer template | [obra/superpowers](https://github.com/obra/superpowers) |

## Use

Open a checkout of this repository in your coding agent. Skill files are included in the repository; there is no separate download step.

- **Codex:** project skills are in `.agents/skills/`.
- **Claude Code:** matching copies are in `.claude/skills/`. These are ordinary files so Windows checkouts do not need symlink support.
- **Other agents:** read `AGENTS.md` and the relevant `SKILL.md` directly if native skill discovery is unavailable.

Start a new session after initially adding these directories if the agent does not discover them. Skills provide instructions and supporting resources; they do not install a game engine or an application framework.

For Phaser 4 work, start with `game-setup-and-config` and load the relevant subsystem skills for scenes, assets, input, physics, cameras, audio, or rendering. The full official pack is included so its cross-references remain available. Its `src/...` source maps refer to the upstream Phaser repository at the commit recorded in `skills.lock.json`, not to application files in this repository.

This is a project-local copy of the Superpowers skills. Its global plugin and startup hooks are not installed. `AGENTS.md` supplies the project entry point and explains how to resolve its skill names.

## Maintenance

`skills.lock.json` records the exact upstream commits, source paths, and file hashes. The source files retain their original MIT licenses. `.agents/skills/` is the canonical copy; keep `.claude/skills/` identical when deliberately updating a skill and update the lock file in the same commit.

Recorded local adjustments enable the animation skill to invoke its UI-library companion automatically, repair Phaser documentation references to match the installed layout, and remove a reference to a companion absent from the upstream pack. The lock file preserves upstream blob hashes and records installed hashes and the exact adjustments. Other upstream skill content is unchanged.

Official discovery documentation: [Codex skills](https://learn.chatgpt.com/docs/build-skills) · [Claude Code skills](https://code.claude.com/docs/en/skills).
