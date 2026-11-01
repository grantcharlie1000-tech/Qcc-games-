/** Analytic presentation poses: deterministic at any time, independent of the renderer's frame rate. */
import {clamp, DEATH_TIME_REDUCED, lerp} from './config';

export function ufoFlight(age: number, reduced = false) {
  if (reduced) return {height: 1.65, forward: -0.12, sideways: 0, beam: 1, birdLift: 0, birdForward: 0,
    birdScale: 1, birdAlpha: 1 - clamp(age / DEATH_TIME_REDUCED, 0, 1), visible: age < DEATH_TIME_REDUCED};
  // A single fast swoop and grab. The bird travels away with the saucer rather
  // than spending most of the death shrinking into a stationary tractor beam.
  const approach = clamp(age / 0.24, 0, 1), drop = (1 - approach) ** 2;
  const pickup = clamp((age - 0.24) / 0.1, 0, 1), away = clamp((age - 0.34) / 0.34, 0, 1) ** 2;
  return {
    height: 1.65 + 15 * drop + 18 * away,
    forward: -0.12 - 9 * drop - 10 * away,
    sideways: 1.4 * drop + 1.2 * away,
    beam: age < 0.24 ? 0 : (1 - clamp((age - 0.4) / 0.1, 0, 1)),
    birdLift: 1.02 * pickup + 18 * away,
    birdForward: -0.12 * pickup - 10 * away,
    birdScale: lerp(1, 0.9, pickup),
    birdAlpha: 1,
    visible: age < 0.68,
  };
}
