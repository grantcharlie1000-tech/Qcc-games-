# Charlie's levels and growth implementation plan

Goal: append 50 Water Sort levels and 20 levels to each other finite campaign, preserve existing progress, and remove Neon Coil's 600 mass ceiling with bounded simulation work.

Base: freshly fetched main c7fe5804db2e6aa7373ef66d9286dae3bea57499. Branch: codex/charlie-levels-snake-growth.

1. Inventory the 18 actual games; classify finite campaigns separately from repeatable and endless systems. Record existing counts and immutable prefixes.
2. Add failing progression and save-compatibility tests. Select original deterministic Water Sort boards by independently verified shortest pour count, append larger Block Fill gardens and Color Connect boards, check uniqueness and solvability. Keep old level ordering and seeds unchanged. Update player-facing totals.
3. Reproduce Neon Coil's 600 cap in the actual food handler. Add eating, real body growth, boosting, save, collision and bounded-work regressions. Remove the score ceiling; make very large bodies grow sublinearly and compact older history within a fixed point budget, preserving recent precise movement.
4. Run unit aggregate, native helper, browser aggregate, typecheck/build, retained-update and offline verification. Diagnose relevant baseline failures without weakening checks. Record passed/failed/skipped/never-run separately.
5. Commit, push new branch, create draft PR. Resolve the parent's independent Astra audit, review feedback and CI; verify exact remote commit and required checks before merging. Preserve other PRs and all branches. Inspect normal main deployment without a separate release.
