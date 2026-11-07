/** Fixed simulation constants for the frosthop-v1 ranked board. Changing any of them changes ranked times. */
export const COURSE_VERSION = 'frosthop-v1';
export const STEP = 1 / 60;
/** Bounded catch-up: at most this much real time is simulated per frame. */
export const MAX_FRAME = 0.25;

export const PLAYER = { halfWidth: 0.32, height: 1.8 } as const;
export const MOVE = {
  speed: 6,
  groundAccel: 70,
  iceAccel: 9,
  airAccel: 32,
  jump: 9,
  gravity: 24,
  fallLimit: 32,
  /** Releasing jump while rising trims the arc. */
  jumpCut: 0.55,
  coyote: 0.1,
  buffer: 0.12,
  stepUp: 0.35,
  spring: 15.5,
} as const;

export const CRUMBLE = { warn: 0.75, gone: 2.2, assistWarn: 1.3 } as const;
/** Assistance slows every hazard and moving platform consistently. */
export const ASSIST_SPEED = 0.65;
export const RESPAWN_DELAY = 0.35;
export const STAR_RADIUS = 0.75;
/** Hazard contacts are forgiving: only this fraction of the visible size hurts. */
export const HAZARD_GRACE = 0.8;
