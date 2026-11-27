import { LeaderboardView } from '../../leaderboard/view';
import type { Board } from '../../leaderboard/shared';
import { createMeter, listenScope, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

interface BoardPaint { paint(board: Board, game: string): void; status(text: string): void }

const PAGE = 25;

export const collector = {
  id: 'leaderboards',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const view = new LeaderboardView(() => {});
    const meter = createMeter();
    try {
      const entries = Array.from({ length: PAGE }, (_, i) => ({
        rank: i + 1,
        playerId: (i + 1).toString(16).padStart(64, '0'),
        name: `Player ${i + 1}`,
        score: 2500 - i,
      }));
      const page = view as unknown as BoardPaint;
      page.paint({ entries, player: null }, 'color-blocks');
      const row = view.root.querySelector('tbody tr:last-child');
      if (!row) throw new Error('leaderboard page was empty');
      return take(meter, view.root, () => {
        view.root.scrollTop += 36;
        page.status('Updated from the online leaderboard.');
      }, () => paintRow(row, layout.cssWidth, 36));
    } finally {
      view.root.remove();
      release();
    }
  },
};
