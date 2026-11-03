/** Stateless horizontal terrain. No column cache: returning to a column reconstructs it. */
import {COLS, EDGE_COLS, difficulty, type GrassLane, type LilyLane, type Obstacle} from './config';

export function terrainHash(seed: number, row: number, column: number): number {
  let h = seed ^ Math.imul(row + 1, 0x9e3779b9) ^ Math.imul(column, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Two clear columns in every eight-column region, shared by every grass row.
 * Their location is seeded independently per region. An open bank at the start
 * of each grass cluster connects these corridors horizontally. */
export function corridor(seed: number, column: number): boolean {
  const block = Math.floor(column / 8), first = block * 8 + 1 + terrainHash(seed, 0, block) % 5;
  return column === first || column === first + 1;
}

export function seededObstacle(seed: number, row: number, column: number): Obstacle {
  if (row < 0) return 'tree';
  if (corridor(seed, column) || (row < 5 && column >= 2 && column <= 6)) return null;
  const h = terrainHash(seed, row, column);
  if ((h & 65535) / 65536 >= .12 + .28 * difficulty(row)) return null;
  return (h >>> 16) % 10 < 7 ? 'tree' : 'rock';
}

export function obstacleAt(lane: GrassLane, column: number): Obstacle {
  if (lane.clearing) return null;
  if (column >= 0 && column < COLS) return lane.obstacles[column] ?? null;
  if (lane.seed !== undefined) return seededObstacle(lane.seed, lane.row, column);
  // Legacy/custom rows keep their supplied decoration. Empty custom rows stay open.
  const edge = column < 0 ? column + EDGE_COLS : column - 3;
  if (edge >= 0 && edge < 2 * EDGE_COLS) return lane.edge[edge] ?? null;
  return lane.row < 0 ? 'tree' : null;
}

export function obstacleVariant(lane: GrassLane, column: number): number {
  if (column >= 0 && column < COLS) return lane.variant[column];
  const h = terrainHash(lane.seed ?? 0, lane.row, column);
  return h % 10 === 0 ? 3 : h % 3;
}

export function lilyAt(lane: LilyLane, column: number): boolean {
  if (column >= 0 && column < COLS) return lane.pads[column] === true;
  return lane.seed !== undefined && (corridor(lane.seed, column) || terrainHash(lane.seed, lane.row, column) % 10 < 5);
}
