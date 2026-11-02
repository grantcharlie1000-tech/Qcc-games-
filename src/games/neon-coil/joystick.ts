/**
 * Visible thumb joystick for touch devices. It rests in the lower-left corner
 * (inside the safe area) and, when a thumb lands anywhere in the generous
 * lower-left zone, re-centres under that thumb. The knob follows the thumb and
 * clamps to the ring. Purely visual DOM: pointer ownership stays with the
 * arena canvas, so the Boost button keeps its own independent pointer.
 */
import { joystickVector, type StickVector } from './input';
import { JOYSTICK_KNOB_RADIUS, JOYSTICK_RADIUS } from './tuning';

export interface Joystick {
  readonly element: HTMLElement;
  readonly active: boolean;
  /** Target heading from the knob, or undefined when idle or inside the dead zone. */
  angle(): number | undefined;
  /** Begin at a root-relative CSS px point. */
  start(x: number, y: number): void;
  /** Top of the resting ring, in root CSS px, ignoring any active offset. */
  restTop(): number;
  move(x: number, y: number): void;
  end(): void;
}

export function createJoystick(root: HTMLElement): Joystick {
  const element = document.createElement('div');
  element.className = 'nc-stick'; element.hidden = true; element.setAttribute('aria-hidden', 'true');
  element.innerHTML = '<span class="nc-stick-ring"></span><span class="nc-stick-knob"></span>';
  root.style.setProperty('--nc-stick-size', `${JOYSTICK_RADIUS * 2}px`);
  root.style.setProperty('--nc-stick-knob', `${JOYSTICK_KNOB_RADIUS * 2}px`);
  const knob = element.querySelector<HTMLElement>('.nc-stick-knob')!;
  // `anchor` is where the thumb landed (deflection is measured from it); `origin` is where the ring is drawn.
  let active = false, anchor = { x: 0, y: 0 }, vector: StickVector = { x: 0, y: 0, magnitude: 0 };
  /** The resting ring in root coordinates (its CSS position already respects safe-area insets). */
  function rest() {
    const box = root.getBoundingClientRect(), left = parseFloat(getComputedStyle(element).left) || 0;
    const bottom = parseFloat(getComputedStyle(element).bottom) || 0, size = JOYSTICK_RADIUS * 2;
    return { left, bottom: box.height - bottom, cx: left + size / 2, cy: box.height - bottom - size / 2 };
  }
  return {
    element,
    get active() { return active; },
    angle: () => active ? vector.angle : undefined,
    start(x, y) {
      const home = rest();
      // The ring appears under the thumb, but never further into the corner than the resting spot.
      // Steering is measured from the landing point, so touching down never steers by itself.
      const origin = { x: Math.max(x, home.cx), y: Math.min(y, home.cy) };
      anchor = { x, y }; active = true; element.dataset.active = 'true';
      element.style.transform = `translate(${origin.x - home.cx}px,${origin.y - home.cy}px)`;
      this.move(x, y);
    },
    move(x, y) {
      if (!active) return;
      vector = joystickVector(x - anchor.x, y - anchor.y);
      knob.style.transform = `translate(${vector.x}px,${vector.y}px)`;
    },
    restTop() { const home = rest(); return home.cy - JOYSTICK_RADIUS; },
    end() {
      active = false; vector = { x: 0, y: 0, magnitude: 0 }; delete element.dataset.active;
      element.style.transform = ''; knob.style.transform = '';
    }
  };
}
