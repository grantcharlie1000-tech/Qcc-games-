/** Per-difficulty bests: today (local calendar day), this week (Monday-start local
 * week) and all time. Pure: the caller passes the date. Keys come from local
 * calendar fields, never millisecond arithmetic, so DST days cannot shift them. */
import { DIFFICULTIES, type Difficulty } from './config';

export interface DifficultyRecords { allTime: number; day: string; dayBest: number; week: string; weekBest: number }
export type Records = Record<Difficulty, DifficultyRecords>;
export interface RecordView { today: number; week: number; allTime: number }
export type TargetScope = 'today' | 'week' | 'allTime' | 'new';

const MAX = 2147483647;
const LABELS: Record<TargetScope, string> = { today: 'TODAY', week: 'THIS WEEK', allTime: 'ALL TIME', new: 'NEW BEST' };
const empty = (): DifficultyRecords => ({ allTime: 0, day: '', dayBest: 0, week: '', weekBest: 0 });
const build = (entry: (difficulty: Difficulty) => DifficultyRecords) => Object.fromEntries(DIFFICULTIES.map(d => [d, entry(d)])) as Records;
const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const int = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX, Math.max(0, Math.floor(v))) : 0;

export function emptyRecords(): Records { return build(empty); }

export function dayKey(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local date of the week's Monday. Noon keeps the constructed date clear of midnight DST gaps. */
export function weekKey(date: Date): string {
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7, 12));
}

/** A day or week from an earlier (or later) period than `now` reads as 0. */
export function viewRecords(records: Records, difficulty: Difficulty, now: Date): RecordView {
  const r = records[difficulty];
  return { today: r.day === dayKey(now) ? r.dayBest : 0, week: r.week === weekKey(now) ? r.weekBest : 0, allTime: r.allTime };
}

export function commitScore(records: Records, difficulty: Difficulty, score: number, now: Date): Records {
  const next = build(d => ({ ...records[d] }));
  if (!(Number.isFinite(score) && score >= 0)) return next;
  const s = Math.min(MAX, Math.floor(score)), view = viewRecords(records, difficulty, now);
  next[difficulty] = { allTime: Math.max(view.allTime, s), day: dayKey(now), dayBest: Math.max(view.today, s), week: weekKey(now), weekBest: Math.max(view.week, s) };
  return next;
}

/** Smallest record still above the score; ties show the broader scope. Beyond all of them, the score itself. */
export function nextTarget(view: RecordView, score: number): { scope: TargetScope; label: string; value: number } {
  let scope: TargetScope = 'new', value = score;
  for (const s of ['allTime', 'week', 'today'] as const) if (view[s] > score && (scope === 'new' || view[s] < value)) { scope = s; value = view[s]; }
  return { scope, label: LABELS[scope], value };
}

/** A key survives only if it names a real local date (and, for weeks, a Monday). */
function validKey(value: unknown, key: (date: Date) => string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return '';
  const [y, m, d] = value.split('-').map(Number);
  return key(new Date(y, m - 1, d, 12)) === value ? value : '';
}

export function restoreRecords(value: unknown): Records {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<Difficulty, unknown>>;
  return build(difficulty => {
    const entry = source[difficulty];
    if (typeof entry !== 'object' || entry === null) return empty();
    const r = entry as Record<string, unknown>, day = validKey(r.day, dayKey), week = validKey(r.week, weekKey);
    return { allTime: int(r.allTime), day, dayBest: day ? int(r.dayBest) : 0, week, weekBest: week ? int(r.weekBest) : 0 };
  });
}
