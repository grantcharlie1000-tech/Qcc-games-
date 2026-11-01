# Crossy Road fidelity r7

This pass preserves `a027c45` and follows Charlie's 19:00 review and subsequent river-bank requirement. It supersedes the r6 camera/spacing acceptance. Work stays on `game/crossy-road`; no publishing or remote database action is part of the pass.

## Measurement and implementation

Opened t047, t105, t119 and t050 before changing the scene. Decorative grass stripes are not reliable lane boundaries. Clear two-lane road sections in t047 and t119 span about 133 native pixels (multiple unoccluded x samples), with approximately 60-pixel horizontal cells: one lane is about 66.5 pixels, giving a row/cell pitch ratio near 1.1.

- Keep the 45-degree elevation and 20-degree yaw; give each logical row 1.38 rendered column units of depth. All ground kinds use this depth. At a fixed screen x the row/cell ratio is 1.105. Water is recessed by 0.12 units, with its bank rims inside the cell; sleepers and rails remain inside their track row.
- Phone 390×844: 48.75 CSS px horizontal cells, 53.87 px row pitch, about 15.7 rows vertically. Desktop 1366×768: fit by height rather than width, 48 px column scale, 45.11 px horizontal cells, 49.84 px row pitch and about 15.4 rows. The bird remains about 35% up from the bottom; the nine-column band stays centred with dimmed edges.
- Narrow vehicle depth and adjust height while retaining the collision length, cab/cargo details and separate compact/sedan/taxi silhouettes. Place traffic near the front of its own row. A vertex-level test checks both directions of cars, trucks and train pieces against the projected row boundaries, including the train's rail height. It checks solid silhouettes, beyond merely testing ground footprints. Shadows still extend to the right along the lanes.
- New worlds use generation revision three. River/log/lily blocks always have grass immediately before and after them. The dedicated adjacency test covers all 2,000 seeds × 400 rows, including the next row after a chunk boundary. Existing fairness checks remain intact. Revisions one and two keep their original RNG paths and pinned save fingerprints; revision three gains its own seed-only-save pins.
- Keep the shared floating glass controls, full-screen canvas, native High DPR up to three, antialiasing, original supplied poster and the UFO.

## Visual iterations and evidence

First inspected phone and PC start, mixed, junction, traffic-model and triple-rail captures. Then corrected a conservative projection bound after independent read-only code review, allowing chunkier truck/train silhouettes without crossing lane boundaries. The second DSF3 pass frames the river ahead of the bird and shows its grass banks; inspected it against the original frames and the native crop.

The final script targets only port 4190 and validates the worktree title/renderer marker, full-screen buffer geometry, native pixel ratio and antialiasing. Dedicated `lane-junctions` frames deliberately stress legacy direct river/road/rail adjacencies; `river-banks` frames show the new grass/log/lily/grass rule with nearby truck, road and rail. These setups are labelled separately from the natural mixed world.

Final evidence is in `/workspace/qcc-crossy-review/r7/`: 48 manifest views plus the 420×480 native crop, 49 PNGs in total. Every view checks full-screen bounds, native DPR and antialiasing. High buffers are 780×1688, 1170×2532 and 1366×768; maximum draw calls are 28 on phone and 29 on desktop. Runtime code is `d186cc1`; the recorded source diff contains only the documentation plan-link update. Completed per-view manifests merge only when commit, source hash, round, origin and worktree match. A SIGTERM interrupted an earlier combined run, so the final three complete viewport batches were captured sequentially. Frozen capture settling avoids redundant shadow renders without advancing simulation time, and CSS sheet animations finish before the shutter.

Seeds remain **11** for the start and **7** for comparison scenes. The natural mixed view now uses player row **418**, with log/lily rows **419–420**, grass banks **418/421** and rail **426** in view. The early triple crossing uses player row **24**, tracks **25–27**. Idle-UFO evidence also uses early grass row 24: at row 418 the faster real auto-scroll correctly causes a behind death before seven idle seconds. Behind-UFO evidence remains at row 418. All seven death setups validate the actual cause and dying phase before capture; mid-hop validates a live airborne pose.

The implementer opened phone/DSF3/PC views, deaths including both UFO causes, junction/bank/triple-track comparisons, shared menus/cards and the native crop beside the cited references. Independent read-only review found no material remaining defect in the seven phone comparison views; its code findings (projection formula, revision-three fingerprints and stale spec text) were corrected.

The remaining model, palette and shadow work from the [r6 audit matrix](2026-11-01-crossy-road-r6-review.md) is retained. This round revisits projection/desktop scale, water depth, river structure, vehicle occlusion and rail spacing (audit items 1, 5, 7, 10, 14 and 16), with Charlie's new grass-bank rule applied only to new worlds.

## Validation

- `npm run check`: passed.
- `npm test`: **169 files / 3,862 tests passed**, including the full 2,000-seed fairness and river-bank checks, all three generator revisions' fingerprints, and shared glass unit tests.
- `ARCADE_URL=http://127.0.0.1:4190 npx playwright test tests/games/crossy-road tests/leaderboard/online.spec.ts tests/e2e/viewport.spec.ts --project=chromium --workers=2`: **66 passed (4.6 min)**, including the shared floating glass and native-DPR/rotation checks.
- `ARCADE_URL=http://127.0.0.1:4190 npx playwright test tests/e2e/study.spec.ts --grep 'crossy-road: gameplay, Escape, frozen autosave and exact return' --project=chromium --workers=1`: **1 passed (11.2 s)**. The earlier isolated run passed in 11.9 seconds; no assertions were weakened or additional Study timeout investigation performed.
- Supplied poster remains byte-identical; no migration was applied manually or to a remote database. Generated PNGs stay outside git.

## Comparison limits

The supplied originals are portrait frames; the requested desktop fit therefore follows their vertical coverage. Exact train-body details and every death-animation interval cannot be established from these stills. Seeded layouts, the UFO and QCC's glass controls remain deliberate differences.
