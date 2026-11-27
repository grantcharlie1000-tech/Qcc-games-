import game from '../../games/chess';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'chess',
  group: '2d-dom' as const,
  collect(layout: Layout) { return collectMounted(game, layout); },
};
