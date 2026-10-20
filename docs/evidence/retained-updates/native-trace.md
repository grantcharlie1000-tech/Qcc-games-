# Optional native activation diagnostics

The original diagnostic checkpoint adds diagnostics only. It does not fix or classify the activation failures. Its product code and fixture bytes remain those of `713c62dad26746ac8bdc2bd4b3f1ef00a1691b36`. The later [PR-only CI integration](native-ci-integration/README.md) preserves that ancestry and incorporates current main's Animal Stack changes.

The fresh unmodified local run failed the original fifteen-second assertion `W activates after topic away and back`. W was installed/waiting with `skipCalls:1/skipDone:0`. The earlier hosted run [39382534520](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39382534520) failed the subpath main-D explicit update with `skipCalls:2/skipDone:1`. These are distinct observations; a shared cause is unproven. Historical B-entry404 and Ball input failures remain separate.

## Capture and verdict

Run the existing verification with `ARCADE_UPDATE_NATIVE_TRACE=1` to enable the helper. Without that exact value, neither optional hook is awaited and no diagnostic session is created. No workflow, dependency, product or fixture change is included.

The helper uses the installed protocol's browser-level `Tracing` domain and `ServiceWorker` category. It adds no worker JavaScript observers, Network/ServiceWorker agents, response-body reads/clones/drains or worker event lifetimes. It records raw batches under a fresh `native-trace/run-<time>-<pid>/` directory and reports collection status to stderr. A start clock marker permits approximate phase alignment.

Failure collection starts **before** gate settlement or context cleanup. The canonical assertion remains the verdict and the original error is rethrown. Diagnostic setup/end/flush errors are reported separately. Context cleanup still runs. The optional session setup/start/end command bounds are five seconds; diagnostic trace flushing has a fifteen-second bound. Those diagnostic bounds do not change any activation assertion or poll. Reported data loss, missing native category events or batch-write failure marks the capture unusable. An endpoint with no open recorded flows does not establish universal native quiescence.

## Local evidence and limits

- A single scratch ROOT canonical run using only this native tracing method passed main D, W/X/Y, real quota/progress, future-installer identity, canceled-reservation and legacy cases. Nine traces contain 47,906 total trace events and 696 native Request flow spans, with no reported data loss. All recorded Request spans have endpoints by trace end; this does not establish their state at activation. Approximate W native redundant/activating/activated transitions occurred 21/25/1046 ms after release. This is a successful control, not failure causality or a fix.
- The extracted helper passed a tiny actual two-version local worker check: A/B bodies, 419 trace events, 391 ServiceWorker events, 7 native Request events, 2 body-completion events, no data loss. This verifies extraction capability, not the full application.
- Seven focused Node tests pass, covering the disabled path, pre-cleanup capture/original-error preservation, collection failure and cleanup, unsupported setup, stalled session setup, data loss and missing native event coverage. TypeScript and JavaScript syntax checks pass. No additional broad canonical run was made after extraction.
- Verbose Chromium logging did not emit lifecycle records. The first tiny tracing capability attempt exceeded only its five-second diagnostic flush bound after successful activation; that abort remains preserved. It was not an application assertion failure.

Local raw evidence is retained under `/workspace/scratch/qcc-update-resume-713/`: `canonical-unmodified.txt`, `canonical/update-failure-6.zip`, `native-log-root.txt`, `native-trace-root.txt`, `native-trace/native-service-worker-*.jsonl` and `native-trace/native-summary.json`. Large traces and ephemeral browser profiles are not committed. Compact results are committed alongside this note.

The remaining evidence gap is native request/body/lifecycle history at an actual failing boundary. Reviewed publication and full CI are authorized in scope; exact review, parent resource sequencing, and reconciliation with subsequently advanced main are pending. No push, CI request, merge or deployment was made for this checkpoint.
