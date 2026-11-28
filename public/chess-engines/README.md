# QCC chess engines

These providers implement the frozen contract merged in
`25c0f8d34568001aa9f4a32a96031c8827393b10` ([PR #186](https://github.com/grantcharlie1000-tech/Qcc-games-/pull/186)).
The game owns chess rules, clocks and move application. Providers receive a
private position and return a legal UCI move. They never change the game.

## Opponents

| Stable id | Name | Target | Implementation |
| --- | --- | --- | --- |
| elo-300 | Pebble | 300 | QCC beginner, perceptual errors and weighted decisions |
| elo-500 | Sprout | 500 | QCC beginner, increased capture and threat awareness |
| elo-700 | Ember | 700 | QCC lightweight fallback, basic tactical replies |
| elo-900 | Brook | 900 | QCC lightweight fallback, stronger threat awareness |
| elo-1100 | Atlas | 1100 | Maia-3, rating-conditioned policy inference |
| elo-1300 | Quill | 1300 | Maia-3, rating-conditioned policy inference |
| elo-1600 | Orbit | 1600 | Maia-3, rating-conditioned policy inference |
| elo-1900 | Vega | 1900 | Maia-3, rating-conditioned policy inference |
| elo-2200 | Titan | 2200 | Stockfish.js 19.0.1 lite, UCI strength limit |
| elo-2600 | Zenith | 2600 | Stockfish.js 19.0.1 lite, UCI strength limit |
| elo-3000 | Nova | 3000 | Stockfish.js 19.0.1 lite, UCI strength limit |
| max | Apex | unrestricted | Stockfish.js 19.0.1 lite, no deliberate weakening |
| leela-expert | Lumen | unrestricted | Not installed; no validated LC0 browser runtime |

Targets are not measured Chess.com or Lichess ratings. See
[calibration](CALIBRATION.md) for the defined test pool, evidence and uncertainty.
The 700/900 players are custom fallbacks, not Dala. Maia is genuine network
inference, not Stockfish with a different label. Lumen is unavailable rather
than substituted. See [neural research](NEURAL_RESEARCH.md) for upstream evidence.

## Integration

Vite's existing loader discovers `providers/*/manifest.ts` and lazily imports
`providers/*/index.ts`. No registry, shared dependency, game or routing changes
are required. Serve this directory from `chess-engines/` under the app base,
including all runtime `.js`, `.mjs`, `.wasm` and model parts. Ordinary modes
need same-origin Workers and WASM, without cross-origin isolation.

Use `registry.openOpponent(id, {signal, onProgress})`. Show the selected
provider's actual name and initial download size from its manifest. Forward
clock budgets, legal UCI moves, start FEN, complete history and increasing
position revisions. Dispose sessions on leaving, restart and game end. Report
initialization failure instead of showing endless thinking. Loading Maia can
be canceled. A browser that cannot run its runtime must show the failure.

Post-game analysis uses the existing separate `openAnalysis()` session.
Stockfish returns genuine White-perspective centipawn/mate scores, search
depth and principal variations. The game must not expose analysis as hints
during ranked play.

Maximum uses the small Stockfish network with unrestricted search. It does
not claim the strength of the roughly 100 MB full-network distribution.
The latter exceeds Cloudflare Pages' 25 MiB individual asset limit and would
cost substantially more download and memory. Search uses one thread and a
bounded hash table so normal play does not require special hosting headers.

## Licenses and reproducibility

Retain each engine's license, attribution, pinned provenance and checksums:

- `beginner/`: QCC decision code and vendored chess.js rules helper.
- `stockfish/`: GPL notices, exact runtime and network, corresponding source
  archive and rebuild instructions.
- `maia/`: model/runtime notices, source provenance, model part checksums
  and conversion/inference documentation.

The public QCC repository contains provider source. Redistributors must keep
the applicable GPL/AGPL source and license obligations with these components.
Do not strip notices or replace assets without updating provenance/checksums.
No executable code or model downloads from a runtime CDN are used.

## Verification

```
npx vitest run tests/chess-ai
node tests/chess-ai/providers/benchmarks/run.mjs
node tests/chess-ai/providers/browser/run.mjs
npm run check
npm run build
```

Browser evidence and measurements are produced by the real-provider harness,
not by mocked Stockfish. Mobile browser emulation does not establish results
on a physical iPhone or Android device. Read the recorded report before making
compatibility claims.
