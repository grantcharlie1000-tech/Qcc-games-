# Final council votes

Round 1, read-only, Gemini excluded. Both reviews completed before documentation correction C1. No application source changed during or after review. Claude Opus explicitly authorized full 900 approval after the wording correction, without reruns. C1 is applied in verification.md, the provider README and check-status.json. The retained-report audit independently confirms the adverse new-cohort comparison and effective depth. These approvals cover provisional labels and measured normal/slower-JS responsiveness, with physical phones and production runtime unverified.

## [All custom tiers council: GPT Astra](t3-thread://v2/cc0aa134-e0c2-492e-a2db-9c45ad0aad8a/thread:delegated-task:command%3Amcp%3Ab2941806-2208-45ef-b81e-a0830de6bf84%3Adelegate-task%3Aaecee1ff-2007-40ec-ac1e-508d480c1d17)

Provider: codex; requested model: gpt-6-astra; completed. Individual response follows verbatim.

**My individual vote: YES to retaining all four provisional targets, YES to the scoped implementation, and YES to the limited performance conclusion.** This is not a council consensus or a competitive rating certification.

Bands below are subjective working estimates, not Elo conversions or statistical confidence intervals. They apply to normal fixed work.

- **300: YES.** Broad band **150–550**, low confidence; target fit **7/10**. Validation loss ratio **0.899** supports the target, but 80 positions from six contributors provide limited coverage.
- **500: YES.** Broad band **300–750**, low-to-moderate confidence; **8/10**. The third holdout’s **0.984** ratio, 31 contributors, and audited both-player separation provide the strongest lower-tier evidence.
- **700: YES, narrowly.** Broad band **450–950**, low confidence; **6.5/10**. Ratio **1.190** barely satisfies the 1.20 ceiling. Five contributor clusters and a wide difference interval make this the least secure target.
- **900: YES, retain.** Broad band **650–1150**; moderate confidence in preservation, low confidence in absolute rating; **7.5/10**. Historical loss increased only **0.759%**. This supports preservation on the reused reference, not fresh platform calibration.

These judgments use [the final strength evidence](C:/Users/charlie/.t3/worktrees/Qcc-Game/t3-b146e022-116e70fe19f06944/tests/chess-ai/providers/benchmarks/hillclimb-tiers/final-strength-summary.json).

**Code review: 8/10. Approve scoped implementation; no blocking finding.** Legal roots, king-safety filtering, make/undo restoration, sampling offsets in pruning bounds, and completed-iteration fallback are coherent. Immediate mate priority applies to the searched tiers. Worker identity, request/revision checks, cancellation, absolute deadline checks, and clock reserves remain intact. Fixed node budgets do not bound every rules operation’s elapsed time, but this limitation is documented. Hypothetical draw blindness, quiet-leaf stalemate valuation, and the private API pin remain bounded strength/maintenance limitations.

**Performance: YES, 8/10 for the limited conclusion.** I independently recomputed the raw summaries: **1,280 warm and 160 first replies, zero recorded errors, zero candidate move/node/depth differences**. Current source, vendor, and recorded harness hashes match. The measured matrix supports responsiveness in normal Chrome and its slower interpreter configuration.

The restart changes what was measured. It does **not** satisfy the original constant-6× interpretation or demonstrate phone equivalence. Retaining failures, freezing application source, preserving request order and gates, and explicitly narrowing the conclusion make this restart acceptable. **Capacity-v2 remains failed**, including eight candidate warm failures and one candidate first-reply failure. Scheduling starvation is a supported explanation, not proof that those failures are irrelevant.

Attention flags:

- **Statistical equivalence remains unproven.** Passing point ratios and bootstrap intervals containing zero do not establish equivalence. Contributor clustering also does not remove all shared-opponent dependence.
- **500 required three attempts.** The fresh third cohort is defensible; the two retired failures must remain visible. Sequential selection reduces confidence relative to a single untouched validation.
- **Behavior assertions changed intentionally.** The 300 mate ceiling and strict free-queen tier distinction were relaxed. This is disclosed in [decision-trail.tsv:27](C:/Users/charlie/.t3/worktrees/Qcc-Game/t3-b146e022-116e70fe19f06944/tests/chess-ai/providers/benchmarks/hillclimb-tiers/decision-trail.tsv:27), so “140 passed” should not imply every original assertion survived unchanged.
- **Chronology has an evidence limit.** Earlier handwritten timestamps are nominal, as clarified at [decision-trail.tsv:52](C:/Users/charlie/.t3/worktrees/Qcc-Game/t3-b146e022-116e70fe19f06944/tests/chess-ai/providers/benchmarks/hillclimb-tiers/decision-trail.tsv:52).
- **Speed coverage is small:** eight positions, five repetitions, one browser installation. Startup is separate; removal of reply pacing prevents a compute-only speedup claim.
- **Whole-suite status remains nongreen.** Physical phones, production runtime, RAM/FPS and competitive ratings are unverified, not approved by this vote.

I inspected the existing screenshots and recorded test/build results. I made no edits and ran no tests, builds, or browsers.

## [All custom tiers council: Claude Opus](t3-thread://v2/cc0aa134-e0c2-492e-a2db-9c45ad0aad8a/thread:delegated-task:command%3Amcp%3Ab2941806-2208-45ef-b81e-a0830de6bf84%3Adelegate-task%3A6b306ddf-33ab-44fb-b0d3-eeda30c400a9)

Provider: claudeAgent_claude_max; requested model: claude-opus-5-5; completed. Individual response follows verbatim.

# Council review, round 1: Claude Opus (individual vote, read-only)

I modified no files and ran no heavy jobs. My only computations were small Node reads of the retained JSON (tallying depths and a paired bootstrap), plus spot-checks of root thread activity.

## 1. Tier targets (provisional Chess.com rapid labels, normal fixed work)

| Target | Vote | Likely real band (inferred) | Confidence | Fit /10 |
|---|---|---|---|---|
| 300 | **YES** | about 250 to 550 | low to moderate | 6.5 |
| 500 | **YES** | about 400 to 700 | moderate (best evidence) | 7 |
| 700 | **YES**, weakest | about 550 to 900 | low | 6 |
| 900 | **YES** for the label. **NO** on the unqualified "900 strength preserved" wording until C1 is applied | about 700 to 1000 | low to moderate | 6.5 |

**C1 (needed, wording only, no re-runs).** `verification.md`, the README and `check-status` must also state:
- **Fresh-cohort comparison.** On the new 900 cohort, the current 900 loses +17.1cp more than the accepted engine, paired across 88 positions (55.19 to 72.29cp). My bootstrap, 4000 resamples, gives 95% [1.1, 37.3] by game and [1.1, 37.3] by contributor. Both exclude zero.
- **Search depth actually reached.**
  - The 900 completes only 2 plies on 81% of its own cohort, 90% of the historical set and 40 of 40 speed-corpus rows.
  - The accepted engine completed 3 plies on 75% of the historical set, with a median of 6912 nodes against 1201 now.
  - So the +0.76% historical match comes from similar average loss with different moves. Only 785 of 1408 choices are the same move.
- **What "accepted strength" means.** The old engine was time-based, so its strength depended on the device. Approval was measured at about 6.9k nodes per move. The re-run baseline used about 3.9k on this desktop.

With C1 applied, my 900 vote becomes a full YES. I do not require a code change: the predeclared primary gate passes, and this paired comparison was declared descriptive.

## 2. Code review: 8/10, scoped implementation approved, no blocking findings

**Legal moves**
- Root moves come from chess.js's legal generator, matched exactly against the offered list (`engine.ts:88-89`, `perception.ts:186-187`).
- Every move searched inside the tree has the mover's king safety checked (`brook.ts:90`).
- The provider checks again before replying (`index.ts:65`).

**Make/undo**
- Every `_makeMove` call is paired with `_undoMove` in `try/finally` (`brook.ts:19-21,93-94,116-121`, `perception.ts:194-212`, `search-rules.ts:132-134`).
- The `expired` throw at `brook.ts:66` happens before that node's own make, so unwinding restores the board.
- The vendored `_makeMove` and `_undoMove` do not touch `_positionCount`; only the public `undo` does (vendor line 2680).

**Sampling bounds**
- Gumbel noise is clamped by `Math.max(1e-6, r)`, so it stays roughly between -2.6 and 22 times the temperature.
- The root pruning bound includes each root's bonus and noise (`brook.ts:120`). This is correct for negamax.
- The 500's single extra random draw is short-circuited, so other tiers' random sequences are unchanged.

**Fallback**
- A whole iteration is replaced only after it completes (`brook.ts:128-132`).
- Depth-0 fallback, a static choice, happened in 1 of 352 and 1 of 1408 rows.

**Clock and cancel**
- Fixed work starts at a search budget of 40ms or more. With a clock, that means at least about 770ms remaining, which leaves at least 735ms before the watchdog. The worst slow-VM reply was 129ms.
- Stale replies and cancellation are handled by revision, id and worker identity.

**Non-blocking notes**
- **N1.** The 900 nearly always spends its remaining nodes on a third iteration that it then abandons. That is wasted compute and the source of the 700/900 overlap (A3).
- **N2.** The 300's quiet score reads the king and pawn shield after the move. The searched tiers score it before the move. This inconsistency is tuned in and harmless.
- **N3.** Roots that get pruned keep upper-bound scores, which are used only for move ordering.

## 3. Limited performance conclusion: **YES**

The claim is supported: normal plus slower-JS-VM responsiveness, with physical phones and production runtime unverified.

**Measured.** In the final matrix, all 1280 warm and 160 first replies were legal with 0 errors, and the candidate's work was identical across both browser modes and both viewports. Worst p95 was 20.6ms normal and 110.1ms in the slower VM.

**Inferred.**
- The chess slowdown under the slower VM, read as p95 ratios from the table, is only 3.3x to 6.6x. That is not the 6x promised in the original contract (trail row 3). A naive 6x scaling of the normal p95 (900: 124ms) still passes 200ms.
- Node caps bound the worst case, so the 8-position corpus limits these results less than its size suggests.

**Restart critique.**
- Each restart was predeclared before any samples, and every failure is retained.
- But each restart changed the instrument, so the final "slow" condition is not the one originally contracted.
- The baseline comparator gives no compute information: it took 290 to 425ms in both modes because of the old reply pacing. The report correctly makes no speedup claim.
- Host load during legs ranged from 0.21 to 1.00 busy.

**Capacity-v2 must stay FAILED.** It had 8 candidate warm timeouts and 1 first-reply error. One example: 1.4ms of Worker compute took 573.9ms to deliver. OS-level CPU starvation, such as background or thermal throttling, is a real-world risk that remains unverified.

## 4. Attention list (reviewed by Claude Opus)

- **A1 (measured).** The 900's paired regression on the new cohort, as in C1. `final-strength-summary.json` shows `reductionFromBaselineFraction: -0.31`, but `verification.md` omits it.
- **A2 (measured).** The 900's effective depth is 2 plies; the figures are under C1.
- **A3 (inferred).** The 700 and 900 are nearly the same engine whenever the third ply does not complete: same evaluation, temperature 6, development 1.15 vs 1.225. The ladder is compressed: 900 beat 700 5-3 and 500 by only 4-3-1. A 400-point gap would expect about 91%, and 4.5/8 is very unlikely under that (rough binomial).
- **A4 (measured).** The bots make fewer catastrophic errors (500 to 1000cp) than humans:

  | Tier | Bot | Human |
  |---|---|---|
  | 300 | 5.9% | 11.3% |
  | 500 | 4.3% | 5.9% |
  | 700 | 0.66% | 2.6% |
  | 900 | 3.4% | 5.7% |

  Average loss matches through more medium-sized errors instead. Inferred: in real games against humans the bots may play above their labels.
- **A5 (measured).** The human reference itself is noisy. The three 500 cohorts average 84.6, 120.9 and 101.8cp. The 700 humans (55.3cp) beat the 900 humans (73.6 and 78.7cp). The ±20% window is about the size of cohort-to-cohort noise.
- **A6 (trail rows 12, 16, 21, 25, 28).** The historical 900 set was used to choose among 1500, 750, 300 and 1200 nodes. Its +0.76% result is therefore reused and was also used for selection.
- **A7 (confirmed in activity).**
  - Second cohort frozen 11:21:59.471 (item 1553) before the 500 edit at 11:22:25.420 (item 1555).
  - Third cohort frozen 11:47:53.389 before the round 15 edit at 11:48:07.657 (item 1697).
  - Audit at 11:49:07 (item 1706) ran before final scoring at about 11:52.
  - The row 41 timestamp, 11:16:30Z, was appended at about 11:21:59 (item 1533).
  - Item 1599 (completed 11:34:38) appears before item 1600 (11:30:43) because `updatedAt` records completion time.

  All of this is consistent with trail row 52.
- **A8.** The 500 needed three holdouts. The mixed model sits between two failures in opposite directions. The third holdout is clean but is a single sample.
- **A9 (inferred, low risk).** Fixed work removes the old graceful slowdown on weak devices. On an extremely slow device, a reply could hit the watchdog (without a clock, the move allowance plus 250ms) instead of returning a weaker move.
- **A10 (unchanged and correctly disclosed).** The full suite shows 17 failures outside chess, with baseline status unverified. Production preview was blocked by policy and not retried. No physical phone was tested.

## Scores

| Item | Score / vote |
|---|---|
| Code | 8/10, approve |
| Performance claim | YES |
| Strength | 300 YES 6.5, 500 YES 7, 700 YES 6, 900 YES 6.5 |
| Overall | Approve after bounded correction C1, wording only |


