/** Time Trial rules. Times are real elapsed wall-clock milliseconds from the start line to the final checkpoint,
 * including deaths. Any pause, hidden tab, restored save or gameplay assistance makes the attempt casual for good.
 *
 * Ranking encoding: the shared leaderboard keeps each player's MAXIMUM integer score and sorts descending, so a
 * finished eligible time is submitted as SCORE_BASE - milliseconds. Faster runs give larger scores. Only whole,
 * positive millisecond times up to MAX_RANKED_MS are encoded; nothing else is ever submitted. */

export type CasualReason = 'paused' | 'hidden' | 'restored' | 'assist';

export interface Trial {
  started: boolean;
  /** Wall-clock time of the start line (or of resuming a restored trial). */
  startAt: number;
  /** Time already elapsed before startAt (restored trials). */
  elapsedBefore: number;
  checkpoint: number;
  finishIndex: number;
  eligible: boolean;
  reason: CasualReason | null;
}

export const SCORE_BASE = 2147483647;
/** Two hours. A longer run is shown but not ranked. */
export const MAX_RANKED_MS = 2 * 60 * 60 * 1000;

export function createTrial(assist: boolean, finishIndex: number): Trial {
  return { started: false, startAt: 0, elapsedBefore: 0, checkpoint: 0, finishIndex, eligible: !assist, reason: assist ? 'assist' : null };
}

export function markCasual(t: Trial, reason: CasualReason): void {
  if (!t.eligible) return;
  t.eligible = false;
  t.reason = reason;
}

export function startTrial(t: Trial, now: number): void {
  if (t.started) return;
  t.started = true;
  t.startAt = now;
}

/** Checkpoints count only in course order. */
export function trialCheckpoint(t: Trial, index: number): void {
  if (index === t.checkpoint + 1) t.checkpoint = index;
}

export function trialElapsed(t: Trial, now: number): number {
  return t.started ? Math.max(0, t.elapsedBefore + now - t.startAt) : 0;
}

export function finishTrial(t: Trial, now: number): { ms: number; eligible: boolean } | null {
  if (!t.started || t.checkpoint !== t.finishIndex) return null;
  const ms = Math.round(trialElapsed(t, now));
  return { ms, eligible: t.eligible && ms > 0 && ms <= MAX_RANKED_MS };
}

export function encodeTime(ms: number): number {
  if (!Number.isInteger(ms) || ms <= 0 || ms > MAX_RANKED_MS) throw new RangeError('Only whole positive times up to two hours are ranked');
  return SCORE_BASE - ms;
}
export function decodeScore(score: number): number { return SCORE_BASE - score; }

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100, s = Math.floor(total / 100) % 60, m = Math.floor(total / 6000);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** The shared leaderboard's display for this game's encoded scores. */
export function formatTrialScore(score: number): string {
  const ms = decodeScore(score);
  return score > 0 && ms > 0 && ms <= MAX_RANKED_MS ? formatTime(ms) : '—';
}
