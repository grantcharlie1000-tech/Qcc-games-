import game from '../../games/quadfall';
import { COLUMNS, ROWS, createState, type Piece } from '../../games/quadfall/model';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

const pieces: Piece[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const collector = {
  id: 'quadfall',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    return collectMounted(game, layout, (host, instance) => {
      // happy-dom does not apply the board's CSS size. Pin the shipped column
      // (about half of a 700px board) so the steady paint is the real board.
      const boardH = Math.min(700, Math.max(240, layout.cssHeight - 16));
      const boardW = Math.min(boardH / 2, Math.max(160, layout.cssWidth - 16));
      const canvas = host.querySelector<HTMLCanvasElement>('.qf-canvas');
      if (canvas) {
        canvas.style.width = `${boardW}px`;
        canvas.style.height = `${boardH}px`;
      }
      host.querySelectorAll<HTMLCanvasElement>('.qf-hold canvas, .qf-next canvas').forEach(preview => {
        preview.style.width = '72px';
        preview.style.height = '64px';
      });
      const state = createState(1);
      // Rows above the stack stay empty so the spawned piece still fits.
      for (let y = 6; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) {
        if (y >= ROWS - 2 && x < 4) continue;
        state.board[y][x] = pieces[(x + y) % pieces.length];
      }
      state.phase = 'running';
      instance.restore(state);
    });
  },
};
