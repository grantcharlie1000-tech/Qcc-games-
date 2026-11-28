import type { Color } from './rules';

export type Category = 'bullet' | 'blitz' | 'rapid' | 'classical';
export interface TimeControl { readonly id: string; readonly baseMs: number; readonly incrementMs: number }

const preset = (min: number, inc: number): TimeControl => ({ id: `${min}+${inc}`, baseMs: min * 60_000, incrementMs: inc * 1000 });
/** Presets offered everywhere. All of them are rated in ranked play. */
export const PRESETS: readonly TimeControl[] = [
  preset(1, 0), preset(2, 1), preset(3, 0), preset(3, 2), preset(5, 0), preset(5, 3), preset(10, 0), preset(15, 10), preset(30, 0),
];
export const RANKED_CONTROLS = PRESETS;

/** Parses "M+S" (minutes may be fractional, like 0.5+0). */
export function parseTimeControl(id: string): TimeControl | null {
  const m = /^(\d{1,3}(?:\.5)?)\+(\d{1,3})$/.exec(id);
  if (!m) return null;
  const baseMs = Number(m[1]) * 60_000, incrementMs = Number(m[2]) * 1000;
  if (baseMs < 30_000 || baseMs > 180 * 60_000 || incrementMs > 180_000) return null;
  return { id: `${Number(m[1])}+${Number(m[2])}`, baseMs, incrementMs };
}

/** Category by estimated game length: base + 40 × increment. */
export function categoryOf(tc: TimeControl): Category {
  const s = (tc.baseMs + 40 * tc.incrementMs) / 1000;
  return s < 180 ? 'bullet' : s < 480 ? 'blitz' : s < 1500 ? 'rapid' : 'classical';
}

export const CATEGORY_LABEL: Record<Category, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical' };

/** A local chess clock. Times are in ms; `now` comes from a monotonic source. */
export interface ClockState {
  readonly w: number;
  readonly b: number;
  readonly incrementMs: number;
  /** Side whose time is running, or null when stopped. */
  readonly running: Color | null;
  readonly since: number;
}

export const newClock = (tc: TimeControl): ClockState => ({ w: tc.baseMs, b: tc.baseMs, incrementMs: tc.incrementMs, running: null, since: 0 });

export function remaining(clock: ClockState, side: Color, now: number): number {
  const base = clock[side];
  return clock.running === side ? Math.max(0, base - (now - clock.since)) : Math.max(0, base);
}

/** Stops the clock, charging the running side. */
export function stopClock(clock: ClockState, now: number): ClockState {
  if (!clock.running) return clock;
  return { ...clock, [clock.running]: remaining(clock, clock.running, now), running: null, since: now };
}

export function startClock(clock: ClockState, side: Color, now: number): ClockState {
  return { ...stopClock(clock, now), running: side, since: now };
}

/** `mover` finished a move: charge them, add the increment, start the other side. */
export function pressClock(clock: ClockState, mover: Color, now: number, addIncrement = true): ClockState {
  const stopped = stopClock(clock, now);
  const next = mover === 'w' ? 'b' : 'w';
  return { ...stopped, [mover]: stopped[mover] + (addIncrement ? clock.incrementMs : 0), running: next, since: now };
}

export function flagged(clock: ClockState, now: number): Color | null {
  return clock.running && remaining(clock, clock.running, now) <= 0 ? clock.running : null;
}

export function formatClock(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10_000) return `${Math.floor(t / 1000)}.${Math.floor((t % 1000) / 100)}`;
  const s = Math.ceil(t / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
