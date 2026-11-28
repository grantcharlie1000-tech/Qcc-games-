import { sortResearchCategoryPointers } from './research-category-sort';
import type { ResearchCategorySortServices } from './research-category-sort';
import type { ResearchConstructionMemory } from './research-construction';
export interface ResearchBudgetDependencies {
  categorySort?: ResearchCategorySortServices;
  allocate?(input: { target: bigint; size: bigint; allocator?: bigint; alignment?: number }): bigint;
  release?(input: { target: bigint; pointer: bigint; allocator?: bigint }): void;
  contextMask?(input: { target: bigint }): number;
}
export interface ResearchBudgetContext { entryStack: bigint; tlsBlock: bigint }
export type ResearchBudgetResult = { kind: 'returned'; value: bigint | number; output?: bigint } | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint };
type BudgetOutput = { value: bigint; output: bigint };
class BudgetStop extends Error {
  constructor(readonly result: Extract<ResearchBudgetResult, { kind: 'runtime-required' }>) { super(result.boundary); }
}
const u64 = (value: bigint) => BigInt.asUintN(64, value), i64 = (value: bigint) => BigInt.asIntN(64, value);
const at = (address: bigint, offset: bigint) => u64(address + offset);
function budget(memory: ResearchConstructionMemory, context: ResearchBudgetContext, services: ResearchBudgetDependencies) {
  const q = (address: bigint) => u64(memory.readQword(u64(address)));
  const d = (address: bigint) => memory.readDword(u64(address)) >>> 0;
  const int = (address: bigint) => d(address) | 0, byte = (address: bigint) => memory.readByte(u64(address)) & 255;
  const wq = (address: bigint, value: bigint) => memory.writeQword(u64(address), u64(value));
  const wd = (address: bigint, value: number) => memory.writeDword(u64(address), value >>> 0);
  function stop(boundary: string, nativeAddress: bigint): never { throw new BudgetStop({ kind: 'runtime-required', boundary, nativeAddress }); }
  function copy(destination: bigint, source: bigint, size: bigint) {
    if (size !== 0n) memory.writeBytes(u64(destination), Uint8Array.from({ length: Number(size) }, (_, index) => byte(at(source, BigInt(index)))));
  }
  function tls() { if (int(at(context.tlsBlock, 0x20ecn)) < int(0x1433dd120n)) stop('tls-guard-acquire', 0x1425a0588n); }
  function backing(allocator: bigint): bigint {
    const target = q(at(q(allocator), 0x38n));
    if (target === 0x14020e9e0n) return q(at(allocator, 0x18n));
    if (target === 0x140169400n) return q(at(allocator, 0x48n));
    stop('allocator-getter', target);
  }
  function allocate(allocator: bigint, size: bigint): bigint {
    const target = q(at(q(allocator), 8n));
    if (target === 0x140121d20n) return allocate(backing(allocator), size);
    if (!services.allocate) stop('allocate', target);
    return u64(services.allocate({ target, allocator, size: u64(size), alignment: 8 }));
  }
  function release(allocator: bigint, pointer: bigint) {
    const target = q(at(q(allocator), 0x10n));
    if (target === 0x140122500n) { if (pointer !== at(allocator, 8n)) release(backing(allocator), pointer); return; }
    if (!services.release) stop('release', target);
    services.release({ target, allocator, pointer });
  }
  function growth() { const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, d(0x142795988n), true); return view.getFloat32(0, true); }
  function capacity(old: number, minimum: number, factor: number) {
    const product = Math.fround(Math.fround(old) * factor);
    const value = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    return value < minimum ? minimum : value;
  }
  function initializeVector(header: bigint, slots: 2 | 8) {
    const local = at(header, 0x18n);
    if (slots === 8) wq(at(header, 0x10n), local);
    wq(header, 0n); wq(at(header, 8n), 0n);
    if (slots === 2) wq(at(header, 0x10n), local);
    tls(); wq(local, slots === 2 ? 0x1429f1ed8n : 0x142807920n);
    wq(at(local, slots === 2 ? 0x18n : 0x48n), 0x1430fd000n);
    wd(at(header, 0xcn), 0); release(q(at(header, 0x10n)), q(header)); wq(header, 0n); wd(at(header, 8n), 0);
    const target = q(at(q(local), 0x20n)), expected = slots === 2 ? 0x140169270n : 0x140169290n;
    if (target !== expected) stop('inline-vector-storage', target);
    if (slots === 2) { wq(header, at(local, 8n)); wd(at(header, 8n), slots); }
    else { wd(at(header, 8n), slots); wq(header, at(local, 8n)); }
  }
  function destroyVector(header: bigint, clear: boolean) {
    const pointer = q(header); if (pointer === 0n) return;
    wd(at(header, 0xcn), 0); release(q(at(header, 0x10n)), pointer);
    if (clear) { wq(header, 0n); wd(at(header, 8n), 0); }
  }
  function append(header: bigint, captured: bigint, factor: number, reloadAfterAllocation?: () => bigint) {
    const count = int(at(header, 0xcn)), oldCapacity = int(at(header, 8n));
    if (count !== oldCapacity) { wq(at(q(header), BigInt(count) * 8n), captured); wd(at(header, 0xcn), int(at(header, 0xcn)) + 1); return; }
    const nextCapacity = capacity(oldCapacity, count + 1 | 0, factor);
    const pointer = allocate(q(at(header, 0x10n)), BigInt(nextCapacity >>> 0) * 8n);
    wq(at(pointer, BigInt(int(at(header, 0xcn))) * 8n), reloadAfterAllocation ? reloadAfterAllocation() : captured);
    copy(pointer, q(header), u64(BigInt(int(at(header, 0xcn))) * 8n));
    const nextCount = int(at(header, 0xcn)) + 1 | 0;
    wd(at(header, 0xcn), 0); release(q(at(header, 0x10n)), q(header));
    wq(header, pointer); wd(at(header, 8n), nextCapacity); wd(at(header, 0xcn), nextCount);
  }
  function insert(header: bigint, position: number, source: bigint, count: number) {
    const wanted = int(at(header, 0xcn)) + count | 0;
    if (int(at(header, 8n)) < wanted) {
      const nextCapacity = capacity(int(at(header, 8n)), wanted, growth());
      const pointer = allocate(q(at(header, 0x10n)), BigInt(nextCapacity >>> 0) * 8n);
      copy(at(pointer, BigInt(position) * 8n), source, u64(BigInt(count) * 8n)); copy(pointer, q(header), u64(BigInt(position) * 8n));
      const tail = at(q(header), BigInt(position) * 8n);
      copy(at(pointer, BigInt(count + position) * 8n), tail, u64(at(q(header), BigInt(int(at(header, 0xcn))) * 8n) - tail) & ~7n);
      const nextCount = int(at(header, 0xcn)) + count | 0;
      wd(at(header, 0xcn), 0); release(q(at(header, 0x10n)), q(header));
      wq(header, pointer); wd(at(header, 8n), nextCapacity); wd(at(header, 0xcn), nextCount); return;
    }
    copy(at(q(header), BigInt(int(at(header, 0xcn))) * 8n), source, u64(BigInt(count) * 8n));
    const pointer = q(header), oldEnd = at(pointer, BigInt(int(at(header, 0xcn))) * 8n), middle = at(pointer, BigInt(position) * 8n);
    wd(at(header, 0xcn), int(at(header, 0xcn)) + count);
    const end = at(pointer, BigInt(int(at(header, 0xcn))) * 8n);
    function reverse(begin: bigint, limit: bigint) {
      for (let left = begin, right = at(limit, -8n); left < right; left = at(left, 8n), right = at(right, -8n)) { const value = q(left); wq(left, q(right)); wq(right, value); }
    }
    if (middle !== oldEnd && oldEnd !== end) { reverse(middle, oldEnd); reverse(oldEnd, end); reverse(middle, end); }
  }
  function sort(header: bigint, entryStack: bigint) {
    const result = sortResearchCategoryPointers(memory, header, entryStack, services.categorySort);
    if (result.kind === 'runtime-required') stop(result.boundary, result.nativeAddress);
  }
  function intersection(output: bigint, leftHeader: bigint, rightHeader: bigint, resultAddress: bigint, rightEndSlot: bigint) {
    let left = q(leftHeader), right = q(rightHeader);
    const leftEnd = at(left, BigInt(int(at(leftHeader, 0xcn))) * 8n), factor = left === leftEnd ? 0 : growth();
    while (left !== leftEnd && right !== q(rightEndSlot)) { const value = q(left), other = q(right); if (value < other) left = at(left, 8n); else { if (value === other) { append(output, value, factor, () => q(left)); left = at(left, 8n); } right = at(right, 8n); } }
    wq(resultAddress, output);
  }
  function country(identifier: bigint) {
    if (byte(0x14368f611n)) {
      if (!byte(0x1433dd130n) && q(0x1433dd6b0n) === 0n) stop('diagnostic-assertion', 0x14254ab40n);
      if (!byte(0x1433dd131n)) {
        if (!byte(at(context.tlsBlock, 0x20e8n))) stop('tls-initialize', 0x1425a04d0n);
        if (int(at(context.tlsBlock, 0x10n)) !== 0) stop('diagnostic-assertion', 0x14254ab40n);
      }
    }
    const world = q(0x1433dd6b0n); let index = 0;
    if (d(identifier) !== 0) index = world === 0n ? int(identifier) : int(at(q(at(world, 0x340n)), BigInt(int(identifier)) * 4n));
    return q(at(q(at(world, 0x310n)), BigInt(index) * 8n));
  }
  function modifier(collection: bigint, output: bigint, key: number) {
    let remaining = BigInt(int(at(collection, 0xcn))), current = q(collection); const end = at(current, remaining * 16n);
    while (remaining > 0n) { const half = remaining >> 1n; if (d(at(current, half * 16n)) < key) current = at(current, (half + (remaining & 1n)) * 16n); remaining = half; }
    let value = 0n;
    if (current !== end && key >= d(current)) {
      const offset = BigInt(key | 0) * 120n; let registry = q(0x1433dd1d0n); const descriptor = at(registry, offset); let accepted = true;
      if (d(at(descriptor, 0x68n)) !== 0) {
        const target = q(0x1433de580n);
        if (target === 0n) accepted = false;
        else { if (!services.contextMask) stop('context-mask', target); const mask = services.contextMask({ target }) >>> 0; accepted = (d(at(descriptor, 0x68n)) & mask) !== 0; if (accepted) registry = q(0x1433dd1d0n); }
      }
      if (accepted) { value = i64(q(at(current, 8n))); if (d(at(at(registry, offset), 0x60n)) & 16) value = value < 0n ? 0n : value > 100000n ? 100000n : value; }
    }
    wq(output, value);
  }
  function typeModifier(definition: bigint, output: bigint, identifier: bigint, entryStack: bigint) {
    wq(at(entryStack, 0x18n), identifier);
    const resolved = country(identifier), type = int(at(definition, 0x520n));
    modifier(at(resolved, 0x5b8n), output, type === 1 ? 0x245 : type === 2 ? 0x246 : type === 3 ? 0x244 : 0);
    const count = int(at(definition, 0x38cn)); if (count < 1) return; let record = q(at(definition, 0x380n));
    for (let index = 0; index < count; index++, record = at(record, 56n)) {
      let text = at(record, 8n); if (q(at(record, 0x20n)) > 15n) text = q(text); if (q(at(record, 0x18n)) !== 30n) continue;
      let equal = true; for (let offset = 0n; offset < 30n; offset++) if (byte(at(text, offset)) !== byte(at(0x1429c1448n, offset))) { equal = false; break; }
      if (equal) { const temporary = at(entryStack, 8n); modifier(at(resolved, 0x5b8n), temporary, 0x247); wq(output, q(output) + q(temporary)); return; }
    }
  }
  function entryReference(address: bigint) {
    if (byte(0x14368f611n) && !byte(0x1433eb00bn) && q(address) === 0n) stop('diagnostic-assertion', 0x14254ab40n); return q(address);
  }
  function reductions(state: bigint, output: bigint, entryStack: bigint) {
    const owner = q(at(state, 0x158n)); let current = q(at(owner, 0x100n)); const end = at(current, BigInt(int(at(owner, 0x10cn))) * 8n);
    const frame = at(entryStack, -0x1c8n), endSlot = at(frame, 0x1e0n); wq(endSlot, end);
    if (current === end) return; const factor = growth(); let total = 0n;
    for (; current !== q(endSlot); current = at(current, 8n)) {
      const entry = entryReference(current); if (int(at(entry, 0x28n)) < 1) continue;
      let definition = q(at(entry, 0x10n)); const definitionsEnd = at(definition, BigInt(int(at(entry, 0x1cn))) * 8n), wanted = q(at(state, 0x160n));
      while (definition !== definitionsEnd && q(definition) !== wanted) definition = at(definition, 8n);
      if (definition === definitionsEnd) {
        const result = at(frame, 0x110n), stateCategories = at(frame, 0xa0n), entryCategories = at(frame, 0x30n);
        initializeVector(result, 8); const stateCount = int(at(state, 0x104n)), statePointer = q(at(state, 0xf8n));
        initializeVector(stateCategories, 8); insert(stateCategories, int(at(stateCategories, 0xcn)), statePointer, stateCount);
        const entryCount = int(at(entry, 0x64n)), entryPointer = q(at(entry, 0x58n));
        initializeVector(entryCategories, 8); insert(entryCategories, int(at(entryCategories, 0xcn)), entryPointer, entryCount);
        sort(stateCategories, at(frame, -8n)); sort(entryCategories, at(frame, -8n));
        wq(at(frame, 0x28n), result);
        wq(at(frame, 0x20n), at(q(entryCategories), BigInt(int(at(entryCategories, 0xcn))) * 8n));
        intersection(result, stateCategories, entryCategories, at(frame, 0x1e8n), at(frame, 0x20n));
        const matched = int(at(result, 0xcn)) !== 0;
        destroyVector(entryCategories, true); destroyVector(stateCategories, true); destroyVector(result, true); if (!matched) continue;
      }
      const selected = entryReference(current); if (i64(q(at(selected, 8n)) + total) >= 100000n) continue;
      const reloaded = entryReference(current); total = i64(total + q(at(reloaded, 8n))); append(output, q(current), factor);
    }
  }
  function cost(state: bigint, output: bigint, identifier: bigint, entryStack: bigint) {
    // These argument homes are reloaded by substantive native instructions after callbacks.
    wq(at(entryStack, 0x20n), 0n); wq(at(entryStack, 0x18n), identifier);
    wq(at(entryStack, 0x10n), output); wq(at(entryStack, 8n), state);
    const frame = at(entryStack, -0x338n), categoryOutput = at(frame, 0x50n);
    wd(categoryOutput, 0); wq(output, q(at(q(at(state, 0x160n)), 0x528n))); const resolved = country(identifier);
    let current = q(at(state, 0xf8n)); const end = at(current, BigInt(int(at(state, 0x104n))) * 8n), hadCategories = current !== end; let adjustment = 0n, tooltip = 0n;
    while (current !== end) { const entry = q(current); if (int(at(entry, 0x50n)) !== 0) { modifier(at(resolved, 0x5b8n), categoryOutput, d(at(entry, 0x50n))); adjustment = i64(adjustment + q(categoryOutput)); } current = at(current, 8n); }
    if (hadCategories) { tooltip = q(at(entryStack, 0x20n)); state = q(at(entryStack, 8n)); }
    identifier = q(at(entryStack, 0x18n));
    const typeOutput = at(frame, 0xd0n); typeModifier(q(at(state, 0x160n)), typeOutput, identifier, at(frame, -8n)); adjustment = i64(adjustment + q(typeOutput));
    const entries = at(frame, 0x78n); initializeVector(entries, 2); reductions(state, entries, at(frame, -8n));
    current = q(entries); const reductionsEnd = at(current, BigInt(int(at(entries, 0xcn))) * 8n);
    while (current !== reductionsEnd) { adjustment = i64(adjustment - q(at(q(current), 8n))); current = at(current, 8n); }
    wq(at(entryStack, 0x20n), -100000n); const bounded = adjustment < -100000n ? -100000n : adjustment > 100000n ? 100000n : adjustment;
    output = q(at(entryStack, 0x10n));
    wq(output, i64((bounded + 100000n) * q(output)) / 100000n);
    if (tooltip !== 0n) stop('budget-tooltip', 0x140b23890n);
    destroyVector(entries, false); return { value: i64(q(output)), output };
  }
  function resource(object: bigint, output: bigint, type: number) {
    let value = 0n;
    if (type === 1 || type === 2 || type === 3) {
      const raw = i64(q(at(object, type === 1 ? 0x10n : type === 2 ? 0x28n : 0x40n))), whole = BigInt.asIntN(32, raw >> 15n);
      if (whole > 0x36f9bfb1n || whole < -0x36f9bfb1n) {
        if (byte(0x14368f610n) && !byte(whole > 0n ? 0x143691820n : 0x143691821n)) stop('diagnostic-assertion', 0x14254ab40n);
        value = whole > 0n ? 0x53e2d61fd320n : -0x53e2d61fd321n;
      } else { const product = i64(0xc3500000n * i64(raw - (whole << 15n))); value = i64(whole * 100000n + BigInt.asIntN(32, i64((product >> 15n) + 0x4000n) >> 15n)); }
    } else if (byte(0x14368f610n) && !byte(0x143437d82n)) stop('diagnostic-assertion', 0x14254ab40n);
    wq(output, value); return { value: i64(q(output)), output };
  }
  function status(state: bigint, capturedCountry: bigint) {
    const resourceOutput = at(context.entryStack, 0x10n), costOutput = at(context.entryStack, 0x20n), type = int(at(q(at(state, 0x160n)), 0x520n));
    if (type === 4) wq(resourceOutput, 0n);
    else { const ownerCountry = q(at(q(at(state, 0x158n)), 0x130n)), object = q(at(ownerCountry, 0x1588n)); resource(object, resourceOutput, int(at(q(at(state, 0x160n)), 0x520n))); }
    const result = cost(state, costOutput, at(capturedCountry, 8n), at(context.entryStack, -0x50n)); return i64(q(resourceOutput)) < result.value ? 2 : 6;
  }
  return { cost, resource, status };
}
function execute(operation: () => BudgetOutput | number): ResearchBudgetResult {
  try { const result = operation(); return typeof result === 'number' ? { kind: 'returned', value: result } : { kind: 'returned', ...result }; }
  catch (error) { if (error instanceof BudgetStop) return error.result; throw error; }
}
/** Ordinary null-tooltip F5BB10, preserving output writes before runtime stops. */
export function computeResearchBudgetCost(memory: ResearchConstructionMemory, state: bigint, output: bigint, countryIdAddress: bigint, context: ResearchBudgetContext, services: ResearchBudgetDependencies = {}): ResearchBudgetResult {
  return execute(() => budget(memory, context, services).cost(u64(state), u64(output), u64(countryIdAddress), context.entryStack));
}
/** Original 1338750 and 142572DB0 resource conversion. */
export function readResearchBudgetResource(memory: ResearchConstructionMemory, resource: bigint, output: bigint, type: number): ResearchBudgetResult {
  return execute(() => budget(memory, { entryStack: 0n, tlsBlock: 0n }, {}).resource(u64(resource), u64(output), type | 0));
}
/** Positive-budget F5B910 portion after eligibility and the caller gates succeed. */
export function evaluateResearchBudget(memory: ResearchConstructionMemory, state: bigint, country: bigint, context: ResearchBudgetContext, services: ResearchBudgetDependencies = {}): ResearchBudgetResult {
  return execute(() => budget(memory, context, services).status(u64(state), u64(country)));
}
