# Recovered daily technology denominator

[research-cost.ts](../../src/games/iron-meridian/native/research-cost.ts) translates the direct daily path through native `0x140B205B0`, `0x140B1FFD0`, `0x140B20700` and `0x142572EF0`. It computes the pointee previously supplied as `helper140b205b0Pointee` to the rate arithmetic. None of these arithmetic/state helpers is replaced with an opaque supplied result.

The caller must supply a valid initialized raw memory snapshot. This slice does not initialize a world, load a save, resolve content overrides, infer loaded configuration values, or run the installed game. The full game port remains unfulfilled.

## Source identity and native ranges

- Executable: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`, 56,535,160 bytes.
- SHA-256: `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`.
- Preferred image base: `0x140000000`. All native addresses below are preferred VAs, not live process addresses.
- Instruction listings, full range hashes, file offsets and compiler unwind fragments are retained in [native-cost](../../work/iron-meridian/native-cost/) and its [reference manifest](../../work/iron-meridian/native-cost/reference.json).

| Range, end exclusive | Bytes | File offset | Role in the oracle |
| --- | ---: | --- | --- |
| `0x140F53350..0x140F53433` | 227 | `0xF52750` | Original rate wrapper, including the real denominator call |
| `0x140B205B0..0x140B206FD` | 333 | `0xB1F9B0` | Diagnostic gates and world/global forwarding |
| `0x140B1FFD0..0x140B205AB` | 1,499 | `0xB1F3D0` | Denominator arithmetic and its null-tooltip return path |
| `0x140B20700..0x140B2080C` | 268 | `0xB1FB00` | Direct definition/world arithmetic and signed dword clamp |
| `0x142572EF0..0x142572F39` | 73 | `0x25722F0` | Direct signed fixed-point rounding leaf |

The five mapped ranges total 2,400 original bytes. The first compiler unwind record at `0x140B205B0` stops at `0x140B20653`. Two following fragments continue through `0x140B2067C` to the actual `RET` at `0x140B206FC`. The manifest retains all three fragments. The rounding leaf has no matching compiler unwind entry; its explicit range ends immediately after the byte-verified `RET` at `0x142572F38`.

Decompiler corroboration was read from the parent's retained `exports/refined/140b205b0.c`, `exports/refined/140b1ffd0.c`, `exports/research-closure/140b20700.c` and `exports/filesystem/142572ef0.c` under `C:\Users\charlie\artifacts\hoi4-native\709f916afbebcfe6`. It is reconstructed C, not original source. Exact machine instructions control widths, arithmetic and invocation scope. No Ghidra project was opened by this implementation.

## Exact daily invocation

At original wrapper `0x140F533C3..0x140F533D4`, `RCX` is the definition pointer from status `+0x160`, `RDX` points to the output qword, `R8` and `R9` are zero, and caller `[rsp+0x20]` contains the wrapped sum of the first modifier helper's second output and status `+0x1C0`. That sum is the adapter's explicit `adjustment` argument.

`0x140B205B0` supplies `world + 0x460` to `0x140B1FFD0`. Its null tooltip parameter causes the latter to return immediately after the first calculation. Alternate invocation values, tooltip formatting, the second `0x140B20700` call and formatting/allocation helpers are outside the translation. Mapping their bytes does not establish that those branches were translated or executed.

## Raw memory contract

`ResearchCostMemory` provides little-endian byte, dword and qword reads. The adapter wraps addresses to unsigned 64 bits and scalar arithmetic to the widths in the instructions. It supplies no configuration defaults.

| Location | Read and use |
| --- | --- |
| Definition `+0x3D8` | Signed dword, multiplied by 8,760 with signed dword wrapping |
| Global `0x1433DD6B0` | World pointer |
| World `+0x468` | Dword minus 43,800,000 with signed dword wrapping, then signed division by 24 |
| Global `0x1433E4138` | Signed qword coefficient in the denominator calculation |
| Global `0x14368F611` | Diagnostic-mode byte |
| Globals `0x1433DD130`, `0x1433DD131` | Guard bytes controlling assertion/TLS paths |
| Explicit `adjustment` | Raw qword multiplied by 365 with signed qword wrapping before rounding |

The constants and temporary date-like objects suggest a calendar-related gap. No original field names, loaded epoch, gameplay units or binding of `0x1433E4138` to a shipped configuration key is claimed here. The `cost` filename identifies the denominator-producing call path; it does not establish a complete universal research-cost formula.

## Preserved arithmetic

`0x142572EF0` divides a signed qword by 100,000 toward zero. A remainder at least 50,000 increments the quotient; a remainder at most -50,000 decrements it. Exact half ties therefore round away from zero. The helper is translated directly as `roundedFixedPoint142572ef0`, including negative values and signed-qword endpoints.

`0x140B2072A..0x140B20742` computes an absolute-value-like intermediate and reapplies the original sign. Together these operations reproduce the original signed dword, including `INT_MIN`. The port uses that equivalent raw dword for multiplication by 8,760.

`0x140B2076B..0x140B207F2` performs signed divisions by 24 and 365 and several dword products/additions. The `/365` quotient terms cancel modulo `2^32`. With all wrapping retained, the final raw result is equivalent to:

```text
signed32(signed32(definition[0x3D8] * 8760) / 24
       - signed32(world[0x468] - 43800000) / 24
       - roundAwayFromZero(signed64(adjustment * 365) / 100000))
```

The divisions by 24 truncate toward zero. The rounding expression names the helper's quotient/remainder behavior above, not floating-point rounding. A negative final signed dword is replaced with zero via `CMOVS`; there is no invented upper clamp. The oracle captures the original pre-clamp `EAX` at `0x140B207F4`, post-clamp return at `0x140B2001C`, and full rounding return at `0x140B20768`. All three are compared with the adapter's inspection fields.

`0x140B2001C..0x140B2008E` multiplies that nonnegative signed dword by 100,000, multiplies by the supplied signed coefficient with qword wrapping, divides by 100,000 toward zero, applies its unsigned sentinel guard, and divides the wrapped rescaled product by 36,500,000 toward zero. The original multiply-high sequences implement these constant divisions; BigInt division uses the same truncation.

The sentinel fallback is the positive qword `0xFFFFFFFF`, due to a dword register write. The guard is retained even though its rejecting bit patterns cannot arise from this preceding signed division by 100,000: that quotient has magnitude at most 92,233,720,368,547. No test is claimed to reach this unreachable fallback from the selected inputs. Products may still wrap and produce a negative denominator contribution. The port preserves those results.

These constant divisions have nonzero positive divisors and cannot overflow a signed quotient. The denominator path has no CPU divide-error outcome. A separate composed rate calculation can still raise one, and the oracle retains that case.

## Explicit runtime boundaries

The new inspection API returns either `{ kind: 'returned', value, roundedAdjustment, rawGap32, positiveGap32 }` or `{ kind: 'runtime-required', boundary, nativeAddress }`. The native function does not return this union.

With diagnostics enabled, guard `0x1433DD130` zero and a null world require the assertion call at `0x140B2061B`. Otherwise, a zero guard at `0x1433DD131` requires the TLS read beginning at `0x140B20644`. The adapter stops explicitly at these boundaries. It does not supply the complete denominator as a callback result or invent assertion decisions, TLS initialization, guard writes or traps. A returned runtime boundary is not a completed denominator calculation.

With diagnostics disabled, these guard bytes are skipped. A present world permits the first assertion gate to be bypassed even when guard `0x1433DD130` is zero. Noncanonical nonzero bytes remain true. A null or invalid world outside the trapped prelude is not replaced with a synthetic world; invalid memory reads remain the memory provider's responsibility. Native access violations, malformed snapshots, aliasing/output-buffer effects and concurrent mutation are outside the raw-snapshot contract.

## Independent original-instruction oracle

[emulate_cost.py](../../work/iron-meridian/native-cost/emulate_cost.py) verifies the complete executable SHA-256, decodes the PE section and exception tables, extracts the five exact ranges, checks the three whole-function unwind extents and the explicit return-bounded extents, and retains LLVM instruction listings and per-range identities. It uses the existing portable Unicorn 2.1.4 package whose acquisition identity is documented in [RESEARCH_RATE_PORT.md](RESEARCH_RATE_PORT.md). Nothing is installed or downloaded by this script.

For combined cases, execution starts in original `0x140F53350`. Only the earlier modifier helper `0x140F537E0` is replaced with an explicit two-qword output hook. The real denominator entry, state helper, rounding leaf and arithmetic execute. The oracle captures the actual stack adjustment at denominator entry, captures its result when the wrapper resumes at `0x140F533D9`, and lets the original wrapper return a rate or raise its divide interrupt. A separate group executes the original rounding leaf directly. Expected values are read from emulated registers/memory, not from a Python copy of the translated formula.

Assertion and TLS cases stop before the unresolved call/read executes. Their four stop visits are recorded separately and excluded from executed-instruction coverage. Unexpected control transfers, unmapped accesses, unexpected interrupts, missing helper boundaries or failure to return the expected output pointer fail generation.

The retained reference contains:

- 573 combined cases: 569 completed denominator calculations and four explicit runtime boundaries. The completed calculations compose to 568 normal rate returns and one `IDIV` overflow at original wrapper `0x140F53404`.
- 147 direct rounding cases, including both signed-qword endpoints, zero, positive/negative remainder and half-tie neighbors, and 128 deterministic raw-qword cases.
- Combined coverage of signed-dword multiplication/subtraction boundaries, negative-gap clamping, adjustment multiplication and addition wrap, coefficient wrap, noncanonical diagnostic bytes, assertion/TLS priority, and a negative cost producing the rate wrapper's zero-denominator fallback.
- 384 deterministic raw-state cases with seed `0x140B205B0`.
- 244 distinct original instruction start addresses executed, plus the single supplied modifier-helper hook. Mapped bytes and counts do not imply full function or state-space coverage.

Reference SHA-256: `bfd141e0f7fc604a3865b4e22622f7b0c1149b83420c1507d2f07ffa7c6de336`. The generated timestamp is part of the artifact, so regeneration changes its hash even when all numerical results agree.

## Verification and remaining work

The initial zero-return implementation failed the signed-minimum rounding reference case before the arithmetic translation was implemented. The following scoped command then passed all 720 tests:

```powershell
node node_modules/vitest/vitest.mjs run tests/games/iron-meridian/native-research-cost.test.ts --reporter=dot
```

The test compares original rounding results, runtime boundaries, wrapped caller adjustment, both gap stages, the computed denominator pointee and the composed rate/fault outcome. A TypeScript compiler program containing only this adapter and its test entry, with imported dependencies, passed strict/no-unused diagnostics and emitted nothing.

Regenerate the original-instruction references from the checkout root with:

```powershell
& 'C:\Python314\python.exe' work/iron-meridian/native-cost/emulate_cost.py
```

No full repository check/build, browser, screenshot, original game process, real save/state load, installation, source-game modification or app integration was performed. The separate modifier producer still has explicit dynamic virtual/context/locale dependencies. Joining these recovered slices with actual initialized state, binding runtime globals, recovering their caller update behavior and verifying end-to-end equivalence remain separate work. This slice removes the previously opaque technology-denominator arithmetic boundary for the documented daily invocation.
