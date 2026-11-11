/** Where modelled props stand. Pure data shared by the baker (props are occluders in the bake) and the browser.
 * Props here have no collision, so none is placed where it could be mistaken for cover: they sit on existing
 * collision boxes, against walls, or are too small and open to hide behind. */
/** `replaces`: the model stands in for the collision box under it, so the art layer leaves that box's own faces out
 * (the procedural level still draws them wherever the art is not loaded). */
export interface Placement { model: string; x: number; y: number; z: number; yaw: number; scale?: number; replaces?: true }

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
  // Server Room: an extinguisher by the east wall.
  { model: 'korean_fire_extinguisher_01', x: 14.68, y: 0, z: -6.9, yaw: -Math.PI / 2 },
  // South Yard: a car under a dust cover in the bays (its collision box was cut to the model), a military crate on
  // the stacked crate and another on the steel bin, jerrycans, and drums against the perimeter by the containers.
  { model: 'covered_car', x: 7.3, y: 0, z: 15.15, yaw: Math.PI / 2, replaces: true },
  { model: 'wooden_military_crate', x: 2.2, y: 1.1, z: 13.22, yaw: 0.04 },
  { model: 'old_military_crate', x: 18.1, y: 1.3, z: 12.25, yaw: -0.08 },
  { model: 'metal_jerrycan_green', x: 17.35, y: 1.3, z: 11.95, yaw: 0.5 },
  { model: 'metal_jerrycan_green', x: 3.1, y: 0, z: 13.55, yaw: -0.3 },
  { model: 'metal_jerrycan_green', x: 3.12, y: 0, z: 13.05, yaw: 1.3 },
  { model: 'barrel_03', x: -18.05, y: 0, z: 21.55, yaw: 0.3 },
  { model: 'barrel_03', x: -17.35, y: 0, z: 21.6, yaw: 1.9 },
  { model: 'barrel_03', x: -17.75, y: 0, z: 20.95, yaw: 4.2 },
  { model: 'barrel_03', x: 24.0, y: 0, z: 21.55, yaw: 0.8 },
];
/** Whether a model stands in for the collision box with this footprint. */
export const replaced = (x0: number, z0: number, x1: number, z1: number) => PROPS.some(p => p.replaces && p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
