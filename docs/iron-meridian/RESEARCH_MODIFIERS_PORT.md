# Recovered daily research modifiers

The daily caller path of native `0x140F537E0` is translated in [research-modifiers.ts](../../src/games/iron-meridian/native/research-modifiers.ts). It produces the two modifier values consumed by the previously recovered `0x140F53350` arithmetic. It reads raw state, vectors, records and globals through an explicit memory interface. It no longer requires a caller to supply the complete output of `0x140F537E0`.

This is a recovered implementation slice. There is no adapter from shipped content or a saved game to this state layout, no original game runtime observation, and no integration with the earlier fictional simulation. The full game port remains unfulfilled.

## Evidence and scope

- Source file: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`.
- Source SHA-256: `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`.
- Image base: `0x140000000`. Addresses below are preferred virtual addresses, not offsets in a live process.
- Main recovered range: `[0x140F537E0, 0x140F5436D)`, 2,957 bytes, file offset `0xF52BE0`, SHA-256 `9538379bbe8ae9e1906dfd722580123d8f00a1d2d05489c073298aff0dc5240e`.
- Invocation: original `0x140F53350` supplies `arg2 = state[0x1E8]`, `arg3 = 0`, an optional-value tuple whose flag byte is zero, and a null tooltip argument. Other invocation paths are outside this translation.
- Decompiled C was read from the parent's `exports/refined`, `exports/research-closure` and `broad-analysis/prepass` artifacts under `C:\Users\charlie\artifacts\hoi4-native\709f916afbebcfe6`. It is reconstructed pseudocode. Register use, stack arguments and instruction bytes control the translation when inferred C types are uncertain.

The [reference manifest](../../work/iron-meridian/native-modifiers/reference.json) records every mapped code range, source file offset and full byte hash. The [oracle script](../../work/iron-meridian/native-modifiers/emulate_modifiers.py) verifies the full executable hash before extracting any code. Per-range LLVM instruction listings are stored beside it. No original executable or extracted raw code blob is added to public application assets.

## Implemented dependencies

| Native entry | Recovered behavior used by this path |
| --- | --- |
| `0x140F537E0` | First output accumulation, key-match bonus, conditional definition field, keyed collection, second output zero on this invocation |
| `0x1405A5210` | Lower-bound lookup by unsigned 32-bit key in 16-byte records, descriptor context gate, optional signed clamp to 0..100000 |
| `0x140F535C0` | Definition disable byte, source pointer-vector traversal, wrapping sum, signed lower/upper clamp |
| `0x140DEA2A0` | Category gate, modifier `0xCF`, virtual signed int32 result, first country/group identifier match, fixed-point multiplication and clamp |
| `0x140DEA430` | Ordered scans of 40-byte category/string records, unsigned category keys and small/heap string selection |
| `0x1425D0588`, default branch `0x1425D054C` | Non-null string comparison when global `0x143694CCC` is zero, folding ASCII A..Z only |
| `0x140C07BF0`, `0x140C08790` | Initialized world pointer/group table lookups; diagnostics/TLS branches retain a boundary |
| `0x140ECDD20` | Object-collection getter |
| `0x1414D6CF0` | First matching qword key in an object pointer-vector |
| `0x140EE82E0` | Two-round 32-bit hash, byte-distance probing, exact signed sentinel arithmetic, wrapping value sum and ordered payload concatenation |

The string comparator was checked beyond its call signature. It is case-insensitive in its default branch. Treating it as a bytewise `strcmp` changes category matches. Nonzero `0x143694CCC` selects a locale-dependent implementation at `0x1425D05D0`; that remains supplied explicitly.

The country/group helper names and collection labels in this report are analyst descriptions of address/field use. They do not establish recovered original C++ class declarations.

## Raw state contract

The memory interface reads little-endian byte, dword and qword values at explicit addresses. The caller supplies a valid initialized memory snapshot. No field defaults, configuration values, effective DLC/mod state, native allocation behavior, or recovery from invalid pointers are invented.

| Base | Offset | Read and use |
| --- | --- | --- |
| State | `0x68`, `0x74` | Qword-key vector pointer and signed dword count for the object-match bonus |
| State | `0x140`, `0x14C` | Dword-key vector pointer and signed dword count for the keyed table |
| State | `0x158` | Owner pointer |
| State | `0x160` | Definition pointer |
| State | `0x190`, `0x1A0` | Signed qword additions |
| State | `0x1E8` | Byte captured by the original caller; any nonzero value includes definition `+0x538` |
| Owner | `0x118`, `0x124` | Source-entry pointer-vector and signed count |
| Owner | `0x130` | Country pointer |
| Definition | `0x2C0`, `0x2CC` | Category record vector and signed count |
| Definition | `0x409` | Any nonzero byte disables source contribution |
| Definition | `0x538` | Conditional signed qword addition |
| Country | `0x8` | Raw dword identifier |
| Country | `0x5B8`, `0x5C4` | Modifier record vector and signed count |
| Country | `0xF68` | Pointer whose `+0x190` embeds the object-match collection |
| Country | `0xFA8` | Keyed-table pointer |
| Object-match collection | `0x20`, `0x2C` | Object pointer-vector and signed count; nonpositive count skips |
| Object | `0x3F0` | Qword match key |
| Source entry | `0x0` | Vtable; slots `+0x78` and `+0x80` remain explicit dependencies |
| Source entry | `0x10` | Signed qword base |
| Source entry | `0x18`, `0x24` | Dword identifier vector and signed count |
| Source entry | `0x30` | Parallel signed-qword bonus vector |
| Modifier record, stride `0x10` | `0x0`, `0x8` | Unsigned dword key, signed qword value |
| Modifier descriptor, stride `0x78` | `0x60`, `0x68` | Clamp flag bit `0x10`, dword context mask |
| Category record, stride `0x28` | `0x0`, `0x18`, `0x20` | Inline bytes or heap pointer, qword capacity selector, unsigned dword category key |
| Keyed table | `0x88`, `0x94`, `0x98` | Bucket pointer, sign-extended dword mask, byte used in sentinel arithmetic |
| Bucket, stride `0x30` | `0x4`, `0x8`, `0x10` | Byte probe distance, unsigned dword key, signed qword value |
| Bucket | `0x18`, `0x24` | Payload pointer-vector and zero-extended dword count |
| World | `0x310`, `0x340` | Country-pointer table and dword group/index table |

The initialized world lookup sign-extends a country identifier for the group-table index, then sign-extends the resulting dword for the country-pointer-table index. Identifier zero selects country-table index zero. `0x140C08790` returns the raw identifier if the world global is null. `0x140C07BF0` still dereferences the world for its final country table; the translation does not substitute a country when it is absent.

| Global address | Supplied raw value and use |
| --- | --- |
| `0x1433DD1D0` | Modifier descriptor registry pointer |
| `0x1433DE580` | Optional context-mask function pointer |
| `0x1433DD6B0` | World pointer |
| `0x14368F611` | Diagnostic-mode byte |
| `0x1433DD130`, `0x1433DD131` | Diagnostic guard bytes controlling unresolved assertion/TLS paths |
| `0x1433E4280` | Signed qword source upper bound, read at each native clamp point |
| `0x1433E4328` | Signed qword bonus added once if any object key matches |
| `0x143694CCC` | Dword selector for default ASCII comparison versus locale runtime |

These globals are explicit memory reads. This slice does not infer their loaded values from shipped configuration. The previously recovered rate wrapper separately reads `0x1433E4658`; see [RESEARCH_RATE_PORT.md](RESEARCH_RATE_PORT.md) for its proven static key registration and runtime-value boundary.

## Arithmetic and traversal behavior

Qword additions and multiplication wrap to signed 64-bit values with `BigInt.asIntN`. Pointers wrap to unsigned 64 bits. Dword keys, descriptor flags and byte flags retain their native widths. The entry calculation wraps base-plus-bonus, multiplication by the positive signed-int32 virtual result, and multiplication by `(modifier[0xCF] + 100000)` before signed division by 100000. The original optimized multiply-high sequence implements truncation toward zero; the translation uses BigInt signed division on the wrapped dividend.

A negative entry or aggregate value clamps to zero without reading the upper bound. A nonnegative value compares against the supplied signed upper bound. Consequently, a negative supplied upper bound can produce a negative result from the upper-bound branch. Tests retain this otherwise surprising case. Source disabling returns zero directly.

The modifier search preserves unsigned key ordering and its original lower-bound pointer updates. It checks descriptor context flags after lookup, obtains a mask only when the flags and function pointer require it, then re-reads the registry pointer after the callback. Key `0xCD` supplies the direct country term; key `0xCF` supplies the source multiplier.

The category matcher preserves iteration order and early exits. It selects heap storage only when the qword at string record `+0x18` exceeds 15. Its default comparator uses null-terminated bytes and folds only ASCII uppercase bytes. High bytes are compared as unsigned bytes. Locale behavior is not replaced with JavaScript locale comparison.

The keyed table preserves 32-bit multiplication overflow, sign extension before the final hash mask, byte probe-counter wrapping, and the different signed32 conversion points in the missing-bucket and sentinel calculations. Payload pointers retain duplicates and order. Returning that temporary list is an inspection API; the native caller frees it after the calculation.

Pointer-end loops remain pointer-end loops where the native code uses them. Some negative counts would yield invalid traversal rather than an empty list. The module does not claim equivalent access violations, allocator failures, arbitrary corrupted-memory behavior, or concurrent native mutation.

## Explicit remaining dependencies

| Boundary | What remains unknown or supplied |
| --- | --- |
| Entry vtable `+0x78` | Concrete dynamic implementation and the category begin/end pointers it writes |
| Entry vtable `+0x80` | Concrete dynamic implementation returning the signed int32 level/factor for definition and country-ID inputs |
| Function pointer at `0x1433DE580` | Engine/context mask implementation |
| Locale branch `0x1425D05D0` | Locale mapping-table setup, TLS lifecycle and case mapping; callback returns a signed dword comparison result |
| Country/group diagnostic paths | TLS initialization, assertion callbacks, possible traps and global writes; callbacks cover only paths that require those runtime services |
| Vector constructor `0x14011F6F0`, append `0x14018E580`, allocator virtual cleanup | Oracle hooks provide declared successful vector construction/copy/cleanup. The web translation uses an array for the resulting pointer list. Native allocator semantics and failures are not recovered |
| `0x140B205B0` | Separate technology denominator producer consumed by the rate wrapper; its pointee remains explicit in the combined tests |
| State and global initialization | Actual content parsing, world creation, active overrides, state ownership and updates |

The daily path skips nonzero `arg3` calculations and all tooltip formatting. Those code paths occupy much of the mapped `0x140F537E0` range but are not translated or covered merely because their bytes are mapped.

## Original-instruction reference verification

[emulate_modifiers.py](../../work/iron-meridian/native-modifiers/emulate_modifiers.py) runs extracted original instructions in Unicorn 2.1.4 x86-64. It starts at the real rate wrapper, executes the real modifier producer and the listed recovered callees, and captures the modifier tuple when control returns to wrapper address `0x140F53398`. It then lets the original wrapper compute its rate or raise its divide interrupt. Expected numbers do not come from the TypeScript implementation or a second copy of its arithmetic.

The oracle maps 12 code ranges totaling 5,260 original bytes. The ASCII comparator body and dispatch wrapper share one mapped range. The first compiler unwind fragment for `0x140C08790` does not contain the whole ordinary return path, so its range is extended through the byte-verified `RET` at `0x140C08857`. Compiler unwind records are not assumed to be complete source-function boundaries.

Synthetic fixtures specify memory writes, virtual leaf results, context masks, locale callback results and the remaining technology pointee. Virtual implementations, vector runtime and the locale branch are hooked at explicit addresses. An unexpected control transfer, unmapped access, missing declared virtual result, unexpected CPU interrupt, or failure to return stops reference generation. This is isolated instruction emulation with synthetic state, not execution of the installed game process.

The generated reference contains 252 cases: 60 discriminating named cases and 192 seeded state cases. They cover signed wrapping, noncanonical flag bytes, unsigned keys, modifier absence/clamps/context gates, first/duplicate object matches, source-disable and category gates, inline/heap and mixed-case strings, high bytes, signed virtual results, direct/group identifier bonuses, source clamps, hash collisions/misses/duplicate payloads, combined denominator zero, and combined signed division overflow. Four locale cases test dispatch with explicitly supplied results; they do not validate the missing locale algorithm. Initialized and disabled diagnostic branches are exercised; TLS/assertion branches are not.

Observed reference results: 251 normal combined returns, one expected divide-error interrupt at original wrapper `0x140F53404`, and 641 distinct original instruction addresses executed. The coverage map additionally contains the eight declared hook addresses. Neither mapped bytes nor these counts imply complete function or state-space coverage.

Reference SHA-256: `3d0741115d901722f40c641a7903220e02892a3de32386921b59ad7472bcc5e4`.

The [scoped Vitest test](../../tests/games/iron-meridian/native-research-modifiers.test.ts) reads the same declared memory snapshot, compares both modifier qwords, ordered payload pointers and leaf-call transcripts, and composes the existing rate arithmetic with the produced modifiers. The command below passed all 252 tests on 2026-11-17:

```powershell
& '.\node_modules\.bin\vitest.cmd' run 'tests/games/iron-meridian/native-research-modifiers.test.ts' --reporter=dot
```

No full typecheck, app build, browser, screenshot, original native process, real saved-game state, or end-to-end equivalence validation was run for this slice. The portable emulator package provenance remains recorded in [RESEARCH_RATE_PORT.md](RESEARCH_RATE_PORT.md). No game files were changed.

## Next concrete recovery

Recover the concrete dynamic types behind entry vtable slots `0x78` and `0x80`, their creation sites and category/level inputs. Recover the technology denominator path, the context-mask runtime and locale mapping setup. Then construct an actual content/state adapter with explicit initialization evidence and verify the combined research update caller against matching initialized state. Each step removes a supplied dependency instead of replacing it with a guessed research formula.
