/**
 * Public chess AI API. The game imports only from here.
 * See docs/CHESS_AI_INTEGRATION.md.
 */
export * from './types';
export { CHESS_AI_OPPONENTS, findOpponent } from './catalog';
export {
  createChessAIRegistry,
  discoverProviders,
  manifestProblem,
  validateAnalysis,
  validateMoveResponse,
  type ChessAIAnalysisInput,
  type ChessAIAnalysisSession,
  type ChessAIMoveInput,
  type ChessAIOpenOptions,
  type ChessAIOpponentSession,
  type ChessAIProviderSource,
  type ChessAIRegistry,
  type ChessAIRegistryOptions,
  type ChessAIRejectedProvider,
} from './loader';

import { createChessAIRegistry, discoverProviders, type ChessAIRegistry } from './loader';

let shared: ChessAIRegistry | undefined;

/** The registry of providers installed under src/chess-ai/providers. */
export function getChessAIRegistry(): ChessAIRegistry {
  if (!shared) {
    const { sources, rejected } = discoverProviders();
    shared = createChessAIRegistry(sources, { rejected });
  }
  return shared;
}
