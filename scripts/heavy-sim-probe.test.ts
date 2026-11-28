/** @vitest-environment happy-dom */
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { countingCanvas } from '../src/perf/measure';
import { predictFps as fps } from '../src/perf/predicted-fps';
import { floorBufferSize } from '../src/perf/floor';
import { createBake } from '../src/games/breachline/lightbake';
import { buildLevel } from '../src/games/breachline/levelmesh';
import { MAP } from '../src/games/breachline/map';
import { type TexId } from '../src/games/breachline/textures';
import { createRun, step } from '../src/games/last-light/model';
import { Scene } from '../src/games/last-light/render';
import { LEVELS } from '../src/games/last-light/levels';
import { createCampaign, startCampaign } from '../src/games/iron-meridian/model';
import { createRenderer } from '../src/games/iron-meridian/render';
import { PROVINCES } from '../src/games/iron-meridian/map-data';
import { CS } from '../src/games/blockcraft/engine/constants';
import { createTerrain } from '../src/games/blockcraft/world/terrain';
import { createLightEngine } from '../src/games/blockcraft/world/light';
import { createMesher } from '../src/games/blockcraft/render/mesher';
import { VoxelWorld } from '../src/games/blockcraft/world/world';

function stub2d(canvas: HTMLCanvasElement) {
  const style: Record<string, unknown> = {};
  const fn = () => {};
  const grad = { addColorStop() {} };
  return new Proxy(style, {
    get(_t, prop) {
      if (prop === 'canvas') return canvas;
      if (prop in style) return style[String(prop)];
      if (prop === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createConicGradient') return () => grad;
      if (prop === 'createPattern') return () => ({});
      if (prop === 'measureText') return (text: string) => ({ width: (text?.length ?? 0) * 8 });
      return fn;
    },
    set(_t, prop, value) { style[String(prop)] = value; return true; },
  });
}

test('probe costs', () => {
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: (k: string) => unknown };
  const orig = proto.getContext;
  proto.getContext = function (kind: string) {
    const got = orig.call(this, kind);
    return got ?? (kind === '2d' ? stub2d(this) : null);
  };
  const bake = createBake();
  const ids: TexId[] = ['brick','cinder','drywall','core','planks','plate','concrete','precast','trim','wood','crate','container','paint','glass','rack','shelf','steel','counter','fabric','rubber','asphalt','grass','slab','line','tile','lino','carpet','floorboards','raised','check','ceiling','lamp','roof'];
  const materials = {} as Record<TexId, THREE.Material>;
  for (const id of ids) materials[id] = new THREE.MeshBasicMaterial();
  const level = buildLevel(bake, materials);
  let draws = 0;
  level.group.traverse(o => { if ((o as THREE.Mesh).isMesh) draws++; });
  console.log('BREACH', JSON.stringify({ tris: level.triangles, draws, panels: MAP.panels?.length, rooms: MAP.rooms?.length }));

  const layout = { cssWidth: 1280, cssHeight: 720, dpr: 1 as const };
  const buf = floorBufferSize(layout.cssWidth, layout.cssHeight, 1);
  try {
  const canvas = countingCanvas(buf.width, buf.height);
  const scene = new Scene(canvas);
  scene.resize(layout.cssWidth, layout.cssHeight);
  const run = createRun();
  run.phase = 'playing';
  let best = 0, bestStage = 0;
  for (const level of LEVELS) {
    const enemies = level.enemies?.length ?? 0;
    const props = level.platforms.length + (level.hazards?.length ?? 0) + (level.stations?.length ?? 0);
    const score = enemies * 10 + props;
    if (score > best) { best = score; bestStage = level.id; }
  }
  run.stage = bestStage;
  const spawn = LEVELS[bestStage].spawn;
  run.x = spawn.x; run.y = spawn.y;
  step(run, { move: 0, jump: false, dash: false });
  scene.draw(run, false);
  const snap = canvas.meter.snapshot();
  console.log('LAST', JSON.stringify({ stage: bestStage, enemies: LEVELS[bestStage].enemies?.length, platforms: LEVELS[bestStage].platforms.length, snap, fps: fps(snap), buf }));

  const phone = floorBufferSize(390, 844, 1);
  const canvas2 = countingCanvas(phone.width, phone.height);
  const scene2 = new Scene(canvas2);
  scene2.resize(390, 844);
  scene2.draw(run, false);
  const snap2 = canvas2.meter.snapshot();
  console.log('LASTPHONE', JSON.stringify({ snap: snap2, fps: fps(snap2) }));
  } catch (err) { console.log('LAST_ERR', err); }

  try {
  if (typeof globalThis.Path2D === 'undefined') {
    class P { constructor(_d?: string) {} addPath() {} closePath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} arc() {} rect() {} }
    (globalThis as unknown as { Path2D: unknown }).Path2D = P;
  }
  const ic = countingCanvas(buf.width, buf.height);
  const ir = createRenderer(ic);
  ir.resize(layout.cssWidth, layout.cssHeight, buf.dpr);
  const camp = createCampaign(0);
  startCampaign(camp);
  ir.draw(camp, { selected: 0, units: [], mode: 'political', zoom: 0.4, panX: 40, panY: 20 });
  const isnap = ic.meter.snapshot();
  console.log('IRON', JSON.stringify({ provinces: PROVINCES.length, divisions: camp.divisions.length, snap: isnap, fps: fps(isnap) }));
  } catch (err) { console.log('IRON_ERR', err); }

  try {
  const terrain = createTerrain(0x51ab1e);
  const world = new VoxelWorld({ on() { return () => {}; }, emit() {} } as never, (x, z) => terrain.biomeAt(x, z));
  const light = createLightEngine();
  const mesher = createMesher();
  const view = 2;
  const t0 = Date.now();
  for (let dz = -(view + 1); dz <= view + 1; dz++) for (let dx = -(view + 1); dx <= view + 1; dx++) {
    world.insert(dx, dz, terrain.generate(dx, dz));
  }
  let chunkDraws = 0, tris = 0, meshed = 0;
  const neighbours = new Array(9).fill(null);
  const lightBuffer = new Uint8Array((16 + 2) * (16 + 2) * (128 + 2));
  for (let dz = -view; dz <= view; dz++) for (let dx = -view; dx <= view; dx++) {
    if (dx * dx + dz * dz > view * view) continue;
    let i = 0;
    for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++, i++) neighbours[i] = world.chunk(dx + nx, dz + nz) ?? null;
    light.computePadded(neighbours, lightBuffer);
    const mesh = mesher.meshChunk(neighbours, lightBuffer);
    meshed++;
    for (const part of [mesh.opaque, mesh.cutout, mesh.translucent]) {
      if (part && part.quads) { chunkDraws++; tris += part.quads * 2; }
    }
  }
  console.log('BLOCK', JSON.stringify({ view, meshed, chunkDraws, tris, ms: Date.now() - t0, fps: fps({ draws: chunkDraws + 6, triangles: tris, fillPixels: buf.width * buf.height, allocations: 0, animatedDom: 0, layoutReads: 0, gpuReadbacks: 0 }) }));
  } catch (err) { console.log('BLOCK_ERR', err); }
  expect(true).toBe(true);
}, 180000);
