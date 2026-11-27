# Owning input streams in browser startup

The browser worker now composes recovered owning stream construction, buffering, length, read-all and destruction over the explicit captured loose-base provider. Returned bytes are copied before concrete byte-vector cleanup. This replaces the adapter's earlier manually assembled open/read/close sequence. It does not construct a native campaign.

The target remains the read-only installed `hoi4.exe`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. Original instruction oracles execute selected bytes in Unicorn with declared memory and individual services. No original game or DLL process was launched.

## Recovered components

| Component | Main cases | Additional review | Current use |
| --- | --- | --- | --- |
| Keyword record/vector/allocator construction | 72 | 17 | Reviewed component; effective registry remains open |
| Owning stream/engine construction | 103 | 5 | Browser file reads |
| Character-reader construction, byte/position/block/checksum | 32 | 5 | Reviewed component; complete input factory remains open |
| Concrete vector, reader and path destruction | 58 | 5 | Vector cleanup in browser reads |

The keyword review found an early TLS-pointer capture ordering defect. Its pre-fix alias failure is retained; the corrected source preserves all 71 earlier cases and adds the discriminator. Other component reviews found no remaining material defect within their declared contracts. Character-reader evidence includes every byte of the real 46,578-byte infantry technology file and two EOF reads. These bounded checks do not establish tokenizer or technology database behavior.

Each browser read performs recovered stat before Blob hydration. It then constructs a mode-zero owning stream with a 1 MiB buffer, checks native length, runs recovered read-all into a vector, checks EOF, copies the bytes, destroys the stream and destroys the vector. The provider's captured mount, callback tables, allocator, diagnostic flags and warm TLS remain explicit authored browser state. Original readonly vtable, growth and error data are byte-bound to the executable. No CR normalization or string conversion is inserted.

Native allocations are tracked separately from scratch memory. Success requires no native allocations, native handle-list entries, open provider or held locks. Cleanup attempt flags are set before invoking destruction. Partial stops and exceptions cannot retry a destructor after earlier stores or frees. Nested cleanup still attempts vector destruction and always disposes the host arena. Host disposal does not claim native exception unwinding or successful native close.

## Integration and verification

The first integration run failed because an original vtable spanned two separately mapped pages. Adjacent static pages now coalesce. The second failed because buffered construction required an individual reallocation callback and global slot. Both failures are retained. Eleven main adapter cases now pass, including exact binary reads below, at and above 1 MiB. Independent review passes 25 overlapping main/fault checks and independently rebinds image bytes and promoted components. The older short-read injection was ineffective under buffering; its failing run is retained, and a work-only two-byte-then-EOF replacement checks the same rejection and cleanup behavior.

The [checkpoint](../../work/iron-meridian/native-input-integration/checkpoint.json) binds 121 source/reference files. All 6,631 tests in 31 native-scope suites pass. The full production build, including TypeScript, and explicit offline verification pass for pack `b2713c6cfc202d09`, 41 shell files and 30 games. Five current production Chromium tests verify worker/Lua behavior, retry, cancellation, replacement and network-disabled reopening with local-file reselection.

The real installation directory passes sixteen production browser checks at desktop and phone sizes. All 1,087 loaded inputs complete stat, owning construction, read-all, stream destruction and vector destruction, with zero live handles. Province 12849/state 514, camera controls, full viewport scene, dock clearance and menu pause pass without browser errors. New screenshots and manifests are retained under `native-input-integration/production`. Shared-preview directory upload timed out twice; the retained Chromium harness supplied this browser evidence.

The complete generated 10,767-record initializer is separately staged with ten composed original-instruction cases. Its baseline constructs every record and name, leaving 2,336 heap names live as expected. Its registered destructor, global startup order, keyword hash registry, tokenizer, effective content and campaign remain open. Current simulation, rendering, save, networking and AI limits are listed in [PARITY_LIMITS.md](PARITY_LIMITS.md). No commit, push or deployment occurred.
