import { evaluateResearchBudget } from './research-budget';
import type { ResearchBudgetDependencies } from './research-budget';
import type { ResearchConstructionMemory } from './research-construction';

export interface ResearchLinksContext {
  /** Native entry RSP, or post-slot-preparation RSP for the initialization caller slice. */
  entryStack: bigint;
  tlsBlock: bigint;
}
export interface ResearchLinksDependencies extends ResearchBudgetDependencies {
  allocate?(input: { target: bigint; size: bigint; allocator?: bigint; alignment?: number }): bigint;
  release?(input: { target: bigint; pointer: bigint; allocator?: bigint }): void;
  localeCompare1425d05d0?(input: { target: bigint; left: bigint; right: bigint }): number;
  observerVirtual10?(input: { target: bigint; observer: bigint; state: bigint; previousStatus: number }): void;
  profileEnter142551e20?(input: { output: bigint; object: bigint; description: bigint; mode: number }): void;
  profileExit142552500?(profile: bigint): void;
  conditionVirtual18?(input: { target: bigint; condition: bigint; context: bigint }): number;
}
export type ResearchLinksResult = { kind: 'returned'; value?: number }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint };

const u64 = (value: bigint) => BigInt.asUintN(64, value);
const at = (address: bigint, offset: bigint) => u64(address + offset);
class LinksStop extends Error {
  constructor(readonly result: Extract<ResearchLinksResult, { kind: 'runtime-required' }>) { super(result.boundary); }
}

function graph(memory: ResearchConstructionMemory, context: ResearchLinksContext, services: ResearchLinksDependencies) {
  const q = (address: bigint) => u64(memory.readQword(u64(address)));
  const d = (address: bigint) => memory.readDword(u64(address)) >>> 0;
  const int = (address: bigint) => d(address) | 0;
  const byte = (address: bigint) => memory.readByte(u64(address)) & 255;
  const wq = (address: bigint, value: bigint) => memory.writeQword(u64(address), u64(value));
  const wd = (address: bigint, value: number) => memory.writeDword(u64(address), value >>> 0);
  const wb = (address: bigint, value: number) => memory.writeByte(u64(address), value & 255);
  function stop(boundary: string, nativeAddress: bigint): never { throw new LinksStop({ kind: 'runtime-required', boundary, nativeAddress }); }
  function copy(destination: bigint, source: bigint, size: bigint) {
    if (size === 0n) return;
    memory.writeBytes(destination, Uint8Array.from({ length: Number(size) }, (_, index) => byte(at(source, BigInt(index)))));
  }
  function allocate(size: bigint, allocator?: bigint): bigint {
    const target = allocator === undefined ? 0x1425a01dcn : q(at(q(allocator), 8n));
    if (!services.allocate) stop('allocate', target);
    return u64(services.allocate({ target, size: u64(size), ...(allocator === undefined ? {} : { allocator, alignment: 8 }) }));
  }
  function release(pointer: bigint, allocator?: bigint) {
    const target = allocator === undefined ? 0x1425a0218n : q(at(q(allocator), 0x10n));
    if (!services.release) stop('release', target);
    services.release({ target, pointer, allocator });
  }
  function strings(left: bigint, right: bigint): number {
    if (d(0x143694cccn) !== 0) {
      if (!services.localeCompare1425d05d0) stop('locale-compare', 0x1425d05d0n);
      return services.localeCompare1425d05d0({ target: 0x1425d05d0n, left, right }) | 0;
    }
    if (left === 0n || right === 0n) stop('invalid-string-argument', 0x1425d059an);
    for (;;) {
      const a = byte(left), b = byte(right), foldedA = a >= 65 && a <= 90 ? a + 32 : a, foldedB = b >= 65 && b <= 90 ? b + 32 : b;
      if (foldedA !== foldedB || foldedA === 0) return foldedA - foldedB;
      left = at(left, 1n); right = at(right, 1n);
    }
  }
  const stringData = (object: bigint) => q(at(object, 0x18n)) > 15n ? q(object) : object;
  function database(): bigint {
    const pointer = q(0x1433dd4e8n);
    if (byte(0x14368f611n) !== 0 && byte(0x1433dde14n) === 0 && pointer === 0n) stop('diagnostic-assertion', 0x14254ab40n);
    return pointer;
  }
  // Direct 0x140B1A3E0 lookup, including raw hash, string and fallback tables.
  function reference(table: bigint, query: bigint, records: bigint): bigint {
    if (byte(0x14368f611n) !== 0 && byte(0x1433e7c0en) === 0 && int(at(table, 0xcn)) !== (int(at(records, 0xcn)) + 1 | 0)) stop('diagnostic-assertion', 0x14254ab40n);
    for (let index = 0; index < int(at(records, 0xcn)); index++) {
      const record = at(q(records), BigInt(index) * 40n);
      if (d(at(record, 0x20n)) === d(at(query, 0x20n)) && strings(stringData(record), stringData(query)) === 0) return q(at(q(table), 8n + BigInt(index) * 8n));
    }
    return q(q(table));
  }
  function resolve(query: bigint): bigint { const db = database(); return reference(at(db, 0x48n), query, at(db, 0x60n)); }
  function capacity(current: number, minimum: number, growth: number): number {
    const product = Math.fround(Math.fround(current) * growth);
    const converted = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    return (converted < minimum ? minimum : converted) >>> 0;
  }
  function growthValue(): number {
    const buffer = new ArrayBuffer(4), view = new DataView(buffer);
    view.setUint32(0, d(0x142795988n), true); return view.getFloat32(0, true);
  }
  // Fixed pointer values are register captures; the destination count is reloaded after allocation.
  function append(address: bigint, value: bigint | { source: bigint }, width: 8 | 32, growth: number, countFirst = false) {
    const writeItem = (destination: bigint) => {
      const payload = typeof value === 'bigint' ? value : q(value.source);
      if (width === 8) wq(destination, payload);
      else { wd(destination, 0); wq(at(destination, 8n), payload); wb(at(destination, 0x10n), 0); wb(at(destination, 0x18n), 0); }
    };
    const count = int(at(address, 0xcn));
    if (count !== int(at(address, 8n))) {
      writeItem(at(q(address), BigInt(count) * BigInt(width))); wd(at(address, 0xcn), (int(at(address, 0xcn)) + 1) | 0); return;
    }
    const nextCapacity = capacity(int(at(address, 8n)), (count + 1) | 0, growth);
    const pointer = allocate(BigInt(nextCapacity) * BigInt(width), q(at(address, 0x10n)));
    writeItem(at(pointer, BigInt(int(at(address, 0xcn))) * BigInt(width)));
    copy(pointer, q(address), BigInt(int(at(address, 0xcn))) * BigInt(width));
    const nextCount = (int(at(address, 0xcn)) + 1) | 0;
    const allocator = q(at(address, 0x10n)), oldPointer = q(address);
    wd(at(address, 0xcn), 0); release(oldPointer, allocator);
    if (countFirst) wd(at(address, 0xcn), nextCount);
    wq(address, pointer); wd(at(address, 8n), nextCapacity);
    if (!countFirst) wd(at(address, 0xcn), nextCount);
  }
  function observe(target: bigint, observer: bigint, growth: number) {
    const storage = q(at(target, 0x30n));
    append(storage === 0n ? at(target, 0x18n) : storage, observer, storage === 0n ? 8 : 32, growth);
  }
  function freeString(address: bigint) {
    const cap = q(at(address, 0x18n));
    if (cap <= 15n) return;
    let pointer = q(address);
    if (u64(cap + 1n) >= 0x1000n) {
      const allocation = q(at(pointer, -8n));
      if (u64(pointer - allocation - 8n) > 31n) stop('invalid-parameter', 0x1425c7db4n);
      pointer = allocation;
    }
    release(pointer);
  }
  // Direct 0x140B1E990 / 0x140C1F080 / 0x14011F030 string-reference path.
  function resolveString(sourceObject: bigint, entryStack: bigint): bigint {
    const db = database(), source = stringData(sourceObject), length = q(at(sourceObject, 0x10n));
    const temporary = at(entryStack, -0xb8n);
    wq(at(temporary, -0x10n), source); wq(at(temporary, -8n), length);
    for (let offset = 0n; offset < 32n; offset += 8n) wq(at(temporary, offset), 0n);
    if (length > 0x7fff_ffff_ffff_ffffn) stop('string-length-error', 0x14012b310n);
    if (length <= 15n) {
      wq(at(temporary, 0x10n), length); wq(at(temporary, 0x18n), 15n); copy(temporary, source, length); wb(at(temporary, length), 0);
    } else {
      let cap = length | 15n;
      if (cap > 0x7fff_ffff_ffff_ffffn) cap = 0x7fff_ffff_ffff_ffffn;
      else if (cap < 22n) cap = 22n;
      let pointer: bigint;
      if (cap + 1n < 0x1000n) pointer = allocate(cap + 1n);
      else {
        const allocation = allocate(u64(cap + 0x28n));
        if (allocation === 0n) stop('invalid-parameter', 0x1425c7db4n);
        pointer = u64(allocation + 0x27n) & ~31n; wq(at(pointer, -8n), allocation);
      }
      wq(temporary, pointer); wq(at(temporary, 0x10n), length); wq(at(temporary, 0x18n), cap);
      copy(pointer, source, length); wb(at(pointer, length), 0);
    }
    let hash = 0x811c9dc5;
    const payload = stringData(temporary), hashLength = int(at(temporary, 0x10n));
    for (let index = 0; index < hashLength; index++) { const value = byte(at(payload, BigInt(index))); hash = Math.imul(hash ^ (value >= 65 && value <= 90 ? value + 32 : value), 0x1000193) >>> 0; }
    wd(at(temporary, 0x20n), hash);
    const found = reference(at(db, 0x48n), temporary, at(db, 0x60n));
    freeString(temporary);
    return found;
  }
  function link(state: bigint, statesVector: bigint, entryStack = context.entryStack) {
    let definition = q(at(state, 0x160n));
    wd(at(state, 0xbcn), 0);
    const growth = growthValue(), childCount = int(at(definition, 0x35cn));
    const stateFor = (record: bigint) => q(at(q(statesVector), BigInt(int(at(record, 0x38n))) * 8n - 8n));
    for (let index = 0; index < childCount; index++) {
      const record = resolve(at(q(at(definition, 0x350n)), BigInt(index) * 40n));
      if (byte(at(record, 0x40n)) === 0) continue;
      const target = stateFor(record); append(at(state, 0xb0n), target, 8, growth, true); wq(at(target, 0x168n), state);
    }
    definition = q(at(state, 0x160n)); wd(at(state, 0xd4n), 0);
    const prerequisiteCount = int(at(definition, 0x314n));
    for (let index = 0; index < prerequisiteCount; index++) {
      const record = resolve(at(q(at(q(at(definition, 0x308n)), BigInt(index) * 8n)), 0x38n));
      if (byte(at(record, 0x40n)) === 0) continue;
      const target = stateFor(record); append(at(state, 0xc8n), target, 8, growth); observe(target, at(state, 0x10n), growth);
    }
    const mutualHeader = at(q(at(state, 0x160n)), 0x338n); wd(at(state, 0xecn), 0);
    const mutualCount = int(at(mutualHeader, 0xcn));
    for (let index = 0; index < mutualCount; index++) {
      const record = resolve(at(q(mutualHeader), BigInt(index) * 40n));
      if (byte(at(record, 0x40n)) === 0) continue;
      const target = stateFor(record); append(at(state, 0xe0n), target, 8, growth); observe(target, at(state, 0x10n), growth);
    }
    const additionalHeader = at(q(at(state, 0x160n)), 0x320n), additionalCount = int(at(additionalHeader, 0xcn));
    for (let index = 0; index < additionalCount; index++) {
      const record = resolveString(at(q(additionalHeader), BigInt(index) * 48n), entryStack);
      if (byte(at(record, 0x40n)) !== 0) observe(stateFor(record), at(state, 0x10n), growth);
    }
  }
  // Direct 0x140B22E30 loop and condition context, retaining the virtual leaf.
  function eligibleCategory(db: bigint, definition: bigint, countryId: bigint, entryStack: bigint): bigint {
    let current = q(at(definition, 0x380n));
    const end = at(current, BigInt(int(at(definition, 0x38cn))) * 56n);
    while (current !== end) {
      for (let index = 0; index < int(at(db, 0xb4n)); index++) {
        const record = q(at(q(at(db, 0xa8n)), BigInt(index) * 8n));
        if (byte(at(record, 0x38n)) === 0 || d(at(current, 0x28n)) !== d(at(record, 0x28n))) continue;
        if (strings(stringData(at(current, 8n)), stringData(at(record, 8n))) !== 0) continue;
        if (int(at(record, 0x84n)) !== 0) {
          const frame = at(entryStack, -0x118n), profile = at(frame, 0x30n), ctx = at(frame, 0x40n);
          enterProfile(profile, record, 0x142860ac8n); contextObject(ctx); bindCountry(ctx, countryId);
          const accepted = condition(at(record, 0x70n), ctx);
          clearContext(ctx); exitProfile(profile);
          if (!accepted) continue;
        }
        return q(at(q(at(db, 0xa8n)), BigInt(index) * 8n));
      }
      current = at(current, 56n);
    }
    const fallback = q(0x1433e7bf8n);
    if (byte(0x14368f611n) !== 0 && byte(0x1433e7c02n) === 0 && fallback === 0n) stop('diagnostic-assertion', 0x14254ab40n);
    return fallback;
  }
  function contextObject(address: bigint) {
    wq(address, 0x142852168n); wd(at(address, 8n), 0); wd(at(address, 0xcn), 1); wd(at(address, 0x10n), 0x5ea6ba9e);
    for (const offset of [0x30n, 0x38n, 0x40n, 0x48n]) wq(at(address, offset), 0n);
    for (const offset of [0x18n, 0x20n, 0x28n]) wq(at(address, offset), address);
    for (const offset of [0x50n, 0x58n]) wq(at(address, offset), q(0x1433eb2a0n));
    wq(at(address, 0x60n), 0n);
    for (let offset = 0x68n; offset <= 0x98n; offset += 8n) wq(at(address, offset), q(0x1433eb2a0n));
    wq(at(address, 0xa0n), 0n); wd(at(address, 0xa8n), 0); wb(at(address, 0xacn), 1);
    const mix = (initial: number, multiplier: number) => {
      const value = initial >>> 0;
      const product = Math.imul((value << 8) ^ value, multiplier);
      return (product ^ product >>> 8) >>> 0;
    };
    wd(at(address, 0x10n), mix(0x10d8365e, 0x6d22f31b)); wd(at(address, 0xcn), mix(0xb4f3c315, 0x387a9f3a));
  }
  function zeroCountryIndex(): number {
    const world = q(0x1433dd6b0n);
    if (world === 0n) return 0;
    if (byte(0x14368f611n) !== 0 && byte(0x1433dd131n) === 0) {
      if (byte(at(context.tlsBlock, 0x20e8n)) === 0) stop('tls-initialize', 0x1425a04d0n);
      if (int(at(context.tlsBlock, 0x10n)) !== 0) stop('diagnostic-assertion', 0x14254ab40n);
    }
    const count = int(at(world, 0x34cn));
    if (count === 0) return 0;
    for (let index = 0; index < count; index++) if (d(at(q(at(world, 0x340n)), BigInt(index) * 4n)) === 0) return index;
    if (byte(0x14368f610n) !== 0 && byte(0x1433dd807n) === 0) stop('diagnostic-assertion', 0x14254ab40n);
    return 0;
  }
  function bindCountry(address: bigint, countryId: bigint) {
    wd(at(address, 8n), zeroCountryIndex());
    wq(at(address, 0x48n), 0n);
    for (const offset of [0x50n, 0x58n]) wq(at(address, offset), q(0x1433eb2a0n));
    wq(at(address, 0x60n), 0n);
    for (let offset = 0x68n; offset <= 0x98n; offset += 8n) wq(at(address, offset), q(0x1433eb2a0n));
    wd(at(address, 0xa8n), 0); wd(at(address, 8n), d(countryId));
  }
  function clearContext(address: bigint) {
    wq(address, 0x142852168n);
    for (const offset of [0x30n, 0x38n, 0x40n]) {
      const owned = q(at(address, offset));
      if (owned !== 0n) stop('condition-owned-destruction', q(q(owned)));
    }
    const storage = q(at(address, 0xa0n));
    if (storage !== 0n) {
      for (const offset of [0x18n, 0n]) {
        if (q(at(storage, offset)) === 0n) continue;
        stop('condition-vector-clear', 0x140201280n);
      }
      release(storage);
    }
  }
  function enterProfile(output: bigint, object: bigint, description: bigint) {
    if (!services.profileEnter142551e20) stop('profile-enter', 0x142551e20n);
    services.profileEnter142551e20({ output, object, description, mode: 3 });
  }
  function exitProfile(profile: bigint) {
    if (!services.profileExit142552500) stop('profile-exit', 0x142552500n);
    services.profileExit142552500(profile);
  }
  function condition(conditionObject: bigint, ctx: bigint): boolean {
    const target = q(at(q(conditionObject), 0x18n));
    if (!services.conditionVirtual18) stop('condition', target);
    return (services.conditionVirtual18({ target, condition: conditionObject, context: ctx }) & 255) !== 0;
  }
  function allowDefinition(definition: bigint, countryId: bigint, visited: bigint, ignorePrerequisites: boolean, entryStack: bigint): boolean {
    if (int(countryId) < 1) return false;
    const frame = at(entryStack, -0x118n), profile = at(frame, 0x30n), ctx = at(frame, 0x40n);
    enterProfile(profile, definition === 0n ? 0n : at(definition, 8n), 0x1429c1630n);
    contextObject(ctx); bindCountry(ctx, countryId);
    let accepted = condition(at(definition, 0xa0n), ctx);
    if (accepted && !ignorePrerequisites) {
      const count = int(at(definition, 0x314n));
      for (let index = 0; index < count; index++) {
        const referenceAddress = at(q(at(q(at(definition, 0x308n)), BigInt(index) * 8n)), 0x38n), child = resolve(referenceAddress);
        let seen = false;
        for (let i = 0; i < int(at(visited, 0xcn)); i++) if (q(at(q(visited), BigInt(i) * 8n)) === child) { seen = true; break; }
        if (seen) continue;
        const temporary = at(frame, 0x128n); wq(temporary, definition);
        append(visited, { source: temporary }, 8, growthValue());
        if (!allowDefinition(child, countryId, visited, false, at(frame, -8n))) { accepted = false; break; }
        if (int(at(visited, 0xcn)) !== 0) wd(at(visited, 0xcn), (int(at(visited, 0xcn)) - 1) | 0);
      }
    }
    clearContext(ctx); exitProfile(profile); return accepted;
  }
  function visibleDefinition(definition: bigint, countryId: bigint, entryStack: bigint): boolean {
    const frame = at(entryStack, -0xe8n), profile = at(frame, 0x20n), ctx = at(frame, 0x30n);
    enterProfile(profile, definition === 0n ? 0n : at(definition, 8n), 0x1429c1640n);
    contextObject(ctx); bindCountry(ctx, countryId);
    const accepted = condition(at(definition, 0xf8n), ctx);
    clearContext(ctx); exitProfile(profile); return accepted;
  }
  function stateFor(owner: bigint, definition: bigint): bigint {
    const id = int(at(definition, 0x38n)), index = (id - 1) | 0;
    if (index >= 0 && index < int(at(owner, 0x94n))) return q(at(q(at(owner, 0x88n)), BigInt(id) * 8n - 8n));
    if (byte(0x14368f610n) !== 0 && byte(0x1433eb00an) === 0) stop('diagnostic-assertion', 0x14254ab40n);
    return 0n;
  }
  function eligibility(owner: bigint, state: bigint, checkParent: number, entryStack: bigint): boolean {
    if (int(at(q(at(state, 0x160n)), 0x3dcn)) <= int(at(state, 0x174n))) return false;
    const slotCount = int(at(owner, 0xacn));
    for (let index = 0; index < slotCount; index++) if (q(at(q(at(q(at(owner, 0xa0n)), BigInt(index) * 8n)), 0x18n)) === state) return false;
    const record = eligibleCategory(database(), q(at(state, 0x160n)), at(q(at(owner, 0x130n)), 8n), at(entryStack, -0x410n));
    if (byte(at(record, 0x38n)) === 0) return false;
    const definition = q(at(state, 0x160n)), visited = at(entryStack, -0x2d8n);
    wq(visited, 0n); wq(at(visited, 8n), 0n);
    if (int(at(context.tlsBlock, 0x20ecn)) < int(0x1433dd120n)) stop('tls-guard-acquire', 0x1425a0588n);
    wq(at(visited, 0x10n), 0x1430fd000n);
    const wanted = int(at(database(), 0x54n));
    if (wanted > int(at(visited, 8n))) {
      const nextCapacity = capacity(int(at(visited, 8n)), wanted, growthValue());
      const pointer = allocate(BigInt(nextCapacity) * 8n, q(at(visited, 0x10n)));
      copy(pointer, q(visited), BigInt(int(at(visited, 0xcn))) * 8n);
      release(q(visited), q(at(visited, 0x10n))); wq(visited, pointer); wd(at(visited, 8n), nextCapacity);
    }
    let accepted = allowDefinition(definition, at(q(at(owner, 0x130n)), 8n), visited, checkParent !== 0, at(entryStack, -0x410n));
    if (accepted) {
      const temporary = at(entryStack, -0x2f8n);
      for (let offset = 0n; offset < 32n; offset += 8n) wq(at(temporary, offset), 0n);
      wq(at(temporary, 0x10n), 0n); wq(at(temporary, 0x18n), 15n); wb(temporary, 0);
      let prerequisiteComplete = int(at(definition, 0x314n)) === 0;
      for (let index = 0; index < int(at(definition, 0x314n)); index++) {
        const dependency = resolve(at(q(at(q(at(definition, 0x308n)), BigInt(index) * 8n)), 0x38n));
        const dependencyState = stateFor(owner, dependency);
        if (int(at(dependencyState, 0x174n)) >= int(at(q(at(dependencyState, 0x160n)), 0x3dcn))) { prerequisiteComplete = true; break; }
      }
      wq(at(temporary, 0x10n), 0n); wb(stringData(temporary), 0);
      for (let index = 0; index < int(at(definition, 0x32cn)); index++) {
        const query = at(q(at(definition, 0x320n)), BigInt(index) * 48n), dependency = resolve(query);
        if (byte(at(dependency, 0x40n)) === 0) stop('missing-definition-log', 0x14254b3f0n);
        if (int(at(stateFor(owner, dependency), 0x174n)) < int(at(at(q(at(definition, 0x320n)), BigInt(index) * 48n), 0x28n))) { accepted = false; break; }
      }
      freeString(temporary);
      if (!prerequisiteComplete) accepted = false;
      else {
        const parent = q(at(state, 0x168n));
        if (parent !== 0n && int(at(parent, 0x174n)) < int(at(q(at(parent, 0x160n)), 0x3dcn))) accepted = false;
        else if (!visibleDefinition(definition, at(q(at(owner, 0x130n)), 8n), at(entryStack, -0x410n))) accepted = false;
      }
    }
    const pointer = q(visited);
    if (pointer !== 0n) { wd(at(visited, 0xcn), 0); release(pointer, q(at(visited, 0x10n))); }
    return accepted;
  }
  function status(owner: bigint, state: bigint, checkParent: number, entryStack = context.entryStack): number {
    for (let index = 0; index < int(at(state, 0xd4n)); index++) {
      const value = int(at(q(at(q(at(state, 0xc8n)), BigInt(index) * 8n)), 0x170n));
      if (value !== 6 && value !== 1) break;
      if (index + 1 >= int(at(state, 0xd4n))) return 1;
    }
    if (int(at(state, 0x174n)) >= int(at(q(at(state, 0x160n)), 0x3dcn))) return 4;
    for (let index = 0; index < int(at(owner, 0xacn)); index++) if (q(at(q(at(q(at(owner, 0xa0n)), BigInt(index) * 8n)), 0x18n)) === state) return 5;
    const mutualCount = int(at(state, 0xecn)), mutual = q(at(state, 0xe0n));
    for (let index = 0; index < mutualCount; index++) {
      const value = d(at(q(at(mutual, BigInt(index) * 8n)), 0x170n));
      if (((value - 4) >>> 0) <= 1) {
        if (eligibility(owner, state, 0, at(entryStack, -0x90n))) {
          const definition = q(at(state, 0x160n)), type = int(at(definition, 0x520n));
          if (type === 0 || BigInt.asIntN(64, q(at(definition, 0x528n))) < 1n || byte(at(state, 0x1e8n)) !== 0) return 6;
          const budget = evaluateResearchBudget(memory, state, q(at(owner, 0x130n)), { entryStack, tlsBlock: context.tlsBlock }, services);
          if (budget.kind === 'runtime-required') stop(budget.boundary, budget.nativeAddress);
          return Number(budget.value);
        }
        break;
      }
    }
    if (eligibility(owner, state, checkParent, at(entryStack, -0x50n))) {
      const parent = q(at(state, 0x168n));
      if (parent === 0n || checkParent === 0 || int(at(parent, 0x170n)) === 3 || int(at(parent, 0x170n)) === 6) return 3;
    }
    return 2;
  }
  function recompute(state: bigint, notify: boolean, checkParent: number, entryStack = context.entryStack) {
    const old = d(at(state, 0x170n)), next = status(q(at(state, 0x158n)), state, checkParent, at(entryStack, -0x40n));
    wd(at(state, 0x170n), next);
    if (next === old) return;
    if (notify) {
      const count = int(at(state, 0x24n));
      for (let index = 0; index < count; index++) {
        const observer = q(at(q(at(state, 0x18n)), BigInt(index) * 8n)), target = q(at(q(observer), 0x10n));
        if (!services.observerVirtual10) stop('observer', target);
        services.observerVirtual10({ target, observer, state, previousStatus: old });
      }
    }
    const count = int(at(state, 0xbcn));
    for (let index = 0; index < count; index++) recompute(q(at(q(at(state, 0xb0n)), BigInt(index) * 8n)), notify, 1, at(entryStack, -0x40n));
  }
  function initialize(owner: bigint) {
    const statesVector = at(owner, 0x88n), entryStack = at(context.entryStack, -8n);
    let current = q(statesVector), end = at(current, BigInt(int(at(statesVector, 0xcn))) * 8n);
    for (; current !== end; current = at(current, 8n)) {
      const state = q(current);
      if (state !== 0n) link(state, statesVector, entryStack);
    }
    current = q(statesVector); end = at(current, BigInt(int(at(statesVector, 0xcn))) * 8n);
    for (; current !== end; current = at(current, 8n)) {
      const state = q(current);
      if (state === 0n || q(at(state, 0x168n)) !== 0n) continue;
      const old = d(at(state, 0x170n)), next = status(q(at(state, 0x158n)), state, 1, entryStack);
      wd(at(state, 0x170n), next);
      if (next === old) continue;
      const count = int(at(state, 0xbcn));
      for (let index = 0; index < count; index++) recompute(q(at(q(at(state, 0xb0n)), BigInt(index) * 8n)), false, 1, entryStack);
    }
  }
  return { link, status, recompute, initialize };
}

function execute(body: () => number | void): ResearchLinksResult {
  try { const value = body(); return value === undefined ? { kind: 'returned' } : { kind: 'returned', value }; }
  catch (error) { if (error instanceof LinksStop) return error.result; throw error; }
}
/** VA 0x140F5D0B0. Requires valid native-effective raw definitions and initialized state pointers. */
export function linkResearchState(memory: ResearchConstructionMemory, state: bigint, statesVector: bigint, context: ResearchLinksContext, services: ResearchLinksDependencies): ResearchLinksResult {
  return execute(() => graph(memory, context, services).link(state, statesVector));
}
/** Bounded VA 0x140F5B910; checkParent is the native R8B argument. */
export function evaluateResearchStatus(memory: ResearchConstructionMemory, owner: bigint, state: bigint, checkParent: number, context: ResearchLinksContext, services: ResearchLinksDependencies): ResearchLinksResult {
  return execute(() => graph(memory, context, services).status(owner, state, checkParent & 255));
}
/** VA 0x140F53500 observer and recursive mutation order over the bounded status evaluator. */
export function recomputeResearchState(memory: ResearchConstructionMemory, state: bigint, notify: boolean, checkParent: number, context: ResearchLinksContext, services: ResearchLinksDependencies): ResearchLinksResult {
  return execute(() => graph(memory, context, services).recompute(state, notify, checkParent & 255));
}
/** Original 0x140F607E7..0x140F60896 caller slice, after construction and slot preparation. */
export function initializeConstructedResearchGraph(memory: ResearchConstructionMemory, owner: bigint, context: ResearchLinksContext, services: ResearchLinksDependencies): ResearchLinksResult {
  return execute(() => graph(memory, context, services).initialize(owner));
}
