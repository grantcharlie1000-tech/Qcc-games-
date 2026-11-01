/** CrossyRoad input: keyboard and pointer (tap/swipe) events mapped to game actions. */
import type { Dir } from './config';

export type Action = Dir | 'pause' | 'again';

/** Shortest pointer travel (CSS px) that counts as a swipe; anything shorter is a tap. */
export const SWIPE_MIN = 24;
/** A swipe's dominant axis must be at least this many times the other axis. */
export const SWIPE_DOMINANCE = 1.5;

/** Direction of a released pointer from its travel (screen coordinates: y grows downward). A tap and an
 * ambiguous diagonal both hop forward. Pure. */
export function classifySwipe(dx: number, dy: number): Dir {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_MIN) return 'up';
  if (ax >= SWIPE_DOMINANCE * ay) return dx > 0 ? 'right' : 'left';
  if (ay >= SWIPE_DOMINANCE * ax) return dy < 0 ? 'up' : 'down';
  return 'up';
}

/** The action a `KeyboardEvent.key` stands for, or null. Pure. Escape is deliberately unmapped: it belongs to the shell. */
export function keyAction(key: string): Action | null {
  switch (key) {
    case 'ArrowUp': case 'w': case 'W': return 'up';
    case 'ArrowDown': case 's': case 'S': return 'down';
    case 'ArrowLeft': case 'a': case 'A': return 'left';
    case 'ArrowRight': case 'd': case 'D': return 'right';
    case 'p': case 'P': return 'pause';
    // 'Spacebar' is what old browsers report for the space bar.
    case ' ': case 'Spacebar': case 'Enter': case 'r': case 'R': return 'again';
    default: return null;
  }
}

export interface InputOptions {
  /** The playfield element (the canvas). Pointer listeners go here. */
  target: HTMLElement;
  /** Every listener is registered with this signal; aborting removes them all. */
  signal: AbortSignal;
  /** Directional input is accepted only while this returns true. */
  enabled(): boolean;
  onDir(dir: Dir): void;
  /** Immediate take-off feedback, before a contact has a swipe direction. */
  onPress?(pressed: boolean): void;
  onPause(): void;
  /** Space/Enter/R: return true when it started a new run (game over showing) so the key is consumed. */
  onAgain(): boolean;
  /** Where `keydown` is listened for. Defaults to `window`. Injected in tests. */
  keyTarget?: EventTarget;
  /** True when a modal dialog is open or focus is in a text field. Defaults to a DOM check. Injected in tests. */
  blocked?(event: Event): boolean;
}

/** Controls that activate themselves on Space/Enter: those keys are theirs, not the game's. */
const ACTIVATABLE = 'button, a, [role=button]';
/** The keys that natively activate a focused control. R does nothing there, so it always reaches the game. */
const ACTIVATION_KEYS: ReadonlySet<string> = new Set([' ', 'Spacebar', 'Enter']);
/** Where typing belongs to the user. A range slider is not text entry, so it does not count. */
const EDITABLE = 'input:not([type=range]), textarea, select, [contenteditable=""], [contenteditable="true"]';

/** True when `target` is an element that is, or sits inside, a match for `selector`. Duck-typed on `closest`, so it needs no DOM globals. */
function within(target: EventTarget | null, selector: string): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return typeof element?.closest === 'function' && Boolean(element.closest(selector));
}

/** The default `blocked`: a modal dialog is open, or the key comes from a text field. Without a document there is nothing to block. */
function defaultBlocked(event: Event): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('dialog[open]')) || within(event.target, EDITABLE);
}

/**
 * Wires keyboard and pointer input to the game's callbacks; aborting `options.signal` removes every listener.
 *
 * Keyboard: one bubble-phase `keydown` listener. Escape is never inspected, prevented or stopped (the shell owns it
 * and opens the Study article). Key repeats, Ctrl/Alt/Meta combinations and keys meant for a dialog or text field are
 * ignored. Pointer: immediate press feedback, then one hop when a swipe is clear
 * or a tap releases. A swipe never waits for pointerup and never adds a second hop.
 */
export function attachInput(options: InputOptions): void {
  const { target, signal } = options;
  const keyTarget = options.keyTarget ?? (typeof window === 'undefined' ? undefined : window);
  const blocked = (event: Event): boolean => (options.blocked ? options.blocked(event) : defaultBlocked(event));

  keyTarget?.addEventListener('keydown', event => {
    const e = event as KeyboardEvent;
    // Escape belongs to the shell (it opens the Study article): never inspect, prevent or stop it.
    if (e.key === 'Escape') return;
    const action = keyAction(e.key);
    // A held key acts once: its auto-repeats are ignored for every action.
    if (action === null || e.repeat || e.ctrlKey || e.altKey || e.metaKey || blocked(e)) return;
    if (action === 'pause') {
      e.preventDefault();
      options.onPause();
    } else if (action === 'again') {
      // A focused button or link activates itself on Space/Enter; acting here as well would run it twice.
      // R activates nothing, so it asks for a new run wherever focus is.
      if (ACTIVATION_KEYS.has(e.key) && within(e.target, ACTIVATABLE)) return;
      if (options.onAgain()) e.preventDefault();
    } else if (options.enabled()) {
      e.preventDefault();
      options.onDir(action);
    }
  }, { signal });

  let active: { id: number; x: number; y: number; committed: boolean } | null = null;

  target.addEventListener('pointerdown', event => {
    // A mouse must use its primary button; a touch or pen contact always counts.
    const contact = event.pointerType === 'touch' || event.pointerType === 'pen';
    if (active !== null || !event.isPrimary || (!contact && event.button !== 0) || blocked(event)) return;
    active = { id: event.pointerId, x: event.clientX, y: event.clientY, committed: false };
    try { target.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    event.preventDefault();
    if(typeof document==='undefined'||document.activeElement!==target) target.focus({ preventScroll: true });
    if(options.enabled()) options.onPress?.(true);
  }, { signal });

  target.addEventListener('pointermove', event => {
    if(active===null || event.pointerId!==active.id || active.committed) return;
    const dx=event.clientX-active.x,dy=event.clientY-active.y,ax=Math.abs(dx),ay=Math.abs(dy);
    if(Math.max(ax,ay)<SWIPE_MIN || (ax<SWIPE_DOMINANCE*ay && ay<SWIPE_DOMINANCE*ax)) return;
    if(!options.enabled() || blocked(event)) return;
    active.committed=true;
    options.onPress?.(false);
    event.preventDefault();
    options.onDir(classifySwipe(dx,dy));
  }, { signal });

  target.addEventListener('pointerup', event => {
    if (active === null || event.pointerId !== active.id) return;
    const { id, x, y, committed } = active;
    active = null;
    try { target.releasePointerCapture(id); } catch { /* already released */ }
    options.onPress?.(false);
    if (!committed && options.enabled() && !blocked(event)) options.onDir(classifySwipe(event.clientX - x, event.clientY - y));
  }, { signal });

  const forget = (event: PointerEvent): void => {
    if (event.pointerId === active?.id) {active = null;options.onPress?.(false);}
  };
  target.addEventListener('pointercancel', forget, { signal });
  target.addEventListener('lostpointercapture', forget, { signal });
}
