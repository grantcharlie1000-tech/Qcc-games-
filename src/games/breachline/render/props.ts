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
  // Corridor: extinguishers standing at the foot of the walls by the west window and mid-way along.
  { model: 'korean_fire_extinguisher_01', x: -14.72, y: 0, z: 0.72, yaw: Math.PI },
  { model: 'korean_fire_extinguisher_01', x: 5.45, y: 0, z: 0.8, yaw: Math.PI },
  // Security cameras high on the end posts, watching down the corridor.
  { model: 'security_camera_01', x: -15.0, y: 2.45, z: -1.85, yaw: 0 },
  { model: 'security_camera_01', x: 15.0, y: 2.45, z: 0.85, yaw: Math.PI },
];
