/** Deterministic Maze Muncher rules: one call to step() is one 1/60 s arcade tick. */
export const COLS = 28, ROWS = 31, TICKS_PER_SECOND = 60;
/** Original layout. '#' wall, '.' dot, 'o' power berry, '-' house door, ' ' empty lane. */
export const MAZE: readonly string[] = [
  '############################',
  '#......#.....##.....#......#',
  '#o####.#.###.##.###.#.####o#',
  '#.####.#.###.##.###.#.####.#',
  '#..........................#',
  '#.##.###.##########.###.##.#',
  '#.##.###.##########.###.##.#',
  '#....###............###....#',
  '####.######.####.######.####',
  '####.###### #### ######.####',
  '####.###### #### ######.####',
  '####.                  .####',
  '####.### ####--#### ###.####',
  '####.### ##      ## ###.####',
  '    .    ##      ##    .    ',
  '####.### ##      ## ###.####',
  '####.### ########## ###.####',
  '####.### ########## ###.####',
  '####.                  .####',
  '####.###### #### ######.####',
  '####.######.####.######.####',
  '#............  ............#',
  '#.##.###.##########.###.##.#',
  '#.##.###.##########.###.##.#',
  '#o.#........####........#.o#',
  '##.#.######.####.######.#.##',
  '##.#.######.####.######.#.##',
  '#....##..............##....#',
  '#.#####.############.#####.#',
  '#..........................#',
  '############################'
];
export const TUNNEL_ROW = 14, HOUSE_EXIT = {x: 14, y: 11.5}, HOUSE_Y = 14.5, FRUIT = {x: 14, y: 18.5}, START = {x: 14, y: 21.5};
export type Dir = 'up' | 'left' | 'down' | 'right';
/** Tie-break order when two turns are equally close to a target. */
export const DIRS: readonly Dir[] = ['up', 'left', 'down', 'right'];
export const VEC: Readonly<Record<Dir, {x: number; y: number}>> = {up: {x: 0, y: -1}, left: {x: -1, y: 0}, down: {x: 0, y: 1}, right: {x: 1, y: 0}};
export const OPPOSITE: Readonly<Record<Dir, Dir>> = {up: 'down', down: 'up', left: 'right', right: 'left'};
export const GHOSTS = ['rook', 'vex', 'drift', 'mope'] as const;
export type GhostName = typeof GHOSTS[number];
export type GhostMode = 'house' | 'leaving' | 'active' | 'eaten' | 'entering';
export type Phase = 'ready' | 'intro' | 'playing' | 'dying' | 'cleared' | 'over';
export interface Ghost {name: GhostName; x: number; y: number; dir: Dir; mode: GhostMode; frightened: boolean; reverse: boolean; dots: number}
export interface Player {x: number; y: number; dir: Dir; next: Dir | null; moving: boolean; stall: number}
export interface Popup {x: number; y: number; value: number; ticks: number}
export interface State {
  version: 1; rng: number; phase: Phase; timer: number; level: number; score: number; lives: number; bonusLife: boolean;
  dots: string; dotsLeft: number; dotsEaten: number; player: Player; ghosts: Ghost[];
  modeIndex: number; modeTicks: number; fright: number; frightTotal: number; combo: number; freeze: number;
  popup: Popup | null; fruit: number; idle: number; global: number | null; tick: number;
}
export type GameEvent = 'dot' | 'power' | 'ghost' | 'fruit' | 'death' | 'clear' | 'life' | 'over' | 'go';

export const INTRO_TICKS = 120, DEATH_FREEZE = 60, DEATH_TICKS = 150, CLEAR_TICKS = 180, EXTRA_LIFE = 10000;
const BASE = 75.75757625 / 8 / TICKS_PER_SECOND;
const SCATTER: Record<GhostName, {x: number; y: number}> = {rook: {x: 25, y: -3}, vex: {x: 2, y: -3}, drift: {x: 27, y: 31}, mope: {x: 0, y: 31}};
const HOUSE_X: Record<GhostName, number> = {rook: 14, vex: 14, drift: 12, mope: 16};
const FRIGHT_SECONDS = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
export const FRUITS = ['cherry', 'berry', 'orange', 'orange', 'apple', 'apple', 'grape', 'grape', 'melon', 'melon', 'star', 'star', 'gem'] as const;
export type Fruit = typeof FRUITS[number];
const FRUIT_POINTS: Record<Fruit, number> = {cherry: 100, berry: 300, orange: 500, apple: 700, grape: 1000, melon: 2000, star: 3000, gem: 5000};
export const fruitFor = (level: number): Fruit => FRUITS[Math.min(level, FRUITS.length) - 1];
export const fruitPoints = (level: number) => FRUIT_POINTS[fruitFor(level)];

export interface LevelSpec {player: number; playerFright: number; ghost: number; ghostFright: number; tunnel: number; fright: number; flashes: number; elroy: [number, number]; modes: number[]}
export function levelSpec(level: number): LevelSpec {
  const fright = FRIGHT_SECONDS[level - 1] ?? 0;
  const elroy: [number, number] = level === 1 ? [20, 10] : level === 2 ? [30, 15] : level <= 5 ? [40, 20] : level <= 8 ? [50, 25] : level <= 11 ? [60, 30] : level <= 14 ? [80, 40] : level <= 18 ? [100, 50] : [120, 60];
  // Scatter/chase alternation in seconds; the last chase lasts until the level ends.
  const modes = level === 1 ? [7, 20, 7, 20, 5, 20, 5] : level <= 4 ? [7, 20, 7, 20, 5, 1033, 1 / 60] : [5, 20, 5, 20, 5, 1037, 1 / 60];
  const common = {fright, flashes: fright <= 1 ? 3 : 5, elroy, modes};
  if (level === 1) return {...common, player: .8, playerFright: .9, ghost: .75, ghostFright: .5, tunnel: .4};
  if (level <= 4) return {...common, player: .9, playerFright: .95, ghost: .85, ghostFright: .55, tunnel: .45};
  if (level <= 20) return {...common, player: 1, playerFright: 1, ghost: .95, ghostFright: .6, tunnel: .5};
  return {...common, player: .9, playerFright: .9, ghost: .95, ghostFright: .6, tunnel: .5};
}

export const cell = (c: number, r: number) => r < 0 || r >= ROWS ? '#' : MAZE[r][((c % COLS) + COLS) % COLS];
export const open = (c: number, r: number) => {const k = cell(c, r); return k !== '#' && k !== '-';};
export const tileOf = (e: {x: number; y: number}) => ({x: ((Math.floor(e.x) % COLS) + COLS) % COLS, y: Math.floor(e.y)});
const initialDots = () => MAZE.join('').replace(/[#\-]/g, ' ');

function random(s: State) {
  // mulberry32: frightened turns are reproducible from the saved state.
  s.rng = (s.rng + 0x6D2B79F5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function resetActors(s: State) {
  s.player = {x: START.x, y: START.y, dir: 'left', next: null, moving: true, stall: 0};
  s.ghosts = GHOSTS.map((name): Ghost => name === 'rook'
    ? {name, x: HOUSE_EXIT.x, y: HOUSE_EXIT.y, dir: 'left', mode: 'active', frightened: false, reverse: false, dots: 0}
    : {name, x: HOUSE_X[name], y: HOUSE_Y, dir: name === 'vex' ? 'down' : 'up', mode: 'house', frightened: false, reverse: false, dots: s.ghosts?.find(g => g.name === name)?.dots ?? 0});
  s.modeIndex = 0; s.modeTicks = 0; s.fright = 0; s.frightTotal = 0; s.combo = 0; s.freeze = 0; s.popup = null; s.fruit = 0; s.idle = 0;
}

export function createState(seed = 1): State {
  const dots = initialDots();
  const s = {version: 1, rng: seed | 0, phase: 'ready', timer: 0, level: 1, score: 0, lives: 2, bonusLife: false, dots, dotsLeft: countDots(dots), dotsEaten: 0, global: null, tick: 0} as State;
  resetActors(s);
  return s;
}
const countDots = (dots: string) => dots.replace(/ /g, '').length;

export function start(s: State) {
  if (s.phase === 'over') Object.assign(s, createState(s.rng));
  if (s.phase !== 'ready') return false;
  s.phase = 'intro'; s.timer = INTRO_TICKS;
  return true;
}
export function steer(s: State, dir: Dir) {
  if (s.phase === 'over' || s.phase === 'dying' || s.phase === 'cleared') return;
  s.player.next = dir;
}

function addScore(s: State, points: number, events: GameEvent[]) {
  s.score += points;
  if (!s.bonusLife && s.score >= EXTRA_LIFE) {s.bonusLife = true; s.lives++; events.push('life');}
}

/** Moves an entity `dist` tiles along its lane, calling `atCenter` on every tile centre it reaches. */
function travel(e: {x: number; y: number; dir: Dir}, dist: number, atCenter: () => boolean) {
  let handled = false;
  for (let guard = 0; dist > 1e-9 && guard < 16; guard++) {
    const v = VEC[e.dir], horizontal = v.x !== 0, p = horizontal ? e.x : e.y, sign = horizontal ? v.x : v.y;
    const centre = sign > 0 ? Math.ceil(p - .5 - 1e-7) + .5 : Math.floor(p - .5 + 1e-7) + .5;
    let gap = Math.abs(centre - p);
    if (gap < 1e-7) {
      if (horizontal) e.x = centre; else e.y = centre;
      if (!handled) {handled = true; if (!atCenter()) return; continue;}
      gap = 1;
    }
    const move = Math.min(gap, dist);
    dist -= move;
    const next = move === gap ? p + sign * gap : p + sign * move;
    if (horizontal) e.x = next; else e.y = next;
    if (move === gap) handled = false;
    if (e.x < 0) e.x += COLS; else if (e.x >= COLS) e.x -= COLS;
  }
}

const inTunnel = (e: {x: number; y: number}) => Math.floor(e.y) === TUNNEL_ROW && (e.x < 6 || e.x >= COLS - 6);
const scatterMode = (s: State) => s.modeIndex % 2 === 0 && s.modeIndex < levelSpec(s.level).modes.length;

function ghostSpeed(s: State, g: Ghost) {
  const spec = levelSpec(s.level);
  if (g.mode === 'eaten' || g.mode === 'entering') return BASE * 1.6;
  if (g.mode === 'house' || g.mode === 'leaving') return BASE * .5;
  if (inTunnel(g)) return BASE * spec.tunnel;
  if (g.frightened) return BASE * spec.ghostFright;
  if (g.name === 'rook' && s.dotsLeft <= spec.elroy[1]) return BASE * (spec.ghost + .1);
  if (g.name === 'rook' && s.dotsLeft <= spec.elroy[0]) return BASE * (spec.ghost + .05);
  return BASE * spec.ghost;
}

export function ghostTarget(s: State, g: Ghost): {x: number; y: number} {
  if (g.mode === 'eaten') return {x: 13, y: 11};
  const p = tileOf(s.player), v = VEC[s.player.dir];
  const elroy = g.name === 'rook' && s.dotsLeft <= levelSpec(s.level).elroy[0];
  if (scatterMode(s) && !elroy) return SCATTER[g.name];
  // Up-facing lookahead keeps the arcade's diagonal offset quirk.
  const ahead = (n: number) => ({x: p.x + v.x * n - (s.player.dir === 'up' ? n : 0), y: p.y + v.y * n});
  switch (g.name) {
    case 'rook': return p;
    case 'vex': return ahead(4);
    case 'drift': {const pivot = ahead(2), r = tileOf(s.ghosts[0]); return {x: pivot.x * 2 - r.x, y: pivot.y * 2 - r.y};}
    case 'mope': {const t = tileOf(g); return (t.x - p.x) ** 2 + (t.y - p.y) ** 2 > 64 ? p : SCATTER.mope;}
  }
}

function chooseTurn(s: State, g: Ghost) {
  const t = tileOf(g);
  if (g.mode === 'eaten' && t.y === 11 && (t.x === 13 || t.x === 14)) {g.mode = 'entering'; return false;}
  if (g.reverse) {g.reverse = false; g.dir = OPPOSITE[g.dir]; return true;}
  const options = DIRS.filter(d => d !== OPPOSITE[g.dir] && open(t.x + VEC[d].x, t.y + VEC[d].y));
  if (!options.length) {g.dir = OPPOSITE[g.dir]; return true;}
  if (g.frightened) {
    let i = Math.floor(random(s) * 4);
    while (!options.includes(DIRS[i])) i = (i + 1) % 4;
    g.dir = DIRS[i];
    return true;
  }
  const target = ghostTarget(s, g);
  let best = options[0], bestDistance = Infinity;
  for (const d of options) {
    const distance = (t.x + VEC[d].x - target.x) ** 2 + (t.y + VEC[d].y - target.y) ** 2;
    if (distance < bestDistance) {best = d; bestDistance = distance;}
  }
  g.dir = best;
  return true;
}

function moveToward(g: Ghost, axis: 'x' | 'y', goal: number, dist: number) {
  const delta = goal - g[axis];
  if (Math.abs(delta) <= dist) {g[axis] = goal; return dist - Math.abs(delta);}
  g[axis] += Math.sign(delta) * dist;
  g.dir = axis === 'x' ? (delta < 0 ? 'left' : 'right') : (delta < 0 ? 'up' : 'down');
  return 0;
}

function moveGhost(s: State, g: Ghost) {
  let dist = ghostSpeed(s, g);
  switch (g.mode) {
    case 'house': {
      const goal = g.dir === 'up' ? HOUSE_Y - .5 : HOUSE_Y + .5;
      if (moveToward(g, 'y', goal, dist) > 0 || g.y === goal) g.dir = OPPOSITE[g.dir];
      return;
    }
    case 'leaving':
      dist = moveToward(g, 'x', HOUSE_EXIT.x, dist);
      if (dist > 0 || g.x === HOUSE_EXIT.x) dist = moveToward(g, 'y', HOUSE_EXIT.y, dist);
      if (g.x === HOUSE_EXIT.x && g.y === HOUSE_EXIT.y) {g.mode = 'active'; g.dir = 'left'; g.reverse = false;}
      return;
    case 'entering':
      dist = moveToward(g, 'x', HOUSE_EXIT.x, dist);
      if (g.x === HOUSE_EXIT.x) moveToward(g, 'y', HOUSE_Y, dist);
      if (g.x === HOUSE_EXIT.x && g.y === HOUSE_Y) {g.mode = 'leaving'; g.frightened = false;}
      return;
    default:
      travel(g, dist, () => chooseTurn(s, g));
  }
}

function releaseGhosts(s: State) {
  const waiting = s.ghosts.find(g => g.mode === 'house');
  if (!waiting) return;
  const limits: Record<GhostName, number> = s.level === 1 ? {rook: 0, vex: 0, drift: 30, mope: 60} : s.level === 2 ? {rook: 0, vex: 0, drift: 0, mope: 50} : {rook: 0, vex: 0, drift: 0, mope: 0};
  const shared: Record<GhostName, number> = {rook: 0, vex: 7, drift: 17, mope: 32};
  let release = s.global === null ? waiting.dots >= limits[waiting.name] : s.global >= shared[waiting.name];
  if (s.global !== null && waiting.name === 'mope' && s.global >= 32) s.global = null;
  if (s.idle >= (s.level < 5 ? 4 : 3) * TICKS_PER_SECOND) {release = true; s.idle = 0;}
  if (release) waiting.mode = 'leaving';
}

function collide(s: State, events: GameEvent[]) {
  const p = tileOf(s.player);
  for (const g of s.ghosts) {
    if (g.mode !== 'active') continue;
    const t = tileOf(g);
    if (t.x !== p.x || t.y !== p.y) continue;
    if (g.frightened) {
      s.combo++;
      const value = 200 * 2 ** (s.combo - 1);
      addScore(s, value, events);
      s.popup = {x: g.x, y: g.y, value, ticks: 60};
      s.freeze = 60;
      g.mode = 'eaten'; g.frightened = false;
      events.push('ghost');
      return;
    }
    s.phase = 'dying'; s.timer = 0; s.player.moving = false;
    events.push('death');
    return;
  }
}

function eat(s: State, events: GameEvent[]) {
  const t = tileOf(s.player), index = t.y * COLS + t.x, kind = s.dots[index];
  if (kind === '.' || kind === 'o') {
    s.dots = s.dots.slice(0, index) + ' ' + s.dots.slice(index + 1);
    s.dotsLeft--; s.dotsEaten++; s.idle = 0;
    if (s.global !== null) s.global++;
    else {const waiting = s.ghosts.find(g => g.mode === 'house'); if (waiting) waiting.dots++;}
    if (kind === '.') {addScore(s, 10, events); s.player.stall = 1; events.push('dot');}
    else {
      addScore(s, 50, events); s.player.stall = 3; events.push('power');
      const spec = levelSpec(s.level);
      s.combo = 0;
      s.fright = s.frightTotal = spec.fright * TICKS_PER_SECOND;
      for (const g of s.ghosts) {
        if (g.mode === 'eaten' || g.mode === 'entering') continue;
        if (g.mode === 'active') g.reverse = true;
        if (s.fright > 0) g.frightened = true;
      }
    }
    if (s.dotsEaten === 70 || s.dotsEaten === 170) s.fruit = 570;
    if (s.dotsLeft === 0) {s.phase = 'cleared'; s.timer = 0; events.push('clear');}
  }
  if (s.fruit > 0 && t.y === Math.floor(FRUIT.y) && (t.x === 13 || t.x === 14)) {
    const value = fruitPoints(s.level);
    addScore(s, value, events);
    s.fruit = 0; s.popup = {x: FRUIT.x, y: FRUIT.y, value, ticks: 120};
    events.push('fruit');
  }
}

function movePlayer(s: State) {
  const p = s.player;
  if (p.stall > 0) {p.stall--; return;}
  const can = (d: Dir) => {const t = tileOf(p); return open(t.x + VEC[d].x, t.y + VEC[d].y);};
  if (p.next && p.next === OPPOSITE[p.dir]) {p.dir = p.next; p.next = null; p.moving = true;}
  if (!p.moving) {
    if (p.next && can(p.next)) {p.dir = p.next; p.next = null; p.moving = true;}
    else return;
  }
  const spec = levelSpec(s.level);
  travel(p, BASE * (s.fright > 0 ? spec.playerFright : spec.player), () => {
    if (p.next && can(p.next)) {p.dir = p.next; p.next = null;}
    if (!can(p.dir)) {p.moving = false; return false;}
    return true;
  });
}

function nextLevel(s: State) {
  s.level++; s.dots = initialDots(); s.dotsLeft = countDots(s.dots); s.dotsEaten = 0; s.global = null;
  for (const g of s.ghosts) g.dots = 0;
  resetActors(s);
  s.phase = 'intro'; s.timer = INTRO_TICKS;
}

/** Advances exactly one tick and returns what happened for sound and announcements. */
export function step(s: State): GameEvent[] {
  const events: GameEvent[] = [];
  s.tick++;
  if (s.popup && s.freeze === 0 && --s.popup.ticks <= 0) s.popup = null;
  switch (s.phase) {
    case 'ready': case 'over': return events;
    case 'intro':
      if (--s.timer <= 0) {s.phase = 'playing'; events.push('go');}
      return events;
    case 'dying':
      if (++s.timer < DEATH_FREEZE + DEATH_TICKS) return events;
      if (s.lives === 0) {s.phase = 'over'; events.push('over'); return events;}
      s.lives--; resetActors(s); s.global = 0; s.phase = 'intro'; s.timer = INTRO_TICKS;
      return events;
    case 'cleared':
      if (++s.timer >= CLEAR_TICKS) nextLevel(s);
      return events;
  }
  if (s.freeze > 0) {
    if (--s.freeze === 0 && s.popup) s.popup = null;
    // Returning eyes keep travelling while the score is shown.
    for (const g of s.ghosts) if (g.mode === 'eaten' || g.mode === 'entering') moveGhost(s, g);
    return events;
  }
  s.idle++;
  if (s.fright > 0 && --s.fright === 0) for (const g of s.ghosts) g.frightened = false;
  if (s.fright === 0) {
    const modes = levelSpec(s.level).modes;
    if (s.modeIndex < modes.length && ++s.modeTicks >= Math.round(modes[s.modeIndex] * TICKS_PER_SECOND)) {
      s.modeIndex++; s.modeTicks = 0;
      for (const g of s.ghosts) if (g.mode === 'active') g.reverse = true;
    }
  }
  if (s.fruit > 0) s.fruit--;
  releaseGhosts(s);
  movePlayer(s);
  eat(s, events);
  if (s.phase !== 'playing') return events;
  collide(s, events);
  if (s.phase !== 'playing' || s.freeze) return events;
  for (const g of s.ghosts) moveGhost(s, g);
  collide(s, events);
  return events;
}

/** Validates an unknown snapshot; returns a fresh copy or null. */
export function restoreState(data: unknown): State | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<State>;
  const num = (v: unknown, min = 0, max = 1e9): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const int = (v: unknown, min = 0, max = 1e9) => num(v, min, max) && Number.isInteger(v);
  const dir = (v: unknown): v is Dir => typeof v === 'string' && (DIRS as readonly string[]).includes(v);
  const phases: Phase[] = ['ready', 'intro', 'playing', 'dying', 'cleared', 'over'];
  const modes: GhostMode[] = ['house', 'leaving', 'active', 'eaten', 'entering'];
  if (d.version !== 1 || !phases.includes(d.phase as Phase) || !int(d.level, 1, 999) || !int(d.score, 0, 2 ** 31) || !int(d.lives, 0, 9) || !int(d.timer, 0, 1e4) || typeof d.bonusLife !== 'boolean') return null;
  if (typeof d.dots !== 'string' || d.dots.length !== COLS * ROWS || /[^ .o]/.test(d.dots)) return null;
  for (let i = 0; i < d.dots.length; i++) if (d.dots[i] !== ' ' && MAZE.join('')[i] !== d.dots[i]) return null;
  if (!int(d.rng, -(2 ** 31), 2 ** 31) || !int(d.dotsEaten, 0, 1e4) || !int(d.modeIndex, 0, 8) || !int(d.modeTicks, 0, 1e6) || !int(d.fright, 0, 1e4) || !int(d.frightTotal, 0, 1e4) || !int(d.combo, 0, 4) || !int(d.freeze, 0, 60) || !int(d.fruit, 0, 600) || !int(d.idle, 0, 1e6) || !int(d.tick, 0, 2 ** 40)) return null;
  if (!(d.global === null || int(d.global, 0, 1e4))) return null;
  const p = d.player as Player | undefined;
  if (!p || !num(p.x, 0, COLS) || !num(p.y, 0, ROWS) || !dir(p.dir) || !(p.next === null || dir(p.next)) || typeof p.moving !== 'boolean' || !int(p.stall, 0, 3)) return null;
  if (!open(Math.floor(p.x), Math.floor(p.y)) && !open(Math.floor(p.x - .5), Math.floor(p.y))) return null;
  if (!Array.isArray(d.ghosts) || d.ghosts.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const g = d.ghosts[i] as Ghost;
    if (!g || g.name !== GHOSTS[i] || !num(g.x, 0, COLS) || !num(g.y, 0, ROWS) || !dir(g.dir) || !modes.includes(g.mode) || typeof g.frightened !== 'boolean' || typeof g.reverse !== 'boolean' || !int(g.dots, 0, 1e4)) return null;
  }
  const pop = d.popup as Popup | null | undefined;
  if (!(pop === null || (pop && num(pop.x, 0, COLS) && num(pop.y, 0, ROWS) && int(pop.value, 0, 5000) && int(pop.ticks, 0, 120)))) return null;
  const copy = JSON.parse(JSON.stringify(d)) as State;
  copy.dotsLeft = countDots(copy.dots);
  return copy;
}
