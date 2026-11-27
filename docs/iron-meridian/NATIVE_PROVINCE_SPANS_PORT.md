# Native province spans and wrapped region centers

[province-spans.ts](../../src/games/iron-meridian/native/province-spans.ts) extends the recovered rectangle helper into the actual province-span initializer at `0x140ab0cd0`. It also translates complete region-center helper `0x140b0ee30`. It uses explicitly supplied native memory, ID pixels, runtime objects and allocator services. The current browser raw-world adapter does not call this initializer and does not construct its native-effective inputs.

Target SHA-256: `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`, installed executable 56,535,160 bytes. The original game process and DLL entrypoints were not run.

## Recovered sequence

`initializeNativeProvinceSpans(memory, manager, { gsBase, frameBase }, services)` enters the recovered initializer. `frameBase` is its post-prologue RSP, rather than a generated object address. TLS is resolved through the supplied GS area and the actual raw TLS index, including the reload after scratch allocation and cleanup-registration callbacks.

The sequence creates the scratch scope, reserves aligned province-seen bytes and coordinate storage, walks the row-major 16-bit province-ID plane, updates aligned province rectangles and appends six-byte horizontal spans. It retains native capacity growth, binary32 multiplication, signed conversion, truncation to 16-bit span fields and publication order. A new span is written before existing spans are copied and their allocation is released. Counts, pointers and allocator targets are reloaded where the instructions reload them.

After pixel collection, the caller invokes region-center updates and then region polygon refresh. The completed center helper reads supplied province associations, compares ordinary and horizontally shifted bounds, chooses the narrower result, wraps its center and stores center/extent fields. Its raw dword arithmetic includes negative values and wraparound.

Normal completion restores the original scratch cursor. A missing runtime service or unported branch preserves preceding effects and returns an explicit stop. These are partial execution results, without rollback or a resumable continuation.

## Exact remaining stops

| Branch | Boundary |
| --- | --- |
| Missing allocator, release or cleanup registration | Actual resolved leaf target |
| Missing thread-record runtime lookup | `0x142556800` |
| UI-thread time query | `0x1425a548c` |
| Nonnull aggregate progress object | `0x1422cb360` |
| UI progress virtual call | Resolved virtual `+0x60` target |
| Nonempty polygon registry | First `0x141640c60` call |
| Native assertion | `0x14254ab40` |
| Triggered missing-pixel, large-box or small-province diagnostic | First logging helper `0x14254bce0` |

The polygon and progress helper bodies have been decompiled for further porting. This implementation does not supply a successful whole-progress, whole-polygon or whole-map callback result. It does not claim native image/color conversion, effective world construction, state/history parsing, adjacency, projection, renderer or campaign initialization.

Inputs require mapped extents, valid pointers/IDs/capacities, bounded allocation sizes and nonoverlapping CRT-copy ranges. External allocator and thread-runtime behavior is explicit. Native saved-register traffic and unrelated stack spills are outside the exposed memory contract. Host memory errors propagate.

## Original instruction checks

[emulate.py](../../work/iron-meridian/native-map-spans/emulate.py) verifies executable identity, independently disassembles retained bytes with LLVM and executes original instructions with Unicorn 2.1.4. Fourteen windows total 7,053 bytes; 812 distinct original instruction starts execute across 170 cases. Those are retained windows and visited starts, not full-function coverage. The main selected window excludes its final trap padding byte.

The oracle runs the actual span initializer and helpers together, and runs the complete center helper directly for varied raw regions. It hooks only declared allocation, free, cleanup-registration, thread-record and CRT byte-copy/zero leaves. Unsupported branches stop at original call addresses. No hook returns the entire span list, bounds, center or initializer result.

The 170-case suite compares calls and their arguments, all province objects, used span buffers, allocations, scratch bytes and semantic write/call ordering. Ordered traces are retained in [traces.json](../../work/iron-meridian/native-map-spans/traces.json); normalized trace hashes bind them to the smaller imported fixture. Cases cover alternating runs, preallocation and growth, preexisting spans, cold scratch, signed region arithmetic, wrapped regions, callback mutations, partial failures and diagnostic/progress branches. The expected values come from instruction execution.

Independent review found three defects: a captured TLS block was reused after callbacks changed TLS selection; decompiler pseudocode suggested a timestamp write which the non-UI instruction branch actually skips; and the span allocation size omitted zero extension after the native ESI write. All were corrected. The first two regressions preserve a fixed snapshot and an explicitly reconstructed earlier variant made by reversing only those changes. That reconstructed variant fails four checks; these are reconstructed regression results, not a claim that the initial implementation was run before correction. The third defect was reproduced against the actual pre-fix source using allocator-boundary stops, without attempting huge allocations. All 33 independent checks pass after correction. The [review report](../../work/iron-meridian/native-map-spans/review/REVIEW.md) binds the reviewed source, independent ranges and parent trace hashes, with no remaining material finding inside its stated memory/runtime scope.

```powershell
C:/Python314/python.exe -B work/iron-meridian/native-map-spans/emulate.py
npx.cmd vitest run tests/games/iron-meridian/native-province-spans.test.ts --reporter=dot
```

The initial full TypeScript check found optional-service narrowing and inferred empty-array type errors in these new files. They were corrected, and scoped strict checking passes. Full integration verification is recorded separately in [NATIVE_VERIFICATION.md](NATIVE_VERIFICATION.md). No commit, push or deployment occurred.
