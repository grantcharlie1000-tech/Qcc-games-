import type { ChessAIOpponent } from './types';

/**
 * Difficulty tiers the game offers. Target ratings are goals for the engine
 * owner to calibrate, not measured strengths.
 */
export const CHESS_AI_OPPONENTS: readonly ChessAIOpponent[] = Object.freeze([
  { id: 'elo-300', name: 'Pebble', targetElo: 300, plannedEngines: ['custom'], defaultThinkingTimeMs: 400 },
  { id: 'elo-500', name: 'Sprout', targetElo: 500, plannedEngines: ['custom'], defaultThinkingTimeMs: 400 },
  { id: 'elo-700', name: 'Ember', targetElo: 700, plannedEngines: ['dala', 'lightweight'], defaultThinkingTimeMs: 500 },
  { id: 'elo-900', name: 'Brook', targetElo: 900, plannedEngines: ['dala', 'lightweight'], defaultThinkingTimeMs: 500 },
  { id: 'elo-1100', name: 'Atlas', targetElo: 1100, plannedEngines: ['dala', 'maia'], defaultThinkingTimeMs: 600 },
  { id: 'elo-1300', name: 'Quill', targetElo: 1300, plannedEngines: ['dala', 'maia'], defaultThinkingTimeMs: 700 },
  { id: 'elo-1600', name: 'Orbit', targetElo: 1600, plannedEngines: ['dala', 'maia'], defaultThinkingTimeMs: 800 },
  { id: 'elo-1900', name: 'Vega', targetElo: 1900, plannedEngines: ['maia'], defaultThinkingTimeMs: 900 },
  { id: 'elo-2200', name: 'Titan', targetElo: 2200, plannedEngines: ['stockfish'], defaultThinkingTimeMs: 1000 },
  { id: 'elo-2600', name: 'Zenith', targetElo: 2600, plannedEngines: ['stockfish'], defaultThinkingTimeMs: 1500 },
  { id: 'elo-3000', name: 'Nova', targetElo: 3000, plannedEngines: ['stockfish'], defaultThinkingTimeMs: 2000 },
  { id: 'max', name: 'Apex', targetElo: null, plannedEngines: ['stockfish'], defaultThinkingTimeMs: 3000 },
  { id: 'leela-expert', name: 'Lumen', targetElo: null, plannedEngines: ['leela'], defaultThinkingTimeMs: 3000 },
].map((o) => Object.freeze({ ...o, plannedEngines: Object.freeze([...o.plannedEngines]) })) as ChessAIOpponent[]);

export function findOpponent(id: string): ChessAIOpponent | undefined {
  return CHESS_AI_OPPONENTS.find((o) => o.id === id);
}
