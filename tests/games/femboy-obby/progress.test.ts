import { describe, expect, test } from 'vitest';
import { buildCourse } from '../../../src/games/femboy-obby/stages';
import { OUTFITS, defaultProgress, earnedUnlocks, readProgress, readSnapshot, SNAPSHOT_VERSION } from '../../../src/games/femboy-obby/progress';
import { createTrial, decodeScore, encodeTime, finishTrial, formatTime, markCasual, startTrial, trialCheckpoint, MAX_RANKED_MS } from '../../../src/games/femboy-obby/trial';
import { formatScore } from '../../../src/leaderboard/format';

const course = buildCourse();

describe('unlocks', () => {
  test('the first checkpoint grants the bow and each chapter clear grants an outfit', () => {
    const p = defaultProgress();
    expect(earnedUnlocks({ ...p, checkpoint: 0 })).toEqual(['snowdrop']);
    expect(earnedUnlocks({ ...p, checkpoint: 1 })).toContain('bow');
    const at = (cp: number) => earnedUnlocks({ ...p, checkpoint: cp }).filter(id => OUTFITS.some(o => o.id === id)).length;
    expect([0, 4, 5, 10, 15, 20, 25, 30].map(at)).toEqual([1, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('collecting all thirty stars unlocks a bonus outfit; stars never gate finishing', () => {
    const p = { ...defaultProgress(), stars: course.stars.map(s => s.id) };
    expect(earnedUnlocks(p)).toContain('starlight');
    expect(earnedUnlocks({ ...defaultProgress(), checkpoint: 30 })).toContain('cocoa');
  });
});

describe('saved progress', () => {
  test('unknown, malformed and hostile values fall back safely', () => {
    for (const bad of [null, 3, 'x', [], { v: 99 }, { checkpoint: 'a', stars: 'b' }, { checkpoint: 1e9, stars: [1, 2, 'frosthop-v1:stage-99:star', 'frosthop-v1:stage-03:star'], outfit: 'nope', help: 'yes' }]) {
      const p = readProgress(bad, course);
      expect(p.checkpoint).toBeGreaterThanOrEqual(0);
      expect(p.checkpoint).toBeLessThanOrEqual(30);
      expect(p.stars.every(id => course.stars.some(s => s.id === id))).toBe(true);
      expect(OUTFITS.some(o => o.id === p.outfit)).toBe(true);
      expect(typeof p.help).toBe('boolean');
    }
    expect(readProgress({ checkpoint: 1e9, stars: ['frosthop-v1:stage-03:star', 'frosthop-v1:stage-03:star'] }, course)).toMatchObject({ checkpoint: 30, stars: ['frosthop-v1:stage-03:star'] });
  });

  test('a locked outfit cannot be equipped from a save', () => {
    expect(readProgress({ checkpoint: 2, outfit: 'cocoa' }, course).outfit).toBe('snowdrop');
    expect(readProgress({ checkpoint: 30, outfit: 'cocoa' }, course).outfit).toBe('cocoa');
  });

  test('a snapshot restores campaign position by checkpoint only, never coordinates', () => {
    const snap = readSnapshot({ v: SNAPSHOT_VERSION, progress: { checkpoint: 12 }, mode: 'campaign', at: 9, x: 999, y: -999 }, course);
    expect(snap).toMatchObject({ mode: 'campaign', at: 9 });
    expect(snap).not.toHaveProperty('x');
    expect(readSnapshot({ v: SNAPSHOT_VERSION, progress: { checkpoint: 3 }, mode: 'campaign', at: 20 }, course)?.at).toBe(3);
    expect(readSnapshot({ v: 0 }, course)).toBeNull();
  });

  test('a restored time trial is always casual, keeps its elapsed time and its own checkpoint', () => {
    const snap = readSnapshot({ v: SNAPSHOT_VERSION, progress: { checkpoint: 30, complete: true }, mode: 'trial', at: 4, trial: { started: true, elapsed: 61000, eligible: true, checkpoint: 4 } }, course)!;
    expect(snap.mode).toBe('trial');
    expect(snap.trial).toMatchObject({ eligible: false, reason: 'restored', checkpoint: 4, started: true });
    expect(snap.trial!.elapsedBefore).toBe(61000);
    // A trial save without a completed campaign is not a Time Trial; it resumes as a campaign run.
    expect(readSnapshot({ v: SNAPSHOT_VERSION, progress: { checkpoint: 3 }, mode: 'trial', at: 2, trial: { started: true, elapsed: 1 } }, course)!.mode).toBe('campaign');
  });

  test('a timed campaign run from stage 1 is saved and restores as a casual timed run at the same checkpoint', () => {
    const snap = readSnapshot({ v: SNAPSHOT_VERSION, progress: { checkpoint: 6 }, mode: 'campaign', at: 6, trial: { started: true, elapsed: 42000, checkpoint: 6 } }, course)!;
    expect(snap).toMatchObject({ mode: 'campaign', at: 6 });
    expect(snap.trial).toMatchObject({ started: true, eligible: false, reason: 'restored', checkpoint: 6, elapsedBefore: 42000 });
    // The timer can never be ahead of the run's own position.
    expect(readSnapshot({ v: SNAPSHOT_VERSION, progress: { checkpoint: 6 }, mode: 'campaign', at: 2, trial: { started: true, elapsed: 5, checkpoint: 9 } }, course)!.trial!.checkpoint).toBe(2);
    // An untimed campaign save stays untimed.
    expect(readSnapshot({ v: SNAPSHOT_VERSION, progress: { checkpoint: 6 }, mode: 'campaign', at: 6 }, course)!.trial).toBeUndefined();
  });
});

describe('time trial', () => {
  test('time starts at the start line, keeps running through deaths and ends at the final checkpoint in order', () => {
    const t = createTrial(false, 30);
    expect(finishTrial(t, 5000)).toBeNull();
    startTrial(t, 1000);
    for (let i = 1; i <= 29; i++) trialCheckpoint(t, i);
    trialCheckpoint(t, 30);
    const r = finishTrial(t, 1000 + 125432)!;
    expect(r).toMatchObject({ ms: 125432, eligible: true });
  });

  test('skipping a checkpoint or finishing without starting cannot produce a ranked time', () => {
    const t = createTrial(false, 30);
    startTrial(t, 0);
    trialCheckpoint(t, 1); trialCheckpoint(t, 3);
    expect(t.checkpoint).toBe(1);
    expect(finishTrial(t, 100)).toBeNull();
  });

  test('pause, hiding, restoring and assistance latch casual; cosmetics do not', () => {
    for (const reason of ['paused', 'hidden', 'restored', 'assist'] as const) {
      const t = createTrial(false, 30);
      markCasual(t, reason);
      expect(t.eligible).toBe(false);
      expect(t.reason).toBe(reason);
      markCasual(t, 'paused');
      expect(t.reason).toBe(reason); // first reason is kept
    }
    const assisted = createTrial(true, 30);
    expect(assisted).toMatchObject({ eligible: false, reason: 'assist' });
    // Pausing before the start line still counts for this attempt.
    const early = createTrial(false, 30);
    markCasual(early, 'paused');
    startTrial(early, 0);
    expect(early.eligible).toBe(false);
  });

  test('a slower eligible time encodes to a lower score, within the leaderboard bound', () => {
    expect(encodeTime(90_000)).toBeGreaterThan(encodeTime(90_001));
    expect(decodeScore(encodeTime(123_456))).toBe(123_456);
    expect(Number.isInteger(encodeTime(1))).toBe(true);
    expect(encodeTime(MAX_RANKED_MS)).toBeGreaterThan(0);
    expect(() => encodeTime(0)).toThrow();
    expect(() => encodeTime(MAX_RANKED_MS + 1)).toThrow();
    expect(() => encodeTime(1.5)).toThrow();
  });

  test('times are shown as minutes, seconds and hundredths, on the shared leaderboard too', () => {
    expect(formatTime(125_432)).toBe('2:05.43');
    expect(formatTime(5_009)).toBe('0:05.00');
    expect(formatTime(3_600_000 + 61_000)).toBe('61:01.00');
    expect(formatScore('femboy-obby', encodeTime(125_432))).toBe('2:05.43');
    expect(formatScore('femboy-obby', 0)).toBe('—');
  });
});
