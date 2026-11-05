import {describe, expect, it} from 'vitest';
import {generate, generateChunk, initialState} from '../../../src/games/crossy-road/generator';
import {createRun} from '../../../src/games/crossy-road/rules';
import {platformAt} from '../../../src/games/crossy-road/lanes';
import {HOP_TIME, LOG_SLIP, PLATFORM_GRACE, RIVER_WAIT, difficulty, logGapCap, riverGapMax, roadGapMin, type Lane, type RiverLane, type RoadLane} from '../../../src/games/crossy-road/config';
import {mulberry32} from '../../../src/core/random';

const gapsOf = (lane: RoadLane | RiverLane): number[] =>
  lane.movers.map((m, i) => (lane.movers[i + 1]?.offset ?? lane.cycle) - m.offset - m.len);
const lanesFor = (seeds: number, rows: number): Lane[] => Array.from({length: seeds}, (_, seed) => generate(initialState(seed), rows).lanes).flat();

describe('revision six: random traffic and logs', () => {
  it('is the revision new runs start on, and replays independently of batch sizes', () => {
    expect(createRun(3).worldVersion).toBe(6);
    expect(initialState(3).version).toBe(6);
    for (const seed of [0, 1, 11, 0xffffffff]) {
      const all = generate(initialState(seed), 300).lanes;
      let state = initialState(seed); const chunks: Lane[] = [];
      while (chunks.length < 300) { const next = generateChunk(state); state = next.state; chunks.push(...next.lanes); }
      expect(chunks).toEqual(all);
    }
  });

  it('mixes vehicle models and paints within lanes, with long irregular repeats that keep every crossing gap', () => {
    const roads = lanesFor(60, 300).filter((l): l is RoadLane => l.kind === 'road');
    let mixedModels = 0, mixedPaints = 0, withLorries = 0;
    for (const lane of roads) {
      expect(lane.style).toBeUndefined();
      expect(lane.movers.length).toBeGreaterThanOrEqual(6);
      expect(lane.movers.length).toBeLessThanOrEqual(14);
      // One repeat is wider than any view, so the pattern never visibly repeats.
      expect(lane.cycle).toBeGreaterThanOrEqual(36);
      for (const gap of gapsOf(lane)) expect(gap + 1e-9).toBeGreaterThanOrEqual(roadGapMin(lane.speed));
      for (const m of lane.movers) {
        expect([1.2, 1.8, 2, 3]).toContain(m.len);
        // Taxis are the only yellow cars; lorries keep their own palette.
        if (m.len < 2 && m.color === 2) expect(m.len).toBe(1.8);
      }
      if (new Set(lane.movers.map(m => m.len)).size > 1) mixedModels++;
      if (new Set(lane.movers.map(m => m.color)).size > 1) mixedPaints++;
      if (lane.movers.some(m => m.len >= 2)) withLorries++;
    }
    expect(mixedModels / roads.length).toBeGreaterThan(0.85);
    expect(mixedPaints / roads.length).toBeGreaterThan(0.85);
    expect(withLorries / roads.length).toBeGreaterThan(0.4);
    // Gaps range from tight convoys to long breathers rather than one even spacing.
    const spread = roads.map(l => { const g = gapsOf(l); return Math.max(...g) - Math.min(...g); });
    expect(spread.filter(s => s > 2).length / roads.length).toBeGreaterThan(0.7);
  });

  it('gives logs irregular lengths and gaps, bounded so a fixed column waits at most RIVER_WAIT for a log', () => {
    const rivers = lanesFor(60, 300).filter((l): l is RiverLane => l.kind === 'river');
    let mixedLengths = 0, wideGaps = 0;
    for (const lane of rivers) {
      expect(lane.movers.length).toBeGreaterThanOrEqual(5);
      expect(lane.cycle).toBeGreaterThan(14);
      const cap = Math.min(riverGapMax(lane.speed), logGapCap(difficulty(lane.row)));
      for (const gap of gapsOf(lane)) {
        expect(gap).toBeGreaterThanOrEqual(0.55 - 1e-9);
        expect(gap).toBeLessThanOrEqual(Math.max(0.55, cap) + 1e-9);
        if (gap > 1.2) wideGaps++;
        expect((gap - 2 * PLATFORM_GRACE) / lane.speed).toBeLessThanOrEqual(RIVER_WAIT + 1e-9);
      }
      for (const m of lane.movers) expect([2, 3, 4]).toContain(m.len);
      if (new Set(lane.movers.map(m => m.len)).size > 1) mixedLengths++;
    }
    expect(mixedLengths / rivers.length).toBeGreaterThan(0.8);
    expect(wideGaps).toBeGreaterThan(rivers.length);
  });

  it('adjacent log rows slide past each other, so a rider always reaches a landing on the next row within 3 s', () => {
    const rng = mulberry32(99);
    let pairs = 0;
    for (let seed = 0; seed < 120; seed++) {
      const lanes = generate(initialState(seed), 300).lanes;
      for (let r = 1; r < lanes.length; r++) {
        const a = lanes[r - 1], b = lanes[r];
        if (a.kind !== 'river' || b.kind !== 'river') continue;
        pairs++;
        expect(Math.abs(a.dir * a.speed - b.dir * b.speed)).toBeGreaterThanOrEqual(LOG_SLIP - 1e-9);
        for (let trial = 0; trial < 12; trial++) {
          // Board a random log of the lower row at a random time and spot, then wait on it (it carries the rider).
          let t = rng() * 40, x = rng() * 60 - 30;
          while (!platformAt(a, x, t)) x += 0.05;
          let waited = 0;
          while (!platformAt(b, x, t + HOP_TIME) && waited < 3) { t += 0.02; x += a.dir * a.speed * 0.02; waited += 0.02; }
          expect(waited, `seed ${seed} rows ${r - 1}/${r}`).toBeLessThan(3);
        }
      }
    }
    expect(pairs).toBeGreaterThan(100);
  });

  it('repeats far less often than revision five', () => {
    const mean = (version: 5 | 6): number => {
      const moving = Array.from({length: 40}, (_, seed) => generate(initialState(seed, version), 300).lanes).flat()
        .filter((l): l is RoadLane | RiverLane => l.kind === 'road' || l.kind === 'river');
      return moving.reduce((n, l) => n + l.cycle, 0) / moving.length;
    };
    expect(mean(6)).toBeGreaterThan(mean(5) * 2);
  });
});
