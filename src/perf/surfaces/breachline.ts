import { createScene } from '../../games/breachline/scene';
import { createMatch, seat, step } from '../../games/breachline/sim';
import { glCanvas, snapshotFromGlStats } from '../measure';
import type { Layout } from '../types';

let scene: ReturnType<typeof createScene> | null = null;
let canvas: HTMLCanvasElement | null = null;
const match = createMatch({ teamSize: 5, bots: true, skill: 'regular' }, 1);
seat(match, [
  { owner: 'you', name: 'You', squad: 0 },
  { owner: 'ally', name: 'Ally', squad: 0 },
]);

export const collector = {
  id: 'breachline',
  group: 'heavy-sim' as const,
  collect(layout: Layout) {
    if (!scene || !canvas) {
      canvas = glCanvas(layout.cssWidth, layout.cssHeight);
      scene = createScene(canvas, 'low');
      scene.setQuality('low');
    }
    step(match, 1 / 60);
    const self = match.players.find(player => player.owner === 'you');
    scene.resize(layout.cssWidth, layout.cssHeight);
    scene.render({
      m: match, self: self?.id ?? 0, watch: self?.id ?? 0, yaw: 0.2, pitch: -0.15,
      px: self?.x ?? 0, pz: self?.z ?? 0, alpha: 1, dt: 1 / 60, reduced: false, menu: false,
    });
    return snapshotFromGlStats({ calls: scene.stats.calls, triangles: scene.stats.triangles, width: canvas.width, height: canvas.height });
  },
};
