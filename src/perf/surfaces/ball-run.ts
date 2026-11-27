import { getCourse } from '../../games/ball-run/course';
import { createRun } from '../../games/ball-run/model';
import { createScene } from '../../games/ball-run/scene';
import { glCanvas, snapshotFromGlStats } from '../measure';
import type { Layout } from '../types';

let scene: ReturnType<typeof createScene> | null = null;
let canvas: HTMLCanvasElement | null = null;
const course = getCourse(1, 'hard');
const run = createRun(1, 1, 'hard');

export const collector = {
  id: 'ball-run',
  group: 'three' as const,
  collect(layout: Layout) {
    if (!scene || !canvas) {
      canvas = glCanvas(layout.cssWidth, layout.cssHeight);
      scene = createScene(canvas, { reducedMotion: () => false });
    }
    scene.resize(layout.cssWidth, layout.cssHeight);
    scene.render({ run, course, speed: 12 });
    return snapshotFromGlStats({ calls: scene.stats.calls, triangles: scene.stats.triangles, width: canvas.width, height: canvas.height });
  },
};
