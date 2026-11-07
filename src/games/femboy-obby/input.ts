/** Femboy Frosthop input. Keyboard (WASD/arrows, Space, Q/E camera, C recentre), mouse or trackpad drag to orbit,
 * and touch: a left move stick, a right look area, and jump and recentre buttons, each tracked by its own pointer id
 * so move, look and jump work together. Escape is never handled here: it belongs to the shell's Study Mode. */

export interface InputState {
  /** Stick in camera space: x right, y forward, magnitude ≤ 1. */
  ix: number; iy: number;
  jump: boolean;
  yaw: number; pitch: number;
}

export interface Input {
  readonly state: InputState;
  /** Per-frame camera turning from held keys. */
  frame(dt: number): void;
  setLook(yaw: number, pitch?: number): void;
  clear(): void;
  readonly touch: boolean;
  dispose(): void;
}

export const PITCH = { min: 0.12, max: 1.05, rest: 0.42 } as const;
const KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['Space'], turnL: ['KeyQ'], turnR: ['KeyE'] };

export function createInput(o: {
  root: HTMLElement; canvas: HTMLCanvasElement; signal: AbortSignal;
  active: () => boolean; onRecentre: () => void; onTouchMode: (touch: boolean) => void; onActivity: () => void;
}): Input {
  const state: InputState = { ix: 0, iy: 0, jump: false, yaw: 0, pitch: PITCH.rest };
  const held = new Set<string>();
  const { root, canvas, signal } = o;
  let touch = false;
  let jumpTouch = false;
  const stick = { id: -1, x0: 0, y0: 0, x: 0, y: 0 };
  const look = { id: -1, x: 0, y: 0 };
  const drag = { id: -1, x: 0, y: 0 };
  const knob = root.querySelector<HTMLElement>('.fo-stick');
  const knobDot = root.querySelector<HTMLElement>('.fo-stick i');

  const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const blocked = (e: Event) => typing(e.target) || !!document.querySelector('dialog[open]') || !o.active() || (e.target instanceof Element && e.target !== document.body && !root.contains(e.target) && !(e.target instanceof HTMLElement && e.target.id === 'game-stage'));

  function syncKeys() {
    const has = (k: string[]) => k.some(c => held.has(c));
    // Jump is independent of movement: it updates even while the touch stick is held.
    state.jump = has(KEYS.jump) || jumpTouch;
    if (stick.id >= 0) return;
    state.ix = (has(KEYS.right) ? 1 : 0) - (has(KEYS.left) ? 1 : 0);
    state.iy = (has(KEYS.up) ? 1 : 0) - (has(KEYS.down) ? 1 : 0);
    const m = Math.hypot(state.ix, state.iy);
    if (m > 1) { state.ix /= m; state.iy /= m; }
  }
  const all = Object.values(KEYS).flat();
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || blocked(e)) return;
    if (e.code === 'KeyC' && !e.repeat) { e.preventDefault(); o.onRecentre(); return; }
    if (!all.includes(e.code)) return;
    e.preventDefault();
    held.add(e.code);
    setTouch(false);
    o.onActivity();
    syncKeys();
  }, { signal });
  window.addEventListener('keyup', e => { if (held.delete(e.code)) syncKeys(); }, { signal });

  function setTouch(on: boolean) { if (touch !== on) { touch = on; o.onTouchMode(on); } }

  // Mouse/trackpad: drag anywhere on the canvas to orbit.
  canvas.addEventListener('pointerdown', e => {
    if (!o.active()) return;
    if (e.pointerType === 'touch') { setTouch(true); return; }
    setTouch(false);
    drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.focus({ preventScroll: true });
  }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== drag.id) return;
    orbit(e.clientX - drag.x, e.clientY - drag.y, 0.006);
    drag.x = e.clientX; drag.y = e.clientY;
  }, { signal });
  const endDrag = (e: PointerEvent) => { if (e.pointerId === drag.id) drag.id = -1; };
  canvas.addEventListener('pointerup', endDrag, { signal });
  canvas.addEventListener('pointercancel', endDrag, { signal });
  canvas.addEventListener('lostpointercapture', endDrag, { signal });
  canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal });

  function orbit(dx: number, dy: number, k: number) {
    state.yaw -= dx * k;
    state.pitch = Math.max(PITCH.min, Math.min(PITCH.max, state.pitch + dy * k));
    o.onActivity();
  }

  // Touch: the left half of the touch layer is the move stick, the right half looks around.
  const pad = root.querySelector<HTMLElement>('.fo-touch');
  const jumpBtn = root.querySelector<HTMLButtonElement>('.fo-jump');
  pad?.addEventListener('pointerdown', e => {
    if (!o.active()) return;
    setTouch(true);
    const r = pad.getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.45 && stick.id < 0) {
      stick.id = e.pointerId; stick.x0 = stick.x = e.clientX; stick.y0 = stick.y = e.clientY;
      if (knob) { knob.hidden = false; knob.style.left = `${e.clientX - r.left}px`; knob.style.top = `${e.clientY - r.top}px`; }
    } else if (look.id < 0) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
    else return;
    pad.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    o.onActivity();
  }, { signal });
  pad?.addEventListener('pointermove', e => {
    if (e.pointerId === stick.id) {
      stick.x = e.clientX; stick.y = e.clientY;
      const R = 52, dx = stick.x - stick.x0, dy = stick.y - stick.y0, m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
      state.ix = (dx * k) / R; state.iy = -(dy * k) / R;
      if (Math.hypot(state.ix, state.iy) < 0.12) state.ix = state.iy = 0;
      if (knobDot) knobDot.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    } else if (e.pointerId === look.id) {
      orbit(e.clientX - look.x, e.clientY - look.y, 0.008);
      look.x = e.clientX; look.y = e.clientY;
    }
  }, { signal });
  const endTouch = (e: PointerEvent) => {
    if (e.pointerId === stick.id) { stick.id = -1; state.ix = state.iy = 0; if (knob) knob.hidden = true; if (knobDot) knobDot.style.transform = ''; syncKeys(); }
    if (e.pointerId === look.id) look.id = -1;
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) pad?.addEventListener(type, endTouch, { signal });

  const jumpUp = () => { jumpTouch = false; syncKeys(); jumpBtn?.classList.remove('is-down'); };
  jumpBtn?.addEventListener('pointerdown', e => {
    if (!o.active()) return;
    e.preventDefault();
    if (e.pointerType === 'touch') setTouch(true);
    jumpTouch = true; jumpBtn.classList.add('is-down');
    jumpBtn.setPointerCapture?.(e.pointerId);
    syncKeys(); o.onActivity();
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) jumpBtn?.addEventListener(type, jumpUp, { signal });
  // Keyboard/switch users can still press the visible button: a click is a quick tap.
  jumpBtn?.addEventListener('click', e => { if (e.detail === 0 && o.active()) { jumpTouch = true; syncKeys(); setTimeout(jumpUp, 120); } }, { signal });

  window.addEventListener('blur', () => clear(), { signal });

  function clear() {
    held.clear();
    jumpTouch = false;
    stick.id = look.id = drag.id = -1;
    state.ix = state.iy = 0; state.jump = false;
    if (knob) knob.hidden = true;
    jumpBtn?.classList.remove('is-down');
  }

  return {
    state,
    frame(dt) {
      const turn = (held.has('KeyE') ? 1 : 0) - (held.has('KeyQ') ? 1 : 0);
      if (turn) state.yaw -= turn * 2.2 * dt;
    },
    setLook(yaw, pitch = PITCH.rest) { state.yaw = yaw; state.pitch = pitch; },
    clear,
    get touch() { return touch; },
    dispose() { clear(); },
  };
}

/** Camera-relative stick to a world move direction (forward is where the camera looks). */
export function worldMove(ix: number, iy: number, yaw: number): { mx: number; mz: number } {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return { mx: rx * ix + fx * iy, mz: rz * ix + fz * iy };
}
