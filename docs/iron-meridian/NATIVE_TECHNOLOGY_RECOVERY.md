# Native technology input and keywords

Target: installed `hoi4.exe`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. This is original-code and initializer-data recovery. Effective technologies and campaign construction remain incomplete.

## Loading and parser

Startup `140194800` invokes `140193F30` with database `1433DD4E8` and literal `common/technologies` at `14279BC00`. Loader `140B238F0` enumerates `.txt` files at depth zero through `142560BE0`. Each 64-byte file record supplies input `14253DD40`, parser `142541700`, database reader `140B1EAD0`, then parser and input destruction.

Input constructor `14253DAE0` creates a temporary owning stream with `142564930`. Factory `142540600` reads into a byte vector through `1425658F0`, then supplies it to character-reader constructor `142573500`. Only its separate mode-one branch skips an initial UTF-8 BOM. This raw-vector path does not use the false-mode converter `14255A5F0` recovered for selection JSON.

Input vtable `142C04DA0 + 8` targets tokenizer `14253F460`. The parser stores its input at `+28` and 72-byte tokens at `+30`, `+78` and `+C0`. `142543FD0` consumes keys, operators, values and constant references; `142541100` dispatches definition readers. Character reading and concrete ownership are now independently reviewed components. The complete stream-to-reader factory and parser-state constructor are now separately reviewed and promoted. The complete input object, registry and tokenizer are now separately reviewed/promoted components. Derived text input, input destruction, ordinary consumption and balanced navigation are also reviewed/promoted. Reviewed variable helpers, the extended caller and bounded scalar values are promoted; numeric wrappers, mixed property iteration, concrete construction, categories and top-level raw database insertion are reviewed/promoted components. Effective technology loading remains open. [NATIVE_TEXT_PARSER_PORT.md](NATIVE_TEXT_PARSER_PORT.md) records the current exact boundary. [NATIVE_INPUT_FACTORY_PORT.md](NATIVE_INPUT_FACTORY_PORT.md) records the new component evidence.

## Generated keyword records

Accessor `1420D3420` declares 10,767 records. `1420D3430` sign-extends its index and returns `14343AF20 + index * 72`. The complete array is not backed by raw PE data, so its populated contents require initialization.

The generated initializer is `140083760..140119491`, exclusive end, containing 613,681 original bytes. Its Ghidra C decompilation failure remains unresolved. Recovering its data flow does not count as successful C recovery.

[extract-keywords.py](../../work/iron-meridian/native-technology/extract-keywords.py) checks the bounded LLVM listing against original executable bytes and validates every 40-byte argument window at decoded instruction starts. Each loads the original dword ID, calls enum-copy helper `140153750`, addresses its original NUL-terminated ASCII literal and next 72-byte record, then calls constructor `142547630`. The result retains 10,767 ordered, unique IDs and names, with original bytes, file offsets and hashes.

[emulate-initializer-arguments.py](../../work/iron-meridian/native-technology/emulate-initializer-arguments.py) separately executes original initializer and enum-copy data flow in Unicorn 2.1.4. All 10,767 incoming constructor triples match. It visits 107,681 original starts, including the helper; the initializer listing has 107,678 decoded starts. Argument trace SHA-256: `a81ab43f96ea3e5bc8850cae1e3d23363ee72c0a53b4da5314a6cd0cc384521b`.

The complete record constructor is deliberately intercepted and returns the supplied record pointer without construction. Stack probing and exit registration are supplied leaves. This establishes argument data flow, not constructed records, a populated hash registry, full initializer equivalence, native-process execution or browser behavior. PCs and artifact identities are retained in [initializer-argument-execution.json](../../work/iron-meridian/native-technology/initializer-argument-execution.json). An initial Python import failed because an authored `inspect.py` shadowed the standard library; it was renamed before the successful execution.

[Independent review](../../work/iron-meridian/native-technology-review/REVIEW.md) rebound the entire initializer and every ordered record window, ID and name. It independently enumerated all direct calls: 10,767 enum-copy calls, 10,767 record-constructor calls and the two declared leaves. A second original run filled the stack with `A7` bytes and clobbered volatile argument registers after each intercepted constructor. All argument tuples and 107,681 visited starts still matched. No material finding remained within that argument-flow scope. Actual record construction was implemented and reviewed in the subsequent stage below.

Subsequent work separately implements the actual record constructor and the complete generated initializer. The reviewed 72-case record component preserves early TLS-pointer capture; a pre-fix alias failure and all earlier 71 cases remain retained. Its declared inline/global allocator dispatch executes directly, with only individual CRT/alternate virtual leaves supplied.

The [complete initializer stage](../../work/iron-meridian/native-keyword-initialization/PORT.md) executes all 10,767 actual original constructors and enum-copy helpers. All 72-byte records, names, allocation payloads and generated stack stores match. Exactly 8,431 names stay inline and 2,336 heap names remain live; the registered destructor is not executed. Ten composed cases pass, including partial stops and ABI-preserving callback mutations. [Independent review](../../work/iron-meridian/native-keyword-initialization-review/REVIEW.md) adds one original-instruction probe and independently rebinds the complete generated schedule and record/heap evidence. The older argument-only runner remains unchanged and is not relabeled as record construction. This initializer stage assumes declared warm TLS, concrete allocator state and individual services; it is not whole-program startup or effective content.

`1425401B0` is the separate guarded registry initializer. It iterates accessors, normalizes names, computes a case-folded FNV-style hash and inserts through `14253D1D0`. Its declared probing, synchronization, collision movement, rehash and reverse-vector closure is now implemented and reviewed in the bounded single-participant/default-locale component. Complete startup, alternate runtime branches and effective definitions remain open. File-backed initial hash state and auxiliary BSS constructors are distinguished. `1425481A0` is a token byte-append helper. [NATIVE_INPUT_STREAM_PORT.md](NATIVE_INPUT_STREAM_PORT.md) records the owning stream and character-reader work already reviewed.

## Selected technology fields

Constructor `140B1D820` initializes a `0x590`-byte technology object. Reader `140B25980` records source path and line before generic dispatch. Field reader `140B25C90`, combined with recovered keyword names, establishes these selected assignments:

| Token ID | Original name | Selected assignment |
| --- | --- | --- |
| `2E64` | `research_cost` | Numeric parser `142543500` writes `+3E0` |
| `3C0C` | `xp_research_cost` | Numeric parser writes `+530`, with deprecated-field diagnostic |
| `3C0D` | `xp_research_type` | Helper `1415C3F90` supplies type `+520` |
| `4D92` | `xp_unlock_cost` | Numeric parser writes `+528` |
| `4D93` | `xp_boost_cost` | Numeric parser writes `+530` |

The constructor sets type zero and fields `+528`, `+530`, `+538` to signed **-100000**. Original constructor execution corrects the earlier positive-value inference from decompiled call arguments. Post-load `140B23AA0` fills negative experience values from corresponding globals when type is nonzero. [Constructor execution](../../work/iron-meridian/native-technology-construction/PORT.md) and [independent review](../../work/iron-meridian/native-technology-construction-review/REVIEW.md) bind four constructor returns, three constructed-object property-iteration fixtures, separate diagnostic/fault cases and callback probes. Supplied empty string-table/warm-registry state remains explicit. Concrete constructor translation is now reviewed and promoted with 54 owner cases and eight independent probes. Effective runtime databases and the full technology schema remain unfinished.

Selected parser, keyword, stream, character-reader, ownership and registry-closure exports remain outside public app assets, indexed by [NATIVE_DECOMPILATION.md](NATIVE_DECOMPILATION.md). The reviewed category/database chain now performs concrete construction and raw object/name insertion. Next work is additional nested fields, reference resolution, nonempty localization and effective engine startup/content construction. [Database recovery](NATIVE_TECHNOLOGY_DATABASE_PORT.md) records the exact current scope. No game process or DLL entrypoint was launched. The installation remains unchanged.
