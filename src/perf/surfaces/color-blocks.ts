import game from '../../games/color-blocks';
import { restoreGame, SHAPES, SIZE, type State } from '../../games/color-blocks/model';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

/**
 * In-play board at the normal cap: every cell filled except a 3×3 opening for the
 * largest piece and one gap in every other row and column. No line is complete.
 * The tray is three of that largest piece, which is what a full deal can show.
 */
function crowded(): State {
  const board = Array<number>(SIZE * SIZE).fill(1);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) board[y * SIZE + x] = 0;
  for (let i = 0; i < 5; i++) board[(3 + i) * SIZE + (3 + i)] = 0;
  const piece = SHAPES.length - 1;
  const state = restoreGame({
    version: 2, generator: 1, scoring: 1, mode: 'standard', seed: 1, rng: 1,
    board, tray: [piece, piece, piece], colors: [1, 2, 3], witness: [[0, 0, 0]],
    recent: [piece, piece, piece], history: [], score: 0, combo: 0, setup: 0,
    moves: 0, lines: 0, maxCombo: 0, maxLines: 0,
  });
  if (!state) throw new Error('color-blocks heavy board is not a legal save');
  return state;
}

export const collector = {
  id: 'color-blocks',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    return collectMounted(game, layout, (host, instance) => {
      instance.restore(crowded());
      const occupied = host.querySelectorAll('.cb-occupied').length;
      if (occupied !== 50) throw new Error(`color-blocks heavy board painted ${occupied} blocks`);
    });
  },
};
