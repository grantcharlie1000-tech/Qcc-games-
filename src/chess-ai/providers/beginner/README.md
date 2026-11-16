# QCC Beginner

Four custom utility opponents implement the frozen QCC AI provider contract.
The stable catalog names/IDs are unchanged. Engine metadata explicitly says
`custom`; no Dala or Maia outputs are claimed.

| Target tier | Capture notice | Threat notice | Mate notice | Sampling temperature |
| --- | --- | --- | --- | --- |
| 300, Pebble | 38% | 24% | 20% | 100 cp-like utility units |
| 500, Sprout | 60% | 50% | 44% | 76 units |
| 700, Ember | 72% | 64% | 60% | 64 units |
| 900, Brook | 79% | 73% | 71% | 56 units |

These are *targets*, not independently measured platform ratings. Perception,
not just search depth, creates the weak play. Each move samples shared threat
awareness and capture awareness, scores all legal candidates for development,
central control, castling, pawn shields, repetition and material, then uses
Gumbel-max sampling. The stronger tiers inspect opponent tactical replies only on turns where they
notice threats. An intentionally unaware turn does not regain perfect tactical
awareness through lookahead.
Nothing is a uniform random legal move. This evaluation is a decision utility,
not a calibrated centipawn analysis, so chooseMove does not expose a score.

The pure `computeMove(input, seed)` helper and `seededRandom(seed)` support
calibration. Identical seeds and input reproduce decisions when the compute
budget permits all root candidates. A time guard between root candidates
caps expensive work; seeds also shuffle that order so time pressure does not
systematically favor the first square. With <=10ms compute budget the engine
uses a cheap weighted static choice over all legal moves. Stronger lookahead
is intentionally omitted under clock pressure. A single chess.js expansion
can still overrun a soft deadline on very slow hardware.

`createProvider` owns a dedicated module Worker and a per-instance random seed.
It passes FEN and UCI history into a private rules instance. Request IDs,
revisions, instance checks and abort listeners reject old results. Cancellation
terminates the worker immediately; the next request recreates it. Startup has
an eight-second timeout. Search results are checked against the supplied legal
moves before a clock-aware pacing timer. No search runs while the player moves.
`dispose` terminates workers, rejects pending work and removes timers/listeners.

The soft pacing/search target is at most 8% of remaining time, with a 35ms
reserve where possible. The separate hard watchdog reserves 10% of the actual
remaining clock, capped at 35ms; a 20ms clock therefore gets 18ms to respond. At normal budgets the worker computation
gets at most 75ms and the visible move arrives at roughly 65-90% of the game
budget. Worker initialization and actual computation consume that same window. A wall-clock
watchdog terminates a stalled or slow worker at that actual clock deadline and
rejects with a timeout; no late move is played. Without a chess clock it allows
250ms delivery/startup overhead beyond the soft budget.

Run `npx vitest run tests/chess-ai/providers/beginner*.test.ts` for seeded
behavior, special moves, malformed inputs, legal game progression, independent
worker ownership, cancellation, restart, crash and illegal response checks.
The lifecycle unit tests use a controlled Worker transport; browser tests must
exercise the real Worker separately.

Licenses and vendor provenance are served from
`chess-engines/beginner/PROVENANCE.md`, `LICENSE.txt` and `CHESS-JS-LICENSE.txt`.
