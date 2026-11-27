import { createWorld } from '../../games/claimline/model';
import { createRenderer } from '../../games/claimline/render';
import { BOT_COUNT } from '../../games/claimline/types';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

const world = createWorld(1, { bots: BOT_COUNT });
world.phase = 'running';

export const collector = {
  id: 'claimline',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    const canvas = countingCanvas(layout.cssWidth, layout.cssHeight);
    const renderer = createRenderer(canvas);
    renderer.resize(layout.cssWidth, layout.cssHeight);
    renderer.draw(world, 1, false, 0);
    canvas.meter.reset();
    renderer.draw(world, 1, false, 16);
    return canvas.meter.snapshot();
  },
};
