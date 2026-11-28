# Native supplied-handle file I/O

Implemented 17 November 2026. [file-io.ts](../../src/games/iron-meridian/native/file-io.ts) translates the original buffered byte-read and handle-lifetime path over supplied native memory. It includes read, position, EOF, seek, buffer ownership, flush and close behavior. Individual IO-provider, CRT, allocator and mutex services remain explicit callbacks. No file opener, archive provider or active mounted filesystem is fabricated.

This extends the supplied-state [mount planner](NATIVE_MOUNTING_PORT.md) with a useful handle boundary. It is not wired into the browser base-loose importer and does not replace its File/Blob provider. [NATIVE_PLAN.md](NATIVE_PLAN.md) and [PARITY_LIMITS.md](PARITY_LIMITS.md) retain the larger incomplete-port boundary.

## Original identity and chosen closure

The read-only target is `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`, 56,535,160 bytes, preferred image base `0x140000000`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`.

[native-file-io](../../work/iron-meridian/native-file-io/) retains `collect.py`, eleven bounded LLVM disassemblies, `instructions.json`, `emulate.py`, `reference.json` and `verification.json`. The collector and emulator independently bind window hashes and every decoded instruction to the original PE bytes. Ghidra exports under `exports/platform`, `exports/file-io` and `exports/links-and-io` assisted interpretation; original instructions determine the port, including argument registers and callback reloads.

| Entry | Exclusive end | Bytes | Ported behavior |
| --- | --- | ---: | --- |
| `0x14257a870` | `0x14257a9dc` | 364 | `PHYSFS_readBytes` |
| `0x14255fe10` | `0x14255fe2b` | 27 | Engine object's read wrapper |
| `0x14257b9c0` | `0x14257b9f9` | 57 | `PHYSFS_tell` |
| `0x142578fe0` | `0x142578fea` | 10 | `PHYSFS_fileLength` |
| `0x142578f60` | `0x142578fbb` | 91 | `PHYSFS_eof` |
| `0x142578ff0` | `0x14257903f` | 79 | `PHYSFS_flush` |
| `0x14257ab60` | `0x14257ac3b` | 219 | `PHYSFS_seek` |
| `0x14257add0` | `0x14257aef7` | 295 | `PHYSFS_setBuffer` |
| `0x1425784a0` | `0x142578587` | 231 | `PHYSFS_close` |
| `0x14257ca30` | `0x14257cb33` | 259 | Handle-list search, flush, destruction, free and unlink |
| `0x14257bd90` | `0x14257bea8` | 280 | Global-state accessor and raw first-initialization stores |

These windows total **1,912 bytes and 527 decoded starts**. Their individual hashes and file offsets are recorded in `instructions.json`; they are bounded instruction envelopes, not a claim of complete executable recovery.

## API and supplied memory

Construct `new NativeFileIo(memory, dependencies, gsBase)`. Public methods are `readBytes(file, destination, bytes)`, `readEngineFile(object, destination, bytes)`, `tell(file)`, `fileLength(file)`, `eof(file)`, `flush(file)`, `seek(file, offset)`, `setBuffer(file, bytes)` and `close(file)`.

Results are discriminated `returned { value }`, `runtime-required { boundary, nativeAddress, callSite }` or `native-exception { code, nativeAddress }`. Read/count/position results use signed64 `bigint`; C `int` results preserve the low signed32 value. Pointer and unsigned count arithmetic wraps at 64 bits. The source does not clamp provider results into an invented successful read.

`NativeFileIoMemory` supplies byte/dword/qword reads and writes. Memory, live handle objects, IO objects, buffers, TLS, valid acyclic handle lists and callback ABIs must be valid for the accesses performed. Except for the read size guard, these original entry points do not validate arbitrary null or stale handles before dereferencing. The port does not add such validation. Native memory faults, invalid extents, concurrent access and callback exceptions are outside this contract.

| Handle offset | Recovered use |
| --- | --- |
| `+0` | IO object pointer |
| `+8` | Nonzero read-mode byte |
| `+0x18` | Buffer pointer, zero for direct reads |
| `+0x20` | Buffer capacity passed to refill |
| `+0x28` | Filled/pending bytes |
| `+0x30` | Buffer position |
| `+0x38` | Next handle in native open-file lists |

The engine wrapper reads its PHYSFS handle from object `+0x10`. Its read arguments otherwise pass through, and a negative returned read becomes zero.

Provider callback slots in the IO object are `+0x10` read, `+0x18` write, `+0x20` seek, `+0x28` tell, `+0x30` length, `+0x40` optional flush and `+0x48` destroy. Callbacks receive the actual function target and captured IO pointer. The role names describe how the original caller uses each slot; actual archive/directory-provider implementations are not supplied by this port.

## Read and position semantics

`readBytes` first compares the unsigned requested count against `INT64_MAX`. An excessive count writes raw error **9** and returns `-1` before reading the handle. A zero read-mode byte writes raw error **15** and returns `-1`, including for a zero count. A readable zero-count request returns zero without calling a provider.

Without a buffer, the function tail-forwards the IO read result. With a buffer, it computes the wrapping difference between fill and position. Available bytes are limited to the remaining request, copied through the individual CRT copy leaf, and then the current position field is incremented. A copy whose destination aliases the handle can therefore change the field before that increment; the oracle includes a discriminating alias case.

An empty buffer calls the current IO read slot with the captured buffer pointer and current capacity. After the callback, position is reset to zero. A positive count becomes the new fill; the next iteration reloads the buffer pointer and fields. A zero or negative refill clears fill. With no earlier copied bytes it returns that provider result; after earlier copies it returns the copied count instead. Provider error/TLS writes remain observable even when a positive partial count is returned.

`tell` calls the current provider first, then reloads mode and buffer fields. Read mode returns the wrapping signed64 value `providerTell + position - fill`; write mode returns `providerTell + fill`. Negative provider values are not specially preserved or rejected. `fileLength` directly forwards the captured IO length call.

`eof` returns false for write mode or unequal position/fill without calling a provider. Otherwise it captures one IO pointer, calls its tell slot and then reloads its length slot from that same IO object. Both calls occur even if tell is negative. The result is true only when both results are nonnegative and tell is at least length. Mutating the handle's IO pointer during tell does not redirect the ensuing EOF length call.

## Seek, flush and buffer ownership

`flush` is an immediate success in read mode or with no pending write bytes. Otherwise it calls the IO write slot for the current pending range. A nonpositive result returns false. Any positive result clears both fill and position and returns true, even if it is smaller than the pending count. No loop is invented to finish a partial write.

Seek and buffer changes contain this same buffered-write branch at their own original call sites. A readable buffered seek then obtains the logical current position through the recovered tell path. It uses the original wrapping subtraction, sign test and unsigned distance comparisons to decide whether the target is within buffered data. Such a seek changes only position. The slow path captures the current IO pointer, clears position and fill before the provider seek call, and preserves the provider's signed32 return, including failure after those field mutations.

`setBuffer` repositions an unread read buffer before changing ownership. It rejects tell result exactly `-1`; other negative results still participate in the wrapping offset calculation. A zero provider seek result fails. Disabling an existing buffer frees it through the current global free function and clears the pointer. A nonzero requested size invokes the current global reallocator with the old pointer and unsigned size. A null result writes raw error **2** and fails, retaining any earlier write/seek effects. On success the returned pointer, requested size and cleared counters are written. The code does not assume that huge allocator requests can succeed on a browser or real machine; allocator replies are explicit fixture/host inputs.

Global realloc and free function targets come from `0x1436918a8` and `0x1436918b0`. The copy leaf is `0x1426079d0`. The native assertion following the minimum-sized copy is unreachable under the declared valid CRT ABI: the copied count was selected to be no larger than remaining bytes, and the callee preserves the relevant registers. Its four assertion-only starts are retained but not simulated as a normal path.

## State accessor and closure

The accessor at `0x14257bd90` resolves the TLS block using `GS+0x58` and unsigned TLS index global `0x143693a98`. It compares signed guard `0x1436919c0` with thread epoch at TLS `+0x20ec`. If the global is greater it calls the explicit CRT initialization-header leaf `0x1425a0588`. When the current global becomes `-1`, the recovered byte/dword/qword/default stores initialize global state at `0x1436918c0`, followed by initialization-footer leaf `0x1425a051c`. The exact stores include raw defaults `-1` and `0x102`; their meaning is not expanded into an invented mutex implementation. Poisoned initial memory verifies both overwritten fields and untouched padding.

Close always locks state `+0xa8` through explicit CRT mutex leaf `0x1425a3b80`. A nonzero lock result reaches native throw helper `0x1425a3dfc` with code **5**. A mutex count of `INT32_MAX` at mutex `+0x4c` is first changed to `INT32_MAX-1`, then reaches that helper with code **6**. `native-exception` records the pre-throw boundary, not delivered C++ exceptions, unwinding or OS behavior.

The list helper searches read-list head state `+0x50`, then write-list head `+0x48` only if not found. It captures the matched handle's IO and buffer before provider calls. For write handles it flushes pending bytes and then invokes the optional current IO flush slot. Failure leaves the handle registered and the outer close unlocks and returns false. On success it calls the current destroy slot through the captured IO, frees the captured nonnull buffer, reloads the handle's next pointer, unlinks head or predecessor and frees the handle. The global free function target is reloaded at each call. Destroy/free callback mutations can therefore affect the next pointer and subsequent allocator target without changing the earlier captured IO or buffer.

The outer function unlocks through `0x1425a3b88`. No match writes raw error **9** after unlock; a failed flush does not overwrite the existing error. Success returns one. The tests include a returned write failure followed by a successful close retry over the still-registered handle. Missing runtime leaves are different: a stop may occur after destruction, freeing or unlinking, and is neither transactional nor a continuation or retry protocol.

Raw errors are dword writes to the resolved TLS block `+0x20e4`. Their numeric values and write timing are observed. This port does not implement error-string lookup, OS error mapping or all embedded PHYSFS error behavior.

## Original-instruction verification

Portable Unicorn **2.1.4** executes the original windows, including the engine read wrapper, all selected handle functions, close helper and raw global initializer. The harness checks every visited instruction start and size against the retained bytes. Individual provider, standard copy, realloc/free, mutex, once-guard and native-throw leaves are declared. No complete read, seek, close, buffer-state or handle-list result is hooked.

There are **225 vectors**: 199 finish with a native return, 24 stop at a missing individual service and two stop at native throw boundaries. A combined nine-operation fixture changes buffering, reads through the actual engine wrapper, inspects position, seeks within the buffer, reads again, disables buffering with provider reposition, performs a direct read, checks EOF and closes. Other cases distinguish partial errors, callback field/function mutations, pointer capture, aliases, signed64 wrapping and all tested mutation-before-failure effects. Forty deterministic additional buffered-read inputs use independent supplied byte payloads.

**521 of 527 mapped starts** execute. The six unvisited starts are the four minimum-copy assertion starts and two `INT3` instructions after the nonreturning throw-helper calls. Full-window capture, mapped starts and visited starts are separate counts. There are 24 declared hook addresses, 21 visited. Supplied service responses, valid memory extents, native pointers, TLS/guard values and IO bytes are test inputs, not observed installed-game runtime state.

The scoped Vitest suite passed **225/225** cases. It compares returned values and exact stop identities, ordered callback targets and arguments, and byte snapshots of handles, IO objects, buffers, destination, global lists/default state, allocator targets, TLS errors and guards. Provider response writes are explicit external inputs; the tested TypeScript must compute the caller's subsequent control flow and mutations. A strict scoped ES2022 TypeScript check with `noUncheckedIndexedAccess` passed for source and test. No full application check or build was run by this slice.

Frozen source SHA-256: `be49f5373ad5871edb2f026278e7ddc96de909876832726072e5964489554e4b`.

Frozen test SHA-256: `7c00125b9a41cc81e958773cab811125f73f5f184db9c55889d56b4279631c49`.

Reference SHA-256: `bbd67fb32ec3bb47f2940aa8a91b0213034d65384675965bcf0453598696854e`.

## Remaining file-system dependencies

The initial dependency inventory also inspected actual `openRead 0x14257a500`, `stat 0x14257b540` and engine opener `0x142562430`. These are deliberately outside this supplied-handle port. Open/stat require path conversion/acceptance helpers `0x14257ea30`, `0x14257ec90` and, for stat, `0x14257e990`, mount-linked traversal, allocator behavior and archive/directory vtable implementations. The engine opener additionally handles mode dispatch, error-message/result storage, diagnostics and object allocation. Their complete semantics were not replaced by constant answers.

The custom PHYSFS enumerate ABI, version/license discrepancy and candidate upstream provider are documented in [NATIVE_PHYSFS_PORT.md](NATIVE_PHYSFS_PORT.md). Matching a version string or porting these exported IO callers does not prove that the candidate library implements the native fork's mount lookup, archives, metadata or custom callback ABI. Connecting native mounting, effective file resolution and handle construction to a browser provider still requires recovery and integration evidence. This slice performs no actual PHYSFS mount, Windows file access, archive read, DLL load or original-game execution.
