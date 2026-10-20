# PR 8 reduced-motion CI test correction

The correction changes only the Snake browser test’s synchronization. Both OS preference transitions now advance the paused fake RAF clock while waiting for **both** the browser media query and the rendered preference to agree. The existing timeout, app-setting check, real cancellation checks, error assertion and engine coverage remain unchanged. Runtime code is untouched.

## Original failure and provenance

[Full CI run 39481138400](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39481138400) finished with **313 passed / 10 skipped / 1 failed**. The only failure was the WebKit Snake reduced-motion test: after `emulateMedia(reduce)` and one 16 ms fake-clock slice, the rendered attribute stayed false during the subsequent assertion. The next OS transition and app-setting/cancellation portions were not reached in that failing case. Other Snake cases passed on both engines.

The run checked merge candidate `a610afc3bf7806428b0191c73133d7f947511380`; the coordinator verified Snake source/tests were identical to reviewed branch head `7bd1789892af6ee40b8764c246d0a8ce1c80c048` (runtime checkpoint `ffa5e45e18764ea07681dfc2f0d44b8887d0a3e0`). [Original raw log and excerpt archive](original-ci-failure.zip) preserves both files verbatim. [Readable failure excerpt](ci-first-failure.txt) retains the assertion and CI totals.

The [original artifact](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39481138400/artifacts/12292126278) contains its screenshot/context/trace, but executor download failed with tunnel HTTP 403. Those images/traces were not inspected locally. [Local WebKit installation failure](local-webkit-install-failure.txt) records the separate CDN 403; no local WebKit execution is claimed.

## Diagnosis: observed versus inferred

The runtime’s media-query listener marks the canvas dirty, and its live RAF loop also compares the current media-query value directly. A delayed change event alone therefore does not establish a runtime bug. The Playwright WebKit adapter in the installed primary source awaits protocol preference-override responses, without waiting for a page RAF/media-query render. Its native media publication can have a different schedule from the installed fake clock.

- [Native Chromium diagnostic](native-chromium-diagnostic.json), with its [ad-hoc script](native-chromium-diagnostic.mjs): **40 transitions**, no failures after the single slice and no stale query at protocol completion. Native change-event delivery followed the slice in **26/40** sampled transitions, proving that native event publication and fake RAF delivery are separate boundaries, while confirming the runtime’s direct query check works on Chromium.
- [Controlled delayed-publication diagnostic](controlled-delivery-diagnostic.json), with its [ad-hoc script](controlled-delivery-diagnostic.mjs): using unchanged runtime code, a test-only preference publication after the sole fake frame leaves `query=true / rendered=false` with time frozen. Continuing fake frames changes it to `query=true / rendered=true`. This demonstrates the old test’s frame-starvation assumption; it is **not** a WebKit execution or proof of WebKit’s exact internal ordering.
- The exact WebKit boundary remains inferred until a fresh real CI run. No production listener defect was established, so no runtime patch was made. The correction removes the unjustified one-frame assumption without weakening preference assertions.

The initial native diagnostic attempt omitted the repository’s Study-topic seed and timed out before entering Snake; the ad-hoc setup was corrected to match `tests/fixtures.ts` before collecting the diagnostic above. This was a harness setup failure, not a game failure.

## Fresh local verification

- [Final focused Chromium repetitions](focused-repeat-tests.txt): **5/5 passed (26.3 s)**. OS on/off, app preference, native touch cancellation, queue and page-error assertions all ran. Two earlier five-pass runs are retained as [before diagnostic attachments](pre-diagnostics-repeat-tests.txt) and [before console diagnostics](pre-console-repeat-tests.txt), not labelled as final-source checks.
- [All unit tests](unit-tests.txt): **309 passed / 25 files**.
- [Strict TypeScript](typecheck.txt): pass.

Each OS transition now emits one bounded JSON line and an attachment containing engine, request, query/rendered values and fake time before frames and for at most 12 subsequent frames. This makes the next actual WebKit transition inspectable in the terminal job log even if artifact access remains blocked. No extra permanent test case, runtime logging, timeout extension, skip or engine-specific assertion was introduced. The controlled diagnostics remain ad-hoc evidence outside the permanent suite.

A fresh full CI run and queued narrow independent test review remain pending. The coordinator owns PR updates; no push, PR creation, merge, deployment or settings change was performed by this corrective task.

## Follow-up actual WebKit observation

The later [CI run 39484399211](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39484399211) confirms this synchronization correction at the actual query/render boundary: reduce required two fake frame slices, and no-preference required three. The test then reached a separate native pointer-capture fallback failure. The [follow-up diagnosis](../pr8-ci-capture/README.md) preserves original logs, distinguishes the confirmed timing observation from the earlier inference, and records the capture-fixture correction. The original failure/history above remains unchanged.
