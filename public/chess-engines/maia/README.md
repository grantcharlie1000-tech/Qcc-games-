# Maia3 browser provider

Atlas (1100), Quill (1300), Orbit (1600) and Vega (1900) use the authentic
CSSLab Maia3 ONNX export identified in [PROVENANCE.md](PROVENANCE.md).
Their ratings are conditioning inputs and calibration targets, not measured
QCC ratings or equivalences to Chess.com ratings. Both model Elo inputs use
the chosen tier because the frozen request contract has no human rating field.

## Included files

| Files | Bytes | Purpose |
| --- | ---: | --- |
| `model.part1`, `model.part2`, `model.part3` | 45,683,686 total | Unchanged official ONNX bytes, split below static hosting's per-file limit |
| `ort.wasm.min.mjs` | 49,856 | ONNX Runtime Web 1.23.0 API |
| `ort-wasm-simd-threaded.mjs` | 20,321 | Matching Emscripten loader |
| `ort-wasm-simd-threaded.wasm` | 11,815,498 | Matching WASM inference runtime |

Total first-use executable/model download: 57,569,361 bytes, excluding the
small bundled provider Worker. `SHA256SUMS` pins every listed file. The Worker
also checks the concatenated model's official SHA-256 before compiling it.
Source archives and licence hashes are in `SOURCE-SHA256SUMS`.

The runtime was extracted without modification from the npm package
`onnxruntime-web@1.23.0`, matching the official frontend lockfile:
<https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.23.0.tgz>.
Its source is <https://github.com/microsoft/onnxruntime/tree/v1.23.0>.
Preserve `ONNXRUNTIME-LICENSE` and `ONNXRUNTIME-ThirdPartyNotices.txt`.

## Behaviour and requirements

- A dedicated module Worker downloads the selected model, compiles a real ORT
  session and performs a real inference before initialization succeeds.
- Model parts stream concurrently into disjoint slices of one assembly buffer.
  Exact part lengths and the official model checksum remain mandatory.
- Model weights, runtime graph options, Elo conditioning and policy sampling
  are unchanged. Moves return immediately after inference, with no pacing delay.
- One WASM thread runs on CPU. No WebGPU, shared memory, remote service or
  cross-origin isolation is required. The upstream runtime binary's filename
  includes `threaded`; `numThreads = 1` disables its thread pool.
- Reported download progress covers the model's 45.7 MB. Runtime fetch and
  compile progress are indeterminate; warmup finishes after real inference.
- Encoding and rank mirroring match the official 64-square, 12-piece-channel
  interface. Upstream does not encode history, castling rights or en passant
  as additional planes. The supplied legal move set handles these rule cases.
- Sample the model's masked move probabilities at temperature 1. No fabricated
  Maia output, replacement engine or centipawn score is used.
- The browser needs enough memory for model assembly and the inference heap.
  Real phone testing remains necessary; desktop browser emulation is not a
  measurement on an actual phone. Missing SIMD/WASM/runtime support, insufficient
  memory or missing/corrupt files fail explicitly during initialization.
- Abort during loading or search terminates the Worker, frees its model heap
  and rejects the pending operation. Idle cancellation preserves the warm
  session. A later request after an interrupted inference reloads lazily.
- Reload is bounded by the remaining chess clock and the loader's grace
  period. A single fixed-work inference may exceed the soft thinking target
  inside that same grace period, avoiding a forced model reload on slow CPUs.
  It remains bounded by the actual remaining chess clock and absolute deadline.
  A clock that cannot accommodate reload or inference yields a timeout rather
  than a stale, invented or late move.
- Dispose the provider/session on leaving chess. Each game has its own Worker.
  No model is fetched from the homepage or while waiting for the human's turn.

## Verification

Run `npx vitest run tests/chess-ai/providers/maia.test.ts
tests/chess-ai/providers/maia-lifecycle.test.ts` for input encoding, move
vocabulary, sampling, model/runtime integrity and fault-injected lifecycle tests.

`tests/chess-ai/providers/maia-fixtures/reference.json` contains independent
Python ONNX Runtime 1.23.0 CPU reference outputs, with graph optimization
disabled and one CPU thread. The test-only `maia-parity.worker.ts` compares
the browser WASM graph against selected policy logits and LDW outputs for
White, Black, castling and promotion positions. Its tolerance is 0.125 raw
logit units to accommodate fp16 graph optimization differences.

`node tests/chess-ai/providers/browser/run.mjs` exercises the real provider,
model and WASM from a production-style repository subpath. Browser results
and measured timings are recorded with that harness and the main handoff.

Historical measurements before the pacing removal and concurrent downloads,
on 2026-11-16 using the same Linux host:

| Environment | First initialization | Three 700 ms budget moves | Interrupted search and recovery |
| --- | ---: | ---: | ---: |
| Desktop Chromium | About 2.1 s | 541-569 ms each | About 1.8 s |
| Pixel 7 Chromium emulation, 4x page CPU throttle | About 1.2 s | 572-643 ms each | About 2.2 s |
| iPhone 13 WebKit emulation | About 1.2 s | 504-600 ms each | About 2.0 s |

These are local asset delivery and paced move wall times, not internet download
or physical phone measurements. A later run with memory instrumentation also
passed. The actual WASM linear arena was **234,881,024 bytes (224 MiB)** after
initialization and four reference inferences in every environment. Model
assembly separately requires 45,683,686 bytes; additional runtime, compilation
and JavaScript allocations are not included in those figures.

The instrumented desktop Chromium aggregate renderer RSS rose from about
163 MiB baseline to 588 MiB with the provider ready; after disposal it was
about 471 MiB. The mobile Chromium emulation aggregate rose from about 189 MiB
to 572 MiB and then 469 MiB. These process totals include browser/test resources
and allocator retention and are not an isolated engine footprint. All actual
provider Workers were terminated at the end. Session release alone leaves the
WASM linear arena allocated until Worker termination. Allow several hundred
MiB of memory headroom for this mode; the lightweight beginner ladder is the
lower-memory option. This export has not been validated on a physical low-memory
iPhone or Android device.

The numerical comparisons passed in all environments. Across the four native
reference fixtures, maximum absolute policy-logit difference was 0.015625 and
maximum LDW-logit difference was 0.007486. This validates the actual exported
graph and encoding within fp16 runtime differences; it does not establish a
playing rating.

Maia3 is a policy model without search. The provider does not offer post-game
analysis; Stockfish supplies searched analysis separately.
