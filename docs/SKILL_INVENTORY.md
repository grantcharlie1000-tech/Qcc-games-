# Actual skill inventory and parent usage

Repository registry discovered using `rg --files .agents/skills -g SKILL.md` on 2026-10-19. Installed provenance is pinned in skills.lock.json. No untrusted skill installers were executed.

Parent read and applied:

- `.agents/skills/using-superpowers/SKILL.md` and Codex tool reference — actual tool-aware workflow; user master prompt resolves already-specified design decisions.
- `.agents/skills/brainstorming/SKILL.md` — complete supplied design requires no speculative questions.
- `.agents/skills/writing-plans/SKILL.md` — ARCHITECTURE.md, TEST_PLAN.md and task plan.
- `.agents/skills/game-development/SKILL.md` and `web-games/SKILL.md` — lazy loads, fixed updates, input abstraction and cleanup.
- `.agents/skills/svg-skill/SKILL.md` — original cover geometry, explicit viewBoxes, local assets.
- `.agents/skills/animate/SKILL.md`, RECIPES.md and `pick-ui-library/SKILL.md` — 140ms transform-only card press/hover, reduced-motion/fine-pointer gating. Native dialog provides browser focus management without adding a framework.
- `.agents/skills/using-git-worktrees/SKILL.md` — user-authorized twelve isolated worktrees, ignored directory, frozen baseline.
- `.agents/skills/dispatching-parallel-agents/SKILL.md` — per-game ownership and actual supported concurrency/model.
- `.agents/skills/requesting-code-review/SKILL.md` and reviewer template — independent cross-review after implementation.
- `.agents/skills/verification-before-completion/SKILL.md` — fresh check/test/build evidence before completion claims.

Cloud registry was queried at session start; cloud-runtime and Netlify config/deploy skills were read through skills tools before a later registry update reported no cloud skills. Cloud-runtime guided environment readiness/network-policy inspection. Netlify skills guided static build/publish config and no-secret handling. These loads are actual session tool results, not locally installed skill files.

Specialist solver/card/AI skills are not presumed to exist. Each specialist independently searches and documents its actual loaded skills in its own SKILL_USAGE.md, and uses verified official docs for any missing specialty. Standalone Matter/Three APIs are checked against upstream docs/source separately from Phaser guides.

Official parent references validated through connected web research: Vite static deployment https://vite.dev/guide/static-deploy ; Vite relative base https://vite.dev/guide/build#relative-base ; MDN PWA caching https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching ; Playwright browsers https://playwright.dev/docs/browsers . These are documentation, not skill invocations.
