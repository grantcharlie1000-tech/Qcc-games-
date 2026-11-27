import { LEVELS } from '../../games/last-light/levels';
import { createRun } from '../../games/last-light/model';
import { Scene } from '../../games/last-light/render';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

const stage = LEVELS.reduce((best, level, index) => {
  const weight = level.platforms.length + level.enemies.length + level.hazards.length;
  return weight > best.weight ? { index, weight } : best;
}, { index: 0, weight: -1 }).index;
const run = createRun();
run.stage = stage;
run.phase = 'playing';
let scene: Scene | null = null;
let canvas: ReturnType<typeof countingCanvas> | null = null;

export const collector = {
  id: 'last-light',
  group: 'heavy-sim' as const,
  collect(layout: Layout) {
    if (!scene || !canvas) {
      canvas = countingCanvas(layout.cssWidth, layout.cssHeight);
      scene = new Scene(canvas);
    }
    scene.resize(layout.cssWidth, layout.cssHeight);
    canvas.meter.reset();
    scene.draw(run, false);
    return canvas.meter.snapshot();
  },
};
