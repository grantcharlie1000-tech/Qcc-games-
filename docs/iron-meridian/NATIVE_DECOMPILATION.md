# Native decompilation evidence

The job is to decompile the installed native game and port its recovered implementation. The original Iron Meridian game is preserved and does not fulfill that job.

## Actual recovery

Ghidra 12.2 imported the verified executable. The latest queued-batch manifest combines 14,358 selected export records for 14,217 entries with 21,539 resumable discovered-function exports. These overlap: together they cover 35,366 unique attempted entries, of which 35,362 have at least one completed reconstructed C export. The first 25 raw and 29 refined exports remain separate. Later passes add research, selection parsing, mounting, platform, map, scheduler, construction, graph, handle I/O, character reader and keyword registry dependencies. The initial broader analysis inventories 111,503 discovered functions; the latest selected-pass inventory contains 111,510. Discovery and completed decompiler calls are not full source recovery or a parity measurement.

All native artifacts are under `C:\Users\charlie\artifacts\hoi4-native\709f916afbebcfe6`:

| Artifact | Relative path |
| --- | --- |
| Immutable executable copy | `hoi4.exe` |
| Toolchain versions and hashes | `toolchain.json` |
| Per-export hashes and limitations | `decompilation-manifest.json` |
| Saved Ghidra project | `projects/HOI4-gameplay.gpr` and its `.rep` directory |
| Raw reconstructed C and instructions | `exports/gameplay` |
| Annotated second pass | `exports/refined` |
| Additional research and script-loading dependencies | `exports/research-closure` |
| Selected filesystem and Lua API bodies | `exports/filesystem` |
| Selected VFS helper, tree and sort bodies | `exports/vfs-helpers`, `exports/vfs-tree`, `exports/vfs-sort`, `exports/vfs-final` |
| Selected entries refreshed after partial analysis | `exports/post-analysis` |
| Native selection, mounting and parser closure | `exports/mounting`, `exports/mounting-closure`, `exports/startup` |
| Progress update, custom filesystem, map and scheduler bodies | `exports/update-closure`, `exports/platform`, `exports/map-and-closure`, `exports/scheduler` |
| Constructor and startup dependency closure | `exports/construction`, `exports/integration-closure`, `exports/startup-closure` |
| Handle I/O and research graph dependencies | `exports/file-io`, `exports/links-and-io` |
| Graph context, file opening and province geometry closure | `exports/links-context`, `exports/links-reset`, `exports/file-open`, `exports/province-spans`, `exports/province-followup` |
| Budget calculation and local allocator closure | `exports/research-budget`, `exports/research-budget-vector`, `exports/research-budget-closure`, `exports/research-budget-sort`, `exports/research-budget-sort-closure` |
| Category merge/rotation and engine content stream closure | `exports/research-budget-merge`, `exports/research-budget-rotation`, `exports/native-content-stream`, `exports/native-content-io` |
| Technology input, tokenizer, keyword and field dispatch | exports/native-technology-parser, exports/native-tokenizer-closure, exports/native-keyword-registry, exports/native-keyword-construction |
| Owning stream, logical opener and token vector construction | exports/native-stream-construction, exports/native-input-construction |
| Keyword inline allocator and CRT wrappers | exports/native-keyword-allocator |
| Character reader and concrete ownership cleanup | `exports/native-character-reader`, `exports/native-reader-lifetime` |
| Keyword insertion, collision movement, rehash and synchronization | `exports/native-keyword-registry-closure`, `exports/native-keyword-registry-rehash`, `exports/native-registry-vector` |
| Auxiliary registry construction, input factory and character classification helpers | `exports/native-input-registry-closure`, `exports/native-input-factory`, `exports/native-lexer-primitives` |
| Resumable C/instruction exports and per-entry hashes | `full-export/exports.tsv` and its address shards |
| Captured-ledger and original-byte verification | `full-export/verification.json` |
| Retained large-function retries | `exports/retry` and `retry-export.log` |
| Pre-analysis selected recovery and recorded options | `broad-analysis/prepass` and `broad-analysis/analysis-options.tsv` |
| Full discovered inventory and bounded C export batch | `broad-analysis/research-export` |
| Broader analysis log, including timeout | `broad-analysis.log` |
| Saved checkpoint before broader analysis | `projects/checkpoint-45` |
| Saved checkpoint after broader analysis | `projects/checkpoint-broad` |
| Successful import and save log | `gameplay.log` |
| Second-pass save log | `refined.log` |
| REA PE import Evidence | `rea-imports.json` |

The input SHA-256 is `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. Selected C exports repeat their identity, entry, language and compiler specification, with separate instruction files. The broad batch repeats identity and entry in each C file and records the analysis context in its manifest; it does not include a separate instruction TSV for each function. The original installation was not changed.

The selected manifest distinguishes 14,073 retained nonempty instruction listings, 62 empty legacy listings and 223 exports without separate listings. Empty TSV files are not instruction evidence. The resumable snapshot separately verifies 2,060,185 listing lines against original executable bytes. These are retained lines, not a count of unique instructions or complete function coverage. Some inferred bodies omit switch arms even when reconstructed C includes them, so independent bounded LLVM listings remain necessary for the instruction oracles.

## Resumable recovery and unresolved entries

`ExportResumable.java` retains each C export and instruction listing before appending its identity/hash record. Resume validates the complete prior index, paths and both artifact hashes. Torn rows and orphan files require explicit review rather than silent overwrite. The revised preflight reopened the saved program read only and validated all 8,204 indexed entries with an export limit of zero.

The fourth resumable batch adds 4,147 completed calls with no new failures. Its 21,539-row snapshot retains 21,535 completed calls and four historical failures. All prior ledger bytes remain an exact prefix. A separately retained retry recovers `0x14006f2d0`, leaving three combined attempted entries without completed C: `0x1400036f0`, `0x140083760` and `0x1405a66a0`. Historical failure records remain unchanged. The [batch checkpoint](../../work/iron-meridian/native-bulk-resume-four/checkpoint.json) and [index verification](../../work/iron-meridian/native-recovery-index-bulk-four/verification.json) bind these counts. Completed C does not establish correct inferred boundaries or behavior.

`verify_full_export.py` binds counts, hashes and instruction comparisons to captured ledger/listing bytes, rejects a changed ledger, uses unconditional validation exceptions and publishes its report atomically. Independent review found and verified fixes for torn-index resume, ledger/listing snapshot mismatches and optimization-disabled assertions. Nine behavior checks pass under Python `-O`, including discriminating ledger-append and listing-replacement cases. Their retained results are in [native-export-checks](../../work/iron-meridian/native-export-checks/results.json).

## Analysis boundary

The first targeted passes disabled whole-program analysis and used two CPU workers and a 1,536 MiB Java heap. A later pass uses two CPU workers, a 3 GiB heap and a requested 900-second analysis limit, with Decompiler Parameter ID disabled. It reports analysis timeout and 1,062 seconds in its analyzer timing table. The completed post-script exported 220 candidates, and the project save succeeded with process exit zero. The timeout and decompiler warnings are retained. Exit zero and completed exports do not mean whole-program analysis finished.

Seeds came from validated RTTI/vtable pointers, unwind ranges, diagnostic references and direct calls. Full discovery, original headers, class layouts, indirect-call closure and gameplay behavior remain unresolved. The 111,503 discovered functions include inferred routines and thunks. The independent 140,896 unwind records include fragments and are not a recovered-function count.

The first import was canceled during dependency lookup. The successful run disabled saving library imports, although Ghidra still inspected local system DLL exports and cached symbols. It saved zero additional programs. Auxiliary DLL resource/export warnings remain in the log. No game process or DLL entrypoint was launched.

Raw inferred prototypes can be wrong. The first reconstruction of `0x140F53350` showed an incorrect first helper argument; instructions establish the state argument in `RCX`. Later passes apply explicit analyst register/stack annotations and the compiler's default calling convention. Earlier outputs and their warning remain retained. These are not original C++ declarations. Arithmetic verification uses original instructions rather than inferred C prototypes.

The authored exporter, annotation and manifest scripts live in `C:\Users\charlie\tools\hoi4-analysis`. Reopening the saved project with `-process hoi4.exe -noanalysis` succeeded. Future recovery can reuse it without reimporting. Raw output remains separate from refinements.

## Toolchain

Portable packages were acquired outside the app checkout and checked against publisher-provided SHA-256 values:

| Package | Version | Archive SHA-256 |
| --- | --- | --- |
| Ghidra | 12.2 | `2c2cd776db3c1f6a097ba418922378ac3649cadd5e844a6f5f088ae628a7be67` |
| Temurin JDK | 25.0.5+8 | `636bdc13dc649ddc7d5921c5c7d23cca6e44fd19d662b45cc9c02135a6c96c42` |
| Node.js | 24.22.3 | `e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f` |

Primary references: [Ghidra release](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.2_build), [Ghidra requirements](https://github.com/NationalSecurityAgency/ghidra/blob/master/GhidraDocs/GettingStarted.md), [Temurin metadata](https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse), [Node checksums](https://nodejs.org/dist/v24.22.3/SHASUMS256.txt).

REA CLI 6.9.0 runs through the portable Node runtime. Doctor verified Ghidra, the native decompiler, JDK and Windows native controls. The existing Codex MCP registration has drift and was not changed. CLI operation needs no registration repair. Persistent targeted work used Ghidra headless directly and is not labeled REA decompilation Evidence.

The actual REA `inspect_pe_imports` result is retained as Evidence `ev_5838d319ceff3a5383dd9a4425385b07108c73dd2838c6869d0e79a473b552d1`. It excludes runtime binding, forward resolution and reachability. Shell observations remain separately labeled in [NATIVE_INVENTORY.md](NATIVE_INVENTORY.md).

## Port status

[RESEARCH_DAILY_PORT.md](RESEARCH_DAILY_PORT.md) records the composed modifier/cost/rate calculation with 313 single-run original-instruction cases. Its component tests retain their separate evidence. [LUA_CONFIGURATION_PORT.md](LUA_CONFIGURATION_PORT.md) records a candidate matching-source Lua WASM build, 482 engine numeric conversions and 211 integer API comparisons. [NATIVE_VFS_PORT.md](NATIVE_VFS_PORT.md) records supplied-listing selection and ordering with 113 cases. [NATIVE_WORLD_INPUT.md](NATIVE_WORLD_INPUT.md) records real base-map ingestion and independent all-pixel verification. Effective initialization, mounts, real gameplay states and subsystem integration remain open.

[RESEARCH_UPDATE_RECOVERY.md](RESEARCH_UPDATE_RECOVERY.md) extends calculation into bounded native progress writes and callers, with 260 cases. [NATIVE_SELECTION_LOADING.md](NATIVE_SELECTION_LOADING.md) records 161 native JSON projection cases and static mount/selection recovery. [NATIVE_MAP_RECOVERY.md](NATIVE_MAP_RECOVERY.md) records the complete rectangle writer and located native map routines. [NATIVE_PHYSFS_PORT.md](NATIVE_PHYSFS_PORT.md) records a pinned upstream WASM candidate and its explicit custom-fork mismatch. [NATIVE_VERIFICATION.md](NATIVE_VERIFICATION.md) consolidates current checks.

This is partial native recovery with reviewed components and owning-stream startup integration. [NATIVE_INPUT_STREAM_PORT.md](NATIVE_INPUT_STREAM_PORT.md) records the latest browser checkpoint and complete generated keyword-initializer stage. It is not the full engine, a compile-ready original source tree, a complete research subsystem or a playable HOI4 browser port. No commit, push or deployment occurred. [NATIVE_PLAN.md](NATIVE_PLAN.md) retains the unfulfilled full-port work.

The current parser recovery adds retained input destruction, variable/error helpers, balanced navigation, property iteration, technology scalar wrappers and CRT scanning exports. The latest combined manifest retains three attempted entries without completed C. All 21,539 resumable rows have fresh original-byte listing verification. Selected recovered components have separate behavioral evidence in [NATIVE_TEXT_PARSER_PORT.md](NATIVE_TEXT_PARSER_PORT.md); completed decompilation does not establish their behavior.

[Recovery throughput](NATIVE_RECOVERY_THROUGHPUT.md) records the rejected parallel export experiment, persistent selected-dependency queue, byte verification and corrected shutdown probes. The 300-entry serial measurement sample contributes retained exports; its parallel duplicate remains separate and is not double-counted. The fourth resumable batch brings this retained checkpoint to 21,539 rows.

The four fresh queue groups attempt 13,312 distinct new entries through immutable 128-entry jobs. They retain 13,311 completed C exports and one explicit timeout at 140E73250. Every batch has complete original-byte listing verification and exact DONE/ledger identities, including the failed call; failed C is not counted as completed. The [new index verification](../../work/iron-meridian/native-recovery-index-queued-four-reviewed/verification.json) rehashes every selected C/listing and binds the preserved full-history snapshot. The original full-export ledger stays byte-identical. The combined index now has four unresolved entries, including the three historical failures. Export counts are not parity percentages.

The old manifest builder refused an entire verified queue batch containing any unresolved call. A local correction checks exact attempt/completion/error records and each C completion marker/hash, preserving the failed call instead of rejecting all other exports. Nine optimized metadata acceptance/rejection checks pass, and previous selected records are unchanged. The requested independent review was stopped by a platform filter, so this small correction has root source review and retained tests/rehash evidence only. The canonical tool builder is unchanged. The [index checkpoint](../../work/iron-meridian/native-recovery-index-queued-four-reviewed/checkpoint.json) records that limitation and the rejected initial attempt.

Exact parser cleanup and copied-name input dependencies are retained alongside the bulk groups. Queue ten ended with decompiler disposal and process exit zero. [Throughput](NATIVE_RECOVERY_THROUGHPUT.md) records the avoided repeated-history work and unadopted performance candidates.
