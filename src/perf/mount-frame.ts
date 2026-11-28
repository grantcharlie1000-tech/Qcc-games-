import type { GameContext, GameId, GameInstance, GameModule } from '../core/types';
import { fillOf, paintBox } from './app-frame';
import { createMeter, type FrameMeter } from './measure';
import type { FrameSnapshot, Layout } from './types';

export function stubContext(id: GameId): GameContext {
  return {
    id,
    settings: { sound: false, reducedMotion: false, reducedTransparency: false, colorBlind: false, autoNextEpisode: false },
    highScore: 0,
    setScore() {},
    setLevel() {},
    setStatus() {},
    announce() {},
    save() {},
    sound() {},
  };
}

const DRAW = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText', 'putImageData']);

interface PathBox { minX: number; minY: number; maxX: number; maxY: number; len: number }
const paths = new WeakMap<CanvasRenderingContext2D, PathBox>();

function pathOf(ctx: CanvasRenderingContext2D): PathBox {
  let box = paths.get(ctx);
  if (!box) {
    box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, len: 0 };
    paths.set(ctx, box);
  }
  return box;
}

function resetPath(ctx: CanvasRenderingContext2D): void {
  paths.set(ctx, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, len: 0 });
}

function plot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const box = pathOf(ctx);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    box.minX = Math.min(box.minX, x); box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x); box.maxY = Math.max(box.maxY, y);
    box.len += 1;
  }
}

/** Boxes the real DOM produced. Static tiles are fill, not animated nodes. */
export function paintProduced(root: HTMLElement, layout: Layout): number {
  paintBox(root, layout.cssWidth, layout.cssHeight);
  root.querySelectorAll('*').forEach(el => {
    const node = el as HTMLElement;
    const wAttr = Number(node.getAttribute('width'));
    const hAttr = Number(node.getAttribute('height'));
    const tag = node.tagName;
    if (wAttr > 0 && hAttr > 0) paintBox(node, Math.min(wAttr, layout.cssWidth), Math.min(hAttr, layout.cssHeight));
    else if (tag === 'CANVAS') paintBox(node, layout.cssWidth, Math.min(layout.cssHeight, Math.max(layout.cssWidth, 1)));
    else if (tag === 'IMG') paintBox(node, Math.min(320, layout.cssWidth), Math.min(400, layout.cssHeight));
    else if (tag === 'SVG' || tag === 'PATH' || tag === 'POLYLINE' || tag === 'POLYGON' || tag === 'LINE' || tag === 'CIRCLE' || tag === 'RECT' || tag === 'G') paintBox(node, 12, 12);
    else paintBox(node, Math.min(220, layout.cssWidth), 18);
  });
  return fillOf(root);
}

export interface FrameSession {
  meter: FrameMeter;
  /** True when at least one animation frame callback is currently queued. */
  hasQueued(): boolean;
  /** Runs one queued animation frame. The timestamp only drives the step. */
  drive(timestamp?: number): boolean;
  restore(): void;
}

/** Counts 2D draws on canvases created while the session is open. WebGL2 can be stubbed for glass. */
export function openSession(webgl2?: (meter: FrameMeter) => unknown): FrameSession {
  const meter = createMeter();
  const restores: Array<() => void> = [];
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id: number) => { queue.delete(id); };
  restores.push(() => {
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCancel;
  });

  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    meter.layoutReads += 1;
    const box = rect.call(this);
    if (box.width > 0 && box.height > 0) return box;
    const el = this as HTMLElement;
    const w = parseFloat(el.style?.width || '') || Number(el.dataset?.paintW) || 0;
    const h = parseFloat(el.style?.height || '') || Number(el.dataset?.paintH) || 0;
    if (w > 0 && h > 0) return new DOMRect(0, 0, w, h);
    return box;
  };
  restores.push(() => { Element.prototype.getBoundingClientRect = rect; });

  const hookSize = (name: 'offsetWidth' | 'offsetHeight', axis: 'width' | 'height') => {
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
    if (!desc?.get || !desc.configurable) return;
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        meter.layoutReads += 1;
        const native = Number(desc.get!.call(this));
        if (native > 0) return native;
        const el = this as HTMLElement;
        const parsed = parseFloat(el.style?.[axis] || '');
        if (parsed > 0) return parsed;
        const painted = Number(el.dataset?.[axis === 'width' ? 'paintW' : 'paintH']);
        return painted > 0 ? painted : native;
      },
    });
    restores.push(() => Object.defineProperty(HTMLElement.prototype, name, desc));
  };
  const hookClient = (name: 'clientWidth' | 'clientHeight', axis: 'width' | 'height') => {
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)
      ?? Object.getOwnPropertyDescriptor(Element.prototype, name);
    if (!desc?.get || !desc.configurable) return;
    const owner = Object.prototype.hasOwnProperty.call(HTMLElement.prototype, name) ? HTMLElement.prototype : Element.prototype;
    Object.defineProperty(owner, name, {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        meter.layoutReads += 1;
        const native = Number(desc.get!.call(this));
        if (native > 0) return native;
        const el = this as HTMLElement;
        const parsed = parseFloat(el.style?.[axis] || '');
        if (parsed > 0) return parsed;
        if (el.tagName === 'CANVAS') {
          const attr = Number(el.getAttribute(axis));
          if (attr > 0) return attr;
        }
        let parent = el.parentElement;
        while (parent) {
          const fromStyle = parseFloat(parent.style?.[axis] || '');
          if (fromStyle > 0) return fromStyle;
          parent = parent.parentElement;
        }
        return native;
      },
    });
    restores.push(() => Object.defineProperty(owner, name, desc));
  };
  hookSize('offsetWidth', 'width');
  hookSize('offsetHeight', 'height');
  hookClient('clientWidth', 'width');
  hookClient('clientHeight', 'height');

  const proto = HTMLCanvasElement.prototype;
  const origGet = proto.getContext;
  // `.call` on the overloaded getContext resolves to one overload (WebGPU's
  // single-argument form). Read through one signature instead.
  const readContext = origGet as unknown as (
    this: HTMLCanvasElement,
    type: string,
    options?: unknown,
  ) => CanvasRenderingContext2D | null;
  proto.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
    if (type === 'webgl2' && webgl2) return webgl2(meter) as CanvasRenderingContext2D;
    if (type !== '2d') return readContext.call(this, type, options);
    const real = readContext.call(this, '2d', options);
    if (!real) return real;
    return wrap2d(real, meter);
  } as typeof proto.getContext;
  restores.push(() => { proto.getContext = origGet; });

  for (const name of ['width', 'height'] as const) {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc?.get || !desc.set || !desc.configurable) continue;
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get!.call(this); },
      set(value: number) {
        const prev = Number(desc.get!.call(this));
        desc.set!.call(this, value);
        if (Number(desc.get!.call(this)) !== prev) meter.allocations += 1;
      },
    });
    restores.push(() => Object.defineProperty(proto, name, desc));
  }

  let clock = 0;
  return {
    meter,
    hasQueued() {
      return queue.size > 0;
    },
    drive(timestamp?: number) {
      if (!queue.size) return false;
      const id = Math.max(...queue.keys());
      const callback = queue.get(id);
      queue.clear();
      clock = timestamp ?? clock + 16.67;
      callback?.(clock);
      return true;
    },
    restore() {
      for (const restore of restores.reverse()) restore();
    },
  };
}

function clip(canvas: HTMLCanvasElement, pixels: number): number {
  const cap = Math.max(1, canvas.width * canvas.height);
  return Math.min(cap, Math.max(0, pixels));
}

function wrap2d(real: CanvasRenderingContext2D, meter: FrameMeter): CanvasRenderingContext2D {
  const canvas = real.canvas;
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'canvas') return canvas;
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const name = String(prop);
      return (...args: unknown[]) => {
        if (name === 'beginPath') resetPath(target);
        else if (name === 'moveTo' || name === 'lineTo') plot(target, Number(args[0]), Number(args[1]));
        else if (name === 'rect' || name === 'roundRect') { plot(target, Number(args[0]), Number(args[1])); plot(target, Number(args[0]) + Number(args[2]), Number(args[1]) + Number(args[3])); }
        else if (name === 'arc' || name === 'ellipse') {
          const rx = Number(args[2]) || 0, ry = name === 'ellipse' ? Number(args[3]) || 0 : rx;
          plot(target, Number(args[0]) - rx, Number(args[1]) - ry);
          plot(target, Number(args[0]) + rx, Number(args[1]) + ry);
        } else if (name === 'quadraticCurveTo') { plot(target, Number(args[0]), Number(args[1])); plot(target, Number(args[2]), Number(args[3])); }
        else if (name === 'bezierCurveTo') { plot(target, Number(args[0]), Number(args[1])); plot(target, Number(args[2]), Number(args[3])); plot(target, Number(args[4]), Number(args[5])); }
        if (DRAW.has(name)) {
          meter.draws += 1;
          meter.fillPixels += shaded(name, args, target, canvas);
        } else if (name === 'getImageData') {
          meter.gpuReadbacks += 1;
          meter.allocations += 1;
        } else if (name === 'createLinearGradient' || name === 'createRadialGradient' || name === 'createConicGradient' || name === 'createImageData') meter.allocations += 1;
        try { return value.apply(target, args); }
        catch (error) {
          if (name === 'getImageData') {
            const w = Math.max(1, Number(args[2]) || 1), h = Math.max(1, Number(args[3]) || 1);
            return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
          }
          if (name === 'drawImage') return undefined;
          throw error;
        }
      };
    },
  });
}

function shaded(name: string, args: unknown[], ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): number {
  if (name === 'fillRect' || name === 'strokeRect' || name === 'clearRect') return clip(canvas, Math.abs(Number(args[2]) * Number(args[3])));
  if (name === 'drawImage') {
    if (args.length >= 9) return clip(canvas, Math.abs(Number(args[7]) * Number(args[8])));
    if (args.length >= 5) return clip(canvas, Math.abs(Number(args[3]) * Number(args[4])));
    const image = args[0] as { width?: number; height?: number } | undefined;
    return clip(canvas, Math.abs((image?.width ?? canvas.width) * (image?.height ?? canvas.height)));
  }
  if (name === 'fill' || name === 'stroke') {
    const box = pathOf(ctx);
    if (!Number.isFinite(box.minX) || box.maxX < box.minX) return clip(canvas, 16);
    const area = (box.maxX - box.minX) * (box.maxY - box.minY);
    return clip(canvas, name === 'stroke' ? Math.max(area, box.len * (Number(ctx.lineWidth) || 1)) : area);
  }
  if (name === 'fillText' || name === 'strokeText') return clip(canvas, 32 * 16);
  if (name === 'putImageData') return clip(canvas, canvas.width * canvas.height);
  return 0;
}

/** Mounts the shipped module, applies a heavy in-play setup, and scores one steady frame plus the DOM it painted. */
export function collectMounted(module: GameModule, layout: Layout, heavy?: (host: HTMLElement, instance: GameInstance) => void): FrameSnapshot {
  const session = openSession();
  const host = document.createElement('div');
  host.style.width = `${layout.cssWidth}px`;
  host.style.height = `${layout.cssHeight}px`;
  document.body.append(host);
  let instance: GameInstance | undefined;
  try {
    const mounted = module.mount(host, stubContext(module.id));
    if (mounted instanceof Promise) throw new Error(`${module.id} mount is async`);
    instance = mounted;
    // The heavy hook is the in-play frame. Drop the mount's menu paint, and keep
    // one-time sprite bakes that already ran, out of this snapshot.
    if (heavy) session.meter.reset();
    heavy?.(host, instance);
    const sync = session.meter.snapshot();
    session.meter.reset();
    const ranFirst = session.drive(16.67);
    let frame = session.meter.snapshot();
    // Many loops set `last = now` on the first callback and only step dt > 0 on
    // the second. When another frame is queued, score that steady second frame.
    if (ranFirst && session.hasQueued()) {
      session.meter.reset();
      session.drive(33.34);
      const steady = session.meter.snapshot();
      if (steady.draws + steady.fillPixels + steady.triangles > 0) frame = steady;
    }
    const painted = frame.draws + frame.fillPixels + frame.triangles;
    const snap = ranFirst && painted > 0 ? frame : sync;
    snap.fillPixels += paintProduced(host, layout);
    return snap;
  } finally {
    try { instance?.dispose(); } catch { /* The steady frame is already snapshotted. */ }
    host.remove();
    session.restore();
  }
}
