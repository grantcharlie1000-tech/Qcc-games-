# QCC Beginner 1.2

Four custom opponents implement the QCC AI provider contract. Catalog names,
IDs and the 400/500ms game allowances remain stable. All code runs locally in
a dedicated module Worker, with no model download or external engine dependency.

| Chess.com rapid target | Normal decision model | Work and variation |
| --- | --- | --- |
| 300, Pebble | Perceptual utility | All legal roots; capture 95%, danger 100%, mate 20%, Gumbel 8 |
| 500, Sprout | Legal alpha-beta | Seeded 50/50 mix of one or two principal plies, 900 search nodes, Gumbel 15 |
| 700, Ember | Legal alpha-beta | Up to two principal plies, 900 search nodes, Gumbel 6 |
| 900, Brook | Legal alpha-beta | Up to three principal plies, 1200 search nodes, Gumbel 6 |

These labels are calibration targets. Public human rapid moves provide a
reference; competitive games in the same pool are needed for a platform rating.
The utility and search scores are internal decision values, so chooseMove
returns a move without an analysis score.

The perceptual model samples shared danger/mate awareness per turn and capture
awareness per destination. It scores development, central control, castling,
pawn shields, repetition avoidance, promotion and noticed captures. Static
threat estimates can overvalue pinned attackers. An unnoticed capture earns
no material utility. Seeded Gumbel sampling varies close choices.

The tactical model uses material, simple piece placement and bare-king mating
coordination. Two capture continuations reduce obvious exchange mistakes.
Checks extend through legal evasions, with an absolute eight-ply horizon.
Immediate mate takes priority. Every completed iteration covers all supplied
roots; an interrupted iteration leaves the previous complete result intact.

Normal budgets of at least 40ms use fixed work. Device speed therefore changes
response time without changing the work or seeded choice. Node diagnostics
include the final limit check; legal generation and mate scans are additional
bounded work. Clock budgets below 40ms also check elapsed time. At 10ms or less,
all tiers use a weighted static choice over legal moves. One rules operation
can exceed a soft allocation on sufficiently slow hardware.

The pinned chess.js 1.4.0 copy remains unmodified. A typed private adapter uses
its legal generator and make/undo without constructing SAN or FEN per search
candidate. Capture continuations use a small pseudo-legal generator, followed
by a mover-king safety check. Public move/undo is never mixed with the private
search stack. Vendor upgrades must recheck the adapter and special-move tests.

Search does not track repetition or the 50-move rule within hypothetical lines.
A quiet capture-search leaf can miss stalemate. Immediate root terminal
positions are checked, and the game rules still enforce actual draws. These
are bounded playing-strength limitations.

The provider delivers a validated legal result immediately. Request IDs,
position revisions, worker identity and abort listeners reject stale replies.
Cancellation terminates the Worker; the next request recreates it. Initialization
has an eight-second timeout. Disposal rejects pending work and removes resources.

The soft clock allowance is at most 8% of remaining time, with a 35ms reserve
where possible. Worker allocations remain capped at 75ms for 300/500/700 and
200ms for 900. Fixed normal work usually finishes earlier. A separate watchdog
reserves 10% of the actual clock, capped at 35ms; a 20ms clock gets 18ms for
delivery. Without a clock, the watchdog permits 250ms beyond the soft allowance.
Late moves are rejected.

Calibration, frozen references and measurements live in
tests/chess-ai/providers/benchmarks/hillclimb-tiers/. The earlier accepted 900
evidence remains in hillclimb-900/. Corrected metric 2 compares forced oracle
searches of both the preferred root and the chosen root, so the preferred move
has zero loss. Human comparisons are descriptive, with contributor-separated
game cohorts and convenience-sample limitations.

The 900 passes the reused historical average-loss gate (+0.759%), which also
informed node-budget selection. This does not establish unchanged strength.
On the newer 88-position cohort, the accepted timed engine's rerun averaged
55.19cp loss versus 72.29cp now, a paired increase of 17.10cp. Descriptive
4000-resample paired bootstrap intervals are [1.06, 36.07]cp by game and
[1.18, 36.36]cp by contributor. Both exclude zero.

The current 900 completes two principal plies for 81% of that cohort, 90% of
the historical choices and all 40 normal-desktop speed-corpus rows. The accepted
historical engine completed three plies for 75% of choices, with median work
6912 nodes versus 1201 now. Only 785 of 1408 historical choices select the same
move. The accepted engine was time-based and device-dependent; its newer desktop
rerun used a median 3840 nodes. Similar historical mean loss therefore does not
mean identical decisions, search depth or strength on every cohort. The retained
900-preservation-limits.json audit records these comparisons without model reruns.

Focused tests check legal games, special moves, terminal positions, seeded
work, tactical behavior and worker lifecycle. Browser tests exercise the actual
Worker separately. The opt-in tiers-vm-speed.spec.ts compares normal Chrome
with a slower interpreter-mode JavaScript runtime. It verifies actual Worker
arithmetic, equal candidate work, successful legal replies and startup separately
from warm latency. The earlier tiers-speed.spec.ts retains the failed Windows
CPU-cap stress experiment, including its scheduling pauses. Neither simulated
runtime certifies a physical phone or production runtime.

Licenses and provenance are served from chess-engines/beginner/PROVENANCE.md,
LICENSE.txt and CHESS-JS-LICENSE.txt.
