# Base loose-file startup plumbing

Implemented 17 November 2026. This loads an explicitly selected loose base tree through the recovered VFS ordering, candidate Lua VM and authored raw-world adapter. The result is an inspection session. Native campaign construction and execution remain unimplemented. [NATIVE_PLAN.md](NATIVE_PLAN.md), [PARITY_LIMITS.md](PARITY_LIMITS.md) and the earlier [loader contract](NATIVE_LOADER_CONTRACT.md) describe the larger recovery boundary.

The recovered-code target is `hoi4.exe`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. That hash does not identify the imported folder. The loader records the exact consumed file bytes separately.

## Files and API

| File | Responsibility |
| --- | --- |
| [local-source.ts](../../src/games/iron-meridian/native/local-source.ts) | `captureNativeBaseDirectory(files: Iterable<File>): CapturedBaseSource`, path/index checks and worker-boundary revalidation |
| [loader-protocol.ts](../../src/games/iron-meridian/native/loader-protocol.ts) | `CapturedBaseSource`, `NativeBaseManifest`, `NativeLoaderRequest`, `NativeLoaderResponse` and typed failures |
| [loader.ts](../../src/games/iron-meridian/native/loader.ts) | `loadNativeBaseInspection(source, { runtimeBytes, onProgress? })`, selection, exact reads/hashes, Lua execution, raw-world validation and snapshot identity |
| [loader.worker.ts](../../src/games/iron-meridian/native/loader.worker.ts) | VM ownership, runtime asset acquisition, messages and one transferred province-ID buffer |

The direct loader returns `LoadedNativeBaseInspection` with `manifest`, `world: RawWorldData`, `defines: OrderedDefines` and idempotent `close()`. The worker retains only `OrderedDefines` after publishing ready. It does not retain the returned world, captured Blob index or source request after the load operation returns.

Requests are `load { sessionId, source }`, `query-define { sessionId, requestId, root, section?, key? }` and `close { sessionId }`. Responses are `progress { phase, done, total? }`, `ready { manifest, world }`, `define-result { requestId, value: LuaValue }` and `failed { requestId?, error }`, each with the originating `sessionId`. Failure details contain a phase, code, message and optional exact input path. Lua byte-string results remain copied `Uint8Array` values; missing values remain typed `nil`.

The owning app view creates one dedicated module worker, supplies session IDs, rejects stale responses and terminates the old worker on replacement, cancellation or disposal. Termination is required to interrupt synchronous Lua/WASM. Posting `close` cannot interrupt an executing chunk. A successful ready message transfers `world.provinceIds.buffer` once and structured-clones the other world collections. The app's entry and renderer are separate files owned and verified by the integrating parent task.

## Supported input and execution

The sole acquisition mode is `directory-input`, scope `base-loose-explicit`, coverage `inferred-from-files`. Capture retains File/Blob references only from `common/defines`, `history/states` and `map`. It does not read their bodies on the app thread. Unrelated installation files are not retained by the captured result. The browser-supplied parent folder name is a display label removed exactly once.

Capture rejects missing relative paths, multiple selected roots, duplicate exact paths, file/directory conflicts, empty or dot segments, NUL, backslash, leading slash and colon. Relevant paths must contain printable ASCII bytes. The selected parent label may contain Unicode. Case is preserved. Structured-cloned input is revalidated and its parent-directory index must match the file index. Empty directories are not established by this acquisition method.

Supplied PHYSFS listings use regular-file type `0`, directory type `1` and empty opaque metadata. Both search roots and replacement pairs are explicitly empty adapter inputs. Unexpected `stat` or `getRealDir` requests fail. This supplies an isolated loose-tree model to the recovered selector; it does not recover active mounts or native filesystem access.

Define selection uses the recovered arguments: `common/defines`, empty output prefix, literal suffix `lua`, no contains filter, current depth `0`, maximum depth `-1`. Returned order is retained without a final full-path sort. Current-directory files precede child directories; names use the recovered unsigned-byte comparison. Thus `filelua` can match and uppercase `Lua` does not. See [NATIVE_VFS_PORT.md](NATIVE_VFS_PORT.md). Immediate state files use suffix `.txt` and maximum depth `0`; this is the authored world adapter's selection policy, not a recovered native state-loader claim.

Each consumed file is read once, checked against Blob size and hashed with SHA-256. Read, short-read and hash failures abort. Fatal UTF-8 decoding applies to authored world text. Lua receives exact chunk bytes. `map/default.map` must contain unique `=` scalar `definitions` and `provinces` assignments whose validated relative paths remain beneath `map/`. The adapter reads these exact captured paths, executes selected Lua chunks in order and calls `ingestRawWorld`. World issues with severity `error` block ready; warnings remain in the result. Any failure after VM creation closes that VM.

The manifest contains consumed path/byte/hash records, inferred directories, define execution order, state adapter order, referenced map paths, explicit empty VFS arrays, actual supplied runtime hash, adapter version label and unresolved assumptions. `snapshotId` hashes a fixed-order JSON payload of those fields, excluding its own ID and the display label. Reordering the input FileList or renaming the selected parent leaves the same identity; consumed-byte changes alter it. This is a set of individually read files, not an atomic snapshot of a changing installation. `loaderBuildId: base-loose-explicit-v1` is an adapter contract label, not a digest of all application source.

## WASM input correction

The local-only Lua build now requests `ENVIRONMENT=web,worker,node` and explicitly sets `INCOMING_MODULE_JS_API` to `wasmBinary` and `locateFile`. The build manifest records both settings and the pinned Emscripten 7.0.0 driver identity. No dependency or global environment was installed or changed for this integration.

The first isolated worker probe exposed a real configuration error: Emscripten 7's default incoming API excludes `wasmBinary`. The earlier wrapper accepted the TypeScript option but ignored it and attempted to load an adjacent runtime asset. The failed probe and old wrapper identity are retained in [initial-worker-probe-failure.json](../../work/iron-meridian/native-loader/initial-worker-probe-failure.json). The corrected generated wrapper instantiates the supplied bytes. A regression supplies invalid bytes while the adjacent valid runtime exists and requires initialization to reject. The standalone worker fixture deliberately has no adjacent `compiled/runtime.wasm`, so successful initialization also distinguishes the corrected path.

| Rebuilt artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `native/lua51/runtime.mjs` | 58,359 | `e15d3c72d931f404ea7e4f37825bddf52abd2f865e9b451e74c03ea0bc652bce` |
| `native/lua51/runtime.wasm` | 179,637 | `46094f3a588a1cb8672410c75a01b3890b4e7008c94d37c15a9574ef3069e3f6` |

The WASM bytes are unchanged by this wrapper configuration correction. The VM remains an upstream Lua 5.1.1 candidate plus recovered adapters. Matching numeric/API vectors and successful script execution do not establish whole embedded-VM, Luabind or engine-host parity.

## Verification and limits

The scoped loader suite has **22 passing behavior tests**, including actual Lua execution, files-before-subdirectories ordering, literal suffix/case filtering, byte strings, deterministic provenance, failed and short reads, hash failure, failed chunks, invalid map declarations and world data, and invalid supplied WASM. The existing Lua and integer API suites also passed, giving **240 passing tests across these three files**. A strict scoped TypeScript check passed for the four loader/source/protocol files and the loader test. No full application check or build was run by this task.

[check-worker.mjs](../../work/iron-meridian/native-loader/check-worker.mjs) bundles the actual worker module using the repository's existing esbuild, then hosts it in a Node worker through an explicit adapter. All **14 assertions passed**: synthetic base loading, pixel and Map transport, provenance, sender buffer detachment, live numeric/byte-string/nil queries, progress, graceful close, failed-chunk diagnostics without ready publication, and termination of an infinite Lua loop. [worker-verification.json](../../work/iron-meridian/native-loader/worker-verification.json) records the source/artifact hashes and results. The bounded termination observation is a fixture control check, not a performance claim. This uses Node's runtime branch and worker host; it is not browser Worker or offline-pack evidence.

Browser directory selection, emitted production worker/WASM URLs, app lifecycle, visual interaction and reopening the app offline require the parent integration's separate checks. No browser, dev server or original game was run by this task. Persistent content storage is deferred: no File/Blob bytes or derived bulk world data are written to account saves by this loader, and imported content must be selected again for a new session.

Active DLC/mod selection, native mount precedence, archive/open/read resolution, complete embedded configuration initialization, native world construction, history evaluation, ownership, localization, research-state initialization and outer simulation remain unresolved. Successful loading establishes base-file inspection over the declared supplied model. It does not initialize or run the native game.
