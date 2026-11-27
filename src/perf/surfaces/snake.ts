import { drawGarden } from '../../games/snake/art';
import { SIZE, createState, type SnakeState } from '../../games/snake/model';
import { createView } from '../../games/snake/presentation';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

/** A finished garden: every cell occupied, which is the longest snake the rules allow. */
function fullGarden(): SnakeState {
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    if (y % 2 === 0) for (let x = 0; x < SIZE; x++) cells.push({ x, y });
    else for (let x = SIZE - 1; x >= 0; x--) cells.push({ x, y });
  }
  cells.reverse();
  const length = cells.length;
  return {
    version: 3, seed: 1, phase: 'won', body: cells, dir: 'left', queue: [], growth: 0, food: null,
    score: (length - 4) * 10, elapsed: 0, prevTail: null, lastTurned: false, bonk: 0, ticks: length - 4, eaten: null, undo: null,
  };
}

export const collector = {
  id: 'snake',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    const garden = Math.min(728, layout.cssWidth, layout.cssHeight);
    const canvas = countingCanvas(garden, garden);
    canvas.style.width = `${garden}px`;
    canvas.style.height = `${garden}px`;
    const state = fullGarden();
    if (state.body.length !== SIZE * SIZE) throw new Error('snake garden is short');
    drawGarden(canvas, state, createView(state), false);
    const snap = canvas.meter.snapshot();
    if (snap.draws <= 0) drawGarden(canvas, createState(), createView(), false);
    return canvas.meter.snapshot();
  },
};
