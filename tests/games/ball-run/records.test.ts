import { afterEach, describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../../src/games/ball-run/config';
import { commitScore, dayKey, emptyRecords, nextTarget, restoreRecords, viewRecords, weekKey, type Records } from '../../../src/games/ball-run/records';

const DAY = 86400000;
const initialTz = process.env.TZ;
afterEach(() => { if (initialTz === undefined) delete process.env.TZ; else process.env.TZ = initialTz; });

/** Calendar parts of a 'YYYY-MM-DD' key, as UTC midnight (UTC has no DST, so day arithmetic on it is exact). */
const utcOf = (key: string) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };

describe('Ball Run record keys', () => {
  it('keys days by local calendar date and weeks by their Monday', () => {
    expect(weekKey(new Date(2026, 9, 25))).toBe('2026-10-19');
    expect(weekKey(new Date(2026, 9, 25, 23, 59, 59))).toBe('2026-10-19');
    expect(weekKey(new Date(2026, 9, 26))).toBe('2026-10-26');
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-12-28');
    expect(dayKey(new Date(2026, 9, 23, 23, 59))).toBe('2026-10-23');
    expect(dayKey(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
    expect(dayKey(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  // Zones with 2026 DST changes at 01:00/02:00, at local midnight (Santiago, Beirut) and by 30 minutes (Lord Howe).
  it.each(['Europe/London', 'America/New_York', 'America/Santiago', 'Asia/Beirut', 'Australia/Lord_Howe'])('stays on the local calendar through every 2026 DST change in %s', zone => {
    process.env.TZ = zone;
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(new Date(2026, 6, 1).getTimezoneOffset());
    for (let i = 0; i < 365; i++) {
      const expected = new Date(Date.UTC(2026, 0, 1 + i));
      for (const [h, m] of [[0, 0], [0, 30], [1, 30], [2, 30], [12, 0], [23, 30], [23, 59]]) {
        const date = new Date(2026, 0, 1 + i, h, m);
        const day = dayKey(date), [y, mo, d] = day.split('-').map(Number), back = new Date(y, mo - 1, d);
        expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([date.getFullYear(), date.getMonth(), date.getDate()]);
        expect(utcOf(day)).toBe(expected.getTime());
        const week = weekKey(date);
        expect(new Date(week + 'T12:00').getDay()).toBe(1);
        expect(utcOf(week) + (expected.getUTCDay() + 6) % 7 * DAY).toBe(expected.getTime());
      }
    }
  });
});

describe('Ball Run records', () => {
  const stored = (): Records => ({ ...emptyRecords(), medium: { allTime: 300, day: '2026-10-22', dayBest: 120, week: '2026-10-19', weekBest: 200 } });

  it('starts fresh profiles at zero, without the recording\'s 79 or 143', () => {
    const records = emptyRecords();
    for (const difficulty of DIFFICULTIES) expect(records[difficulty]).toEqual({ allTime: 0, day: '', dayBest: 0, week: '', weekBest: 0 });
    expect(JSON.stringify(records)).not.toMatch(/79|143/);
    expect(emptyRecords()).not.toBe(records);
    expect(emptyRecords().easy).not.toBe(records.easy);
  });

  it('reads stale or future day and week bests as zero', () => {
    const records = stored();
    expect(viewRecords(records, 'medium', new Date(2026, 9, 22, 9))).toEqual({ today: 120, week: 200, allTime: 300 });
    expect(viewRecords(records, 'medium', new Date(2026, 9, 23, 0, 0))).toEqual({ today: 0, week: 200, allTime: 300 });
    expect(viewRecords(records, 'medium', new Date(2026, 9, 26, 0, 0))).toEqual({ today: 0, week: 0, allTime: 300 });
    expect(viewRecords(records, 'medium', new Date(2026, 9, 21, 9))).toEqual({ today: 0, week: 200, allTime: 300 });
    expect(viewRecords(records, 'medium', new Date(2026, 9, 18, 9))).toEqual({ today: 0, week: 0, allTime: 300 });
    expect(viewRecords(records, 'hard', new Date(2026, 9, 22, 9))).toEqual({ today: 0, week: 0, allTime: 0 });
  });

  it('keeps the week and all-time bests and resets today on a later day', () => {
    let records = commitScore(emptyRecords(), 'hard', 100, new Date(2026, 9, 20, 18));
    records = commitScore(records, 'hard', 30, new Date(2026, 9, 21, 8));
    expect(records.hard).toEqual({ allTime: 100, day: '2026-10-21', dayBest: 30, week: '2026-10-19', weekBest: 100 });
    expect(viewRecords(records, 'hard', new Date(2026, 9, 21, 9))).toEqual({ today: 30, week: 100, allTime: 100 });
    expect(records.easy).toEqual(emptyRecords().easy);
  });

  it('resets today and the week from Sunday night to Monday morning, but not across New Year mid-week', () => {
    let records = commitScore(emptyRecords(), 'easy', 100, new Date(2026, 9, 25, 23, 59));
    records = commitScore(records, 'easy', 30, new Date(2026, 9, 26, 0, 1));
    expect(records.easy).toEqual({ allTime: 100, day: '2026-10-26', dayBest: 30, week: '2026-10-26', weekBest: 30 });
    records = commitScore(emptyRecords(), 'easy', 100, new Date(2026, 11, 31, 22));
    records = commitScore(records, 'easy', 30, new Date(2027, 0, 1, 9));
    expect(viewRecords(records, 'easy', new Date(2027, 0, 1, 10))).toEqual({ today: 30, week: 100, allTime: 100 });
  });

  it('replaces a stored future day or week instead of comparing against it', () => {
    const records: Records = { ...emptyRecords(), hard: { allTime: 500, day: '2027-03-01', dayBest: 500, week: '2027-03-01', weekBest: 500 } };
    expect(commitScore(records, 'hard', 20, new Date(2026, 9, 23, 12)).hard).toEqual({ allTime: 500, day: '2026-10-23', dayBest: 20, week: '2026-10-19', weekBest: 20 });
  });

  it('never lowers a value with a lower score and raises all three with a higher one', () => {
    const now = new Date(2026, 9, 23, 12);
    const high = commitScore(emptyRecords(), 'medium', 100, now);
    expect(commitScore(high, 'medium', 40, now).medium).toEqual(high.medium);
    expect(viewRecords(commitScore(high, 'medium', 40, now), 'medium', now)).toEqual({ today: 100, week: 100, allTime: 100 });
    expect(viewRecords(commitScore(high, 'medium', 101, now), 'medium', now)).toEqual({ today: 101, week: 101, allTime: 101 });
    expect(commitScore(emptyRecords(), 'medium', 12.9, now).medium.allTime).toBe(12);
  });

  it('returns a new object and leaves its input unchanged', () => {
    const now = new Date(2026, 9, 23, 12), input = commitScore(stored(), 'easy', 50, now), before = structuredClone(input);
    const result = commitScore(input, 'medium', 400, now);
    expect(input).toEqual(before);
    expect(result).not.toBe(input);
    for (const difficulty of DIFFICULTIES) expect(result[difficulty]).not.toBe(input[difficulty]);
    expect(result.medium).toEqual({ allTime: 400, day: '2026-10-23', dayBest: 400, week: '2026-10-19', weekBest: 400 });
    expect(result.easy).toEqual(input.easy);
  });

  it('ignores non-finite and negative scores', () => {
    const now = new Date(2026, 9, 23, 12), input = stored();
    for (const score of [NaN, Infinity, -Infinity, -1]) {
      const result = commitScore(input, 'medium', score, now);
      expect(result).toEqual(stored());
      expect(result).not.toBe(input);
    }
  });
});

describe('Ball Run next target', () => {
  it('shows the smallest record above the score, the broader scope on ties, then the new best', () => {
    const view = { today: 51, week: 51, allTime: 143 };
    expect(nextTarget(view, 0)).toEqual({ scope: 'week', label: 'THIS WEEK', value: 51 });
    expect(nextTarget(view, 52)).toEqual({ scope: 'allTime', label: 'ALL TIME', value: 143 });
    expect(nextTarget(view, 144)).toEqual({ scope: 'new', label: 'NEW BEST', value: 144 });
    expect(nextTarget({ today: 20, week: 51, allTime: 143 }, 5)).toEqual({ scope: 'today', label: 'TODAY', value: 20 });
    expect(nextTarget({ today: 20, week: 51, allTime: 143 }, 20)).toEqual({ scope: 'week', label: 'THIS WEEK', value: 51 });
    expect(nextTarget({ today: 51, week: 51, allTime: 51 }, 0)).toEqual({ scope: 'allTime', label: 'ALL TIME', value: 51 });
    expect(nextTarget({ today: 0, week: 0, allTime: 0 }, 0)).toEqual({ scope: 'new', label: 'NEW BEST', value: 0 });
  });
});

describe('Ball Run record restore', () => {
  it('turns missing or invalid data into empty records without throwing', () => {
    for (const value of [null, undefined, {}, [], 'records', 42, { easy: { allTime: NaN } }, { hard: { allTime: -4, day: 'nope' } }, { medium: null }, { easy: { allTime: '12', day: 20261023 } }])
      expect(restoreRecords(value)).toEqual(emptyRecords());
  });

  it('validates each field: real calendar keys, Monday week keys, integers clamped to 0..2147483647', () => {
    const records = restoreRecords({
      easy: { allTime: 12.7, day: '2026-02-30', dayBest: 9, week: '2026-10-20', weekBest: 9 },
      medium: { allTime: 1e12, day: '2026-10-23', dayBest: 3.5e9, week: '2026-10-19', weekBest: 77 },
      hard: { allTime: -4, day: '2026-10-23', dayBest: -1, week: '26-10-19', weekBest: 5 },
    });
    expect(records.easy).toEqual({ allTime: 12, day: '', dayBest: 0, week: '', weekBest: 0 });
    expect(records.medium).toEqual({ allTime: 2147483647, day: '2026-10-23', dayBest: 2147483647, week: '2026-10-19', weekBest: 2147483647 });
    expect(records.hard).toEqual({ allTime: 0, day: '2026-10-23', dayBest: 0, week: '', weekBest: 0 });
  });

  it('restores consistent bests: a day best lifts its own week and every best lifts all time', () => {
    const records = restoreRecords({
      easy: { allTime: 10, day: '2026-10-23', dayBest: 90, week: '2026-10-19', weekBest: 40 },
      medium: { allTime: 5, day: '2026-10-23', dayBest: 60, week: '2026-10-12', weekBest: 30 },
    });
    expect(records.easy).toEqual({ allTime: 90, day: '2026-10-23', dayBest: 90, week: '2026-10-19', weekBest: 90 });
    // A day outside the stored week leaves that week's best alone.
    expect(records.medium).toEqual({ allTime: 60, day: '2026-10-23', dayBest: 60, week: '2026-10-12', weekBest: 30 });
  });

  it('round-trips valid records through JSON', () => {
    let records = commitScore(emptyRecords(), 'easy', 640, new Date(2026, 9, 18, 20));
    records = commitScore(records, 'medium', 1234, new Date(2026, 9, 23, 12));
    records = commitScore(records, 'hard', 87, new Date(2027, 0, 1, 0, 5));
    const restored = restoreRecords(JSON.parse(JSON.stringify(records)));
    expect(restored).toEqual(records);
    expect(restored).not.toBe(records);
  });
});
