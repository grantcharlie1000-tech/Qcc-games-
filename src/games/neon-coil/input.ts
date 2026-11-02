/**
 * Pure steering input. Every input (thumb joystick, mouse/trackpad pointer,
 * keyboard) produces only a TARGET heading; the simulation's shared
 * `turnToward` law turns the head toward it, so all inputs feel the same.
 */
import { JOYSTICK_DEAD_ZONE, JOYSTICK_TRAVEL, JOYSTICK_ZONE_TOP, JOYSTICK_ZONE_WIDTH, POINTER_DEAD_ZONE } from './tuning';

export interface StickVector { x: number; y: number; magnitude: number; angle?: number }

/**
 * Knob position for a thumb `dx, dy` CSS px from the ring centre. The knob
 * follows the thumb and clamps to `travel`; any direction is allowed (360°,
 * analogue). Inside the dead zone `angle` is undefined (keep the current target).
 */
export function joystickVector(dx: number, dy: number, travel = JOYSTICK_TRAVEL, deadZone = JOYSTICK_DEAD_ZONE): StickVector {
  const length = Math.hypot(dx, dy), scale = length > travel ? travel / length : 1;
  const magnitude = Math.min(1, length / travel);
  return { x: dx * scale, y: dy * scale, magnitude, angle: magnitude > deadZone ? Math.atan2(dy, dx) : undefined };
}

/** True when a touch at `x, y` (CSS px inside the arena) lands in the generous lower-left joystick zone. */
export const inJoystickZone = (x: number, y: number, width: number, height: number) => x <= width * JOYSTICK_ZONE_WIDTH && y >= height * JOYSTICK_ZONE_TOP;

/** Mouse/trackpad aim: the angle from the head (screen centre) to the pointer, or undefined inside the dead zone. */
export function pointerAngle(dx: number, dy: number, deadZone = POINTER_DEAD_ZONE) {
  return Math.hypot(dx, dy) > deadZone ? Math.atan2(dy, dx) : undefined;
}

const DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0]
};
export const isSteeringKey = (key: string) => key in DIRECTIONS;

/**
 * Keyboard steering: hold-to-turn toward an 8-way direction.
 *
 * While arrows/WASD are held, the target is their combined direction
 * (diagonals included) and the head turns toward it through the shared smooth
 * turn. Releasing every direction key locks the target to the heading at that
 * moment, so a short tap is a small precise nudge, holding completes the turn,
 * and any heading in 360° is reachable from the keyboard.
 */
export class KeyboardSteering {
  private readonly keys = new Set<string>();
  private locked: number | undefined;
  press(key: string) { if (!isSteeringKey(key)) return false; this.keys.add(key); return true; }
  release(key: string, heading: number) {
    if (!this.keys.delete(key)) return;
    if (this.direction() === undefined) this.locked = heading;
  }
  direction() {
    let x = 0, y = 0;
    for (const key of this.keys) { const d = DIRECTIONS[key]; x += d[0]; y += d[1]; }
    return x || y ? Math.atan2(y, x) : undefined;
  }
  /** Target heading, or undefined when the keyboard has never steered (keep the current target). */
  target() { return this.direction() ?? this.locked; }
  get held() { return this.keys.size > 0; }
  clear() { this.keys.clear(); this.locked = undefined; }
}
