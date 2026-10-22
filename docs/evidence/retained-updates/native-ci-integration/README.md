# PR-only native activation capture

Local integration commit `01e73d275a07844520a023944fc41b9583ff8d65` merges main `fbac0a58aa23b953ff9ed382d2cd4bd80c817008` into diagnostic checkpoint `abad6df6ba0d0424a54cddf3aa9e0d34f6efd276`, preserving the public 713/abad ancestry. There were no conflicts. All 90 prior PR4 paths match abad byte-for-byte after that merge; the integrated Animal Stack art/source/tests match main exactly. The separate article revision is not included.

The follow-up changes only four workflow lines: run the seven diagnostic-helper tests explicitly, and set `ARCADE_UPDATE_NATIVE_TRACE` to 1 for `pull_request` and 0 for other events on the existing `verify:update` step. Permissions, triggers, concurrency and the deployment gates remain byte-identical. No new workflow, account setting or deployment action is introduced. Existing verification artifacts already include the native trace directory.

Integrated local verification passed 324 full unit tests, 7 helper tests, TypeScript and production build, pack `1a6bfac19793`. The workflow parses as YAML and the env flag belongs only to the existing update step. See [integration-proof.json](integration-proof.json), [verification.json](verification.json) and the raw logs here. No additional broad browser/update/offline reproduction was run after integration; reviewed hosted CI must establish those combined results.

This is diagnostic work. The original unmodified 713 W failure and hosted 713 subpath D stall remain unclassified, and the successful local tracing controls are not a fix. Native tracing can affect timing; an instrumented green does not explain the earlier RED. Missing events, data loss and collection errors remain qualified separately from the unchanged activation assertions and original thrown error.

No push, PR request, CI request, merge to main or deployment was performed locally. The parent coordinates exact review and authorized publication/CI. Article photos, branding and article-document/indexing work remain separate.
