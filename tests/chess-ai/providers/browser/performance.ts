import { Chess } from 'chess.js';
import { createProvider as maia } from '../../../../src/chess-ai/providers/maia';
import { createProvider as stockfish } from '../../../../src/chess-ai/providers/stockfish';
import type { ChessAIProgress } from '../../../../src/chess-ai/types';

let lastInferenceMs = 0;
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options);
    this.addEventListener('message', ({ data }) => {
      if (data?.type === 'move' && typeof data.inferenceMs === 'number') lastInferenceMs = data.inferenceMs;
    });
  }
};

// Identical positions, ratings and sampling draws on both production bundles.
const positions = [
  new Chess().fen(),
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
  '7k/P7/8/8/8/8/8/6K1 w - - 0 1',
];
Object.assign(window, { async chessTiming() {
  const results = [];
  const originalRandom = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (<T extends ArrayBufferView>(array: T): T => {
    if (array instanceof Uint32Array) { array.fill(0x8000_0000); return array; }
    return originalRandom(array) as T;
  });
  try {
    for (const [name, create] of [['maia', maia], ['stockfish', stockfish]] as const) {
      const provider = create();
      const signal = new AbortController().signal;
      const start = performance.now();
      const phases: { phase: ChessAIProgress['phase']; atMs: number }[] = [];
      try {
        await provider.initialize({ signal, onProgress(p) {
          if (phases.at(-1)?.phase !== p.phase) phases.push({ phase: p.phase, atMs: performance.now() - start });
        } });
        const loadMs = performance.now() - start;
        const moves = [];
        const opponents = name === 'maia' ? ['elo-1100', 'elo-1300', 'elo-1600', 'elo-1900'] : ['elo-2200', 'elo-2600', 'elo-3000', 'max'];
        for (let i = 0; i < positions.length; i++) {
          const game = new Chess(positions[i]);
          const legalMovesUci = game.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? ''));
          const before = performance.now();
          const reply = await provider.chooseMove({ fen: game.fen(), startFen: game.fen(), moveHistoryUci: [], legalMovesUci,
            positionRevision: i + 1, thinkingTimeMs: name === 'maia' ? 700 : 100, opponentId: opponents[i], signal });
          const elapsedMs = performance.now() - before;
          if (!legalMovesUci.includes(reply.moveUci)) throw new Error(`Illegal ${name} move ${reply.moveUci}`);
          moves.push({ opponent: opponents[i], fen: game.fen(), moveUci: reply.moveUci, elapsedMs, depth: reply.depth,
            ...(name === 'maia' ? { inferenceMs: lastInferenceMs } : {}) });
        }
        let forcedMoveMs: number | undefined;
        if (name === 'stockfish') {
          const fen = '7k/8/6R1/8/8/8/8/K7 b - - 0 1';
          const before = performance.now();
          const reply = await provider.chooseMove({ fen, startFen: fen, moveHistoryUci: [], legalMovesUci: ['h8h7'],
            positionRevision: 5, thinkingTimeMs: 100, opponentId: 'max', signal });
          forcedMoveMs = performance.now() - before;
          if (reply.moveUci !== 'h8h7') throw new Error('Incorrect forced move');
        }
        results.push({ name, loadMs, phases, moves, forcedMoveMs });
      } finally { provider.dispose(); }
    }
  } finally { crypto.getRandomValues = originalRandom; }
  document.querySelector('#result')!.textContent = JSON.stringify(results, null, 2);
  return results;
} });
