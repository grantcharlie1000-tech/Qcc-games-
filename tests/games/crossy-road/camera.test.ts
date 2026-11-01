import { describe, expect, it } from 'vitest';
import { cameraFit, focusXTarget, smoothing, stepFocusRow } from '../../../src/games/crossy-road/scene';

/** The brief's camera: pitched 58° down and yawed 16° about +y. Screen x of a ground point is its
 * dot product with the camera's right axis (cos yaw, 0, −sin yaw), derived here independently of scene.ts. */
const YAW = (16 * Math.PI) / 180;
const screenX = (x: number, z: number): number => x * Math.cos(YAW) - z * Math.sin(YAW);

/** Pixels the 9.5-tile span x ∈ [−0.75, 8.75] covers on screen at the focus row (any row: z is shared). */
const projectedSpanPx = (tilePx: number, z = 0): number => (screenX(8.75, z) - screenX(-0.75, z)) * tilePx;

describe('cameraFit portrait', () => {
  for (const [width, height] of [[390, 700], [366, 650], [390, 844], [320, 568], [600, 600]]) {
    it(`${width}×${height}: the projected 9.5-tile span equals the width (within 1 %)`, () => {
      const { tilePx } = cameraFit(width, height);
      expect(projectedSpanPx(tilePx)).toBeGreaterThan(width * 0.99);
      expect(projectedSpanPx(tilePx)).toBeLessThan(width * 1.01);
      expect(projectedSpanPx(tilePx, -7)).toBeCloseTo(projectedSpanPx(tilePx, 3), 6);
    });
  }

  it('tile size follows the width, not the height', () => {
    const a = cameraFit(390, 700), b = cameraFit(390, 844);
    expect(a.tilePx).toBeCloseTo(b.tilePx, 9);
    expect(b.halfHeight).toBeGreaterThan(a.halfHeight);
  });

  it('a 390 px wide phone gets about 43 px tiles', () => {
    expect(cameraFit(390, 700).tilePx).toBeGreaterThan(42);
    expect(cameraFit(390, 700).tilePx).toBeLessThan(44);
  });
});

describe('cameraFit landscape', () => {
  it('uses height / 14 once that is at least 42 px', () => {
    expect(cameraFit(1342, 640).tilePx).toBeCloseTo(640 / 14, 9);
    expect(cameraFit(1920, 1080).tilePx).toBeCloseTo(1080 / 14, 9);
  });

  it('never goes below 42 px a tile', () => {
    expect(cameraFit(800, 400).tilePx).toBe(42);
    expect(cameraFit(700, 300).tilePx).toBe(42);
  });

  it('switches to the portrait fit when the width does not exceed the height', () => {
    const square = cameraFit(500, 500), portrait = cameraFit(500, 501), landscape = cameraFit(501, 500);
    expect(square.tilePx).toBeCloseTo(portrait.tilePx, 9);
    expect(landscape.tilePx).toBe(42);
  });
});

describe('cameraFit extents', () => {
  for (const [width, height] of [[390, 700], [366, 650], [1342, 640], [800, 400], [1920, 1080]]) {
    it(`${width}×${height}: half extents are the viewport in tiles / 2`, () => {
      const { tilePx, halfWidth, halfHeight } = cameraFit(width, height);
      expect(halfWidth * tilePx * 2).toBeCloseTo(width, 9);
      expect(halfHeight * tilePx * 2).toBeCloseTo(height, 9);
    });
  }

  it('shows the whole band on a portrait phone but not on every landscape row count', () => {
    const { halfWidth } = cameraFit(390, 700);
    // The band is 9 tiles wide; a portrait frustum shows 9.5 tiles of the focus row.
    expect(2 * halfWidth / Math.cos(YAW)).toBeCloseTo(9.5, 9);
  });

  it('survives zero and tiny viewports without NaN', () => {
    for (const [w, h] of [[0, 0], [1, 1], [0, 700], [390, 0]]) {
      const fit = cameraFit(w, h);
      expect(Number.isFinite(fit.tilePx) && Number.isFinite(fit.halfWidth) && Number.isFinite(fit.halfHeight)).toBe(true);
      expect(fit.tilePx).toBeGreaterThan(0);
    }
  });
});

describe('camera focus', () => {
  it('smoothing is 1 − 0.9^(dt·60): zero for no time, about 0.1 for a 60 fps frame', () => {
    expect(smoothing(0)).toBe(0);
    expect(smoothing(1 / 60)).toBeCloseTo(0.1, 9);
    expect(smoothing(1)).toBeGreaterThan(0.99);
    expect(smoothing(-1)).toBe(0);
  });

  it('the focus row follows a rising target and never moves backward', () => {
    let row = 5;
    row = stepFocusRow(row, 9, 1 / 60);
    expect(row).toBeGreaterThan(5);
    expect(row).toBeLessThan(9);
    const held = row;
    expect(stepFocusRow(row, 2, 1 / 60)).toBe(held);
    expect(stepFocusRow(row, row, 1 / 60)).toBe(held);
    for (let i = 0; i < 600; i++) row = stepFocusRow(row, 9, 1 / 60);
    expect(row).toBeCloseTo(9, 3);
  });

  it('a long frame closes more of the gap than a short one', () => {
    expect(stepFocusRow(0, 10, 0.1)).toBeGreaterThan(stepFocusRow(0, 10, 1 / 60));
    expect(stepFocusRow(0, 10, 0)).toBe(0);
  });

  it('focus x leans toward the player 60 % of the way from the centre and keeps the band on screen', () => {
    const wide = cameraFit(1342, 640).halfWidth, phone = cameraFit(390, 700).halfWidth;
    expect(focusXTarget(4, wide)).toBeCloseTo(4, 9);
    expect(focusXTarget(0, wide)).toBeCloseTo(4 + 0.6 * (0 - 4), 9);
    expect(focusXTarget(8, wide)).toBeCloseTo(4 + 0.6 * (8 - 4), 9);
    // A phone shows 9.5 tiles of the focus row, so the focus can only slide 0.25 tiles either side of the centre.
    expect(focusXTarget(0, phone)).toBeCloseTo(3.75, 6);
    expect(focusXTarget(8, phone)).toBeCloseTo(4.25, 6);
    for (let x = -0.5; x <= 8.5; x += 0.5) {
      const f = focusXTarget(x, phone), visible = phone / Math.cos(YAW);
      expect(f - visible).toBeLessThanOrEqual(-0.5 + 1e-9);
      expect(f + visible).toBeGreaterThanOrEqual(8.5 - 1e-9);
    }
  });

  it('centres on x = 4 when the band cannot fit', () => {
    expect(focusXTarget(0, 2)).toBe(4);
    expect(focusXTarget(8.5, 2)).toBe(4);
  });
});
