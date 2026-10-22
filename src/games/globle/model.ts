import {COUNTRIES, NOT_PLAYABLE, AMBIGUOUS} from './countries';
import table from './data/distances.json';

export type Mode = 'daily' | 'practice';
export type Band = 'correct' | 'neighbour' | 'very-close' | 'close' | 'far';
export interface Round { mode: Mode; answer: string; guesses: string[]; won: boolean; date?: string; puzzle?: number }
export interface DailyStats { played: number; wins: number; streak: number; maxStreak: number; lastWin: string | null; lastPlayed: string | null; totalGuesses: number }
export interface PracticeStats { played: number; wins: number; totalGuesses: number; best: number | null }
export interface GameState {
  mode: Mode;
  daily: Round;
  practice: Round;
  stats: {daily: DailyStats; practice: PracticeStats};
  colorBlind: boolean | null; // null follows the arcade setting
}
export type GuessOutcome =
  | {kind: 'unknown'; message: string; suggestion?: string}
  | {kind: 'empty' | 'not-playable' | 'ambiguous' | 'duplicate' | 'finished'; message: string}
  | {kind: 'guess'; id: string; km: number; correct: boolean};

export const IDS: readonly string[] = table.ids;
const indexOf = new Map(IDS.map((id, i) => [id, i]));
const byId = new Map(COUNTRIES.map(c => [c.id, c]));
export const HALF_CIRCUMFERENCE_KM = 20015;
export const nameOf = (id: string): string => byId.get(id)?.name ?? id;
export const isCountry = (id: unknown): id is string => typeof id === 'string' && indexOf.has(id);

/** Bundled shortest land-boundary distance in whole km; 0 means a shared border. */
export function distanceKm(a: string, b: string): number {
  if (a === b) return 0;
  let i = indexOf.get(a), j = indexOf.get(b);
  if (i === undefined || j === undefined) throw new Error(`Unknown country ${a} or ${b}`);
  if (i > j) [i, j] = [j, i];
  return table.km[i * IDS.length - i * (i + 1) / 2 + (j - i - 1)];
}

export function band(id: string, answer: string): Band {
  if (id === answer) return 'correct';
  const km = distanceKm(id, answer);
  return km === 0 ? 'neighbour' : km < 1000 ? 'very-close' : km < 3000 ? 'close' : 'far';
}
export const BAND_LABEL: Record<Band, string> = {correct: 'Correct', neighbour: 'Neighbour', 'very-close': 'Very close', close: 'Closer', far: 'Far away'};
/** 100% for a shared border, 0% for the far side of the planet. */
export const proximity = (km: number): number => Math.max(0, Math.round(100 * (1 - km / HALF_CIRCUMFERENCE_KM)));

// Colour stops: [km, rgb]. Neighbours and the answer have their own fixed colours.
type Stop = [number, [number, number, number]];
const PALETTES: Record<'standard' | 'colorBlind', {correct: string; neighbour: string; stops: Stop[]}> = {
  standard: {correct: '#2fa84f', neighbour: '#6b0a10', stops: [[1, [204, 24, 30]], [1000, [240, 98, 34]], [3000, [249, 160, 63]], [6000, [253, 222, 168]], [12000, [255, 245, 226]]]},
  // Magma-like: luminance rises steadily with distance and never resembles the blue ocean.
  colorBlind: {correct: '#19d3e6', neighbour: '#2c0b5a', stops: [[1, [140, 41, 129]], [1000, [222, 73, 104]], [3000, [254, 159, 109]], [6000, [253, 222, 160]], [12000, [252, 253, 210]]]}
};
export function guessColour(id: string, answer: string, colorBlind: boolean): string {
  const palette = PALETTES[colorBlind ? 'colorBlind' : 'standard'];
  if (id === answer) return palette.correct;
  const km = distanceKm(id, answer);
  if (km === 0) return palette.neighbour;
  const stops = palette.stops;
  if (km <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    const [k1, c1] = stops[i - 1], [k2, c2] = stops[i];
    if (km <= k2) {
      const t = (km - k1) / (k2 - k1);
      return rgb([0, 1, 2].map(n => Math.round(c1[n] + (c2[n] - c1[n]) * t)) as [number, number, number]);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}
const rgb = ([r, g, b]: [number, number, number]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
export const legend = (colorBlind: boolean) => {
  const p = PALETTES[colorBlind ? 'colorBlind' : 'standard'];
  return [{label: 'Far', colour: rgb(p.stops[3][1])}, {label: 'Closer', colour: rgb(p.stops[2][1])}, {label: 'Very close', colour: rgb(p.stops[0][1])}, {label: 'Neighbour', colour: p.neighbour}, {label: 'Correct', colour: p.correct}];
};

/** Lowercase, accent-free, punctuation-free text for name matching. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’‘`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/^the /, '').replace(/\bst\b/g, 'saint').replace(/\bis\b/g, 'islands').replace(/\s+/g, ' ');
}
const lookup = new Map<string, string>();
for (const c of COUNTRIES) for (const name of [c.name, ...c.aliases]) {
  const key = normalize(name);
  const existing = lookup.get(key);
  if (existing && existing !== c.id) throw new Error(`Alias ${name} is ambiguous`);
  lookup.set(key, c.id);
}
const notPlayable = new Map(Object.entries(NOT_PLAYABLE).map(([k, v]) => [normalize(k), v]));
const ambiguous = new Map(Object.entries(AMBIGUOUS).map(([k, v]) => [normalize(k), v]));
export const resolveName = (text: string): string | undefined => lookup.get(normalize(text));

/** Optimal string alignment distance: a swap of two adjacent letters counts as one edit. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({length: a.length + 1}, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
export function suggestion(text: string): string | undefined {
  const key = normalize(text);
  if (key.length < 3) return undefined;
  let best: string | undefined, score = Infinity;
  for (const [name, id] of lookup) {
    const d = editDistance(key, name);
    if (d < score) {score = d; best = id;}
  }
  return best && score <= Math.max(1, Math.floor(key.length / 4)) ? best : undefined;
}

/** Pure evaluation of a typed guess against a round; never mutates. */
export function evaluate(round: Round, input: string): GuessOutcome {
  const key = normalize(input);
  if (round.won) return {kind: 'finished', message: `This round is finished. It was ${nameOf(round.answer)}.`};
  if (!key) return {kind: 'empty', message: 'Type a country name first.'};
  const id = lookup.get(key);
  if (!id) {
    if (ambiguous.has(key)) return {kind: 'ambiguous', message: ambiguous.get(key)!};
    if (notPlayable.has(key)) return {kind: 'not-playable', message: notPlayable.get(key)!};
    const near = suggestion(input);
    return {kind: 'unknown', suggestion: near, message: `“${input.trim()}” isn’t a country in this game.${near ? ` Did you mean ${nameOf(near)}?` : ' Check the spelling.'}`};
  }
  const previous = round.guesses.indexOf(id);
  if (previous >= 0) return {kind: 'duplicate', message: `You already guessed ${nameOf(id)} (guess ${previous + 1}). It doesn’t count again.`};
  return {kind: 'guess', id, km: distanceKm(id, round.answer), correct: id === round.answer};
}

// ---------- dates, daily answers and randomness ----------
export const DAILY_TIME_ZONE = 'Pacific/Auckland';
const EPOCH_DAY = Date.UTC(2026, 0, 1) / 86400000;
/** The calendar date in New Zealand, as YYYY-MM-DD. */
export function aucklandDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: DAILY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const dayNumber = (date: string) => {const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000;};
export const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(dayNumber(value));
export const previousDate = (date: string) => new Date((dayNumber(date) - 1) * 86400000).toISOString().slice(0, 10);
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Everyone gets the same answer for a date: each cycle of 197 days visits every country once. */
export function dailyAnswer(date: string): {answer: string; puzzle: number} {
  const offset = dayNumber(date) - EPOCH_DAY, n = IDS.length;
  const cycle = Math.floor(offset / n), position = ((offset % n) + n) % n;
  const random = mulberry32(0x6c6f6265 ^ Math.imul(cycle + 1, 0x9e3779b1));
  const order = [...IDS];
  for (let i = order.length - 1; i > 0; i--) {const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];}
  return {answer: order[position], puzzle: offset + 1};
}
export function newDaily(date: string): Round { const {answer, puzzle} = dailyAnswer(date); return {mode: 'daily', answer, guesses: [], won: false, date, puzzle}; }
export function newPractice(random: () => number = Math.random, avoid?: string): Round {
  let answer = IDS[Math.floor(random() * IDS.length) % IDS.length];
  if (answer === avoid) answer = IDS[(IDS.indexOf(answer) + 1 + Math.floor(random() * (IDS.length - 1))) % IDS.length];
  return {mode: 'practice', answer, guesses: [], won: false};
}
export const emptyStats = (): GameState['stats'] => ({
  daily: {played: 0, wins: 0, streak: 0, maxStreak: 0, lastWin: null, lastPlayed: null, totalGuesses: 0},
  practice: {played: 0, wins: 0, totalGuesses: 0, best: null}
});
export function createState(today: string, random: () => number = Math.random): GameState {
  return {mode: 'daily', daily: newDaily(today), practice: newPractice(random), stats: emptyStats(), colorBlind: null};
}

/** Replaces a stale daily round when the New Zealand date has moved on. Returns whether it changed. */
export function refreshDaily(state: GameState, today: string): boolean {
  if (state.daily.date === today) return false;
  state.daily = newDaily(today);
  return true;
}
/** The streak still alive today: a win today or yesterday keeps it going. */
export function liveStreak(stats: DailyStats, today: string): number {
  return stats.lastWin === today || stats.lastWin === previousDate(today) ? stats.streak : 0;
}

/** Applies a valid guess to the active round, updating statistics. */
export function applyGuess(state: GameState, id: string): Round {
  const round = state[state.mode];
  if (round.won || round.guesses.includes(id) || !isCountry(id)) return round;
  round.guesses.push(id);
  if (state.mode === 'daily') {
    const s = state.stats.daily, date = round.date!;
    if (round.guesses.length === 1 && s.lastPlayed !== date) {s.played++; s.lastPlayed = date;}
    if (id === round.answer) {
      round.won = true;
      s.wins++; s.totalGuesses += round.guesses.length;
      s.streak = s.lastWin === previousDate(date) ? s.streak + 1 : s.lastWin === date ? s.streak : 1;
      s.lastWin = date; s.maxStreak = Math.max(s.maxStreak, s.streak);
    }
  } else {
    const s = state.stats.practice;
    if (round.guesses.length === 1) s.played++;
    if (id === round.answer) {
      round.won = true;
      s.wins++; s.totalGuesses += round.guesses.length;
      s.best = s.best === null ? round.guesses.length : Math.min(s.best, round.guesses.length);
    }
  }
  return round;
}

// ---------- snapshot validation ----------
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1e7;
function readRound(value: unknown, mode: Mode): Round | undefined {
  if (!record(value) || value.mode !== mode || !isCountry(value.answer) || !Array.isArray(value.guesses) || typeof value.won !== 'boolean') return undefined;
  const guesses = value.guesses;
  if (!guesses.every(isCountry) || new Set(guesses).size !== guesses.length || guesses.length > IDS.length) return undefined;
  const won = guesses.includes(value.answer);
  if (value.won !== won || (won && guesses[guesses.length - 1] !== value.answer)) return undefined;
  const round: Round = {mode, answer: value.answer, guesses: [...guesses], won};
  if (mode === 'daily') {
    if (!isDate(value.date)) return undefined;
    const expected = dailyAnswer(value.date);
    if (expected.answer !== value.answer) return undefined; // a save from another list version
    round.date = value.date; round.puzzle = expected.puzzle;
  }
  return round;
}
function readStats(value: unknown): GameState['stats'] | undefined {
  if (!record(value)) return undefined;
  const d = value.daily, p = value.practice;
  if (!record(d) || !record(p)) return undefined;
  const nullableDate = (v: unknown): v is string | null => v === null || isDate(v);
  if (![d.played, d.wins, d.streak, d.maxStreak, d.totalGuesses, p.played, p.wins, p.totalGuesses].every(count)) return undefined;
  if (!nullableDate(d.lastWin) || !nullableDate(d.lastPlayed) || !(p.best === null || count(p.best))) return undefined;
  return {
    daily: {played: d.played as number, wins: d.wins as number, streak: d.streak as number, maxStreak: d.maxStreak as number, lastWin: d.lastWin, lastPlayed: d.lastPlayed, totalGuesses: d.totalGuesses as number},
    practice: {played: p.played as number, wins: p.wins as number, totalGuesses: p.totalGuesses as number, best: p.best as number | null}
  };
}
/**
 * Validates each part on its own, so one stale or damaged round (for example after the
 * playable list changes) never costs the player their statistics and streaks.
 */
export function restoreState(value: unknown, today: string, random: () => number = Math.random): GameState | undefined {
  if (!record(value) || value.version !== 1) return undefined;
  const daily = readRound(value.daily, 'daily'), practice = readRound(value.practice, 'practice'), stats = readStats(value.stats);
  if (!daily && !practice && !stats) return undefined;
  const state: GameState = {
    mode: value.mode === 'practice' ? 'practice' : 'daily',
    daily: daily ?? newDaily(today),
    practice: practice ?? newPractice(random),
    stats: stats ?? emptyStats(),
    colorBlind: typeof value.colorBlind === 'boolean' ? value.colorBlind : null
  };
  refreshDaily(state, today);
  return state;
}

const later = (a: string | null, b: string | null) => a === null ? b : b === null ? a : a > b ? a : b;
/**
 * Combines this tab's state with a newer save from another tab. Every field only moves
 * forward (later dates, more guesses, higher counts), so repeated merges converge.
 */
export function mergeState(local: GameState, other: GameState): GameState {
  const merged = structuredClone(local);
  const pick = (a: Round, b: Round) => b.guesses.length > a.guesses.length && b.guesses.slice(0, a.guesses.length).every((g, i) => g === a.guesses[i]) ? b : a;
  if (other.daily.date! > local.daily.date!) merged.daily = structuredClone(other.daily);
  else if (other.daily.date === local.daily.date) merged.daily = structuredClone(pick(local.daily, other.daily));
  if (other.practice.answer === local.practice.answer) merged.practice = structuredClone(pick(local.practice, other.practice));
  const a = local.stats.daily, b = other.stats.daily;
  const streakFrom = (b.lastWin ?? '') > (a.lastWin ?? '') ? b : (a.lastWin ?? '') > (b.lastWin ?? '') ? a : (b.streak > a.streak ? b : a);
  merged.stats.daily = {
    played: Math.max(a.played, b.played), wins: Math.max(a.wins, b.wins), totalGuesses: Math.max(a.totalGuesses, b.totalGuesses),
    streak: streakFrom.streak, maxStreak: Math.max(a.maxStreak, b.maxStreak), lastWin: later(a.lastWin, b.lastWin), lastPlayed: later(a.lastPlayed, b.lastPlayed)
  };
  const x = local.stats.practice, y = other.stats.practice;
  merged.stats.practice = {
    played: Math.max(x.played, y.played), wins: Math.max(x.wins, y.wins), totalGuesses: Math.max(x.totalGuesses, y.totalGuesses),
    best: x.best === null ? y.best : y.best === null ? x.best : Math.min(x.best, y.best)
  };
  return merged;
}
export const serializeState = (state: GameState) => ({version: 1, ...structuredClone(state)});
