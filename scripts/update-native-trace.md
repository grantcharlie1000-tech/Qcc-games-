# Passive update diagnostics

The existing pull-request workflow enables `ARCADE_UPDATE_NATIVE_TRACE=1` for the full update verifier and always uploads `docs/evidence/release`. Main runs remain uninstrumented. No workflow or product behavior changes are required.

The collector records actual checkout/tree, allowlisted CI identity, Node/browser version, executable, scope, semantic phase and context/profile IDs. Context IDs scope native registration/version IDs; version IDs are not worker-global epochs. Observers finish setup before owned navigation. There is no worker debugger attachment, body read, response interception, lifecycle command or added diagnostic RPC.

The original assertions, native input, polling and 15000 ms gates remain intact. W release adds no awaited marker before its original poll. The first failed assertion snapshots cached state before existing error-handler RPCs or cleanup. Subsequent error handlers reuse that capture and retain the original error and failed disposable profiles.

Retention is bounded: the latest 8192 timeline rows, 64 MiB of recent sanitized native chunks per active context, and 512 MiB of completed native files. Old chunks/files are explicitly counted as evicted; later contexts retain capacity. Ordinary snapshots have a 16 MiB total cap, with a separate 16 MiB first-failure snapshot reserve; observations have a 4 MiB cap. These caps apply to added diagnostics; existing Playwright artifacts are unchanged. Native chunks are written on stop, so an abrupt process death can lose the unflushed native buffer. Protocol end/flush waits are bounded to 5 s plus 15 s; synchronous filesystem writes have bounded volume but no hard wall-clock guarantee.

Only allowlisted native lifecycle/flow/status/byte-count metadata is serialized. Fixture URLs retain localhost:4181 origin/path and omit query/fragment; other URLs, headers, bodies, credentials and arbitrary netlog parameters are omitted. Metadata filtering is explicit. Timeline loss, native eviction, setup/write failures and trace data loss must be reported. `usable` means captured native metadata only; it does not mean universal coverage, response consumption or worker quiescence. Empty category discovery remains unknown coverage. Short body-completion callbacks are not whole-body lifetimes.

The original async poll is not cancelled by its outer bound and may continue its existing version RPC during capture. Clock-sync acknowledgments bracket asynchronous commands, not activation-message delivery. Native/page observers can change scheduling. An instrumented PR result cannot alone explain an uninstrumented hosted failure.

Helper verification: `node --test scripts/update-native-trace.test.mjs`.
