# Executable-derived research-rate arithmetic

The arithmetic in the installed build's function at VA `0x140F53350` is now translated into [research-rate.ts](../../src/games/iron-meridian/native/research-rate.ts). It matches 1,983 reference cases produced by isolated execution of the exact 227 machine-code bytes in Unicorn. Both native helpers are replaced by explicit supplied outputs, and the runtime lower-bound global is an explicit supplied input. This is a verified arithmetic foundation, not a complete research system or a playable HOI4 web port. The full requested port remains unfulfilled.

## Provenance

| Item | Identity |
| --- | --- |
| Original executable | `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe` |
| Executable bytes | 56,535,160 |
| Executable SHA-256 | `709F916AFBEBCFE64A26678702691AEB40945D206074C2A80DE8E9D601FCE148` |
| Preferred image base | `0x140000000` |
| Function range | VA `[0x140F53350, 0x140F53433)`, RVA `0xF53350`, 227 bytes |
| Original file offset | `0xF52750` |
| Function-byte SHA-256 | `1C9F4F93DB1BB77E2E66F926F03E916296D965FB31B5AB18605CF27BF27DAC73` |
| Instruction source | [daily-rate-140f53350.asm](../../work/iron-meridian/native-inventory/daily-rate-140f53350.asm) |
| Range corroboration | [additional-inventory.json](../../work/iron-meridian/native-inventory/additional-inventory.json), selected compiler unwind range |
| Raw decompiler output | `C:\Users\charlie\artifacts\hoi4-native\709f916afbebcfe6\exports\gameplay\140f53350.c` |

The function's research-rate role is inferred from the native caller context and diagnostic evidence documented in [NATIVE_PORT_BOUNDARY.md](NATIVE_PORT_BOUNDARY.md). Addresses and bytes identify the implementation; nearest-export `PHYSFS_swapULE64` annotations do not name this function. Ghidra's reconstructed C agrees with the main arithmetic, but its inferred first helper argument/prototype is malformed. The machine instructions and emulator runs are authoritative for this port. Decompiled C is reconstructed pseudocode, not original C++ source.

## Explicit boundary

The new adapter accepts `bigint` values interpreted as raw 64-bit quantities. It normalizes arithmetic and comparisons to the widths declared by the instructions. Raw offset names deliberately avoid assigning unproven gameplay meanings.

| Adapter input | Original location or boundary | Known use |
| --- | --- | --- |
| `helper140f537e0Stack30` | First qword written by helper `0x140F537E0` at caller `[rsp+0x30]` | Added to 100,000 and the raw status qword at `+0x1C8` |
| `helper140f537e0Stack38` | Second qword written by that helper at caller `[rsp+0x38]` | Added to the raw status qword at `+0x1C0` |
| `rawStatusOffset1c0` | `[self+0x1C0]` | Supplies part of the second helper's stack argument |
| `rawStatusOffset1c8` | `[self+0x1C8]` | Supplies part of the numerator |
| `helper140b205b0Pointee` | Qword at the pointer returned by helper `0x140B205B0` | Added to 100,000 to form the denominator |
| `runtimeGlobal1433e4658` | Qword loaded from VA `0x1433E4658` | Signed lower bound applied after the quotient/fallback |

The result exposes the wrapped `helper140b205b0Stack20` argument, which the original caller stores at `[rsp+0x20]` before its second `CALL`. At callee entry it is at `[rsp+0x28]` because the return address has been pushed. This exposes the observed boundary without inventing that helper's behavior. Supplying the returned pointee independently does not establish that the supplied helper output could occur for the supplied argument in a real game state.

No effective runtime value is assumed for `0x1433E4658`. A subsequent static trace established its binding to `NTechnology.MIN_RESEARCH_SPEED`: registration passes the literal key and this global's address to the numeric conversion helper. The shipped `0.1` converts to 10,000 fixed units if successfully loaded through that path. Effective overrides, actual initialization and later writes remain unobserved. [minimum-binding.json](../../work/iron-meridian/native-inventory/minimum-binding.json) retains exact instructions. The adapter keeps the global explicit and has no default. Neither helper's formula, object graph, modifier semantics, scope or runtime state is implemented here. Hooks supply only stated outputs and preserve other synthetic state; additional helper side effects or aliasing remain unassessed.

## Preserved instruction behavior

- `0x140F533AF-0x140F533C0`: 64-bit wrapping additions produce the numerator and write it into the native output slot before the second helper returns.
- `0x140F533B6,0x140F533CF`: the sum of the second first-helper output and `[self+0x1C0]` wraps to 64 bits before it is passed to the second helper.
- `0x140F533DC-0x140F533E3`: the denominator addition wraps; an exact zero bypasses division.
- `0x140F533E8-0x140F533F9`: the sentinel guard uses unsigned comparison after wrapping addition of `0x7FFFFFFFFFFFFFFE`. It is not a general signed range check. The three rejected numerator bit patterns are `0x7FFFFFFFFFFFFFFF`, `0x8000000000000000` and `0x8000000000000001`; their immediate neighbors are exercised too.
- `0x140F533FB-0x140F53404`: `IMUL` retains the low 64 bits of multiplication by 100,000. `CQO` sign-extends that wrapped product; `IDIV` truncates signed division toward zero. An out-of-range quotient causes a CPU divide error instead of an unbounded BigInt result.
- `0x140F5340C`: `MOV ECX,0xFFFFFFFF` zero-extends to the positive 64-bit value 4,294,967,295. It is not signed `-1`.
- `0x140F53419-0x140F53427`: `CMP`/`CMOVG` choose the greater value under a signed 64-bit comparison with the runtime global.

The adapter returns either `{ kind: 'returned', value, ... }` or `{ kind: 'divide-error', outputBeforeFault, ... }`. This union is a new inspection API for the normal output or observed CPU fault. The native function does not return that union. On division overflow the native output slot still contains the earlier numerator write; the adapter preserves it as `outputBeforeFault`. Native exception-handler behavior is outside this slice.

The module has no imports from the fictional simulation, no UI, no native helper calls, and no account/network/file effects. It is not wired into the existing campaign.

## Independent machine-code reference

[emulate_research_rate.py](../../work/iron-meridian/native-port/emulate_research_rate.py) reads the original executable, verifies its full SHA-256, parses the PE section table, and extracts the exact function range. It checks the range against the shared compiler-unwind inventory. It then maps only this function, two one-byte helper-return stubs, explicit synthetic data/stack pages, and a return-stop address into an isolated Unicorn x86-64 CPU instance.

The first helper hook supplies exactly two qwords at its output address. The second helper hook records the actual stack argument and supplies an explicit result pointer/qword. The lower-bound global and raw status fields are written from each vector's declared inputs. The code then executes its own original instructions. Any transfer to an unexpected address, unexpected interrupt, missing helper boundary, or failure to return the expected output pointer fails generation. The harness also checks callee-saved register restoration on successful returns.

Expected outputs come from the emulator's output memory and interrupt observations, not from the TypeScript implementation or a Python rewrite of its formula. The artifact also retains every original output-slot store, so the quotient-overflow case preserves the early write. The instruction-reference boundary is independent of the translation's BigInt expressions, although emulator correctness and the supplied helper boundary remain assumptions.

The [reference vectors](../../work/iron-meridian/native-port/research-rate-vectors.json) contain:

- 8 named cases for baseline, denominator zero, fallback clamping, each addition-wrap boundary and a signed quotient-overflow fault.
- 1,463 combinations of 19 numerator boundaries, 11 denominator boundaries and seven runtime lower bounds, including sentinel neighbors, negative division and multiplication wrap.
- 512 deterministic raw-64-bit cases with seed `0x140F53350`.
- 1,975 normal returns and eight CPU divide-error interrupts at `0x140F53404`.
- Coverage of all 52 instruction start addresses in the 227-byte function, plus both helper stubs. Division executed in 1,638 cases; 345 cases reached the fallback instruction.

The recorded reference JSON SHA-256 is `6B777427BB752512A62A70DEE17C8AD6A7974343254C81CC55158E279E097F5A`. Its generation timestamp is part of the file, so regenerating it changes that artifact hash even when all vector outcomes agree.

This is isolated instruction execution. It did not launch or attach to the original game, execute either original helper, load a save, initialize DLC/mod configuration, contact services, or observe a gameplay session. Synthetic boundary cases intentionally include values whose reachability in an actual game is unknown.

## Portable emulator acquisition

Only the Unicorn package was acquired for this work. [acquire_unicorn.py](../../work/iron-meridian/native-port/acquire_unicorn.py) downloaded its Windows AMD64 wheel from official PyPI metadata, verified the SHA-256 supplied by that metadata, and extracted it into `C:\Users\charlie\tools\hoi4-analysis\python-packages`. The harness adds that directory to its own Python import path; no global package installation or global environment change was made. The [acquisition record](../../work/iron-meridian/native-port/unicorn-acquisition.json) retains the exact source URL, version, size, hash and Python version.

| Item | Value |
| --- | --- |
| Package | Unicorn 2.1.4 |
| Wheel | `unicorn-2.1.4-cp37-abi3-win_amd64.whl` |
| Bytes | 15,943,079 |
| SHA-256 | `D7107500C64CE5C168FBFF6BEF9485B5DB1350050036F4CEA568650CF8BDBDF5` |
| Python | 3.14.6, Windows AMD64 |

The package source is the [official PyPI release metadata](https://pypi.org/pypi/unicorn/2.1.4/json). Its role as a CPU emulator is described in the [official Unicorn documentation](https://www.unicorn-engine.org/docs/). Package hash verification establishes the acquired artifact's identity, not independent proof of emulator correctness.

## Verification performed

The reference generator completed with the exact code hash above. Then this scoped command passed:

```powershell
& '.\node_modules\.bin\vitest.cmd' run 'tests/games/iron-meridian/native-research-rate.test.ts' --reporter=basic
```

[native-research-rate.test.ts](../../tests/games/iron-meridian/native-research-rate.test.ts) checks normal/fault outcome, final or pre-fault output qword, and the actual wrapped second-helper stack argument against every independent vector. Result: one test file passed, 1,983 tests passed, zero failed. Vitest reported version 3.2.7. Its `basic` reporter emitted a deprecation notice; no behavior check failed.

The reference can be regenerated with:

```powershell
& 'C:\Python314\python.exe' 'work\iron-meridian\native-port\emulate_research_rate.py'
```

Parent verification then passed `npm.cmd run check` and `npm.cmd run build`. The production build retains the existing chunk-size warnings. This arithmetic module is not imported by the fictional game's entrypoint, so production success does not establish its integration into gameplay.

The dedicated [browser fixture](../../work/iron-meridian/native-port/browser-check.html) imported the actual TypeScript module through Vite and ran all 1,983 reference cases in Chromium. The observed result was 1,983 passes, zero mismatches and eight displayed named cases. [browser-arithmetic.png](../../work/iron-meridian/native-port/browser-arithmetic.png) records the 1,280 by 800 browser result. The fixture identifies its supplied-helper boundary and does not present itself as the game. It is a work artifact, not a new product screen. One screenshot request timed out; its retry succeeded. The temporary preview tab was closed after a transient close-transport failure and successful retry.

Independent OpenAI review verified all 227 original function bytes, input/function/wheel/vector hashes, arithmetic semantics, helper hooks, stack argument capture and coverage metadata. It found no Critical or Important issue for the explicit helper-output boundary. It did not rerun the generator or tests, and declined to judge original helpers, native exception handling, real states or whole-game equivalence.

No native-game runtime comparison or performance measurement was performed. Remaining work includes both helpers, effective global initialization, real object/state loading, modifiers and content, caller behavior, gameplay integration and end-to-end native equivalence. The full game port remains unfulfilled.
