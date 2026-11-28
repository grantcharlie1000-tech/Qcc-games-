import { createGame } from '../../games/pool/game';
import { fitView, Renderer, type Scene } from '../../games/pool/render';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

const state = createGame('ai', 'medium', 1);

export const collector = {
  id: 'pool',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    const canvas = countingCanvas(layout.cssWidth, layout.cssHeight);
    const view = fitView(layout.cssWidth, layout.cssHeight, 1);
    const scene: Scene = {
      balls: state.balls,
      sinking: [],
      cue: { angle: 0.4, pull: 0.35, alpha: 1 },
      guide: null,
      hand: null,
      pockets: { called: null, choosing: false },
      dimmed: new Set<number>(),
    };
    const renderer = new Renderer(canvas);
    renderer.draw(view, scene);
    canvas.meter.reset();
    renderer.draw(view, scene);
    return canvas.meter.snapshot();
  },
};
