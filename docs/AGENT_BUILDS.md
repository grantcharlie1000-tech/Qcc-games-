# Specialist build record

All specialists are dispatched through actual spawn_agent calls with `model: gpt-6.1-sol`, `fork_turns: none`, `reasoning_effort: high`. Six concurrent child slots require staged dispatch. All worktrees branch from frozen baseline 3a5206508ee9c53458f70d946239f3d5a755d5b0. Parent-owned shared config changes are not committed by specialists. Parent reviews code and independently reruns focused tests before sequential cherry-picks. The release SVG covers are parent revisions made with the installed SVG skill.

| Specialist | Game | Worktree / branch | Original handoff | Parent status |
|---|---|---|---|---|
| SOL-01 | Fruit Merge | .worktrees/fruit-merge · game/fruit-merge | 1443021 | Integrated, 16 unit + 4 Chromium checks independently passed |
| SOL-02 | Water Sort | .worktrees/water-sort · game/water-sort | pending | Final verification |
| SOL-03 | Color Blocks | .worktrees/color-blocks · game/color-blocks | pending | Final verification |
| SOL-04 | Tower | .worktrees/tower · game/tower | pending | Testing |
| SOL-05 | Snake | .worktrees/snake · game/snake | pending | Testing |
| SOL-06 | Minesweeper | .worktrees/minesweeper · game/minesweeper | pending | Building |
| SOL-07 | Solitaire | .worktrees/solitaire · game/solitaire | 69b6d8b | Integrated, 12 unit + 7 Chromium checks independently passed |
| SOL-08 | Block Fill | .worktrees/block-fill · game/block-fill | pending | Building |
| SOL-09 | Color Connect | .worktrees/color-connect · game/color-connect | pending | Awaiting dispatch slot |
| SOL-10 | Ball Run | .worktrees/ball-run · game/ball-run | f602303 | Integrated, 8 unit + 4 Chromium checks independently passed |
| SOL-11 | Pool | .worktrees/pool · game/pool | d3e339a | Integrated, 40 unit + 6 Chromium checks independently passed |
| SOL-12 | Animal Stack | .worktrees/animal-stack · game/animal-stack | 1693702 | Integrated, 13 unit + 2 Chromium checks independently passed |

Source rules, loaded skill provenance, specs and fresh specialist test results live in each game's `SPEC.md`, `SKILL_USAGE.md`, and `TEST_RESULTS.md`. Parent integration evidence and browser limitations are recorded separately. WebKit is not available in this environment: download hosts returned policy403 and launch reported a missing executable. The CI configuration installs Chromium and WebKit; its future results are not claimed as completed local verification.
