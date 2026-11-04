/** Building outlines manually read from the user's 590 × 1280 satellite screenshot.
 * Image-right maps to +x and image-down to +z. The compass is slightly rotated, so these are image axes.
 * Heights, door positions and interiors are gameplay estimates; see CAMPUS_REFERENCE.md. */
export const CAMPUS_IMAGE = { width: 590, height: 1280, originX: 295, originY: 440, metresPerPixel: 0.17 } as const;
export const campusPoint = (px: number, py: number) => ({
  x: (px - CAMPUS_IMAGE.originX) * CAMPUS_IMAGE.metresPerPixel,
  z: (py - CAMPUS_IMAGE.originY) * CAMPUS_IMAGE.metresPerPixel,
});
export const campusRect = (rect: readonly [number, number, number, number]) => {
  const a = campusPoint(rect[0], rect[1]), b = campusPoint(rect[2], rect[3]);
  return { x0: a.x, z0: a.z, x1: b.x, z1: b.z };
};

export interface CampusBuilding {
  readonly id: string;
  readonly name: string;
  readonly rect: readonly [number, number, number, number];
  readonly height: number;
  readonly roof: 'light' | 'dark' | 'muted';
}
/** These are spatial game labels; the screenshot does not establish the buildings' actual room names. */
export const CAMPUS_BUILDINGS: readonly CampusBuilding[] = [
  { id: 'north-hall', name: 'NORTH HALL', rect: [235, 373, 353, 483], height: 4.8, roof: 'muted' },
  { id: 'west-annex', name: 'WEST ANNEX', rect: [173, 432, 215, 481], height: 3, roof: 'light' },
  { id: 'west-shelter', name: 'WEST SHELTER', rect: [144, 422, 159, 492], height: 2.7, roof: 'light' },
  { id: 'annex-south', name: 'ANNEX', rect: [173, 491, 207, 520], height: 2.8, roof: 'muted' },
  { id: 'west-hall', name: 'WEST HALL', rect: [240, 493, 299, 646], height: 4.2, roof: 'light' },
  { id: 'west-extension', name: 'WEST EXTENSION', rect: [300, 519, 327, 660], height: 3.4, roof: 'dark' },
  { id: 'north-wing', name: 'NORTH WING', rect: [376, 445, 566, 483], height: 3.3, roof: 'dark' },
  { id: 'inner-north', name: 'INNER NORTH WING', rect: [356, 484, 400, 559], height: 3.3, roof: 'dark' },
  { id: 'east-block', name: 'EAST BLOCK', rect: [422, 496, 497, 634], height: 3.8, roof: 'muted' },
  { id: 'inner-south', name: 'INNER SOUTH WING', rect: [361, 602, 400, 711], height: 3.3, roof: 'dark' },
  { id: 'south-wing', name: 'SOUTH WING', rect: [354, 711, 550, 740], height: 3.1, roof: 'dark' },
  { id: 'east-annex', name: 'EAST ANNEX', rect: [517, 646, 565, 682], height: 3, roof: 'muted' },
  { id: 'pool-room', name: 'POOL ROOM', rect: [10, 695, 29, 755], height: 2.6, roof: 'light' },
];
export const CAMPUS_COURTS = [28, 552, 207, 654] as const;
export const CAMPUS_POOL = [42, 696, 149, 747] as const;
