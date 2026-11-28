import { createArena } from '../../games/neon-coil/model';
import { createRenderer } from '../../games/neon-coil/render';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

const canvas = countingCanvas(320, 180);
const renderer = createRenderer(canvas);
const arena = createArena(1);
arena.phase = 'running';

export const collector = {
  id: 'neon-coil',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    renderer.resize(layout.cssWidth, layout.cssHeight);
    renderer.draw(arena, 1, false, true);
    canvas.meter.reset();
    renderer.draw(arena, 1, false, true);
    return canvas.meter.snapshot();
  },
};
