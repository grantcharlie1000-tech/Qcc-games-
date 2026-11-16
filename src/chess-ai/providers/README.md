# Chess AI providers

Owned by the engine agent. The game owner does not edit this folder.

Each provider is one folder:

```
providers/<folder>/manifest.ts   export const manifest: ChessAIProviderManifest  (data only, read eagerly)
providers/<folder>/index.ts      export function createProvider(): ChessAIProvider  (loaded lazily)
```

No registry edit is needed. See `docs/CHESS_AI_INTEGRATION.md`.
