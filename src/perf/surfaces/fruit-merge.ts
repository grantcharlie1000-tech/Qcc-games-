import game from '../../games/fruit-merge';
import type { Snapshot } from '../../games/fruit-merge/engine';
import { collectMounted } from '../mount-frame';
import type { Layout } from '../types';

/** A full basket: the rules cap a tube of fruit at 90, and a normal stack sits near half of that. */
function basket(): Snapshot {
  const fruits: Snapshot['fruits'] = [];
  let id = 1;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 5; col++) {
    fruits.push({ id: id++, tier: row % 6, x: 36 + col * 62, y: 200 + row * 34, vx: 0, vy: 0, angle: 0, av: 0, age: 1, danger: 0, sleeping: true });
  }
  return { version: 1, seed: 1, bag: [], current: 0, next: 1, score: 0, time: 10, lastDrop: 0, lastMerge: 0, combo: 0, aim: 180, nextId: id, lost: false, fruits };
}

export const collector = {
  id: 'fruit-merge',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    return collectMounted(game, layout, (_host, instance) => { instance.restore(basket()); });
  },
};
