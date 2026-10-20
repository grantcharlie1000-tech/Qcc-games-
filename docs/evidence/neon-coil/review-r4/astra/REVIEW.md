# R4 integration and test repair audit

**Ready for fresh PR CI: yes. Merge eligibility: not established; fresh hosted CI including WebKit remains required.**

Final reviewed checkpoint: `db633ac9f23c6c2f0777315b6cdb6cdd5a89491e`. Independent browser execution used `06929e0ce8775a0ba2df51da3e77c42bcd4c3180`; the final commit changes only one explanatory comment. The initial negative review of `b1fc9768f834c5486993d4aa327221fd93f37fea` is preserved separately in `INITIAL_FINDING.md`.

## Findings and resolution

- **Critical:** none.
- **Important:** none remaining. Initial finding at `tests/games/neon-coil/play.spec.ts:17`: enlarging the test budget without explicit auto-wait/navigation caps could admit longer UI waits. Revision `06929e0` adds first-test-only 30-second defaults at lines 18–19; final comment wording correctly distinguishes those caps. Independently verified with the actual complete flow at DPR 2.
- **Minor:** none remaining. The final comment-only clarification avoids implying that every raw protocol operation has a 30-second timeout.

## Source and integration verification

The merge `3773b5e926b487bc9e8b6eb75dea4e3972b3b977` preserves all 431 feature paths from `421a8d388be7e54c7cb7611122335a0cfa8fffcf` and all 72 main paths from `fbac0a58aa23b953ff9ed382d2cd4bd80c817008`. Those sets are disjoint relative to common base `a7f7631d4f606667f23b016ad6091cb3899365e8`. The feature scope against current main is unchanged except for R4 test corrections and documentation. Shared registration/count changes remain narrow; old Snake, Pool and Study implementation behavior was not changed by R4.

R4 changes only the arena browser test and two diagnosis documents before review fixes. All 219 copied runtime/public files match the final commit. Arena entry SHA256 remains `9c486637cf124d09b922113bb0ac201ed667827bfdf8099ee6ec005144ce4f44`.

Executed test SHA256: `a5a5ef443b9d9859ab4ca2ae57b7fc708f3a83e3e9781d3ad16881d51a3c4f87`.
Final comment-only test SHA256: `85a89ccf004c98817cf97691cb9e1440a791b7b22f1276a0a293304f7800a3a6`.

The DPR expectation matches the renderer's actual DPR cap of 2 and rounding. Strict 5 → 10 → 5 ranking checks and complete in-memory world comparisons remain intact, as do best score, announcement, runtime-error and resumption checks. Compact JSON hashes summarize whole serialized worlds; they do not replace equality assertions.

## Independent execution

**5 passed in 34.7 seconds; zero skipped, flaky or unexpected results.** One worker ran Chromium at DPR 2 against a private byte-identical source copy: the full pointer/growth/boost/pause/keyboard/restart flow (20.1 seconds), plus ready, paused, dead and frozen-running resize cases. All assertions passed. Four concise lifecycle records retain equal world fingerprints, unchanged best scores and zero announcement mutations/errors.

Exact command, environment, server command and exit status are in `BROWSER_COMMAND.json`; the copied runner/configuration, test, fixture and JSON results are retained. Only one owned server ran at `127.0.0.1:4179`; it was stopped. No canonical evidence was overwritten.

## Timeout acceptance and measured limits

The 60-second allowance is cumulative test orchestration time. The explicit retrying-expectation limit stays 7 seconds, and auto-waiting locator actions/navigation now have 30-second caps. Every original input, fake-clock duration and gameplay/state assertion is unchanged. Thus growth, turning, boost, exact frozen save, resume, quick tap and restart acceptance remain intact.

Installed Playwright 1.64.1 sends raw mouse/keyboard commands, evaluations and clock operations with `kNoTimeout`; these use the enclosing test deadline, not page action defaults. I do **not** claim every operation now has a 30-second cap or that every remaining-time deadline is identical to the old test. These calls dispatch input, read state or execute simulated frames; they do not auto-wait for a product UI state. Additional speculative transport/phase caps are not required for this repair.

Inspected controlled timing records: normal 13.024s, 4× throttle 13.611s, 20× 22.421s. At 40×, the old 30s budget expired at 31.106s during the paused-input stage after preceding checks passed. With 60s, all original checks completed in 45.160s of measured phases; the explicit-cap revision completed in 38.751s of measured phases (39.4s test). Run variation is not evidence of a product speed improvement. This supports cumulative budget pressure under controlled load, **not** the exact hosted cause/await or a finding that product latency did or did not regress. If product latency regressed, raising the timeout would not fix it. This flow is not a responsiveness benchmark.

Disjoint smaller tests can improve attribution, but equivalent coverage must recreate the same grown, curved, boosted and paused world using real input before keyboard handoff. Naively separating fresh keyboard/restart tests loses transition coverage. The current coherent sequence with independent UI-wait caps is preferable for this narrow repair; splitting is not necessary to obtain a passing result.

## Corroborating records inspected

Validated every hash and byte count in Sol's 42-artifact compact manifest, plus all 14 retained CI-record hashes. The initial combined Chromium run had **159 passes and 17 pre-game failures** from missing bundled ffmpeg. The separate recovery run used an existing system ffmpeg through a private browser cache and passed 18 cases: the 17 blocked cases plus one already-passing touch case. Parsed case titles confirm **176 unique cases passed across the runs**, not a single uninterrupted green full suite. Original failures remain retained.

Also inspected successful final TypeScript, 288 unit tests in 25 files, build (84-file pack `1c58baf3fab5`), update lifecycle, and offline records. Independently checked all 28 game/deployment entries cover 14 games at `/` and `/Qcc-games-/`, with offline action/save/restart/Study restoration true and zero reported external requests, page errors or failed assets. These checks were reviewed, not rerun by this auditor.

## Preserved limits and declined judgments

- Hosted run `39479986705` remains a recorded failure: 333 browser passes, 5 failures, 14 skips; its original resize/high-DPI case passed in both engines. Build/update/offline and Pages deployment did not complete in that run.
- Hosted artifact `12291702294` local materialization was previously denied by proxy HTTP 403. Its trace was not inspected; no retry or bypass was attempted.
- Local WebKit installation was previously denied and remains unavailable. No local WebKit pass or fresh hosted CI pass is claimed.
- No fresh dedicated arena performance benchmark, physical trackpad/device verification, or PDF/video reference inspection was performed. Existing recordings, slow SwiftShader measurements and historical evidence remain preserved by source identity.
- Existing evidence's limited credential/trace scan is not an exhaustive no-secrets guarantee; this review did not repeat or broaden that claim.

No audit action remains pending or denied. The inherited artifact and WebKit access limits remain as above. No commit, push, merge, deployment, settings change, browser installation, external write or subdelegation was performed by this auditor. The allocated audit slot can be released.
