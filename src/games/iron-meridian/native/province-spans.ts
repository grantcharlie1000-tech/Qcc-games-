import { nativeProvinceBounds } from './province-bounds';
import type { NativeProvinceBounds } from './province-bounds';

export interface ProvinceSpanMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
  writeByte(address: bigint, value: number): void;
  writeWord(address: bigint, value: number): void;
  writeDword(address: bigint, value: number): void;
  writeQword(address: bigint, value: bigint): void;
  writeBytes(address: bigint, value: Uint8Array): void;
}

export interface ProvinceSpanContext {
  readonly gsBase: bigint;
  /** RSP after the native 0x140ab0cd0 prologue. */
  readonly frameBase: bigint;
}

export interface ProvinceSpanServices {
  allocate?(input: { target: bigint; allocator?: bigint; size: bigint; alignment?: number }): bigint;
  release?(input: { target: bigint; allocator: bigint; pointer: bigint }): void;
  registerThreadCleanup?(target: bigint, destructor: bigint): void;
  threadRecord?(key: bigint): bigint;
}

export type ProvinceSpanResult = { kind: 'returned' } | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint };
class MapStop extends Error {
  constructor(readonly result: Extract<ProvinceSpanResult, { kind: 'runtime-required' }>) { super(result.boundary); }
}
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const add = (address: bigint, offset: bigint) => u64(address + offset);

function geometry(memory: ProvinceSpanMemory, services: ProvinceSpanServices) {
  const q = (address: bigint) => u64(memory.readQword(u64(address)));
  const d = (address: bigint) => memory.readDword(u64(address)) >>> 0;
  const i = (address: bigint) => d(address) | 0;
  const b = (address: bigint) => memory.readByte(u64(address)) & 255;
  const wd = (address: bigint, value: number) => memory.writeDword(u64(address), value >>> 0);
  const wq = (address: bigint, value: bigint) => memory.writeQword(u64(address), u64(value));
  function stop(boundary: string, nativeAddress: bigint): never { throw new MapStop({ kind: 'runtime-required', boundary, nativeAddress }); }
  function bounds(province: bigint): NativeProvinceBounds {
    return { x: i(add(province, 0x88n)), y: i(add(province, 0x8cn)), width: i(add(province, 0x90n)), height: i(add(province, 0x94n)) };
  }
  function writeBounds(province: bigint, value: NativeProvinceBounds) {
    const bytes = new Uint8Array(16), view = new DataView(bytes.buffer);
    [value.x, value.y, value.width, value.height].forEach((field, index) => view.setInt32(index * 4, field | 0, true));
    memory.writeBytes(add(province, 0x88n), bytes);
  }
  function expand(old: NativeProvinceBounds, x: number, y: number, right: number, interior: boolean): NativeProvinceBounds {
    let { x: left, y: top, width, height } = old;
    if (x < left) { width = (width + ((left - x) | 0)) | 0; left = x; }
    if (((left + width) | 0) < ((right + (interior ? 1 : 0)) | 0)) width = (right - left) | 0;
    if (y < top) { height = (height + ((top - y) | 0)) | 0; top = y; }
    if (((top + height) | 0) < ((y + 1) | 0)) height = (y - top + 1) | 0;
    return { x: left, y: top, width, height };
  }
  function copy(destination: bigint, source: bigint, size: bigint) {
    if (size === 0n) return;
    const bytes = Uint8Array.from({ length: Number(size) }, (_, index) => b(add(source, BigInt(index))));
    memory.writeBytes(u64(destination), bytes);
  }
  function append(province: bigint, x: number, y: number, length: number, growth: number) {
    const oldCount = i(add(province, 0x64n)), oldCapacity = i(add(province, 0x60n));
    const record = (destination: bigint) => {
      memory.writeWord(u64(destination), x & 65535);
      memory.writeWord(add(destination, 2n), y & 65535);
      memory.writeWord(add(destination, 4n), length & 65535);
    };
    if (oldCount !== oldCapacity) {
      record(add(q(add(province, 0x58n)), BigInt(oldCount) * 6n));
      wd(add(province, 0x64n), i(add(province, 0x64n)) + 1);
      return;
    }
    const product = Math.fround(Math.fround(oldCapacity) * growth);
    const converted = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    const minimum = (oldCount + 1) | 0, capacity = converted < minimum ? minimum : converted;
    const allocator = q(add(province, 0x68n)), target = q(add(q(allocator), 8n));
    if (!services.allocate) stop('span-allocate', target);
    // ESI receives CVTTSS2SI/CMOVG, so the allocation LEA uses zero-extended RSI.
    const pointer = u64(services.allocate({ target, allocator, size: BigInt(capacity >>> 0) * 6n, alignment: 2 }));
    record(add(pointer, BigInt(i(add(province, 0x64n))) * 6n));
    copy(pointer, q(add(province, 0x58n)), u64(BigInt(i(add(province, 0x64n))) * 6n));
    const count = (i(add(province, 0x64n)) + 1) | 0;
    wd(add(province, 0x64n), 0);
    const releaseAllocator = q(add(province, 0x68n)), releaseTarget = q(add(q(releaseAllocator), 0x10n));
    if (!services.release) stop('span-release', releaseTarget);
    services.release({ target: releaseTarget, allocator: releaseAllocator, pointer: q(add(province, 0x58n)) });
    wq(add(province, 0x58n), pointer); wd(add(province, 0x60n), capacity); wd(add(province, 0x64n), count);
  }
  function progress(handle: bigint) {
    if (!services.threadRecord) stop('thread-record', 0x142556800n);
    const thread = u64(services.threadRecord(0x143691780n));
    if (b(add(thread, 0x20n)) !== 0) stop('progress-clock', 0x1425a548cn);
    if (q(0x1435010b8n) !== 0n) stop('progress-aggregate', 0x1422cb360n);
    const secondThread = u64(services.threadRecord(0x143691780n));
    if (b(add(secondThread, 0x20n)) !== 0) stop('progress-virtual', q(add(q(handle), 0x60n)));
  }
  function scratch(context: ProvinceSpanContext) {
    const tlsBlock = () => q(add(q(add(context.gsBase, 0x58n)), BigInt(d(0x143693a98n)) * 8n));
    const tls = tlsBlock(), descriptor = add(context.frameBase, 0x1f0n);
    if (!(d(add(tls, 0x20e0n)) & 1)) {
      wd(add(tls, 0x20e0n), d(add(tls, 0x20e0n)) | 1);
      if (!services.allocate) stop('scratch-allocate', 0x1425f2fccn);
      wq(add(tls, 0x20d0n), services.allocate({ target: 0x1425f2fccn, size: u64(BigInt(i(0x143691804n))) }));
      wd(add(tls, 0x20d8n), 0);
      if (b(0x14368f611n) && ((!b(0x143691808n) && i(0x143691804n) < 1) || (!b(0x143691809n) && q(add(tls, 0x20d0n)) === 0n))) stop('native-assert', 0x14254ab40n);
      if (!services.registerThreadCleanup) stop('thread-cleanup', 0x1425a08dcn);
      services.registerThreadCleanup(0x1425a08dcn, 0x142784a70n);
    }
    const currentTls = tlsBlock();
    wq(descriptor, add(currentTls, 0x20d0n)); wd(add(descriptor, 8n), d(add(currentTls, 0x20d8n)));
    return descriptor;
  }
  function reserveScratch(descriptor: bigint, size: number, once: bigint): bigint {
    const allocator = q(descriptor), used = i(add(allocator, 8n));
    if (b(0x14368f611n) && !b(once) && i(0x143691804n) < ((used + size) | 0)) stop('native-assert', 0x14254ab40n);
    const pointer = add(q(allocator), BigInt(used));
    wd(add(allocator, 8n), used + size);
    return pointer;
  }
  function centers(registry: bigint) {
    const count = i(add(registry, 0x34n));
    for (let index = 0; index < count; index++) {
      const region = q(add(q(add(registry, 0x28n)), BigInt(index) * 8n));
      const manager = q(0x1433e7700n), width = i(add(manager, 0x40n));
      let first = true, normal: NativeProvinceBounds = { x: 0, y: 0, width: 0, height: 0 }, shifted = { ...normal };
      const members = i(add(region, 0x14n)), ids = q(add(region, 8n));
      for (let member = 0; member < members; member++) {
        const id = i(add(ids, BigInt(member) * 4n));
        const currentManager = q(0x1433e7700n), table = q(add(currentManager, 0x268n));
        const province = q(add(table, BigInt(id < 1 || id >= i(add(currentManager, 0x274n)) ? 0 : id) * 8n));
        const rect = bounds(province), shiftedX = rect.x < Math.trunc(width / 2) ? (rect.x + width) | 0 : rect.x;
        if (first) { first = false; normal = { ...rect }; shifted = { ...rect, x: shiftedX }; }
        else {
          const union = (a: NativeProvinceBounds, next: NativeProvinceBounds) => {
            let { x, y, width: w, height: h } = a;
            if (next.x < x) { w = (w + x - next.x) | 0; x = next.x; }
            if (((x + w) | 0) < ((next.x + next.width) | 0)) w = (next.width - x + next.x) | 0;
            if (next.y < y) { h = (h + y - next.y) | 0; y = next.y; }
            if (((y + h) | 0) < ((next.y + next.height) | 0)) h = (next.height - y + next.y) | 0;
            return { x, y, width: w, height: h };
          };
          normal = union(normal, rect); shifted = union(shifted, { ...rect, x: shiftedX });
        }
      }
      const rect = shifted.width < normal.width ? shifted : normal;
      let x = (Math.trunc(rect.width / 2) + rect.x) | 0;
      if (x < 0) x = (x + width) | 0;
      else if (x >= width) x = (x - width) | 0;
      wd(add(region, 0x148n), x); wd(add(region, 0x14cn), Math.trunc(rect.height / 2) + rect.y);
      wd(add(region, 0x150n), Math.max(rect.width, rect.height));
    }
  }
  return { q, d, i, b, wd, wq, stop, bounds, writeBounds, expand, append, progress, scratch, reserveScratch, centers };
}

/** Complete region-center helper 0x140b0ee30 over supplied valid native memory. */
export function updateNativeRegionCenters(memory: ProvinceSpanMemory, registry: bigint): void {
  geometry(memory, {}).centers(registry);
}

/**
 * Recovered 0x140ab0cd0 orchestration. Missing services, UI-thread progress,
 * region polygon refresh and diagnostic logging stop at their original calls.
 * No whole-function result or successful map construction is supplied by a callback.
 */
export function initializeNativeProvinceSpans(memory: ProvinceSpanMemory, manager: bigint, context: ProvinceSpanContext, services: ProvinceSpanServices = {}): ProvinceSpanResult {
  const g = geometry(memory, services), { q, d, i, b, wd, stop } = g;
  try {
    const descriptor = g.scratch(context), count = i(add(manager, 0x230n));
    const seen = g.reserveScratch(descriptor, (count + 7) & -8, 0x1433dea0fn);
    if (count > 0) memory.writeBytes(seen, new Uint8Array(count));
    const initialWidth = i(add(manager, 0x40n));
    const coordinates = g.reserveScratch(descriptor, Math.imul(initialWidth, 8), 0x1433e7811n);
    const coordinateDescriptor = add(context.frameBase, 0x288n);
    g.wq(coordinateDescriptor, coordinates); g.wq(add(coordinateDescriptor, 8n), add(coordinates, BigInt(initialWidth) * 8n));
    for (let x = 0; x < initialWidth; x++) g.wq(add(coordinates, BigInt(x) * 8n), 0n);
    const table = q(add(manager, 0x268n)), pixelPointer = add(q(add(manager, 0x830n)), 0x18n);
    const progressHandle = q(0x143500298n);
    const growthBytes = new ArrayBuffer(4), growthView = new DataView(growthBytes);
    if (i(add(manager, 0x44n)) > 0) growthView.setUint32(0, d(0x142795988n), true);
    const growth = growthView.getFloat32(0, true);
    let y = 0;
    while (y < i(add(manager, 0x44n))) {
      g.progress(progressHandle);
      let x = 0, runCount = 0, id = -1, pixelOffset = BigInt(Math.imul(i(add(manager, 0x40n)), y)) * 2n;
      const flush = (right: number, interior: boolean) => {
        const province = q(add(table, BigInt(id) * 8n)), startX = i(coordinates);
        let rectangle = g.bounds(province);
        if (!b(add(seen, BigInt(id)))) {
          rectangle = { x: startX, y, width: (right - startX) | 0, height: 1 };
          memory.writeByte(add(seen, BigInt(id)), 1);
        } else rectangle = g.expand(rectangle, startX, y, right, interior);
        g.writeBounds(province, nativeProvinceBounds(rectangle));
        // Native code reads the first coordinate again after the rectangle call.
        g.append(province, i(coordinates), i(add(coordinates, 4n)), runCount, growth);
        runCount = 0;
      };
      while (x < i(add(manager, 0x40n))) {
        const pixel = add(q(pixelPointer), pixelOffset);
        const nextId = b(pixel) | b(add(pixel, 1n)) << 8;
        if (nextId !== id) { if (runCount !== 0) flush(x, true); id = nextId; }
        wd(add(coordinates, BigInt(runCount) * 8n), x); wd(add(coordinates, BigInt(runCount) * 8n + 4n), y);
        runCount = (runCount + 1) | 0; x = (x + 1) | 0; pixelOffset += 2n;
      }
      if (runCount !== 0) flush(i(add(manager, 0x40n)), false);
      y = (y + 1) | 0;
    }
    g.progress(progressHandle);
    const registry = (pointer: bigint, once: bigint) => {
      if (b(0x14368f611n) && !b(once) && q(pointer) === 0n) stop('native-assert', 0x14254ab40n);
      return q(pointer);
    };
    g.centers(registry(0x1433dd4b8n, 0x1433de20an));
    const polygons = registry(0x1433dd4c8n, 0x1433dd612n), polygonCount = i(add(polygons, 0x34n));
    if (polygonCount > 0) stop('region-polygon-refresh', 0x141640c60n);
    if (b(0x1433dd099n)) {
      const minimumPixels = i(0x1433e33d8n);
      for (let id = 1; id < i(add(manager, 0x230n)); id++) {
        const province = q(add(q(add(manager, 0x268n)), BigInt(id) * 8n));
        const spanCount = i(add(province, 0x64n));
        if (!b(add(seen, BigInt(id))) || spanCount === 0) stop('province-diagnostic', 0x14254bce0n);
        const rectangle = g.bounds(province);
        if (rectangle.width >= Math.trunc(i(add(manager, 0x40n)) / 8) || rectangle.height >= Math.trunc(i(add(manager, 0x44n)) / 8)) stop('province-diagnostic', 0x14254bce0n);
        let pixels = 0;
        for (let index = 0; index < spanCount; index++) {
          const length = add(q(add(province, 0x58n)), BigInt(index) * 6n + 4n);
          pixels = (pixels + (b(length) | b(add(length, 1n)) << 8)) | 0;
        }
        if (pixels <= minimumPixels && !(b(add(province, 0xd2n)) & 2)) stop('province-diagnostic', 0x14254bce0n);
      }
    }
    wd(add(q(descriptor), 8n), d(add(descriptor, 8n)));
    return { kind: 'returned' };
  } catch (error) {
    if (error instanceof MapStop) return error.result;
    throw error;
  }
}
