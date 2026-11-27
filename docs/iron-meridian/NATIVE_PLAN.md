ÃƒÂ¯Ã‚Â»Ã‚Â¿# Native decompilation and web port

The requested job is to decompile the installed Hearts of Iron IV executable and port its recovered implementation to the web under a different title. The earlier original Iron Meridian game is preserved, but it does not satisfy that request. Its tests establish its own behavior only.

## Current target

- Executable: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`
- SHA-256: `709F916AFBEBCFE64A26678702691AEB40945D206074C2A80DE8E9D601FCE148`
- Declared game version: 1.19.5.0, Steam build 26479645.
- Format: AMD64 PE32+, 56,535,160 bytes.

The installation stays read only. No commit, push or deployment is authorized. OpenAI agents work in parallel on separate evidence files. Portable analysis prerequisites live outside the app checkout. Native databases and bulk recovered output will also live outside the public application assets.

## Execution gates

1. Establish a working native decompiler with recorded package versions and hashes. Skill installation alone does not establish this.
2. Recover a function inventory, code references, decompiler output and unresolved calls from the actual executable. Keep addresses, executable identity and analysis settings with every export. Decompiled C is reconstructed pseudocode, not the original C++ source.
3. Select a real gameplay code path whose dependencies can be recovered. Identify inputs, state layout, arithmetic, branches and external calls before translating it. Do not replace unknown behavior with invented formulas.
4. Port that recovered path into the browser and verify with discriminating vectors derived from machine instructions or native execution. Static agreement and runtime equivalence remain separate claims.
5. Expand the recovery and port by subsystem. Full completion requires the engine, content-loading semantics, rendering/input adaptations, save/load, AI, networking and effective content dependencies, followed by actual end-to-end equivalence validation.

## Evidence owners

- Parent: decompiler/toolchain, persistent analysis, recovered-code exports and port integration.
- `native_inventory`: PE structure, imports, debug metadata, RTTI, strings and candidate function addresses.
- `port_boundary`: platform dependency inventory and a gated actual-code port slice.

## Status

Native Ghidra decompilation and the latest per-entry counts are recorded in [NATIVE_DECOMPILATION.md](NATIVE_DECOMPILATION.md) and the retained manifest. The latest resumable pass retains four initial C failures; a selected retry recovers one, leaving three attempted C entries without completed C across the combined exports. Whole-program analysis remains incomplete, and the earlier broader analysis timeout remains explicit. Raw, refined, retry and resumable exports are retained separately. Recovered C and discovered functions are not parity percentages.

58 native-scope suites pass 7,623 tests, including overlapping component/composition checks. Reviewed keyword records, owning-stream construction, character reading and concrete ownership cleanup are promoted. The browser file bridge now composes owning buffered streams, read-all and stream/vector destruction. Earlier research, map, sort, file, loader and lifecycle evidence remains retained. Original AVX execution remains unverified. A separate pinned PhysicsFS development candidate retains 268 assertions with its custom-fork mismatch unresolved. [NATIVE_VERIFICATION.md](NATIVE_VERIFICATION.md) binds the current verified checkpoint.

The actual app entry loads an explicitly selected loose base folder through recovered VFS order, stat and owning buffered stream callers, candidate Lua and the authored raw-world adapter. Its browser provider models one captured loose mount. A fresh production real-installation run passes sixteen checks at desktop/phone sizes; all 1,087 loaded inputs complete construction, read-all and stream/vector destruction with zero live handles. Five fresh official production browser tests pass for actual worker/Lua execution, map interaction, failure/retry, infinite-Lua cancellation/replacement and network-disabled reopening with local-file reselection. The license-inclusive production build and explicit offline artifact verification pass for `b2713c6cfc202d09`. The fictional campaign source and saves remain preserved separately. This is base-file startup, not a native campaign. [PARITY_LIMITS.md](PARITY_LIMITS.md) records the exact remaining boundary. Prior prototype tests do not establish native equivalence. [NATIVE_INPUT_STREAM_PORT.md](NATIVE_INPUT_STREAM_PORT.md) records the corrected bridge and component reviews. The complete generated keyword initializer, parser-state constructor and owning stream-to-reader factory are reviewed and promoted as components. Their latest full build, typecheck and offline checks pass; the five emitted native assets remain byte-identical to the fresh browser checkpoint. All 10,767 keyword constructors execute in the original-instruction oracle. Exactly two native OpenAI subagents were used with fast mode off. Both authorized workers completed substantial recovery/review work before platform filters stopped their later turns. Root continues local recovery; no extra agent or fast mode was used. Reviewed registry/input/tokenizer, derived text input, input cleanup and ordinary parser/navigation components are promoted. [NATIVE_TEXT_PARSER_PORT.md](NATIVE_TEXT_PARSER_PORT.md) records their checks and explicit runtime bounds. [NATIVE_INPUT_FACTORY_PORT.md](NATIVE_INPUT_FACTORY_PORT.md) records these component boundaries. Research and other raw-memory components remain outside a native campaign until its effective state contract is recovered.

## Next recovery checkpoint

1. Continue from the saved owned Ghidra project and validated resumable exporter. Complete broader function recovery, retaining failed calls and incomplete function boundaries. Recover concrete dynamic implementations, effective state/content construction, scheduler cadence and completion effects beyond bounded research updates. Keep unresolved behavior explicit.
2. Connect the tested supplied-listing VFS, candidate Lua and new browser file adapter to recovered mount planning, descriptor registry, effective selected roots and archive resolution. Browser startup now invokes the recovered file callers over one authored captured-folder provider. Actual engine mount/provider construction remains open. Do not infer active selections or effective engine globals from isolated base files.
3. Extend the composed research constructor, graph, status and ordinary positive-budget resource/cost path through remaining runtime branches, resource consumption and actual scheduler/completion behavior. The initialization caller retains 29 original-instruction cases; current budget/caller coverage retains 128 old cases plus 4 completed sort callers. Category sorting is integrated with declared allocator/AVX bounds. Effective native definitions and campaign construction remain unresolved. Keep the original fictional simulation separate until a real native campaign state contract is established.
4. Expand native recovery and subsystem coverage. The 140,896 compiler unwind records include fragments and are not a count of fully recovered functions. No whole-engine recovery or complete parity claim is authorized by the selected exports.
5. Integrate recovered subsystems into the web game only with explicit dependencies and tests. Retain the no-commit/no-push/no-deploy boundary and OpenAI-only parallel workers.


The latest local component promotion is bound at `native-nested-cleanup-integration/checkpoint.json`: 7,623 native-scope cases/58 suites, full build/typecheck, explicit offline verification and unchanged emitted browser assets. Reviewed constants and Boolean/metadata paths are components only. The reviewed extended variable caller (35 cases) and bounded scalar values (54 cases) are promoted. The scalar boundary covers public return/output and ordered nonstack writes, with scanner stack/control/read equivalence excluded. Reviewed numeric wrappers/two fields (66 cases) and separate Boolean property iteration (31 cases) are promoted. [Property iteration](NATIVE_PROPERTY_ITERATION_PORT.md) records their exact bounds; mixed iteration (62 cases), concrete construction (54), categories (40) and raw database insertion (19) are now reviewed and promoted. Their supplied runtime context remains explicit, and effective database construction remains unfinished. Keep broad full validations at integration checkpoints; persistent selected exports avoid repeated Ghidra project reloads.

[Nested fields and parser cleanup](NATIVE_TECHNOLOGY_NESTED_PORT.md) records the reviewed combined reader and destruction boundaries. The real file-loading caller still needs its sibling input construction and effective enumeration context.
