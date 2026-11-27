import type { ResearchUpdateMemory } from './research-update';
import { initializeConstructedResearchGraph } from './research-links';
import type { ResearchLinksDependencies } from './research-links';

export interface ResearchConstructionMemory extends ResearchUpdateMemory {
  writeByte(address: bigint, value: number): void;
  writeWord(address: bigint, value: number): void;
  writeBytes(address: bigint, bytes: Uint8Array): void;
}

export interface ResearchConstructionContext {
  tlsBlock: bigint;
  /** Native constructor's post-prologue RSP. Residue and temporary storage remain raw input. */
  frameBase: bigint;
}

type RegistryLookup = (table: bigint, reference: bigint, fallback: bigint) => bigint;
export interface ResearchConstructionDependencies {
  allocate?(input: { target: bigint; size: bigint; allocator?: bigint; alignment?: number }): bigint;
  release?(input: { target: bigint; pointer: bigint; allocator?: bigint }): void;
  registry1406c6970?: RegistryLookup;
  registry140705890?(registry: bigint, reference: bigint): bigint;
  registry140a34120?: RegistryLookup;
  registry140a34020?: RegistryLookup;
  registry140b1a1e0?: RegistryLookup;
  registry140b1a2e0?: RegistryLookup;
  traitActiveVirtual50?(input: { target: bigint; object: bigint }): number;
  conditionVirtual18?(input: { target: bigint; condition: bigint; context: bigint }): number;
  clearConditionVector140201280?(address: bigint): void;
  tlsFormat1422aeab0?(input: { output: bigint; format: bigint; arg3: bigint; arg4: number }): void;
  tlsGuardAcquire1425a0588?(guard: bigint): void;
  tlsAllocatorInitialize1425a0450?(descriptor: bigint): void;
  tlsGuardRelease1425a051c?(guard: bigint): void;
}

export type ResearchConstructionResult =
  | { kind: 'returned'; value: bigint }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint };

const u64 = (value: bigint) => BigInt.asUintN(64, value);
const at = (address: bigint, offset: bigint) => u64(address + offset);

class ConstructionStop extends Error {
  constructor(readonly result: Extract<ResearchConstructionResult, { kind: 'runtime-required' }>) { super(result.boundary); }
}

function constructors(memory: ResearchConstructionMemory, context: ResearchConstructionContext, services: ResearchConstructionDependencies, graphServices?: ResearchLinksDependencies) {
  const q = (address: bigint) => u64(memory.readQword(u64(address)));
  const d = (address: bigint) => memory.readDword(u64(address)) >>> 0;
  const int = (address: bigint) => d(address) | 0;
  const byte = (address: bigint) => memory.readByte(u64(address)) & 255;
  const wq = (address: bigint, value: bigint) => memory.writeQword(u64(address), u64(value));
  const wd = (address: bigint, value: number) => memory.writeDword(u64(address), value >>> 0);
  const wb = (address: bigint, value: number) => memory.writeByte(u64(address), value & 255);
  function stop(boundary: string, nativeAddress: bigint): never { throw new ConstructionStop({ kind: 'runtime-required', boundary, nativeAddress }); }
  function copy(destination: bigint, source: bigint, size: bigint) {
    if (size === 0n) return;
    const payload = Uint8Array.from({ length: Number(size) }, (_, index) => byte(at(source, BigInt(index))));
    memory.writeBytes(u64(destination), payload);
  }
  function allocate(size: bigint, allocator?: bigint, alignment?: number): bigint {
    const target = allocator === undefined ? 0x1425a01dcn : q(at(q(allocator), 8n));
    if (!services.allocate) return stop('allocate', target);
    return u64(services.allocate({ target, size: u64(size), allocator, alignment }));
  }
  function release(pointer: bigint, allocator?: bigint) {
    const target = allocator === undefined ? 0x1425a0218n : q(at(q(allocator), 0x10n));
    if (!services.release) stop('release', target);
    services.release({ target, pointer, allocator });
  }
  function ensureAllocator() {
    if (int(at(context.tlsBlock, 0x20ecn)) >= int(0x1433dd120n)) return;
    if (!services.tlsGuardAcquire1425a0588) stop('tls-guard-acquire', 0x1425a0588n);
    services.tlsGuardAcquire1425a0588(0x1433dd120n);
    if (int(0x1433dd120n) !== -1) return;
    if (!services.tlsAllocatorInitialize1425a0450) stop('tls-allocator-initialize', 0x1425a0450n);
    services.tlsAllocatorInitialize1425a0450(0x142775d00n);
    if (!services.tlsGuardRelease1425a051c) stop('tls-guard-release', 0x1425a051cn);
    services.tlsGuardRelease1425a051c(0x1433dd120n);
  }
  function vector(address: bigint) {
    wq(address, 0n); wq(at(address, 8n), 0n); ensureAllocator(); wq(at(address, 0x10n), 0x1430fd000n);
  }
  function growthValue(): number {
    const buffer = new ArrayBuffer(4), view = new DataView(buffer);
    view.setUint32(0, d(0x142795988n), true); return view.getFloat32(0, true);
  }
  function capacity(current: number, minimum: number, growth: number): number {
    const product = Math.fround(Math.fround(current) * growth);
    const converted = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    return (converted < minimum ? minimum : converted) >>> 0;
  }
  function reserve(address: bigint, wanted: number, width: number, growth: number) {
    if (int(at(address, 8n)) >= wanted) return;
    const count = capacity(int(at(address, 8n)), wanted, growth), allocator = q(at(address, 0x10n));
    const pointer = allocate(BigInt(count) * BigInt(width), allocator, 8);
    copy(pointer, q(address), BigInt(int(at(address, 0xcn))) * BigInt(width));
    release(q(address), q(at(address, 0x10n)));
    wq(address, pointer); wd(at(address, 8n), count);
  }
  function append(address: bigint, payload: Uint8Array | { address: bigint; width: number }, growth: number) {
    const width = payload instanceof Uint8Array ? payload.length : payload.width, count = int(at(address, 0xcn));
    const readPayload = () => payload instanceof Uint8Array ? payload
      : Uint8Array.from({ length: payload.width }, (_, index) => byte(at(payload.address, BigInt(index))));
    if (count === int(at(address, 8n))) {
      const nextCapacity = capacity(int(at(address, 8n)), (count + 1) | 0, growth);
      const pointer = allocate(BigInt(nextCapacity) * BigInt(width), q(at(address, 0x10n)), 8);
      memory.writeBytes(at(pointer, BigInt(int(at(address, 0xcn))) * BigInt(width)), readPayload());
      copy(pointer, q(address), BigInt(int(at(address, 0xcn))) * BigInt(width));
      const nextCount = (int(at(address, 0xcn)) + 1) | 0;
      wd(at(address, 0xcn), 0);
      release(q(address), q(at(address, 0x10n)));
      wq(address, pointer); wd(at(address, 8n), nextCapacity); wd(at(address, 0xcn), nextCount);
    } else {
      memory.writeBytes(at(q(address), BigInt(count) * BigInt(width)), readPayload());
      wd(at(address, 0xcn), (int(at(address, 0xcn)) + 1) | 0);
    }
  }
  function pointerPayload(value: bigint) { return Uint8Array.from({ length: 8 }, (_, index) => Number(value >> BigInt(index * 8) & 255n)); }
  function freeString(address: bigint) {
    const cap = q(at(address, 0x18n));
    if (cap <= 15n) return;
    const pointer = q(address);
    let allocation = pointer;
    if (u64(cap + 1n) >= 0x1000n) {
      allocation = q(at(pointer, -8n));
      if (u64(pointer - allocation - 8n) > 31n) stop('invalid-parameter', 0x1425c7db4n);
    }
    release(allocation);
  }
  function copyString(destination: bigint, sourceObject: bigint) {
    for (let offset = 0n; offset < 32n; offset += 8n) wq(at(destination, offset), 0n);
    const length = q(at(sourceObject, 0x10n));
    const source = q(at(sourceObject, 0x18n)) > 15n ? q(sourceObject) : sourceObject;
    if (length > 0x7fff_ffff_ffff_ffffn) stop('string-length-error', 0x14012b310n);
    if (length < 16n) {
      wq(at(destination, 0x10n), length); wq(at(destination, 0x18n), 15n); copy(destination, source, 16n); return;
    }
    let cap = length | 15n;
    if (cap >= 0x8000_0000_0000_0000n) cap = 0x7fff_ffff_ffff_ffffn;
    else if (cap < 22n) cap = 22n;
    let pointer: bigint;
    if (cap + 1n < 0x1000n) pointer = allocate(cap + 1n);
    else {
      const allocation = allocate(u64(cap + 0x28n));
      if (allocation === 0n) stop('invalid-parameter', 0x1425c7db4n);
      pointer = u64(allocation + 0x27n) & ~31n; wq(at(pointer, -8n), allocation);
    }
    wq(destination, pointer); wq(at(destination, 0x10n), length); wq(at(destination, 0x18n), cap);
    copy(pointer, source, length + 1n);
  }
  function moveString(destination: bigint, source: bigint) {
    if (destination === source) return;
    freeString(destination);
    wq(at(destination, 0x18n), 15n); wq(at(destination, 0x10n), 0n); wb(destination, 0);
    copy(destination, source, 16n); copy(at(destination, 0x10n), at(source, 0x10n), 16n);
    wq(at(source, 0x10n), 0n); wq(at(source, 0x18n), 15n); wb(source, 0);
  }
  function contextObject(address: bigint) {
    wq(address, 0x142852168n); wd(at(address, 8n), 0); wd(at(address, 0xcn), 1); wd(at(address, 0x10n), 0x5ea6ba9e);
    for (const offset of [0x18n, 0x20n, 0x28n]) wq(at(address, offset), address);
    for (const offset of [0x30n, 0x38n, 0x40n, 0x48n]) wq(at(address, offset), 0n);
    for (const offset of [0x50n, 0x58n]) wq(at(address, offset), q(0x1433eb2a0n));
    wq(at(address, 0x60n), 0n);
    for (let offset = 0x68n; offset <= 0x98n; offset += 8n) wq(at(address, offset), q(0x1433eb2a0n));
    wq(at(address, 0xa0n), 0n); wd(at(address, 0xa8n), 0); wb(at(address, 0xacn), 1);
  }
  function evaluate(condition: bigint): boolean {
    const ctx = at(context.frameBase, 0xf0n);
    contextObject(ctx);
    const target = q(at(q(condition), 0x18n));
    if (!services.conditionVirtual18) stop('condition', target);
    const accepted = (services.conditionVirtual18({ target, condition, context: ctx }) & 255) !== 0;
    wq(ctx, 0x142852168n);
    for (const offset of [0x30n, 0x38n, 0x40n]) {
      const owned = q(at(ctx, offset));
      if (owned !== 0n) stop('condition-owned-destruction', q(q(owned)));
    }
    const storage = q(at(ctx, 0xa0n));
    if (storage !== 0n) {
      for (const offset of [0x18n, 0n]) {
        if (q(at(storage, offset)) === 0n) continue;
        if (!services.clearConditionVector140201280) stop('condition-vector-clear', 0x140201280n);
        services.clearConditionVector140201280(at(storage, offset));
        release(q(at(storage, offset)), q(at(storage, offset + 0x10n)));
        wq(at(storage, offset), 0n); wd(at(storage, offset + 8n), 0);
      }
      release(storage);
    }
    return accepted;
  }
  function registryAvailable(global: bigint, flag: bigint) {
    if (byte(0x14368f611n) !== 0 && byte(flag) === 0 && q(global) === 0n) stop('diagnostic-assertion', 0x14254ab40n);
  }
  function lookup(service: RegistryLookup | undefined, nativeAddress: bigint, table: bigint, reference: bigint, fallback: bigint): bigint {
    if (!service) stop(`registry-${nativeAddress.toString(16)}`, nativeAddress);
    return u64(service(table, reference, fallback));
  }
  function resizeKeys(address: bigint, wanted: number) {
    if (wanted <= int(at(address, 0xcn)) || wanted <= int(at(address, 8n))) { wd(at(address, 0xcn), wanted); return; }
    const nextCapacity = capacity(int(at(address, 8n)), wanted, growthValue());
    const pointer = allocate(BigInt(nextCapacity) * 4n, q(at(address, 0x10n)), 4);
    copy(pointer, q(address), BigInt(int(at(address, 0xcn))) * 4n);
    release(q(address), q(at(address, 0x10n)));
    wq(address, pointer); wd(at(address, 8n), nextCapacity); wd(at(address, 0xcn), wanted);
  }
  function slot(object: bigint, owner: bigint, index: number) {
    wd(at(object, 8n), 0x165);
    wq(at(object, 0x10n), owner); wq(object, 0x1429f1810n);
    for (const offset of [0x20n, 0x28n, 0x30n]) wq(at(object, offset), 0n);
    wq(at(object, 0x38n), 100000n); wq(at(object, 0x18n), 0n); wd(at(object, 0x40n), index);
    if (q(0x143129e80n) === 0n) {
      const output = at(context.frameBase, 0x20n);
      if (!services.tlsFormat1422aeab0) stop('tls-format', 0x1422aeab0n);
      services.tlsFormat1422aeab0({ output, format: 0x1429f2050n, arg3: 0n, arg4: 0 });
      moveString(0x143129e70n, output); freeString(output);
    }
    wd(at(object, 8n), 0x2a4e);
    return object;
  }
  function state(object: bigint, owner: bigint, definition: bigint) {
    wd(at(object, 8n), 0x165); wq(at(object, 0x18n), 0n); wq(at(object, 0x20n), 0n); ensureAllocator();
    wq(at(object, 0x28n), 0x1430fd000n); wq(at(object, 0x30n), 0n);
    wq(object, 0x1429f17a0n); wq(at(object, 0x10n), 0x1429f17f0n);
    wq(at(object, 0x38n), 0n); wq(at(object, 0x40n), 0n); ensureAllocator(); wq(at(object, 0x48n), 0x1430fd000n);
    vector(at(object, 0x50n));
    for (const offset of [0x68n, 0x80n, 0x98n]) {
      wq(at(object, offset), 0n); wq(at(object, offset + 8n), 0n); ensureAllocator(); wq(at(object, offset + 0x10n), 0x1430fd000n);
    }
    for (const offset of [0xb0n, 0xc8n, 0xe0n, 0xf8n, 0x110n, 0x128n, 0x140n]) vector(at(object, offset));
    wq(at(object, 0x158n), owner); wq(at(object, 0x160n), definition); wq(at(object, 0x168n), 0n); wq(at(object, 0x170n), 0n);
    wd(at(object, 0x180n), 0x29c77f8); wq(at(object, 0x178n), 0x1427963d0n); wq(at(object, 0x188n), 0x142796400n);
    for (const offset of [0x190n, 0x198n, 0x1a0n, 0x1a8n, 0x1b0n, 0x1b8n]) wq(at(object, offset), 0n);
    const sentinel = allocate(0x30n);
    for (const offset of [0n, 8n, 0x10n]) wq(at(sentinel, offset), sentinel);
    memory.writeWord(at(sentinel, 0x18n), 0x101); wq(at(object, 0x1b0n), sentinel);
    wq(at(object, 0x1c0n), 0n); wq(at(object, 0x1c8n), 0n); vector(at(object, 0x1d0n));
    wb(at(object, 0x1e8n), 0); wq(at(object, 0x1ecn), q(0x1433eb2a0n)); wd(at(object, 0x1f4n), 0x4c17);
    wd(at(object, 8n), d(at(definition, 0x3cn)));
    const growth = growthValue();
    reserve(at(object, 0x38n), int(at(definition, 0x254n)), 16, growth);
    const firstCount = int(at(definition, 0x254n));
    for (let index = 0; index < firstCount; index++) {
      registryAvailable(0x1433dd268n, 0x1433ddde8n);
      const reference = at(q(at(definition, 0x248n)), BigInt(index) * 48n), registry = q(0x1433dd268n);
      const record = lookup(services.registry1406c6970, 0x1406c6970n, at(registry, 0x40n), reference, at(registry, 0x58n));
      if (byte(at(record, 0x20n)) === 0) continue;
      const temporary = at(context.frameBase, 0x30n);
      wq(temporary, record); wd(at(temporary, 8n), d(at(at(q(at(definition, 0x248n)), BigInt(index) * 48n), 0x28n)));
      append(at(object, 0x38n), { address: temporary, width: 16 }, growth);
    }
    reserve(at(object, 0x50n), int(at(definition, 0x26cn)), 8, growth);
    const traitsCount = int(at(definition, 0x26cn));
    for (let index = 0; index < traitsCount; index++) {
      const registry = q(0x1433df180n);
      if (registry === 0n) stop('trait-registry-initialization', 0x140705660n);
      if (!services.registry140705890) stop('registry-140705890', 0x140705890n);
      const record = u64(services.registry140705890(registry, at(q(at(definition, 0x260n)), BigInt(index) * 40n)));
      const target = q(at(q(record), 0x50n));
      if (!services.traitActiveVirtual50) stop('trait-active', target);
      if ((services.traitActiveVirtual50({ target, object: record }) & 255) !== 0) append(at(object, 0x50n), pointerPayload(record), growth);
    }
    reserve(at(object, 0x68n), int(at(definition, 0x284n)), 8, growth);
    let current = q(at(definition, 0x278n));
    const filteredEnd = at(current, BigInt(int(at(definition, 0x284n))) * 56n);
    // Native iterator scratch is reused by later constructors, including record padding.
    wq(at(context.frameBase, 0x48n), filteredEnd); wq(at(context.frameBase, 0x50n), filteredEnd);
    wb(at(context.frameBase, 0x59n), 0); wq(at(context.frameBase, 0x30n), current);
    wq(at(context.frameBase, 0x38n), filteredEnd); wb(at(context.frameBase, 0x41n), 1);
    while (current !== filteredEnd) {
      if (evaluate(q(at(current, 0x28n)))) {
        const temporary = at(context.frameBase, 0x48n);
        copyString(temporary, current); wd(at(temporary, 0x20n), d(at(current, 0x20n)));
        registryAvailable(0x1433dd300n, 0x1433dd9f2n);
        const registry = q(0x1433dd300n);
        const record = lookup(services.registry140a34120, 0x140a34120n, at(registry, 0x68n), temporary, at(registry, 0x28n));
        if (byte(at(record, 0x10n)) !== 0) {
          let mask = q(at(record, 0x5a0n));
          if (mask === 0n) mask = q(at(q(at(record, 0x538n)), 0x5a0n));
          mask |= q(at(record, 0x5a8n));
          // Direct 0x14100F620 mask normalization, before 0x140CF4FA0 extracts bit 9.
          if ((mask & 0x80004003c1n) !== 0n) {
            if ((mask & 0x40n) !== 0n) mask &= 0xffff_ffff_ffff_fe7en;
            else if ((mask & 0x80n) !== 0n) mask &= 0xffff_ffff_ffff_fefen;
            else if ((mask & 0x100n) !== 0n) mask &= 0xffff_ffff_ffff_fffen;
          }
          const hidden = (mask >> 9n & 1n) !== 0n;
          if (!hidden || (d(0x1433dd698n) >>> 7 & 1) !== 0) append(at(object, 0x68n), pointerPayload(record), growth);
        }
        freeString(temporary);
      }
      current = at(current, 56n);
    }
    reserve(at(object, 0x80n), int(at(definition, 0x29cn)), 8, growth);
    const fourthCount = int(at(definition, 0x29cn));
    for (let index = 0; index < fourthCount; index++) {
      registryAvailable(0x1433dd300n, 0x1433dd9f2n);
      const registry = q(0x1433dd300n);
      const record = lookup(services.registry140a34020, 0x140a34020n, at(registry, 0xe0n), at(q(at(definition, 0x290n)), BigInt(index) * 40n), at(registry, 0xc8n));
      if (byte(at(record, 0x10n)) !== 0) append(at(object, 0x80n), pointerPayload(record), growth);
    }
    reserve(at(object, 0x98n), int(at(definition, 0x2b4n)), 8, growth);
    current = q(at(definition, 0x2a8n));
    const objectsEnd = at(current, BigInt(int(at(definition, 0x2b4n))) * 24n);
    wq(at(context.frameBase, 0x48n), objectsEnd); wq(at(context.frameBase, 0x50n), objectsEnd);
    wb(at(context.frameBase, 0x59n), 0); wq(at(context.frameBase, 0x30n), current);
    wq(at(context.frameBase, 0x38n), objectsEnd); wb(at(context.frameBase, 0x41n), 1);
    while (current !== objectsEnd) {
      if (evaluate(q(at(current, 8n)))) {
        const record = q(current);
        if (byte(at(record, 0x10n)) !== 0) append(at(object, 0x98n), pointerPayload(record), growth);
      }
      current = at(current, 24n);
    }
    for (let index = 0; index < int(at(definition, 0x2ccn)); index++) {
      registryAvailable(0x1433dd4e8n, 0x1433dde14n);
      const registry = q(0x1433dd4e8n);
      const record = lookup(services.registry140b1a1e0, 0x140b1a1e0n, at(registry, 0x78n), at(q(at(definition, 0x2c0n)), BigInt(index) * 40n), at(registry, 0x90n));
      if (byte(at(record, 0x30n)) === 0) stop('missing-definition-log', 0x14254bce0n);
      append(at(object, 0xf8n), pointerPayload(record), growth);
    }
    current = q(at(definition, 0x380n));
    const lastEnd = at(current, BigInt(int(at(definition, 0x38cn))) * 56n);
    let query = at(current, 8n);
    while (current !== lastEnd) {
      registryAvailable(0x1433dd4e8n, 0x1433dde14n);
      const registry = q(0x1433dd4e8n);
      const record = lookup(services.registry140b1a2e0, 0x140b1a2e0n, at(registry, 0xa8n), query, at(registry, 0xc0n));
      if (byte(at(record, 0x38n)) === 0) stop('missing-definition-log', 0x14254bce0n);
      current = at(current, 56n); query = at(query, 56n);
    }
    const keys = at(object, 0x140n);
    if (keys !== at(definition, 0x368n)) {
      const count = int(at(definition, 0x374n)), source = q(at(definition, 0x368n));
      wd(at(keys, 0xcn), 0); resizeKeys(keys, count); copy(q(keys), source, BigInt(count) * 4n);
    }
    return object;
  }
  function prepare(owner: bigint) {
    const wanted = int(at(q(at(owner, 0x130n)), 0x1348n)), old = int(at(owner, 0xacn));
    if (wanted < old && old !== 0) stop('slot-unassignment', 0x140f60170n);
    if (wanted > int(at(owner, 0xacn))) {
      const growth = growthValue();
      while (wanted > int(at(owner, 0xacn))) {
        const allocation = allocate(0x48n);
        const value = allocation === 0n ? 0n : constructors(memory, { ...context, frameBase: at(context.frameBase, -0x50n) }, services)
          .slot(allocation, owner, d(at(owner, 0xacn)));
        append(at(owner, 0xa0n), pointerPayload(value), growth);
      }
    }
    if (wanted !== old && q(0x1433ddb10n) !== 0n) stop('slot-change-ui', 0x140f6177bn);
    return owner;
  }
  function definitionDatabase() {
    const database = q(0x1433dd4e8n);
    if (byte(0x14368f611n) !== 0 && byte(0x1433dde14n) === 0 && database === 0n) stop('diagnostic-assertion', 0x14254ab40n);
    return database;
  }
  function initialize(owner: bigint) {
    if (int(at(owner, 0x94n)) !== 0) {
      if (byte(0x14368f610n) !== 0 && byte(0x1433eb007n) === 0) stop('diagnostic-assertion', 0x14254ab40n);
      return owner;
    }
    wd(at(owner, 0x138n), d(at(q(at(owner, 0x130n)), 8n)));
    const database = definitionDatabase(), count = (int(at(database, 0x54n)) - 1) | 0, entries = at(owner, 0x88n);
    // Direct 0x140204CD0 pointer-vector resize with a zero qword initializer.
    if (count <= int(at(entries, 0xcn))) wd(at(entries, 0xcn), count);
    else {
      reserve(entries, count, 8, growthValue());
      const previous = int(at(entries, 0xcn)), added = (count - previous) | 0;
      if (added > 0) memory.writeBytes(at(q(entries), BigInt(previous) * 8n), new Uint8Array(added * 8));
      wd(at(entries, 0xcn), count);
    }
    for (let index = 0; index < count; index++) {
      const registry = definitionDatabase(), id = (index + 1) | 0;
      if (byte(0x14368f611n) !== 0 && byte(0x1433e7c0dn) === 0 && int(at(registry, 0x54n)) <= 0) stop('diagnostic-assertion', 0x14254ab40n);
      const definition = q(at(q(at(registry, 0x48n)), id >= 1 && id < int(at(registry, 0x54n)) ? BigInt(id) * 8n : 0n));
      if (byte(at(definition, 0x40n)) === 0) continue;
      const allocation = allocate(0x1f8n);
      const value = allocation === 0n ? 0n : constructors(memory, { ...context, frameBase: at(context.frameBase, -0x250n) }, services)
        .state(allocation, owner, definition);
      wq(at(q(entries), BigInt(index) * 8n), value);
    }
    constructors(memory, { ...context, frameBase: at(context.frameBase, -0x60n) }, services).prepare(owner);
    if (graphServices !== undefined) {
      const result = initializeConstructedResearchGraph(memory, owner, { entryStack: context.frameBase, tlsBlock: context.tlsBlock }, graphServices);
      if (result.kind === 'runtime-required') throw new ConstructionStop(result);
      return owner;
    }
    let current = q(entries);
    const end = at(current, BigInt(int(at(entries, 0xcn))) * 8n);
    while (current !== end) {
      if (q(current) !== 0n) stop('research-state-graph', 0x140f5d0b0n);
      current = at(current, 8n);
    }
    return owner;
  }
  return { slot, state, prepare, initialize };
}

function execute(body: () => bigint): ResearchConstructionResult {
  try { return { kind: 'returned', value: body() }; }
  catch (error) { if (error instanceof ConstructionStop) return error.result; throw error; }
}

export function constructResearchSlot(
  memory: ResearchConstructionMemory, object: bigint, owner: bigint, index: number,
  context: ResearchConstructionContext, dependencies: ResearchConstructionDependencies,
): ResearchConstructionResult { return execute(() => constructors(memory, context, dependencies).slot(object, owner, index)); }

export function constructResearchState(
  memory: ResearchConstructionMemory, object: bigint, owner: bigint, definition: bigint,
  context: ResearchConstructionContext, dependencies: ResearchConstructionDependencies,
): ResearchConstructionResult { return execute(() => constructors(memory, context, dependencies).state(object, owner, definition)); }

export type ResearchConstructionStepResult = { kind: 'returned' } | Extract<ResearchConstructionResult, { kind: 'runtime-required' }>;

export function prepareResearchSlots(
  memory: ResearchConstructionMemory, owner: bigint, context: ResearchConstructionContext, dependencies: ResearchConstructionDependencies,
): ResearchConstructionStepResult {
  const result = execute(() => constructors(memory, context, dependencies).prepare(owner));
  return result.kind === 'returned' ? { kind: 'returned' } : result;
}

export function initializeResearchStates(
  memory: ResearchConstructionMemory, owner: bigint, context: ResearchConstructionContext, dependencies: ResearchConstructionDependencies,
): ResearchConstructionStepResult {
  const result = execute(() => constructors(memory, context, dependencies).initialize(owner));
  return result.kind === 'returned' ? { kind: 'returned' } : result;
}

/** Recovered 0x140F60650 construction, slots, links and bounded status propagation. */
export function initializeNativeResearch(
  memory: ResearchConstructionMemory, owner: bigint, context: ResearchConstructionContext,
  constructionServices: ResearchConstructionDependencies, graphServices: ResearchLinksDependencies,
): ResearchConstructionStepResult {
  const result = execute(() => constructors(memory, context, constructionServices, graphServices).initialize(owner));
  return result.kind === 'returned' ? { kind: 'returned' } : result;
}
