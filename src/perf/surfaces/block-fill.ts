import game from '../../games/block-fill';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'block-fill',
  group: '2d-dom' as const,
  collect(layout: Layout) { return collectMounted(game, layout); },
};
