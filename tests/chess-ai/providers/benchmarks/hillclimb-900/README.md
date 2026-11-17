# Brook 900 calibration

This folder records the earlier 900-only implementation and metric. Its source
hashes and numbers are historical. The follow-up for all four custom opponents
uses corrected metric 2 and fixed normal work; see
[the follow-up decisions](../hillclimb-tiers/decisions.md).

Only the custom 900 opponent changes. The 300, 500 and 700 evaluators retain their original code and profiles. No Stockfish or Maia runs in Brook.

The first climb used a fixed 75ms compute budget and plateaued around 59cp mean capped loss on the tuning set. The decision trail records every hypothesis, including rejected experiments. The climb then restarted around the actual normal 500ms move allowance: the original provider allocates 75ms to search; Brook 1.1 allocates up to 200ms within the same clock-aware pacing window.

## Reproduce

From the repository root:

```powershell
node tests/chess-ai/providers/benchmarks/hillclimb-900.mjs baseline-window
node tests/chess-ai/providers/benchmarks/hillclimb-900.mjs window-1
node tests/chess-ai/providers/benchmarks/hillclimb-900.mjs baseline-window-validation-2 validation human-900-validation-2.json
node tests/chess-ai/providers/benchmarks/hillclimb-900.mjs window-validation-2 validation human-900-validation-2.json
node tests/chess-ai/providers/benchmarks/brook-match.mjs
```

Report labels beginning with baseline load the frozen original engine. Its only source change is the relative vendor import, needed to place it beside the evidence. The original engine was commit 2d60d26d, SHA256 cc2abb0fc7f37bc760dce77c185e1b30b555db86aa7def4c51de8a969e5f1148. The vendored rules are unmodified.

## Reference data

The source is the [Chess.com public data API](https://www.chess.com/news/view/published-data-api). Collection is serial and read-only. The collector describes the eligibility and selection rule in each corpus. No move-quality filtering is used. Each eligible game contributes four fixed plies, equally balanced between White and Black.

- human-900.json: 108 positions from 27 games, mean mover rating 911.93. Complete games were split before tuning: 56 tuning positions and 52 initial validation positions.
- human-900-validation-2.json: 176 positions from 44 fresh games, mean mover rating 924.65. Different contributing accounts were selected by the next 300 hash-ordered club members. Zero game URLs overlap the original corpus. All are held out.

The second corpus was frozen before evaluating the final 200ms candidate. The original held-out set was used once, exposed a shortfall, and was retired from final validation. No parameters are to be tuned on the fresh set.

## Measurement

The oracle is the bundled unrestricted Stockfish 19 Lite WASM, one thread, 16MiB hash, independent depth-10 searches for the best and forced chosen move, with a cleared hash. The reports pin its JS and WASM hashes. Eight fixed bot seeds are used per position. Every selected move is checked against independently generated legal moves. Errors abort the run. Source hashes must remain unchanged through each run; one run invalidated by a source-comment edit was discarded.

The primary metric is mean centipawn loss, capped at 1000cp including mate transitions. A loss of at least 200cp is also reported. The tuning target was within 20 percent of the human reference. window-1 meets it: 54.74cp versus human 47.11cp, with 6.92 percent large errors versus human 7.14 percent. The original engine scored 195.94cp in the restarted baseline.

This is a convenience sample from one public club, not a population estimate or a competitive Elo rating. Fixed positions miss game-level pressure and some endgames. Eight seeds do not turn one human position into eight independent human samples. Search depth depends on host contention and hardware. The Windows host was heavily loaded; reported core timing excludes worker startup and pacing. No latency speedup is claimed. The original 75ms match was 20 wins in 20 games for the candidate; this demonstrates improvement, not a Chess.com rating.

The full-game match uses balanced colors and five opening lines, no material adjudication, and rules-confirmed outcomes. Unfinished games remain unfinished. Browser checks use actual Workers on desktop and phone-sized Chromium; phone emulation does not establish physical phone performance.

The working decision log is .omc/state/decision-trail-chess-900.tsv at the repository root. A handoff snapshot is included here as [decision-trail.tsv](decision-trail.tsv), so reading the decisions does not require the scratch directory. Final checks and their limitations are summarized in [verification.md](verification.md). Council scores are reported in the final handoff.

## Final validation

After the immediate-mate correction, the frozen candidate scored 88.10cp mean loss on the 176 fresh positions, versus human 86.47cp and original 210.81cp. This is a 58.21 percent reduction from the original. Large-error rates were 11.93 percent, 9.66 percent and 33.31 percent respectively. The candidate won all 20 final full games against the original, with no draws or unfinished games. All selected moves were legal and no benchmark errors occurred.

The mean paired difference from the human reference was +1.63cp. A descriptive bootstrap resampling whole games gave a 95 percent interval of -29.35 to 29.30cp. Games share players and come from one club, so this is an uncertainty illustration, not population certification. See summary.json and the raw reports.

Candidate engine/brook/provider combined SHA256: d2a1614856f7163c5794ddf78a0223f6cc2f793446e811f655d3a01829b2458b. The final match and fresh-position report pin this same source hash.

There were 18 experimental rounds across the two climb definitions, seven rejected changes and one invalidated run. The final candidate is the retained win on the calibration benchmark. Small intermediate gains were provisional; the original and final engines remain directly reproducible. No commits were made because the owner instructions prohibit them without explicit authorization.

## Review limits

Both independent council reviewers approved retaining 900 as a provisional Chess.com rapid target and approved the scoped code. Their estimated bands differed: roughly 800 to 1100 and 900 to 1200, with low to moderate confidence. These judgments do not convert centipawn loss into Elo. Human match results remain unmeasured.

Four plies is a ceiling. Of 1408 fresh choices, completed depths were 0: 1, 1: 14, 2: 258, 3: 1059, and 4: 76. Faster hardware may play stronger and slower hardware weaker; physical-phone strength is unverified. Average error also conceals different mistakes: Brook's large-error rate remains above the human sample, while its severe errors are less common. This can affect results against real beginners.

Nonblocking search limits include repetition and 50-move blindness inside hypothetical lines and possible missed stalemate at a quiet quiescence leaf. The emergency browser test accepts a timely watchdog timeout as well as a legal reply, because its clock-safety contract allows both; the recorded run specifically returned a legal move. None of these review observations changed the frozen engine or tuning parameters.
