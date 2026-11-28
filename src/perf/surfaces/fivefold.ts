import game from '../../games/fivefold';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'fivefold',
  group: '2d-dom' as const,
  collect(layout: Layout) { return collectMounted(game, layout); },
};
