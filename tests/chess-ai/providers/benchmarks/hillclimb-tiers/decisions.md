# Custom opponent calibration and speed

Scope: improve the custom 300, 500 and 700 opponents against Chess.com rapid
references, and make all four custom opponents responsive on slower devices.
The previously approved 900 must retain its strength. External engines are
outside this change. There are no commits or deployments from this run.

## Fixed references

`baseline/` contains the accepted 900 implementation and original lower tiers
at the start of this follow-up. Only provider type import paths were relocated.
`baseline-hashes.json` records each file. The collector and snapshot scripts
refuse to overwrite these references.

Each frozen human cohort contains 160 positions from 40 rated standard rapid
games. Both players' game ratings lie within the target's 200-point interval.
Four positions are sampled by game-length fraction without move-quality
selection. Contributors were hash-ordered and split before tuning. These are
small convenience samples from three clubs, not representative platform pools.
See `cohort-census.json` for contributors, games, repeated boards and hashes.
Contributors and games do not cross the tuning/validation split; opponents
were not the split unit. Common early boards do cross in three cohorts.

The primary measure is mean oracle loss capped at 1000cp, with four fixed
bot seeds per position. The goal for 300/500/700 is a validation mean within
20% of the same-position human mean. Histograms and contributor bootstrap
intervals accompany the means. Centipawn loss is not converted into Elo.

## Measurement correction

During tuning, a preferred oracle root was scored as a large error because
Stockfish's unrestricted and forced searches found different mate horizons.
Metric 2 therefore force-searches the preferred root as well as every chosen
root at depth 10, and asserts that choosing the preferred root costs zero.
The comparison restarted on the same frozen baseline, cohorts and seeds.
Earlier reports remain evidence of the exploration, not final calibration.

The final strength runner also replaced Vite SSR's setup loader after repeated
60-second transport timeouts loading `perception.ts`. It bundles the same source
into temporary Node ESM with esbuild, without minification or tree shaking.
Both baseline and candidate rerun under this loader. `compare-loaders.mjs`
requires every candidate tuning move, node count and completed depth to match
the pre-change reports before the pipeline can score untouched validation.
Compiler version, output hash and benchmark hash are recorded. This changes
setup only and supplies no browser or performance evidence.

## Tuning rounds

| Round | Hypothesis and outcome |
| --- | --- |
| 1 | Remove SAN construction from lower-tier search. Retained provisionally. A three-ply ceiling alone did not improve 900 latency and was rejected. |
| 2 | Use fixed normal work, tactical capture generation and lazy legality checks. Retained after legal-move and work checks. |
| 3 | Increase danger awareness in lower tiers; reduce 900 nodes. Lower-tier quality improved. |
| 4 | Increase capture awareness; remove 900 root SAN construction. Retained, followed by the metric restart. |
| 5 | Reduce sampling noise. Quality improved but the old forced free-queen distinction failed; this was recorded before further changes. A legality optimization preserved all compared moves, nodes and depths. |
| 6 | Give unnoticed captures no material reward; test 300 nodes for 900. The small 900 budget was later rejected by the accepted-strength regression. |
| 7 | Increase lower danger awareness and use two-ply legal search for 700. Improved the previous static-model plateau. |
| 8 | Sharpen 300 sampling and increase 700 work. Retained. Sharpening 500 sampling worsened its metric and was reverted. |
| 9 | Reduce automatic pawn-advance rewards. Retained for searched evaluation and 500; the 300 quiet-pawn change washed and was reverted. |
| 10 | Increase 300 capture awareness, reduce 700 noise and give 900 1200 nodes. 900's full historical regression was within 1% of accepted loss. |
| 11 | Increase 300 mate awareness. No measured effect, reverted. |
| 12 | Make 300 danger awareness complete. Improved tuning loss. Full games then exposed the static 500 losing to 300. |
| 13 | Give 500 one-ply legal search using the shared bounded search. Retained after the full-game ladder became ordered. |
| 14 | Give 500 a second principal ply after its first holdout missed. It matched retired training and kept the full-game ladder ordered, but overshot the new independent sample. Rejected as final calibration. |
| 15 | Mix one and two principal plies equally by seed for 500. Pooled retired training ratio 0.937. Frozen third holdout ratio 0.984 on 320 positions from 80 games and 31 contributors. Retained. |

The 300 and 500 tuning means remained about 21% above their human references,
slightly outside the 20% target. That is a near plateau, not a claim that the
training target was met. Final acceptance still depends on untouched validation
and independent council judgment.

The first complete validation passed 300 and 700 at ratios 0.899 and 1.190.
The 500 ratio was 1.601, so that validation was retired before round 14.
A new 192-position, 48-game sample from 18 contributors excluded both players
from all 40 original games. It was frozen before round 14. Two-ply 500 then
scored 77.08cp against a human 120.87cp, ratio 0.638, and was rejected too.
Both retired samples remain in the evidence. The next training pool retains
all 352 positions. A predeclared larger third sample uses 80 games, at least
27 contributors and both-player separation from all 88 retired games. No
quality filtering or removal of inconvenient results is allowed.

That third sample was frozen at 11:47:53.389Z before the round 15 edit.
The mixed model scored 100.24cp against human 101.83cp and original 243.16cp.
The contributor-bootstrap difference interval was -22.87 to 18.46cp. The
metadata-only audit proves zero player/game overlap with both retired samples,
exact preservation of all 352 training positions, and at most three games per
contributor. Three common board states remain and were not removed. The 48
final full games all finished legally, with higher-tier score above .5 in every
pair. This remains an ordinal check, not a competitive rating measurement.

The 900 budget is constrained by the actual historical eight-seed choices
from its approved 176-position report, re-anchored under metric 2. Its new
convenience cohort is a descriptive cross-check, not permission to weaken it.
This historical regression is reused evidence, not fresh validation.

## Speed and infrastructure controls

The provider now delivers completed legal moves immediately. Normal budgets
use fixed work so seeded decisions do not depend on device speed. Tight clock
budgets retain timed fallbacks, cancellation and the original hard watchdog.

Page-only CPU throttling was rejected: actual worker arithmetic did not slow
down. The retained harness owns a new browser process tree and uses a persistent
Windows CPU-rate job controller. The initial relative slowdown check failed
under near-total host contention. All such runs remain rejected. The explicit
capacity-v1 restart traces the actual Worker to its OS process/thread, proves
native job membership, queries the unchanged 416/10000 hard cap on four logical
processors, and brackets fixed arithmetic with whole-job user/kernel CPU
accounting. All five limited legs must have CPU-seconds / summed Worker-loop
wall-seconds at most .20. This is a conservative validation tolerance alongside
the queried cap. Quantized counters and other browser CPU remain included.
It establishes neither a sixfold wall slowdown nor physical phone equivalence.
Paired wall ratios are descriptive only. The council must review this change.
The first complete capacity-v1 attempt stopped before chess samples because
one limited leg measured .2001601281, exceeding .20. It remains rejected.
Capacity-v2 predeclares three 200-million-iteration loops per leg, four times
the earlier fixed work, to reduce fixed IPC and quantized-counter effects.
Every cap, tolerance, pair count, viewport and latency gate stays unchanged.
No failed leg is removed or rounded down. The final full matrix is required.
Capacity-v2 then completed all 1280 warm rows but failed with eight candidate
warm timeouts and one candidate first-reply error. Valid capacity accounting
did not provide steady slower execution: a 1.4ms Worker computation could take
573.9ms to deliver. Microsoft's hard-cap API documents pausing job threads
after their interval budget is spent. The scheduling interpretation is an
inference consistent with the observations. No old failure is a speed pass.

Direct CDP throttling on a proven dedicated Worker target was unsupported in
Chrome157, with error -32000: supported for pages, not workers. The next explicit
restart, slow-js-vm-v1, uses normal and --js-flags=--jitless Chrome. Actual Worker
arithmetic must be slower in every paired check; this cannot be translated into
a constant chess or phone slowdown. Jitless disables WebAssembly, which the four
custom providers do not use. The same burst requests, seeds, work preservation,
all-row retention, source guards and 100/200ms gates remain. Both baseline and
candidate must return legal replies without errors. This is slower-JS-runtime
evidence only; physical phones remain unmeasured. The council must review it.
Unrelated processes are not
changed. Every baseline/candidate matrix uses five alternating repetitions,
identical positions and seeds, legal-success checks and recorded host load.
The gates remain warm p95 below 100ms without the limit and 200ms under the
verified capacity limit. Startup and first replies are reported separately.

Dev-server compilation and canceled-worker module transfers caused setup
failures. No result from those failures was accepted. The isolated lifecycle
page now uses plain Playwright fixtures because the app's unrelated TMDB route
disabled browser HTTP caching. The original 750ms cold recovery allowance and
250ms single warm-reply check remain. Server preparation is recorded outside
client timings; client parsing, worker initialization and first replies are
still measured. Both Chromium and WebKit then passed cancellation recovery.

The production build was checked. Earlier automatic approval review blocked
production-preview attempts with only "blocked by policy"; those attempts
were not retried or bypassed. Dev runtime, simulated hardware and physical
phone performance are distinct claims.

The canonical append-only decision trail remains in
`.omc/state/decision-trail-chess-tiers.tsv`. A portable copy and the final
verification report accompany the finished evidence after review.
