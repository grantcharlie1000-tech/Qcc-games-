/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';

// happy-dom has no Path2D and its canvas 2d context is null without node-canvas.
// Claimline, Iron Meridian, and Neon Coil touch both at module load, before the
// test body, so the platform stubs have to be hoisted.
vi.hoisted(() => {
  if (typeof globalThis.Path2D === 'undefined') {
    class Path2DPoly {
      constructor(_d?: string) {}
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
      roundRect() {}
    }
    globalThis.Path2D = Path2DPoly as unknown as typeof Path2D;
  }
  const proto = globalThis.HTMLCanvasElement?.prototype;
  if (!proto || (proto as { __floor2d?: boolean }).__floor2d) return;
  const readContext = proto.getContext as unknown as (
    this: HTMLCanvasElement,
    type: string,
    options?: unknown,
  ) => CanvasRenderingContext2D | null;
  function stub2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const style: Record<string, unknown> = {};
    const gradient = () => ({ addColorStop() {} });
    const impl: Record<string, unknown> = {
      canvas,
      save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      bezierCurveTo() {}, quadraticCurveTo() {}, arc() {}, arcTo() {}, ellipse() {},
      rect() {}, roundRect() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {},
      clearRect() {}, drawImage() {}, fillText() {}, strokeText() {}, clip() {},
      setLineDash() {}, getLineDash: () => [], translate() {}, rotate() {}, scale() {},
      setTransform() {}, resetTransform() {}, transform() {},
      createLinearGradient: gradient, createRadialGradient: gradient, createConicGradient: gradient,
      createPattern: () => ({}),
      measureText: (text: string) => ({ width: (text?.length ?? 0) * 8 }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h }),
      putImageData() {},
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h }),
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      isPointInPath: () => false,
      isPointInStroke: () => false,
    };
    return new Proxy(impl, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (typeof prop === 'string' && prop in style) return style[prop];
        return () => {};
      },
      set(_target, prop, value) {
        style[String(prop)] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  }
  proto.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
    if (type === '2d') {
      const real = readContext.call(this, type, options);
      if (real) return real;
      return stub2d(this);
    }
    return readContext.call(this, type, options);
  } as typeof proto.getContext;
  (proto as { __floor2d?: boolean }).__floor2d = true;
});
import type * as Three from 'three';
import { games } from '../../src/core/catalog';
import { GAME_IDS } from '../../src/core/types';
import { FLOOR_LAYOUTS } from '../../src/perf/floor';
import { predictFps } from '../../src/perf/predicted-fps';
import { allCollectors } from '../../src/perf/registry';
import type { SurfaceGroup } from '../../src/perf/types';

// Platform boundary only: replace the GPU context. Scene graphs, meshes, and
// simulations stay the real modules. Counts come from the mock's traverse of
// whatever the shipped render submitted, not from a clock.
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof Three>('three');
  class WebGLRenderer {
    readonly shadowMap = { enabled: false, type: 0 };
    readonly info = {
      autoReset: false,
      render: { calls: 0, triangles: 0, points: 0, lines: 0 },
      reset() {},
      memory: { geometries: 0, textures: 0 },
      programs: [] as unknown[],
    };
    readonly capabilities = { getMaxAnisotropy: () => 8, logarithmicDepthBuffer: false, isWebGL2: true };
    readonly extensions = { has: () => false, get: () => null };
    readonly debug = { checkShaderErrors: false, onShaderError() {} };
    readonly domElement: HTMLCanvasElement;
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    autoClear = true;
    private ratio = 1;
    constructor(options: { canvas?: HTMLCanvasElement } = {}) {
      this.domElement = options.canvas ?? ({ width: 1, height: 1 } as HTMLCanvasElement);
      return new Proxy(this, {
        get(target, prop, receiver) {
          if (prop === 'then') return undefined;
          const value = Reflect.get(target, prop, receiver);
          if (value !== undefined) return typeof value === 'function' ? value.bind(target) : value;
          return () => {};
        },
      });
    }
    setClearColor() {}
    setAnimationLoop() {}
    compile() {}
    dispose() {}
    forceContextLoss() {}
    getPixelRatio() { return this.ratio; }
    setPixelRatio(ratio: number) { this.ratio = ratio; }
    getSize() { return { width: this.domElement.width, height: this.domElement.height }; }
    getDrawingBufferSize(target?: { set?: (x: number, y: number) => void; x?: number; y?: number }) {
      const width = this.domElement.width, height = this.domElement.height;
      if (target?.set) target.set(width, height);
      else if (target) { target.x = width; target.y = height; }
      return { width, height };
    }
    getRenderTarget() { return null; }
    setRenderTarget() {}
    compileAsync() { return Promise.resolve(); }
    clear() {}
    clearDepth() {}
    setSize(width: number, height: number) {
      this.domElement.width = Math.max(1, Math.floor(width * this.ratio));
      this.domElement.height = Math.max(1, Math.floor(height * this.ratio));
    }
    setDrawingBufferSize(width: number, height: number, ratio: number) {
      this.ratio = ratio;
      this.domElement.width = Math.max(1, Math.floor(width * ratio));
      this.domElement.height = Math.max(1, Math.floor(height * ratio));
    }
    getContext() {
      return {
        getExtension: () => null,
        getParameter: () => 'mock-gpu',
        RENDERER: 0x1f01,
        drawingBufferWidth: this.domElement.width,
        drawingBufferHeight: this.domElement.height,
      };
    }
    render(scene: Three.Scene) {
      let calls = 0, triangles = 0;
      const geometries = new Set<unknown>();
      scene.traverse(object => {
        const mesh = object as Three.Mesh & { isInstancedMesh?: boolean; count?: number; isSprite?: boolean; isPoints?: boolean; isLine?: boolean };
        if (mesh.visible === false) return;
        if (!mesh.isMesh && !mesh.isSprite && !mesh.isPoints && !mesh.isLine) return;
        const count = mesh.isInstancedMesh ? (mesh.count ?? 0) : 1;
        if (count <= 0) return;
        calls += 1;
        const index = mesh.geometry?.index?.count;
        const positions = mesh.geometry?.getAttribute?.('position')?.count ?? 0;
        if (mesh.isMesh) triangles += ((index ?? positions) / 3) * count;
        if (mesh.geometry) geometries.add(mesh.geometry);
      });
      this.info.render.calls = calls;
      this.info.render.triangles = Math.round(triangles);
      this.info.memory.geometries = geometries.size;
    }
  }
  return { ...actual, WebGLRenderer };
});

const SHELLS = [
  'home', 'movies', 'tv', 'study', 'accounts', 'leaderboards', 'chat', 'social',
  'predictions', 'election', 'santa', 'downloads', 'festive', 'liquid-glass',
] as const;

const GROUPS: readonly SurfaceGroup[] = ['shell-glass', '2d-dom', 'three', 'heavy-sim', 'apps'];

test('catalog games are unchanged and each one has a floor-tier collector', () => {
  expect([...games.map(game => game.id)].sort()).toEqual([...GAME_IDS].sort());
  const ids = allCollectors().map(collector => collector.id);
  for (const id of [...GAME_IDS, ...SHELLS]) expect(ids, id).toContain(id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('every surface predicts at least 60 at both floor layouts', () => {
  // Asset loaders must fail closed. A live socket to the dev server is not a frame cost,
  // and an unhandled network error is not a predicted-fps result.
  // Loaders that miss a catch must not reject the run. A settled 404 is an unhandled
  // rejection; a request that never completes is just absent art, which the games already fall back from.
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  const xhr = globalThis.XMLHttpRequest?.prototype;
  if (xhr) xhr.send = function send() {};
  const rows: { id: string; group: string; css: string; fps: number; draws: number; triangles: number }[] = [];
  const failures: string[] = [];
  for (const collector of allCollectors()) {
    expect(GROUPS, collector.id).toContain(collector.group);
    for (const layout of FLOOR_LAYOUTS) {
      const label = `${collector.id} ${layout.cssWidth}x${layout.cssHeight}`;
      try {
        const snap = collector.collect(layout);
        const fps = predictFps(snap);
        const painted = snap.draws + snap.triangles + snap.fillPixels + snap.animatedDom + snap.allocations;
        const detail = `${label} fps=${fps.toFixed(1)} draws=${snap.draws} tris=${snap.triangles} fill=${snap.fillPixels} dom=${snap.animatedDom} alloc=${snap.allocations} reads=${snap.layoutReads} readback=${snap.gpuReadbacks}`;
        if (painted <= 0) failures.push(`${detail} measured nothing`);
        else if (fps < 60) failures.push(detail);
        else rows.push({
          id: collector.id,
          group: collector.group,
          css: `${layout.cssWidth}x${layout.cssHeight}`,
          fps: Math.round(fps * 10) / 10,
          draws: snap.draws,
          triangles: snap.triangles,
        });
      } catch (error) {
        failures.push(`${label} threw ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      }
    }
  }
  console.log(`PREDICTED_FPS ${JSON.stringify(rows)}`);
  expect(failures, failures.join('\n')).toEqual([]);
  const groups = new Set(rows.map(row => row.group));
  for (const group of GROUPS) expect(groups, group).toContain(group);
});

test('the surface gate does not sample frame timers', () => {
  const body = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const frameClock = ['requestAnimation', 'Frame('].join('');
  const wallClock = ['performance', '.now()'].join('');
  expect(body.includes(frameClock)).toBe(false);
  expect(body.includes(wallClock)).toBe(false);
});
