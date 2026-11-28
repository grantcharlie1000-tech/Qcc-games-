import type { Layout } from './types';

/** Displayed refresh used by the floor tier. Frames are cheaper, not skipped. */
export const FLOOR_DISPLAY_HZ = 60;

/** CSS layouts the floor contract is scored at. devicePixelRatio is 1. */
export const FLOOR_LAYOUTS: readonly Layout[] = [
  { cssWidth: 1280, cssHeight: 720, dpr: 1 },
  { cssWidth: 390, cssHeight: 844, dpr: 1 },
];

/** Drawing-buffer pixel cap for the floor device (a 480p-class target). */
export const FLOOR_PIXEL_CAP = 854 * 480;

let floorOn = true;

/** The shipped default is the floor tier: the steady frame the predictor scores. */
export function floorTierActive(): boolean {
  return floorOn;
}

export function setFloorTier(on: boolean): void {
  floorOn = on;
}

/**
 * Device pixel ratio after the floor resolution scale. Never returns 0.
 * A layout already inside the pixel cap keeps dpr 1. Larger layouts scale down.
 */
export function floorDpr(cssWidth: number, cssHeight: number, deviceDpr = 1): number {
  const dpr = Number.isFinite(deviceDpr) && deviceDpr > 0 ? Math.min(deviceDpr, 1) : 1;
  const area = Math.max(1, cssWidth) * Math.max(1, cssHeight) * dpr * dpr;
  if (area <= FLOOR_PIXEL_CAP) return dpr;
  return dpr * Math.sqrt(FLOOR_PIXEL_CAP / area);
}

export function floorBufferSize(cssWidth: number, cssHeight: number, deviceDpr = 1): { width: number; height: number; dpr: number } {
  const dpr = floorTierActive() ? floorDpr(cssWidth, cssHeight, deviceDpr) : (deviceDpr > 0 ? deviceDpr : 1);
  return {
    width: Math.max(1, Math.round(cssWidth * dpr)),
    height: Math.max(1, Math.round(cssHeight * dpr)),
    dpr,
  };
}
