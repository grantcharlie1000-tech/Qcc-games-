# Native inventory and decompilation seeds

This is static evidence from the installed `hoi4.exe`, collected on 2026-11-17. It identifies concrete research and production code addresses for decompilation. It does not establish a complete native port or runtime parity.

## Target and method

| Field | Observed value |
| --- | --- |
| Path | `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe` |
| Size | 56,535,160 bytes |
| SHA-256 | `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148` |
| PE machine | `0x8664`, PE32+ |
| Preferred image base | `0x140000000` |
| Entry point | RVA `0x25a019c`, VA `0x1425a019c`, file offset `0x259f59c` |
| Image size | 59,387,904 bytes |
| COFF timestamp | Raw `1793890379`, decoded `2026-11-05T14:52:59Z` |
| COFF symbols | Pointer `0`, count `0` |

The timestamp is a header declaration, not verified build provenance. All VAs below use the preferred image base. They are not observed process addresses under ASLR.

REA was not available in this worker's active tools or shell. The inventory used Python 3.14 standard-library byte parsing and the already installed LLVM objdump 21.1.6. No dependency was installed. The target was read but not executed or modified. No DRM, configuration, installed game data, production state, or unrelated workspace file was changed.

Evidence files are under [`work/iron-meridian/native-inventory`](../../work/iron-meridian/native-inventory/):

- [`inventory.json`](../../work/iron-meridian/native-inventory/inventory.json): identity, headers, imports, CodeView record, keyword strings, candidate xrefs, selected RTTI and vtables.
- [`runtime-functions.json`](../../work/iron-meridian/native-inventory/runtime-functions.json): the exception directory's 140,896 compiler unwind ranges.
- [`additional-inventory.json`](../../work/iron-meridian/native-inventory/additional-inventory.json): 110 named exports and selected unwind ranges.
- [`fast-types.json`](../../work/iron-meridian/native-inventory/fast-types.json): focused technology, technology-status, production-line, and date type records.
- [`calendar-seeds.json`](../../work/iron-meridian/native-inventory/calendar-seeds.json): separate bounded calendar search.
- [`verification.json`](../../work/iron-meridian/native-inventory/verification.json): unchanged target digest, seven saved LLVM instruction sites checked against original file bytes, and basic table consistency checks.

## Native layout and debug declarations

| Section | RVA | File offset | Raw bytes | Virtual bytes |
| --- | ---: | ---: | ---: | ---: |
| `.text` | `0x1000` | `0x400` | 41,434,624 | 41,434,440 |
| `.rdata` | `0x2785000` | `0x2784200` | 9,928,704 | 9,928,594 |
| `.data` | `0x30fd000` | `0x30fc200` | 3,015,168 | 5,867,348 |
| `.pdata` | `0x3696000` | `0x33dc400` | 1,691,136 | 1,690,752 |
| `.rsrc` | `0x3833000` | `0x3579200` | 13,312 | 13,192 |
| `.reloc` | `0x3837000` | `0x357c600` | 440,832 | 440,736 |

CodeView RSDS at file offset `0x2e76da0` declares PDB path `C:\mnt\gsg\hoi4\hoi4_merged\outputdir_windows\hoi4.pdb`, raw GUID bytes `a1ae47a56346c0439b8102b291037e21`, age `1`. The path is a string embedded in the executable. This worker did not recover a PDB or original C++ source. Debug types 12 and 13 are also recorded but their payloads were not decoded.

There are 110 named exports: 108 PHYSFS names, including aliases sharing addresses, and two GPU-selection data exports. No named gameplay export was observed in this table. LLVM sometimes prints a nearby PHYSFS export label plus a large offset over unrelated gameplay disassembly. Those display labels are not gameplay symbol recovery.

## Direct imports

The standard import directory contains 23 DLL descriptors and 536 thunk entries. The delay-import directory is zero. Exact named imports, ordinals, and IAT/ILT RVAs are retained in `inventory.json`.

| DLL | Entries |
| --- | ---: |
| `steam_api64.dll` | 16 |
| `PDXSDK.dll` | 38 |
| `SETUPAPI.dll` | 9 |
| `IMM32.dll` | 10 |
| `VERSION.dll` | 3 |
| `WINMM.dll` | 20 |
| `WS2_32.dll` | 1 |
| `OPENGL32.dll` | 46 |
| `D3DCOMPILER_47.dll` | 1 |
| `d3d11.dll` | 1 |
| `dxgi.dll` | 2 |
| `d3dx9_43.dll` | 8 |
| `d3d9.dll` | 2 |
| `XINPUT1_3.dll` | 2 |
| `SHLWAPI.dll` | 2 |
| `KERNEL32.dll` | 203 |
| `USER32.dll` | 119 |
| `GDI32.dll` | 26 |
| `SHELL32.dll` | 10 |
| `ole32.dll` | 6 |
| `OLEAUT32.dll` | 1 |
| `ADVAPI32.dll` | 7 |
| `bcrypt.dll` | 3 |

This is the executable's declared direct-import surface. Dynamic loading and transitive dependencies are incomplete. Ordinal-only imports are preserved without invented API names. DLL implementation and transitive imports were not inspected by this worker.

## Highest-value research seeds

The names in the role column are analysis descriptions. Only the `InitPostRead` string contains that original C++ method spelling. Range ends are exclusive and come from `.pdata`, which can split one logical function into several ranges.

| Preferred VA | Range end | Bytes | Evidence and use |
| --- | --- | ---: | --- |
| `0x140f52500` | `0x140f52c0e` | 1,806 | Research timing caller. An exact LEA at `0x140f52828` references the positive daily-rate assertion. |
| `0x140f53350` | `0x140f53433` | 227 | Daily-rate candidate called immediately before that assertion. Contains guarded fixed point division and a lower clamp. |
| `0x140f537e0` | `0x140f5436d` | 2,957 | Modifier-output callee used by both preceding functions. Referenced research bonus keys support the subsystem association. |
| `0x140f5b910` | `0x140f5bb0e` | 510 | Technology-state helper. Direct call seen in the nearby status update code. |
| `0x140f5bb10` | `0x140f5c43b` | 2,347 | Research cost/tooltip candidate, references `RESEARCH_BONUS_COST_REDUCTION`. |
| `0x140f5dc50` | `0x140f5dcaa` | 90 | Small nearby candidate for focused decompilation. Semantic name not established here. |
| `0x140f5dd50` | `0x140f5e011` | 705 | Completion-path candidate, references attempted completion and already-researched messages. |
| `0x140f55920` | `0x140f55cbc` | 924 | References the null-technology/old-save assertion. Useful for identifying status object layout. |
| `0x140f5cee0` | `0x140f5cefb` | 27 | `CTechnologyStatus` vtable slot 8. This first unwind range is a fragment, not the whole logical function. The following fragment contains `CTechnologyStatus::InitPostRead() %s %s`. |

### Validated daily-rate call and timing arithmetic

[`research-rate-140f52500.asm`](../../work/iron-meridian/native-inventory/research-rate-140f52500.asm) is bounded LLVM disassembly from VA `0x140f52500` to `0x140f537e0`. It includes adjacent functions after the first unwind range. LLVM validates these candidate references as real instructions:

| Instruction VA | Observation |
| --- | --- |
| `0x140f527d8` | `lea rdx,[rbp+0x7f]`, supplies an output location. |
| `0x140f527dc` | `mov rcx,r12`, supplies the object. |
| `0x140f527df` | `call 0x140f53350`. |
| `0x140f527e4` | Loads the returned qword into `rbx`. |
| `0x140f527fa` | Tests that qword; the following signed `jg` skips the assertion for positive values. |
| `0x140f52828` | `lea rcx,[rip+0x1a9f5b1]` resolves to VA `0x1429f1de0`, file offset `0x29f0fe0`. |
| `0x140f52863` | Multiplies the remaining-quantity register by `0x186a0`, decimal 100,000. |
| `0x140f5286a` | `cqo`, sign extension before division. |
| `0x140f5286c` | `idiv rbx`. |

The assertion text is `CurrentDailyRate > 0 && "No research progress, calculations below are broken"`. It anchors the daily-rate interpretation. Earlier code subtracts `[status+0x198]` and clamps a remaining quantity positive. The division is conditional. Nonpositive rate and sentinel paths must remain explicit in a port.

[`daily-rate-140f53350.asm`](../../work/iron-meridian/native-inventory/daily-rate-140f53350.asm) starts at the 227-byte candidate and continues through neighboring code to `0x140f537e0`.

Its first function calls `0x140f537e0` at `0x140f53393`. It adds 100,000 and object field `+0x1c8` to the first output. At `0x140f533d4` it calls `0x140b205b0` with a pointer from object field `+0x160` and an additional value built from the other modifier output plus field `+0x1c0`. It adds 100,000 to the returned denominator. The guarded division at `0x140f53404` is signed, with the numerator multiplied by 100,000 at `0x140f533fb`. The zero/sentinel fallback loads `ecx=0xffffffff`. The final `cmp`/`cmovg` at `0x140f53420` and `0x140f53423` selects a signed maximum against global qword VA `0x1433e4658`.

These are observed instruction/data-flow facts. Modifier meanings, runtime global values, object-field names, integer overflow behavior at supported domain edges, and a complete pure-function boundary still require decompilation and explicit validation. In particular, the fallback is a zero-extended `0xffffffff` at this instruction, so it must not be casually rewritten as signed 64-bit `-1`.

### Completion and save-state strings

[`complete-research-140f5dd50.asm`](../../work/iron-meridian/native-inventory/complete-research-140f5dd50.asm) validates the completion-related LEA at `0x140f5dec1`, which resolves to string RVA `0x29f2260`: `Attempted to complete research of "`. The same bounded function references the already-researched message at string RVA `0x29f2218`.

The null-technology assertion string at RVA `0x29f2170` is referenced by byte candidate VA `0x140f5599c` within the 924-byte unwind range at `0x140f55920`. That site has not been independently disassembled in this worker's saved files. The `InitPostRead` string at RVA `0x29f2078` has a candidate reference at `0x140f5d031`, within unwind fragment `0x140f5cefb` to `0x140f5d0a0`. These two remain byte-pattern candidates until separately validated.

## RTTI and production alternative

MSVC x64 complete-object-locator candidates were accepted only when their signature was `1` and their self-RVA matched the record's location. Their type-descriptor references link back to the class-name strings. Vtable scans retain consecutive pointers into `.text` and stop at a non-code pointer or a bounded cap. This establishes useful address seeds, not original virtual-method names or exact semantic method counts.

| Class | Type descriptor RVA | COL RVA | Vtable VA |
| --- | --- | --- | --- |
| `CTechnology` | `0x32ed2a0` | `0x2d606a8` | `0x1429f17a0` |
| `CTechnology`, secondary | `0x32ed2a0` | `0x2d608d0` | `0x1429f17f0` |
| `CTechnologyStatus` | `0x32ed398` | `0x2d608f8` | `0x1429f1860` |
| `CProductionLine` | `0x32f2db8` | `0x2d8eb90` | `0x142a45058` |

`CTechnologyStatus` slot 8 points to `0x140f5cee0`. Production alternatives from `CProductionLine` include pointers `0x1422858a0`, `0x142285170`, and `0x142283ef0`. The last has a 195-byte unwind range ending `0x142283fb3`. Production behavior was not decompiled here because the research assertion provides a stronger, narrower semantic anchor.

## Bounded calendar result

The separate calendar search looked through all 789,845 extracted ASCII strings of length at least four for `CDate`, `date.cpp`, `DaysInMonth`, `DaysInYear`, `IsLeapYear`, `leap_year`, `_Month`, or `_Day`, and then scanned matching exact string starts for common RIP-relative LEA/MOV encodings.

It found `.?AVCDate@@` at name RVA `0x31db750` and `.?AVCDateTrigger@@` at name RVA `0x3202cd8`. Neither name produced a direct RIP-relative code candidate. No `date.cpp`, `DaysInMonth`, `DaysInYear`, or `IsLeapYear` string was found by this ASCII search. This does not establish that calendar arithmetic is absent. It leaves the requested calendar leaf seed unresolved.

## Evidence limits and next step

The main inventory searched `research|technolog|production|industrial|factory|construction|CEquipment|CResource` against ASCII strings and retained 4,507 matches. Common RIP-relative LEA/MOV encodings produced references for 2,434 of those strings. This is not a complete disassembly or xref graph. Overlapping instructions, immediate references, interior-string references, wide strings, indirect calls, and constructor-initialized state remain incomplete. RTTI recovery is capped at 60 matching non-template, non-lambda names, with technology and production-line owners prioritized.

The strongest decompilation order is `0x140f53350`, `0x140f537e0`, `0x140b205b0`, then the timing caller `0x140f52500` and completion candidate `0x140f5dd50`. Recover exact integer types, sentinel and overflow behavior, field/global inputs, and callees before defining a portable pure function. Keep unresolved global state as explicit inputs rather than inventing constant values. Static pseudocode will still require behavioral comparison before any HOI4 parity claim.

Verification run: `python work\iron-meridian\native-inventory\verify_evidence.py` passed. It confirms the target digest still matches, all recorded unwind ranges are sorted and nonempty, direct-import counts remain 23/536, and seven selected LLVM instruction lines match the original target bytes. It does not verify native execution or gameplay semantics. No screenshot was taken in this read-only native pass because target execution was excluded.

## Minimum research speed binding

[`minimum-binding.json`](../../work/iron-meridian/native-inventory/minimum-binding.json) establishes the static binding between `NTechnology.MIN_RESEARCH_SPEED` and clamp global VA `0x1433e4658`. It retains bounded LLVM output and 15 instruction-byte checks against the unchanged target digest.

The define helper's RTTI descriptor is RVA `0x3278cd0`, COL RVA `0x2cd57e8`, and vtable VA `0x1428d7788`. Its first pointer is loader `0x1409ff870`; its second is qualified-name getter `0x140792b70`. The loader references `NTechnology` at string VA `0x1428d6d28`. On its table-success branch:

| Instruction | Exact binding |
| --- | --- |
| `0x1409ffa29`, `4c 8d 05 28 4c 9e 02` | `r8 = &global 0x1433e4658` |
| `0x1409ffa30`, `48 8d 15 01 7e ed 01` | `rdx = &"MIN_RESEARCH_SPEED"` |
| `0x1409ffa3c`, `e8 6f 90 6d 01` | Calls numeric loader `0x1420d8ab0` |

That callee preserves the destination in `r13`, zeroes it, and on its numeric branch converts the value to float32, multiplies by `100000.0`, adjusts by sign and `0.5`, truncates to a signed integer, then stores `[r13]` at `0x1420d8bdf`. The caller warns and stores zero for a negative result. The research-rate routine reads the same global at `0x140f53419` before its signed maximum.

Shipped `common/defines/00_defines.lua:720` declares `MIN_RESEARCH_SPEED = 0.1`. Successful loading through the observed numeric branch converts that value to integer `10000`. The static key/output-address association is established. Loader reachability in a particular launch, successful initialization, overrides, later writes, and the effective runtime value remain unobserved. Initial `.data` bytes were not used as evidence of runtime configuration.
