import { FIGHTERS, createMatch, step } from '../../games/quad-clash/sim';
import { createScene } from '../../games/quad-clash/scene';
import { glCanvas, snapshotFromGlStats } from '../measure';
import type { Layout } from '../types';

let scene: ReturnType<typeof createScene> | null = null;
let canvas: HTMLCanvasElement | null = null;
const match = createMatch({ mode: 'brawl', map: 'quad', difficulty: 'normal', primary: 'bell', seed: 5 });
const prev = new Float32Array(FIGHTERS * 3);

export const collector = {
  id: 'quad-clash',
  group: 'three' as const,
  collect(layout: Layout) {
    if (!scene || !canvas) {
      canvas = glCanvas(layout.cssWidth, layout.cssHeight);
      scene = createScene(canvas, { shadows: false, quality: 'potato' });
      scene.setQuality('potato');
      scene.setMatch(match);
    }
    step(match, 1 / 60, []);
    for (let i = 0; i < match.fighters.length; i++) {
      prev[i * 3] = match.fighters[i].x;
      prev[i * 3 + 1] = match.fighters[i].y;
      prev[i * 3 + 2] = match.fighters[i].z;
    }
    scene.resize(layout.cssWidth, layout.cssHeight);
    scene.render({ m: match, alpha: 1, prev, yaw: 0, pitch: 0.2, dt: 1 / 60, reduced: false, colorBlind: false, ads: 0, lookDX: 0, lookDY: 0 });
    return snapshotFromGlStats({ calls: scene.stats.calls, triangles: scene.stats.triangles, width: scene.stats.width || canvas.width, height: scene.stats.height || canvas.height });
  },
};
