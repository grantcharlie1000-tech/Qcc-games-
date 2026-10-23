export type Level = { size: number; name: string; pairs: [number, number][] };
export type Paths = number[][];
export type Point = { x: number; y: number };
export const copyPaths = (paths: Paths): Paths => paths.map(path => [...path]);
export const adjacent = (a: number, b: number, size: number): boolean => Math.abs(a % size - b % size) + Math.abs(Math.floor(a / size) - Math.floor(b / size)) === 1;
export const neighbors = (cell: number, size: number): number[] => [cell - size, cell + 1, cell + size, cell - 1].filter(other => other >= 0 && other < size * size && adjacent(cell, other, size));
export const emptyPaths = (level: Level): Paths => level.pairs.map(() => []);
export const endpoint = (level: Level, cell: number): number => level.pairs.findIndex(pair => pair.includes(cell));
export const connected = (level: Level, path: number[], color: number): boolean => path.length > 1 && level.pairs[color].includes(path[0]) && level.pairs[color].includes(path[path.length - 1]) && path[0] !== path[path.length - 1];

/** Deterministic backbite walk: each splice preserves one Hamiltonian path. */
export function generate(size: number, seed: number, colors: number): { level: Level; witness: Paths } {
  let randomState = seed >>> 0;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  let walk = Array.from({ length: size * size }, (_, i) => Math.floor(i / size) * size + (Math.floor(i / size) % 2 ? size - 1 - i % size : i % size));
  for (let turn = 0; turn < size * size * 12; turn++) {
    if (random() < .5) walk.reverse();
    const candidates = neighbors(walk[0], size).filter(cell => cell !== walk[1]);
    if (candidates.length) {
      const at = walk.indexOf(candidates[Math.floor(random() * candidates.length)]);
      walk = [...walk.slice(0, at).reverse(), ...walk.slice(at)];
    }
  }
  const lengths = Array(colors).fill(3) as number[];
  for (let i = colors * 3; i < size * size; i++) lengths[Math.floor(random() * colors)]++;
  let offset = 0;
  const witness = lengths.map(length => { const path = walk.slice(offset, offset + length); offset += length; return path; });
  return { level: { size, name: `${size}×${size}`, pairs: witness.map(path => [path[0], path[path.length - 1]]) }, witness };
}
const settings: [number, number, number, string][] = [
  [4, 17, 3, 'First light'], [4, 29, 3, 'Little bends'], [4, 103, 4, 'Four friends'],
  [5, 42, 4, 'Garden paths'], [5, 91, 4, 'Ribbon dance'], [5, 214, 5, 'Sweet circuit'],
  [6, 76, 5, 'Deep lagoon'], [6, 229, 5, 'Interwoven'], [6, 102, 6, 'Prism garden'],
  [7, 24, 6, 'Twilight maze'], [7, 49, 6, 'Seven seas'], [7, 389, 7, 'Grand tapestry'],
  // Larger chapters; verified search effort rises within each board size.
  [8, 2097, 7, 'Copper maze'],
  [8, 2023, 7, 'Mosaic crossing'],
  [8, 2063, 7, 'Braided ribbons'],
  [8, 2044, 7, 'Lantern garden'],
  [8, 2008, 7, 'Winding tapestry'],
  [8, 2088, 7, 'Crystal circuit'],
  [8, 2019, 7, 'Hidden avenues'],
  [8, 2100, 7, 'Starlight weave'],
  [8, 2012, 7, 'Twilight lattice'],
  [8, 2037, 7, 'Eightfold knot'],
  [9, 2081, 7, 'Silver labyrinth'],
  [9, 2070, 7, 'Coral canopy'],
  [9, 2056, 7, 'Moonlit passages'],
  [9, 2030, 7, 'Ninefold garden'],
  [9, 2073, 7, 'Aurora ribbons'],
  [9, 2048, 7, 'Spectral avenues'],
  [9, 2095, 7, 'Prism network'],
  [9, 2043, 7, 'Ocean lattice'],
  [9, 2076, 7, 'Midnight tapestry'],
  [9, 2096, 7, 'Grand labyrinth'],
];
export const LEVELS: Level[] = settings.map(([size, seed, colors, name]) => ({ ...generate(size, seed, colors).level, name }));

export function validatePaths(level: Level, value: unknown): value is Paths {
  if (!Array.isArray(value) || value.length !== level.pairs.length) return false;
  const occupied = new Set<number>();
  for (let color = 0; color < value.length; color++) {
    const path: unknown = value[color];
    if (!Array.isArray(path) || path.length > level.size * level.size) return false;
    for (let i = 0; i < path.length; i++) {
      const cell = path[i];
      if (!Number.isInteger(cell) || cell < 0 || cell >= level.size * level.size || occupied.has(cell)) return false;
      if (i === 0 && !level.pairs[color].includes(cell)) return false;
      if (i > 0 && !adjacent(path[i - 1], cell, level.size)) return false;
      const peg = endpoint(level, cell);
      if (peg !== -1 && (peg !== color || (i !== 0 && i !== path.length - 1))) return false;
      occupied.add(cell);
    }
  }
  return true;
}
export function isWon(level: Level, paths: Paths): boolean {
  return validatePaths(level, paths) && paths.every((path, color) => connected(level, path, color)) && paths.reduce((sum, path) => sum + path.length, 0) === level.size * level.size;
}
export function begin(level: Level, paths: Paths, cell: number): { paths: Paths; color: number } {
  let color = endpoint(level, cell);
  const next = copyPaths(paths);
  if (color !== -1) next[color] = [cell];
  else {
    color = paths.findIndex(path => path.includes(cell));
    if (color !== -1) next[color] = next[color].slice(0, next[color].indexOf(cell) + 1);
  }
  return { paths: next, color };
}
export function extend(level: Level, paths: Paths, color: number, cell: number): Paths {
  const path = paths[color];
  if (!path?.length || cell < 0 || cell >= level.size * level.size || !adjacent(path[path.length - 1], cell, level.size)) return paths;
  const prior = path.indexOf(cell);
  if (prior !== -1) { const next = copyPaths(paths); next[color] = next[color].slice(0, prior + 1); return next; }
  if (connected(level, path, color) || paths.some(other => other.includes(cell))) return paths;
  const peg = endpoint(level, cell);
  if (peg !== -1 && peg !== color) return paths;
  const next = copyPaths(paths); next[color].push(cell); return next;
}

export type SolveResult = { kind: 'solved'; paths: Paths; nodes: number } | { kind: 'impossible'; nodes: number } | { kind: 'limit'; nodes: number };
/** Independent CSP search. Existing paths are fixed prefixes; no construction witness is consulted. */
export function solve(level: Level, existing: Paths, budget = 180000): SolveResult {
  if (!validatePaths(level, existing)) return { kind: 'impossible', nodes: 0 };
  const size = level.size, count = size * size, paths = existing.map((path, i) => path.length ? [...path] : [level.pairs[i][0]]);
  const goals = paths.map((path, i) => level.pairs[i].find(cell => cell !== path[0])!);
  const occupied = new Int8Array(count).fill(-1);
  paths.forEach((path, color) => { path.forEach(cell => occupied[cell] = color); occupied[goals[color]] = color; });
  const around = Array.from({ length: count }, (_, cell) => neighbors(cell, size));
  let nodes = 0, limited = false;
  const done = (color: number) => paths[color][paths[color].length - 1] === goals[color];
  const legal = (color: number) => around[paths[color][paths[color].length - 1]].filter(cell => occupied[cell] === -1 || cell === goals[color]);
  function feasible(): boolean {
    const terminals = new Set<number>();
    for (let color = 0; color < paths.length; color++) {
      if (done(color)) continue;
      const head = paths[color][paths[color].length - 1], goal = goals[color];
      terminals.add(head); terminals.add(goal);
      const visited = new Uint8Array(count), queue = [head]; visited[head] = 1;
      for (let q = 0; q < queue.length && !visited[goal]; q++) {
        for (const next of around[queue[q]]) if (!visited[next] && (occupied[next] === -1 || next === goal)) { visited[next] = 1; queue.push(next); }
      }
      if (!visited[goal]) return false;
    }
    // An interior cell needs two distinct usable neighbours; dead pockets cannot be covered.
    for (let cell = 0; cell < count; cell++) if (occupied[cell] === -1 && around[cell].filter(next => occupied[next] === -1 || terminals.has(next)).length < 2) return false;
    const seen = new Uint8Array(count);
    for (let cell = 0; cell < count; cell++) if (occupied[cell] === -1 && !seen[cell]) {
      const queue = [cell], exits = new Set<number>(); seen[cell] = 1;
      for (let q = 0; q < queue.length; q++) for (const next of around[queue[q]]) {
        if (terminals.has(next)) exits.add(next);
        if (occupied[next] === -1 && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
      if (exits.size < 2) return false;
    }
    return true;
  }
  function search(): boolean {
    if (nodes >= budget) { limited = true; return false; }
    nodes++;
    if (!feasible()) return false;
    let color = -1, candidates: number[] = [];
    for (let i = 0; i < paths.length; i++) if (!done(i)) {
      const options = legal(i);
      if (!options.length) return false;
      if (color === -1 || options.length < candidates.length) { color = i; candidates = options; }
    }
    if (color === -1) return occupied.every(value => value !== -1);
    // Smaller onward degree first; distance only breaks ties, never prunes valid long routes.
    candidates.sort((a, b) => around[a].filter(c => occupied[c] === -1).length - around[b].filter(c => occupied[c] === -1).length || a - b);
    for (const cell of candidates) {
      const previous = occupied[cell]; occupied[cell] = color; paths[color].push(cell);
      if (search()) return true;
      paths[color].pop(); occupied[cell] = previous;
      if (limited) return false;
    }
    return false;
  }
  if (search()) return { kind: 'solved', paths: copyPaths(paths), nodes };
  return { kind: limited ? 'limit' : 'impossible', nodes };
}
export type Hint = { kind: 'step'; paths: Paths; color: number; cell: number } | { kind: 'backtrack' | 'limit' | 'complete'; color?: number };
export function hint(level: Level, paths: Paths): Hint {
  if (isWon(level, paths)) return { kind: 'complete' };
  const result = solve(level, paths);
  if (result.kind === 'limit') return { kind: 'limit' };
  if (result.kind === 'impossible') {
    // A single-colour erasure is suggested only when independently proven to repair the board.
    for (let color = 0; color < paths.length; color++) if (paths[color].length > 1) {
      const cleared = copyPaths(paths); cleared[color] = [];
      if (solve(level, cleared, 50000).kind === 'solved') return { kind: 'backtrack', color };
    }
    return { kind: 'backtrack' };
  }
  for (let color = 0; color < paths.length; color++) if (paths[color].length < result.paths[color].length) {
    const next = copyPaths(paths), length = Math.max(1, paths[color].length), cell = result.paths[color][length];
    next[color] = result.paths[color].slice(0, length + 1);
    return { kind: 'step', paths: next, color, cell };
  }
  return { kind: 'complete' };
}

/** Amanatides–Woo grid traversal. Corner ties choose x then y, keeping orthogonal steps. */
export function traverse(from: Point, to: Point, size: number): number[] {
  const clip = (value: number) => Math.max(0.00001, Math.min(size - .00001, value));
  const a = { x: clip(from.x), y: clip(from.y) }, b = { x: clip(to.x), y: clip(to.y) };
  let x = Math.floor(a.x), y = Math.floor(a.y);
  const endX = Math.floor(b.x), endY = Math.floor(b.y), dx = b.x - a.x, dy = b.y - a.y;
  const sx = Math.sign(dx), sy = Math.sign(dy), deltaX = dx ? Math.abs(1 / dx) : Infinity, deltaY = dy ? Math.abs(1 / dy) : Infinity;
  let maxX = dx ? ((sx > 0 ? x + 1 : x) - a.x) / dx : Infinity;
  let maxY = dy ? ((sy > 0 ? y + 1 : y) - a.y) / dy : Infinity;
  const cells = [y * size + x];
  while ((x !== endX || y !== endY) && cells.length <= size * 2 + 1) {
    if (maxX <= maxY && x !== endX || y === endY) { x += sx; maxX += deltaX; }
    else { y += sy; maxY += deltaY; }
    cells.push(y * size + x);
  }
  return cells;
}
/** Best clear of one puzzle: gestures, then assists (hints and undos). */
export type Best = {moves:number;assists:number};
/** `best` is campaign progress keyed by puzzle index: it survives restarts and puzzle switches. */
export type Snapshot = {version:1;level:number;paths:Paths;completed:number[];moves:number;history:Paths[];assists:number;best:Record<string,Best>};
/** Base grows with board area and pairs; par is one gesture per pair. Each assist costs a tenth of base from the bonus. */
export function levelPoints(index: number, best: Best): number {
  const level = LEVELS[index], par = level.pairs.length, base = 50 * level.size * level.size + 100 * par;
  return base + Math.max(0, Math.round(base * Math.min(1, par / Math.max(1, best.moves))) - best.assists * Math.round(base / 10));
}
export const campaignScore = (best: Record<string, Best>): number => Object.entries(best).reduce((sum, [index, b]) => sum + levelPoints(Number(index), b), 0);
/** A won board marks its puzzle complete and updates its record only when that scores higher. Mutates `state`. */
export function recordWin(state: Snapshot): Snapshot {
  if (!isWon(LEVELS[state.level], state.paths)) return state;
  if (!state.completed.includes(state.level)) state.completed.push(state.level);
  const next = { moves: state.moves, assists: state.assists }, old = state.best[state.level];
  if (!old || levelPoints(state.level, next) > levelPoints(state.level, old)) state.best = { ...state.best, [state.level]: next };
  return state;
}
const count = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
/** Old snapshots lack `best`; malformed entries are dropped. */
export function readBest(value: unknown): Record<string, Best> {
  const best: Record<string, Best> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return best;
  for (const [key, entry] of Object.entries(value)) {
    const b = entry as Partial<Best> | null;
    if (/^\d+$/.test(key) && LEVELS[Number(key)] && b && typeof b === 'object' && count(b.moves, 1000000) && b.moves! > 0 && count(b.assists, 1000000)) best[Number(key)] = { moves: b.moves!, assists: b.assists! };
  }
  return best;
}
export function restoreSnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<Snapshot>;
  if (data.version !== 1 || !Number.isInteger(data.level) || data.level! < 0 || data.level! >= LEVELS.length || !Number.isInteger(data.moves) || data.moves! < 0 || data.moves! > 1000000) return null;
  const level = LEVELS[data.level!];
  if (!validatePaths(level, data.paths) || !Array.isArray(data.completed) || data.completed.length > LEVELS.length || new Set(data.completed).size !== data.completed.length || !Array.from(data.completed).every(index => Number.isInteger(index) && index >= 0 && index < LEVELS.length)) return null;
  if (!Array.isArray(data.history) || data.history.length > 100 || !Array.from(data.history).every(paths => validatePaths(level, paths))) return null;
  return recordWin({version:1,level:data.level!,paths:copyPaths(data.paths),completed:[...data.completed],moves:data.moves!,history:data.history.map(copyPaths),assists:count(data.assists, 1000000) ? data.assists : 0,best:readBest(data.best)});
}
