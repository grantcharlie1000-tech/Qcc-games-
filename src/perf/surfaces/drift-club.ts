import game from '../../games/drift-club';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'drift-club',
  group: '2d-dom' as const,
  collect(layout: Layout) { return collectMounted(game, layout); },
};
