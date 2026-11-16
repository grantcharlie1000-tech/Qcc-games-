import { describe, expect, it } from 'vitest';
import { categoryOf, flagged, formatClock, newClock, parseTimeControl, pressClock, remaining, startClock, stopClock, PRESETS } from '../../../src/games/chess/time-control';
import { decay, INITIAL_RATING, rate, ratePeriod } from '../../../src/games/chess/online/glicko';

describe('time controls and clock', () => {
  it('classifies presets into rating categories', () => {
    expect(PRESETS.map((p) => `${p.id}:${categoryOf(p)}`)).toEqual([
      '1+0:bullet', '2+1:bullet', '3+0:blitz', '3+2:blitz', '5+0:blitz', '5+3:blitz', '10+0:rapid', '15+10:rapid', '30+0:classical',
    ]);
    expect(parseTimeControl('7+5')).toEqual({ id: '7+5', baseMs: 420000, incrementMs: 5000 });
    expect(parseTimeControl('0+0')).toBeNull();
    expect(parseTimeControl('x')).toBeNull();
  });

  it('charges the mover, adds the increment and flags at zero', () => {
    let c = startClock(newClock({ id: '3+2', baseMs: 180000, incrementMs: 2000 }), 'w', 1000);
    expect(remaining(c, 'w', 6000)).toBe(175000);
    c = pressClock(c, 'w', 6000);
    expect(c.w).toBe(177000);
    expect(c.running).toBe('b');
    expect(remaining(c, 'w', 99999)).toBe(177000);
    c = stopClock(c, 16000);
    expect(c.b).toBe(170000);
    expect(remaining(c, 'b', 999999)).toBe(170000);
    c = startClock(c, 'b', 0);
    expect(flagged(c, 169999)).toBeNull();
    expect(flagged(c, 170000)).toBe('b');
    expect(formatClock(170000)).toBe('2:50');
    expect(formatClock(9450)).toBe('9.4');
  });
});

describe('Glicko-2', () => {
  it('matches Glickman\'s worked example', () => {
    const r = ratePeriod({ rating: 1500, deviation: 200, volatility: 0.06 }, [
      { opponent: { rating: 1400, deviation: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, deviation: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, deviation: 300, volatility: 0.06 }, score: 0 },
    ]);
    expect(r.rating).toBeCloseTo(1464.06, 1);
    expect(r.deviation).toBeCloseTo(151.52, 1);
    expect(r.volatility).toBeCloseTo(0.05999, 4);
  });

  it('moves ratings up and down symmetrically for new players', () => {
    const win = rate(INITIAL_RATING, INITIAL_RATING, 1);
    const loss = rate(INITIAL_RATING, INITIAL_RATING, 0);
    expect(win.rating).toBeGreaterThan(1500);
    expect(loss.rating).toBeLessThan(1500);
    expect(win.rating - 1500).toBeCloseTo(1500 - loss.rating, 5);
    expect(rate(INITIAL_RATING, INITIAL_RATING, 0.5).rating).toBeCloseTo(1500, 5);
    expect(win.deviation).toBeLessThan(350);
  });

  it('grows uncertainty after inactivity', () => {
    const r = { rating: 1600, deviation: 60, volatility: 0.06 };
    expect(decay(r, 10)).toEqual(r);
    expect(decay(r, 365).deviation).toBeGreaterThan(60);
  });
});
