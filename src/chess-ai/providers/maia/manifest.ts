import type { ChessAIProviderManifest } from '../../types';

export const manifest: ChessAIProviderManifest = {
  id: 'maia3-onnx',
  name: 'Maia3 (official ONNX export)',
  version: '0013cc8e6ec5-ort1.23.0',
  engine: 'maia',
  license: 'GPL-3.0-only AND AGPL-3.0-only AND MIT',
  opponents: ['elo-1100', 'elo-1300', 'elo-1600', 'elo-1900'],
  analysis: false,
  downloadBytes: 57_569_361,
  priority: 10,
};
