# Maia model and source provenance

Research snapshot: 2026-11-16. The model is an authentic CSSLab Maia-3 browser
export. It is a policy model of human moves, not Stockfish and not a searched
centipawn evaluator. Its Elo inputs condition predicted human behaviour; they
do not establish measured playing ratings in QCC's pool.

## Exact upstream asset

- Project: <https://github.com/CSSLab/maia-platform-frontend>
- Commit: `0013cc8e6ec52c88f5b3d694781d4cc8427cb91a`
- File: `public/maia3/maia3_simplified.onnx`
- Download: <https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/0013cc8e6ec52c88f5b3d694781d4cc8427cb91a/public/maia3/maia3_simplified.onnx>
- Byte length: `45683686`
- SHA-256: `405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856`
- Upstream commit describes switching the ONNX export from fp32 to fp16.
- QCC's chunks reassemble the unchanged ONNX bytes. Splitting is a transport
  change for static-host file limits, not quantization or retraining.
- Do not label this artifact as the newer 5M or 79M Hugging Face checkpoint:
  the pinned frontend export is its own precisely identified artifact.

## Inference semantics

The official `src/lib/engine/maia.ts` and `tensor.ts` at that commit define:

| Input | Type and shape | Meaning |
| --- | --- | --- |
| `tokens` | float32 `[1,64,12]` | Piece occupancy, a1 square index 0; channels `PNBRQKpnbrqk` |
| `elo_self` | float32 `[1]` | Raw side-to-move Elo, without categorization or normalization |
| `elo_oppo` | float32 `[1]` | Raw opponent Elo |

Black-to-move positions flip ranks and swap piece colours before tokenization.
Output move indices use that mirrored frame and must be mapped back. The
4352-entry move map is `src/lib/engine/data/all_moves_maia3.json`. Mask to the
game's legal moves before softmax. Castling, promotion and en passant retain
normal UCI representation; the game supplies legal moves.

Output `logits_move` describes move logits. `logits_value` contains side-to-move
Loss, Draw, Win logits. A White expected score derived from that head is not a
centipawn score or a searched evaluation. QCC must not invent a centipawn value
from it. The frozen contract has no policy-probability field, so move selection
can omit evaluation metadata.

The official frontend lockfile pins `onnxruntime-web` and
`onnxruntime-common` to `1.23.0`. QCC's actual selected runtime version, files,
checksums and measurements are recorded beside its runtime assets. One WASM
thread avoids a cross-origin isolation requirement. Session initialization,
one real inference and device tests must succeed before calling it functional.

## Licences and accompanying source

- The official frontend repository distributes this ONNX file, move maps and
  inference TypeScript under its root GNU GPL version 3 licence. No separate
  model-folder licence or weight-specific override was found at the pinned
  commit. Preserve `LICENSE-MAIA-FRONTEND-GPL-3.0.txt` with redistributed files.
- Maia-3's Python model/UCI code is a separate project under GNU AGPL version 3:
  <https://github.com/CSSLab/maia3>, inspected commit
  `1e13597c42d4858b7cfd7cfdae01e297263364b2`. Its licence is preserved as
  `LICENSE-MAIA3-AGPL-3.0.txt`. Do not infer that all Maia generations share
  that licence: original Maia uses GPL; Maia-2 uses MIT.
- `maia-frontend-inference-source.tar.gz` contains the unmodified official
  inference source, both Maia-3 move maps, README, licence and dependency
  manifest/lockfile at the exact frontend commit. It excludes the model itself
  (served separately as chunks) and unrelated application UI/assets.
- `maia3-upstream-source.tar.gz` is the full upstream Maia-3 source snapshot
  from GitHub's commit archive. It is supplied for model and engine context;
  the pinned frontend ONNX conversion's complete export recipe is not present
  in that frontend snapshot. Do not claim bit-for-bit regeneration of its
  training checkpoint or export from the newer Python snapshot.
- `SOURCE-SHA256SUMS` records the accompanying source/archive/licence hashes.
  QCC's provider source and local changes are in the public QCC repository:
  <https://github.com/grantcharlie1000-tech/Qcc-games->, paths
  `src/chess-ai/providers/maia/` and `public/chess-engines/maia/`.
- ONNX Runtime is MIT licensed. Its actual release licence and third-party
  notices must accompany the vendored runtime, independently of model licences.

Publish this directory's notices and corresponding provider source with any
hosted or redistributed build. Keep the source archive links reachable from
the engine attribution location. Preserve GPL and AGPL terms for covered code
and modifications, including AGPL source access where it applies. Merely
linking an upstream homepage does not describe local modifications or replace
required corresponding-source distribution.

## Citation

Daniel Monroe, George Eilender, Philip Chalmers, Zhenwei Tang, Ashton Anderson.
“Chessformer: A Unified Architecture for Chess Modeling.” 2026.
<https://arxiv.org/abs/2605.19091>
