# Specialist build record

All twelve distinct specialists were created through actual `spawn_agent` calls with **model `gpt-6.1-sol`, `fork_turns: none`, `reasoning_effort: high`**. Six concurrent child slots required staged dispatch. Every worktree branched from frozen shell baseline `3a5206508ee9c53458f70d946239f3d5a755d5b0`. Each specialist independently searched the installed skill registry, read and applied appropriate real skills, researched rules and wrote its own spec, engine, adapter, tests and evidence. Shared configuration remained parent-owned.

The parent reviewed code, independently reran focused checks and cherry-picked each isolated handoff sequentially. Later corrections went back to the original specialist. The release SVG covers are parent revisions made with the installed SVG skill at the user's request; integration retained those covers.

| Specialist | Game | Worktree / branch | Original handoff | Integrated corrections | Logic / browser cases |
|---|---|---|---|---|---|
| SOL-01 | Fruit Merge | `.worktrees/fruit-merge` · `game/fruit-merge` | `1443021` | — | 16 / 4 |
| SOL-02 | Water Sort | `.worktrees/water-sort` · `game/water-sort` | `e72d306` | `a8b1515`: homogeneous partial tubes, bounded solver queue | 52 / 6 |
| SOL-03 | Color Blocks | `.worktrees/color-blocks` · `game/color-blocks` | `c25e919` | — | 10 / 9 |
| SOL-04 | Tower | `.worktrees/tower` · `game/tower` | `5c11fbf` | — | 15 / 4 |
| SOL-05 | Snake | `.worktrees/snake` · `game/snake` | `aa0d7ad` | Parent test follows working library search | 10 / 3 |
| SOL-06 | Minesweeper | `.worktrees/minesweeper` · `game/minesweeper` | `8182168` | `2fb13d3`: long-hold release; `5a3057d`: production tile URL/fallback | 17 / 6 |
| SOL-07 | Solitaire | `.worktrees/solitaire` · `game/solitaire` | `69b6d8b` | `79b8e94`: legal foundation withdrawal hint | 14 / 8 |
| SOL-08 | Block Fill | `.worktrees/block-fill` · `game/block-fill` | `4c39c86` | Parent budgets time for twelve-level playthrough and isolates invalid-save fixture | 8 / 6 |
| SOL-09 | Color Connect | `.worktrees/color-connect` · `game/color-connect` | `bbb5840` | `09102a5`: transactional saves, sparse-input validation, keyboard focus | 11 / 10 |
| SOL-10 | Ball Run | `.worktrees/ball-run` · `game/ball-run` | `f602303` | — | 8 / 4 |
| SOL-11 | Pool | `.worktrees/pool` · `game/pool` | `d3e339a` | Parent controls clock for exact restore assertion and waits for library before injecting endgame fixtures | 40 / 6 |
| SOL-12 | Animal Stack | `.worktrees/animal-stack` · `game/animal-stack` | `1693702` | `4355d9c`: valid transient impact snapshots restore | 14 / 3 |

Counts above describe the final test inventory; the [delivery report](DELIVERY.md) records the final integrated results. The shell adds eight logic and six browser cases. Source rules, skill provenance, specs and specialist test history live in each game's `SPEC.md`, `SKILL_USAGE.md` and `TEST_RESULTS.md`.

## Study Mode follow-up

The parent implements the shared Study feature. Its 28 browser cases and five unit cases are additional to the original shell's six browser/eight unit cases. The original SOL-01 and SOL-12 owners supplied minimal paused-render fixes on separate branches based on `d695191`, using new tests rather than editing shared files:

- Fruit Merge: `study/fruit-pause`, source handoff `e3317b0`, integrated as `7a740f1`; navigation-test follow-up `903a770`, integrated as `4d30edc`. Source review, 16 independent game units and an actual isolated Chromium draw-count test passed before integration.
- Animal Stack: `study/animal-pause`, source handoff `0c83aca`, integrated as `7a45342`; navigation-test follow-up `074c296`, integrated as `9b6c2cc`. Source review, 14 independent game units and an actual isolated Chromium draw-count test passed before integration.
- Solitaire: original SOL-07 supplied the text-only handoff `a232e5c` on `study/solitaire-rules`, integrated as `265a4c2`. Rules now explain selecting the same card again to clear a selection, since Esc opens Study. No rule engine or input handler changed. All eight Solitaire cases and four affected Study cases passed against the final production output.

Each new game test checks zero repeated Canvas drawing while paused, one loop on resume and no drawing after actual route disposal. These add one browser case per game (Fruit Merge five, Animal Stack four). The other game case counts are unchanged. A separate actual read-only review covered all Study source, content and diagrams; [findings and fixes](evidence/study-review.md).

## Independent review

- SOL-10 reviewed shared storage, lifecycle and service-worker code. Parent fixed stale disk reads after quota errors, cache failures breaking online responses, premature worker activation, and late mounts running behind open dialogs. Focused regressions plus production offline/update scripts exercise these paths.
- SOL-01 reviewed Pool, Solitaire and Animal Stack. Pool had no concrete defect; Solitaire's hint fallback and Animal Stack's impact restore were fixed by their original specialists, then independently checked.
- SOL-05 reviewed Color Blocks, Tower and Minesweeper. The first two had no concrete defect; Minesweeper's long-touch release fix was returned to SOL-06 and independently verified.
- SOL-02 reviewed Block Fill and Color Connect. Block Fill had no concrete defect. SOL-09 corrected gesture snapshot transactions, sparse snapshots and pointer-to-keyboard focus; the reviewer checked the corrective handoff.

No review result substitutes for a test result. Native Chromium touch-protocol cases are explicitly Chromium-only. Other browser interactions are configured for both engines. **WebKit could not be run locally:** browser download hosts returned policy 403, and launch reported a missing executable. The CI workflow installs both engines; future CI results are not claimed as completed local verification.

## Referenced gameplay correction pass — 19 October 2026

Four assigned specialists were actually spawned with `gpt-6.1-sol`, in isolated worktrees from frozen contract `6861106`. Each independently discovered/read installed skills and official API sources; exact usage/gaps are in its updated `SKILL_USAGE.md`. The parent owns shared viewport/input and integration. No other eight game source modules changed.

| Specialist | Worktree / branch | Reviewed game-only handoff(s) | Parent integration |
|---|---|---|---|
| SOL-12 Animal Stack | `.worktrees/correction-animal` / `correction/animal-stack` | `4eb4d3e`, `5b3b46a`, `2e32d8d`, `00ddbb8`, `42fbafa` | `16bb286`, `1019a2c`, `a6fdd13`, `38d6a94`, `ec04354` |
| SOL-02 Water Sort | `.worktrees/correction-water` / `correction/water-sort` | `7a2035c`, `dd711b8` | `c2ea48e`, `17440fb` |
| SOL-03 Color Blocks | `.worktrees/correction-blocks` / `correction/color-blocks` | `458f115`, `b12193d` | `a2b080e`, `f7f4263` |
| SOL-10 Ball Run | `.worktrees/correction-ball` / `correction/ball-run` | `1bdadbd` | `fdbc2ff` |

Duplicate local shell cherry-picks were excluded. Parent independently ran focused pure-logic and actual browser input checks before each integration, inspected sprite/portrait/landscape/interaction evidence, and obtained read-only reviews of shared fitting and all four adapters. Review findings led to actual fixes, including dynamic layout bounds, 320px control clipping, held native DROP keys and tall Animal HUD overlap. See [correction evidence](evidence/correction/independent-review.md) and [current release report](DELIVERY.md).
