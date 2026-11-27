import game from '../../games/minesweeper';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'minesweeper',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    return collectMounted(game, layout, host => {
      const select = host.querySelector<HTMLSelectElement>('.ms-level');
      if (!select) return;
      select.value = 'expert';
      select.dispatchEvent(new Event('change'));
    });
  },
};
