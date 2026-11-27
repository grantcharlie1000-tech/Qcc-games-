import type { FrameSnapshot } from './types';
import { EMPTY_FRAME } from './predicted-fps';

export interface FrameMeter extends FrameSnapshot {
  reset(): void;
  snapshot(): FrameSnapshot;
}

export function createMeter(): FrameMeter {
  const meter = {
    draws: 0,
    triangles: 0,
    fillPixels: 0,
    allocations: 0,
    animatedDom: 0,
    layoutReads: 0,
    gpuReadbacks: 0,
    reset() {
      meter.draws = meter.triangles = meter.fillPixels = meter.allocations = 0;
      meter.animatedDom = meter.layoutReads = meter.gpuReadbacks = 0;
    },
    snapshot(): FrameSnapshot {
      return {
        draws: meter.draws,
        triangles: meter.triangles,
        fillPixels: meter.fillPixels,
        allocations: meter.allocations,
        animatedDom: meter.animatedDom,
        layoutReads: meter.layoutReads,
        gpuReadbacks: meter.gpuReadbacks,
      };
    },
  };
  return meter;
}

interface Transform {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

function identity(): Transform {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function clone(t: Transform): Transform {
  return { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f };
}

/** A canvas whose 2D context counts draw calls and shaded pixels. No timers. */
export function countingCanvas(cssWidth: number, cssHeight: number): HTMLCanvasElement & { meter: FrameMeter } {
  const meter = createMeter();
  let width = Math.max(1, Math.round(cssWidth));
  let height = Math.max(1, Math.round(cssHeight));
  let transform = identity();
  const stack: Transform[] = [];
  const style: Record<string, unknown> = {};
  let minX = 0, minY = 0, maxX = 0, maxY = 0, pathOpen = false;
  let pathLen = 0, penX = 0, penY = 0;

  const device = (x: number, y: number) => ({
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f,
  });
  const scaleX = () => Math.hypot(transform.a, transform.b) || 1;
  const scaleY = () => Math.hypot(transform.c, transform.d) || 1;
  const clip = (pixels: number) => Math.min(Math.max(0, pixels), width * height);
  const resetPath = () => {
    pathOpen = true; pathLen = 0; minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
  };
  const plot = (x: number, y: number) => {
    const p = device(x, y);
    if (!pathOpen) resetPath();
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    const step = Math.hypot(p.x - penX, p.y - penY);
    if (Number.isFinite(step)) pathLen += step;
    penX = p.x; penY = p.y;
  };
  const pathArea = () => {
    if (!Number.isFinite(minX) || maxX < minX || maxY < minY) return 0;
    return clip((maxX - minX) * (maxY - minY));
  };

  const record = (pixels: number, triangles = 0) => {
    meter.draws += 1;
    meter.fillPixels += clip(pixels);
    meter.triangles += triangles;
  };

  const impl: Record<string, unknown> = {
    save() { stack.push(clone(transform)); },
    restore() { transform = stack.pop() ?? identity(); },
    setTransform(a: number | Transform, b = 0, c = 0, d = 1, e = 0, f = 0) {
      transform = typeof a === 'object' && a ? clone(a) : { a, b, c, d, e, f };
    },
    getTransform() { return clone(transform); },
    resetTransform() { transform = identity(); },
    translate(x: number, y: number) {
      transform.e += transform.a * x + transform.c * y;
      transform.f += transform.b * x + transform.d * y;
    },
    scale(x: number, y: number) {
      transform.a *= x; transform.b *= x; transform.c *= y; transform.d *= y;
    },
    rotate(rad: number) {
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const { a, b, c, d } = transform;
      transform.a = a * cos + c * sin; transform.b = b * cos + d * sin;
      transform.c = c * cos - a * sin; transform.d = d * cos - b * sin;
    },
    beginPath() { resetPath(); },
    closePath() {},
    moveTo(x: number, y: number) { plot(x, y); pathLen = 0; },
    lineTo(x: number, y: number) { plot(x, y); },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) { plot(cx, cy); plot(x, y); },
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
      plot(c1x, c1y); plot(c2x, c2y); plot(x, y);
    },
    arc(x: number, y: number, r: number) {
      plot(x - r, y - r); plot(x + r, y + r);
    },
    ellipse(x: number, y: number, rx: number, ry: number) {
      plot(x - rx, y - ry); plot(x + rx, y + ry);
    },
    rect(x: number, y: number, w: number, h: number) {
      plot(x, y); plot(x + w, y + h);
    },
    roundRect(x: number, y: number, w: number, h: number) { plot(x, y); plot(x + w, y + h); },
    fill() { record(pathArea(), 2); },
    stroke() {
      const width = Number(style.lineWidth) || 1;
      record(clip(pathLen * width * Math.max(scaleX(), scaleY())), 2);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      record(clip(Math.abs(w * h) * scaleX() * scaleY()), 2);
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      const width = Number(style.lineWidth) || 1;
      record(clip(2 * (Math.abs(w) + Math.abs(h)) * width * Math.max(scaleX(), scaleY())), 2);
    },
    clearRect(x: number, y: number, w: number, h: number) {
      record(clip(Math.abs(w * h) * scaleX() * scaleY()));
    },
    drawImage(image: { width?: number; height?: number }, dx: number, dy: number, dw?: number, dh?: number) {
      const w = dw ?? image?.width ?? 0;
      const h = dh ?? image?.height ?? 0;
      record(clip(Math.abs(w * h) * (dw === undefined ? scaleX() * scaleY() : 1)), 2);
    },
    fillText() { record(clip(32 * scaleX() * 16 * scaleY())); },
    strokeText() { record(clip(32 * scaleX() * 16 * scaleY())); },
    putImageData(_data: unknown, _x: number, _y: number, _dirtyX?: number, _dirtyY?: number, dirtyW?: number, dirtyH?: number) {
      record(clip((dirtyW ?? width) * (dirtyH ?? height)));
    },
    getImageData(_x: number, _y: number, w: number, h: number) {
      meter.gpuReadbacks += 1;
      meter.allocations += 1;
      return { data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h };
    },
    createImageData(w: number, h: number) {
      meter.allocations += 1;
      return { data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h };
    },
    createLinearGradient() { meter.allocations += 1; return { addColorStop() {} }; },
    createRadialGradient() { meter.allocations += 1; return { addColorStop() {} }; },
    createPattern() { return {}; },
    createConicGradient() { meter.allocations += 1; return { addColorStop() {} }; },
    measureText(text: string) { return { width: (text?.length ?? 0) * 8 }; },
    setLineDash() {},
    getLineDash() { return []; },
    clip() {},
    isPointInPath() { return false; },
    isPointInStroke() { return false; },
    drawFocusIfNeeded() {},
  };

  const ctx = new Proxy(impl, {
    get(target, prop) {
      if (typeof prop === 'string' && prop in style && !(prop in target)) return style[prop];
      const value = target[prop as string];
      if (value !== undefined) return value;
      if (prop === 'canvas') return canvas;
      return () => {};
    },
    set(_target, prop, value) {
      style[String(prop)] = value;
      return true;
    },
  });

  const canvas = {
    meter,
    style: {} as CSSStyleDeclaration,
    dataset: {} as DOMStringMap,
    get width() { return width; },
    set width(v: number) {
      const next = Math.max(0, Math.round(v));
      if (next !== width) meter.allocations += 1;
      width = next || 1;
    },
    get height() { return height; },
    set height(v: number) {
      const next = Math.max(0, Math.round(v));
      if (next !== height) meter.allocations += 1;
      height = next || 1;
    },
    clientWidth: cssWidth,
    clientHeight: cssHeight,
    getContext(kind: string) {
      return kind === '2d' ? ctx : null;
    },
    getBoundingClientRect() {
      meter.layoutReads += 1;
      return { x: 0, y: 0, left: 0, top: 0, right: cssWidth, bottom: cssHeight, width: cssWidth, height: cssHeight, toJSON() { return {}; } };
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
  };
  return canvas as unknown as HTMLCanvasElement & { meter: FrameMeter };
}

/** Counts visible meshes, lines, points, and sprites on a Three.js object. */
export function countThreeScene(root: { traverse: (fn: (object: unknown) => void) => void }): { draws: number; triangles: number } {
  let draws = 0, triangles = 0;
  root.traverse(object => {
    const mesh = object as {
      visible?: boolean;
      isMesh?: boolean;
      isInstancedMesh?: boolean;
      isSprite?: boolean;
      isPoints?: boolean;
      isLine?: boolean;
      count?: number;
      geometry?: { index?: { count: number } | null; getAttribute?: (name: string) => { count: number } | undefined };
    };
    if (mesh.visible === false) return;
    if (!mesh.isMesh && !mesh.isSprite && !mesh.isPoints && !mesh.isLine) return;
    const instances = mesh.isInstancedMesh ? (mesh.count ?? 0) : 1;
    if (instances <= 0) return;
    draws += 1;
    const index = mesh.geometry?.index?.count;
    const positions = mesh.geometry?.getAttribute?.('position')?.count ?? 0;
    const verts = index ?? positions;
    if (mesh.isMesh) triangles += (verts / 3) * instances;
  });
  return { draws, triangles: Math.round(triangles) };
}

/** Maps renderer stats from a real render() into a snapshot. Fill is the drawing buffer once. */
export function snapshotFromGlStats(
  stats: { calls: number; triangles: number; width?: number; height?: number },
  extra: Partial<FrameSnapshot> = {},
): FrameSnapshot {
  const width = stats.width ?? 0;
  const height = stats.height ?? 0;
  return {
    ...EMPTY_FRAME,
    draws: stats.calls,
    triangles: stats.triangles,
    fillPixels: Math.max(0, width * height) + (extra.fillPixels ?? 0),
    allocations: extra.allocations ?? 0,
    animatedDom: extra.animatedDom ?? 0,
    layoutReads: extra.layoutReads ?? 0,
    gpuReadbacks: extra.gpuReadbacks ?? 0,
  };
}

/**
 * Invokes the frame callback a mounted loop just queued. The timestamp is only
 * a driver so one step can run. Predicted fps must not be derived from it.
 */
export function driveQueuedFrame(arm: () => void, timestamp = 16.67): void {
  const previous = globalThis.requestAnimationFrame;
  // A box, not a narrowed let. Assigning the rAF parameter into a local
  // collapses that local to `never` under the DOM callback type.
  const queued: { current: FrameRequestCallback | null } = { current: null };
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    queued.current = callback;
    return 1;
  };
  try {
    arm();
    queued.current?.(timestamp);
  } finally {
    globalThis.requestAnimationFrame = previous;
  }
}

/** Minimal canvas object for a Three.js renderer constructor. */
export function glCanvas(cssWidth: number, cssHeight: number): HTMLCanvasElement {
  const canvas = {
    width: cssWidth,
    height: cssHeight,
    clientWidth: cssWidth,
    clientHeight: cssHeight,
    style: {} as CSSStyleDeclaration,
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    getContext() { return null; },
    getBoundingClientRect() {
      return { x: 0, y: 0, left: 0, top: 0, right: cssWidth, bottom: cssHeight, width: cssWidth, height: cssHeight, toJSON() { return {}; } };
    },
  };
  return canvas as unknown as HTMLCanvasElement;
}

/** Sum of element boxes produced by a real DOM render, in CSS pixels. */
export function domFillPixels(root: ParentNode): { fillPixels: number; nodes: number } {
  const elements = root.querySelectorAll?.('*');
  if (!elements) return { fillPixels: 0, nodes: 0 };
  let fill = 0, nodes = 0;
  elements.forEach(node => {
    const el = node as HTMLElement;
    const w = el.offsetWidth || Number(el.dataset?.paintW) || 0;
    const h = el.offsetHeight || Number(el.dataset?.paintH) || 0;
    if (w > 0 && h > 0) { fill += w * h; nodes += 1; }
  });
  return { fillPixels: fill, nodes };
}
