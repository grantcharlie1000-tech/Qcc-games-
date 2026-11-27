# Native configuration loading

The installed executable embeds an implementation identifying itself as **Lua 5.1.1**. Its define-loading path executes Lua chunks in one fresh context, then reads the resulting `NDefines` table into registered native globals. Extracting assignments or numeric literals from files does not reproduce that path.

This report recovers configuration behavior from `hoi4.exe`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`, preferred image base `0x140000000`. It uses original file bytes, bounded LLVM disassembly, selected parent-owned Ghidra exports, shipped text, the official Lua source distribution, and separately labeled emulation of call-free conversion instructions. The game and its scripts were not executed. No installation files, user configuration, or parent-owned Ghidra project were modified or opened by this worker.

## Lua version and reusable source

The executable's 140-byte, null-terminated `lua_ident` payload starts at file offset `0x2ba7fe0`, RVA `0x2ba8de0`, VA `0x142ba8de0`. It contains the release string `Lua 5.1.1`, the 1994-2006 Lua copyright declaration, authors, and Lua.org URL. Its SHA-256 is `cc390cd2d7fa5e88c11e8c849b0d359e2f9f10d1049f015643d2a737ac81eab3`. The complete payload exactly matches the string composed by official 5.1.1 `src/lapi.c` and `src/lua.h`. Shipped `licenses.txt:864` independently names Lua 5.1.1; line 903 names Luabind 0.9.1.

The official Lua 5.1.1 source archive was downloaded for inspection under [`work/iron-meridian/native-config`](../../work/iron-meridian/native-config/). Its 207,810 bytes hash to `c5daeed0a75d8e4dd2328b7c7a69888247868154acbda69110e97d4a6e17d1f0`, matching the checksum published by [Lua.org](https://www.lua.org/ftp/). The archive and selected original members are retained with their provenance and original `COPYRIGHT` notice. Lua is distributed under its [MIT license](https://www.lua.org/license.html). No source interpreter was built, installed, or executed by this worker.

The release identifier alone cannot prove that every interpreter function is unmodified. The following independently inspected native roles match the official implementation structurally:

| Native VA | Recovered role | Primary source comparison |
| --- | --- | --- |
| `0x1422132c0` | `luaL_newstate` | Calls the state allocator with null userdata, then installs a panic callback on success. `src/lauxlib.c` |
| `0x1422150f0` | `luaL_openlibs` loop | Walks a name/function table, pushes a C function and its name, and calls with one argument and zero requested results. `src/linit.c:30-37` |
| `0x142212ff0` | `luaL_loadbuffer` | Creates `LoadS(buffer,size)` on the stack and supplies its address plus a fixed reader to `lua_load`. `src/lauxlib.c:608-613` |
| `0x142211310` | `lua_pcall` | Preserves arguments/result counts, converts the error-function index, builds the protected-call descriptor and handles `LUA_MULTRET`. `src/lapi.c:801-818` |
| `0x14221fb60` | Base library initialization | Uses globals pseudo-index `-10002`, installs `_G` and `_VERSION`, and initializes `ipairs`, `pairs`, `newproxy`, and coroutine bindings. `src/lbaselib.c:616-641` |

This supports reusing the matching upstream source for a candidate browser configuration VM, with recovered native adapters. It is stronger evidence than choosing a modern Lua implementation by API similarity. It does not establish whole-interpreter parity or erase the native environment differences below. Detailed identities and source comparisons are in [`lua-identity.json`](../../work/iron-meridian/native-config/lua-identity.json) and [`upstream-lua-source.json`](../../work/iron-meridian/native-config/upstream-lua-source.json).

## Native Lua environment

Context constructor `0x1420d5ae0` creates a new state at instruction `0x1420d5b88`, initializes libraries at `0x1420d5b93`, then calls the Luabind initialization entry `0x14222d020` at `0x1420d5b9b`. A once-only `.lua` handler registration points to `0x1420d9140`; that handler's complete effect is not recovered here.

The name/function table at VA `0x142ba9120` contains:

| Name | Native function |
| --- | --- |
| Base, empty name | `0x14221fb60` |
| `package` | `0x142226ad0` |
| `table` | `0x142220780` |
| `io` | `0x1402b3e00` |
| `os` | `0x1402b3e00` |
| `string` | `0x142223830` |
| `math` | `0x142224e20` |
| `debug` | `0x142225f60` |

Both `io` and `os` point to the exact six-byte stub `b8 01 00 00 00 c3`, `mov eax,1; ret`. It performs no library/table initialization. The loop requests zero results and discards the return. Calling stock upstream `luaL_openlibs` would therefore introduce `io` and `os` behavior not supplied by this observed native path. Match the native initialization table, then recover any later host bindings separately. A table entry's name does not establish that its standard library implementation runs.

The upstream source's numeric default is `double` in `src/luaconf.h:503-504`. The recovered define-conversion wrapper separately narrows a numeric result to float32 before scaling to the native fixed integer representation. Preserve that engine conversion after actual Lua evaluation; the VM's internal numeric type and the native fixed-value conversion are different stages.

### Integer API width

The native integer API width is supported by original conversion instructions, independently of the Lua version string or upstream `LUA_INTEGER=ptrdiff_t` default. The recovered native counterparts of both `lua_pushinteger` and `lua_tointeger` use signed 64-bit integers and binary64 Lua numbers:

| Recovered source counterpart | Complete native range, end exclusive | Decisive instruction |
| --- | --- | --- |
| `lua_pushinteger`, `lapi.c:433-438` | `[0x1422114d0,0x1422114ed)`, 29 bytes | At `0x1422114d7`, bytes `f2 48 0f 2a c2`: `cvtsi2sd xmm0,rdx`, consuming the signed 64-bit second argument. |
| `lua_tointeger`, `lapi.c:319-330` | `[0x142211dc0,0x142211df0)`, 48 bytes; unwind RVA `0x2e7a8b0` | At `0x142211de6`, bytes `f2 48 0f 2c 00`: `cvttsd2si rax,qword ptr [rax]`, truncating a binary64 number into the signed 64-bit return register. |
| `lua_pushnumber`, `lapi.c:425-430` | `[0x1422115a0,0x1422115b5)`, 21 bytes | Direct `movsd [rax],xmm1` at `0x1422115a4` confirms the neighboring floating-number storage path. |
| `lua_tonumber`, `lapi.c:309-316` | `[0x142211e90,0x142211ec2)`, 50 bytes; unwind RVA `0x2e7a8b0` | Same lookup and fallback structure as the integer read, followed by `movsd xmm0,[rax]` at `0x142211eb9`. |

These identifications use the complete bodies and their source structure. The integer push reads `L->top` from `[RCX+0x10]`, converts `RDX` to binary64, stores numeric type tag `3` at `[top+8]`, stores the number at `[top]`, and advances top by 16 bytes. The neighboring floating push performs the same tag/stack operations without integer conversion. Both are leaf functions with no unwind entry; their retained boundaries end immediately after `ret`, before padding and the next entry.

The integer and floating reads both call `0x1422108d0`, inspect numeric tag `3`, and use `0x14221cd60` with a stack temporary when conversion is needed. Index helper `[0x1422108d0,0x14221098f)` matches the official positive-index, negative-index and registry/environment/globals pseudo-index branches in `lapi.c:49-76`. Fallback `[0x14221cd60,0x14221cdb6)` matches `luaV_tonumber` in `lvm.c:35-44`: return the original object for tag `3`; for string tag `4`, call string conversion `0x142215790` and fill a binary64 numeric temporary with tag `3` on success; otherwise return null. If that fallback returns null, the integer API returns the zero already in `RAX`. The successful numeric path ends in the explicit signed 64-bit truncation above. The string parser's exact accepted syntax and boundary behavior were not recovered in this follow-up.

This establishes a signed 64-bit `lua_Integer` API requirement for a portable candidate. A verified 64-bit `long long` typedef can implement that requirement on WebAssembly32, where blindly inheriting a narrower pointer-difference type would change the API behavior. The binary does not reveal whether the original C typedef was spelled `ptrdiff_t`, `long long`, or another signed 64-bit type. It also does not imply a distinct exact-integer Lua value representation: the push stores an ordinary binary64 number with numeric tag `3`, so arbitrary 64-bit integers need not retain every low bit. Exact source identity, unrelated internal integer fields, and every Luabind adapter remain separate questions.

[`lua-integer-api-scan.json`](../../work/iron-meridian/native-config/lua-integer-api-scan.json) retains the target hash, source hashes, full function bytes, file offsets, unwind or leaf-boundary basis, bounded LLVM output identities, and source correspondence. [`lua_integer_api.py`](../../work/iron-meridian/native-config/lua_integer_api.py) collected the API-region candidates and six independently disassembled bodies. The decisive operands are `RDX` and `RAX`, not `EDX` or `EAX`; other 32-bit conversion candidates in the broader region are not treated as integer API evidence. This width-recovery pass used static disassembly only, with no emulation, native process, build, browser, project checks or Ghidra project access.

A subsequent authorized emulation pass generated independent original-instruction vectors in [`integer-api-vectors.json`](../../work/iron-meridian/native-config/integer-api-vectors.json), reproduced by [`integer_api_vectors.py`](../../work/iron-meridian/native-config/integer_api_vectors.py). Its 97 pushes execute the entire original leaf with signed 64-bit `RDX`, a supplied native state and writable top entry. Its 114 reads execute the entire original `lua_tointeger` numeric success path, including the original `index2adr` helper, with index `1` and a supplied type-`3` stack value. There are no helper stubs or hooks that change execution. An instruction hook checks the exact seven-instruction push path or eighteen-instruction read path, and the harness checks the number bits, tag, stack advancement, return qword, and unchanged read input. Code, verifier, target and Unicorn DLL hashes are retained.

All 211 vectors matched an independent integer/rational reference under declared `MXCSR=0x1f80`: nearest/even rounding, FTZ/DAZ off and SIMD exceptions masked. Inputs include both zero signs, positive/negative `1.9`, subnormals, infinities, NaNs and huge numbers; exact `-2^63` and its adjacent doubles; the greatest double below `+2^63` and `+2^63`; signed 64-bit push limits; and `2^53` neighbors including `2^53+1` and `2^53+3`. Raw number/qword inputs and outputs are hexadecimal; signed integers are decimal strings to avoid JSON precision loss. The original push rounds `INT64_MAX` to binary64 `+2^63`, whose subsequent original integer read produces the invalid-conversion qword `0x8000000000000000`. Reading exact `-2^63` produces the same qword as a valid conversion. This artifact tests original bytes and supplied state, separately from any upstream or candidate WebAssembly tests. Actual game MXCSR, physical CPU exception flags and process parity remain unobserved.

## Define-loading path

The central routine is `0x140792cf0` through `0x140793432`, an 1,858-byte unwind range. Parent Ghidra export `exports/research-closure/140792cf0.c` and retained disassembly agree on this order:

1. Construct the virtual path `common/defines`. At `0x140792d23` the code copies its first bytes using `movsd`, with further integer loads completing the string. A LEA-only literal xref search misses this reference.
2. At `0x140792dbf`, call enumeration wrapper `0x142560e60` with extension-filter string `lua` at VA `0x1429b3a10`. The output is a vector of names. The wrapper delegates underlying selection and ordering to `0x14255e970`.
3. At `0x140792dc9`, construct a fresh Lua context using `0x1420d5ae0`.
4. Iterate the names in the returned vector's order. Build each path under `common/defines`, then call `0x1420d64a0` at `0x140792f63`. The same context is used for every file in this pass.
5. If any execution returns nonzero, enter the error path and return before the native define-registry loop. The diagnostics say the defines will not be reloaded. Prior chunks may already have changed the temporary Lua context, but this failure path does not commit that partial table through the observed native registry loop.
6. After all chunks succeed, obtain global `NDefines`, with its exact string reference at `0x14079301b`.
7. Load the registry count from global `0x1433e5dec` and pointer array from `0x1433e5de0`. At `0x1407930f9`, call each object's first virtual entry, passing the resulting table handle.
8. Call define validation routine `0x1407940d0` at `0x1407932f1`. If the routine's input flag is nonzero, additional refresh/listener work follows. That flag's complete startup/reload call context remains separate from script evaluation.

The file executor is a 260-byte routine at `0x1420d64a0` through `0x1420d65a4`. It reads the virtual file's bytes, passes `(state, buffer, size, filename)` to recovered `luaL_loadbuffer` at `0x1420d6544`, and on success invokes recovered `lua_pcall(state,0,0,0)` at `0x1420d655a`. Failures use a separate Lua error-reporting helper. The original chunks are parsed and executed as Lua code. Their expressions, tables, assignments, functions, dependencies, and preceding mutations affect the final table.

The three ordinary files currently in base `common/defines` are `00_defines.lua`, `00_graphics.lua`, and `01_career_profile.lua`. Their first globals are respectively `NDefines`, `NDefines_Graphics`, and `NDefines_CareerProfile`. The career script's final loop merges its nested tables into `NDefines`; `NCareerProfile` is then a field of that table. This filename/source inventory is not a claim about the effective mounted file set or order. Identities are retained in [`configuration-evidence.json`](../../work/iron-meridian/native-config/configuration-evidence.json).

The separate shipped `script/autoexec.lua` calls `require('00_defines')` and appends package paths, with a comment saying the path setup does not currently work. It documents another script entry point. Its comments and presence do not replace the concrete native define-loader sequence above or establish that autoexec runs in this fresh define context.

## Native define registration

The recovered minimum-speed helper instance is at VA `0x1431023d0`, initialized with vtable VA `0x1428d7788`. That vtable's first entry is loader `0x1409ff870`; its second is qualified-name getter `0x140792b70`. The loader's exact key/global association is documented in [NATIVE_INVENTORY.md](NATIVE_INVENTORY.md#minimum-research-speed-binding).

Registration routine `0x1400698b0` through `0x1400698d6` is 38 bytes. At `0x1400698b4`, bytes `48 8d 05 15 8b 09 03` load the helper-instance address. At `0x1400698c5`, bytes `48 8d 0d 14 c5 37 03` load registry vector `0x1433e5de0`. At `0x1400698cc`, bytes `e8 8f 84 0b 00` call common pointer-insertion helper `0x140121d60`. A readonly initializer-pointer location at VA `0x14278ba48`, file offset `0x278ac48`, contains this registration routine's address. These are static wiring facts, not an observation of a startup executing the constructor.

The later registry loop supplies the evaluated `NDefines` table to each registered loader. The minimum-speed loader then finds `NTechnology.MIN_RESEARCH_SPEED`, writes the native global, and applies its nonnegative constraint. Directly parsing the shipped text bypasses Lua execution, mounted-file selection, registry conversion, and validation.

## Native numeric conversion

The numeric branch of `0x1420d8ab0` calls float-returning helper `0x1420d5a30` at `0x1420d8baf`. That helper calls a double-returning Lua API candidate at `0x1420d5a7b`, then narrows its return with `cvtsd2ss xmm6,xmm0` at `0x1420d5a83`. The narrowing instruction's exact bytes are `f2 0f 5a f0`. The helper later copies the narrowed value into its float-return register at `0x1420d5a94`. Numeric type lookup, Lua value extraction, and the intervening stack helper were not emulated or replaced with assumed implementations.

The fixed conversion itself is a call-free, 47-byte range `[0x1420d8bb4,0x1420d8be3)`. Its input is the low float32 lane of `XMM0`; `R12` starts at zero, established by the original `xor r12d,r12d` at `0x1420d8add`; `R13` supplies the destination pointer saved from `R8`. All instructions and RIP-relative constants were checked against the original file bytes:

| VA | Instruction | Effect |
| --- | --- | --- |
| `0x1420d8bb4` | `xorps xmm1,xmm1` | Zero comparison operand. |
| `0x1420d8bb7` | `comiss xmm0,xmm1` | Ordered comparison with zero. |
| `0x1420d8bba` | `setae r12b` | One for nonnegative ordered values, including negative zero; zero for negative values or NaN. |
| `0x1420d8bbe` | `movd xmm2,r12d` | Transfer the indicator. |
| `0x1420d8bc3` | `cvtdq2ps xmm2,xmm2` | Convert the indicator to float32. |
| `0x1420d8bc6` | `mulss xmm0,[0x14279dd78]` | Multiply by float32 `100000.0`, constant bytes `00 50 c3 47`. |
| `0x1420d8bce` | `addss xmm2,xmm0` | Add the scaled number to the indicator, rounding to float32. |
| `0x1420d8bd2` | `subss xmm2,[0x14279dd64]` | Subtract float32 `0.5`, constant bytes `00 00 00 3f`. |
| `0x1420d8bda` | `cvttss2si rax,xmm2` | Truncate to signed 64-bit integer. |
| `0x1420d8bdf` | `mov [r13],rax` | Store that integer. |

Under the explicitly supplied `MXCSR=0x1f80`, let `f32` mean binary32 rounding to nearest with ties to even. The recovered data conversion is:

```text
f = f32(lua_number_double)
indicator = ordered(f >= 0) ? 1.0 : 0.0
scaled = f32(f * 100000.0)
added = f32(indicator + scaled)
adjusted = f32(added - 0.5)
result = truncate_signed64(adjusted)
```

The isolated emulation returns `INT64_MIN`, bit pattern `0x8000000000000000`, when the final truncation is invalid because its operand is NaN, infinite, or outside the signed 64-bit range. A valid exact `-2^63` has the same result bits. The later minimum-speed loader's signed negative branch stores zero after warning calls, assuming those helpers return. Those calls and the clamp were not emulated; the vector column showing the later clamp is a calculation from the recovered static branch. A portable implementation needs an explicit invalid-conversion rule, a positive exclusive bound of `2^63`, and a negative inclusive bound of `-2^63`. An unchecked C cast, a trapping WebAssembly conversion, or a saturating conversion does not by itself reproduce this path.

[`verify_numeric_conversion.py`](../../work/iron-meridian/native-config/verify_numeric_conversion.py) maps only two code pages, a constant page, and scratch output. It executes the original narrowing and return-copy blocks independently, then the original fixed block. It never executes a call. Every executed address and instruction size must belong to the recorded slices. [`numeric-conversion.json`](../../work/iron-meridian/native-config/numeric-conversion.json) retains source and slice hashes, exact bytes, file offsets, unwind boundaries, inputs, intermediate float32 bits, comparison indicator, integer destination, emulator version, and all 482 vector results. Those comprise 280 direct float32 inputs and 202 binary64 inputs, covering signed zero, subnormals, half-step neighbors, float32 arithmetic boundaries, exact binary64-to-float32 ties and neighbors, finite overflow, both infinities, quiet/signaling NaNs, and 256 seeded bit patterns. All matched an independent reference using exact rational arithmetic and integer ties-to-even rounding at each float32 stage. NaN classification is compared; exact NaN payload propagation is retained but not a parity gate.

Examples show why the instruction sequence must remain intact:

| Supplied float32 bits | Intermediate result | Original signed output |
| --- | --- | --- |
| `0x3dcccccd`, about `0.1` | Scaled `10000`, adjusted `10000.5`. | `10000` |
| `0x36a7c5ab`, just below `0.000005` | Scaled `0.4999999403953552`; adding one rounds to `1.5`, then subtracting `0.5` produces `1`. | `1` |
| `0x4327c5ad` | Scaled `16777218`; adding one rounds to `16777220`, then subtracting `0.5` retains it. | `16777220` |
| `0x56a7c5ab` | Adjusted remains below `2^63`. | `9223370937343148032` |
| `0x56a7c5ac` | Scaling rounds to `+2^63`; final conversion is invalid. | `-9223372036854775808`, later minimum-speed clamp gives `0` |

Combining the positive indicator and subtraction into a single `+0.5` changes the second example to `0` and the third to `16777218`. Preserve each float32 operation and prevent compiler contraction or reassociation. The actual game's rounding mode, exception masks, FTZ/DAZ settings, and runtime inputs were not observed. Unicorn 2.1.4 left recorded MXCSR exception flags unchanged across these vectors, so this experiment establishes value results under the declared emulation conditions and does not validate physical CPU exception flags or native process parity.

## DLC, mods, and ordering boundary

The define loader goes through the game's virtual filesystem. In `0x14255e970`, exact call sites include exported `PHYSFS_enumerate` at `0x14255eba3`, with callback `0x14255f720`, and exported `PHYSFS_getRealDir` at `0x14255ee35`. Parent export `broad-analysis/prepass/14255e970.c` establishes that files are emitted through an in-order traversal of a red-black tree. The subsequently exported callback establishes the tree relation: compare filename bytes over the shorter length using `0x1426078d0`, then compare lengths if the common prefix matches. That comparison helper uses unsigned bytes, including its byte-swapped word path, without case folding. The resulting file-name order is ascending bytewise lexicographic order, with a shorter equal-prefix name first. Equal names do not create or replace a tree entry, so the first callback insertion retains its metadata. This callback fact does not alone establish which physical file a later VFS read resolves.

Directory processing follows the current directory's files. Callback branches append directory strings through `0x1420d9870`; the containing enumeration function then calls sort wrapper `0x140658b70` at `0x14255eff2` and adjacent-duplicate compaction `0x14255e660` at `0x14255f013`. For counts up to 32, the sort wrapper calls insertion-sort body `0x14059c160` at `0x140658bad`. Its comparisons at `0x14059c20a` and `0x14059c28c` establish the same ascending unsigned-byte/length order. Counts above 32 enter `0x14059c340` at `0x140658c51`; that body delegates to `0x14059b750` and `0x14059b290`. Their subsequent recovery and original-instruction validation establish the large-list comparison path within the supplied-listing port's scope, recorded in [NATIVE_VFS_PORT.md](NATIVE_VFS_PORT.md). Compaction `0x14255e660` removes adjacent equal-length, byte-identical names and returns the new end while preserving surviving order. Its comparison calls are at `0x14255e6bd` and `0x14255e71d`.

Recursion follows the compacted directory list. The define wrapper passes `-1` for the depth control. The inner guard treats values below one as unbounded recursion, and the recursive call at `0x14255f3c7` increments depth. Thus this is a recursive traversal with current files before subdirectories. Wrapper `0x142560e60` preserves the produced name order. [`ordering-evidence.json`](../../work/iron-meridian/native-config/ordering-evidence.json) binds 13 inspected parent C/instruction exports and 1,408 instruction lines to original target bytes, retaining exact comparison and dispatch call sites. These are static reconstruction facts. The separate supplied-listing port and its validation are documented in [NATIVE_VFS_PORT.md](NATIVE_VFS_PORT.md).

The inner function also scans pairs at global `0x1436917b0`, count `0x1436917bc`, matching each pair's virtual-directory field against the directory being enumerated. It resolves the corresponding physical-root index in the null-terminated root list `0x1436917a8` and keeps the smallest index. When that bound exists, each file's `PHYSFS_getRealDir` result must match a root from index zero through that bound before the file is emitted. The structure and behavior support an inferred replacement-path filter. The global names in this paragraph are analysis descriptions rather than recovered symbols. No uninitialized `.data` bytes are treated as live root lists.

Two additional bounded routines connect this filter to native mounting state. Root-list setter `0x14255fe50` through `0x14255feb5` calls exported `PHYSFS_getSearchPath` at `0x14255fe70`, then stores its returned list into `0x1436917a8` at `0x14255fe75`. It also normalizes backslashes to forward slashes in that list. Pair writer `0x14255ff40` through `0x1425601b3` updates the pair pointer at `0x1425600ca`, count at `0x1425600d7`, and increments the count at `0x142560112`. Mount routine `0x1420dd340` calls this writer at `0x1420de26b`, exact bytes `e8 d0 1c 48 00`, while iterating descriptor entries from object offsets `+0xc0` and `+0xcc`. The call supplies one entry string and a physical-root string. These instructions establish a mount-to-filter bridge; the descriptor parser's binding of that vector to `replace_path`, complete list precedence, and active selections remain unresolved. Disassembly is retained as `root-list-setter-14255fe50.asm`, `replacement-path-writer-14255ff40.asm`, and `mount-dlc-1420dd340.asm`.

Selection/mount seeds are independently anchored by the executable:

| Seed | Range | Anchor |
| --- | --- | --- |
| `0x1420dc3a0` | 541 bytes to `0x1420dc5bd` | Reads `dlc_load.json`; references `disabled_dlcs` at `0x1420dc4d2` and `enabled_mods` at `0x1420dc4f4`. Passes those objects into helper `0x1420e1b10`, with destinations at object offsets `0` and `+0x18`. |
| `0x1420dd340` | 4,218 bytes to `0x1420de3ba` | References `DLC without archive nor folder to mount` at `0x1420dd955`. Contains calls to mount-related wrappers and later virtual-path processing. |
| `0x1420e0cf0` | 3,157 bytes to `0x1420e1945` | References `%s/ugc_%llu.mod` at `0x1420e1106`. Useful for mod-descriptor resolution. |
| `0x1420e2b90` | 814 bytes to `0x1420e2ebe` | References extension `.mod` at `0x1420e2c43`. |
| `0x14255f720` | Enumeration callback | Passed directly to exported `PHYSFS_enumerate`; candidate for filename collection and duplicate handling. |

Selection-list helper `0x1420e1b10` obtains a count, visits source indices from zero through count minus one, and appends accepted strings to its destination vector. There is no sorting in that helper. This preserves the getter's iteration order at this stage; the getter, JSON parser and later mount loops still determine the complete selection-to-mount behavior.

`replace_path` exists as a registered parser token, but its first recovered string reference is in the 613,681-byte global token-registration routine. That seed alone does not recover replacement semantics. `dlc_load.json` and enabled-mod strings establish native selection paths, not the selected user's active configuration. No user launch configuration or enabled-mod state was read by this worker.

The remaining override questions are: how launcher selections become mounted paths; base/DLC/integrated-DLC/mod precedence; how physical-root resolution selects file bytes after callback name deduplication; and complete descriptor binding and visibility effects of `replace_path`. These must be recovered before claiming an automatically effective installed configuration. The large-directory merge branch is now included in the separately reviewed 113-case supplied-listing port. An explicit ordered-file list, or a supplied-listing VFS mode with its proven scope, can support narrower Lua execution when labeled as supplied input rather than inferred active installation state.

## Evidence and next decompilation seeds

All retained outputs are under [`work/iron-meridian/native-config`](../../work/iron-meridian/native-config/). `config-inventory.json` retains the focused string inventory, `registration-refs.json` retains registry and overlay byte candidates, and `disassembly-seeds.json` records function ranges, commands, and disassembly identities. `configuration-evidence.json` binds the inspected parent exports, base-source identities, and static registration facts to the target hash.

The large-list helper closure, including `0x14059b750` and `0x14059b290`, has now been recovered, ported and tested against original instructions. Selection-to-mount work still includes `0x1420dc3a0`, its parser/getter dependencies, mount routine `0x1420dd340`, and their connecting callers. `pending-seeds.json` retains the initial, historical seed capture; `ordering-evidence.json` records the narrower static inspection, and [NATIVE_VFS_PORT.md](NATIVE_VFS_PORT.md) records the subsequent implementation and validation. The portable VM now uses the official 5.1.1 source with its provenance, recreates the observed library table and executes supplied actual chunks. Native define conversions are separately verified. These results do not establish complete engine bindings, active-overlay parity, or game simulation parity.

The earlier configuration/numeric pass ran `python -B work\iron-meridian\native-config\verify_configuration_evidence.py`. It checked 3,059 instruction lines across its 21 bounded LLVM outputs against original file bytes, verified the target hash remained unchanged, and retained identities for six inspected parent Ghidra exports and three base define files. Command `python -B work\iron-meridian\native-config\verify_numeric_conversion.py` passed all 482 isolated conversion vectors against its independent reference. The integer-API static collector retained 5,045 API-region byte lines plus 124 lines across six independently bounded bodies. Its subsequent separately authorized `integer_api_vectors.py` pass matched all 211 original-instruction vectors. The ordering follow-up retained 1,408 byte-bound lines from 13 parent exports using `ordering_evidence.py`. No project checks were run for these follow-ups. Static byte correspondence and instruction emulation are separate evidence. No original-game run, screenshot, source-VM run, browser build, or gameplay test was performed by this worker.
