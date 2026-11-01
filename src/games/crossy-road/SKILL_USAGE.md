# Crossy Road skill usage

Skills that were actually loaded or read while building Crossy Road, with their pinned provenance from `skills.lock.json` and what each changed. Reading a document is listed as reading, not as invoking a skill.

| Skill (local path) | Upstream (pinned commit) | Who | Concrete influence |
| --- | --- | --- | --- |
| `using-superpowers` (`.claude/skills/using-superpowers/SKILL.md`, `references/claude-code-tools.md`) | obra/superpowers `bb92a77` | lead, invoked | Set the order: process skills (brainstorming, writing-plans, subagent-driven-development) before implementation skills. |
| `brainstorming` | obra/superpowers `bb92a77` | lead, invoked | The user's build brief and REFERENCE.md were a complete description with an explicit "work autonomously", treated as the skill's opt-out. The only open design calls (originality: name, hero, stall hazard) were recorded as the lead's rulings in PLAN.md. |
| `game-development` router, plus `web-games`, `3d-games`, `game-design`, `game-art`, `game-audio`, `mobile-games` sub-guides (`.claude/skills/game-development/…/SKILL.md`) | vudovn/ag-kit `549ba3d` | lead, read | Fixed-timestep loop with interpolated rendering (1/60 s steps, exact hop landings); input abstracted into actions (input.ts); pause on hidden tabs; batching/instancing and pooling with no per-frame allocation; blob shadows instead of real-time shadows on the Low tier; touch targets ≥ 44 px on the card buttons; one gentle sound per event with a mix hierarchy (quiet bell/rumble, louder hit). |
| `writing-plans` | obra/superpowers `bb92a77` | lead, invoked | `src/games/crossy-road/PLAN.md`: module layout, interfaces, global constraints, review focus, test matrix and the task split. The user's requested location overrode the default plans folder. |
| `dispatching-parallel-agents` | obra/superpowers `bb92a77` | lead, invoked | One agent per independent domain with disjoint file ownership; briefs as files; agents never commit. |
| `subagent-driven-development` (+ `scripts/sdd-workspace`, `implementer-prompt.md`) | obra/superpowers `bb92a77` | lead, invoked | Ledger in `.superpowers/sdd/PLAN/progress.md` (git-ignored), pre-flight conflict scan, rulings recorded with their cost, review of every diff before the lead commits it. The user's request for parallel chunks overrode the skill's one-implementer-at-a-time default. |
| `test-driven-development` | obra/superpowers `bb92a77` | lead, invoked; implementers were briefed to work test-first | Every pure module (lanes, generator, world, rules, input, audio) has a Vitest suite written first; fixes go through a failing test. |
| `animate` (`.claude/skills/animate/SKILL.md`) | emilkowalski/skills `2d22863` | lead, invoked; renderer agent read it | Game-over card: occasional state change, CSS `@starting-style` entrance on opacity and `scale(.96)`, 240 ms on the repo's `--ease-out`, fade only under reduced motion; keyboard-initiated restarts have no exit animation; the start hint is an opacity fade. In-game motion (hop squash, landing, bonk, deaths) uses short, purposeful timings and switches off squash/shake/particles under reduced motion. |
| `systematic-debugging` | obra/superpowers `bb92a77` | lead, invoked | Four Study-spec failures were traced to their root cause (concurrent Playwright runs emptying the shared `test-results/` folder mid-test) by reproducing on the `origin/main` baseline and on the branch in isolation before changing anything; the fix was a private `--output` folder per run, not a code change. |
| `requesting-code-review` (`code-reviewer.md`) | obra/superpowers `bb92a77` | lead, invoked | An independent whole-branch review (most capable model) found a real score bug (new bests throttled and dropped on pause/restart) and five minors. The score bug and the restore row cap were fixed test-first (each test watched failing before the fix); the other minors were small direct fixes covered by the existing suites. The fix wave got one scoped re-review, whose follow-ups (a death-row check on restore, again test-first, and two stale comments) were applied. |
| `verification-before-completion` | obra/superpowers `bb92a77` | lead, invoked | Every claim in TEST_RESULTS.md and the final report comes from a command run at the final commit, with its output recorded. |
| `svg-skill` (`.agents/skills/svg-skill/SKILL.md`, `scripts/validate.sh`) | linyaosky/svg-skill `2103b92` | cover agent, read and ran the validator | `public/game-art/crossy-road/cover.svg`: explicit viewBox, no text, no external references, a calm title band (y 0..95), validated (1 passed, 0 failed). |

Not used: the Phaser 4 skills (Crossy Road uses Three.js, which the repo already depends on), `pick-ui-library` (no component library needed: the card uses native buttons and the shell's `.game-button`).

## Documentation consulted

- Three.js r180 API as installed in `node_modules/three` (OrthographicCamera, InstancedMesh, BufferGeometryUtils.mergeGeometries, WebGLRenderer.info, shadow maps). No network documentation was needed.
- Repo docs: `GAME_AGENT_GUIDE.md`, `ARCHITECTURE.md`, `TEST_PLAN.md`, `docs/LEADERBOARDS.md`, `docs/ACCOUNTS.md`, `docs/STUDY_MODE.md`, `docs/ARTWORK.md`, and `docs/crossy-road-pack/` (REFERENCE.md, PROMPT.md, frames viewed for camera angle and lane scale only).
- Prior art read: `src/games/ball-run/` (index.ts, scene.ts), `src/games/quadfall/`, `src/games/minesweeper/index.ts` (openRankings), commits `b43c45a` and `a55ebeb` (registration touch-points), `src/core/types.ts`, `src/core/random.ts`, `src/main.ts`.

## Gaps

- No physical Chromebook or phone was available; frame rates were measured only in headless Chromium with software WebGL (see TEST_RESULTS.md).
- WebKit was not available in this environment and was not tested.
