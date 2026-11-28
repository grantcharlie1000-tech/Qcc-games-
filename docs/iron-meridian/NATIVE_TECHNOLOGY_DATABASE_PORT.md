# Technology category and database recovery

The current local component checkpoint is [native-database-integration](../../work/iron-meridian/native-nested-cleanup-integration/checkpoint.json). It binds the promoted sources, original references, author/review ledgers and validation results. The browser still uses the authored raw-world adapter and diagnostic map; these parser/database components are outside browser execution.

The checkpoint covers 7,623 native cases in 58 suites and binds 220 source/reference files. A single full invocation passes all 7,658 cases including 35 preserved prototype cases, on two workers with an explicit 120-second per-case allowance. Full build/typecheck, explicit offline checks and byte-identical browser asset verification pass separately. Earlier sort timeouts and consolidated reruns remain preserved in the preceding database checkpoint. This is behavior evidence, not performance acceptance.

| Component | Author comparisons | Independent comparisons | Current behavior |
| --- | ---: | ---: | --- |
| Mixed property reader | 62 | 67 | Concrete Boolean, integer and fixed-point dispatch |
| Technology constructor | 54 | 8 | Actual object defaults, strings, registry and tracking ownership |
| Categories | 40 | 13 | Nested parsing, owned category records and token-kind vector |
| Raw database reader | 19 | 9 | Actual top-level construction and object/name vector insertion |
| Combined folder/path reader | 9 | 7 | Concrete nested dispatch, owned records, coordinates and coefficients |
| Parser destruction | 10 | 7 | Variable/name vectors, token buffers, linked diagnostics and optional owned input |

`140B1EAD0` dispatches `technologies` through concrete `140B1D820`, metadata `140B25980`, iterator `142541100` and the reviewed mixed/category field reader. The raw database stores object pointers at `+48` and 40-byte name records at `+60`, with separate capacity/count/allocator fields. Duplicate and case-different definition names are both appended by this caller. That does not establish effective database uniqueness or later resolution semantics. The true folded-FNV collision `costarring`/`liquid` is retained in both database and category observations; the category path performs full comparison after hashing.

The database author retains 23 original observations: thirteen returns, nine precise context stops and one actual unknown-field null-context fault at `140B16FDC`, reading address `4C`. Nineteen receive candidate comparisons: thirteen completions and six supported stops. Independent review adds five returns and four exact stops, including six-definition growth, the 15/16-byte name boundary, quoted embedded NUL truncation, repeated blocks, numeric values and missing primitive leaves. Three primitive stop-label discrepancies were corrected at the new database caller boundary without changing frozen dependencies. Both failing comparisons and the intermediate narrowing typecheck failure remain retained.

The category author retains 29 returns and eleven exact stops. Independent review adds nine returns and four stops, plus one separately recorded actual null-source fault. Record/kind count reloads under allocator callbacks and full name comparison are checked. Enabled locale comparison and deeper duplicate diagnostics retain exact context stops.

Original instruction starts and lengths are independently decoded and checked against the executable. Unconditional optimized-Python verifiers reconstruct complete public state and live/retired allocations from raw stores, match ordered primitive calls, and compare ordered nonstack plus explicitly declared caller-owned stack writes. Other callee stack, read/control/register equivalence and native ABI return values remain outside these component claims.

All database cases explicitly supply empty raw database and localization state, concrete allocator data and a warm keyword registry/TLS snapshot. Enabled name validation, alternate top-level groups, additional equipment/AI fields and remaining path/folder continuations, reference resolution, effective DLC/mod content, cold startup and native campaign construction remain unfinished. No original process or bundled DLL entry point was launched, and the installation remains read only.

[Nested fields and parser cleanup](NATIVE_TECHNOLOGY_NESTED_PORT.md) records the reviewed combined reader and destruction boundaries. The real file-loading caller still needs its sibling input construction and effective enumeration context.
