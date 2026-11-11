import { describe, expect, it } from 'vitest';
import { surfaceAt, MARKS } from '../../../src/games/breachline/render/surfacehit';

/** Section 10.1 of the map-fill plan: every surface a round can stop on answers with its own material. */
describe('what a stopped round hit', () => {
  it('reads the ground and the ceiling by what covers them there', () => {
    expect(surfaceAt(null, 0, 0, 15, 1)).toBe('earth');          // South Yard asphalt
    expect(surfaceAt(null, -1, 0, -6, 1)).toBe('tile');          // Lab tiles
    expect(surfaceAt(null, -3, 0, 6, 1)).toBe('fabric');         // Office carpet
    expect(surfaceAt(null, 4, 0, 5, 1)).toBe('wood');            // Archive boards
    expect(surfaceAt({ mat: 'concrete', y0: 3 }, -1, 3, -6, -1)).toBe('ceiling');
  });
  it('reads boxes by material, brick by which side of the shell', () => {
    expect(surfaceAt({ mat: 'brick', y0: 0 }, 0, 1.5, 10.2, 0)).toBe('brick');
    expect(surfaceAt({ mat: 'brick', y0: 0 }, 0, 1.5, 9.8, 0)).toBe('concrete');
    expect(surfaceAt({ mat: 'crate', y0: 0 }, 2, 0.5, 13, 0)).toBe('wood');
    expect(surfaceAt({ mat: 'fabric', y0: 0 }, -8, 0.5, 3, 0)).toBe('fabric');
    expect(surfaceAt({ mat: 'van', y0: 0 }, 7, 0.5, 15, 0)).toBe('fabric');
    expect(surfaceAt({ mat: 'rack', y0: 0 }, 8, 1, -6, 0)).toBe('metal');
  });
  it('has a mark for every material it can name, except steel (a scar)', () => {
    for (const k of ['earth', 'tile', 'fabric', 'wood', 'ceiling', 'brick', 'concrete', 'wall']) expect(MARKS[k]).toBeDefined();
  });
});
