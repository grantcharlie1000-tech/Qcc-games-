import { createTower } from '../../games/tower/model';
import { renderTower } from '../../games/tower/renderer';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

export const collector = {
  id: 'tower',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    const canvas = countingCanvas(layout.cssWidth, layout.cssHeight);
    const state = createTower();
    for (let i = 0; i < 40; i++) state.blocks.push({ x: -40, z: -40, w: 80, d: 80 });
    state.phase = 'sliding';
    renderTower(canvas, state, false, false);
    return canvas.meter.snapshot();
  },
};
