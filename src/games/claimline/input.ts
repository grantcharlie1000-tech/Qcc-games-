/**
 * Claimline input. It only ever produces a desired heading; the model turns the head at TURN_RATE.
 * Mouse aims at the pointer, keys steer 8-way, touch and pen drive a floating thumbstick.
 * Escape is never handled here, so the shell can always open Study.
 */
export type InputSource = 'none' | 'keyboard' | 'mouse' | 'touch';

export interface InputState {
  source: InputSource;
  stick: 'idle' | 'active';
}

export interface Input {
  /** Desired heading in radians, or undefined when nothing new is being asked (the heading is then kept). */
  target(): number | undefined;
  /** Drops every held key, pointer and capture, hides the stick. Heading is kept by the model. */
  clear(): void;
  readonly state: InputState;
}

export const MOUSE_DEAD_ZONE = 12; // px between pointer and head before the mouse steers
export const STICK_DEAD_ZONE = 10; // px of knob travel before the stick steers
export const STICK_RADIUS = 48; // px, knob travel limit (half the 96px base)

const KEYS: Record<string, [number, number]> = {
  arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
};

const typingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable=""],[contenteditable=true]');

export function createInput(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  getHeadScreen: () => { x: number; y: number },
  signal: AbortSignal,
): Input {
  const state: InputState = { source: 'none', stick: 'idle' };
  const stick = root.querySelector<HTMLElement>('.cl-stick');
  const knob = root.querySelector<HTMLElement>('.cl-stick-knob');
  const keys = new Set<string>();
  let mouse: { x: number; y: number } | null = null;
  let touchId: number | null = null;
  let origin = { x: 0, y: 0 }, offset = { x: 0, y: 0 };

  function keyAngle(): number | undefined {
    let x = 0, y = 0;
    for (const key of keys) { const d = KEYS[key]; if (d) { x += d[0]; y += d[1]; } }
    return x || y ? Math.atan2(y, x) : undefined;
  }

  function showStick(visible: boolean) {
    state.stick = visible ? 'active' : 'idle';
    if (stick) stick.hidden = !visible;
  }
  function placeStick() {
    if (stick) stick.style.transform = `translate(${origin.x - STICK_RADIUS}px, ${origin.y - STICK_RADIUS}px)`;
    if (knob) knob.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  }

  function endTouch() {
    if (touchId !== null) {
      if (canvas.hasPointerCapture(touchId)) canvas.releasePointerCapture(touchId);
      touchId = null;
    }
    offset = { x: 0, y: 0 };
    showStick(false);
    if (state.source === 'touch') state.source = 'none';
  }

  function clear() {
    endTouch();
    keys.clear();
    mouse = null;
    state.source = 'none';
  }

  const local = (event: PointerEvent, element: Element) => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse') {
      mouse = local(event, canvas);
      state.source = 'mouse';
    } else if (event.pointerId === touchId) {
      const p = local(event, root);
      let dx = p.x - origin.x, dy = p.y - origin.y;
      const length = Math.hypot(dx, dy);
      if (length > STICK_RADIUS) { dx = dx / length * STICK_RADIUS; dy = dy / length * STICK_RADIUS; }
      offset = { x: dx, y: dy };
      placeStick();
      event.preventDefault();
    }
  }, { signal });

  canvas.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') mouse = null;
  }, { signal });

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') { mouse = local(event, canvas); state.source = 'mouse'; return; }
    if (touchId !== null) return; // one steering touch only
    touchId = event.pointerId;
    origin = local(event, root);
    offset = { x: 0, y: 0 };
    canvas.setPointerCapture(event.pointerId);
    state.source = 'touch';
    showStick(true);
    placeStick();
    event.preventDefault();
  }, { signal });

  const release = (event: PointerEvent) => { if (event.pointerId === touchId) endTouch(); };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, release, { signal });

  const dialogOpen = () => !!document.querySelector('dialog[open]');
  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || dialogOpen() || typingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'p') {
      event.preventDefault();
      if (!event.repeat) document.querySelector<HTMLButtonElement>('#pause-game')?.click();
      return;
    }
    if (KEYS[key]) {
      event.preventDefault();
      keys.add(key);
      state.source = 'keyboard';
    }
  }, { signal });
  window.addEventListener('keyup', event => { keys.delete(event.key.toLowerCase()); }, { signal });

  return {
    state,
    clear,
    target() {
      if (state.source === 'keyboard') return keyAngle();
      if (state.source === 'mouse' && mouse) {
        const head = getHeadScreen();
        const dx = mouse.x - head.x, dy = mouse.y - head.y;
        return Math.hypot(dx, dy) > MOUSE_DEAD_ZONE ? Math.atan2(dy, dx) : undefined;
      }
      if (state.source === 'touch' && touchId !== null && Math.hypot(offset.x, offset.y) > STICK_DEAD_ZONE) return Math.atan2(offset.y, offset.x);
      return undefined;
    },
  };
}
