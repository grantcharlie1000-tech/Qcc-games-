import game from '../../games/water-sort';
import { LEVELS } from '../../games/water-sort/levels';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'water-sort',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    return collectMounted(game, layout, host => {
      const select = host.querySelector<HTMLSelectElement>('.ws-level');
      if (!select) return;
      select.value = String(LEVELS.length - 1);
      select.dispatchEvent(new Event('change'));
    });
  },
};
