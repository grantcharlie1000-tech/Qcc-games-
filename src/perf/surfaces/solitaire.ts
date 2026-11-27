import game from '../../games/solitaire';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'solitaire',
  group: '2d-dom' as const,
  collect(layout: Layout) { return collectMounted(game, layout); },
};
