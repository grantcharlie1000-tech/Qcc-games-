import { collectBrowse } from '../browse-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'movies',
  group: 'apps' as const,
  collect(layout: Layout) { return collectBrowse('movie', layout); },
};
