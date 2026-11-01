# Crossy Road fidelity pass 1

> Execution: implement in this worktree on `game/crossy-road`, as explicitly requested. Use the executing-plans workflow and one independent review before completion.

**Goal:** Match Charlie's reference framing, voxel silhouettes, palette and motion while preserving QCC chrome, saves, rankings and seeded fairness.

**Architecture:** Keep the existing TypeScript/Three.js renderer and pure fixed-step rules/generator. Draw all art from authored geometry, sharing instanced pools. Shell owns live score, row, best, navigation and menus; game owns only hints and outcome/continue cards.

**Spec:** Charlie's fidelity-pass request and `/workspace/new-game-ref/pack/REFERENCE.md`, with Charlie's overrides authoritative. Frames inspected before implementation: contact sheet, t013, t027, t028, t119, plus the three supplied screenshots (which show app UI).

## Constraints

- Use only port 4190; tests set `ARCADE_URL=http://127.0.0.1:4190`.
- Do not modify the Liquid Glass worktree, push, merge, deploy, or apply any remote database migration. Migration header explicitly requires Charlie's approval.
- New id, route, save and leaderboard key: `crossy-road`; visible title: `Crossy Road`.
- Keep 9 playable columns, original fairness invariants, 120 ms hops, all six death causes, UFO at 7 s with warning at 5 s or immediately 3 rows behind/back.
- Phone: 9–10 tiles across, positive 16-degree yaw (lanes fall to screen right), steep 58-degree pitch, player about 35% up. Landscape: same substantial tile feel with more columns.
- Pixel ratio at most 2, instancing, draw calls around 120 or less, reduced-motion support.
- All generated evidence goes outside this repository; no PNG additions.

## Review focus

- Restore and rankings must use the new id, including account sync and offline routing.
- Camera yaw reversal must also reverse culling correctly at both aspect ratios.
- Water must keep its full depth without land banks, foam or logs obscuring it.
- UFO must swoop and depart above the screen quickly, carrying the full-size bird.
- Shared sheet styles must remain visible and keyboard accessible on non-dialog cards and reduced motion.

## Tasks

- [ ] Rename registry, source/test/art folders, docs, sync keys and migration. Keep evidence outside the repo. Verify typecheck and renamed unit tests; commit.
- [ ] Pin camera framing and UFO timing in tests, watch the changed expectations fail, then fix camera/culling and swoop. Preserve existing rules and fairness coverage.
- [ ] Replace bird, trees, rocks, vehicles/log palette and cover with code-authored shapes; adjust full water lanes, railway signals, directional shadows and hop pose. Integrate shared QCC sheet classes/tokens, without adding live HUD or navigation controls. Verify and commit.
- [ ] Add deterministic capture script (phone DSF2 and PC), seek a mixed seed/view, capture start, mixed lanes, hop, each death mid-animation and game over. Verify title/source and log seed, time, state and render stats with each capture.
- [ ] Inspect round 1 against the references, refine at least twice, capture each revision into distinct round directories, and record visible differences.
- [ ] Run check, full Vitest suite (including 2,000-seed fairness), Crossy Road Playwright, touched e2e/account/leaderboard specs; independently review and fix any important findings.
- [ ] Restore any unrelated generated evidence, confirm the old name has no tracked occurrences, commit final documentation/capture refinements and report seeds, verification and remaining visual differences. No push.

## Execution record

- Worktree started clean on the requested branch. Existing Three.js stack retained.
- Rules audit: 7 s idle, 5 s warning and 3 rows behind/back already match the requested thresholds. UFO flight needed a faster grab and departure; retain the UFO.
- Liquid Glass PR #80 inspected read-only: shared material classes are `ui-glass-sheet` and `arcade-sheet`; main already provides `ui-glass-sheet` and its tokens. Outcome cards will use those instead of fixed bespoke material.
