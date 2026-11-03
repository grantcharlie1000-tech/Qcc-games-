import { describe, expect, it } from 'vitest';
import { cameraFit, focusRowTarget, focusXTarget, smoothing, stepFocusRow } from '../../../src/games/crossy-road/scene';
import {ROW_DEPTH} from '../../../src/games/crossy-road/config';

/** The brief's camera: pitched 45° down and yawed 20° about +y. Screen x of a ground point is its
 * dot product with the camera's right axis (cos yaw, 0, −sin yaw), derived here independently of scene.ts. */
const YAW = (20 * Math.PI) / 180;
const screenX = (x: number, z: number): number => x * Math.cos(YAW) - z * Math.sin(YAW);

/** Pixels the 8-tile span x ∈ [0, 8] covers on screen at the focus row (any row: z is shared). */
const projectedSpanPx = (tilePx: number, z = 0): number => (screenX(8, z) - screenX(0, z)) * tilePx;

describe('cameraFit portrait', () => {
  for (const [width, height] of [[390, 700], [366, 650], [390, 844], [320, 568], [600, 600]]) {
    it(`${width}×${height}: the projected 8-tile span equals the width (within 1 %)`, () => {
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

  it('a 390 px wide phone gets 48.75 px horizontal cells', () => {
    expect(cameraFit(390, 700).tilePx * Math.cos(YAW)).toBeCloseTo(48.75, 6);
  });
});

describe('cameraFit landscape', () => {
  it('keeps 15–17 rows visible instead of enlarging cells with desktop width', () => {
    for (const [w,h] of [[1366,768], [1920,1080], [800,400]]) {
      const fit=cameraFit(w,h);
      const rowPitch=fit.tilePx*ROW_DEPTH*Math.sin(Math.PI/4)/Math.cos(YAW);
      expect(h/rowPitch).toBeGreaterThan(15);
      expect(h/rowPitch).toBeLessThan(17);
    }
    expect(cameraFit(1366,768).tilePx).toBeGreaterThanOrEqual(45);
    expect(cameraFit(1366,768).tilePx).toBeLessThanOrEqual(50);
    expect(cameraFit(1800,768).tilePx).toBe(cameraFit(1366,768).tilePx);
  });

  it('uses the portrait fit on square and taller screens', () => {
    const square = cameraFit(500, 500), portrait = cameraFit(500, 501);
    expect(square.tilePx).toBeCloseTo(portrait.tilePx, 9);
    expect(cameraFit(501, 500).tilePx).toBeCloseTo(500/16, 6);
  });
});

it('matches the measured 1.1 row-to-cell pitch of t047/t119 at a fixed screen x',()=>{
  const fit=cameraFit(390,844), cell=fit.tilePx*Math.cos(YAW);
  const pitch=fit.tilePx*ROW_DEPTH*Math.sin(Math.PI/4)/Math.cos(YAW);
  expect(pitch/cell).toBeGreaterThan(1.08);
  expect(pitch/cell).toBeLessThan(1.13);
  expect(844/pitch).toBeGreaterThan(15);
  expect(844/pitch).toBeLessThan(17);
});

describe('cameraFit extents', () => {
  for (const [width, height] of [[390, 700], [366, 650], [1342, 640], [800, 400], [1920, 1080]]) {
    it(`${width}×${height}: half extents are the viewport in tiles / 2`, () => {
      const { tilePx, halfWidth, halfHeight } = cameraFit(width, height);
      expect(halfWidth * tilePx * 2).toBeCloseTo(width, 9);
      expect(halfHeight * tilePx * 2).toBeCloseTo(height, 9);
    });
  }

  it('crops the nine-cell band to eight cells at the focus row on a phone', () => {
    const { halfWidth } = cameraFit(390, 700);
    expect(2 * halfWidth / Math.cos(YAW)).toBeCloseTo(8, 9);
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
  it('starts at the bird, then creeps immediately after the first hop or any new furthest row', () => {
    expect(focusRowTarget(0, 0, 0, false)).toBe(0);
    expect(focusRowTarget(1, 0, 1, true)).toBe(1);
    expect(focusRowTarget(1, 0.35, 1, true)).toBeCloseTo(1.35);
    expect(focusRowTarget(5, 3.35, 5, true)).toBeCloseTo(5.35);
    expect(focusRowTarget(4, 3.35, 5, true)).toBeCloseTo(5.35);
  });
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

  it('both screen profiles follow the player without a horizontal clamp', () => {
    const wide = cameraFit(1366,768).halfWidth, phone = cameraFit(390,844).halfWidth;
    expect(focusXTarget(4, wide)).toBe(4);
    expect(focusXTarget(0, wide)).toBe(0);
    expect(focusXTarget(8, wide)).toBe(8);
    expect(focusXTarget(0, phone)).toBe(0);
    expect(focusXTarget(8, phone)).toBe(8);
    for (let x=0; x<=8; x+=0.5) {
      const focus=focusXTarget(x,phone), visible=phone/Math.cos(YAW);
      expect(x).toBeGreaterThan(focus-visible);
      expect(x).toBeLessThan(focus+visible);
    }
  });
});
