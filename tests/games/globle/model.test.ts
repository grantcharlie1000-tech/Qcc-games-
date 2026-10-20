import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {COUNTRIES} from '../../../src/games/globle/countries';
import {
  IDS, applyGuess, aucklandDate, band, createState, dailyAnswer, distanceKm, evaluate, guessColour, liveStreak, mulberry32,
  mergeState, newPractice, normalize, previousDate, proximity, refreshDaily, resolveName, restoreState, serializeState, type GameState
} from '../../../src/games/globle/model';

const world = JSON.parse(readFileSync('src/games/globle/data/world.json', 'utf8')) as {countries: {id: string; area: number}[]; features: {id: string | null}[]};
const today = '2026-10-21';
const fresh = (): GameState => createState(today, mulberry32(5));
const practiceFor = (answer: string): GameState => {const s = fresh(); s.mode = 'practice'; s.practice = {mode: 'practice', answer, guesses: [], won: false}; return s;};

describe('playable list and bundled geography', () => {
  it('covers exactly the 197 playable countries in distance and display data', () => {
    expect(COUNTRIES).toHaveLength(197);
    expect([...IDS].sort()).toEqual(COUNTRIES.map(c => c.id).sort());
    expect(world.countries.map(c => c.id).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(world.features.some(f => f.id === id), id).toBe(true);
  });
  it('is symmetric, non-negative and zero only on the diagonal or a shared border', () => {
    for (const a of IDS) for (const b of IDS) {
      expect(distanceKm(a, b)).toBe(distanceKm(b, a));
      expect(distanceKm(a, b)).toBeGreaterThanOrEqual(0);
    }
    expect(distanceKm('FRA', 'FRA')).toBe(0);
  });
  it('measures real land-boundary gaps, not capitals or centres', () => {
    expect(distanceKm('FRA', 'ESP')).toBe(0);
    expect(distanceKm('ITA', 'VAT')).toBe(0); // enclave
    expect(distanceKm('ZAF', 'LSO')).toBe(0);
    expect(distanceKm('GBR', 'FRA')).toBeGreaterThan(25); // Dover Strait ≈ 33 km
    expect(distanceKm('GBR', 'FRA')).toBeLessThan(40);
    expect(distanceKm('MLT', 'ITA')).toBeGreaterThan(70); // Malta–Sicily ≈ 80 km
    expect(distanceKm('MLT', 'ITA')).toBeLessThan(95);
    expect(distanceKm('USA', 'RUS')).toBeLessThan(10); // Diomede Islands
    expect(distanceKm('USA', 'CAN')).toBe(0);
    // Centre-to-centre would be ~8,000 km; Alaska makes the boundaries close.
    expect(distanceKm('USA', 'JPN')).toBeLessThan(3000);
  });
  it('keeps dependent and overseas territories out of the parent distance', () => {
    expect(distanceKm('FRA', 'BRA')).toBeGreaterThan(5000); // French Guiana excluded
    expect(distanceKm('NLD', 'VEN')).toBeGreaterThan(5000); // Caribbean Netherlands excluded
    expect(distanceKm('DNK', 'CAN')).toBeGreaterThan(2000); // Greenland is not Denmark
    expect(distanceKm('SOM', 'DJI')).toBe(0); // Somaliland merged into Somalia
    for (const id of ['FIN', 'CHN']) expect(world.features.filter(f => f.id === id).length).toBeGreaterThan(1); // Åland; Hong Kong and Macao
  });
});

describe('name matching', () => {
  it('ignores case, accents and punctuation and accepts aliases', () => {
    expect(normalize('  CÔTE   d’Ivoire ')).toBe('cote divoire');
    for (const [typed, id] of [['uk', 'GBR'], ['U.K.', 'GBR'], ['Great Britain', 'GBR'], ['USA', 'USA'], ['u.s.a.', 'USA'], ['United States of America', 'USA'],
      ['ivory coast', 'CIV'], ["cote d'ivoire", 'CIV'], ['Côte d’Ivoire', 'CIV'], ['TURKEY', 'TUR'], ['türkiye', 'TUR'], ['Czech Republic', 'CZE'], ['St Lucia', 'LCA'],
      ['St. Kitts and Nevis', 'KNA'], ['Saint Vincent & the Grenadines', 'VCT'], ['DRC', 'COD'], ['burma', 'MMR'], ['The Netherlands', 'NLD'], ['holland', 'NLD'],
      ['sao tome and principe', 'STP'], ['Vatican', 'VAT'], ['holy see', 'VAT'], ['East Timor', 'TLS'], ['swaziland', 'SWZ'], ['Macedonia', 'MKD'], ['Gambia', 'GMB']] as const) {
      expect(resolveName(typed), typed).toBe(id);
    }
  });
  it('explains empty, unknown, ambiguous and non-playable entries without counting them', () => {
    const s = practiceFor('FRA');
    expect(evaluate(s.practice, '   ')).toMatchObject({kind: 'empty'});
    expect(evaluate(s.practice, 'Atlantis')).toMatchObject({kind: 'unknown'});
    expect(evaluate(s.practice, 'Germny')).toMatchObject({kind: 'unknown', message: expect.stringContaining('Did you mean Germany?')});
    expect(evaluate(s.practice, 'Frnace')).toMatchObject({kind: 'unknown', message: expect.stringContaining('Did you mean France?')});
    expect(evaluate(s.practice, 'Réunion')).toMatchObject({kind: 'not-playable', message: expect.stringContaining('France')});
    expect(evaluate(s.practice, 'Isle of Man')).toMatchObject({kind: 'not-playable'});
    expect(evaluate(s.practice, 'Congo')).toMatchObject({kind: 'ambiguous'});
    expect(evaluate(s.practice, 'England')).toMatchObject({kind: 'not-playable', message: expect.stringContaining('United Kingdom')});
    expect(evaluate(s.practice, 'Greenland')).toMatchObject({kind: 'not-playable'});
    expect(s.practice.guesses).toHaveLength(0);
  });
  it('rejects duplicates by canonical id, including through an alias', () => {
    const s = practiceFor('FRA');
    const first = evaluate(s.practice, 'United Kingdom');
    expect(first).toMatchObject({kind: 'guess', id: 'GBR', correct: false});
    applyGuess(s, 'GBR');
    expect(evaluate(s.practice, 'uk')).toMatchObject({kind: 'duplicate', message: expect.stringContaining('guess 1')});
    expect(s.practice.guesses).toEqual(['GBR']);
  });
});

describe('rounds and victory', () => {
  it('a 0 km neighbour stays wrong; only the canonical id wins', () => {
    const s = practiceFor('FRA');
    for (const name of ['Spain', 'Belgium', 'Germany']) {
      const outcome = evaluate(s.practice, name);
      expect(outcome).toMatchObject({kind: 'guess', km: 0, correct: false});
      if (outcome.kind === 'guess') {applyGuess(s, outcome.id); expect(band(outcome.id, 'FRA')).toBe('neighbour');}
    }
    expect(s.practice.won).toBe(false);
    const win = evaluate(s.practice, 'france');
    expect(win).toMatchObject({kind: 'guess', id: 'FRA', correct: true});
    applyGuess(s, 'FRA');
    expect(s.practice.won).toBe(true);
    expect(s.stats.practice).toEqual({played: 1, wins: 1, totalGuesses: 4, best: 4});
    expect(evaluate(s.practice, 'Italy')).toMatchObject({kind: 'finished'});
  });
  it('colours far guesses pale, nearer ones warmer, neighbours dark red and the answer green', () => {
    expect(guessColour('FRA', 'FRA', false)).toBe('#2fa84f');
    expect(guessColour('ESP', 'FRA', false)).toBe('#6b0a10');
    const far = guessColour('NZL', 'FRA', false), mid = guessColour('EGY', 'FRA', false), near = guessColour('GBR', 'FRA', false);
    const warmth = (hex: string) => parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(warmth(far)).toBeGreaterThan(warmth(mid));
    expect(warmth(mid)).toBeGreaterThan(warmth(near));
    expect(guessColour('ESP', 'FRA', true)).not.toBe(guessColour('ESP', 'FRA', false));
    expect(proximity(0)).toBe(100);
    expect(proximity(20015)).toBe(0);
  });
  it('practice rounds can avoid repeating an answer', () => {
    for (let seed = 1; seed < 200; seed++) expect(newPractice(mulberry32(seed), 'FRA').answer).not.toBe('FRA');
    expect(newPractice(() => IDS.indexOf('FRA') / IDS.length + 1e-9, 'FRA').answer).not.toBe('FRA');
  });
});

describe('daily puzzle', () => {
  it('uses the New Zealand calendar date', () => {
    expect(aucklandDate(new Date('2026-10-20T10:59:00Z'))).toBe('2026-10-20'); // 23:59 NZDT
    expect(aucklandDate(new Date('2026-10-20T11:00:00Z'))).toBe('2026-10-21'); // midnight NZDT
    expect(aucklandDate(new Date('2026-06-15T11:59:00Z'))).toBe('2026-06-15'); // 23:59 NZST
    expect(aucklandDate(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06-16');
  });
  it('is deterministic and visits every country once per cycle', () => {
    expect(dailyAnswer(today)).toEqual(dailyAnswer(today));
    const seen = new Set<string>();
    let date = '2026-01-01';
    const dates: string[] = [];
    for (let i = 0; i < IDS.length; i++) {dates.push(date); date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);}
    for (const d of dates) seen.add(dailyAnswer(d).answer);
    expect(seen.size).toBe(IDS.length);
    expect(dailyAnswer('2026-01-01').puzzle).toBe(1);
  });
  it('tracks streaks separately from practice', () => {
    const s = fresh();
    const play = (date: string) => {s.daily = {...createState(date).daily}; s.mode = 'daily'; applyGuess(s, s.daily.answer);};
    play('2026-10-19'); play('2026-10-20'); play('2026-10-21');
    expect(s.stats.daily).toMatchObject({played: 3, wins: 3, streak: 3, maxStreak: 3, lastWin: '2026-10-21'});
    expect(s.stats.practice.played).toBe(0);
    expect(liveStreak(s.stats.daily, '2026-10-22')).toBe(3);
    expect(liveStreak(s.stats.daily, '2026-10-23')).toBe(0);
    play('2026-10-25');
    expect(s.stats.daily.streak).toBe(1);
    expect(s.stats.daily.maxStreak).toBe(3);
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
  });
});

describe('saving', () => {
  it('round-trips ongoing daily and practice games with stats', () => {
    const s = fresh();
    applyGuess(s, s.daily.answer === 'BRA' ? 'ARG' : 'BRA');
    s.mode = 'practice'; applyGuess(s, s.practice.answer === 'JPN' ? 'CHN' : 'JPN');
    const restored = restoreState(JSON.parse(JSON.stringify(serializeState(s))), today);
    expect(restored).toEqual(s);
  });
  it('replaces a stale daily round on a new New Zealand day but keeps practice', () => {
    const s = fresh();
    applyGuess(s, s.daily.answer === 'BRA' ? 'ARG' : 'BRA');
    const restored = restoreState(serializeState(s), '2026-10-22')!;
    expect(restored.daily.date).toBe('2026-10-22');
    expect(restored.daily.guesses).toEqual([]);
    expect(restored.practice).toEqual(s.practice);
    expect(refreshDaily(restored, '2026-10-22')).toBe(false);
  });
  it('rejects snapshots with nothing valid in them', () => {
    const good = serializeState(fresh());
    for (const value of [null, 5, [], {...good, version: 2}, {version: 1, daily: 1, practice: 'x', stats: []}]) expect(restoreState(value, today)).toBeUndefined();
  });
  it('replaces only the damaged part of a snapshot and keeps statistics', () => {
    const s = fresh();
    s.stats.daily = {played: 9, wins: 8, streak: 4, maxStreak: 6, lastWin: '2026-10-20', lastPlayed: '2026-10-20', totalGuesses: 40};
    applyGuess(s, s.daily.answer === 'BRA' ? 'ARG' : 'BRA');
    const good = serializeState(s);
    const damaged = [{...good, daily: {...good.daily, answer: 'XXX'}}, {...good, daily: {...good.daily, answer: good.daily.answer === 'FRA' ? 'DEU' : 'FRA'}},
      {...good, practice: {...good.practice, guesses: ['FRA', 'FRA']}}, {...good, practice: {...good.practice, won: true}}, {...good, mode: 'x'}, {...good, colorBlind: 'yes'}];
    for (const value of damaged) {
      const restored = restoreState(value, today)!;
      expect(restored.stats).toEqual(s.stats);
      expect(restored.daily.answer).toBe(s.daily.answer);
    }
    const badStats = restoreState({...good, stats: {...good.stats, daily: {...good.stats.daily, wins: -1}}}, today)!;
    expect(badStats.daily).toEqual(s.daily);
    expect(badStats.stats.daily.wins).toBe(0);
  });
  it('merges another tab’s save forwards only, so a stale tab cannot erase a win', () => {
    const stale = createState('2026-10-20', mulberry32(1)), fresh2 = createState(today, mulberry32(1));
    fresh2.practice = structuredClone(stale.practice);
    applyGuess(fresh2, fresh2.daily.answer);
    fresh2.mode = 'practice'; applyGuess(fresh2, fresh2.practice.answer === 'PER' ? 'CHL' : 'PER');
    const merged = mergeState(stale, fresh2);
    expect(merged.daily).toEqual(fresh2.daily);
    expect(merged.practice).toEqual(fresh2.practice);
    expect(merged.stats).toEqual(fresh2.stats);
    expect(mergeState(fresh2, stale).stats).toEqual(fresh2.stats); // the other direction keeps the win too
    expect(mergeState(merged, merged)).toEqual(merged);
  });
});
