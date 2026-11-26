# Imported chess engine performance

Scope: Maia3 (Atlas, Quill, Orbit, Vega) and Stockfish (Titan, Zenith, Nova,
Apex and analysis). QCC's beginner engines, game code, catalog and shared
registry are unchanged. Original model weights and imported runtime binaries
are unchanged and retain their pinned hashes.

Maia now returns immediately after inference. Its three model parts download
concurrently into one assembly buffer, with exact size and SHA-256 validation.
The runtime module downloads alongside them. Runtime graph options, model
weights, encoding and weighted sampling are unchanged. A single
inference can finish within the existing recovery grace period instead of
being killed at the soft thinking target and forcing another model load.
Actual chess-clock and absolute deadlines still apply.

Stockfish starts compiling while the WASM preflight is in flight. A failed
preflight releases the Worker and permits a clean retry. A position with one
supplied legal move returns immediately without searching or inventing an
evaluation. Analysis still searches. Search budgets, strength controls, thread
count and hash settings are unchanged.

## Matched local measurements

Five alternating runs per side on the four-core i5-7300HQ Windows host, with
four fixed positions per engine per run. Values below are the median of the
five run means, with their ranges. First-use assets came from the same local
no-store server. Host CPU utilization before samples ranged from 75% to 100%.

| Work | Before | After | Finding |
| --- | --- | --- | --- |
| Maia move response | 571 ms (569 to 606) | 293 ms (244 to 337) | 49% less time waiting for a move |
| Maia inference alone | 256 ms (201 to 460) | 286 ms (241 to 333) | Overlapping variation; no inference-compute speedup claimed |
| Maia initialization | 3,873 ms (3,006 to 4,693) | 3,855 ms (3,191 to 4,858) | Inconclusive on this local server |
| Stockfish initialization | 349 ms (282 to 595) | 415 ms (248 to 616) | Inconclusive on this local server |
| Stockfish normal search, 100 ms budget | 101 ms (101 to 109) | 105 ms (101 to 121) | Same search budget; overlapping variation |
| Stockfish sole legal move | 100.5 ms (98.6 to 105.4) | 0.1 ms (0.1 to 0.3) | No unnecessary search |

The main Maia limiter removed was deliberate pacing after completed inference.
The remaining work is the same single-threaded WASM forward pass, affected by
host contention. Stockfish's ordinary search is intentionally limited by its
unchanged thinking budget. Startup overlap is implemented, but the local runs
do not establish a download/startup speedup over an actual mobile connection.

All 45 requested moves per side completed successfully and were legal. All 20
Maia sampled answers matched between sides with fixed draws, positions and
ratings. The baseline was built from commit
`bef0fa5a95fcc7dec757f84f0724369eccf73cec`, including its Worker source. Candidate
source hashes, timings and per-run CPU readings are in
[the raw evidence](evidence/chess-imported-speed-20261116/paired.json).

## Checks

- `npm run build`: passed, including TypeScript, production bundling and the
  service-worker verification. Existing chunk-size/dynamic-import warnings remain.
- `node node_modules/vitest/vitest.mjs run tests/chess-ai --maxWorkers=1 --testTimeout=30000`:
  all 88 tests passed. This includes model/runtime hashes, encoding, weighted
  sampling, cancellation, stale output, clock deadlines, slow inference and
  failed-startup recovery. In-house tests were run without editing their code.
- Neural browser suite: desktop Chromium, Pixel Chromium emulation and iPhone
  WebKit emulation passed. Real model execution, cancellation/reload, missing
  runtime, missing/truncated/corrupt model parts and cleanup were exercised.
- The original dynamic inference graph and independent Python reference checks
  are retained. Browser policy/value logits must match those reference positions
  within the existing 0.125 raw-logit fp16 tolerance. This is a numerical check,
  not a new playing-strength calibration.
- Stockfish-only browser suite passed in all three environments, including
  real analysis, special moves, emergency clocks, cancellation/restart and
  missing/crashed assets. Desktop Chromium also completed a full legal game.
- Independent read-only review identified a failed-preflight cleanup issue
  and a timing assumption in the cancellation test. Both were fixed and checked.
- `git diff --check`: passed. Protected source paths have no diff.

The original mixed browser suite also ran. Its four mobile Chromium failures
were timeouts in unchanged in-house opponents: the 700 move/pacing case,
300 abort/restart case, and 300/700 special-move cases. Imported Stockfish cases
passed. The focused run does not establish that those unrelated failures are fixed.

## Broader repository run

`node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=30000`
finished with 5,634 passes, 15 failures, 7 skips and three worker RPC timeout
errors. The following failures are outside the edited chess paths and remain:

| File | Failing behavior |
| --- | --- |
| `tests/core/festive.test.ts` | Original-visuals check compares a Windows `audio\sounds.ts` path with an exception written as `audio/sounds.ts` |
| `tests/movies/popularity-api.test.ts` | Shared-address hourly throttling test exceeded its 20 s timeout |
| `tests/games/breachline/audio-pack.test.ts` | Opus pack test requires `rm`, unavailable on this Windows host |
| `tests/games/blockcraft/light.test.ts` | Generated-terrain and cave lighting exceeded 3 ms thresholds |
| `tests/games/blockcraft/mesher.test.ts` | Generated-terrain meshing exceeded 2 ms threshold |
| `tests/games/blockcraft/terrain.test.ts` | Terrain generation exceeded 4 ms threshold |
| `tests/games/last-light/campaign.test.ts` | Stage 7 pickup 3 overlaps platform 5 at time zero |
| `tests/games/last-light/journey.test.ts` | Level 2 opening requires a dash; continuous witnesses for stages 1 through 4 encounter a death |
| `tests/games/neon-coil/growth.test.ts` | Billion-mass wide-right and figure-eight routes exceeded 30 s timeouts |

The busy four-core Windows host also produced three Vitest `onTaskUpdate` RPC
timeouts. This run is not a green repository-wide result. No unrelated source
was changed to address these failures.

## Measurement limits

Physical phones, thermal behavior, battery consumption and total/RAM usage have
not been measured. Phone viewports and Chromium's page CPU throttle do not
establish physical-phone performance or worker CPU speed. The model still
requires its original 57.6 MB of first-use assets. No RAM reduction is claimed.

Reproduce the separate production-bundle comparison with the commands in
`tests/chess-ai/providers/browser/README.md`. The baseline is read directly from
HEAD, without resetting or modifying the working tree. Timed work uses fixed
positions, ratings, sampling draws, validated legal results and unchanged
Stockfish budgets. Heavy tests and builds finish before timing starts.
