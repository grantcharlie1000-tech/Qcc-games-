# Chess AI integration contract

`src/chess-ai/` connects the chess game to any number of independently built
engines. The game never imports an engine. Engines never touch the board,
rules, clocks, animation, multiplayer or UI.

This contract is frozen. A change needs agreement between both owners.

## Ownership

| Path | Owner |
| --- | --- |
| `src/chess-ai/types.ts`, `catalog.ts`, `loader.ts`, `index.ts`, `testing/` | Game owner (frozen contract) |
| `src/chess-ai/providers/**` | Engine owner |
| Provider Workers, model loaders and helpers inside `providers/<folder>/` | Engine owner |
| `public/chess-engines/**` (WASM, weights, licences) | Engine owner |
| Provider tests and benchmarks (`tests/chess-ai/providers/**`) | Engine owner |
| `src/games/chess/**`, `tests/games/chess/**` | Game owner |

## Files

| File | Purpose |
| --- | --- |
| `types.ts` | Every shared interface and `ChessAIError`. |
| `catalog.ts` | `CHESS_AI_OPPONENTS`: the difficulty tiers. |
| `loader.ts` | Discovery, validation, lifecycle, cancellation, stale detection, timeouts. |
| `index.ts` | Public API. The game imports only `src/chess-ai` (this file). |
| `testing/mock-provider.ts` | Test provider. Outside `providers/`, so never discovered or shown to players. |
| `providers/` | One folder per engine. Engine owner only. |

## Opponent tiers

Targets are goals to calibrate, not measured ratings.

| id | Name | Target Elo | Planned engine |
| --- | --- | --- | --- |
| `elo-300` | Pebble | 300 | Custom beginner |
| `elo-500` | Sprout | 500 | Custom beginner |
| `elo-700` | Ember | 700 | Dala or lightweight |
| `elo-900` | Brook | 900 | Dala or lightweight |
| `elo-1100` | Atlas | 1100 | Dala / Maia |
| `elo-1300` | Quill | 1300 | Dala / Maia |
| `elo-1600` | Orbit | 1600 | Dala / Maia |
| `elo-1900` | Vega | 1900 | Maia |
| `elo-2200` | Titan | 2200 | Stockfish |
| `elo-2600` | Zenith | 2600 | Stockfish |
| `elo-3000` | Nova | 3000 | Stockfish |
| `max` | Apex | unrestricted | Stockfish |
| `leela-expert` | Lumen | unrestricted | Leela Chess Zero |

An opponent is playable only when an installed provider lists its id in
`manifest.opponents`. Otherwise `availability` is `unavailable` and the game
shows it as not installed.

## Adding a provider

Create two files. No registry or game edit is needed.

```
src/chess-ai/providers/<folder>/manifest.ts
src/chess-ai/providers/<folder>/index.ts
```

`loader.ts` finds them with Vite:

```ts
import.meta.glob('./providers/*/manifest.ts', { eager: true }); // tiny data, read when the chess game loads
import.meta.glob('./providers/*/index.ts');                    // lazy, loaded when a player picks the opponent
```

### manifest.ts

Data only. It must not import engine code, because it is bundled eagerly into
the chess chunk. Type imports are fine.

```ts
import type { ChessAIProviderManifest } from '../../types';

export const manifest: ChessAIProviderManifest = {
  id: 'stockfish-wasm',            // lowercase letters, digits, hyphens; unique
  name: 'Stockfish',
  version: '17.1',
  engine: 'stockfish',             // custom | lightweight | dala | maia | stockfish | leela, or another lowercase name
  license: 'GPL-3.0-or-later',     // SPDX id of engine and weights
  opponents: ['elo-2200', 'elo-2600', 'elo-3000', 'max'],
  analysis: true,                  // true only if analyze() is implemented
  downloadBytes: 7_300_000,        // shown to players before loading
  priority: 10,                    // higher wins when two providers play one opponent
};
```

### index.ts

Exports one factory. Each call returns a new, independent engine instance.

```ts
import type { ChessAIProvider } from '../../types';
import { manifest } from './manifest';

export function createProvider(): ChessAIProvider {
  let worker: Worker | undefined;
  return {
    manifest,
    async initialize({ signal, onProgress }) {
      worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
      onProgress({ phase: 'download', fraction: 0 });
      // load WASM / weights from `${import.meta.env.BASE_URL}chess-engines/...`, report progress,
      // reject if this browser cannot run the engine
    },
    async chooseMove(request) {
      // search request.fen within request.thinkingTimeMs, stop when request.signal aborts
      return { moveUci: 'e2e4', evaluationCp: 25, depth: 14, pvUci: ['e2e4', 'e7e5'] };
    },
    async analyze(request) {
      return { depth: 18, lines: [{ pvUci: ['e2e4', 'e7e5'], evaluationCp: 25 }] };
    },
    cancel() { worker?.postMessage('stop'); },
    dispose() { worker?.terminate(); worker = undefined; },
  };
}
```

### Provider rules

- Run search off the UI thread (module Worker). Never block the main thread.
- Load assets from `public/chess-engines/` with relative or `import.meta.env.BASE_URL` paths. No runtime CDN.
- Respect `request.signal`. Stop searching and settle promptly after it aborts.
- `cancel()` stops whatever search is running. The loader calls it synchronously when a request's signal aborts, before it sends any newer request, so it never stops the newer search.
- `initialize` must settle within 120 seconds (download included) or the provider counts as failed. Watch `options.signal`.
- `initialize` must reject when the engine cannot run (no WASM, no SharedArrayBuffer, failed download). Never pretend.
- Return moves from `request.legalMovesUci` only. Anything else is rejected.
- Report evaluations from White's point of view. `mateIn` is positive when White mates.
- Pick strength per `request.opponentId`. The same instance may be asked for one opponent only.
- `dispose` must terminate Workers and free memory. It may be called twice.
- Keep engine licences and provenance beside the assets in `public/chess-engines/`.

## Using the API (game side)

```ts
import { getChessAIRegistry, ChessAIError } from '../../chess-ai';

const registry = getChessAIRegistry();
for (const { opponent, availability } of registry.opponents()) {
  // availability.state is 'available' (with provider manifest) or 'unavailable'
}

const session = await registry.openOpponent('elo-1300', {
  signal,                                     // abort to stop loading
  onProgress: (p) => showProgress(p.provider.name, p.phase, p.fraction),
});

try {
  const reply = await session.requestMove({
    fen, startFen, moveHistoryUci, legalMovesUci, positionRevision,
    thinkingTimeMs: 800,                      // optional; defaults to the tier's value
    clock: { remainingMs, incrementMs },      // optional
  });
  // reply.moveUci is in legalMovesUci; the game still applies it through its own rules layer
} catch (e) {
  if (e instanceof ChessAIError && (e.code === 'stale' || e.code === 'aborted')) return;
  showEngineError(e);
}

session.dispose();                            // when the game ends or the player leaves
```

Analysis works the same way with `registry.analysisProvider()`,
`registry.openAnalysis()` and `session.analyze({ ...position, thinkingTimeMs, multiPv })`.
When no provider sets `analysis: true`, `openAnalysis` rejects with `unavailable`
and the game shows that analysis is not installed. It never invents evaluations.

## Guarantees from the loader

| Situation | Result |
| --- | --- |
| No provider lists the opponent | `availability: unavailable`; `openOpponent` rejects `unavailable` |
| Manifest invalid, `index.ts` missing, or duplicate id | Folder ignored and listed in `registry.rejected` |
| Module fails to load, `createProvider` throws, `initialize` rejects or takes over 120 s | Provider disposed; next provider by priority is tried; if none starts, `init-failed` |
| Analysis provider without `analyze()` | Skipped like a failed start |
| Caller aborts opening | `aborted`; the partly started provider is disposed |
| New `requestMove` before the previous settles | Previous rejects `stale`; its signal aborts and `provider.cancel()` runs before the new request starts |
| `positionRevision` lower than one already requested | `stale`, without contacting the provider |
| Malformed position from the game | `invalid-request` (always a rejected promise, never a synchronous throw) |
| `session.cancel()` or caller signal aborts | `aborted` |
| No answer within `thinkingTimeMs + 10 s` | `timeout` |
| Move not in `legalMovesUci` | `illegal-move` |
| Malformed move, NaN evaluation, provider throws | `engine-error` |
| Request after `dispose()` | `disposed`; provider disposed exactly once |

`positionRevision` must increase on every move, takeback or restart; the loader
rejects older revisions. The game also checks its own revision when a reply
arrives, so a reply for an old position is never played.

`session.provider` is always the validated manifest from `manifest.ts`.

## Testing without engines

`createChessAIRegistry(sources)` accepts any sources. Tests and the game's
integration tests use `createMockProviderSource()` from `testing/mock-provider.ts`.
It plays the first legal move (or a scripted one), can delay, fail to load or
fail to start, and records every request. It is never discovered by
`getChessAIRegistry()`.

```
npx vitest run tests/chess-ai
```
