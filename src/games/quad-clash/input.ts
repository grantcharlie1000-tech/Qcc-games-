/** Quad Clash controls. Desktop: pointer-locked mouse look, WASD, Space, R, Q, G, Shift/right mouse to aim, Tab for
 * the scoreboard, with arrow keys and F as a keyboard-only alternative for looking and firing. Touch: a floating
 * move stick on the left, drag-to-look on the right and buttons for fire, aim, jump, reload, grenade and swap.
 * It never binds Escape and never takes keys from text fields or open dialogs. */

import { UI_ICONS } from './icons';

export interface Controls {
  yaw: number;
  pitch: number;
  mx: number;
  mz: number;
  fire: boolean;
  ads: boolean;
  jump: boolean;
  board: boolean;
  /** Edge actions, consumed by take(). */
  reload: boolean;
  swap: boolean;
  slot: -1 | 0 | 1;
  grenade: boolean;
  lookDX: number;
  lookDY: number;
}

export interface InputOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  signal: AbortSignal;
  /** True while the match takes gameplay input. */
  playing: () => boolean;
  /** True when a click on the arena may capture the mouse (alive, in a running match). */
  canLock: () => boolean;
  sensitivity: () => number;
  /** Look-speed multiplier while aiming (smaller for high zoom). */
  zoomScale: () => number;
  onPause: () => void;
  onUnlock: () => void;
  onLockChange: (locked: boolean) => void;
  onTouchMode: (touch: boolean) => void;
}

export interface Input {
  readonly state: Controls;
  readonly touch: boolean;
  readonly locked: boolean;
  /** False once the browser has refused pointer lock twice (drag-to-look takes over). */
  readonly lockable: boolean;
  lock(): void;
  unlock(): void;
  /** Move/fire state for this step, and edge actions which then reset. */
  take(): { reload: boolean; swap: boolean; slot: -1 | 0 | 1; grenade: boolean };
  setLook(yaw: number, pitch: number): void;
  clear(): void;
  frame(dt: number): void;
}

const MOUSE = 0.0022;
const TOUCH = 0.0062;
const KEY_TURN = 2.4;
const MAX_JUMP = 300;
const TEXT_ENTRY = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="searchbox"]';

export function createInput(o: InputOptions): Input {
  const { root, canvas, signal } = o;
  const s: Controls = { yaw: 0, pitch: 0, mx: 0, mz: 0, fire: false, ads: false, jump: false, board: false, reload: false, swap: false, slot: -1, grenade: false, lookDX: 0, lookDY: 0 };
  const keys = new Set<string>();
  let mouseFire = false, mouseAds = false, touchFire = false, touchFire2 = false, touchAds = false, touchJump = false, keyFire = false, wheelAt = 0;
  let touchMode = matchMedia('(pointer: coarse)').matches, lockFailures = 0, wasLocked = false;
  const locked = () => document.pointerLockElement === canvas;

  function ownsKey(e: KeyboardEvent) {
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || t.closest(TEXT_ENTRY))) return false;
    if (document.querySelector('dialog[open]')) return false;
    if (t instanceof Element && t !== document.body && t !== document.documentElement && !root.contains(t) && !locked()) return false;
    // Buttons inside the game keep Space and Enter for themselves.
    if (t instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return false;
    return true;
  }
  function look(dx: number, dy: number, k: number) {
    const z = o.zoomScale() * o.sensitivity();
    s.yaw -= dx * k * z;
    s.pitch = Math.max(-1.45, Math.min(1.45, s.pitch - dy * k * z));
    s.lookDX += dx * k * z; s.lookDY += dy * k * z;
  }
  function setTouch(v: boolean) { if (touchMode !== v) { touchMode = v; o.onTouchMode(v); if (!v) clearTouch(); } }

  // ---- Keyboard ----
  const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR', 'KeyQ', 'KeyG', 'KeyE', 'KeyF', 'Tab', 'ShiftLeft', 'ShiftRight', 'Digit1', 'Digit2', 'KeyP']);
  window.addEventListener('keydown', e => {
    if (!GAME_KEYS.has(e.code) || !ownsKey(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyP') { if (!e.repeat) o.onPause(); e.preventDefault(); return; }
    // Tab keeps moving focus unless the mouse is captured.
    if (e.code === 'Tab' && !locked()) return;
    if (!o.playing()) return;
    e.preventDefault();
    setTouch(false);
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyR') s.reload = true;
    if (e.code === 'KeyQ') s.swap = true;
    if (e.code === 'Digit1') s.slot = 0;
    if (e.code === 'Digit2') s.slot = 1;
    if (e.code === 'KeyG' || e.code === 'KeyE') s.grenade = true;
    if (e.code === 'KeyF') keyFire = true;
  }, { signal });
  window.addEventListener('keyup', e => {
    keys.delete(e.code);
    if (e.code === 'KeyF') keyFire = false;
    if (GAME_KEYS.has(e.code) && o.playing() && ownsKey(e)) e.preventDefault();
  }, { signal });
  const clearAll = () => { keys.clear(); mouseFire = mouseAds = keyFire = false; clearTouch(); };
  window.addEventListener('blur', clearAll, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); }, { signal });

  // ---- Mouse with pointer lock (drag-to-look where the lock is unavailable) ----
  let dragging = false;
  document.addEventListener('pointerlockchange', () => {
    const now = locked();
    if (now) lockFailures = 0;
    else { mouseFire = mouseAds = false; if (wasLocked) o.onUnlock(); }
    wasLocked = now;
    o.onLockChange(now);
  }, { signal });
  document.addEventListener('pointerlockerror', () => { lockFailures++; o.onLockChange(false); }, { signal });
  canvas.addEventListener('mousedown', e => {
    if (!o.playing()) return;
    setTouch(false);
    if (!locked() && o.canLock() && lockFailures < 2 && typeof canvas.requestPointerLock === 'function') { api.lock(); return; }
    if (!locked() && !o.canLock()) return;
    e.preventDefault();
    if (e.button === 0) mouseFire = true;
    if (e.button === 2) mouseAds = true;
    if (!locked()) dragging = true;
  }, { signal });
  document.addEventListener('mouseup', e => { if (e.button === 0) mouseFire = false; if (e.button === 2) mouseAds = false; dragging = false; }, { signal });
  document.addEventListener('mousemove', e => {
    if (!o.playing() || touchMode) return;
    if (!locked() && !dragging) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (Math.abs(dx) > MAX_JUMP || Math.abs(dy) > MAX_JUMP) return;
    look(dx, dy, MOUSE);
  }, { signal });
  canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  canvas.addEventListener('wheel', e => {
    if (!o.playing()) return;
    e.preventDefault();
    // One swap per flick: trackpads send dozens of wheel events.
    if (Math.abs(e.deltaY) > 2 && e.timeStamp - wheelAt > 250) { s.swap = true; wheelAt = e.timeStamp; }
  }, { signal, passive: false });

  // ---- Touch ----
  const pad = document.createElement('div');
  pad.className = 'qc-touch';
  pad.innerHTML = `
    <div class="qc-stick" aria-hidden="true"><div class="qc-stick-knob"></div></div>
    <button type="button" class="qc-tb qc-tb-fire" aria-label="Fire">${UI_ICONS.fire}</button>
    <button type="button" class="qc-tb qc-tb-fire2" aria-label="Fire (left hand)">${UI_ICONS.fire}</button>
    <button type="button" class="qc-tb qc-tb-ads" aria-label="Aim down sights">${UI_ICONS.aim}</button>
    <button type="button" class="qc-tb qc-tb-jump" aria-label="Jump">${UI_ICONS.jump}</button>
    <button type="button" class="qc-tb qc-tb-reload" aria-label="Reload">${UI_ICONS.reload}</button>
    <button type="button" class="qc-tb qc-tb-nade" aria-label="Throw grenade">${UI_ICONS.grenade}</button>
    <button type="button" class="qc-tb qc-tb-swap" aria-label="Swap weapon">${UI_ICONS.swap}</button>
    <button type="button" class="qc-tb qc-tb-board" aria-label="Scoreboard">${UI_ICONS.board}</button>`;
  root.append(pad);
  const stick = pad.querySelector<HTMLElement>('.qc-stick')!, knob = pad.querySelector<HTMLElement>('.qc-stick-knob')!;
  let stickId = -1, stickX = 0, stickY = 0, lookId = -1, lookX = 0, lookY = 0, touchMx = 0, touchMz = 0;
  const STICK_R = 52;
  /** Buttons activated from the keyboard or assistive tech: pressed for one frame, released on the next. */
  let pulses: ((v: boolean) => void)[] = [], releasing: ((v: boolean) => void)[] = [];
  function clearTouch() {
    stickId = lookId = -1; touchMx = touchMz = 0; touchFire = touchFire2 = touchAds = touchJump = false;
    stick.dataset.on = 'false';
    knob.style.transform = '';
    for (const b of pad.querySelectorAll<HTMLElement>('.qc-tb')) b.dataset.down = 'false';
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !o.playing()) return;
    setTouch(true);
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < r.width * 0.42 && y > 70 && stickId < 0) {
      stickId = e.pointerId; stickX = x; stickY = y;
      stick.style.left = `${x}px`; stick.style.top = `${y}px`; stick.dataset.on = 'true';
    } else if (lookId < 0) { lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY; }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
  }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      const r = canvas.getBoundingClientRect();
      let dx = e.clientX - r.left - stickX, dy = e.clientY - r.top - stickY;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      touchMx = dx / STICK_R; touchMz = -dy / STICK_R;
    } else if (e.pointerId === lookId && o.playing()) {
      look(e.clientX - lookX, e.clientY - lookY, TOUCH);
      lookX = e.clientX; lookY = e.clientY;
    }
  }, { signal });
  const endPointer = (e: PointerEvent) => {
    if (e.pointerId === stickId) { stickId = -1; touchMx = touchMz = 0; stick.dataset.on = 'false'; knob.style.transform = ''; }
    if (e.pointerId === lookId) lookId = -1;
  };
  canvas.addEventListener('pointerup', endPointer, { signal });
  canvas.addEventListener('pointercancel', endPointer, { signal });

  /** Hold buttons: the fire buttons also look while dragged, like a thumb resting on the trigger. */
  function holdButton(sel: string, set: (v: boolean) => void, drag = false) {
    const b = pad.querySelector<HTMLButtonElement>(sel)!;
    let id = -1, lx = 0, ly = 0;
    b.addEventListener('pointerdown', e => {
      if (!o.playing()) return;
      e.preventDefault(); setTouch(e.pointerType !== 'mouse' || touchMode);
      id = e.pointerId; lx = e.clientX; ly = e.clientY; set(true); b.dataset.down = 'true';
      try { b.setPointerCapture(e.pointerId); } catch { /* gone */ }
    }, { signal });
    b.addEventListener('pointermove', e => { if (drag && e.pointerId === id && o.playing()) { look(e.clientX - lx, e.clientY - ly, TOUCH); lx = e.clientX; ly = e.clientY; } }, { signal });
    const up = (e: PointerEvent) => { if (e.pointerId === id) { id = -1; set(false); b.dataset.down = 'false'; } };
    b.addEventListener('pointerup', up, { signal });
    b.addEventListener('pointercancel', up, { signal });
    b.addEventListener('lostpointercapture', up, { signal });
    // Keyboard and assistive activation still work as a single press.
    b.addEventListener('click', e => { if (e.detail === 0 && o.playing()) { set(true); pulses.push(set); } }, { signal });
  }
  function tapButton(sel: string, act: () => void) {
    const b = pad.querySelector<HTMLButtonElement>(sel)!;
    b.addEventListener('pointerdown', e => { if (!o.playing()) return; e.preventDefault(); act(); b.dataset.down = 'true'; }, { signal });
    b.addEventListener('pointerup', () => { b.dataset.down = 'false'; }, { signal });
    b.addEventListener('click', e => { if (e.detail === 0 && o.playing()) act(); }, { signal });
  }
  holdButton('.qc-tb-fire', v => { touchFire = v; }, true);
  holdButton('.qc-tb-fire2', v => { touchFire2 = v; });
  holdButton('.qc-tb-jump', v => { touchJump = v; });
  holdButton('.qc-tb-board', v => { s.board = v; });
  tapButton('.qc-tb-ads', () => { touchAds = !touchAds; pad.querySelector<HTMLElement>('.qc-tb-ads')!.dataset.on = String(touchAds); });
  tapButton('.qc-tb-reload', () => { s.reload = true; });
  tapButton('.qc-tb-nade', () => { s.grenade = true; });
  tapButton('.qc-tb-swap', () => { s.swap = true; });
  root.dataset.touch = String(touchMode);

  const api: Input = {
    state: s,
    get touch() { return touchMode; },
    get locked() { return locked(); },
    get lockable() { return typeof canvas.requestPointerLock === 'function' && lockFailures < 2; },
    lock() {
      if (touchMode || locked() || typeof canvas.requestPointerLock !== 'function') return;
      // A refusal is counted once, by the pointerlockerror listener (a rejected promise fires it too).
      try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => {}); } catch { lockFailures++; }
    },
    unlock() { if (locked()) { wasLocked = false; document.exitPointerLock(); } },
    take() {
      const out = { reload: s.reload, swap: s.swap, slot: s.slot, grenade: s.grenade };
      s.reload = false; s.swap = false; s.slot = -1; s.grenade = false;
      return out;
    },
    setLook(yaw, pitch) { s.yaw = yaw; s.pitch = pitch; },
    clear() { clearAll(); s.reload = s.swap = s.grenade = false; s.slot = -1; s.board = false; touchAds = false; pad.querySelector<HTMLElement>('.qc-tb-ads')!.dataset.on = 'false'; },
    frame(dt) {
      for (const release of releasing) release(false);
      releasing = pulses; pulses = [];
      const k = (c: string) => keys.has(c);
      const kx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), kz = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
      s.mx = touchMode ? touchMx : kx; s.mz = touchMode ? touchMz : kz;
      const turn = (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0), tilt = (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0);
      if (turn || tilt) { const z = o.zoomScale(); s.yaw += turn * KEY_TURN * dt * z; s.pitch = Math.max(-1.45, Math.min(1.45, s.pitch + tilt * KEY_TURN * 0.6 * dt * z)); }
      s.fire = mouseFire || touchFire || touchFire2 || keyFire;
      s.ads = mouseAds || touchAds || k('ShiftLeft') || k('ShiftRight');
      s.jump = k('Space') || touchJump;
      if (!touchMode) s.board = k('Tab');
      if (root.dataset.touch !== String(touchMode)) root.dataset.touch = String(touchMode);
    },
  };
  return api;
}
