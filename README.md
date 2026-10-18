# Qcc-games-
Shen

Project workspace with SVG, animation, game development, Superpowers, and code review skills prepared for coding agents.

## Included skills

| Area | Skill package | Source |
| --- | --- | --- |
| SVG assets | `svg-skill` | [linyaosky/svg-skill](https://github.com/linyaosky/svg-skill) |
| Animation | `animate`, with its `pick-ui-library` companion | [emilkowalski/skills](https://github.com/emilkowalski/skills) |
| Game development | `game-development` and its platform/domain guides | [vudovn/ag-kit](https://github.com/vudovn/ag-kit) |
| Development workflow | The Superpowers skill collection | [obra/superpowers](https://github.com/obra/superpowers) |
| Code review | Superpowers `requesting-code-review` and `receiving-code-review`, including the reviewer template | [obra/superpowers](https://github.com/obra/superpowers) |

## Use

Open a checkout of this repository in your coding agent. Skill files are included in the repository; there is no separate download step.

- **Codex:** project skills are in `.agents/skills/`.
- **Claude Code:** matching copies are in `.claude/skills/`. These are ordinary files so Windows checkouts do not need symlink support.
- **Other agents:** read `AGENTS.md` and the relevant `SKILL.md` directly if native skill discovery is unavailable.

Start a new session after initially adding these directories if the agent does not discover them. Skills provide instructions and supporting resources; they do not install a game engine or an application framework.

This is a project-local copy of the Superpowers skills. Its global plugin and startup hooks are not installed. `AGENTS.md` supplies the project entry point and explains how to resolve its skill names.

## Maintenance

`skills.lock.json` records the exact upstream commits, source paths, and file hashes. The source files retain their original MIT licenses. `.agents/skills/` is the canonical copy; keep `.claude/skills/` identical when deliberately updating a skill and update the lock file in the same commit.

One recorded metadata adjustment enables the animation skill to invoke its UI-library companion automatically. Other upstream skill content is unchanged.

Official discovery documentation: [Codex skills](https://learn.chatgpt.com/docs/build-skills) · [Claude Code skills](https://code.claude.com/docs/en/skills).
