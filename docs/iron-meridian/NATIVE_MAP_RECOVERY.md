# Native map recovery

This extends the raw world-input work into actual executable code. The subsequent [span and region-center port](NATIVE_PROVINCE_SPANS_PORT.md) now executes the recovered span orchestration with explicit remaining runtime stops. Complete native world construction and rendering parity remain open. Target SHA-256 remains `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`.

## Located initialization code

Five independently disassembled RIP-relative references to map diagnostics locate two native routines:

| Entry | Retained unwind range | Observed behavior |
| --- | --- | --- |
| `0x140ab0cd0` | through `0x140ab2029` | Reads a supplied 16-bit province-ID plane, collects horizontal spans into province objects, updates their rectangles and issues missing-pixel/large-box diagnostics |
| `0x140ab4f70` | through `0x140ab5722` | Reads a supplied map path through native file/image services and checks river bit depth and palette |

The references are instruction starts verified with LLVM, rather than matches inside another instruction. Their strings, original addresses, retained assembly hashes and bounded search limitations are in [map-seeds.json](../../work/iron-meridian/native-map/map-seeds.json). The parent also exported reconstructed C and references under `C:/Users/charlie/artifacts/hoi4-native/709f916afbebcfe6/exports/map-and-closure`.

`0x140ab0cd0` reads dimensions at object `+0x40/+0x44`, province count at `+0x230`, the province pointer table at `+0x268`, and an ID-buffer owner at `+0x830`. Those are observed raw fields, not recovered original class declarations. A province's span buffer starts at `+0x58`, with capacity/count at `+0x60/+0x64`. Each retained span has three 16-bit fields. Native state initialization, bitmap color-to-ID conversion, allocation and the complete caller path are still unresolved. The existing raw-world parser is independently authored and must not be described as a port of these routines.

## Complete rectangle helper

[province-bounds.ts](../../src/games/iron-meridian/native/province-bounds.ts) translates complete helper `0x1414a6580` through exclusive end `0x1414a6605`. The province span collector calls this helper with a four-dword rectangle. It writes destination offsets `+0x88`, `+0x8c`, `+0x90`, `+0x94`.

The native instructions expand an extent by one for an odd origin, round each resulting extent up to an even dword, and lower odd origins by one. LEA operations wrap at 32 bits, including negative and overflow inputs. The TypeScript API represents those raw dwords as signed numbers and returns the four written fields. It has no runtime callback or supplied whole-helper result.

[emulate_bounds.py](../../work/iron-meridian/native-map/emulate_bounds.py) executes all 133 original bytes in Unicorn 2.1.4. Its 393 cases cover all small parity combinations, signed dword boundaries and deterministic random dwords. Every one of the 33 instruction starts executes. The oracle checks the four written destination fields, unchanged surrounding destination/source bytes, and preservation of native nonvolatile registers. Expected results are captured from machine execution, not calculated by a second copy of the TypeScript formula.

Reference SHA-256: `76c35a148d6b352cd35fe4f4b1c6055305a5c77041a5fa22449800864a802f5e`.

Scoped Vitest validation passes all 393 cases. The initial test run stopped at the intentionally absent implementation; the subsequent implemented module passes. This establishes an isolated integer helper over explicitly supplied valid memory. It does not establish the full span accumulator, actual initialized province objects, original-process execution, native rendering/projection or application integration.

Reproduce with:

```powershell
C:/Python314/python.exe -B work/iron-meridian/native-map/collect_map_seeds.py
C:/Python314/python.exe -B work/iron-meridian/native-map/emulate_bounds.py
npx.cmd vitest run tests/games/iron-meridian/native-province-bounds.test.ts --reporter=dot
```
