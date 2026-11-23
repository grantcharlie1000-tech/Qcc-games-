import {describe, expect, it} from 'vitest';
import type {BufferGeometry} from 'three';
import {generate, initialState} from '../../../src/games/crossy-road/generator';
import {forEachMover, forEachTrain, moverCopy, trainCopy, vehicleHit} from '../../../src/games/crossy-road/lanes';
import {corridor, obstacleAt} from '../../../src/games/crossy-road/terrain';
import {
  CAR_MODELS, FIRE, PLOUGH, PROP, TRUCK_MODELS, carLength, carModel, mix, propAt, trainKind, truckModel, wagonAt,
} from '../../../src/games/crossy-road/variety';
import {carGeometry, trainGeometry, truckGeometry} from '../../../src/games/crossy-road/models';
import {bushGeometry, crystalGeometry, decoratedTreeGeometry, giftsGeometry, lampPostGeometry, logPileGeometry, pineGeometry, snowmanGeometry} from '../../../src/games/crossy-road/props';
import {ROW_DEPTH, TRAIN_SCALE, VEHICLE_SCALE, roadGapMin, type GrassLane, type RailLane, type RoadLane} from '../../../src/games/crossy-road/config';

const bounds = (g: BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox!; };

describe('a vehicle keeps one look while it drives', () => {
  const lane: RoadLane = {kind: 'road', row: 3, dir: -1, speed: 2.5, vehicle: 'car', cycle: 20, phase: 3, movers: [{offset: 0, len: 1.8, color: 0}, {offset: 9, len: 3, color: 1}]};
  it('gives each copy of a mover its own number, and the number follows the copy over time', () => {
    const seen = new Map<string, number>();
    for (let t = 0; t < 40; t += 0.37) {
      const ids = new Set<number>();
      forEachMover(lane, t, -30, 50, (x0, _x1, mover, index) => {
        const copy = moverCopy(lane, mover, x0, t);
        if (index === 0) { expect(ids.has(copy)).toBe(false); ids.add(copy); }
        // Where this copy was at t = 0 does not change as it drives.
        const home = `${index}:${Math.round((x0 + lane.speed * t) * 1000)}`;
        if (seen.has(home)) expect(copy).toBe(seen.get(home)); else seen.set(home, copy);
      });
      expect(ids.size).toBeGreaterThan(2);
    }
  });
  it('does the same for the trains on a track', () => {
    const rail: RailLane = {kind: 'rail', row: 9, dir: 1, speed: 18, length: 14, period: 6, phase: 1.5, color: 2};
    const seen = new Map<number, number>();
    for (let t = 0; t < 30; t += 0.21) forEachTrain(rail, t, -200, 200, x0 => {
      const copy = trainCopy(rail, x0, t), home = Math.round((x0 - rail.speed * t) * 100);
      if (seen.has(home)) expect(copy).toBe(seen.get(home)); else seen.set(home, copy);
    });
    expect(new Set(seen.values()).size).toBe(seen.size);
  });
});

describe('looks', () => {
  it('uses every car, lorry, train and wagon model, and keeps the special cases', () => {
    const cars = new Set<number>(), trucks = new Set<number>(), longTrucks = new Set<number>(), trains = new Set<number>(), wagons = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const h = mix(i, 7, 3), small = carModel(1.2, false, h), big = carModel(1.8, false, h);
      expect(carLength(CAR_MODELS[small])).toBe(1.2);
      expect(carLength(CAR_MODELS[big])).toBe(1.8);
      expect(CAR_MODELS[big]).not.toBe('taxi');
      expect(CAR_MODELS[carModel(1.8, true, h)]).toBe('taxi');
      cars.add(small).add(big);
      trucks.add(truckModel(false, h));
      const long = truckModel(true, h);
      expect(long === FIRE || long === PLOUGH).toBe(false);
      longTrucks.add(long);
      const kind = trainKind(h);
      trains.add(kind);
      for (let w = 0; w < 6; w++) wagons.add(wagonAt(kind, w, mix(h, w)));
      // A steam locomotive pulls its tender first.
      expect(wagonAt(2, 0, h)).toBe(5);
    }
    expect(cars.size).toBe(CAR_MODELS.length - 1);
    expect(trucks.size).toBe(TRUCK_MODELS.length);
    expect(longTrucks.size).toBe(TRUCK_MODELS.length - 2);
    expect(trains.size).toBe(3);
    expect(wagons.size).toBe(6);
  });
  it('keeps a stump a stump, shows every scenery model, and keeps snowmen rare', () => {
    const seen = new Map<number, number>();
    for (let h = 0; h < 6000; h++) {
      expect(propAt('tree', 3, mix(h, 1))).toBe(PROP.stump);
      for (const i of [propAt('tree', h % 3, mix(h, 2)), propAt('rock', h % 3, mix(h, 3))]) seen.set(i, (seen.get(i) ?? 0) + 1);
    }
    seen.set(PROP.stump, 1);
    expect([...seen.keys()].sort((a, b) => a - b)).toEqual(Array.from({length: 16}, (_, i) => i));
    expect(seen.get(PROP.snowman)! / 6000).toBeLessThan(0.08);
  });
});

describe('larger models still fit their row', () => {
  it('every car, lorry and train piece stays inside the depth of its row at the size it is drawn', () => {
    const train = trainGeometry();
    const check = (g: BufferGeometry, scale: number, centre: number): void => {
      const b = bounds(g);
      expect(centre + b.max.z * scale).toBeLessThan(ROW_DEPTH / 2);
      expect(centre - b.max.z * scale).toBeGreaterThan(-ROW_DEPTH / 2);
      expect(-b.min.z).toBeCloseTo(b.max.z, 5);
      g.dispose();
    };
    for (const model of CAR_MODELS) { const car = carGeometry(model); for (const g of [car.body, car.detail]) check(g, VEHICLE_SCALE, ROW_DEPTH / 2 - 0.02 - 0.35 * VEHICLE_SCALE); }
    for (const model of TRUCK_MODELS) for (const len of [2, 3] as const) { const truck = truckGeometry(len, model); for (const g of [truck.body, truck.detail]) check(g, VEHICLE_SCALE, ROW_DEPTH / 2 - 0.02 - 0.3 * VEHICLE_SCALE); }
    for (const piece of Object.values(train)) for (const g of [piece.body, piece.detail]) check(g, TRAIN_SCALE, 0.2);
  });
  it('every road vehicle model is as long as its collision span, and train pieces are two tiles with couplers', () => {
    for (const model of CAR_MODELS) {
      const car = carGeometry(model), b = [bounds(car.body), bounds(car.detail)];
      expect(Math.max(b[0].max.x, b[1].max.x) - Math.min(b[0].min.x, b[1].min.x)).toBeCloseTo(carLength(model), 2);
    }
    for (const model of TRUCK_MODELS) for (const len of [2, 3] as const) {
      const truck = truckGeometry(len, model), b = [bounds(truck.body), bounds(truck.detail)];
      expect(Math.max(b[0].max.x, b[1].max.x) - Math.min(b[0].min.x, b[1].min.x)).toBeLessThanOrEqual(len + 1e-6);
      expect(Math.max(b[0].max.y, b[1].max.y)).toBeLessThanOrEqual(0.96 * 0.79 + 1e-6);
    }
    for (const piece of Object.values(trainGeometry())) for (const g of [piece.body, piece.detail]) expect(bounds(g).max.x - bounds(g).min.x).toBeLessThanOrEqual(2.03);
  });
  it('scenery stands on the ground inside one tile', () => {
    for (const g of [pineGeometry(false), pineGeometry(true), decoratedTreeGeometry(), snowmanGeometry(), lampPostGeometry(), bushGeometry(), logPileGeometry(), giftsGeometry(), crystalGeometry()]) {
      const b = bounds(g);
      expect(b.min.y).toBeCloseTo(0, 5);
      expect(b.max.x - b.min.x).toBeLessThanOrEqual(1);
      expect(b.max.z - b.min.z).toBeLessThanOrEqual(1);
      g.dispose();
    }
  });
});

describe('revision seven: fuller ground and larger traffic', () => {
  const grassOf = (seed: number, version: 6 | 7): GrassLane[] => generate(initialState(seed, version), 200).lanes.filter((l): l is GrassLane => l.kind === 'grass' && l.row >= 5);
  it('blocks far more ground than revision six, from the first rows on', () => {
    const blocked = (version: 6 | 7): number => {
      let n = 0, cells = 0;
      for (let seed = 0; seed < 30; seed++) for (const lane of grassOf(seed, version)) for (let c = -20; c < 30; c++) { cells++; if (obstacleAt(lane, c) !== null) n++; }
      return n / cells;
    };
    expect(blocked(6)).toBeLessThan(0.12);
    expect(blocked(7)).toBeGreaterThan(0.2);
  });
  it('puts scenery on a bank only where the player can walk round it', () => {
    let below = 0, above = 0;
    for (let seed = 0; seed < 40; seed++) {
      const lanes = generate(initialState(seed, 7), 300).lanes;
      for (const lane of lanes) {
        if (lane.kind !== 'grass' || !lane.clearing) continue;
        const next = lanes[lane.row + 1];
        for (let c = -24; c < 32; c++) {
          if (obstacleAt(lane, c) === null) continue;
          if (lane.detour === 'below') { below++; expect(lanes[lane.row - 1].kind).toBe('road'); continue; }
          // Otherwise the three cells of the next grass row over the obstacle are open.
          above++;
          expect(lane.detour).toBe('above');
          expect(next?.kind).toBe('grass');
          for (let d = -1; d <= 1; d++) expect(obstacleAt(next as GrassLane, c + d), `${seed}:${lane.row}:${c}`).toBeNull();
        }
      }
    }
    expect(below).toBeGreaterThan(100);
    expect(above).toBeGreaterThan(100);
  });
  it('keeps both corridor columns open on every row and the stored band equal to the seeded terrain', () => {
    for (let seed = 0; seed < 30; seed++) for (const lane of grassOf(seed, 7)) {
      expect(lane.dense).toBe(true);
      for (let c = -24; c < 32; c++) {
        if (corridor(seed, c)) expect(obstacleAt(lane, c), `${seed}:${lane.row}:${c}`).toBeNull();
        if (c >= 0 && c < 9) expect(lane.blocked[c]).toBe(obstacleAt(lane, c) !== null);
      }
    }
  });
  it('makes every vehicle larger and still leaves the crossing gap', () => {
    for (let seed = 0; seed < 40; seed++) for (const lane of generate(initialState(seed, 7), 300).lanes) {
      if (lane.kind !== 'road') continue;
      expect(lane.scale).toBe(VEHICLE_SCALE);
      lane.movers.forEach((mover, i) => {
        expect([1.2, 1.8, 2, 3].map(l => l * VEHICLE_SCALE)).toContain(mover.len);
        const gap = (lane.movers[i + 1]?.offset ?? lane.cycle) - mover.offset - mover.len;
        expect(gap + 1e-9).toBeGreaterThanOrEqual(roadGapMin(lane.speed));
      });
    }
  });
  it('a larger vehicle hits across its whole drawn length', () => {
    const lane: RoadLane = {kind: 'road', row: 1, dir: 1, speed: 0, vehicle: 'truck', cycle: 40, phase: 0, movers: [{offset: 10, len: 3 * VEHICLE_SCALE, color: 0}], scale: VEHICLE_SCALE};
    expect(vehicleHit(lane, 10.2, 0)).toBe(true);
    expect(vehicleHit(lane, 10 + 3 * VEHICLE_SCALE - 0.2, 0)).toBe(true);
    expect(vehicleHit(lane, 10 + 3 * VEHICLE_SCALE + 0.5, 0)).toBe(false);
  });
});
