# Native mount planning and dispatch

`native/mounting.ts` ports the selection, dependency-priority adjustment, ordering, path dispatch and replacement-registration behavior rooted at native `0x1420dd340`. It operates on supplied native memory and explicit service callbacks. It does not discover active user selections, create effective filesystem mounts or infer roots from a successful mount return value.

The selection parser is documented in [NATIVE_SELECTION_LOADING.md](NATIVE_SELECTION_LOADING.md). This slice starts after registry construction and selection loading. The supplied-listing VFS slice is documented separately in [NATIVE_VFS_PORT.md](NATIVE_VFS_PORT.md).

## Identity and evidence

Original target: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`, 56,535,160 bytes, preferred base `0x140000000`, SHA-256:

`709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`

[native-mounting](../../work/iron-meridian/native-mounting/) contains `collect.py`, 27 bounded LLVM disassemblies, `instructions.json`, `emulate_mounting.py`, `reference.json` and `verification.json`. The collector reads the original PE and checks decoded instruction bytes against it. The emulator repeats the window hash checks and permits execution only at verified original instruction starts or declared service hooks. Ghidra C exports assisted interpretation; the original bytes determine the claims.

The complete 4,218-byte planner window is `[0x1420dd340,0x1420de3ba)`, file offset `0x20dc740`, SHA-256 `34e343176e52f28bd0fd9025797f0b6390f600b8768027fd86b2b34bf2cb09b6`. The earlier selection report retained an envelope ending one byte earlier. These are different, explicitly bounded envelopes of the same executable.

Selected entry addresses:

| Original entry | Recovered role |
| --- | --- |
| `0x1420dd340` | Registry traversal, selected records, dependency passes, dispatch and replacements |
| `0x1402165a0` | In-order tree successor |
| `0x14011d870` | C++ string equality |
| `0x1420da490`, `0x1420da580`, `0x1420da770`, `0x1420da900` | Insertion, merge and sort closure |
| `0x1420dac10`, `0x1420daef0`, `0x1420db1b0`, `0x1420db2e0` | Additional merge/sort paths |
| `0x140db35d0`, `0x140240820` | Rotation and record-copy closure |
| `0x140216670`, `0x1426078d0` | Complete record comparator and unsigned byte comparison |
| `0x1420e2ef0` | Prefix/path join and slash normalization |
| `0x14256c490` | Absolute-path predicate |
| `0x1420e1a70`, `0x1425660e0`, `0x142561f10` | Mount wrappers and search-path refresh |
| `0x142565fe0`, `0x142561180` | Nonempty C-string existence wrapper |
| `0x14254f940`, `0x1424e7b40`, `0x142608410` | Slash normalization, search and byte scan |
| `0x14255ff40` | Normalized replacement-pair writer |

`instructions.json` records each window's exclusive end, file offset, hash and disassembly identity. Windows may include alignment bytes; mapped starts, visited starts and full-window bytes are separate measurements.

## Memory and service contract

The port accepts `NativeMountMemory`, manager address, `NativeMountDependencies`, GS base and a finite dependency-visit budget. All pointer arithmetic is reduced to unsigned 64 bits. Supplied trees, strings, vector extents, TLS and search-path lists must be valid for the native accesses performed. Negative malformed vector counts, invalid pointers, concurrent changes and native exception representations are outside this contract.

Native C++ strings have data or inline storage at `+0`, length at `+16` and capacity at `+24`; capacity above 15 selects the data pointer. Strings remain bytes, including embedded NULs, until a native C-string boundary truncates them. Ordering and equality use unsigned bytes and length, with case preserved. The host's `writeString` adapter supplies successful C++ string storage, including capacity changes, and copies its input. `appendReplacement` supplies successful global vector storage and copies both inputs. Actual allocator failure and exception behavior for these storage operations are not reconstructed.

The planner reads TLS index `0x143693a98`, the TLS pointer array through `GS+0x58`, and the thread guard at TLS block `+0x20ec`. If signed global guard `0x1433dd120` exceeds that thread guard, the port stops at the explicit allocator-initialization boundary `0x1425a0588`. It does not assume the initializer's result.

The first tree head is manager `+0xa0`, the second `+0xb0`. Nodes use left `+0`, parent `+8`, right `+16` and sentinel byte `+25`. Descriptor storage begins at node `+0x40`.

| Supplied layout | Use |
| --- | --- |
| manager `+0x50`, count `+0x5c` | Disabled first-tree names |
| manager `+0x68`, count `+0x74` | Enabled second-tree names |
| manager `+0x80` | Aggregate string updated after planning |
| first-tree node `+0x2d8` | Eligibility byte |
| node `+0x88` | Selection key compared against supplied lists |
| descriptor `+8` | Dependency identity |
| descriptor `+0x48` | Sort key |
| descriptor `+0x68`, `+0x88` | Folder and archive strings |
| descriptor `+0xa8`, count `+0xb4` | Dependency-string vector |
| descriptor `+0xc0`, count `+0xcc` | Replacement-string vector |
| descriptor `+0xd8` | Aggregate component string |
| descriptor `+0x118` | Prefix string |
| descriptor `+0x248` | Dispatch kind |

## Selection, dependency passes and ordering

The first tree is visited in tree order. Eligible nodes whose key is absent from the disabled vector become records with signed dword priority 0. The second tree is then visited in tree order; keys present in the enabled vector become records with priority 10,000. Selection-list order does not reorder records, and duplicate names in a list do not append additional records.

Each dependency pass visits selected source records in their current order. The source priority is captured once for that visit. Every dependency name is compared with every selected target descriptor's identity. A target whose signed priority is at least the captured source priority is decremented by one with dword wrapping. This decrements the target's existing priority, rather than assigning source priority minus one. Missing dependencies are not automatically selected. Passes repeat while any decrement occurs.

The exact adjustment block `[0x1420dd64c,0x1420dd65a)` is `8b03413bc67c07ffc8890341b701`, SHA-256 `bac5a70f8f4fb729bbb378eb083d0530c0028d4beaefad31702bf7013a96ddc7`. Its signed `CMP/JL` and dword `DEC` were executed independently for 49 pairs including signed limits and wraparound.

The execution budget counts entries at original PC `0x1420dd5d0`, immediately before each source-record visit. Exhaustion returns the selected records and priorities already produced, without sorting, clearing the aggregate or issuing mounts. Empty selection needs no visits. Cyclic or very long cases therefore have an explicit partial-state outcome. This outcome is not a substituted dependency resolver, and calling the planner again is not a native continuation protocol.

After a converged pass, ordering is ascending signed priority, then unsigned raw sort-key bytes and length. The recovered original insertion/merge closure is stable for equal complete comparator results. The TypeScript port uses the stable JavaScript sort with that comparator. Original sort execution covers sizes through 1,025, equal keys, temporary-buffer success and allocation failure, stack-buffer fallback, rotations and the original record-copy helper. The planner then clears manager `+0x80`.

## Path dispatch and ordered effects

The absolute-path predicate accepts a leading slash or backslash. It also accepts any nonzero first byte followed by colon and slash or backslash. It does not require an ASCII drive letter. Joining uses C++ lengths, inserts one slash only when both operands are nonempty and the prefix lacks a terminal slash or backslash, then changes every backslash to slash.

For descriptor kind 1, archive takes precedence over folder. The selected path is joined with the current prefix and mounted without an existence check. If neither archive nor folder is present, the guarded DLC diagnostic runs. This kind does not append an aggregate component.

For other kinds, archive again takes precedence. The archive is first checked through the virtual-filesystem existence service. On success, current prefix and archive fields are reloaded for joining. On absence, the current archive C string is opened using mode `r` and share mode `0x40`. A nonzero handle is closed, then the current archive string is reloaded and joined with an empty prefix for mounting. Open failure invokes diagnostic before logging.

For a folder, VFS existence success joins the reloaded prefix and folder. On absence, an absolute path is checked through the explicit platform directory predicate. A valid directory copies the current folder string directly, preserving backslashes in the mount request. Failure logs before the guarded diagnostic. Only a nonempty folder result is mounted.

After a nonbreaking other-kind path, a nonempty current aggregate component is appended to manager `+0x80`, with underscore when the aggregate is already nonempty. Descriptor fields are reloaded where native code reloads them after callbacks. Oracle mutation cases change archive, folder, prefix, aggregate and replacement data during existence, close, directory, mount and search-path callbacks to verify this timing.

The backend calls the explicit `PHYSFS_mount` leaf at `0x14257a1c0` with the C-string path, null mount point and append flag 0. Its return value is ignored. The old search-path global `0x1436917a8` is read after the mount callback. A nonnull old list is freed through `0x142579040`, then the global is cleared. The return pointer from `0x1425798f0` is stored as the new global; native list strings are normalized in place from backslash to slash. Lists and their memory are supplied service results. The port does not manufacture a successful mount or effective root list.

After all dispatches, a second pass registers replacements, even when an earlier supplied mount call returned failure. Archive is preferred to folder; a missing physical path skips registration. Absolute paths are copied, relative paths are joined to the current prefix. Each nonempty C++ replacement string is converted to a C string and normalized, as is the physical root, before the successful storage adapter appends the pair. Embedded NULs can therefore truncate a nonempty C++ replacement to an empty registered C string.

Diagnostics use the recovered global enable bytes and per-site once bytes. The explicit diagnostic leaf returns the once byte and whether the native breakpoint is taken. Break outcomes identify original `INT3` PCs `0x1420dd974`, `0x1420dda64` and `0x1420ddbe4`. Missing service callbacks stop immediately before the corresponding call and preserve earlier effects. This includes stops after a mount request, during search-path refresh, or between archive open and close. These partial results are not transactional or retry-safe.

## Oracle protocol and checks

`emulate_mounting.py` uses portable Unicorn 2.1.4 and the original executable bytes. It maps 2,969 verified instruction starts comprising 11,287 original bytes; 2,309 distinct starts are visited by the full planner vectors. All native sort helper entries are reached. There are 27 declared hooks, of which 23 are visited. Original planner, dependency loop, tree iterator, comparator, sort/rotation/copy, join, absolute predicate, mount/search-path wrapper, slash scanning and pair-writing instructions execute. No complete planner, sorting result, path result, root result or replacement result is hooked.

Declared leaves provide successful allocator/string storage and release, standard copy, stack probing, platform/CRT/PHYSFS services and diagnostic/logging services. The temporary-sort-buffer allocator separately has explicit failing cases. Main string/vector allocation failures and native exceptions remain outside the successful-storage adapter contract. The directory-status wrapper is deliberately a declared platform leaf. Search-path responses, initial globals, raw descriptor/tree memory, callback mutations and platform replies are fixture inputs, not observations of installed machine state.

Scratch selected records are inspected after the logical release hook, which deliberately does not overwrite them. This is an emulator observation of work state, not a claim that real freed storage remains valid. The fixture heap and valid container extents are bounded. The emulator's overall instruction ceiling is a harness failure guard, while dependency-budget exhaustion is an intentional result at its exact original PC.

The 114 full planner vectors produce 94 returns, 10 missing-runtime stops, 7 dependency-budget stops and 3 original diagnostic breaks. The additional 49 original adjustment-block vectors cover signed comparison and wrapping. Scoped Vitest passed 163/163 cases. Assertions compare outcome and stop PC, selected descriptor pointers and priorities, visit counts, ordered callback arguments, mounts, replacement writes, aggregate bytes, search-path pointer and normalized bytes, and once bytes. The TypeScript source also passed a scoped strict ES2022 check with `noUncheckedIndexedAccess`.

Reference JSON SHA-256:

`1bedf31ebaeb9a8a5bc26bb79823a2234cfa2ab6002661202dab6cf6ff7bb55e`

`verification.json` records source, test, report, collector, instruction-ledger, emulator and reference hashes. No full project check, build, browser, game process, active selection read, actual PHYSFS mount or Ghidra-project access was performed for this slice. The evidence establishes this supplied-state and supplied-service port; native registry construction, machine filesystem behavior and effective mount precedence remain separate integration work.
