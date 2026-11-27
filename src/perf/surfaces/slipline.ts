import game from '../../games/slipline';
import { initial } from '../../games/slipline/model';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'slipline',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    return collectMounted(game, layout, (_host, instance) => {
      instance.restore(initial(44, 44));
    });
  },
};
