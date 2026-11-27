# Composed original research initialization

`initializeNativeResearch` now has a comparison against one uninterrupted execution of the original `0x140F60650` caller. This combines the recovered constructor, slot preparation, graph linking and root status paths. It does not initialize a world from installed technology text or establish full research gameplay parity.

The oracle enters `0x140F60650` once per case and runs to its actual return or an explicitly unavailable service. It does not hook `F4F4F0`, `F4F5D0`, `F615C0`, `F5D0B0`, `F5B910`, `F53500` or `F54690`. Constructor and graph output comes from the original instructions. The JavaScript comparison calls the public composed wrapper, using the same raw memory contract and shared allocator for the two dependency sets.

## Original identity and evidence

- Executable: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`.
- SHA-256: `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`, 56,535,160 bytes, preferred image base `0x140000000`.
- Generator: [emulate_initialization.py](../../work/iron-meridian/native-initialization/emulate_initialization.py), Unicorn 2.1.4, target bytes extracted directly using the PE section table.
- Reference: [reference.json](../../work/iron-meridian/native-initialization/reference.json), SHA-256 `6f307b6d313a727fce2a0b70f83e5475790b8a3674132c59bc6d32a7afe8d382`.
- Retained code: 49 windows, 20,493 bytes. Every window has an exact file offset, exclusive end and byte hash. LLVM disassembly is retained beside the reference.
- Execution: 2,270 distinct original instruction starts. [verify.py](../../work/iron-meridian/native-initialization/verify.py) independently checks the target, range, generator, inherited generator and corroborating export hashes, and checks that every visited native start appears in the retained LLVM disassembly. Results and readable per-case state summaries are in [integrity.json](../../work/iron-meridian/native-initialization/integrity.json).

The generator extends the earlier constructor and graph fixture setup in a new owned directory. Its metadata records those two generators' identities. It never imports or rewrites their reference files.

## Compared behavior

There are 29 cases: 15 returned and 14 runtime stops. Completed cases cover an empty database, inactive entries, active states with slots, inactive holes, maximum-level status, parent/child and prerequisite links, all four reference groups, locale comparison, constructor filtering followed by graph propagation, label publication, and null state allocation. Partial cases cover unknown or inactive additional definitions, absent constructor services, and graph-only absent allocation, release or condition services after construction and slot preparation have already executed. A condition callback mutates the owner before a missing profile-exit stop, and the earlier mutation is preserved.

Each comparison checks owner bytes, every allocated byte including padding, allocation requests and results, ordered scalar/SIMD write effects across external calls, service arguments, and 24 initialized condition-context fields. Graph lookup executes the original hash/string/table bodies over actual declared raw pointers and records. The six constructor registry lookups remain individually named service leaves. No whole constructor, eligibility, graph or status result is supplied by a fixture hook.

The runtime leaves remain individually named: allocator/release entry points, the six constructor registry services, trait and condition virtuals, TLS guard/allocator/format services, condition-owned vector cleanup, profile entry/exit, and locale comparison. Memory-copy and fill hooks implement their byte operations directly. The reference metadata lists every target and fixed early-stop boundary. Graph-only missing leaves model the public wrapper's separate service bags without substituting a graph function result.

## Stack reuse regression

The initial composed test failed one case while the prior constructor and graph suites passed. In `complete-constructor-filter-and-graph`, the second constructor copied first-vector record padding as `a7a7a7a7`; the original caller copied `00000000`. The failing output is preserved in [vitest-first.log](../../work/iron-meridian/native-initialization/vitest-first.log).

The exact original cause is recorded as `iteratorEndStores` in that case:

| Instruction | Stack address | Stored bytes |
| --- | --- | --- |
| `0x140F4FBFC` | `0x71FD98` | `4027250000000000` |
| `0x140F50148` | `0x71FD98` | `8046250000000000` |

These stores write the filtered and direct-object iterator ends to constructor frame `+0x38`. Their upper dword overlaps the first record's padding at frame `+0x3C`. A later constructor reuses that frame. The correction preserves the six native iterator initialization stores, in original order, around both blocks: `+0x48`, `+0x50`, `+0x59`, `+0x30`, `+0x38`, `+0x41`. The input padding and comparisons are unchanged.

## Validation and boundaries

Fresh scoped validation passed 176 cases: 66 constructor, 81 graph and 29 composed cases. [vitest.log](../../work/iron-meridian/native-initialization/vitest.log) records the run. Strict scoped TypeScript checking with unused locals and parameters enabled also passed. The parent owns full application checks, browser validation and independent review of the composed wrapper and stack correction.

All definitions and runtime services here are explicitly synthetic raw-memory contracts, not captured native-effective installed definitions. An active byte in a fixture does not establish authentic world initialization. The proof covers ordinary initialized TLS and valid readable/writable structures. Saved-register and return-address stack traffic, arbitrary aliasing into unmodeled compiler scratch, unsupported native faults, resource-backed eligibility/cost branches, owned condition-object destruction, UI slot-change handling and shrink/unassignment still retain their documented boundaries in the underlying ports. The composed path does not apply daily progress or execute technology completion effects.

The new graph tail receives the unchanged `context.frameBase` as its post-slot-preparation stack pointer. The previous `initializeResearchStates` entry keeps its explicit graph boundary so its earlier isolated oracle evidence retains the same contract.
