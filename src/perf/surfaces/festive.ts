import { drawSnowflake } from '../../festive/art';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

/** The overlay is a static tiled background: one viewport fill plus the shipped flake motif. */
export const collector = {
  id: 'festive',
  group: 'shell-glass' as const,
  collect(layout: Layout) {
    const root = document.documentElement;
    const previous = root.dataset.festive;
    root.dataset.festive = 'christmas';
    try {
      const canvas = countingCanvas(layout.cssWidth, layout.cssHeight);
      const g = canvas.getContext('2d');
      if (!g) throw new Error('festive canvas');
      g.fillStyle = '#07111c';
      g.fillRect(0, 0, layout.cssWidth, layout.cssHeight);
      const motif = [[24, 28], [78, 36], [40, 84], [96, 90], [64, 18], [18, 70]] as const;
      for (const [x, y] of motif) drawSnowflake(g, x, y, 6, '#dce9ff', 0.9);
      return canvas.meter.snapshot();
    } finally {
      if (previous === undefined) delete root.dataset.festive;
      else root.dataset.festive = previous;
    }
  },
};
