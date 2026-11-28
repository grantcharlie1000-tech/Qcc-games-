# Composed daily research calculation

[research-daily.ts](../../src/games/iron-meridian/native/research-daily.ts) composes the recovered modifier producer, technology-denominator producer and rate arithmetic for the documented daily invocation of native `0x140F53350`. The caller supplies valid raw memory and the remaining declared modifier runtime leaves. It supplies neither complete helper output.

The source composes [research-modifiers.ts](../../src/games/iron-meridian/native/research-modifiers.ts), [research-cost.ts](../../src/games/iron-meridian/native/research-cost.ts) and [research-rate.ts](../../src/games/iron-meridian/native/research-rate.ts) without changing them. This is a bounded calculation over initialized raw state, not a content/save loader, native state initializer, gameplay update loop or full game port. The full requested game port remains unfulfilled.

## Original source identity

- Executable: `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`, 56,535,160 bytes.
- SHA-256: `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`.
- Preferred image base: `0x140000000`.
- Original entry: `[0x140F53350,0x140F53433)`, 227 bytes, file offset `0xF52750`, SHA-256 `1c9f4f93db1bb77e2e66f926f03e916296d965fb31b5ab18605cf27bf27dac73`.

The [single-run oracle](../../work/iron-meridian/native-daily/emulate_daily.py) retains exact identities and LLVM instruction listings for 16 ranges totaling 7,433 original bytes. Its [reference manifest](../../work/iron-meridian/native-daily/reference.json) records every range, file offset and byte hash. The mapped ranges cover the original wrapper; direct modifier producer, collection, category, comparison and initialized lookup code; and the direct cost/rounding chain. See [RESEARCH_MODIFIERS_PORT.md](RESEARCH_MODIFIERS_PORT.md) and [RESEARCH_COST_PORT.md](RESEARCH_COST_PORT.md) for the originating instruction contracts, reconstructed-C corroboration and fragmented unwind boundaries.

## Ordered composition

The adapter preserves these caller operations:

1. Execute the recovered daily modifier producer, with the state byte at `+0x1E8` captured before its other work.
2. After the modifier call returns, capture status qword `+0x1C8`, then status qword `+0x1C0`, then definition pointer `+0x160`, matching `0x140F53398..0x140F533D4`.
3. Wrap the sum of the second modifier qword and captured status `+0x1C0`. Pass that adjustment to the recovered cost path with the captured definition pointer.
4. If cost calculation reports an unresolved assertion/TLS boundary, return `runtime-required` without claiming a cost or rate result.
5. Otherwise run the recovered rate arithmetic using the modifier tuple, captured raw status values and computed cost pointee.
6. Read minimum global `0x1433E4658` only after the division or fallback succeeds, at the point corresponding to native `0x140F53419`. A CPU divide-error outcome skips that read.

The last step uses a deferred property getter for the existing rate adapter's lower-bound input. Constructing its input object does not read the global. The rate adapter accesses that property only after its fault check, so composition does not move the read ahead of a failing divide.

The inspection result includes the modifier tuple and ordered temporary payload pointers, the actual wrapped cost adjustment, and either the final rate or its pre-fault numerator. Completed cost results retain their arithmetic inspection fields. Cost runtime stops retain the original boundary address. These are new inspection objects; the native function returns an output pointer and writes its qword. The adapter does not reproduce output-buffer aliasing or native memory writes, allocation effects, access violations or exception-handler behavior.

## Remaining explicit leaves

`ResearchDailyMemory` is the existing byte/dword/qword memory contract. `ResearchModifierDependencies` is passed through unchanged. Concrete entry vtable implementations at slots `0x78` and `0x80`, the context-mask function and locale comparison implementation remain supplied. The modifier helper's diagnostic/TLS lookup branches retain their existing explicit dependency callbacks. Their native TLS/runtime implementations are not recovered by composition.

The denominator's diagnostic prelude retains the cost adapter's structured stops before assertion call `0x140B2061B` or TLS read `0x140B20644`. A runtime stop is not a completed calculation. The four oracle stop cases use empty modifier sources so that they reach these cost boundaries without first requiring an unresolved modifier TLS service.

The memory view must represent valid initialized objects, vectors, category/string records, registries and globals described by the component contracts. Synchronous effects of a declared runtime callback can change later-read values; the composed caller captures the raw status fields after modifier callbacks finish. Native concurrent mutation, corrupted memory, absent runtime services, allocator failures and real game-state reachability are not established.

## One original-instruction oracle

`emulate_daily.py` creates a fresh Unicorn x86-64 instance for each case, verifies the full executable hash, parses its PE sections/unwind inventory, extracts the retained original ranges, and starts at real `0x140F53350`. It executes both complete direct helper chains in that same instance. There is no stub at `0x140F537E0` or `0x140B205B0` and no supplied complete modifier tuple or denominator pointee.

For every completed case it requires this exact entry sequence, once each and in order:

```text
0x140F53350
0x140F537E0
0x140B205B0
0x140B1FFD0
0x140B20700
0x142572EF0
```

The four cost runtime stops require the first three entries, then stop before the unresolved native service executes. Those stop instructions are recorded separately and excluded from executed-instruction coverage.

Only seven declared leaf/runtime hook addresses remain: synthetic targets `0x900100` and `0x900200` for the entry virtual calls, `0x900300` for the context mask, `0x900400` for allocator cleanup, locale runtime `0x1425D05D0`, vector construction `0x14011F6F0` and vector append `0x14018E580`. The port uses a JavaScript array for the inspected temporary pointer list. Successful synthetic container construction/copy/cleanup does not prove native allocation behavior or failure handling. The initialized country/group lookup bodies execute as original instructions, with no full lookup result hook in the oracle.

The fixture builder and declared leaf behavior were adapted into this new owned oracle from the earlier modifier oracle. They now include real definition `+0x3D8`, world `+0x468` and coefficient global `0x1433E4138`, rather than a supplied cost result. The world allocation was enlarged to contain the added raw field without overlapping another fixture object. No prior generator, test, source module or reference artifact was changed.

Expected modifier qwords are captured when the real helper returns to `0x140F53398`. The cost argument is read from the actual native stack at `0x140B205B0`; its resulting pointee is captured when the wrapper reaches `0x140F533D9`. The wrapper then computes its rate or raises its actual divide interrupt. A marker records whether control reaches the minimum-global load. Expected values come from original instructions, emulated registers/memory and declared leaves, not from the TypeScript composition or a Python rewrite of its formula.

## Cases and observed results

The retained reference contains 313 cases: 121 named/discriminating cases and 192 seeded states. They include the modifier categories, default ASCII/explicit locale comparison, context gates, source and object matches, keyed payloads, direct cost dword/qword wrapping and coefficient boundaries, four explicit cost runtime stops, the rate's denominator-zero fallback and its signed division overflow. The deterministic seed is `0x140F537E0`.

One declared virtual `0x80` callback also writes status `+0x1C0 = 10000`, status `+0x1C8 = 12000`, coefficient `-100000` and minimum global `2000000`. Both executions subsequently produce modifier tuple `(6000,0)`, cost adjustment `10000`, cost pointee `-89863` and final rate `2000000`. This is a deliberately synthetic callback effect that distinguishes early reads from the actual caller ordering; it does not claim a recovered implementation of that virtual method.

Observed outcomes are 308 normal returns, one divide-error interrupt at original `0x140F53404`, and four explicit runtime stops. The oracle executed 833 distinct original instruction start addresses plus the seven declared hook addresses. Mapped bytes and these counts do not imply complete function or state-space coverage.

Reference SHA-256: `a0530c1995f99bb172472168e8a35dac43f2343d135b0d3d5ddf68dea45425fd`. The generation timestamp is included, so regeneration changes this artifact hash even when all outcomes agree.

## Verification

The initial zero-return composition failed the first reference case's required raw-field capture behavior. After implementation, the scoped test passed all 313 cases:

```powershell
node node_modules/vitest/vitest.mjs run tests/games/iron-meridian/native-research-daily.test.ts --reporter=dot
```

The test executes the real composed TypeScript functions, checks the final outcome, both computed helpers, wrapped cost argument, ordered payloads and declared leaf-call transcript against the single native run. Memory-read probes require the post-modifier `+0x1C8`, `+0x1C0`, `+0x160` ordering and subsequent cost field read. The memory provider forbids reading `0x1433E4658` on runtime-required and divide-error paths, and requires exactly one read on normal returns.

A narrow TypeScript compiler program with only this module and test as entries, plus their imports, passes strict/no-unused diagnostics and emits nothing. Regenerate the oracle with:

```powershell
& 'C:\Python314\python.exe' work/iron-meridian/native-daily/emulate_daily.py
```

No full repository check/build, browser, screenshot, original-game process, installation, Ghidra project access, fictional-game change or application integration was performed. No adapter from shipped world/content files or real saves to these raw objects has been established. Initial state construction, active configuration/global binding, concrete dynamic leaves, actual research-update callers and end-to-end native equivalence remain open.
