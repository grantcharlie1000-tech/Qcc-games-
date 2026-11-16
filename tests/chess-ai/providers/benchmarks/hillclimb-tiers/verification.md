# Custom opponents: final verification

Scope: Chess.com rapid targets 300, 500 and 700, plus responsiveness and a
historical average-loss guard for the accepted 900. No external engine changed. No commit, push
or deployment was made.

Current application source SHA-256, using the strength runner's file order:
`2423b6b5c912cc93ec82f33671a903968b2879a3950698805de4ccefc2241d1e`.
`final-tiers-summary.mjs` checks the current files against this hash.

## Strength

Final metric 2 results, mean oracle loss capped at 1000cp:

| Target | Positions / games / contributors | Human | Original | Updated | Updated / human |
| --- | --- | --- | --- | --- | --- |
| 300 | 80 / 20 / 6 | 162.16cp | 304.32cp | 145.85cp | 0.899 |
| 500 | 320 / 80 / 31 | 101.83cp | 243.16cp | 100.24cp | 0.984 |
| 700 | 76 / 19 / 5 | 55.28cp | 230.62cp | 65.77cp | 1.190 |

The declared interval was 0.8 to 1.2. This measures similarity of average move
loss, not a conversion to Elo or a competitive platform rating. Histograms and
contributor-cluster bootstrap intervals are in [final-strength-summary.json](final-strength-summary.json).
These are convenience samples from three clubs, with limited player coverage
and correlated games. The original split excluded shared contributors/games,
not every opponent. Common board states were retained.

The 500 needed two rejected holdouts. One-ply was too weak on the first, ratio
1.601; two-ply was too strong on the second, ratio 0.638. Both became training.
The final seeded half-one-ply/half-two-ply model used all 352 retired positions
for tuning. The third set was frozen before that change and scored only after
the settings and 48-game ladder were frozen. Its 80 games exclude both players
from all 88 retired games. The metadata audit resolves all old opponents and
verifies zero player/game overlap, exact pooled training, at most three games
per contributor and three shared board states. See [500-cohort-audit.json](500-cohort-audit.json).

For 900, the primary comparison reuses all 176 historical positions and eight
seeds from its approved choices, re-anchored under metric 2. Accepted loss was
76.0547cp; current loss is 76.6321cp, an increase of 0.759%. Human loss on those
positions is 73.5909cp. This reused regression is not fresh validation and was
also used to select among node budgets. The new 900 convenience cohort is
descriptive only. Do not mix earlier metric 1 values
with these results. The frozen accepted engine hash remains `d2a1614856f7163c5794ddf78a0223f6cc2f793446e811f655d3a01829b2458b`.

The newer 88-position cohort shows a regression against the accepted engine's
timed rerun: 55.1875cp loss accepted versus 72.2898cp current, a paired increase
of 17.1023cp (31.0%). A retained-report audit with 4000 paired cluster resamples,
seed 732187, gives 95% intervals [1.06, 36.07]cp by game and [1.18, 36.36]cp by
contributor. Both exclude zero. Claude Opus independently found approximately
[1.1, 37.3]cp. This is adverse descriptive evidence, despite the primary
historical gate passing. It rules out an unqualified strength-preservation claim.

The current 900 completes two principal plies for 284/352 (80.7%) new-cohort
choices, 1264/1408 (89.8%) historical choices and all 40 normal-desktop
speed-corpus rows. The accepted historical engine completed three plies for
1059/1408 (75.2%) choices and used median 6912 nodes, compared with 1201 now.
Only 785/1408 historical choices select the same move. The accepted engine was
time-based, so its approved strength depended on the device and load; its newer
desktop rerun used median 3840 nodes. Similar historical mean loss therefore
does not mean equal search depth or unchanged strength across cohorts.
See [900-preservation-limits.json](900-preservation-limits.json) and its
[audit script](../audit-900-preservation.mjs). No models were rerun or retuned
for this documentation correction.

The final 500-only change preserves all 976 recorded 300/700/900 decisions,
node counts and completed depths exactly. All 24 full games without 500 also
match their earlier move lists and outcomes. All 48 final games finished legally,
with higher-tier score above .5 in each pair. The closest pair was 900 versus
500, four wins, three losses and one draw. This is a small ordinal check, not a
rating anchor. Full records: [match-round15.json](match-round15.json).

There were 15 tuning rounds. Retained changes include bounded legal search,
fixed normal work, capture continuations, better 300 perception, lower sampling
noise and the mixed 500 depth. Rejected changes include 300 mate-awareness
adjustment, a searched 300, excessive 500 sharpening, undersized 900 work and
the two final pure-depth 500 candidates. The detailed outcomes and measurement
restarts are in [decisions.md](decisions.md) and [decision-trail.tsv](decision-trail.tsv).

## Response time

The accepted run is [browser-speed.json](browser-speed.json), protocol
`slow-js-vm-v1`. It compares the same installed Chrome 157 in normal and
`--js-flags=--jitless` configurations, using the actual provider and module
Workers. V8's [interpreter mode](https://v8.dev/blog/jitless) is a slower JavaScript
runtime, not a fixed CPU/frequency or physical-phone emulation. WebAssembly is
unavailable in this mode; the four custom providers use JavaScript only.

Actual dedicated-Worker arithmetic is checked in five alternating pairs per
viewport, three fixed10M loops per leg, with matching checksums. All pairs show
slower execution; observed arithmetic ratios were 31.53 to 39.66. Those factors
must not be applied to chess timing. The report retains launch arguments,
versions, source/harness hashes, warmups, all legs and host load.

The provider matrix retains five alternating repetitions, eight identical
positions and seeds, both viewports and both sources. All 1280 warm replies
and 160 first replies were legal, with zero errors. Candidate moves, nodes and
depth were identical across modes and viewports. Both browsers and servers
exited. Normal work is fixed, so faster replies do not use a weaker phone path.

Worst warm p95 across desktop and phone viewports, 40 samples per individual
tier/mode/viewport group:

| Target | Normal JS | Interpreter JS | Largest interpreter reply |
| --- | --- | --- | --- |
| 300 | 1.8ms | 5.9ms | 9.5ms |
| 500 | 8.5ms | 37.7ms | 61.5ms |
| 700 | 8.4ms | 37.6ms | 47.1ms |
| 900 | 20.6ms | 110.1ms | 129.3ms |

All declared normal p95<100ms and slower-VM p95<200ms gates pass. Per-repetition
distributions and all raw rows are retained. This measures request-to-reply
latency, not RAM, FPS, input-to-photon, or whole-game performance. No compute-only
percentage speedup is claimed: the old provider deliberately paced completed
replies, while the new provider delivers them immediately.

Startup stays separate. For the candidate, module-import p95 was 89.1ms normal
and 95.7ms interpreter; Worker-initialize p95 was 162.3ms and 161.0ms (10 contexts
per mode). First-reply p95 pooled across the four tiers was 27.7ms and 95.5ms
(40 replies per mode). Navigation and server preparation are separately recorded.
Dev-server compilation was prefetched outside client timings; parsing, Worker
startup and first replies remain measured. No physical phone was tested.

## Rejected performance evidence

Every failed approach remains failed. No unfavorable row was removed.

- Page-only CDP throttling failed to slow actual Worker arithmetic.
- The initial Windows relative wall-slowdown proof failed under host contention.
- Capacity-v1's first full attempt exceeded its .20 accounting tolerance at
  .2001601281 before any provider samples. See [rejected-capacity-v1.json](rejected-capacity-v1.json).
- Capacity-v2 used longer fixed arithmetic. Its capacity proof passed, but its
  full matrix had eight candidate warm timeouts and one candidate first-reply
  error. Median replies remained near normal, with 500-1100ms pauses. For
  example, a 1.4ms Worker computation took 573.9ms to deliver. The
  [Windows hard-cap API](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_cpu_rate_control_information)
  pauses job threads after their interval budget is spent. Interpreting these
  tails as quota scheduling effects is an inference consistent with the data.
  This starvation stress test is still failed. See [rejected-capacity-v2.json](rejected-capacity-v2.json).
- Direct CDP throttling on a proven dedicated Worker target was unsupported:
  error -32000, supported for pages, not workers. See [rejected-worker-cdp.json](rejected-worker-cdp.json).
- The first VM setup failed before samples because a command-line metadata
  query required an automation flag. The harness instead records actual owned
  process arguments, without adding that flag. No timing gate changed.

The slow-VM restart retains the original burst requests, seeds, all-row
retention, exact-work checks and 100/200ms targets. It supplies bounded slower-JS
evidence, not proof that every low-end phone will meet these times. No app or
model source changed to accommodate these harness restarts.

## Checks and remaining limits

- 140 focused chess tests passed, zero failures. [focused-tests.json](focused-tests.json).
- Production build passed, including TypeScript, Vite, host preparation and
  service-worker checks. Existing bundle-size warnings remain. [build.log](build.log).
- Final 500 games at both widths and actual Worker cancellation/recovery passed
  in Chromium and WebKit, six cases. [browser-correctness.json](browser-correctness.json).
  The earlier 16 game UI cases covered all four tiers in both browsers. Two
  earlier isolated lifecycle cases failed because unrelated request routing
  disabled HTTP caching; plain isolated fixtures then passed with the original
  recovery/warm gates. The final six-case run rechecks that fix.
- Full-project TypeScript passed before the final metadata-only VM launch fix;
  a scoped check including the VM harness and all its imports passed afterwards.
  The model source has not changed since the production build.
- `git diff --check` passes. The vendored chess.js executable hash still equals
  `6ec742c5b513c309938634dbc29b7fa302b37da6e8adebcded0694290582a22a`.
- Desktop and phone screenshots are in `tests/games/chess/evidence/`.

The earlier full repository suite is not green: 5634 passed, 17 failed,
7 skipped, plus two Vitest RPC timeouts. All its 128 then-existing chess tests
passed. These failures are outside chess; only six Last Light assertions have
an established unmodified-base reproduction. Baseline status for the other
failures and runner timeouts is unverified. The full suite was not repeated.
See [the earlier failure table](../hillclimb-900/verification.md).

Search still has hypothetical repetition/50-move blindness and possible quiet
quiescence-leaf stalemate misvaluation. Immediate root terminals are checked;
actual game rules enforce draws. The private rules adapter is pinned to the
unmodified chess.js1.4.0. Average human move loss does not capture every human
error pattern or establish a narrow rating interval.

## Council and Attention

Both non-Gemini reviewers completed a read-only round. They approve all four
provisional Chess.com rapid labels, the scoped implementation and the limited
normal/slower-JS responsiveness conclusion. Claude Opus made full 900 approval
conditional on correction C1: disclose the new-cohort regression, effective
depth and device-dependent baseline. C1 is applied above, in the provider README
and in check-status.json. No code change or model rerun was requested.

| Reviewer | 300 fit | 500 fit | 700 fit | 900 fit | Code |
| --- | --- | --- | --- | --- | --- |
| GPT Astra | 7/10 | 8/10 | 6.5/10 | 7.5/10 | 8/10, approve |
| Claude Opus | 6.5/10 | 7/10 | 6/10 | 6.5/10 | 8/10, approve after C1 |

Full votes, broad subjective bands and qualifications are retained in
[council-review.md](council-review.md). These are individual judgments on
provisional targets, not evidence of statistical equivalence or platform ratings.

Attention, reviewed by Claude Opus: 700 is the least secure target; 500 needed
three holdouts; the 700/900 ladder is compressed; bots make fewer catastrophic
errors than the sampled humans; human reference cohorts vary substantially;
and historical 900 evidence was reused for selection. The 300 mate ceiling and
strict free-queen tier distinction were intentionally relaxed, so the passing
test count does not imply every original assertion remains unchanged. Early
handwritten timestamps are nominal, as the append-only trail explains.
Physical phones, production runtime and statistical rating equivalence remain
unverified. The failed capacity-v2 starvation stress, limited speed corpus and
nongreen full suite remain visible limitations. Extremely slow or starved
devices may reach the watchdog despite fixed work.

Production runtime is unverified. Automatic approval review rejected both
earlier production-preview attempts with only "blocked by policy". They were
not retried or bypassed. A build, dev runtime and physical-device runtime are
different evidence.
