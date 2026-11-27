# Native open-read and path acceptance

This slice translates native `PHYSFS_openRead 0x14257a500`, path conversion `0x14257ea30` and mount/path acceptance `0x14257ec90` through construction and registration of a returned PHYSFS file object. It uses valid supplied mount memory and individual provider/CRT/allocator/mutex leaves. The actual mounted provider and its IO object remain explicit inputs. No whole PHYSFS opener, exported stat operation or path-acceptance result is mocked.

Recovery target: `hoi4.exe`, 56,535,160 bytes, base `0x140000000`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. All original reads are read-only. There was no game/DLL execution, installation change, browser/server, Ghidra-project access or full application check/build by this lane.

The implementation and tests are preserved under [native-file-open](../../work/iron-meridian/native-file-open/). Tested copies are promoted to [file-open.ts](../../src/games/iron-meridian/native/file-open.ts) and [native-file-open.test.ts](../../tests/games/iron-meridian/native-file-open.test.ts), with imports adjusted only. `verification.json` records all source, staged-copy, test, reference and report identities. The existing [file I/O slice](NATIVE_FILE_IO_PORT.md) remains unchanged and supplies read/seek/buffer/close behavior for the new lifetime vectors.

## Concrete API

`new NativeFileOpen(memory, dependencies, gsBase)` uses the existing `NativeFileIoMemory` byte/dword/qword interface. It exposes:

```ts
openRead(pathPointer, workspace): NativeFileOpenResult;
convertPath(inputPointer, outputPointer): NativeFileOpenResult;
acceptMountPath(mountPointer, pathPointerSlot, allowMissing, statOutput): NativeFileOpenResult;
```

Pointers and count arithmetic use unsigned64 `bigint`. Returned pointer/boolean values use `bigint`. The public raw helper supports both `allowMissing` values; the original opener supplies zero. `workspace` contains `stackHeader`, `pathPointer` and `stat` addresses for host-owned temporary memory. The stack header has space for the header plus the calculated temporary bytes; the path pointer slot holds one qword and the stat output has 40 bytes. A valid nonnull stack workspace and valid bounded native objects, strings, callback ABIs and acyclic mount/list links are required. Unrelated machine-register spills, stack exception metadata and arbitrary invalid memory are not translated. The isolated vectors choose native temporary addresses so callback arguments can be compared exactly; projected temporary bytes are diagnostic work-state observations.

Dependencies extend `NativeFileIoDependencies` with:

| Leaf | Contract |
| --- | --- |
| `allocate(target, bytes)` | One allocator call through global `0x1436918a0` |
| `openRead(target, opaque, path)` | One selected archiver/provider read-open slot; returns an IO object pointer or zero |
| `stat(target, opaque, path, output)` | One selected provider stat slot; writes explicit output/error bytes |
| `comparePrefix1425ceb80(left, right, count)` | Standard CRT bounded byte comparison |
| `findSlash1425c3c70(path, 47)` | Standard CRT C-string search |
| `probeStack1425a07d0(bytes)` | CRT stack probing for the small temporary allocation |

The inherited leaves cover free, IO destruction, mutex lock/unlock and the CRT once-header/footer. Provider and allocator callbacks may mutate supplied memory. Missing callbacks return an explicit `runtime-required` boundary with target and original call site, preserving prior effects. Such stops are not transactional or retry-safe. `native-exception` and `native-assertion` record the pre-runtime throw/assert boundary; C++ unwinding, CRT abort and OS exception delivery are not implemented.

## Chosen original closure

| New entry | Exclusive end | Bytes |
| --- | --- | ---: |
| `0x14257a500` | `0x14257a807` | 775 |
| `0x14257ea30` | `0x14257eaee` | 190 |
| `0x14257ec90` | `0x14257eeb7` | 551 |

The new windows contain 1,516 original bytes and 409 decoded starts. The oracle also maps the frozen 1,912-byte supplied-handle closure, including the complete state accessor at `0x14257bd90`. Its CRT guard/default-store behavior is translated again in the opener module while the reviewed file-I/O module stays frozen. This is the same recovered accessor, not a new global-state assumption.

Fourteen retained windows total **3,428 bytes and 936 mapped starts**. `collect.py`, disassemblies and `instructions.json` bind every range to the original PE. The emulator rechecks all hashes and decoded bytes, then rejects execution outside mapped starts and declared individual leaf hooks. Ghidra C from `exports/platform`, `exports/file-open` and `exports/links-and-io` aided interpretation. Original instructions resolve inferred prototype and failure-path ambiguities.

## Opener control flow and mutations

Null input writes raw TLS error **9** and returns zero before accessing global mount state. Otherwise the state accessor resolves the actual global at `0x1436918c0`. The opener captures byte state `+0xfa` once. A zero byte locks mount mutex state `+0x58`; the captured byte also determines later unlocking, even if a callback changes that global byte. The state `+8` mount-head qword is checked before measuring or converting the input path. No mounts writes raw error **11** and returns zero.

Temporary size is the C-string input length plus raw state `+0x40` plus one. The value is compared with 512. A smaller value uses stack probing and temporary workspace; otherwise the current allocator receives size plus eight. The first qword is a stack/heap marker. The maximum-root field is reloaded after allocation before locating the converted path within that temporary memory. A null heap temporary writes raw error **2**, unlocks when required and returns zero.

The converted path is tried against mount nodes in their supplied linked order. Each iteration resets the path-pointer slot before running the actual acceptance helper. An accepted mount uses its current archiver table `+0x28`, open-read slot table `+0x40`, opaque pointer node `+0` and the current rewritten path-pointer slot. A zero provider result advances through the node's reloaded next pointer `+0x30`. Neither active selections nor effective mount order are inferred from these fixture nodes.

A nonzero provider IO pointer leads to a separate 64-byte file-object allocation. On success the opener zeroes all 64 bytes, writes IO at `+0`, byte read mode `1` at `+8`, supplying mount at `+0x10`, then resolves state again. It locks the open-file mutex state `+0xa8`, reloads read-list head state `+0x50`, writes that head at file `+0x38`, installs the new head and unlocks. The initial buffer pointer, capacity, fill and position stay zero. The current outer lock is released according to the captured byte, and the temporary marker is read after that unlock to decide whether to invoke the current free function. Callback mutation cases distinguish these reload points.

### Observed handle-allocation failure

The original handle-allocation null branch does **not** return safely. It invokes the IO destroy slot, writes raw TLS error **2**, and falls through to `MOVUPS [RDI],XMM0` at `0x14257a707` with `RDI=0`. The translated result records:

```ts
{ kind: 'native-memory-fault', nativeAddress: 0x14257a707n,
  address: 0n, access: 'write', bytes: 16 }
```

Four isolated vectors reach this instruction, including heap temporary and callback-mutated destroy/TLS targets. Unicorn reports its first 8-byte internal write access for this 16-byte MOVUPS instruction; `faultObservations` retains both widths. This establishes the original null-write attempt over the fixture's unmapped zero page. It does not execute the Windows process or claim OS exception/unwind behavior. Prior IO destruction/error writes remain, and later unlock/free operations do not occur in these vectors. The port preserves this boundary instead of inventing a null return or repairing the native code.

## Exact path converter

The converter strips leading slashes, collapses repeated slashes and removes trailing slashes. It rejects colon and backslash with raw TLS error **23**. Bytes are preserved without case folding, locale conversion or UTF-8 decoding, including high bytes. Rejection can leave a partially written output buffer.

Its dot-component branches are significant. A whole remaining input of `.` or `..` is rejected at entry. A component terminated by slash is rejected when it equals `.` or `..`. The final component is not checked by that slash branch: **`a/.` and `a/..` pass**, while `a/./`, `a/../` and corresponding intermediate components fail. Original-instruction vectors distinguish these cases and in-place conversion. Browser source capture's stricter relative-path policy remains a separate adapter; this converter is not substituted into that UI policy.

## Exact mount acceptance

The node layout used here is opaque/provider data at `+0`, optional mount-point C string `+0x10`, optional root C string `+0x18`, root byte count including NUL at `+0x20`, archiver table at `+0x28` and next at `+0x30`.

An empty path with a null root returns true immediately, before mount-point matching or provider stat. A nonnull mount point must have C-string length greater than one, otherwise the original assertion leaf is reached with line `0x826`. The helper compares its first length-minus-one bytes, checks the slash boundary, then strips the matched prefix and updates the pointer slot. A mismatch writes raw error **11** and returns false.

A root is copied into reserved bytes before the remaining path, with slash insertion when that path is nonempty, and the pointer slot is updated. Raw state byte `+0xf9` bypasses subsequent per-component checks when nonzero. Its actual runtime value and policy are supplied state.

Otherwise the helper captures the current TLS-array entry address, searches each slash, temporarily replaces it with NUL and calls the current provider stat slot table `+0x68` with a reused 40-byte output. It reads only the signed dword at output `+0x20` when stat returns nonzero. Raw type **2** restores the slash, writes raw error **12** and rejects. A stat failure with raw TLS error **11** rejects an intermediate component for the opener's zero `allowMissing` flag; a missing final component is accepted so the provider opener can decide. Other stat failure codes do not reject by this branch. The slash is restored before normal continuation or rejection.

The not-found check reloads the block pointer from the captured TLS-array entry, even when a callback changes the global TLS index. Final error writes resolve TLS afresh. Vectors distinguish both the captured entry address and its mutable block pointer. Successful stat with untouched type bytes reads the supplied bytes; no default type is invented by the translator.

## Verification and composition boundary

The scoped suite has **213 passing cases**: 191 end with a return, 12 at a missing individual runtime leaf, four at native throw boundaries, two at the mount-point assertion and four at the null-write boundary. Cases compare values, exact stop identities, ordered callback targets/arguments and live pointed-to path bytes, then byte snapshots after each operation. Inputs include explicit provider replies, mutations and valid memory; these are not observations of an active installed-game filesystem.

All **62 converter starts and 152 acceptance starts** are visited. **190 of 195 opener starts** are visited. The five remaining starts are the small-size alignment-overflow fallback, invalid-null-stack fallback and post-noreturn padding. They are outside the valid nonnull stack/CRT ABI contract. The combined oracle visits **702 of 936** mapped starts; the remaining frozen I/O branches retain their separate 225-case verification and are not claimed covered by these opener vectors.

Two sequences execute original **open, read, tell/EOF and close**, with one enabling a buffer, reading, repositioning while disabling it and closing. The tested TypeScript composes the new opener with unchanged `NativeFileIo`. Strict scoped ES2022 TypeScript checking with `noUncheckedIndexedAccess` passes. The staged suite uses its own Vitest configuration, without altering the application's configuration. Artifact hashes and exact commands are in `verification.json`.

A future loader adapter can compose a valid recovered mount/context memory image, these open-read callers and `NativeFileIo` with a concrete provider. That provider must implement the actual archiver open/stat and IO read/seek/length/destroy leaves, allocator ownership, synchronization and error updates. Browser File/Blob reads are asynchronous; this native boundary is synchronous, so a concrete worker provider must supply accessible bytes or another verified bridge. Current base-loose inspection continues to use its declared captured Blob model.

Native mount/context construction, active mount selection, exported `PHYSFS_stat`, underlying archive/Windows providers and the custom enumeration ABI remain separate work. The inspected helper `0x14257e990` was not required by this opener closure and was not expanded into another port. [NATIVE_PHYSFS_PORT.md](NATIVE_PHYSFS_PORT.md) retains the upstream-candidate/version/license limitations. Completing the opener caller does not establish complete native-fork equivalence or a playable campaign.
