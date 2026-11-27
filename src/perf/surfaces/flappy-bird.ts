import { drawFlight } from '../../games/flappy-bird/art';
import { advance, createFlight, flap } from '../../games/flappy-bird/model';
import { countingCanvas } from '../measure';
import type { Layout } from '../types';

export const collector = {
  id: 'flappy-bird',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    const canvas = countingCanvas(layout.cssWidth, layout.cssHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('flappy canvas');
    const flight = createFlight();
    flap(flight);
    advance(flight, 0.2);
    drawFlight(ctx, flight, false);
    return canvas.meter.snapshot();
  },
};
