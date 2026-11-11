/** Controls. Desktop and Chromebook: pointer-locked mouse or trackpad look, W A S D, Shift sprint, C crouch,
 * Q / E lean, right button or Space to aim (Space suits a trackpad), F use, G grenade, B breach charge, V melee,
 * R reload, X or the wheel to swap, Tab for the scoreboard; arrow keys also look. Touch: a move stick on the left,
 * drag to look on the right, and buttons. It never binds Escape and never takes keys from text fields or dialogs. */

export interface Controls {
  yaw: number; pitch: number; mx: number; mz: number;
  fire: boolean; ads: boolean; crouch: boolean; sprint: boolean; lean: -1 | 0 | 1; use: boolean; board: boolean;
  /** Edges, consumed by take(). */
  reload: boolean; swap: boolean; melee: boolean; grenade: boolean; breach: boolean; digit: 0 | 1 | 2 | 3; next: boolean;
}
export interface InputOptions {
  root: HTMLElement; canvas: HTMLCanvasElement; signal: AbortSignal;
  /** True while gameplay input is taken. */
  playing: () => boolean;
  canLock: () => boolean;
  sensitivity: () => number;
  zoomScale: () => number;
  onPause: () => void;
  onUnlock: () => void;
  onLockChange: (locked: boolean) => void;
}
export interface Input {
  readonly state: Controls;
  readonly touch: boolean; readonly locked: boolean; readonly lockable: boolean;
  lock(): void; unlock(): void;
  take(): Pick<Controls, 'reload' | 'swap' | 'melee' | 'grenade' | 'breach' | 'digit' | 'next'>;
  setLook(yaw: number, pitch: number): void;
  clear(): void;
  frame(dt: number): void;
}

const MOUSE = 0.0021, TOUCH = 0.0058, KEY_TURN = 2.3, MAX_JUMP = 300;
const TEXT_ENTRY = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="searchbox"]';
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  fire: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  aim: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>'),
  crouch: svg('<path d="M6 7l6 5 6-5M6 13l6 5 6-5"/>'),
  reload: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
  swap: svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  grenade: svg('<circle cx="12" cy="14" r="6"/><path d="M10 8V5h4v3M14 5h4"/>'),
  breach: svg('<rect x="5" y="7" width="14" height="10" rx="1.5"/><path d="M9 12h6M12 4v3"/>'),
  melee: svg('<path d="M5 19l4-1 10-10-3-3L6 15z"/><path d="M14 7l3 3"/>'),
  use: svg('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10M12 10V4.5a1.5 1.5 0 0 1 3 0V11M15 11V7a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4.5a1.5 1.5 0 0 1 2.4-1.8L9 14"/>'),
  leanL: svg('<path d="M14 5L8 12l6 7"/>'), leanR: svg('<path d="M10 5l6 7-6 7"/>'),
  board: svg('<path d="M5 6h14M5 12h14M5 18h14"/>'),
};

export function createInput(o: InputOptions): Input {
  const { root, canvas, signal } = o;
  const s: Controls = { yaw: 0, pitch: 0, mx: 0, mz: 0, fire: false, ads: false, crouch: false, sprint: false, lean: 0, use: false, board: false, reload: false, swap: false, melee: false, grenade: false, breach: false, digit: 0, next: false };
  const keys = new Set<string>();
  let mouseFire = false, mouseAds = false, tFire = false, tFire2 = false, tAds = false, tUse = false, tLean: -1 | 0 | 1 = 0, tBoard = false, wheelAt = 0;
  let touchMode = matchMedia('(pointer: coarse)').matches, lockFailures = 0, wasLocked = false;
  const locked = () => document.pointerLockElement === canvas;
  function ownsKey(e: KeyboardEvent) {
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || t.closest(TEXT_ENTRY))) return false;
    if (document.querySelector('dialog[open]')) return false;
    if (t instanceof Element && t !== document.body && t !== document.documentElement && !root.contains(t) && !locked()) return false;
    if (t instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return false;
    return true;
  }
  function look(dx: number, dy: number, k: number) {
    const z = o.zoomScale() * o.sensitivity();
    s.yaw -= dx * k * z; s.pitch = Math.max(-1.45, Math.min(1.45, s.pitch - dy * k * z));
  }
  function setTouch(v: boolean) { if (touchMode !== v) { touchMode = v; if (!v) clearTouch(); } }

  const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR', 'KeyQ', 'KeyE', 'KeyG', 'KeyB', 'KeyV', 'KeyF', 'KeyC', 'KeyX', 'Tab', 'ShiftLeft', 'ShiftRight', 'Digit1', 'Digit2', 'Digit3', 'KeyP']);
  window.addEventListener('keydown', e => {
    if (!GAME_KEYS.has(e.code) || !ownsKey(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyP') { if (!e.repeat) o.onPause(); e.preventDefault(); return; }
    if (e.code === 'Tab' && !locked()) return;
    if (!o.playing()) return;
    e.preventDefault();
    setTouch(false);
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyR') s.reload = true;
    else if (e.code === 'KeyX') s.swap = true;
    else if (e.code === 'KeyV') s.melee = true;
    else if (e.code === 'KeyG') s.grenade = true;
    else if (e.code === 'KeyB') s.breach = true;
    else if (e.code === 'KeyC') s.crouch = !s.crouch;
    else if (e.code === 'Digit1') s.digit = 1; else if (e.code === 'Digit2') s.digit = 2; else if (e.code === 'Digit3') s.digit = 3;
  }, { signal });
  window.addEventListener('keyup', e => { keys.delete(e.code); if (GAME_KEYS.has(e.code) && o.playing() && ownsKey(e)) e.preventDefault(); }, { signal });
  const clearAll = () => { keys.clear(); mouseFire = mouseAds = false; clearTouch(); };
  window.addEventListener('blur', clearAll, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); }, { signal });

  let dragging = false;
  document.addEventListener('pointerlockchange', () => {
    const now = locked();
    if (now) lockFailures = 0; else { mouseFire = mouseAds = false; if (wasLocked) o.onUnlock(); }
    wasLocked = now; o.onLockChange(now);
  }, { signal });
  document.addEventListener('pointerlockerror', () => { lockFailures++; o.onLockChange(false); }, { signal });
  canvas.addEventListener('mousedown', e => {
    if (!o.playing()) return;
    setTouch(false);
    if (!locked() && o.canLock() && lockFailures < 2 && typeof canvas.requestPointerLock === 'function') { api.lock(); return; }
    e.preventDefault();
    if (e.button === 0) { mouseFire = true; s.next = true; }
    if (e.button === 2) mouseAds = true;
    if (!locked()) dragging = true;
  }, { signal });
  document.addEventListener('mouseup', e => { if (e.button === 0) mouseFire = false; if (e.button === 2) mouseAds = false; dragging = false; }, { signal });
  document.addEventListener('mousemove', e => {
    if (!o.playing() || touchMode || (!locked() && !dragging)) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (Math.abs(dx) > MAX_JUMP || Math.abs(dy) > MAX_JUMP) return;
    look(dx, dy, MOUSE);
  }, { signal });
  canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  canvas.addEventListener('wheel', e => {
    if (!o.playing()) return;
    e.preventDefault();
    if (Math.abs(e.deltaY) > 2 && e.timeStamp - wheelAt > 250) { s.swap = true; wheelAt = e.timeStamp; }
  }, { signal, passive: false });

  // ---- Touch ----
  const pad = document.createElement('div');
  pad.className = 'bl-touch';
  const tb = (cls: string, label: string, icon: string) => `<button type="button" class="bl-tb bl-tb-${cls}" aria-label="${label}">${icon}</button>`;
  pad.innerHTML = `<div class="bl-stick" aria-hidden="true"><div class="bl-stick-knob"></div></div>`
    + tb('fire', 'Fire', ICONS.fire) + tb('fire2', 'Fire (left hand)', ICONS.fire) + tb('ads', 'Aim down sights', ICONS.aim) + tb('crouch', 'Crouch', ICONS.crouch)
    + tb('reload', 'Reload', ICONS.reload) + tb('swap', 'Swap weapon', ICONS.swap) + tb('grenade', 'Throw grenade', ICONS.grenade) + tb('breach', 'Breach charge', ICONS.breach)
    + tb('melee', 'Melee', ICONS.melee) + tb('use', 'Use', ICONS.use) + tb('leanl', 'Lean left', ICONS.leanL) + tb('leanr', 'Lean right', ICONS.leanR) + tb('board', 'Scoreboard', ICONS.board);
  root.append(pad);
  const stick = pad.querySelector<HTMLElement>('.bl-stick')!, knob = pad.querySelector<HTMLElement>('.bl-stick-knob')!;
  let stickId = -1, stickX = 0, stickY = 0, lookId = -1, lookX = 0, lookY = 0, touchMx = 0, touchMz = 0;
  const STICK_R = 52;
  let pulses: ((v: boolean) => void)[] = [], releasing: ((v: boolean) => void)[] = [];
  function clearTouch() {
    stickId = lookId = -1; touchMx = touchMz = 0; tFire = tFire2 = tUse = tBoard = false; tLean = 0;
    stick.dataset.on = 'false'; knob.style.transform = '';
    for (const b of pad.querySelectorAll<HTMLElement>('.bl-tb')) b.dataset.down = 'false';
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !o.playing()) return;
    setTouch(true); e.preventDefault(); s.next = true;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < r.width * 0.42 && y > 70 && stickId < 0) { stickId = e.pointerId; stickX = x; stickY = y; stick.style.left = `${x}px`; stick.style.top = `${y}px`; stick.dataset.on = 'true'; }
    else if (lookId < 0) { lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY; }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
  }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      const r = canvas.getBoundingClientRect();
      let dx = e.clientX - r.left - stickX, dy = e.clientY - r.top - stickY;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`; touchMx = dx / STICK_R; touchMz = -dy / STICK_R;
    } else if (e.pointerId === lookId && o.playing()) { look(e.clientX - lookX, e.clientY - lookY, TOUCH); lookX = e.clientX; lookY = e.clientY; }
  }, { signal });
  const endPointer = (e: PointerEvent) => {
    if (e.pointerId === stickId) { stickId = -1; touchMx = touchMz = 0; stick.dataset.on = 'false'; knob.style.transform = ''; }
    if (e.pointerId === lookId) lookId = -1;
  };
  canvas.addEventListener('pointerup', endPointer, { signal }); canvas.addEventListener('pointercancel', endPointer, { signal });
  function holdButton(cls: string, set: (v: boolean) => void, drag = false) {
    const b = pad.querySelector<HTMLButtonElement>(`.bl-tb-${cls}`)!;
    let id = -1, lx = 0, ly = 0;
    b.addEventListener('pointerdown', e => { if (!o.playing()) return; e.preventDefault(); setTouch(e.pointerType !== 'mouse' || touchMode); id = e.pointerId; lx = e.clientX; ly = e.clientY; set(true); b.dataset.down = 'true'; try { b.setPointerCapture(e.pointerId); } catch { /* gone */ } }, { signal });
    b.addEventListener('pointermove', e => { if (drag && e.pointerId === id && o.playing()) { look(e.clientX - lx, e.clientY - ly, TOUCH); lx = e.clientX; ly = e.clientY; } }, { signal });
    const up = (e: PointerEvent) => { if (e.pointerId === id) { id = -1; set(false); b.dataset.down = 'false'; } };
    b.addEventListener('pointerup', up, { signal }); b.addEventListener('pointercancel', up, { signal }); b.addEventListener('lostpointercapture', up, { signal });
    b.addEventListener('click', e => { if (e.detail === 0 && o.playing()) { set(true); pulses.push(set); } }, { signal });
  }
  function tapButton(cls: string, act: () => void) {
    const b = pad.querySelector<HTMLButtonElement>(`.bl-tb-${cls}`)!;
    b.addEventListener('pointerdown', e => { if (!o.playing()) return; e.preventDefault(); act(); b.dataset.down = 'true'; }, { signal });
    b.addEventListener('pointerup', () => { b.dataset.down = 'false'; }, { signal });
    b.addEventListener('click', e => { if (e.detail === 0 && o.playing()) act(); }, { signal });
  }
  holdButton('fire', v => { tFire = v; }, true); holdButton('fire2', v => { tFire2 = v; });
  holdButton('use', v => { tUse = v; }); holdButton('board', v => { tBoard = v; });
  holdButton('leanl', v => { tLean = v ? -1 : 0; }); holdButton('leanr', v => { tLean = v ? 1 : 0; });
  tapButton('ads', () => { tAds = !tAds; pad.querySelector<HTMLElement>('.bl-tb-ads')!.dataset.on = String(tAds); });
  tapButton('crouch', () => { s.crouch = !s.crouch; });
  tapButton('reload', () => { s.reload = true; }); tapButton('swap', () => { s.swap = true; });
  tapButton('grenade', () => { s.grenade = true; }); tapButton('breach', () => { s.breach = true; }); tapButton('melee', () => { s.melee = true; });
  root.dataset.touch = String(touchMode);

  const api: Input = {
    state: s,
    get touch() { return touchMode; },
    get locked() { return locked(); },
    get lockable() { return typeof canvas.requestPointerLock === 'function' && lockFailures < 2; },
    lock() {
      if (touchMode || locked() || typeof canvas.requestPointerLock !== 'function') return;
      try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => {}); } catch { lockFailures++; }
    },
    unlock() { if (locked()) { wasLocked = false; document.exitPointerLock(); } },
    take() {
      const out = { reload: s.reload, swap: s.swap, melee: s.melee, grenade: s.grenade, breach: s.breach, digit: s.digit, next: s.next };
      s.reload = s.swap = s.melee = s.grenade = s.breach = s.next = false; s.digit = 0;
      return out;
    },
    setLook(yaw, pitch) { s.yaw = yaw; s.pitch = pitch; },
    clear() { clearAll(); s.reload = s.swap = s.melee = s.grenade = s.breach = s.next = false; s.digit = 0; s.board = false; s.crouch = false; tAds = false; pad.querySelector<HTMLElement>('.bl-tb-ads')!.dataset.on = 'false'; },
    frame(dt) {
      for (const release of releasing) release(false);
      releasing = pulses; pulses = [];
      const k = (c: string) => keys.has(c);
      s.mx = touchMode ? touchMx : (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0); s.mz = touchMode ? touchMz : (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
      const turn = (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0), tilt = (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0);
      if (turn || tilt) { const z = o.zoomScale(); s.yaw += turn * KEY_TURN * dt * z; s.pitch = Math.max(-1.45, Math.min(1.45, s.pitch + tilt * KEY_TURN * 0.6 * dt * z)); }
      s.fire = mouseFire || tFire || tFire2;
      s.ads = mouseAds || tAds || k('Space');
      s.sprint = touchMode ? Math.hypot(touchMx, touchMz) > 0.92 && touchMz > 0.6 : k('ShiftLeft') || k('ShiftRight');
      s.lean = touchMode ? tLean : (((k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0)) as -1 | 0 | 1);
      s.use = k('KeyF') || tUse;
      s.board = touchMode ? tBoard : k('Tab');
      if (root.dataset.touch !== String(touchMode)) root.dataset.touch = String(touchMode);
      pad.dataset.crouch = String(s.crouch);
    },
  };
  return api;
}
