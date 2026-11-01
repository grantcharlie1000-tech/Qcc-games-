# Crossy Road fidelity r6

Charlie's 17:43 steering superseded the interrupted r5 capture round. The r5 implementation is preserved in `4b1ee7d`; shared glass commit `5d94c34` was merged locally as `9b20fdc`; `5c53914` adopted its controls and sheets. The supplied poster was copied unchanged in `e439a23`.

## Review method

Read the full external r4 audit and opened its cited original frames, including t017/t027/t028/t047/t050/t100/t105/t111/t119/t121. Reworked projection first, inspected phone/desktop projection captures, then resized models. R6 preflight iterations calibrated output colours after lighting, corrected the signal housing/bulb boundary, removed the remaining log rim and brightened cargo sides after independent pixel comparison.

Final evidence belongs in `/workspace/qcc-crossy-review/r6/`, outside git. Main seeds remain **11** for the start and **7** for the natural mixed crossing at row **48**. The additional natural triple-rail view uses seed **7**, player row **21**, tracks **22–24**. Dedicated junction/model views replace only focal lanes through the development hook and are labelled in the manifest.

## Audit coverage

| Item | Change | Evidence / reference |
| --- | --- | --- |
| 1 | 45° elevation, 20° yaw; eight phone cells across; gentle lateral follow | start/mixed; t047/t105/t119 |
| 2 | Sun along −X, shadows extend about .94 × height along +X; 4096 hard map; no High chicken blob | start/mid-hop/native crop; t047/t027 |
| 3 | Authored 1.2-tile cyan compact and 1.8-tile sedan/taxi; smaller long-car cabins, stepped bonnet/trunk, fixed square hubs | traffic-models; t047/t105/t119 |
| 4 | Muted one-tile dashes on a two-tile repeat, only between road lanes | mixed/traffic-models; t047/t119 |
| 5 | Luminous turquoise water, broad irregular foam, one faint ripple motif; .18-tile recess and dark plum soil banks | mixed/lane-junctions; t017/t119/t121 |
| 6 | Road edge uses .80 linear brightness; water has its own bright blue edge palette; peripheral props less dim | mixed/PC; t047/t119 |
| 7 | Desktop eased back after Charlie's r5 feedback: fourteen central cells plus a dim edge cell on each side | PC start/mixed; full-width landscape adaptation |
| 8 | Chicken geometry X/Z ×.78, height preserved; approximately 30×44 CSS px when grounded on phone | start/mid-hop/native crop; t028 |
| 9 | Record visible contact pose and side/hop-in mode; settle compact pancake onto impacted road row, retain impact height | car/truck deaths; t059/t100 |
| 10 | River thickness 20/60/20 % for 1/2/3 rows; ending lily row allowed in log/lily pair | natural mixed row46/47; t017/t024 |
| 11 | .48-tile log depth, simple unframed body and irregular bark patches; early length odds .2/.6/.2 | mixed/lane-junctions/swept; t017/t119 |
| 12 | One/two/three rail rows from the start, each with independent warning and quiet period | natural triple-rail; t105/t111/t115 |
| 13 | .62-tile continuous foliage, exposed dark plum trunk, calibrated lime tops and olive sides | start/mixed; t047/t119 |
| 14 | Deep red/cyan cabs, raised pale cab vent, cool cargo top and calibrated lavender sides; no cargo stripe | traffic-models; t105/t115 |
| 15 | Calibrated alternating lime grass after lighting | start/mixed; t047/t119 |
| 16 | Slate bed, sleepers at one-tile intervals, narrow purple steel rails | triple-rail/lane-junctions; t050/t111 |
| 17 | Road gap base 4.2→3, still bounded by crossing time; varying 2–5-mover patterns | mixed/PC; generator fairness sweep |
| 18 | Small flashing front lamp and soft red ground spill; no oversized cubic halo | mixed/triple-rail; t028/t111 |
| 19 | Lavender boulders with asymmetric split/notched tops | start/mixed; t047/t119 |
| 20 | Short brown/plum stump variant, retaining the blocked-tree cell semantics | start/mixed/triple-rail; t119 |
| 21 | .49-tile thin pads with shallow notch and small orientation variation | mixed; t017/t024 |
| 22 | Seeded clustered rear-forest heights replace the diagonal height lattice | start; t047/t119 |
| 23 | Remove internal horizontal foliage caps; broad baked side bands; crisp texel-snapped 4096 shadows | start/native crop; t047 |

The animation appendix is also addressed: train/UFO anchors retain rendered hop height; the carried bird clears the saucer underside and sits toward the camera. UFO rules remain warning at 5 s, capture at 7 s without forward progress, or immediately at three rows behind/back; hop duration remains 120 ms.

## Additional priority fixes

- Real shared `game-chrome.ts` / `glass.ts` bindings and `arcade-glass`, `game-glass`, `glass-control`, `ui-glass-sheet`, `arcade-sheet` materials. The floating Top scores button is shell-owned. No full-width header or reserved canvas band.
- The shared card's light tone and `--sheet-ink` / `--sheet-muted` tokens apply to all game-over/Continue text and actions.
- Banks, cars, trucks, trains, logs, pads, sleepers, signal housing and front bulb remain within their one-row solid footprint. Dedicated captures cover grass/river, river/rail, rail/road and road/river junctions. Tall objects can naturally occlude ground behind them.
- Native High DPR refreshes on CSS resize, orientation, window resize and density-only changes; Low retains its permitted 1.5 cap. No canvas CSS scale.
- Top scores pauses before opening and restores the preceding pause state on close.
- Leaderboard selector expects 20 options and explicitly includes Crossy Road. Other catalog/home counts remain 22.
- New runs store generation revision two. Legacy saves rebuild revision one with unchanged RNG ordering and pinned fingerprints. The fairness sweep remains 2,000 seeds × 400 rows.

## Validation

Pending final capture inspection and combined Chromium run. Independent read-only code and preflight visual reviews completed; their cargo-side and light-sheet-caption findings were applied.

## Limits of comparison

No original landscape frame was supplied, so desktop framing is an adaptation rather than a measured original landscape camera. Exact death cadence and full train-body details cannot be established from the supplied stills; the brief's supported timing and behaviours are retained. World layouts differ by seed, and the UFO and QCC glass UI are deliberate differences.
