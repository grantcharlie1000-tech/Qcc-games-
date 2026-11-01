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
- High pixel ratio `min(devicePixelRatio, 3)`, antialiasing always on; Low can use 1.5; tight real shadows, instancing, draw calls around 120 or less, reduced-motion support.
- All generated evidence goes outside this repository; no PNG additions.

## Review focus

- Restore and rankings must use the new id, including account sync and offline routing.
- Camera yaw reversal must also reverse culling correctly at both aspect ratios.
- Water must keep its full depth without land banks, foam or logs obscuring it.
- UFO must swoop and depart above the screen quickly, carrying the full-size bird.
- Shared sheet styles must remain visible and keyboard accessible on non-dialog cards and reduced motion.

## Tasks

- [x] Rename registry, source/test/art folders, docs, sync keys and migration. Keep evidence outside the repo. Verify typecheck and renamed unit tests; commit.
- [x] Pin camera framing and UFO timing in tests, watch the changed expectations fail, then fix camera/culling and swoop. Preserve existing rules and fairness coverage.
- [x] Replace bird, trees, rocks, vehicles/log palette with code-authored shapes; leave the cover unchanged for the designer; adjust full water lanes, railway signals, directional shadows and hop pose. Integrate shared QCC sheet classes/tokens, without adding live HUD or navigation controls. Verify and commit.
- [x] Add deterministic capture script (phone DSF2/DSF3 and PC), seek a mixed seed/view, capture start, mixed lanes, hop, each death mid-animation and game over. Verify title/source and log seed, time, state and render stats with each capture.
- [x] Inspect round 1 against the references, refine at least twice, capture each revision into distinct round directories, and record visible differences.
- [x] Run check, full Vitest suite (including 2,000-seed fairness), Crossy Road Playwright, touched e2e/account/leaderboard specs; independently review and fix any important findings.
- [x] Restore any unrelated generated evidence, confirm the old name has no tracked occurrences, commit final documentation/capture refinements and report seeds, verification and remaining visual differences. No push.

## Execution record

- Worktree started clean on the requested branch. Existing Three.js stack retained.
- Rules audit: 7 s idle, 5 s warning and 3 rows behind/back already match the requested thresholds. UFO flight needed a faster grab and departure; retain the UFO.
- Liquid Glass PR #80 inspected read-only: shared material classes are `ui-glass-sheet` and `arcade-sheet`; main already provides `ui-glass-sheet` and its tokens. Outcome cards will use those instead of fixed bespoke material.

- Rename/typecheck/602 targeted tests passed before renderer work (commit `efad2e6`). Initial full baseline: 3,830 tests.
- Rounds 1–3: 33 whole-screen captures each, plus native DSF3 crop. Start seed 11; natural mixed world seed 7, row 40, t=4.075458626742293; road/river/lily/rail all visible. Iterations widened cabins/cars, raised cargo boxes, exposed tree trunks, refined foam/pads, changed the signal silhouette, and tightened the bird’s ambient shadow.
- CAR_LENGTH ruling: 1.5 tiles matches Charlie’s explicit reference-proportion override. Collision uses the same mover span. The generator still lays out each unchanged minimum gap after the car. Crossy Road starts a new save namespace; earlier ids’ saves are not imported. Seed pins now document the first-release Crossy Road world. Regression failed at length 1, then passed at 1.5; all 2,000-seed checks passed.
- Camera regression: preserve the safe start centred at 35% up while keeping visual creep immediate. Target is `max(poseRow, safeLine + min(2,maxRow))` after starting. The new test failed at the earlier delayed target and passed with the corrected leash.
- Independent read-only review found no Critical/Important defects. A documentation filename and capture car-length inconsistency were already corrected when its report arrived. Physical-device FPS and final runtime/landscape/reduced-motion checks are owned by final verification; no remote migration was attempted.
- Round 4 refreshes every shot after the camera fix and removal of decorative flower cubes. All generated evidence remains outside git. The poster is unchanged after Charlie assigned it to the designer.

- Final checks: `npm run check` passed; `npm test` passed 167 files / 3,834 tests; Crossy Road Chromium suite passed 53/53 on an isolated run; Study + viewport passed 43/43. Reduced-motion game-over/Play again works in 844×390 landscape, and DSF3 rotation/Low/High buffer resizing is verified.
- Local production build passed; Crossy Road lazy chunk is 20,794 bytes gzip and production JavaScript has no dev hooks. No remote database or deployment action was used.
- Generated Study evidence PNGs restored before the final commit. Poster has no diff. Old-name grep is empty. All four rounds’ evidence remains outside the repository, with final High rendering at 15–28 calls and native DSF2/DSF3/PC buffers.
