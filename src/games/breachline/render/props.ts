/** Where modelled props stand. Pure data shared by the baker (props are occluders in the bake) and the browser.
 * Props here have no collision, so none is placed where it could be mistaken for cover: they sit on existing
 * collision boxes, against walls, or are too small and open to hide behind. */
export interface Placement { model: string; x: number; y: number; z: number; yaw: number; scale?: number }

export const PROPS: Placement[] = [
  // Lab: a tool chest on the west bench, an extinguisher by the north wall, stools along the benches.
  { model: 'metal_tool_chest', x: -3.75, y: 0.95, z: -6.2, yaw: Math.PI },
  { model: 'korean_fire_extinguisher_01', x: -4.6, y: 0, z: -9.72, yaw: 0 },
  { model: 'metal_stool_01', x: -2.3, y: 0, z: -5.15, yaw: 0.4 },
  { model: 'metal_stool_01', x: -3.4, y: 0, z: -5.2, yaw: -0.3 },
  { model: 'metal_stool_01', x: 1.6, y: 0, z: -5.15, yaw: 1.1 },
];
