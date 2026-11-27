# Native exported stat caller

This slice translates exported `PHYSFS_stat 0x14257b540` and its mountpoint ancestor helper `0x14257e990`. It reuses the frozen `NativeFileOpen` converter and acceptance methods. The native target is the same read-only 56,535,160-byte executable, SHA256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. Completed source and tests were promoted with imports adjusted only; staged copies are preserved under `work/iron-meridian/native-file-stat/`. [file-stat.ts](../../src/games/iron-meridian/native/file-stat.ts) and [native-file-stat.test.ts](../../tests/games/iron-meridian/native-file-stat.test.ts) are the promoted files.

## Contract

```ts
new NativeFileStat(memory, dependencies, gsBase)
  .stat(pathPointer, outputPointer, workspace): NativeFileStatResult;
new NativeFileStat(memory, dependencies, gsBase)
  .mountAncestor(mountPointer, pathPointer): NativeFileStatResult;
```

Pointers and counts use unsigned64 bigint. The exported stat result is the signed interpretation of the original returned dword, represented as bigint, including non-boolean provider returns. The helper returns 0 or 1. Results use the existing opener's explicit returned/runtime-required/assert/exception union. A provider or host-memory exception propagates. The stat caller does not allocate or register a file handle.

Memory, dependencies and workspace use the existing `NativeFileIoMemory`, `NativeFileOpenDependencies` and `NativeFileOpenWorkspace` contracts. The output is a valid 40-byte caller-owned record. Workspace supplies nonnull temporary stack-header storage, a path-pointer slot and a distinct 40-byte acceptance-stat temporary. Stack storage must cover the header and calculated input/root-prefix bytes. Objects, bounded strings, extents, allocator results and callback ABIs must be valid, with acyclic mounts. Saved-register/exception traffic, unrelated spill bytes, invalid pointers, stack overflow and OS unwind are outside this translated memory contract.

The individual provider-stat callback receives `(target, opaque, path, output)`. Acceptance uses `workspace.stat` and may call it once per component. The final exported stat uses the caller's `outputPointer`. It must perform its own output/error mutations and return an explicit signed dword. No whole exported stat, path-converter, mount-acceptance or ancestor-result callback is supplied. Other named leaves are allocator/free, mutex, CRT prefix compare/slash search/stack probe and once-guard callbacks. Missing leaves stop at their original target and call site after preceding effects, without rollback or retry guarantees.

## Recovered behavior

Null path or output writes TLS error 9 and returns 0 without touching output or resolving global state. Otherwise, before state or locking, the caller writes four output qwords = -1, raw type dword +0x20 = 3 and readonly dword +0x24 = 1. Native offsets are hexadecimal here. Supplied output bytes are retained except where actual caller/provider stores change them.

The caller resolves the recovered state accessor, captures byte state +0xfa for its outer lock, and allocates path/root-prefix storage using the same 512-byte threshold as the opener. The temporary marker and state +0x40 are handled at the actual reload points. Temporary allocation failure writes fresh TLS error 2 and releases the captured outer lock when required.

Unlike the opener, it does not reject an empty mount list before path conversion. A converted empty path returns 1 with type 1; readonly becomes1 exactly when raw state +0x10 is null. A nonempty path with no mounts returns 0 while retaining the previous TLS error and initialized output defaults. There is no invented not-found write on that branch.

The ancestor helper checks optional mountpoint+10. Empty path returns true when that pointer is nonnull. Otherwise it measures both strings, rejects a path longer than the mountpoint or exactly one byte shorter, compares path-length bytes through the individual CRT leaf, then tests slash at that index through the reloaded mountpoint pointer. It compares raw bytes without case/locale/UTF8 conversion. A true ancestor in the exported caller writes only type 1 and readonly 1, returning1 as an artificial mount directory. Earlier failed-provider qword metadata remains intact.

For an ordinary candidate, the caller resets its path slot, invokes the actual acceptance helper with allowMissing0, then calls the current provider stat slot +0x68 with current opaque/path and the caller's output. Raw nonzero provider results stop traversal and retain their signed dword value. A zero result continues only when raw error 11 is found through the captured TLS-array entry address. That entry's block pointer is reloaded after callbacks; a changed global TLS index does not change the captured entry used by this test. Other zero/error results stop. The mount next pointer is reloaded after each attempted candidate, including success, before loop termination.

Outer unlocking follows the captured flag. The temporary marker and current free target are read after unlock. Provider, allocator, mutex and CRT/guard partial effects remain visible at explicit boundaries. The acceptance helper's symlink/error/slash-restoration behavior is inherited from the original instructions and tested in composition.

## Original-instruction validation

Five retained windows total 1,860 bytes and 487 decoded starts: state accessor 280 bytes, converter190, acceptance551, exported stat686 and ancestor153. All original bytes and disassembled starts are target-bound in `instructions.json`. `emulate.py` executes the original instructions with Unicorn 2.1.4 and rejects undeclared PCs; only individual provider/allocator/mutex/CRT/guard leaves are hooked.

The promoted suite passes 141 cases: 125 returned, 12 missing-runtime boundaries, 2 mutex throw boundaries and 2 native mountpoint assertions. It compares raw values, exact stop target/callsite, callback target/argument order, live pointed-to path bytes and memory snapshots. Input replies/mutations are supplied host services, not observations of an active game filesystem. There is no whole-stat hook.

Coverage is 480 of 487 mapped starts. All 47 ancestor, 62 converter and 46 state starts execute. Stat executes 177 of 180 starts; the remaining three are the small-size alignment-overflow fallback, invalid-null-stack fallback and post-noreturn padding, outside the valid bounded nonnull workspace contract. Acceptance executes 148 of 152 starts: its four empty-path/null-root early-return starts are not reachable through this stat caller, which handles an empty converted path before acceptance. The frozen opener's independent helper coverage remains separate evidence.

Cases distinguish root readonly behavior, no-mount error preservation, exact/ancestor/mismatched mount prefixes, high bytes and case differences, root prepending, partial metadata followed by synthetic-directory success, provider return signs, error 11-only fallback, current table/opaque/next/allocator/free reloads, captured TLS-entry behavior, mutex/frozen state, 512-byte allocation boundaries, missing leaves and assertions. Final output and acceptance scratch records stay separate.

An initial extra fixture put a supplied acceptance type four-byte seed one 16-byte stack allocation too low. The original instruction runner correctly demanded an undeclared second provider reply, exposing the wrong fixture address. Correcting that fixture address made the intended supplied-type branch reject a link; no implementation or expected arithmetic was changed to force a pass.

Both staged and promoted scoped Vitest pass; promoted strict ES2022 TypeScript with noUncheckedIndexedAccess passes. Exact commands and hashes are in [verification.json](../../work/iron-meridian/native-file-stat/verification.json). No full compiler/build, browser/server, Ghidra-project access, original game/DLL execution, installation write, commit/push/deploy occurred. The parent owns application integration and full checks.

Actual mounted-provider construction, active DLC/mod selection, archive/Windows/custom native-fork ABI behavior and browser asynchronous byte delivery remain explicit integration work. A browser byte provider may compose this caller with an explicitly supplied captured-base mount image; that does not establish the installed game's effective runtime mount selection or complete native/game parity.
