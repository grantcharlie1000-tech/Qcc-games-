import type { ChessAIProgress } from '../../types';

export type MaiaCommand =
  | { type: 'init'; id: number; assetBase: string }
  | { type: 'move'; id: number; revision: number; fen: string; legalMovesUci: readonly string[]; rating: number; random: number; pacingMs: number };

export type MaiaReply =
  | { type: 'progress'; id: number; progress: ChessAIProgress }
  | { type: 'ready'; id: number }
  | { type: 'move'; id: number; revision: number; moveUci: string; inferenceMs: number }
  | { type: 'error'; id: number; message: string };
