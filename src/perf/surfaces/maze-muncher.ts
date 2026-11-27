import game from '../../games/maze-muncher';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'maze-muncher',
  group: '2d-dom' as const,
  collect(layout: Layout) { return collectMounted(game, layout); },
};
