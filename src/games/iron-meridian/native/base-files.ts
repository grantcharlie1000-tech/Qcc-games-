import { NativeFileIo } from './file-io';
import type { NativeFileIoMemory } from './file-io';
import { NativeStreamConstruction } from './engine-construction';
import type { NativeStreamConstructionDependencies } from './engine-construction';
import { NativeContentStream } from './content-stream';
import { NativeReaderLifetime } from './reader-lifetime';
import { NativeFileStat } from './file-stat';
import { nativeStreamImage } from './stream-image';
import { validateCapturedBaseSource, validateNativeBasePath } from './local-source';
import { NativeLoaderError } from './loader-protocol';
import type { CapturedBaseSource } from './loader-protocol';

export interface NativeBaseFileReport {
  readonly model: 'captured-loose-base-v1';
  readonly completedReads: number;
  readonly statCalls: number;
  readonly openReadCalls: number;
  readonly readBytesCalls: number;
  readonly closeCalls: number;
  readonly liveHandles: number;
  readonly streamConstructions: number;
  readonly readAllCalls: number;
  readonly streamDestructions: number;
  readonly vectorDestructions: number;
}

const GS = 0x100000n, TLS_ARRAY = 0x101000n, TLS = 0x102000n;
const STATE = 0x1436918c0n, MOUNT = 0x104000n, ARCHIVER = 0x104100n, IO = 0x104200n, OPAQUE = 0x104300n;
// Host callback tokens in the authored browser provider, not recovered executable addresses.
const ALLOCATE = 0x6000100n, FREE = 0x6000200n, OPEN = 0x6000300n, STAT = 0x6000400n;
const READ = 0x6000500n, SEEK = 0x6000600n, TELL = 0x6000700n, LENGTH = 0x6000800n, DESTROY = 0x6000900n;
const STREAM_ALLOCATE = 0x6000a00n, STREAM_RELEASE = 0x6000b00n, REALLOCATE = 0x6000c00n;
const STREAM_ALLOCATOR = 0x1430fd000n, STREAM_VTABLE = 0x104400n;
const encoder = new TextEncoder();
const fail = (code: string, message: string, path: string): never => { throw new NativeLoaderError({ phase: 'read', code, message, path }); };

/** New browser memory backend for the translated raw-memory callers. No x64 execution. */
class FileMemory implements NativeFileIoMemory {
  private regions: { address: bigint; bytes: Uint8Array; view: DataView }[] = [];
  private next = 0x10000000n;
  private nativeAllocations = new Set<bigint>();

  constructor() {
    this.map(GS, 0x8000); this.map(0x143691000n, 0x4000); this.map(0x14368f000n, 0x1000); this.map(STREAM_ALLOCATOR, 0x1000);
    const pages = new Set<bigint>();
    for (const [address, payload] of nativeStreamImage) for (let page = address & ~4095n; page < address + BigInt(payload.length / 2); page += 4096n) pages.add(page);
    const ordered = [...pages].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    for (let index = 0; index < ordered.length; index++) {
      const begin = ordered[index];
      let end = begin + 4096n;
      while (ordered[index + 1] === end) { index++; end += 4096n; }
      this.map(begin, Number(end - begin));
    }
    for (const [address, payload] of nativeStreamImage) this.writeBytes(address, Uint8Array.from({ length: payload.length / 2 }, (_, index) => Number.parseInt(payload.slice(index * 2, index * 2 + 2), 16)));
  }
  private map(address: bigint, count: number): bigint {
    const bytes = new Uint8Array(Math.max(1, count));
    if (this.regions.some(region => address < region.address + BigInt(region.bytes.length) && region.address < address + BigInt(bytes.length))) throw new Error('Overlapping file memory.');
    this.regions.push({ address, bytes, view: new DataView(bytes.buffer) });
    return address;
  }
  allocate(count: bigint, native = false): bigint {
    if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unrepresentable file memory size.');
    const address = this.next;
    this.next += (count + 31n) & ~15n;
    this.map(address, Number(count));
    if (native) this.nativeAllocations.add(address);
    return address;
  }
  release(address: bigint): void {
    if (!this.nativeAllocations.delete(address)) throw new Error('Invalid native file allocation release.');
    this.regions = this.regions.filter(region => region.address !== address);
  }
  reallocate(address: bigint, count: bigint): bigint {
    const previous = address === 0n ? undefined : this.regions.find(region => region.address === address);
    if (address !== 0n && (!previous || !this.nativeAllocations.has(address))) throw new Error('Invalid native file allocation resize.');
    const replacement = this.allocate(count, true);
    if (previous) { this.bytes(replacement, Math.min(previous.bytes.length, Number(count))).set(previous.bytes.subarray(0, Number(count))); this.release(address); }
    return replacement;
  }
  private region(address: bigint, length: number) {
    const result = this.regions.find(region => address >= region.address && address + BigInt(length) <= region.address + BigInt(region.bytes.length));
    if (!result) throw new Error(`Unmapped file memory 0x${address.toString(16)} + ${length}.`);
    return { ...result, offset: Number(address - result.address) };
  }
  bytes(address: bigint, length: number): Uint8Array { const region = this.region(address, length); return region.bytes.subarray(region.offset, region.offset + length); }
  readByte(address: bigint): number { const region = this.region(address, 1); return region.view.getUint8(region.offset); }
  readDword(address: bigint): number { const region = this.region(address, 4); return region.view.getUint32(region.offset, true); }
  readQword(address: bigint): bigint { const region = this.region(address, 8); return region.view.getBigUint64(region.offset, true); }
  writeByte(address: bigint, value: number): void { const region = this.region(address, 1); region.view.setUint8(region.offset, value); }
  writeDword(address: bigint, value: number): void { const region = this.region(address, 4); region.view.setUint32(region.offset, value, true); }
  writeQword(address: bigint, value: bigint): void { const region = this.region(address, 8); region.view.setBigUint64(region.offset, BigInt.asUintN(64, value), true); }
  writeBytes(address: bigint, payload: Uint8Array): void { if (payload.length) this.bytes(address, payload.length).set(payload); }
  get liveNativeAllocations(): number { return this.nativeAllocations.size; }
  dispose(): void { this.regions = []; this.nativeAllocations.clear(); }
}

/** New platform adapter. The selected folder is one explicit supplied mount model. */
export class NativeBaseFiles {
  private readonly files: Map<string, Blob>;
  private readonly directories: Set<string>;
  private counts = { completedReads: 0, statCalls: 0, openReadCalls: 0, readBytesCalls: 0, closeCalls: 0, liveHandles: 0,
    streamConstructions: 0, readAllCalls: 0, streamDestructions: 0, vectorDestructions: 0 };

  constructor(source: CapturedBaseSource) {
    const captured = validateCapturedBaseSource(source);
    this.files = new Map(captured.files.map(file => [file.path, file.blob]));
    this.directories = new Set(captured.directories);
  }
  get report(): NativeBaseFileReport { return { model: 'captured-loose-base-v1', ...this.counts }; }

  async read(path: string): Promise<Uint8Array> {
    validateNativeBasePath(path);
    const memory = new FileMemory(), locks = new Set<bigint>();
    let hydrated: Uint8Array | undefined, cursor = 0, providerOpen = false, handle = 0n, ownsHandle = false;
    let stream = 0n, vector = 0n, constructed = false, streamCleanupAttempted = false, vectorCleanupAttempted = false;
    const error = (code: number) => memory.writeDword(TLS + 0x20e4n, code);
    const target = (actual: bigint, expected: bigint) => { if (actual !== expected) throw new Error('Unexpected browser file provider target.'); };
    const name = (pointer: bigint) => {
      let value = '';
      for (let count = 0; ; count++) {
        const byte = memory.readByte(pointer + BigInt(count));
        if (byte === 0) return value;
        value += String.fromCharCode(byte);
      }
    };
    const file = this.files.get(path);
    const dependencies: NativeStreamConstructionDependencies = {
      allocate: (address, count) => { target(address, ALLOCATE); return memory.allocate(count, true); },
      free: (address, pointer) => { target(address, FREE); memory.release(pointer); },
      reallocate: (address, pointer, count) => { target(address, REALLOCATE); return memory.reallocate(pointer, count); },
      crtAllocate: count => memory.allocate(count, true),
      crtFree: pointer => memory.release(pointer),
      copy1426079d0: (destination, source, count) => { if (count !== 0n) memory.writeBytes(destination, new Uint8Array(memory.bytes(source, Number(count)))); },
      openRead: (address, opaque, pointer) => {
        target(address, OPEN); target(opaque, OPAQUE);
        if (name(pointer) !== path || hydrated === undefined || providerOpen) { error(11); return 0n; }
        providerOpen = true; cursor = 0; return IO;
      },
      stat: (address, opaque, pointer, output) => {
        target(address, STAT); target(opaque, OPAQUE);
        const current = name(pointer), blob = this.files.get(current), directory = this.directories.has(current);
        if (!blob && !directory) { error(11); return 0; }
        memory.writeQword(output, blob ? BigInt(blob.size) : -1n);
        for (const offset of [8n, 16n, 24n]) memory.writeQword(output + offset, -1n);
        memory.writeDword(output + 0x20n, blob ? 0 : 1);
        memory.writeDword(output + 0x24n, 1);
        return 1;
      },
      read: (address, io, destination, count) => {
        target(address, READ); target(io, IO);
        if (!providerOpen || !hydrated) { error(9); return -1n; }
        const available = hydrated.length - cursor, actual = Number(count < BigInt(available) ? count : BigInt(available));
        memory.bytes(destination, actual).set(hydrated.subarray(cursor, cursor + actual)); cursor += actual;
        return BigInt(actual);
      },
      seek: (address, io, offset) => {
        target(address, SEEK); target(io, IO);
        if (!providerOpen || !hydrated || offset > BigInt(hydrated.length)) { error(9); return 0; }
        cursor = Number(offset); return 1;
      },
      tell: (address, io) => { target(address, TELL); target(io, IO); return providerOpen ? BigInt(cursor) : -1n; },
      length: (address, io) => { target(address, LENGTH); target(io, IO); return providerOpen && hydrated ? BigInt(hydrated.length) : -1n; },
      destroy: (address, io) => { target(address, DESTROY); target(io, IO); if (!providerOpen) throw new Error('Browser file provider was already closed.'); providerOpen = false; hydrated = undefined; },
      comparePrefix1425ceb80: (left, right, count) => {
        for (let index = 0n; index < count; index++) { const difference = memory.readByte(left + index) - memory.readByte(right + index); if (difference) return difference; }
        return 0;
      },
      findSlash1425c3c70: (pointer, byte) => { if (byte !== 47) throw new Error('Unexpected native path separator.'); while (memory.readByte(pointer) !== 0) { if (memory.readByte(pointer) === 47) return pointer; pointer++; } return 0n; },
      probeStack1425a07d0: count => { if (count > 0x220n) throw new Error('Native file temporary exceeds browser workspace.'); },
      lock1425a3b80: mutex => { if (mutex !== STATE + 0x58n && mutex !== STATE + 0xa8n) throw new Error('Unknown native file mutex.'); if (locks.has(mutex)) return 1; locks.add(mutex); return 0; },
      unlock1425a3b88: mutex => { if (!locks.delete(mutex)) throw new Error('Unbalanced native file unlock.'); },
    };
    const checked = <T>(result: { readonly kind: 'returned'; readonly value: T } | { readonly kind: 'runtime-required' | 'native-exception' | 'native-assertion' | 'native-memory-fault' }): T => {
      if (result.kind !== 'returned') return fail('native-file-failed', `Native file operation stopped: ${result.kind}.`, path);
      return result.value;
    };
    const io = new NativeFileIo(memory, dependencies, GS);
    const release = (address: bigint, allocator: bigint, pointer: bigint) => { target(address, STREAM_RELEASE); target(allocator, STREAM_ALLOCATOR); if (pointer !== 0n) memory.release(pointer); };
    const content = new NativeContentStream(memory, {
      io: dependencies,
      allocate: (address, allocator, count, alignment) => { target(address, STREAM_ALLOCATE); target(allocator, STREAM_ALLOCATOR); if (alignment !== 1) throw new Error('Unexpected byte-vector alignment.'); return memory.allocate(count, true); },
      release, copy: dependencies.copy1426079d0,
      zero: (destination, value, count) => memory.bytes(destination, Number(count)).fill(value),
      crtFree: pointer => memory.release(pointer),
    }, GS, 0n);
    const lifetime = new NativeReaderLifetime(memory, { release, crtFree: pointer => memory.release(pointer) });
    const destroyStream = () => {
      if (!constructed || streamCleanupAttempted) return;
      streamCleanupAttempted = true; this.counts.streamDestructions++;
      if (memory.readQword(stream + 8n) !== 0n) this.counts.closeCalls++;
      handle = 0n; checked(content.destroyStream(stream));
      if (providerOpen || memory.readQword(STATE + 0x50n) !== 0n) fail('native-close-failed', 'Native file did not close.', path);
    };
    const destroyVector = () => {
      if (vector === 0n || vectorCleanupAttempted) return;
      vectorCleanupAttempted = true; this.counts.vectorDestructions++; checked(lifetime.destroyVector(vector));
    };
    try {
      memory.writeQword(GS + 0x58n, TLS_ARRAY); memory.writeDword(0x143693a98n, 0); memory.writeQword(TLS_ARRAY, TLS);
      memory.writeQword(0x1436918a0n, ALLOCATE); memory.writeQword(0x1436918b0n, FREE);
      memory.writeQword(0x1436918a8n, REALLOCATE);
      memory.writeQword(STREAM_ALLOCATOR, STREAM_VTABLE); memory.writeQword(STREAM_VTABLE + 8n, STREAM_ALLOCATE); memory.writeQword(STREAM_VTABLE + 0x10n, STREAM_RELEASE);
      memory.writeQword(STATE + 8n, MOUNT); memory.writeQword(MOUNT, OPAQUE); memory.writeQword(MOUNT + 0x28n, ARCHIVER);
      memory.writeQword(ARCHIVER + 0x40n, OPEN); memory.writeQword(ARCHIVER + 0x68n, STAT);
      for (const [offset, address] of [[0x10n, READ], [0x20n, SEEK], [0x28n, TELL], [0x30n, LENGTH], [0x48n, DESTROY]]) memory.writeQword(IO + offset, address);
      const encoded = encoder.encode(path), capacity = encoded.length <= 15 ? 15 : encoded.length | 15;
      const input = memory.allocate(BigInt(capacity + 1));
      memory.bytes(input, encoded.length).set(encoded);
      const workspace = { stackHeader: memory.allocate(0x220n), pathPointer: memory.allocate(8n), stat: memory.allocate(40n) };
      const output = memory.allocate(40n);
      this.counts.statCalls++;
      const exists = checked(new NativeFileStat(memory, dependencies, GS).stat(input, output, workspace));
      if (exists === 0n) return fail('missing-input', 'Required base file is missing.', path);
      if (memory.readDword(output + 0x20n) !== 0) return fail('not-regular-file', 'Content is not a regular file.', path);
      if (!file || memory.readQword(output) !== BigInt(file.size)) return fail('size-mismatch', 'Native file size differs from selected content.', path);
      let buffer: ArrayBuffer;
      try { buffer = await file.arrayBuffer(); }
      catch { return fail('read-failed', 'Could not read the selected file.', path); }
      if (buffer.byteLength !== file.size) return fail('size-mismatch', 'Read size differs from the selected file.', path);
      hydrated = new Uint8Array(buffer);
      const record = memory.allocate(64n), stackBase = memory.allocate(0x4000n), entryStack = stackBase + 0x3e08n;
      if (encoded.length <= 15) memory.writeBytes(record, encoded); else memory.writeQword(record, input);
      memory.writeQword(record + 0x10n, BigInt(encoded.length)); memory.writeQword(record + 0x18n, BigInt(capacity));
      memory.writeByte(entryStack + 0x28n, 0);
      stream = memory.allocate(56n); this.counts.openReadCalls++; this.counts.streamConstructions++;
      checked(new NativeStreamConstruction(memory, dependencies, GS).constructStream(stream, record, 0, 0x100000, entryStack, workspace)); constructed = true;
      const engine = memory.readQword(stream + 8n);
      if (engine === 0n) return fail('native-open-failed', 'Could not open captured content.', path);
      handle = memory.readQword(engine + 0x10n);
      this.counts.liveHandles++; ownsHandle = true;
      if (checked(content.streamLength(stream)) !== BigInt(file.size)) return fail('size-mismatch', 'Native handle length differs from selected content.', path);
      vector = memory.allocate(24n); memory.writeQword(vector + 0x10n, STREAM_ALLOCATOR);
      this.counts.readAllCalls++; if (file.size !== 0) this.counts.readBytesCalls++;
      if (checked(content.readAll(stream, vector)) !== 1 || memory.readDword(vector + 0xcn) !== file.size) return fail('native-short-read', 'Native file read was incomplete.', path);
      if (checked(io.eof(handle)) !== 1) return fail('native-eof-failed', 'Native file cursor did not reach its end.', path);
      const bytes = file.size === 0 ? new Uint8Array() : new Uint8Array(memory.bytes(memory.readQword(vector), file.size));
      destroyStream(); destroyVector();
      if (providerOpen || memory.readQword(STATE + 0x50n) !== 0n || memory.liveNativeAllocations !== 0 || locks.size !== 0) return fail('native-resource-leak', 'Native file resources remain live.', path);
      this.counts.completedReads++;
      return bytes;
    } finally {
      try {
        destroyStream();
        if (!streamCleanupAttempted) {
          const closing = handle || memory.readQword(STATE + 0x50n); handle = 0n;
          if (closing !== 0n) {
            this.counts.closeCalls++;
            const result = io.close(closing);
            if (result.kind !== 'returned' || result.value !== 1) fail('native-close-failed', 'Native file cleanup failed.', path);
          }
        }
      } finally {
        try { destroyVector(); }
        finally { if (ownsHandle) this.counts.liveHandles--; hydrated = undefined; memory.dispose(); }
      }
    }
  }
}
