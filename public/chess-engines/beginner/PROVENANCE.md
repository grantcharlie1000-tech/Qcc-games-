# QCC Beginner 1.0.0

The engine source lives in `src/chess-ai/providers/beginner/` in this repository.
It is original QCC utility AI, not Dala, Maia, Stockfish or a neural model.
No weights or runtime downloads are required. The Vite worker bundle contains
all code. The manifest's download estimate is an estimate of compressed worker
transfer size, not model size.

| Component | Version | Source | License |
| --- | --- | --- | --- |
| QCC beginner AI | 1.0.0 | This repository, `src/chess-ai/providers/beginner/` | MIT |
| chess.js rules | 1.4.0 | https://github.com/jhlywa/chess.js/tree/v1.4.0 | BSD-2-Clause |

The chess.js distribution came from
https://registry.npmjs.org/chess.js/-/chess.js-1.4.0.tgz . The vendored files are
`dist/esm/chess.js` and `dist/types/chess.d.ts`. The ESM file's final source-map
comment was removed because the original package's source paths are not
present in this checkout. No executable logic was changed.

SHA-256:

```
dce92e280439d7a16f645be94f22e6da50e579a1f3011d0a2381755bfe2c2ef7  chess.js-1.4.0.tgz
6ec742c5b513c309938634dbc29b7fa302b37da6e8adebcded0694290582a22a  vendor/chess.js
29f09463bf7aedb31c93b4f692b9001eb5529b9dcc52829a1c0d5895e2f2e8f8  vendor/chess.d.ts
```

No PGN parser functionality is required by QCC AI; it remains in the upstream
package unmodified so the vendor copy stays auditable.
