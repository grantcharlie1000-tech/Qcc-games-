import game from '../../games/color-connect';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'color-connect',
  group: '2d-dom' as const,
  collect(layout: Layout) { return collectMounted(game, layout); },
};
