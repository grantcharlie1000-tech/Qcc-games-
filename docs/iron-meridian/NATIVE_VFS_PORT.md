# Recovered VFS selection and ordering

[virtual-files.ts](../../src/games/iron-meridian/native/virtual-files.ts) translates the selection and ordering path of `0x14255E970`, its enumeration callback `0x14255F720`, root normalization and replacement-pair writes. It consumes explicitly supplied PHYSFS listings, stat results, real-directory results and search roots. It does not mount the installed game or infer active DLC/mod precedence.

The port matches 113 isolated original-instruction cases. This verifies observable selection, ordering and supplied-data handling under the declared runtime boundary. It does not establish a full filesystem, an effective installed configuration or a complete game port.

## Provenance

- Original: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`.
- SHA-256: `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`.
- Addresses are preferred virtual addresses at image base `0x140000000`.
- Parent Ghidra exports inspected: `exports/filesystem`, `exports/vfs-helpers`, `exports/post-analysis`, `exports/vfs-sort`, `exports/vfs-tree`, `exports/vfs-final`, and `broad-analysis/prepass/14255e970.c` under `C:\Users\charlie\artifacts\hoi4-native\709f916afbebcfe6`.
- Decompiled C is reconstructed pseudocode. Original instruction bytes, register arguments and executed branches control the translation. Compiler unwind fragments are not assumed to contain a complete function body.

The [oracle script](../../work/iron-meridian/native-vfs/emulate_vfs.py) verifies the executable hash and checks every imported instruction against the original PE bytes before emulation. Its [reference manifest](../../work/iron-meridian/native-vfs/reference.json) records each instruction artifact's identity, address extent, byte count and hash. The exported C/TSV artifacts remain in the parent's external analysis directory. The locally recovered bounded `memchr` listing is retained beside the oracle.

## Recovered behavior

| Native entry | Translated or verified role |
| --- | --- |
| `0x14255E970` | Replacement-root bound, enumeration, ordered file emission, filters, directory sorting/compaction and recursion |
| `0x14255F720` | Raw type dispatch, stat fallback, unique filename insertion and directory collection |
| `0x14020DDA0` | Original red-black tree insertion/rebalancing executed by the oracle |
| `0x1426078D0` | Unsigned byte comparison returning negative, zero or positive, without case/locale conversion |
| `0x14254E4B0` | Case-sensitive suffix test; no extension separator parsing |
| `0x14254E600`, `0x1424E7B40`, `0x142608410` | Bounded byte-substring search and its original `memchr`/comparison primitives |
| `0x1425C3CEC` | Null-terminated case-sensitive substring search for root acceptance |
| `0x140658B70` and its recovered sort closure | Ascending directory-string sort, insertion path and buffered merge paths |
| `0x14255E660` | Adjacent equal-length, byte-equal directory compaction |
| `0x14255FE50` | Search-root list refresh and backslash-to-slash replacement |
| `0x14255FF40`, `0x14254F940` | Append replacement pair, normalizing both input strings' backslashes |

The callback collects raw file types `0`, `2` and `3` as files. Raw type `1` is a directory. Raw type `4` calls `PHYSFS_stat(directory + "/" + name)`: stat type `0` inserts a file with empty metadata, type `1` adds a directory, other types are ignored, and failed stat produces a diagnostic. Other callback types are ignored. The API preserves these numeric branches instead of assigning unproven meanings to every enum value.

File keys compare unsigned bytes over the common prefix and then compare lengths. Shorter equal-prefix names come first. Uppercase ASCII sorts before lowercase ASCII; high bytes remain unsigned. An exact duplicate filename does not replace the existing key or metadata. The first file callback insertion survives. In-order tree traversal emits the unique files in ascending byte order. The TypeScript implementation uses byte identity plus sorting to reproduce those observable results; it does not reproduce native tree memory or balancing.

Optional suffix and substring filters apply to files before root acceptance. A suffix is literal bytes, so `lua` also matches a name ending in `lua` without a dot. Empty suffix and substring values match. Directory names are not rejected by these file filters.

If enumeration ultimately reports failure, callback effects are discarded for that directory and no child directories are visited. Stat callbacks and their diagnostics can already have occurred before that failure. A failed child enumeration returns to its parent, which can continue with later siblings. Diagnostics are represented as structured events; native logger text and logger side effects are not reproduced.

## Root and replacement filtering

`nativeVfsStateAfterWrites` implements the observed root setter and pair writer over supplied inputs. It preserves list order and duplicate entries, truncates C-string inputs at their first zero byte, and changes byte `0x5C` to `0x2F`. It does not resolve `.`/`..`, collapse duplicate slashes, fold case or canonicalize physical paths.

For each enumerated directory, `0x14255E970` starts with bound `INT32_MAX`. It considers only replacement pairs whose stored virtual-directory string equals the entire current directory in length and bytes. For each matching pair it finds the first exactly equal physical root in the supplied search-root list, retaining the smallest found index across pairs. A missing physical root leaves that pair without a bound. A virtual directory such as `common` does not match `common/defines` merely by being its prefix.

With no bound, files passing the optional name filters are emitted without calling `PHYSFS_getRealDir`. With a bound, that function is called for `directory + "/" + filename`. A null result rejects the file. Otherwise the native code accepts it when its returned C string **contains** any search-root C string at indices zero through the bound, inclusive.

This final acceptance is substring search, not equality or a path-component comparison. For example, root `C:/game` accepts supplied real-directory value `prefix-C:/game-suffix`; case changes can reject it. An empty root matches any nonnull returned C string. These surprising cases are retained and covered by original instructions. This code does not infer what PHYSFS would actually return for any mounted installation.

## Traversal and depth

Current-directory files are fully emitted before child directories. Directories are sorted by the same unsigned-byte lexicographic relation and compacted by adjacent exact equality before visiting each one. The native sort uses insertion sorting for at most 32 entries and recovered buffered merge paths for larger lists. The original comparator `0x140216670` uses the same common-prefix byte comparison and length relation.

Recursive physical lookup paths are built by appending `"/"` and the child name. Relative output prefixes append the child name and then `"/"`. These are different fields. An existing trailing slash can therefore produce a double slash in a lookup path. The output prefix is a length-bearing byte string and can retain embedded zero bytes.

The entry guard permits enumeration if maximum depth is below one, or current signed depth is at most the positive maximum. Maximum zero enumerates only the current directory. Negative values allow recursive traversal. A positive maximum does not quietly prune deeper children: a recursive call beyond it takes the original diagnostic/throw-helper path. The TypeScript result reports `kind: 'depth-exceeded'` with the directory and partial emission already performed. This is an inspection representation of that edge, not a recovered C++ exception object or an assertion that native callers consume partial output.

Depth inputs and increments retain signed 32-bit wrapping. The supplied listing graph must be a valid finite traversal for unbounded recursion; this slice does not invent cycle handling for arbitrary synthetic graphs.

## Data boundary

| Native representation | Supplied portable representation |
| --- | --- |
| Global `0x1436917A8`, null-terminated array of root C-string pointers | Ordered `searchRoots` byte arrays |
| Pointer global `0x1436917B0`, signed count at `0x1436917BC`, stride `0x40` | Ordered `replacementPairs` |
| Pair string at `+0`, virtual-directory string at `+0x20` | `physicalRoot`, `virtualDirectory` |
| Callback filename C string and dword file type | `name`, `rawFileType` |
| Callback's additional length-bearing string | `rawMetadata`, with no invented semantic interpretation |
| Tree node size `0x60`: left `+0`, parent `+8`, right `+0x10`, color `+0x18`, nil flag `+0x19`, key `+0x20`, metadata `+0x40` | Unique file collection and ordered emitted records |
| Native string length `+0x10`, capacity selector `+0x18`, inline/heap data | Explicit byte arrays |
| Output record size `0x40`, name then additional string | `NativeVirtualFile` |

Filename and filter lengths are scoped to ordinary constructed strings below `INT32_MAX`, where the native helpers' mixed dword/qword length operations have the verified meaning above. The module does not model corrupted containers, invalid pointers, native allocator failures, concurrent changes to global root state or arbitrary oversized string metadata.

## Instruction reference verification

The oracle executes the original root setter, replacement-pair writer, enumeration main routine, callback, red-black insertion, file filters, substring primitives, directory compactor and recovered sort bodies in Unicorn 2.1.4 x86-64. This includes original ordering control flow and predicates. Expected selected files and their order are not produced by the TypeScript port or a Python copy of its selection rules.

Declared services supply PHYSFS callbacks/listings/stat/real-directory/search-path results and successful C++ allocation, string construction/copy/move/append/replacement, vector append/resize, logging and release behavior. Native allocator and C++ string/container implementation equivalence are outside this experiment. The tree cleanup body executes original instructions, while frees are successful release hooks. The CRT substring CPU selector is explicitly zero, exercising its original SSE2 branch; this is not an observation of the installed game's live CPU-dispatch global. The native throw-helper edge stops the emulator and is recorded separately.

Every executed original address must match an imported instruction and size. Unexpected control transfer, interrupt, undeclared listing/stat/real-directory input, exhausted synthetic allocation or failure to reach a normal return stops generation. The script maps selected instructions and supplied data, not a running game or the complete executable.

Final reference: **113 cases**, comprising 49 named cases and 64 seeded file-tree cases. Cases distinguish case/unsigned-byte ordering, prefix lengths, inline/heap strings, duplicate metadata, raw file-type branches, failed stat/enumeration, literal suffixes, substring filtering, root normalization, exact replacement-directory matching, minimum root bounds, substring root acceptance, null/empty roots, call order, current-files-before-children, duplicate directories, depth modes and signed depth wrapping. Directory counts 31, 32, 33, 65, 129 and 257 exercise the insertion/merge boundary and heap scratch allocation path; another case covers long directory names and duplicate compaction.

Observed outcomes are 111 normal returns and two depth-exceeded throw edges. The manifest imports 29 bodies containing 3,675 distinct original instruction addresses; 2,483 distinct original addresses executed. Mapped bodies, instruction counts and selected cases do not imply complete state-space coverage. Allocation-failure sort fallbacks remain outside the declared successful-allocation contract.

Reference SHA-256: `888f002f822d50c289d2b1de800c1b701007b00e8fdf4769939d70eb2bdaed92`.

The [scoped Vitest test](../../tests/games/iron-meridian/native-virtual-files.test.ts) compares normalized state, selected names, exact metadata bytes, ordering, structured diagnostics, PHYSFS service-call order and depth termination against that reference. This command passed all 113 tests on 2026-11-17:

```powershell
& '.\node_modules\.bin\vitest.cmd' run 'tests/games/iron-meridian/native-virtual-files.test.ts' --reporter=dot
```

This worker ran no app build, full typecheck, browser, installed-game process or mount operation for the VFS slice. No original game files changed. Parent-owned broader checks and browser evidence are separate.

## Remaining work

The PHYSFS implementation still determines the real callbacks, duplicate source exposure, type/stat values and effective real-directory result. Launcher selections, descriptor parsing, mount order, replacement-path expansion, archive/file reading and actual source-byte delivery remain outside this module. Their unresolved state is documented in [CONFIGURATION_LOADING.md](CONFIGURATION_LOADING.md).

This slice can now turn supplied virtual listings into the recovered ordered relative filenames. An actual configuration adapter must obtain those supplied values through recovered mounting/content code, read their effective bytes, and pass the ordered chunks to the Lua configuration VM. No fictional simulation or UI is wired to these results. The full native game port remains unfinished.
