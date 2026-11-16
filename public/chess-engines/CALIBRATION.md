# QCC chess AI calibration

The catalog Elo values are development targets. None is a verified Chess.com,
Lichess or FIDE rating. Stockfish's `UCI_Elo` numbers describe its own upstream
calibration, which does not establish equivalence for QCC's short move budgets.
Maia's Elo input describes the human move distribution learned during training,
not an independently measured engine rating.

## Reproduce

Run from the repository root after `npm ci`:

```sh
node tests/chess-ai/providers/benchmarks/run.mjs
node tests/chess-ai/providers/benchmarks/tactics.mjs
node tests/chess-ai/providers/benchmarks/quality.mjs
node tests/chess-ai/providers/benchmarks/maia.mjs
MAIA_GAMES=8 MAIA_LOWER=900 MAIA_UPPER=1100 MAIA_REPORT=maia-900-1100-final-results.json node tests/chess-ai/providers/benchmarks/maia.mjs
```

`CALIBRATION_GAMES`, `CALIBRATION_MS`, `CALIBRATION_PLIES` and
`CALIBRATION_PAIRS=300:500,500:700,700:900` select a pool run. Default values
are 40 games per pair, 75 ms and 400 plies. `MAIA_GAMES`, `MAIA_LOWER`,
`MAIA_UPPER` and `MAIA_REPORT` select neural or cross-family matches.
`MAIA_PAIRS=1100:1300,1300:1600,1600:1900` selects a matrix with
`MAIA_GAMES` games per pair in one reused model session.
`QUALITY_DEPTH` and `QUALITY_SAMPLES` select the genuine Stockfish audit.

These are offline, single-process engine benchmarks. They use the actual
vendored chess rules, beginner search, Maia3 ONNX weights, ONNX Runtime WASM and
Stockfish 19 Lite WASM. They exclude provider Worker startup and intentional
human pacing. Browser smoke tests cover those separately.

Raw results live in `tests/chess-ai/providers/benchmarks/`. Every report records
the searched source or model SHA-256. Re-running on a different or busy device
can change beginner choices when its wall-clock guard stops candidate scoring.
Seeds reproduce perceptual choices when the same candidates are completed.

## Beginner pool

Four custom opponents, identified honestly as QCC beginner engines, play adjacent
pairs. Each pair plays 40 games with balanced colors, paired random seeds and
five short opening prefixes. The ordinary provider's 75 ms core ceiling is used;
there is no per-game chess clock or increment. Games stop at checkmate, a rules
draw or 400 plies. Games reaching the cap are **unfinished**, not adjudicated
wins or draws, and are excluded from finished-game score. Their count is
reported so that this exclusion cannot conceal endgame problems.

This is a small internal regression pool. A score interval is descriptive:
paired seeds, shared openings and fractional draw scores weaken an independent
Bernoulli interpretation. It is suitable for catching inverted adjacent tiers,
not assigning absolute Elo. The VM was shared with builds and browser tests;
latency and time-truncated move quality therefore include CPU contention.

## Final observed strength order

The selected final pool contains 120 complete games: 87 checkmates and 33
rules draws, with no invalid moves, engine failures or unfinished games.

| Stronger / weaker target | Wins | Losses | Draws | Score | Approximate 95% score interval |
| --- | ---: | ---: | ---: | ---: | --- |
| 500 / 300 | 25 | 0 | 15 | 81.25% | 66.6% to 90.4% |
| 700 / 500 | 23 | 5 | 12 | 72.5% | 57.2% to 83.9% |
| 900 / 700 | 23 | 11 | 6 | 65.0% | 49.5% to 77.9% |

The observed order is correct and the earlier extreme gaps have been reduced.
The 900 versus 700 interval remains broad and almost includes equal strength;
more games would be needed for a precise separation. These scores are not an
external Elo measurement. Distinct first-eight-ply sequences were 30/40, 26/40
and 29/40 per pair despite the five deliberately shared starting prefixes.

The first 80 matches used source hash
`6b53499eaa8e56377b3f835cae9ee01882b3ad3b3c81c2dabd81d87aac54d816`.
The final 40 matches used
`cc2abb0fc7f37bc760dce77c185e1b30b555db86aa7def4c51de8a969e5f1148`.
Only the 900 profile constant changed between these batches. `combine.mjs`
restores that single line and checks that the entire original file's SHA-256
matches, proving the 300/500/700 code was unchanged. `results.json` records
source hashes per pair and game. The obsolete900 games stay in
`pre-900-tune-results.json` and are excluded from the selected final 120.

| Target | Core mean | Core median | Core 95th percentile |
| --- | ---: | ---: | ---: |
| 300 | 7.2 ms | 2.8 ms | 31.9 ms |
| 500 | 13.6 ms | 7.0 ms | 52.4 ms |
| 700 | 21.5 ms | 14.5 ms | 63.6 ms |
| 900 | 24.1 ms | 19.2 ms | 60.6 ms |

These are active search times, not user-visible thinking delays. Timing and
CPU/RSS data are retained per source batch. The original 120-game batch used
336.4 s wall time and 327.1 s process CPU time; its end RSS was 271.6 MB. The final
900-only 40-game batch used 141.1 s wall time and141.8 s process CPU time; end RSS
was 259.9 MB. RSS includes Node, Vite SSR, rules and GC capacity and is not an
isolated browser engine footprint or proof of a leak. The VM CPU was an AMD
EPYC 9V45, with a four-CPU quota and 16 GiB memory limit. Browser/mobile evidence
is recorded separately by the browser harness.

## Pre-tuning findings

The first profiles were too far apart. In 40 games, 500 beat 300 by 31 wins to
1 loss, with 3 draws and 5 capped games. The 700 profile then beat 500 by 39
wins to no losses, with one capped game. These observations triggered retuning
before release. `pre-tuning-*` files retain the original measurements.

The first retuning pilot ran 16 games per pair at the same 240-ply cap. It
produced 500 over 300: 4 wins, 2 losses, 3 draws, 7 caps; 700 over 500: 12 wins,
1 loss, 3 caps; and 900 over 700: 14 wins, 2 losses. The final adjustment restores a little 500
awareness and makes 700/900 reply lookahead depend on whether the bot notices
danger on that turn. This preserves realistic perceptual errors. The 40-game-per-pair run raised the cap to 400 plies to reduce censoring.
The first 900 version still scored 95% (37 wins, 1 loss, 2 draws) against 700, so
only 900 was retuned halfway toward 700. A 16-game pilot then scored 65.625%
(9 wins, 4 losses, 3 draws), followed by the final 40-game 65% result above.

## Final elementary behavior probes

Each case uses 100 paired seeds at 75 ms. The fixed positions test mate in one,
a free queen, queen promotion and avoiding a back-rank mate in one. Success on
a deliberately simple position is not general tactical accuracy.

| Probe | 300 | 500 | 700 | 900 |
| --- | ---: | ---: | ---: | ---: |
| Mate in one | 20% | 45% | 60% | 71% |
| Capture free queen | 54% | 73% | 84% | 88% |
| Queen promotion | 98% | 100% | 100% | 100% |
| Avoid back-rank mate | 61% | 59% | 61% | 61% |

The 300 and 500 profiles make different, plausible perceptual errors. They do
not choose uniformly random legal moves. The 500 profile improves capture
awareness and notices mate more often. The quiet back-rank-threat probe remains
a weakness across all custom profiles;
their limited reply subset emphasizes captures and does not guarantee noticing
quiet mating threats. The 900 profile examines more replies when it notices
danger, but is deliberately still fallible.

## Final genuine Stockfish move-quality audit

Stockfish 19 Lite WASM from stockfish.js 19.0.1 runs unrestricted, one thread,
16 MiB hash. Six fixed opening/tactical positions are searched to depth 8.
For each position, each beginner makes 20 independently seeded choices. The
unrestricted root and each forced selected root move are evaluated in separate
Stockfish searches. Values are compared in the same side-to-move orientation.

| Target | Audited moves | Mean centipawn loss* | Loss over 200 cp or allows forced mate |
| --- | ---: | ---: | ---: |
| 300 | 120 | 216 | 35.0% |
| 500 | 120 | 127 | 26.7% |
| 700 | 120 | 102 | 23.3% |
| 900 | 120 | 88 | 21.7% |

*Mean includes positions with centipawn scores for both searches. Mate scores
are counted separately in raw results. Loss is clamped to zero because finite
depth searches can disagree. This tiny, selected suite establishes useful
behavioral distinctions, not representative game blunder rates or ratings.
Stockfish search is real; no mocked evaluations are used.

## Stockfish strength boundary

The final frozen 900 profile also played six balanced-color games against
actual bundled Stockfish 19 Lite WASM at 50 ms per move. The beginner used its
ordinary 75 ms core ceiling. Stockfish won all six by checkmate, in
29/32/15/46/37/28 plies. There were no invalid moves, draws or capped games.
The approximate 95% Wilson score interval is 61% to 100%; six games demonstrate
a clear practical boundary in this sample, not an absolute rating. See
`tests/chess-ai/providers/stockfish-strength-results.json` and its runner.

## Maia3

The Maia benchmark uses the same official model, encoding, legal masking and
weighted policy sampling as the provider. It compares all four rating inputs
on fixed positions and runs a small balanced-color 1100 versus 1900 sample.
The model's own and opponent rating inputs both equal the selected tier,
matching the production provider. One inference is performed per move, with no
search or hidden Stockfish assistance.

In the initial extreme-tier smoke test, Maia 1900 won both colors against
Maia 1100 (70 and 89 plies), with no invalid moves. Initialization took 3.17 s
and 167 inferences averaged 161.5 ms (median 134.9 ms, 95th percentile 275.0 ms)
on the contended VM. A separate eight-game boundary check tied pre-tuning
custom 900 and Maia 1100 at four wins each, all games completed. Its warmed Maia
inferences averaged 83.5 ms. The Node process RSS included Vite, ONNX Runtime
and the model and reported 593 MB at the end; this is not isolated model memory
or an iPhone measurement.

Against the final frozen custom 900 profile, Maia 1100 won 7 games and drew 1
in 8 balanced-color games, with no unfinished games or failures. This is a
small sample with a wide interval, not proof of a precise 200-point gap. The
238 genuine inferences averaged 81.6 ms, median 77.9 ms, 95th percentile 98.4 ms.

The final adjacent Maia matrix used four balanced-color games per pair:

| Higher / lower input | Higher wins | Losses | Draws | Caps/failures |
| --- | ---: | ---: | ---: | ---: |
| 1300 / 1100 | 2 | 1 | 1 | 0 |
| 1600 / 1300 | 2 | 1 | 1 | 0 |
| 1900 / 1600 | 3 | 0 | 1 | 0 |

All 12 games finished legally. No obvious conditioning reversal was observed,
but four games per pair cannot establish reliable separation or precise Elo.
The matrix's 912 genuine inferences averaged 78.6 ms, median 75.5 ms, 95th percentile
91.0 ms. Raw results, model SHA-256 and encoder SHA-256 are in
`maia-adjacent-results.json`. The model's mate-in-one probability on the fixed
probe increased from 82.1% at 1100 to 87.2% at 1300, 91.0% at 1600 and 92.0% at 1900.
These are authentic conditioned policy probabilities, not fabricated scores.

The full supported rating ladder requires a larger independent match pool and
human evaluation. A tiny Maia match sample is only a legal-play and conditioning
smoke test. It cannot establish relative playing strength at every adjacent
tier, particularly because a human-move predictor is not trained to maximize
self-play win rate.

## Remaining validation

Absolute rating calibration needs substantially more games against externally
rated, fixed versions of known weak baselines under a defined clock. Human
playtesting is needed to assess whether mistakes feel natural. Real low-end
Android and iPhone hardware measurements remain separate from desktop browser
mobile emulation. No platform-rating equivalence is claimed.
