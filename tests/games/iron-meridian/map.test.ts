import { describe, expect, it } from 'vitest';
import { LANDMASSES, MAP_HEIGHT, MAP_WIDTH, NATIONS, PROVINCES, SEA_LINKS } from '../../../src/games/iron-meridian/map-data';

type Point = [number, number];
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (polygon: Point[]) => Math.abs(polygon.reduce((sum, p, i) => {
  const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
const edges = (polygon: Point[]) => polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]] as const);

function contains(polygon: Point[], [x, y]: Point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function sharedLength(first: Point[], second: Point[]) {
  let length = 0;
  for (const [a, b] of edges(first)) {
    const dx = b[0] - a[0], dy = b[1] - a[1], size = Math.hypot(dx, dy);
    for (const [c, d] of edges(second)) {
      if (Math.abs(cross(a, b, c)) / size > 0.015 || Math.abs(cross(a, b, d)) / size > 0.015) continue;
      const u = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / size;
      const v = ((d[0] - a[0]) * dx + (d[1] - a[1]) * dy) / size;
      length += Math.max(0, Math.min(size, Math.max(u, v)) - Math.max(0, Math.min(u, v)));
    }
  }
  return length;
}

function reached(start: number, allowed: Set<number>, sea = false) {
  const seen = new Set([start]), queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head], ports = sea ? SEA_LINKS.flatMap(([a, b]) => a === id ? [b] : b === id ? [a] : []) : [];
    for (const next of [...PROVINCES[id].neighbors, ...ports]) {
      if (allowed.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

describe('Iron Meridian original geography', () => {
  it('tiles both landmasses with selectable, simple province polygons', () => {
    expect(PROVINCES).toHaveLength(84);
    expect(new Set(PROVINCES.map(p => p.name)).size).toBe(PROVINCES.length);
    expect(PROVINCES.reduce((sum, p) => sum + area(p.polygon), 0)).toBeCloseTo(LANDMASSES.reduce((sum, p) => sum + area(p), 0), -1);
    for (const [id, p] of PROVINCES.entries()) {
      expect(p.id).toBe(id);
      expect(p.polygon.length).toBeGreaterThanOrEqual(3);
      expect(area(p.polygon)).toBeGreaterThan(400);
      expect(contains(p.polygon, [p.x, p.y]), p.name).toBe(true);
      expect(LANDMASSES.some(land => contains(land, [p.x, p.y])), p.name).toBe(true);
      for (const [x, y] of p.polygon) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(MAP_WIDTH);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(MAP_HEIGHT);
      }
      const segments = edges(p.polygon);
      for (let a = 0; a < segments.length; a++) for (let b = a + 1; b < segments.length; b++) {
        if (b === a + 1 || (a === 0 && b === segments.length - 1)) continue;
        const [u, v] = segments[a], [w, z] = segments[b];
        const intersects = cross(u, v, w) * cross(u, v, z) < -0.001 && cross(w, z, u) * cross(w, z, v) < -0.001;
        expect(intersects, `${p.name} has crossing edges`).toBe(false);
      }
    }
  });

  it('uses exactly the symmetric land borders present in the polygons', () => {
    for (const p of PROVINCES) {
      expect(new Set(p.neighbors).size).toBe(p.neighbors.length);
      expect(p.neighbors).not.toContain(p.id);
      for (const q of PROVINCES) {
        if (p.id >= q.id) continue;
        const touches = sharedLength(p.polygon, q.polygon) > 0.1;
        expect(p.neighbors.includes(q.id), `${p.name} / ${q.name}`).toBe(touches);
        expect(q.neighbors.includes(p.id), `${q.name} / ${p.name}`).toBe(touches);
        expect(contains(q.polygon, [p.x, p.y])).toBe(false);
        expect(contains(p.polygon, [q.x, q.y])).toBe(false);
      }
    }
  });

  it('gives every nation a connected homeland, a capital and balanced production', () => {
    expect(NATIONS.map(n => n.id)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const nation of NATIONS) {
      const provinces = PROVINCES.filter(p => p.home === nation.id), ids = new Set(provinces.map(p => p.id));
      expect(reached(provinces[0].id, ids).size).toBe(ids.size);
      expect(provinces.filter(p => p.capital)).toHaveLength(1);
      expect(provinces.filter(p => p.port)).toHaveLength(2);
      for (const p of provinces) {
        expect(p.vp).toBe(p.capital ? 8 : p.terrain === 'city' ? 3 : 1);
        if (p.port) expect(LANDMASSES.some(land => sharedLength(p.polygon, land) > 1)).toBe(true);
        if (p.dockyard) expect(p.port).toBe(true);
      }
      const total = (key: 'civilian' | 'military' | 'dockyard' | 'steel' | 'oil') => provinces.reduce((sum, p) => sum + p[key], 0);
      expect(total('civilian')).toBe(7); expect(total('military')).toBe(8); expect(total('dockyard')).toBe(2);
      expect(total('steel')).toBe(28); expect(total('oil')).toBe(18);
    }
    expect(new Set(PROVINCES.map(p => p.terrain))).toEqual(new Set(['plains', 'forest', 'hills', 'mountain', 'city']));
    expect(PROVINCES.filter(p => p.home === 0).some(p => p.neighbors.some(n => PROVINCES[n].home !== 0))).toBe(true);
  });

  it('connects the island federation through real ports and a navigable sea graph', () => {
    for (const p of PROVINCES.filter(p => p.home === 5)) expect(p.neighbors.every(n => PROVINCES[n].home === 5)).toBe(true);
    expect(SEA_LINKS.length).toBeGreaterThanOrEqual(6);
    for (const [a, b] of SEA_LINKS) {
      expect(PROVINCES[a].port).toBe(true); expect(PROVINCES[b].port).toBe(true);
      expect(a).not.toBe(b); expect(PROVINCES[a].neighbors).not.toContain(b);
    }
    expect(reached(0, new Set(PROVINCES.map(p => p.id)), true).size).toBe(PROVINCES.length);
  });
});
