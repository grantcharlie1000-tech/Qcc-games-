# Native research update recovery

The actual research update caller and initialization path have been recovered as static control/data flow. A bounded TypeScript port now applies the recovered daily rate to raw research progress, steps slots, and detects the native completion dispatch. It stops before unresolved completion, condition, reset, or bookkeeping-tree effects. It does not construct a native world or implement complete research gameplay.

The implementation is [research-update.ts](../../src/games/iron-meridian/native/research-update.ts). Its rate calculation is the existing [composed daily port](RESEARCH_DAILY_PORT.md), including the recovered modifier and denominator routines.

## Bound artifact and evidence

- Original: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`, read only, 56,535,160 bytes.
- SHA-256: `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`; preferred image base `0x140000000`.
- [Static extraction script](../../work/iron-meridian/native-update/recover_update.py) verifies that identity, extracts original LLVM instruction windows, hashes every byte range and ASM file, records compiler unwind fragments, and records the reviewed export identities in [static-evidence.json](../../work/iron-meridian/native-update/static-evidence.json).
- Reconstructed C is corroboration, not original source. Reviewed C lives under `C:/Users/charlie/artifacts/hoi4-native/709f916afbebcfe6/broad-analysis/research-export` and the artifact `exports/startup`, `update-closure`, `platform`, `map-and-closure`, and `scheduler` directories.
- The broad C manifest contains 220 files. Neither that set nor the raw direct-call search covers every native or indirect caller. Old one-byte function inventory entries are not treated as complete function extents.

Instruction windows can include padding and several unwind fragments. In particular `0x140F565B0`, `0x140F52040`, and `0x140F5FFE0` extend beyond their first unwind fragment. The retained LLVM windows cover their continuing branches and returns.

## Established caller chain

| Native entry or callsite | Established flow |
| --- | --- |
| `0x14072F3A4` / `0x14072F3AB` | Country-like object `+0xF60` is loaded into RCX, then called through `0x140F56740`. The enclosing function is `0x14072F220`. |
| `0x140F56740` | Enters profiling, calls `0x140F615C0` to maintain slots, then snapshots signed count `owner+0xAC`. For each slot from `owner+0xA0`, calls `0x140F565B0`, reloads its active pointer, and compares progress against the completion threshold. |
| `0x140F5667A` | Active slot path calls the actual daily routine `0x140F53350`. |
| `0x140F5667F` through `0x140F5668B` | Passes the returned qword to `0x140F52040(active, increment, 0, 1)`. This binds the writer's mode and category-update flag. |
| `0x140F56811` through `0x140F56822` | Signed comparison dispatches `0x140F5DD50(owner, slot, 1)` when value reaches or exceeds the threshold. |
| `0x140F61530` | Also performs the threshold comparison and dispatch. `0x140F60170` calls it after assignment and banked-progress transfer. |

The refreshed scheduler export and original LLVM establish that `0x1401EAE60` captures signed world count `+0x31C`, iterates indices beginning at one, and at `0x1401EBEA0..0x1401EBEAB` loads `world[0x310][index]` before calling `0x14072F220`. The reference inventory identifies its callers as `0x1401F4001`, containing function `0x1401F34D0`, and `0x140E44E5E`, containing function `0x140E446B0`. Those are remaining scheduler seeds. The current bounded port does not establish scheduler cadence or tick ownership merely from the name "daily" or the fixed-point scale.

The three rate callers in the reference inventory are `0x140F527DF` in `0x140F52500`, `0x140F5667A` in `0x140F565B0`, and `0x140F603C9` in `0x140F60170`. The first is used in a remaining-span calculation; the latter two reach progress mutation. A rate caller alone does not establish a simulation update.

## Progress writer: exact mutations

`researchProgressUpdate` translates `0x140F52040` over valid raw state. All qword additions/products wrap to 64 bits, comparisons are signed where the native instructions use signed conditions, and division by the constant 100,000 truncates toward zero.

1. `0x140F5206B` calls `0x1422997A0(increment, 0x14279471D, 0x4A7, 0)` even when the increment is zero. Its recovered body performs runtime trace/assertion recording through `0x142556BA0`, logging and recording globals. Refreshed bodies show that `0x142556BA0` calls `0x142556800`, then returns byte `result+0x20`, which is TLS byte `+0x20A8`. The latter helper lazily initializes TLS storage `+0x2088` under `+0x20B0` bit 0, atomically allocates a counter from global `0x143691784`, and registers a destructor through `0x1425A08DC`. It is an explicit `incrementObserver1422997a0` dependency, not an arithmetic validator or an assumed harmless no-op.
2. A zero increment returns without state writes. Otherwise, if the category flag is set, it walks dword keys from `definition+0x368`, signed count `+0x374`, calling `0x140EE7300(country[0xFA8], key, global1433E515C)`. These calls precede the progress read/write.
3. The threshold is `100000` if byte `0x1433DDAD1` is nonzero; otherwise it is `signed64(definition[0x3E0] * global1433E41E0) / 100000`.
4. `0x140F52144` writes `state[0x198] = signed64(oldProgress + increment)`. This raw field is not replaced with a clamped value. Excess and negative values can remain, including wrapped overflow.
5. A separate bounded-delta calculation uses `threshold < value ? threshold : value < 0 ? 0 : value`. The comparison order matters for negative thresholds. The difference also wraps to 64 bits.
6. If either packed-reference dword at `+0x1EC/+0x1F0` is nonzero, `0x142284870` is called even when the bookkeeping mode will bypass the tree. A nonzero resolved pointer, signed mode `<2`, and nonzero bounded delta reach `0x140EFA9E0(state+0x1B0, key)`. This port stops there, after the raw progress write, before allocating/updating/deleting a tree value.
7. Signed mode `<1` writes dword `state+0x1F4` to `0x165` when the reference did not resolve, otherwise to `resolved+0x38`.
8. `0x140F522C2` adds `signed64(increment * state[0x1A0]) / 100000` to `state[0x1A8]`, wrapping the result.

Runtime-required results preserve earlier writes. They are not transactions, retries, or resumable continuations. Re-entering the writer after a partial result could apply progress twice.

## Slot and owner bounds

`researchSlotUpdate` translates the eligible active path and the empty-slot path of `0x140F565B0`:

- An empty slot adds 100,000 to `slot+0x20` with qword wrapping and signed minimum against global `0x1433E4098`.
- `0x14033B3E0` reads definition database global `0x1433DD4E8`; its diagnostic assertion branch remains explicit.
- The direct body of `0x140B22E30` walks definition 56-byte references at `+0x380`, count `+0x38C`, and database pointer records at `+0xA8`, count `+0xB4`. It checks active byte `record+0x38`, equal dword keys at `+0x28`, then strings at `+8` with the native inline/heap capacity gate. Query order precedes record order.
- `0x1425D0588` uses bytewise ASCII case folding when global `0x143694CCC` is zero. Locale mode calls the existing explicit `0x1425D05D0` dependency. Invalid null-string handling, the nonzero `record+0x84` condition/context pipeline, and the missing-default diagnostic branch remain explicit stops. A matching record is reloaded from the database vector; otherwise the native fallback is global `0x1433E7BF8`.
- The slot active pointer is reloaded after eligibility lookup. An eligibility byte of zero stops before `0x140F5F820` resets the state and performs UI/runtime calls.
- The eligible path executes the real composed daily port. Cost runtime stops and the original signed division fault propagate before the progress writer. Successful division is followed by the writer, then the `state+0x1D0/+0x1DC` key scan against owner `+0xE8/+0xF4`, calling `0x14146A440` for the first matching entry per key.

`researchOwnerUpdate` translates the slot traversal and threshold dispatch in `0x140F56740`. Profiling and slot maintenance are explicit callbacks. The signed slot count is captured after maintenance and retained during traversal; the slot vector pointer and active state are reloaded as the instructions do. Nonempty completion stops at `0x140F5DD50`; its actual null-active fast return is supported.

The raw memory contract requires valid mapped pointers, extents, object layouts and callback behavior. It does not validate arbitrary save bytes or invent initialized objects. Pointer/end loops require valid native extents; malformed negative lengths are outside the contract. Assertions, TLS state and runtime leaves are not silently replaced with successful gameplay behavior.

## Recovered completion flow, not yet translated

In `0x140F5DD50`, a null active pointer returns. A child in the `state+0xE0/+0xEC` vector with dword `+0x170 == 4` takes a diagnostic path and clears the slot through `0x140F60170(slot,0,1,0)`.

The normal branch has the following instruction-established order:

| Callsite or write | Operation |
| --- | --- |
| `0x140F5DDBC` | `0x140F5C490(state)`, which walks the bookkeeping tree and dispatches associated effects. |
| `0x140F5DDCC` | `0x140F5FFE0(state, wrap32(state[0x174] + arg3))`. |
| `0x140F5DDD1`, `0x140F5DDDC` | Zeroes qwords `state+0x198` and `state+0x1A8`. |
| `0x140F5DDEE` | Clears the tree at `state+0x1B0` through `0x1401B5B40`. |
| `0x140F5DDF9`, `0x140F5DE01`, `0x140F5DE0F` | Calls `0x140F5C5A0(owner,state)`, `0x140F56460(state)`, `0x140F60950(owner,state,1)`. |
| `0x140F5DE1F` | Clears the slot through `0x140F60170(slot,0,1,0)`, followed by UI/runtime checks and notification calls. |

`0x140F5FFE0` writes dword `state+0x174`, stamps dword `state+0x180` from world `+0x468` for a positive new value, and dispatches on a comparison against definition dword `+0x3DC`. Calling this a completed-level counter is a semantic inference from those uses. The other effects, graph propagation, unlock behavior, achievements, notifications and multiplayer implications have not been established by executing a native game.

## Actual initialization path

The same country-like object field `+0xF60` is passed at `0x14075AE5D` to `0x140F60650`, inside `0x14075AAB0`. This is a real native construction path rather than a fabricated state fixture.

`0x140F60650` requires owner signed state-vector count `+0x94` to be zero. It stores the owning country dword ID into `owner+0x138`, obtains definition database count `+0x54` minus one, and calls `0x140204CD0(owner+0x88,count,&zeroQword)`. Vector sizing and zero filling are inferred from that helper's arguments and surrounding uses; its internals are not established here. For definition IDs beginning at one it resolves each definition through `0x140B1EA30`. A nonzero byte `definition+0x40` permits:

1. Allocation of `0x1F8` bytes at `0x140F607A1/0x140F607A6`.
2. Construction through `0x140F4F5D0(allocation, owner, definition)` at `0x140F607BE`.
3. Insertion of the returned pointer in the owner vector.

It next calls `0x140F615C0` to create the slots, links each nonnull state through `0x140F5D0B0(state, owner+0x88)`, then recomputes root-state dword `+0x170` through `0x140F5B910` and propagates changed values through `0x140F53500`.

The state constructor `0x140F4F5D0` establishes:

- Owner at `+0x158` and definition at `+0x160` (`0x140F4F749`, `0x140F4F750`).
- Zero parent/reference `+0x168`, combined zero dwords `+0x170/+0x174`, and zero qwords `+0x190`, `+0x198`, `+0x1A0`, `+0x1A8`, `+0x1C0`, `+0x1C8`.
- Static pointers at `+0x178/+0x188`, dword `+0x180 = 0x29C77F8`, and dword `+8` copied from definition `+0x3C`.
- A real allocated tree sentinel at `+0x1B0`, with self-linked pointers and word `+0x18 = 0x0101`, rather than a null tree pointer.
- Constructed vectors, byte `+0x1E8 = 0`, packed reference `+0x1EC` copied from global `0x1433EB2A0`, dword `+0x1F4 = 0x4C17`, TLS allocator setup, and multiple definition-backed database resolutions/condition evaluations. Definition dword keys at `+0x368/+0x374` are copied into the state vector `+0x140/+0x14C`.

Slot maintenance `0x140F615C0` gets a desired count from `0x14073B4F0(country)`. Growth allocates `0x48` bytes and calls `0x140F4F4F0(slot,owner,index)`. That constructor writes owner `+0x10`, null active `+0x18`, zero bank/transfer fields `+0x20/+0x28/+0x30`, qword `+0x38 = 100000`, dword slot index `+0x40`, and ID `+8 = 0x2A4E`, plus base/runtime setup. Shrink clears assigned slots through `0x140F60170`, calls virtual destruction, and decrements the vector count.

There are separate reconstruction paths: `0x140F5EDE0` rebuilds existing definition states; `0x140200F30` calls it for country-like objects from world vector `+0x310/+0x31C`. `0x140F5CA80` reinitializes/copies states and maps assignments through definition IDs. Neither path justifies treating raw installed definition data as a ready native-effective world.

## Oracle and validation

[emulate_update.py](../../work/iron-meridian/native-update/emulate_update.py) verifies the original executable and executes original instruction bytes in Unicorn 2.1.4. Expected outputs in [reference.json](../../work/iron-meridian/native-update/reference.json) come from these instructions, not the TypeScript formulas.

The oracle loads 22 byte ranges totaling 10,091 bytes: the 16-range composed daily closure, both direct database/eligibility routines, writer, slot step, owner loop and completion entry. Active cases enter the actual rate/modifier/cost/writer chain within one emulation run. It never supplies a complete rate, modifier, denominator, writer, slot-step or owner-step result.

The fixture deliberately supplies these unported leaves: increment observer, category update, packed-reference resolution, matched-entry update, slot maintenance, profiling, plus the seven previously declared daily oracle leaves. Missing leaves and unresolved native branches stop before executing their bodies. Nonempty completion stops at entry, while the null-active completion fast return executes original instructions. These fixture callbacks are not native behavior implementations.

Fresh scoped validation:

```text
npx.cmd vitest run tests/games/iron-meridian/native-research-update.test.ts --reporter=dot
260 passed: 239 returned, 20 runtime-required, 1 original divide fault
1,047 original instruction addresses visited
Narrow TypeScript strict/no-unused diagnostics: 0
```

Vectors cover signed wrapping, fixed-point truncation, negative thresholds and comparison order, zero increments, category ordering/duplicates, reference-mode gates, partial mutation stops, empty-slot banking, eligibility keys/strings/conditions/locale, actual daily faults, multiple slots, and count/progress mutations by declared callbacks. Tests compare final state plus the ordered combined sequence of callback calls and native field writes. A placeholder implementation first failed all 250 initial vectors before the implementation was added; subsequent callback/order cases expand that set to 260.

No full repository check, build, browser, screenshot, original game execution, or Ghidra project access was performed in this slice. This is bounded instruction/emulation evidence, not application integration or whole-game parity.

Regenerate owned evidence without changing the original installation:

```powershell
C:/Python314/python.exe work/iron-meridian/native-update/recover_update.py
C:/Python314/python.exe work/iron-meridian/native-update/emulate_update.py
```

Remaining work is explicit: scheduler cadence and initialization ordering above the recovered country functions; complete state construction and cross-object graphs; diagnostic/TLS behavior; eligibility conditions; category/reference/tree effects; nonempty completion and assignment effects; and native-effective world creation. Source and instruction coverage of this bounded slice do not establish those behaviors.
