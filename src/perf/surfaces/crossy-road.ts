import { createScene } from '../../games/crossy-road/scene';
import { createRun, pose } from '../../games/crossy-road/rules';
import { World } from '../../games/crossy-road/world';
import { glCanvas, snapshotFromGlStats } from '../measure';
import type { Layout } from '../types';

let scene: ReturnType<typeof createScene> | null = null;
let canvas: HTMLCanvasElement | null = null;
let state: ReturnType<typeof createRun> | null = null;
let world: World | null = null;

export const collector = {
  id: 'crossy-road',
  group: 'three' as const,
  collect(layout: Layout) {
    if (!scene || !canvas || !state || !world) {
      canvas = glCanvas(layout.cssWidth, layout.cssHeight);
      scene = createScene(canvas, { quality: 'low' });
      scene.setQuality('low');
      state = createRun(1);
      world = new World(1);
    }
    scene.resize(layout.cssWidth, layout.cssHeight);
    scene.render({ state, pose: pose(state), world, dt: 1 / 60, reducedMotion: false, colorBlind: false, ufoWarn: false });
    return snapshotFromGlStats({ calls: scene.stats.calls, triangles: scene.stats.triangles, width: canvas.width, height: canvas.height });
  },
};
