# Native research construction port

[research-construction.ts](../../src/games/iron-meridian/native/research-construction.ts) translates the recovered slot constructor `0x140F4F4F0`, state constructor `0x140F4F5D0`, slot-growth path `0x140F615C0`, and initial construction phase of `0x140F60650`. It writes raw objects and containers in native order. Registry, allocator, TLS and virtual condition services remain named dependencies. No dependency supplies a completed research constructor result.

This extends the [update recovery](RESEARCH_UPDATE_RECOVERY.md). It does not turn installed text definitions into native-effective technology definitions or complete the research object graph.

## Bound executable and oracle

The original input is `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`, 56,535,160 bytes, preferred image base `0x140000000`, SHA-256:

```text
709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148
```

[emulate_construction.py](../../work/iron-meridian/native-construction/emulate_construction.py) verifies that identity, extracts original bytes and LLVM disassembly, hashes each range, and executes the native constructor bodies in Unicorn 2.1.4. [reference.json](../../work/iron-meridian/native-construction/reference.json) records 27 ranges totaling 9,038 bytes, the generator identity, corroborating instruction-export identities, named service hooks, raw input writes, actual constructor writes and call order, partial results, and final object/allocated bytes.

The original `0x1401B7950` range includes its native jump-table data. Compiler unwind fragments alone are not used to truncate the constructor bodies. Reconstructed C and instruction exports under artifact `exports/construction`, `startup-closure`, `integration-closure`, and `full-export` corroborate the original executable instructions.

The oracle's input records are explicitly synthetic raw-memory contracts. Their definition structures and registry results are not captured native-effective installed definitions. They establish translation behavior under the declared services and memory, not native world initialization or a working game session.

## Constructor contracts

Both constructors require valid mapped destination storage and an already valid owner/definition/runtime contract. Destination bytes start poisoned in the oracle, so untouched padding is preserved rather than silently zeroed. `ResearchConstructionContext.tlsBlock` identifies the actual TLS layout expected by the recovered instructions. `frameBase` is the native constructor's post-prologue RSP and supplies scratch storage and residue; it is not a generated object layout.

`constructResearchSlot` performs the complete recovered slot-body flow when its required TLS formatting and allocation services are supplied:

1. The base helper `0x142540E30` writes dword `object+8 = 0x165`.
2. It writes owner `+0x10`, vtable `0x1429F1810`, zero bank/transfer fields `+0x20/+0x28/+0x30`, qword `+0x38 = 100000`, null active state `+0x18`, and the supplied dword index `+0x40`.
3. If global string length `0x143129E80` is zero, it calls the named TLS formatting service `0x1422AEAB0` with the actual `RESEARCH_NO_RESEARCH` format address `0x1429F2050`. The recovered string move/publication logic then releases old storage, writes global `0x143129E70`, and clears the temporary in native order. The formatter body is not claimed to be ported.
4. It writes final ID dword `object+8 = 0x2A4E` and returns the object pointer.

`constructResearchState` follows the full recovered state-body flow under the named services:

- It preserves the base helper write and installs vtables `0x1429F17A0` and `0x1429F17F0`, allocator pointer `0x1430FD000`, zero vector headers, and the native repeated TLS guard checks. Cold guard acquisition, allocator initialization, and guard release are separate dependencies at `0x1425A0588`, `0x1425A0450`, and `0x1425A051C`.
- It binds owner `+0x158` and definition `+0x160`, clears parent/status/progress fields, installs static pointers `+0x178/+0x188`, writes dword `+0x180 = 0x29C77F8`, and copies definition ID `+0x3C` into object `+8`.
- The direct `0x140670130` path allocates a 48-byte tree sentinel. The constructor writes three self-links and word `+0x18 = 0x0101`, then publishes it at state `+0x1B0`. This is an allocated native tree header, not a null stand-in.
- It initializes state `+0x1C0/+0x1C8`, constructs `+0x1D0`, writes byte `+0x1E8`, copies packed reference global `0x1433EB2A0` to unaligned `+0x1EC`, and writes dword `+0x1F4 = 0x4C17`.
- It reserves and populates definition-backed vectors for reference groups `+0x248`, `+0x260`, `+0x278`, `+0x290`, `+0x2A8` and `+0x2C0`, including active-byte gates, virtual trait/condition calls, filtered iteration order, string temporaries, and registry fallback-address arguments. Definition `+0x380` references are validated in order.
- It copies dword keys from definition `+0x368/+0x374` into state `+0x140/+0x14C` through the recovered resize/copy sequence.

The first 16-byte output record contains an eight-byte resolved pointer, a dword key, and four bytes copied from a native stack temporary. Those four bytes remain explicit scratch input. The port reloads that temporary after an allocation callback, matching the native load order. It does not invent a semantic value for the padding. SIMD and scalar stores are compared as ordered byte effects across service calls.

Vector growth uses the original binary32 conversion/multiplication and signed `CVTTSS2SI` behavior, including the indefinite integer on overflow/NaN, followed by the native signed minimum-capacity comparison. Append growth writes the new item before copying/releasing old storage, resets count before the release callback, then publishes pointer/capacity/count. Named callbacks can observe and change raw memory, so this ordering is retained.

The direct helpers `0x140CF4FA0`, `0x14100F620`, and the relevant `0x1401B7950(0x21)` branch determine the visibility gate. Their whole results are not fixture callbacks. Short/heap strings, aligned large-string storage, ownership moves, and native invalid-parameter/length-error stops retain their raw byte and allocation effects.

## Orchestration bounds

`prepareResearchSlots` reads desired count directly from country dword `+0x1348`, as `0x14073B4F0` does. It supports unchanged counts and growth, allocating 72-byte slots, executing the recovered slot constructor, and appending actual pointers to owner `+0xA0/+0xA8/+0xAC/+0xB0`. A null slot allocation is appended as the original code does. Shrink stops before unresolved assignment/destruction at `0x140F60170`. A changed count with nonnull UI global `0x1433DDB10` stops before the first UI virtual call at `0x140F6177B`.

`initializeResearchStates` follows `0x140F60650`: it checks existing owner count `+0x94`, writes owner country ID `+0x138`, resolves the real definition-database pointer, performs the recovered pointer-vector resize/zero fill at `owner+0x88`, and uses direct `0x140B1EA30` index/fallback behavior. For each active definition byte `+0x40`, it allocates 504 bytes and executes the actual state constructor. It then runs slot preparation.

If a nonnull constructed state is present, initialization stops at `0x140F5D0B0`, before research graph linking. Root evaluation and propagation through `0x140F5B910`/`0x140F53500` have not been ported here. A created raw object is therefore not reported as a completed native-effective world. Empty/inactive definition sets exercise orchestration branches but are not offered as installed-game initialization evidence.

## Remaining services and stops

Named registry leaves are `0x1406C6970`, `0x140705890`, `0x140A34120`, `0x140A34020`, `0x140B1A1E0`, and `0x140B1A2E0`. Their direct wrapper offsets and fallback arguments are translated. Allocator allocation/release, cold allocator TLS services, TLS string formatting, virtual trait activity and virtual conditions are explicit dependencies. No silent successful default is supplied when a required dependency is missing.

Condition context construction `0x14057BEE0` and cleanup `0x14057C5F0`/`0x14057C570` are translated for their recovered raw fields/storage paths. Nonempty condition-owned virtual destruction remains an explicit stop; a nonempty owned vector requires named `0x140201280` cleanup. A missing trait-registry singleton remains a stop before its unresolved initialization. Assertion, invalid string/allocation, missing-definition logging, slot shrink/UI and graph-link paths retain specific native addresses.

All stops preserve earlier object, allocation and owner-vector effects. They are not rollback or resumable continuations. Re-entering construction after a partial result can leak or repeat allocations. Mapped extents, nonnegative valid container lengths, valid service-provided objects and usable allocation results are caller preconditions. Host memory failures are not disguised as native success.

## Verification

Fresh scoped checks:

```text
npx.cmd vitest run tests/games/iron-meridian/native-research-construction.test.ts --reporter=dot
66 passed: 42 returned, 24 runtime-required
1,400 original instruction addresses visited
Narrow TypeScript strict/no-unused diagnostics: 0
```

Tests compare full poisoned destination bytes, all allocated bytes, owner bytes, allocation arguments, and one ordered sequence of field writes and service calls. Cases cover all definition groups, active/condition filtering, stack residue, short/long/aligned strings, native float growth, vector reallocation order, TLS initialization, missing service effects, slot growth/null allocation/shrink/UI boundaries, and state allocation before graph linking. Placeholder constructor and orchestration implementations were observed failing their raw-state tests before implementation.

The executable, original byte ranges, generator and referenced instruction exports were checked against their recorded hashes. Current oracle JSON SHA-256 is `59ba7584791925036b3568215100ba17f337ac4471d7623a6027fa0b21377fab`.

Independent review found that the first stack-backed record had been captured before allocation. An added original-instruction case mutates the record padding in the registry and allocator callbacks. It failed with `11111111` instead of native `22222222` before the fix and passed after moving the read. The scoped suite and narrow TypeScript check above were rerun after that correction.

Regenerate only owned artifacts with:

```powershell
C:/Python314/python.exe work/iron-meridian/native-construction/emulate_construction.py
```

No full build/check, browser, original game execution, Ghidra project access, installation or commit occurred in this slice. The subsequent [composed initialization proof](RESEARCH_INITIALIZATION_PROOF.md) extends the caller through graph linking and status propagation. Its cross-constructor stack-reuse regression required preserving twelve actual iterator scratch stores, without changing the isolated constructor input contract. The original 66 cases still pass. Independent review and the earlier callback-order correction remain separately recorded; the parent owns review closure.
