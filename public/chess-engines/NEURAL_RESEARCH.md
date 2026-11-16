# Neural chess engine investigation

Inspected 2026-11-16. These are upstream facts and integration decisions, not
claims that untested runtimes work on QCC. Exact target Elo numbers are desired
labels; training-rating bins and online bot ratings are not measured QCC Elo.
Runtime tests, calibration and provider manifests are authoritative for what
this release actually offers.

## Dala

- Source: <https://github.com/hrschubert/dala-training>, commit
  `95b6b482ce449929497b807f7449387318927bf8`.
- Code is a Leela training fork using JAX/Flax/Optax, Python 3.11+, a C++
  dataloader, protobuf and Meson. These are training/native tools, not a browser
  inference runtime. Its released networks use LC0 BT4+ transformer protobuf.
- Upstream README says GPL-3.0 inherited from LC0 and points to
  `libs/lc0/LICENSE`. The root has no standalone licence; `libs/lc0` is a git
  submodule pinned to `395573837488074361fad72096bc6feca345d646`. Check the
  actual submodule COPYING and weight redistribution terms before shipping
  these networks. No weight-specific licence file accompanies release assets.
- Training provenance: Lichess standard rated games January 2024 to February
  2026 filtered by rating bracket, per upstream README.
- Upstream move selection deliberately samples policy probabilities at depth 1
  instead of argmax; a Dala integration must preserve that distinction.

Release-v0: <https://github.com/hrschubert/dala-training/releases/tag/Release-v0>

| Asset | Compressed bytes |
| --- | ---: |
| `dala-700-00235000.pb.gz` | 62,062,521 |
| `dala-900-00285000.pb.gz` | 61,699,075 |
| `dala-1100-00300000.pb.gz` | 351,890,448 |
| `dala-1300-00300000.pb.gz` | 345,013,554 |
| `dala-1600-00300000.pb.gz` | 351,396,009 |

Release-v1 additionally has `dala-2000-distill-00500000-fixed.pb.gz`,
348,707,693 bytes. These are real released weights. They are not ONNX files
and cannot be handed directly to a browser ONNX runtime. A large-network LC0
ONNX conversion path exists in third-party browser research, but no Dala
browser conversion and parity result was verified here. QCC does not bundle
Dala: the download, transformer memory requirements and unverified conversion
are disproportionate to the essential 700/900 mobile ladder. Those tiers use
accurately identified custom lightweight providers.

## Original Maia

- Source: <https://github.com/CSSLab/maia-chess>, inspected commit
  `749204cf5979ce7f8b0412e804a4ee7c83c49ff8`, root GPL version 3 licence.
- Release: <https://github.com/CSSLab/maia-chess/releases/tag/v1.0>.
- Weights are in the GPL repository's `maia_weights/` and release assets. No
  separate weight licence override was found. They are LC0 neural weights,
  not complete engines. Upstream runs LC0 with `go nodes 1` and warns that
  argmax is stronger than the training population rating.

| Model | Gzip bytes |
| --- | ---: |
| 1100 | 1,313,193 |
| 1200 | 1,249,692 |
| 1300 | 1,244,431 |
| 1400 | 1,328,977 |
| 1500 | 1,258,199 |
| 1600 | 1,313,870 |
| 1700 | 1,313,415 |
| 1800 | 1,289,431 |
| 1900 | 1,262,607 |

These compact models are appealing, but need a compatible network interpreter
with correct LC0 history encoding and policy map. They do not run through the
Maia-2/3 ONNX interfaces. QCC does not label custom moves as original Maia.

## Maia-2

- Source: <https://github.com/CSSLab/maia2>, commit
  `67bee6ce7e2f264344fe6d2026a2e18c76a82efa`, MIT licence; PyPI `0.11.0`.
- Official runtime requires Python 3.10 to 3.12, torch 2.8, chess, numpy,
  einops and supporting tools. It supports CUDA, MPS or CPU, not browser JS.
- Two rating-conditioned models: rapid and blitz. Official download hashes
  are in `maia2/model.py`: rapid
  `65aae8465eed5e65df66a24ea7370715579f9e5435098d06fe18bdb1e267e997`,
  blitz `5090d5d0d49dc29787c08d13febbed5b2da81a18c2ddcd8a90070cd3b43c44b2`.
  The models are fetched separately from Google Drive, not bundled in the
  Python wheel. Preserve the official MIT attribution when redistributing.
- Input is `[batch,18,8,8]` plus two int64 rating categories; output has 1880
  move logits and an outcome head. Ratings below 1100 share a category, so
  this cannot provide genuine separately conditioned 700/900 models.
- Third-party browser route: <https://github.com/IndieFoundry/maia2-onnx>,
  commit `abe12b13a546d5cdad2ace53343adcf721537b08`, MIT. Includes export
  recipe, MIT model NOTICE, encoding parity fixtures and source comparison.
  Models are gitignored and must be exported from official ~280MB checkpoints.
  Reported artifacts are fp32 84,958,999 bytes, fp16 storage 42,524,714 bytes,
  int8 39,401,883 bytes, int8/fp16 27,391,018 bytes. Its README reports
  real Python-vs-ONNX parity, but its web check is Node-hosted WASM, explicitly
  not a real browser or low-end phone result. QCC has not independently
  reproduced those numbers and does not treat them as QCC validation.
- <https://github.com/brobert1/next-maia> is another MIT ONNX wrapper,
  inspected `a2934fb988c1408095d4bd1d248408c2eee4ac17`. Its README explicitly
  says it does not test ONNX inference itself; its weaker settings blend
  uniform random moves, unsuitable as QCC's beginner implementation.

## Maia-3

- Source: <https://github.com/CSSLab/maia3>, commit
  `1e13597c42d4858b7cfd7cfdae01e297263364b2`, AGPL version 3.
- Architecture is Chessformer; released Python UCI supports raw continuous
  SelfElo/OppoElo, Temperature, TopP and policy MultiPV. Its outcome logits
  describe human-game outcomes, not Stockfish centipawn search scores.
- Official PyTorch model family: 5M, 23M, 79M, and a 3M ablation.
  <https://huggingface.co/UofTCSSLab/Maia3-5M> inspected revision
  `b6559de2398d7140b985f28fd2c19fb5e47ddabe` contains a 20,968,049-byte
  `.pt` checkpoint, not a browser ONNX export. The 3M ablation checkpoint is
  12,659,441 bytes at `990dfd78e6403805dbbbb5fcfccd4b3d3e778cc1`.
  The inspected model cards do not declare a separate SPDX licence field;
  do not automatically apply the Python code licence to all external weights.
- The official GPL frontend separately distributes a ready fp16 ONNX export.
  This is the practical selected route, detailed in [Maia provenance](maia/PROVENANCE.md).
  The file is pinned by commit and hash, not described as whichever latest
  model name happens to be current. It requires local model/runtime assets,
  legal masking, correct Black mirroring, actual worker inference and device
  tests. Browser tests and the final handoff must state its actual results.

## Leela Chess Zero

- Source: <https://github.com/LeelaChessZero/lc0>, inspected master
  `bf15d558e178aa6415e40ab476bd1a3617828f1f`; stable release `v0.32.1`
  and prerelease `v0.33.0-rc0` were visible.
- Code is GPL-3.0-or-later with an additional CUDA linking permission for
  specified files. Read actual `COPYING` and per-backend notices. Network
  weights have separate provenance; choose and verify one exact network.
- Official release artifacts are desktop/native or Android APKs, with CPU
  BLAS/oneDNN, CUDA/cuDNN, ONNX DirectML/TensorRT variants. No official browser
  WASM/WebGPU artifact was present in these releases. An APK is not a mobile
  browser implementation, and desktop ONNX support does not imply WebGPU.
- <https://github.com/frpays/lc0-js>, commit
  `e64dd1ea7bc04f725d5ead2e1a8c020f02beec77`, is a genuine older GPL LC0
  Emscripten + TensorFlow.js browser port. It uses a cooperative search loop
  instead of native threads; inference uses WebGL and OffscreenCanvas in a
  Worker when available. README mentions 2018 browser versions, small 6x64
  and older 20-block networks. Source checkout has no ready WASM artifacts;
  protobuf/zlib support differs from native LC0. It is not a verified runtime
  for present Dala transformers or arbitrary modern LC0 networks.
- <https://github.com/MrMindHacker/LC0_Wasm> contains an old fork/build source,
  not a demonstrated modern production build. Its root lacks a licence file,
  though vendored `LC0/COPYING` carries upstream GPL. No QCC binary is shipped.
- <https://github.com/manthedan/0x88>, inspected commit
  `c9634453a1870afc65f9e04d25b46ba39832313f`, GPL-3.0-or-later, has substantial
  browser LC0 ONNX/WebGPU work, own PUCT search and model parity fixtures.
  It is evidence a path is technically possible, not a drop-in official
  LC0 WASM release. Its networks are mostly gitignored and its production
  runtime uses additional asset hosting and isolation. Its Maia-3 provenance
  helped locate the official ONNX export; third-party benchmark reports are
  not QCC measurements.

QCC leaves `leela-expert` genuinely unavailable in this implementation. No
provider claims that ID, no network is downloaded, and no Stockfish move is
presented as Leela. A future release needs a pinned compatible LC0 runtime,
licensed network, source/build recipe, neural-policy parity, GPU/CPU feature
checks, mobile memory tests and full legal game/cancellation validation.
