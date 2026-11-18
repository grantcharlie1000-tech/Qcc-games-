# Chess ladder calibration follow-up

Base `383f8d0467086c6e27be56fdd3cbf76acd24771b`. The production revision used for the original repro was `a86420b1f6cec51a859c3455a707ca7bb53885cd`. The catalog numbers are target strengths. This review measures move choices and an internal game pool. Competitive Elo would require rated opponents and game results in the same pool.

## Pebble

Version 1.2.0 always checks whether an immediate capture threatens material. Version 1.3.0 checks on 80% of normal turns using the existing seeded perception check. The existing opening, capture and mate heuristics, legal move constraints and worker budgets still apply. A hanging-queen regression checks that Pebble usually saves its queen and can occasionally miss the threat.

| Legacy Chess.com 200–399 rapid sample | Mean capped loss | Loss ≥200 cp | Loss ≥500 cp |
| --- | ---: | ---: | ---: |
| Production Pebble | 145.85 cp | 22.50% | 5.94% |
| Candidate Pebble | 154.36 cp | 24.06% | 7.81% |
| Human moves | 162.16 cp | 31.25% | 11.25% |

The [paired rows](pebble-legacy-paired.json) cover 80 positions from 20 games, six contributing accounts and four bot seeds per position. Twenty-eight of 320 choices changed. The mean loss increase was 8.52 cp. The 95% contributor-cluster bootstrap interval was −1.5 to +22.1 cp. The candidate minus human interval was −49.0 to +24.6 cp. This sample was available to previous tuning efforts. The fresh holdout below is small and gave identical paired choices.

In [48 baseline games](beginner-baseline-games.json) and [48 candidate games](beginner-candidate-games.json), every game reached a rules-confirmed result by 400 plies. Every pair used both colors at four opening prefixes. Pebble scored 2/8 before and 0/8 after against Sprout. It scored 0/8 in each run against Ember and Brook. The other 24 move sequences match exactly between runs. This pool shows that the candidate weakens Pebble in these games. Eight games per pair leave substantial uncertainty about the size of the gap.

## Rated position samples

Four positions per game at 15%, 35%, 60% and 80% of recorded ply count. One matched seed per position. The oracle is the vendored Stockfish 19 Lite, one thread, 16 MiB hash, with `go depth 10`. It finds a preferred root and then searches that move and each human and bot move separately with `searchmoves`. Each move's loss is floored at zero and capped at 1000 cp. Mate scores saturate the cap when they lead to sufficiently large losses. The Stockfish provider uses `go movetime` with the actual untimed catalog allowance, legal root moves and full position history on a fresh UCI game. A timed QCC session can use a shorter allowance, and consecutive turns retain engine state. Maia uses the shipped weights, equal self and opponent rating inputs and temperature-one legal sampling. The harness reports the current configuration's isolated-position engine time.

Both players had ratings in the same target ±100 band, with the high endpoint excluded. Each player and game appears at most once in each newly collected pool. Split assignment was frozen before changing Pebble. Chess.com contributors and game URLs recorded in the previous beginner cohorts were excluded. The prior data does not record every opposing player's account, so full legacy player separation could not be verified. Recent games and club or time-of-month selection make these convenience samples.

- [Chess.com source](https://www.chess.com/news/view/published-data-api) and [frozen games](chesscom-cohort.json). The collector inspected the first 180 accounts by salted hash from Beginners and Masters, using November 2026 public monthly archives. First eligible standard rated rapid game per account, at least 24 plies, up to 24 games per band. Alternating collection order assigned games to tuning and validation. Only validation was scored in this comparison.
- [Lichess source](https://database.lichess.org/) and [frozen games](lichess-cohort.json). The collector read complete PGNs from the first 1,605,243 bytes of the October 2026 rated game export. The snapshot records its hash and decoder offset. First 40 eligible rated standard rapid games per band, at least 24 plies, both rating-difference tags and no labeled bot. Alternating collection order assigned games to tuning and validation. Lichess and Chess.com are separate rating pools.
- [Stockfish smoke input](upper-smoke-cohort.json) and [results](upper-smoke-results.json). Zenith, Nova and Apex each returned four legal replies per run on a single game from the 2200 Lichess band. These timing and legality observations use no matched human cohort for those three entries.

| Target | Human pool | Games / positions | Bot before → after (cp) | Human (cp) |
| --- | --- | ---: | ---: | ---: |
| 300 Pebble | Chess.com | 2 / 8 | 141.75 → 141.75 | 87.25 |
| 500 Sprout | Chess.com | 1 / 4 | 35.25 → 35.25 | 150.50 |
| 700 Ember | Chess.com / Lichess | 3 / 12 and 5 / 20 | 46.42 → 46.42 / 78.65 → 78.65 | 33.83 / 158.00 |
| 900 Brook | Chess.com / Lichess | 1 / 4 and 14 / 56 | 93.75 → 93.75 / 70.23 → 70.23 | 76.00 / 138.39 |
| 1100 Atlas | Lichess | 20 / 80 | 98.65 → 98.65 | 82.14 |
| 1300 Quill | Lichess | 20 / 80 | 89.25 → 89.25 | 73.81 |
| 1600 Orbit | Lichess | 20 / 80 | 59.99 → 59.99 | 68.33 |
| 1900 Vega | Lichess | 20 / 80 | 58.84 → 58.84 | 22.95 |
| 2200 Titan | Lichess | 3 / 12 | 113.00 → 155.33 | 7.33 |
| 2600 Zenith | No matched sample | 1 / 4 smoke | Legal replies in both runs | |
| 3000 Nova | No matched sample | 1 / 4 smoke | Legal replies in both runs | |
| Max Apex | Unnumbered | 1 / 4 smoke | Legal replies in both runs | |
| Lumen | Unnumbered | Unavailable | No installed provider | |

The [Chess.com](chesscom-summary.json) and [Lichess](lichess-summary.json) summaries include the two error thresholds, paired move changes, timings and intervals. Vega averaged 35.89 cp more loss than its Lichess comparison, with a game-cluster interval of +11.5 to +66.7 cp. The Atlas, Quill and Orbit intervals span zero. The Maia and Stockfish inputs are the same in both runs. Titan's two observations differ under the same wall-time settings and fresh UCI games. No upper setting was selected using these holdout results.

## Reproduce

Use Node 24 and the pinned engine assets. Run the benchmark from the candidate checkout. The final argument is a separate checkout at the base above.

```sh
d=tests/chess-ai/providers/benchmarks/ladder-calibration
node tests/chess-ai/providers/benchmarks/ladder-compare.mjs "$d/chesscom-cohort.json" validation /tmp/qcc-chesscom.json /path/to/base
node tests/chess-ai/providers/benchmarks/ladder-compare.mjs "$d/lichess-cohort.json" validation /tmp/qcc-lichess.json /path/to/base
node tests/chess-ai/providers/benchmarks/ladder-compare.mjs "$d/upper-smoke-cohort.json" validation /tmp/qcc-smoke.json /path/to/base
node tests/chess-ai/providers/benchmarks/tiers-match.mjs
node tests/chess-ai/providers/benchmarks/hillclimb-tiers.mjs 300 pebble-repro validation
```

The last two commands write reports into the existing `hillclimb-tiers` directory. Use separate checkouts to repeat the base and candidate runs. The held-out JSON files retain the source game, time control, ratings and moves without storing player handles. The comparisons retain moves, scores, seeds, timing and engine hashes. The bootstrap intervals resample whole games for the fresh pools and contributing accounts for the legacy pool using 10,000 replicates. No interval is shown for fewer than five clusters.

## Runtime and routing

- TypeScript checking and all 145 focused chess and chess AI tests passed. The suite includes the genuine engine asset checksum tests and the hanging-queen test. That new test failed on the base with zero missed threats.
- Chromium at 1440 px and 390 px selected Pebble from the actual Computer menu and replayed six legal replies each from the Beginner module worker. Both runs completed with zero page errors or Maia and Stockfish asset requests. The [browser record](browser-results.json) includes the catalog badges, providers, availability and end-to-end timings, which include Playwright action waits and shared host load.
- The legacy candidate move loop had a 2.13 ms p95 across 320 Node requests. This excludes browser startup and delivery. The baseline was measured in a separate batch under different load, so the difference is not a speedup estimate.
