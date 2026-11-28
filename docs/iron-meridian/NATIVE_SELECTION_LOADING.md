# Native selection loading and mount requests

The `dlc_load.json` parsing and selection projection now has a bounded TypeScript port, verified against original x86-64 instructions. The file access, registry population, mount execution and effective machine selections are not implemented by this slice. Mount request control flow is statically recovered below. No installed game process was launched, no active user selection was read, and no Ghidra project was opened.

## Identity and reproducible evidence

Target: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`, 56,535,160 bytes, preferred base `0x140000000`, SHA-256:

`709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`

Owned evidence is in [native-selection](../../work/iron-meridian/native-selection/). `collect.py` checks every collected Ghidra instruction byte against the original PE, records contiguous runs, file offsets, unwind records, C/TSV hashes and complete envelope hashes, and writes separate LLVM disassemblies. `evidence.json` names the exact external export artifacts under `C:\Users\charlie\artifacts\hoi4-native\709f916afbebcfe6\exports\`. The C files are reconstructed Ghidra output. Several inferred signatures and switch listings are incomplete, so instructions control the claims here.

Selected original-byte envelopes, with exclusive ends:

| Entry and role | Envelope | SHA-256 of original envelope |
| --- | --- | --- |
| File selection loader | `0x1420dc3a0..0x1420dc5bc` | `4e9d1ade9c1364fbd34d9f1c71f42d86a6e6f41c95cf37fba64672f43728449d` |
| Selection child extraction | `0x1420e1b10..0x1420e1d7e` | `44877227014a2a3b65e6a5dcff4ea1e0f1fc38e56f1fb65d802c08623a530759` |
| Root parser | `0x142548ec0..0x142548f46` | `df300a3f5d68b93393b2fe6fe867d5761fd68b4b56cf408c70469a909eaea722` |
| Key lookup | `0x142548df0..0x142548ebf` | `bc88c998b18a75a1c4dfdb76d1c095cbb3feaaab2782213012086801fbd65d21` |
| String parser, including omitted switch body | `0x142549710..0x14254998c` | `c5b5d916a4bb34357425892be23447e156142e434e971702a1fa9804d7edd861` |
| Manager initialization caller | `0x1420e0b30..0x1420e0c37` | `f02ee047ec1e42ac24fce6638e432c0983c618035b45bf4e8fe66705d4dc0955` |
| Mount planner and dispatcher | `0x1420dd340..0x1420de3b9` | `ed94fe1cf964793286bf6ee8d16c24461bacd0a747cecdca0de47edb9591889f` |
| Mount backend wrapper | `0x142561f10..0x142561fb5` | `3108d847f2fcc3d6c87840cf9ee98f4e50070ad02f0e76e73036a8ce32c1cce1` |

An envelope can contain bytes absent from a Ghidra function's instruction list. It is not an assertion that every byte is executable. In particular, the first unwind fragment for `0x1420e1b10` ends at `0x1420e1b8d`, but its body continues through `0x1420e1d7d`. The string parser's jump table at `0x14254998c` and UTF-8 prefix table at `0x142c053a0` are separately retained as data with hashes in `reference.json`. LLVM labels based on the nearest PHYSFS export do not name these internal functions.

## File loader boundary

`0x1420dc3a0` constructs two empty vectors at result offsets `+0` and `+0x18`. It checks the literal `dlc_load.json` at `0x142b6ef28` via `0x142561180` at call site `0x1420dc3d1`. That helper requires a nonempty C string and calls the named `PHYSFS_exists` entry. The search context is consequently the already configured virtual filesystem, not a proven OS working directory or launcher user-data directory.

If absent, it returns the two empty vectors. If present, it constructs the file wrapper through `0x142564a20`, obtains size through `0x142564f60`, and compares unsigned `RAX` with `0x1000000` at `0x1420dc441` (`48 3d 00 00 00 01`). `JBE` at `0x1420dc447` permits exactly 16 MiB. Larger sizes log and skip reading. A size failure represented by a large unsigned result would also follow this gate; the backend error mapping has not been ported.

It reads through `0x1425658f0`; read failure logs `Failed to read '%s'.` at `0x142b6ef68`. On success it calls buffer conversion `0x14255a5f0` with `R8D=0` at `0x1420dc4b2`, then passes the resulting C string to parser thunk `0x142548a30` at `0x1420dc4c5` (`e8 66 c5 46 00`). That thunk jumps to `0x142548ec0`.

This byte-buffer conversion is outside the current executable port and oracle. Its false branch visibly handles carriage-return bytes specially, copies segments with `0x14018e430`, then constructs a C string using a zero-terminated length scan. A trailing carriage return reaches the empty-string branch at `0x14255a9e6..0x14255aa0c`. Do not equate the port's already converted C-string input with arbitrary raw file bytes, or claim the full preprocessing path was dynamically validated.

For a nonnull parser result, the loader looks up `disabled_dlcs` first (key VA `0x142b6efd0`, lookup call `0x1420dc4dc`) and `enabled_mods` second (key VA `0x142b6efe0`, lookup call `0x1420dc4fe`). Each nonnull value is sent to `0x1420e1b10`. Missing keys and a null root parser result leave the corresponding initialized vectors empty. This function has no explicit malformed-JSON diagnostic. It releases the JSON graph, converted string, buffer and file wrapper along the observed success/failure cleanup paths.

## Exact parsing and selection projection

Implementation: [selection.ts](../../src/games/iron-meridian/native/selection.ts). Tests: [native-selection.test.ts](../../tests/games/iron-meridian/native-selection.test.ts).

`readNativeSelectionJson` accepts the C-string bytes at the parser boundary, plus an explicit native case-folding dependency. It returns the selected byte strings, their original order, and extraction diagnostics. It does not use `JSON.parse` or normalize data into a JavaScript object.

The native closure establishes:

- Whitespace means any nonzero byte at most `0x20`, not only standard JSON whitespace.
- Root parsing accepts the first successfully parsed value and does not require the remaining bytes to be empty. Literal parsing matches the `null`, `false`, and `true` prefixes. These literals have no string payload.
- Object member order and duplicate keys are retained. Lookup walks linked children from `node+0x10` and returns the first matching key from `child+0x38`.
- Lookup is case folded through `0x1425e1d60`. When global `0x143694ccc` is zero it only maps ASCII `A..Z` to `a..z`. When nonzero it calls `0x1425e1af8`. The current machine's runtime value and locale were not observed. `foldNativeSelectionAsciiByte` is explicitly the zero-global fast path, not a claim about the effective installed locale.
- Initial comparisons sign-extend bytes. The mismatch branch at `0x142548e72..0x142548e84` repeats folding with zero-extended bytes and subtracts the 32-bit results. If those compare equal, it accepts the member immediately. The port preserves both calls and their order. Explicit synthetic locale vectors verify this early acceptance behavior, including a key with an otherwise wrong suffix.
- Child count `0x142548dd0` and indexed lookup `0x142548db0` follow `child+0x10` and the sibling-next link without checking type. Therefore an object used as a selection value yields its member values in order. A scalar selection value has no children and yields an empty list.
- String getter `0x1401693c0` is exactly `mov rax,[rcx+0x20]; ret` (`48 8b 41 20 c3`). It does not check the type tag. Parsed child strings are appended as copied C++ strings; no sort or deduplication occurs in this extractor. Other parsed child values log `Expect only strings in dlcs/mods arrays.` at `0x142b6ef80`, then processing continues. The separate null-child diagnostic at `0x142b6efb0` is not reachable from an intact successfully allocated parser graph with its recorded child count.
- Strings preserve raw bytes without UTF-8 validation and accept raw control bytes. Unknown escapes copy the byte after the backslash. Standard `b/f/n/r/t` escapes map to their control bytes. An unterminated string reaching NUL is accepted by the string parser; containing structures still require their closing delimiter.
- Unicode conversion uses original helper `0x142549270`. Invalid hex yields zero. Zero code points, lone low surrogates and unmatched high surrogates are omitted. A recognized high-surrogate plus `\u` consumes the second escape even if its low surrogate is invalid. Valid pairs emit UTF-8. Thus `"a\u0000b"` becomes byte string `ab`, not `a NUL b`.
- The number scanner accepts forms such as `-`, `-.1`, `01`, and an exponent without digits. It has distinct leading-zero behavior, so `00` fails when the surrounding structure expects a delimiter. The port preserves consumed bytes but does not compute unused numeric payloads. Original number arithmetic and conversion still execute in the oracle, with a declared scalar `pow` leaf and masked floating-point exceptions.

The TypeScript parser uses an explicit frame stack, avoiding JavaScript call-stack depth as a substitute for native nesting rules. It returns `runtime-required/read-beyond-c-string` when the original operation would need bytes beyond the supplied zero terminator. Those bytes can depend on the native allocation and neighboring memory. It does not invent native results for truncated Unicode escapes or a trailing backslash.

This is a projection under successful allocation, ordinary intact parsed-node storage and the supplied folding behavior. It does not reproduce allocator failures, error globals, CRT `errno`, floating-point status flags, unmasked floating-point traps, native stack exhaustion or concurrent graph mutation. Returned arrays and byte strings are independent copies. Active selection choices remain the caller's responsibility.

## Original-instruction oracle

`emulate_selection.py` reads only the hash-bound executable and existing instruction exports. It maps 1,108 original instruction starts, 3,726 instruction bytes, and executes 968 distinct starts across 161 cases. It executes the actual root/value/string/hex/number/array/object parser bodies, key lookup and locale fast path, child count/index functions, extraction loop, string getter and graph destructor. It does not hook complete parser, lookup, extraction or selection outputs.

Eight declared services were visited: successful allocation/free, C++ string construction, log-entry construction and emission, scalar C `strncmp`, scalar `pow`, and an explicit synthetic locale leaf. The extraction destination has supplied successful storage for 1,024 strings so this oracle does not validate vector growth or allocation failure. Numeric `pow` uses Python scalar math; no claim about original CRT status side effects is made. MXCSR is supplied as `0x1f80`. The input-memory hook stops at out-of-C-string reads, so two cases are boundaries, and 159 cases return parsed or failed-parser outcomes.

Cases include ordinary selections, duplicates, first duplicate/case-folded keys, non-array children, ignored scalar values, mixed invalid list elements, raw high bytes and control bytes, all UTF-8 encoding length boundaries, surrogate pairs and invalid pairs, invalid hex, omitted zero code points, trailing text, permissive numbers, SSO boundaries at 15/16 bytes, 129-element lists, explicit locale branches, and deterministic mixed structures. Fold-call argument order is compared against original execution in addition to returned values and diagnostics.

Reference SHA-256: `9fc7db019235e63790fcfc7c8a629019c361702a848b91ffa627c547ea1cb697`.

Validation run:

```text
python -B work/iron-meridian/native-selection/collect.py
python -B work/iron-meridian/native-selection/emulate_selection.py
node node_modules/vitest/vitest.mjs run tests/games/iron-meridian/native-selection.test.ts
  161/161 passed
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --strict --noUncheckedIndexedAccess src/games/iron-meridian/native/selection.ts
  passed
```

These are static byte checks and isolated instruction-emulation/unit evidence. No full project check, build, browser, game launch, actual archive mount or active user-data validation was performed in this task.

## Selection transfer and registry inputs

At `0x1420e0b30`, caller-provided C strings are copied to manager fields `+0x10` and `+0x30`. It calls initializer `0x1420e2430`, then `0x1420e2b90`, then selection loader `0x1420dc3a0`. The initializers clear/populate trees at `manager+0xa0` and `manager+0xb0`, respectively. Their enumeration calls use `.dlc` at `0x1427949c0` and `.mod` at `0x142b6f11c`. Descriptor parsing, entitlement/availability checks and recursive registry insertion are not closed or ported here.

At `0x1420e0b9c..0x1420e0bad`, the caller passes `manager+0x68`, its existing count, and the parsed enabled-mod pointer/count into `0x14018e8e0`. At `0x1420e0bb2..0x1420e0bc3`, it does the same for `manager+0x50` and disabled DLCs. The insertion helper copies the input range and increments destination count. Because each supplied position is the existing count, these are appends, not replacements. The parsed temporary vectors are then destroyed. This proves which mount fields receive each JSON list, without assuming they were initially empty.

## Mount planner and dispatch

The following is static instruction recovery of `0x1420dd340`; the mount routine was not emulated as a whole. Native allocator initialization uses TLS/static guards and indirect allocation calls. No default effective allocator/TLS state is assumed.

Treat `D` as a selected descriptor pointer, equal to its tree-node pointer plus `0x40`. The useful raw fields are:

| Descriptor offset | Observed use |
| --- | --- |
| `+0x08` | String matched by dependency declarations |
| `+0x28` | Name in a mod error log |
| `+0x48` | Selection-list equality key and secondary sort key |
| `+0x68` | Folder string |
| `+0x88` | Archive string |
| `+0xa8`, count `+0xb4` | Dependency string vector |
| `+0xc0`, count `+0xcc` | Replacement-directory string vector |
| `+0xd8` | Nonempty values joined into manager string `+0x80` with `_` |
| `+0x118` | Prefix string joined before relative archive/folder paths |
| `+0x248` | Kind compared with integer `1` |
| `+0x298` | Availability byte used for the first tree only |

1. Traverse the first tree (`manager+0xa0`) in order using `0x1402165a0`. Require the availability byte and skip descriptors whose `D+0x48` key equals any disabled-list string. Append a 16-byte temporary record containing signed priority `0` and pointer `D`.
2. Traverse the second tree (`manager+0xb0`) in order. Append only descriptors whose selection key equals an enabled-list string, with signed priority `10000`. Repeated list strings do not duplicate a tree entry because each descriptor stops at its first match. Unmatched enabled-list strings select nothing here. The two source trees are not deduplicated against each other in this routine.
3. Repeat dependency adjustment while any change occurred (`0x1420dd5a4..0x1420dd699`). For each selected source, cache its current signed priority. For every dependency string, scan all already selected descriptors. Compare the dependency against `D+0x08` by length and raw `memcmp`. If the matching target's signed priority is at least the cached source priority, execute `DEC` on that target's existing 32-bit priority at `0x1420dd653..0x1420dd655`. This decrements by one; it does not assign `sourcePriority-1`. The routine does not auto-select an absent dependency. No cycle diagnostic, overflow guard or bounded iteration limit appears in this observed loop; wrapping and very long/cyclic runs must not be replaced with an invented topological sort.
4. For at most 32 records, `0x1420db1b0` performs insertion sort by signed priority, then `D+0x48` byte string through `0x140216670` (raw unsigned `memcmp` common-prefix comparison, then length). Exact equal records retain insertion order in this body. Above 32 records it calls `0x1420db2e0`; collected merge helpers use the same comparator, but an additional buffer-shortage helper `0x1420da580` remains outside the closed body set. No all-size sort execution is claimed here.
5. Clear manager string `+0x80`, then dispatch selected records in sorted order. Kind `1` prefers nonempty archive, then folder, calling `0x1420e1a70(prefix,path)`. Neither existence check is made in that branch. With neither path, the diagnostic is `DLC without archive nor folder to mount` at `0x142b6f030`, guarded by native diagnostic/once state, with a possible `INT3`.
6. For other kinds with an archive, first call `0x142565fe0` (the C++ string wrapper of PHYSFS existence). If present, call the same join-and-mount helper. If absent, call `0x1425e1aec(archiveCString,"r")`; a nonnull result is passed to `0x1425d1944`, then the archive is requested with an empty prefix. Otherwise log `Could not find archive for mod: %s` and the native diagnostic branch may break. The helper names remain unproven below.
7. For other kinds without archive but with folder, a successful VFS existence check uses joined prefix/folder. If absent, require the absolute-path predicate `0x14256c490`, then status predicate `0x14257fdb0`. A successful predicate copies the folder unchanged. Only a nonempty resulting path is sent to `0x1425660e0`. Failure logs the mod name/path and can enter another guarded diagnostic break.
8. For non-kind-1 records, append nonempty `D+0xd8` to the manager string, separated with literal `_` (`0x14279fd14`). This occurs even after a missing archive/folder path falls through its diagnostics. Its larger application meaning is not inferred from this concatenation alone.
9. Only after all first-pass mount requests, traverse selected records again for replacement directories. Skip a zero replacement count or missing archive/folder. Choose archive before folder. For a relative path, combine prefix and path, insert `/` unless the prefix already ends in `/` or `\`, then normalize backslashes. For an absolute path, copy it without this local normalization. For each nonempty replacement-directory string, call pair writer `0x14255ff40(virtualDirectory,physicalRoot)` at `0x1420de26b` (`e8 d0 1c 48 00`). That already recovered writer normalizes both strings and preserves its own append order. Replacement registration is not conditional on a successful earlier mount result.

`0x14256c490` recognizes an absolute path if its first byte is `/` or `\`, or if it has any nonzero first byte, then `:`, then `/` or `\`. It does not require the first byte to be an alphabetic drive letter. `0x14257fdb0` calls `0x1425ebadc`, requires zero status, and returns a status-byte bit; the underlying Windows status behavior is not closed by the wrapper alone.

`0x1420e2ef0(prefix,path,out)` implements the join and slash normalization. `0x1420e1a70` forwards incoming `RCX/RDX` into that helper and sets only `R8` to a temporary string. The decompiled zero-argument signature is wrong. It then invokes backend `0x142561f10(&CString,1)` at `0x1420e1ab9`. `0x1425660e0` provides the same one-path backend interface for an already formed C string.

Backend `0x142561f10` calls the named `PHYSFS_mount(path,NULL,0)` entry for each path. It ignores the return, frees the previous `global 0x1436917a8` search list if present, obtains `PHYSFS_getSearchPath`, stores the new list there and replaces `\` with `/` in its strings. The call arguments establish a prepend request. Actual archive decoding, duplicate-root handling, successful mount state and resultant root order still depend on the PHYSFS implementation and platform. Sorted descriptor traversal cannot by itself prove final effective root precedence.

## Next bounded work and unresolved dependencies

The completed JSON projection can be connected to explicit supplied C-string bytes and explicit folding behavior today. It selects no active playset on its own. The existing [VFS port](NATIVE_VFS_PORT.md) consumes supplied roots/listings/replacement pairs, and the [configuration loader investigation](CONFIGURATION_LOADING.md) then reaches ordered Lua chunks. Connecting these layers to actual installation state still needs:

- File and carriage-return preprocessing: close `0x14255a5f0` false-branch helper `0x14018e430`, file open resolution `0x142562430`/`0x142565c50`, length `0x142561b70` and read `0x1425627a0`. These resolve the bytes supplied to this parser; the existing JSON tests begin after them.
- Registry content: `0x1420e2430`/`0x1420e2b90` are now located, with important descriptor parse seeds `0x1420dbe20`, `0x1420dbb50`, `0x1420db560`, `0x1420dcf80` and finalization `0x1420e3190`. Entitlements, descriptor validation, archive metadata and enabled availability cannot be invented from the selected tree-node layout.
- Mount fallback: `0x1425e1aec` sets `R8D=0x40` and tail-jumps to `0x1425e1948`; its observed arguments are `(archiveCString,"r",0x40)`. This resembles a CRT shared file-open wrapper, not a substring test, but identity is an inference until the target body is closed. `0x1425d1944` preserves input `RCX`, builds a locale/error context in `RDX`, and calls `0x1425d1788`; its return is ignored by the mount caller. Do not replace these with assumed success.
- Full sorting and runtime state: close `0x1420da580`, validate allocation/buffer branches with original-instruction vectors, and supply valid descriptor/tree state. The dependency priority loop requires its real wrapping/termination boundary, not a generic dependency resolver.
- Filesystem: recover the actual PHYSFS mount/archive closure and status helper `0x1425ebadc`, then collect effective roots under an explicitly authorized runtime or supplied captured state. No active user choices or mount success have been inferred in this report.

These are finite native recovery tasks. The JSON port does not establish a complete HOI4 configuration loader or a playable native-equivalent game.
