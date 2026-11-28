import { provinceAtPixel } from './native/world-data';
import { floorDpr, floorTierActive } from '../../perf/floor';
import type { AuthoredState, ProvinceDefinition, RawWorldData } from './native/world-data';

/** Device ratio after the floor pixel cap. Off the floor tier, the display ratio is unchanged. */
export function nativeMapPixelRatio(viewWidth: number, viewHeight: number, deviceRatio = window.devicePixelRatio || 1): number {
  const device = deviceRatio > 0 ? deviceRatio : 1;
  return floorTierActive() ? floorDpr(viewWidth, viewHeight, device) : device;
}

/** Same placement `fit()` uses: the whole bitmap stays on screen, centered. */
export function fittedMapPlacement(viewWidth: number, viewHeight: number, mapWidth: number, mapHeight: number) {
  const scale = Math.min(viewWidth / mapWidth, viewHeight / mapHeight);
  const drawnWidth = mapWidth * scale;
  const drawnHeight = mapHeight * scale;
  return { offsetX: (viewWidth - drawnWidth) / 2, offsetY: (viewHeight - drawnHeight) / 2, mapWidth: drawnWidth, mapHeight: drawnHeight };
}

export interface NativeMapFrame {
  viewWidth: number;
  viewHeight: number;
  ratio: number;
  map: CanvasImageSource;
  offsetX: number;
  offsetY: number;
  mapWidth: number;
  mapHeight: number;
  selection?: { x: number; y: number };
}

/** The steady map paint: ocean, the fitted province bitmap, and the selection marker. */
export function paintNativeMap(context: CanvasRenderingContext2D, frame: NativeMapFrame): void {
  context.setTransform(frame.ratio, 0, 0, frame.ratio, 0, 0);
  context.fillStyle = '#122638';
  context.fillRect(0, 0, frame.viewWidth, frame.viewHeight);
  context.imageSmoothingEnabled = false;
  context.drawImage(frame.map, frame.offsetX, frame.offsetY, frame.mapWidth, frame.mapHeight);
  if (!frame.selection) return;
  const { x, y } = frame.selection;
  context.beginPath(); context.arc(x, y, 9, 0, Math.PI * 2);
  context.strokeStyle = '#07131b'; context.lineWidth = 5; context.stroke();
  context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke();
  context.beginPath(); context.arc(x, y, 2, 0, Math.PI * 2); context.fillStyle = '#fff'; context.fill();
}

export interface NativeMapCamera { x: number; y: number; zoom: number }
export interface NativeMapSelection { x: number; y: number; province: ProvinceDefinition; state?: AuthoredState }
export interface NativeMapView {
  zoom(factor: number): void;
  fit(): void;
  pause(): void;
  resume(): void;
  serialize(): NativeMapCamera;
  restore(camera: NativeMapCamera): void;
  dispose(): void;
}

/** Authored diagnostic palette. Geography and identifiers come from selected base files. */
function color(province: ProvinceDefinition): number[] {
  const hash = Math.imul(province.id ^ 0x4b1d, 0x45d9f3b) >>> 0;
  const hue = province.type === 'land' ? 80 + hash % 95 : province.type === 'lake' ? 182 + hash % 23 : 204 + hash % 18;
  const saturation = province.type === 'land' ? 25 + (hash >>> 8) % 25 : 30 + (hash >>> 8) % 20;
  const lightness = province.type === 'land' ? 48 + (hash >>> 16) % 22 : province.type === 'lake' ? 36 + (hash >>> 16) % 12 : 19 + (hash >>> 16) % 9;
  const a = saturation / 100 * Math.min(lightness / 100, 1 - lightness / 100);
  return [0, 8, 4].map(n => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (lightness / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  });
}

/** Browser map adaptation, not the native renderer or a campaign world initializer. */
export async function createNativeMapView(
  canvas: HTMLCanvasElement,
  input: RawWorldData,
  onSelection: (selection: NativeMapSelection) => void,
  onChange: () => void,
  signal: AbortSignal,
): Promise<NativeMapView> {
  if (canvas.dataset) canvas.dataset.glassInk = 'textured';
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const drawing: CanvasRenderingContext2D = context;
  let world: RawWorldData | undefined = input;
  const width = input.width, height = input.height;
  const colors = new Map(input.definitions.map(province => [province.id, color(province)]));
  const image = new ImageData(width, height);
  for (let start = 0; start < input.provinceIds.length; start += 262144) {
    signal.throwIfAborted();
    const end = Math.min(input.provinceIds.length, start + 262144);
    for (let i = start; i < end; i++) {
      const rgb = colors.get(input.provinceIds[i]);
      const offset = i * 4;
      image.data[offset] = rgb?.[0] ?? 255;
      image.data[offset + 1] = rgb?.[1] ?? 0;
      image.data[offset + 2] = rgb?.[2] ?? 255;
      image.data[offset + 3] = 255;
    }
    // Yield without depending on animation frames while the app is hidden.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  const mapImage = document.createElement('canvas');
  mapImage.width = width; mapImage.height = height;
  const mapContext = mapImage.getContext('2d');
  if (!mapContext) throw new Error('Map canvas is unavailable.');
  mapContext.putImageData(image, 0, 0);
  const events = new AbortController();
  let viewWidth = 1, viewHeight = 1, scale = 1, offsetX = 0, offsetY = 0;
  let paused = false, disposed = false, drawRaf = 0;
  let canvasRect: DOMRect | null = null;
  let selection: NativeMapSelection | undefined;
  const states = new Map(input.states.map(state => [state.id, state]));
  const pointers = new Map<number, { x: number; y: number }>();
  let origin = { x: 0, y: 0 }, moved = false;
  let gesture: { x: number; y: number; distance: number } | undefined;
  const minimum = () => Math.min(viewWidth / width, viewHeight / height);
  const maximum = () => Math.max(16, minimum());
  function constrain() {
    offsetX = width * scale <= viewWidth ? (viewWidth - width * scale) / 2 : Math.max(viewWidth - width * scale, Math.min(0, offsetX));
    offsetY = height * scale <= viewHeight ? (viewHeight - height * scale) / 2 : Math.max(viewHeight - height * scale, Math.min(0, offsetY));
  }
  function draw() {
    if (disposed) return;
    paintNativeMap(drawing, {
      viewWidth, viewHeight, ratio: nativeMapPixelRatio(viewWidth, viewHeight), map: mapImage,
      offsetX, offsetY, mapWidth: width * scale, mapHeight: height * scale,
      ...(selection ? { selection: { x: offsetX + (selection.x + .5) * scale, y: offsetY + (selection.y + .5) * scale } } : {}),
    });
  }
  function serialize(): NativeMapCamera {
    return { x: (viewWidth / 2 - offsetX) / scale, y: (viewHeight / 2 - offsetY) / scale, zoom: scale / minimum() };
  }
  function restore(camera: NativeMapCamera) {
    if (![camera.x, camera.y, camera.zoom].every(Number.isFinite) || camera.zoom < 1) return;
    scale = Math.min(maximum(), Math.max(minimum(), minimum() * camera.zoom));
    offsetX = viewWidth / 2 - Math.max(0, Math.min(width, camera.x)) * scale;
    offsetY = viewHeight / 2 - Math.max(0, Math.min(height, camera.y)) * scale;
    constrain(); draw();
  }
  function scheduleDraw() {
    if (!drawRaf && !disposed) drawRaf = requestAnimationFrame(() => { drawRaf = 0; draw(); });
  }
  function resize() {
    const camera = serialize();
    canvasRect = canvas.getBoundingClientRect();
    viewWidth = Math.max(1, canvasRect.width); viewHeight = Math.max(1, canvasRect.height);
    const ratio = nativeMapPixelRatio(viewWidth, viewHeight);
    canvas.width = Math.max(1, Math.round(viewWidth * ratio));
    canvas.height = Math.max(1, Math.round(viewHeight * ratio));
    restore(camera);
  }
  function fit() { if (disposed) return; scale = minimum(); constrain(); draw(); onChange(); }
  function zoom(factor: number, x = viewWidth / 2, y = viewHeight / 2) {
    if (paused || disposed) return;
    const sourceX = (x - offsetX) / scale, sourceY = (y - offsetY) / scale;
    scale = Math.min(maximum(), Math.max(minimum(), scale * factor));
    offsetX = x - sourceX * scale; offsetY = y - sourceY * scale;
    constrain(); draw(); onChange();
  }
  function inspect(x: number, y: number) {
    if (!world) return;
    const sourceX = Math.floor((x - offsetX) / scale), sourceY = Math.floor((y - offsetY) / scale);
    const province = provinceAtPixel(world, sourceX, sourceY);
    if (!province) return;
    selection = { x: sourceX, y: sourceY, province, state: states.get(world.stateByProvinceId.get(province.id) ?? -1) };
    onSelection(selection); draw();
  }
  const point = (event: PointerEvent | MouseEvent) => {
    const rect = canvasRect ?? (canvasRect = canvas.getBoundingClientRect());
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function currentGesture() {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  const options = { signal: events.signal };
  canvas.addEventListener('pointerdown', event => {
    if (paused || disposed || (event.pointerType === 'mouse' && event.button !== 0)) return;
    canvasRect = canvas.getBoundingClientRect();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId, point(event));
    if (pointers.size === 1) { origin = point(event); moved = false; }
    if (pointers.size >= 2) { gesture = currentGesture(); moved = true; }
  }, options);
  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous || paused) return;
    const next = point(event); pointers.set(event.pointerId, next);
    if (pointers.size >= 2 && gesture) {
      const nextGesture = currentGesture();
      const sourceX = (gesture.x - offsetX) / scale, sourceY = (gesture.y - offsetY) / scale;
      scale = Math.min(maximum(), Math.max(minimum(), scale * nextGesture.distance / Math.max(1, gesture.distance)));
      offsetX = nextGesture.x - sourceX * scale; offsetY = nextGesture.y - sourceY * scale;
      gesture = nextGesture;
    } else {
      offsetX += next.x - previous.x; offsetY += next.y - previous.y;
      if (Math.hypot(next.x - origin.x, next.y - origin.y) > 6) moved = true;
    }
    constrain(); scheduleDraw();
  }, options);
  function endPointer(event: PointerEvent, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    if (!cancelled && !paused && pointers.size === 1 && !moved) { const p = point(event); inspect(p.x, p.y); }
    pointers.delete(event.pointerId);
    gesture = pointers.size >= 2 ? currentGesture() : undefined;
    if (pointers.size === 1) origin = [...pointers.values()][0];
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    onChange();
  }
  canvas.addEventListener('pointerup', event => endPointer(event), options);
  canvas.addEventListener('pointercancel', event => endPointer(event, true), options);
  canvas.addEventListener('lostpointercapture', event => endPointer(event, true), options);
  canvas.addEventListener('wheel', event => {
    if (paused) return;
    event.preventDefault(); const p = point(event);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewHeight : 1);
    zoom(Math.exp(-Math.max(-500, Math.min(500, delta)) * .002), p.x, p.y);
  }, { ...options, passive: false });
  canvas.addEventListener('dblclick', event => { event.preventDefault(); const p = point(event); zoom(2, p.x, p.y); }, options);
  canvas.addEventListener('keydown', event => {
    if (paused || disposed) return;
    if (event.key === '+' || event.key === '=') zoom(2);
    else if (event.key === '-') zoom(.5);
    else if (event.key.toLowerCase() === 'f') fit();
    else if (event.key === 'Enter') inspect(viewWidth / 2, viewHeight / 2);
    else if (event.key === 'ArrowLeft') offsetX += 80;
    else if (event.key === 'ArrowRight') offsetX -= 80;
    else if (event.key === 'ArrowUp') offsetY += 80;
    else if (event.key === 'ArrowDown') offsetY -= 80;
    else return;
    event.preventDefault(); constrain(); draw(); onChange();
  }, options);
  function clearPointers() {
    for (const id of pointers.keys()) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    pointers.clear(); gesture = undefined;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; if (drawRaf) { cancelAnimationFrame(drawRaf); drawRaf = 0; } events.abort(); observer.disconnect(); clearPointers();
    mapImage.width = mapImage.height = 0; world = undefined; states.clear();
  }
  const observer = new ResizeObserver(resize);
  signal.addEventListener('abort', dispose, { once: true });
  if (signal.aborted) { dispose(); signal.throwIfAborted(); }
  observer.observe(canvas); resize(); fit();
  return { zoom, fit, serialize, restore, pause() { paused = true; clearPointers(); }, resume() { paused = false; }, dispose };
}
