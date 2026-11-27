import { createScene } from '../../games/femboy-obby/scene';
import { createRun, step } from '../../games/femboy-obby/sim';
import { buildCourse } from '../../games/femboy-obby/stages';
import { glCanvas, snapshotFromGlStats } from '../measure';
import type { Layout } from '../types';

const course = buildCourse();
const run = createRun(course);
let scene: ReturnType<typeof createScene> | null = null;
let canvas: HTMLCanvasElement | null = null;

export const collector = {
  id: 'femboy-obby',
  group: 'three' as const,
  collect(layout: Layout) {
    if (!scene || !canvas) {
      canvas = glCanvas(layout.cssWidth, layout.cssHeight);
      scene = createScene(canvas, course);
      scene.setQuality(true);
    }
    step(run, course, { mx: 0, mz: 1, jump: false });
    const player = run.player;
    scene.resize(layout.cssWidth, layout.cssHeight);
    scene.render({
      x: player.x, y: player.y, z: player.z, facing: player.facing, speed: Math.hypot(player.vx, player.vz), vy: player.vy,
      grounded: player.grounded, squash: 0, mt: run.mt, run, stage: run.checkpoint, reached: run.checkpoint,
      stars: new Set(run.stars), yaw: player.facing, pitch: 0.25, dt: 1 / 60, reduced: false, dead: run.dead > 0,
    });
    return snapshotFromGlStats({ calls: scene.stats.calls, triangles: scene.stats.triangles, width: scene.stats.width || canvas.width, height: scene.stats.height || canvas.height });
  },
};
