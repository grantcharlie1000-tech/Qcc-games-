// SPDX-License-Identifier: GPL-3.0-only
import type { ChessAIProviderManifest } from '../../types';

export const manifest: ChessAIProviderManifest = {
  id: 'stockfish-wasm',
  name: 'Stockfish 19 Lite',
  version: '19.0.1',
  engine: 'stockfish',
  license: 'GPL-3.0-only',
  opponents: ['elo-2200', 'elo-2600', 'elo-3000', 'max'],
  analysis: true,
  downloadBytes: 1_874_201,
  priority: 10,
};
