import { collectBrowse } from '../browse-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'tv',
  group: 'apps' as const,
  collect(layout: Layout) { return collectBrowse('tv', layout); },
};
