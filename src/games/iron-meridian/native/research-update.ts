import type { ResearchDailyMemory } from './research-daily';
import { researchDaily } from './research-daily';
import type { ResearchModifierDependencies } from './research-modifiers';

export interface ResearchUpdateMemory extends ResearchDailyMemory {
  writeDword(address: bigint, value: number): void;
  writeQword(address: bigint, value: bigint): void;
}

export interface ResearchUpdateDependencies {
  modifiers: ResearchModifierDependencies;
  incrementObserver1422997a0?(input: { value: bigint; sourceFile: bigint; sourceLine: number; context: bigint }): void;
  categoryUpdate140ee7300?(input: { collection: bigint; key: number; value: number }): void;
  resolveReference142284870?(referenceAddress: bigint): bigint;
  matchedEntryUpdate14146a440?(entry: bigint): void;
  prepareSlots140f615c0?(owner: bigint): void;
  profileEnter142551e20?(): void;
  profileExit142552500?(): void;
}

export type ResearchUpdateResult =
  | { kind: 'returned' }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint }
  | { kind: 'divide-error'; nativeAddress: bigint };

const u64 = (value: bigint) => BigInt.asUintN(64, value);
const i64 = (value: bigint) => BigInt.asIntN(64, value);
const at = (address: bigint, offset: bigint) => u64(address + offset);
const returned = (): ResearchUpdateResult => ({ kind: 'returned' });
const required = (boundary: string, nativeAddress: bigint): ResearchUpdateResult => ({ kind: 'runtime-required', boundary, nativeAddress });

function raw(memory: ResearchUpdateMemory) {
  return {
    byte: (address: bigint) => memory.readByte(u64(address)) & 255,
    dword: (address: bigint) => memory.readDword(u64(address)) >>> 0,
    int: (address: bigint) => memory.readDword(u64(address)) | 0,
    pointer: (address: bigint) => u64(memory.readQword(u64(address))),
    scalar: (address: bigint) => i64(memory.readQword(u64(address))),
  };
}

function threshold(memory: ResearchUpdateMemory, state: bigint): bigint {
  const { byte, pointer, scalar } = raw(memory);
  if (byte(0x1433ddad1n) !== 0) return 100_000n;
  return i64(scalar(at(pointer(at(state, 0x160n)), 0x3e0n)) * scalar(0x1433e41e0n)) / 100_000n;
}

/** VA 0x140F52040. Stops retain writes already performed by the original instructions. */
export function researchProgressUpdate(
  memory: ResearchUpdateMemory, state: bigint, increment: bigint,
  bookkeepingMode: number, updateCategories: boolean, dependencies: ResearchUpdateDependencies,
): ResearchUpdateResult {
  const { dword, int, pointer, scalar } = raw(memory);
  increment = i64(increment); bookkeepingMode |= 0;
  if (!dependencies.incrementObserver1422997a0) return required('increment-observer', 0x1422997a0n);
  // This runtime diagnostic/trace routine is called even when increment is zero.
  dependencies.incrementObserver1422997a0({ value: u64(increment), sourceFile: 0x14279471dn, sourceLine: 0x4a7, context: 0n });
  if (increment === 0n) return returned();
  if (updateCategories) {
    const definition = pointer(at(state, 0x160n));
    let current = pointer(at(definition, 0x368n));
    const end = at(current, BigInt(int(at(definition, 0x374n))) * 4n);
    while (current !== end) {
      const owner = pointer(at(state, 0x158n));
      const value = dword(0x1433e515cn), key = dword(current);
      const collection = pointer(at(pointer(at(owner, 0x130n)), 0xfa8n));
      if (!dependencies.categoryUpdate140ee7300) return required('category-update', 0x140ee7300n);
      dependencies.categoryUpdate140ee7300({ collection, key, value });
      current = at(current, 4n);
    }
  }
  const maximum = threshold(memory, state), old = scalar(at(state, 0x198n));
  const bounded = (value: bigint) => maximum < value ? maximum : value < 0n ? 0n : value;
  const oldBounded = bounded(old), next = i64(old + increment);
  memory.writeQword(at(state, 0x198n), u64(next));
  const delta = i64(bounded(next) - oldBounded);
  let resolved = 0n;
  const reference = at(state, 0x1ecn);
  if (dword(reference) !== 0 || dword(at(reference, 4n)) !== 0) {
    if (!dependencies.resolveReference142284870) return required('resolve-reference', 0x142284870n);
    resolved = u64(dependencies.resolveReference142284870(reference));
    if (resolved !== 0n && bookkeepingMode < 2 && delta !== 0n) {
      // Native 0x140EFA9E0 allocates/looks up a tree value before later mutation/deletion.
      return required('bookkeeping-tree', 0x140efa9e0n);
    }
  }
  if (bookkeepingMode < 1) memory.writeDword(at(state, 0x1f4n), resolved === 0n ? 0x165 : dword(at(resolved, 0x38n)));
  const scaledIncrement = i64(increment * scalar(at(state, 0x1a0n))) / 100_000n;
  memory.writeQword(at(state, 0x1a8n), u64(scalar(at(state, 0x1a8n)) + scaledIncrement));
  return returned();
}

function eligibleDefinition(
  memory: ResearchUpdateMemory, database: bigint, definition: bigint, dependencies: ResearchUpdateDependencies,
): { kind: 'pointer'; value: bigint } | ResearchUpdateResult {
  const { byte, int, dword, pointer } = raw(memory);
  function strings(left: bigint, right: bigint): number | ResearchUpdateResult {
    if (dword(0x143694cccn) !== 0) {
      return dependencies.modifiers.localeCompare1425d05d0({ target: 0x1425d05d0n, left, right }) | 0;
    }
    if (left === 0n || right === 0n) return required('invalid-string-argument', 0x1425d059an);
    for (;;) {
      const a = byte(left), b = byte(right);
      const foldedA = a >= 65 && a <= 90 ? a + 32 : a;
      const foldedB = b >= 65 && b <= 90 ? b + 32 : b;
      if (foldedA !== foldedB || foldedA === 0) return foldedA - foldedB;
      left = at(left, 1n); right = at(right, 1n);
    }
  }
  let current = pointer(at(definition, 0x380n));
  const end = at(current, BigInt(int(at(definition, 0x38cn))) * 0x38n);
  while (current !== end) {
    for (let index = 0; index < int(at(database, 0xb4n)); index = (index + 1) | 0) {
      const record = pointer(at(pointer(at(database, 0xa8n)), BigInt(index) * 8n));
      if (byte(at(record, 0x38n)) === 0 || dword(at(current, 0x28n)) !== dword(at(record, 0x28n))) continue;
      const right = pointer(at(record, 0x20n)) > 15n ? pointer(at(record, 8n)) : at(record, 8n);
      const left = pointer(at(current, 0x20n)) > 15n ? pointer(at(current, 8n)) : at(current, 8n);
      const comparison = strings(left, right);
      if (typeof comparison !== 'number') return comparison;
      if (comparison !== 0) continue;
      if (int(at(record, 0x84n)) !== 0) return required('eligibility-condition', 0x140b22ed3n);
      // The native branch reloads the collection after matching, rather than returning the local record.
      return { kind: 'pointer', value: pointer(at(pointer(at(database, 0xa8n)), BigInt(index) * 8n)) };
    }
    current = at(current, 0x38n);
  }
  if (byte(0x14368f611n) !== 0 && byte(0x1433e7c02n) === 0 && pointer(0x1433e7bf8n) === 0n) {
    return required('eligibility-default-assertion', 0x140b22f7cn);
  }
  return { kind: 'pointer', value: pointer(0x1433e7bf8n) };
}

/** VA 0x140F565B0, including real composed rate calculation and raw progress writes. */
export function researchSlotUpdate(
  memory: ResearchUpdateMemory, slot: bigint, dependencies: ResearchUpdateDependencies,
): ResearchUpdateResult {
  const { byte, dword, int, pointer, scalar } = raw(memory);
  let state = pointer(at(slot, 0x18n));
  if (state === 0n) {
    const maximum = scalar(0x1433e4098n), next = i64(scalar(at(slot, 0x20n)) + 100_000n);
    memory.writeQword(at(slot, 0x20n), u64(next < maximum ? next : maximum));
    return returned();
  }
  // Original 0x14033B3E0 accessor, with its diagnostic branch left explicit.
  const database = pointer(0x1433dd4e8n);
  if (byte(0x14368f611n) !== 0 && byte(0x1433dde14n) === 0 && database === 0n) {
    return required('definition-database-assertion', 0x14033b402n);
  }
  const eligibility = eligibleDefinition(memory, database, pointer(at(state, 0x160n)), dependencies);
  if (eligibility.kind !== 'pointer') return eligibility;
  state = pointer(at(slot, 0x18n));
  if (byte(at(eligibility.value, 0x38n)) === 0) return required('ineligible-state-reset', 0x140f5f820n);
  const daily = researchDaily(memory, state, dependencies.modifiers);
  if (daily.kind === 'runtime-required') return required(daily.boundary, daily.nativeAddress);
  if (daily.kind === 'divide-error') return { kind: 'divide-error', nativeAddress: 0x140f53404n };
  const updated = researchProgressUpdate(memory, state, daily.value, 0, true, dependencies);
  if (updated.kind !== 'returned') return updated;
  let current = pointer(at(state, 0x1d0n));
  const end = at(current, BigInt(int(at(state, 0x1dcn))) * 4n);
  while (current !== end) {
    const owner = pointer(at(state, 0x158n)), key = dword(current);
    const count = int(at(owner, 0xf4n));
    for (let index = 0; index < count; index++) {
      const entry = pointer(at(pointer(at(owner, 0xe8n)), BigInt(index) * 8n));
      if (dword(at(entry, 0x30n)) !== key) continue;
      if (entry !== 0n) {
        if (!dependencies.matchedEntryUpdate14146a440) return required('matched-entry-update', 0x14146a440n);
        dependencies.matchedEntryUpdate14146a440(entry);
      }
      break;
    }
    current = at(current, 4n);
  }
  return returned();
}

/** VA 0x140F56740. Capacity maintenance and nonempty completion remain declared boundaries. */
export function researchOwnerUpdate(
  memory: ResearchUpdateMemory, owner: bigint, dependencies: ResearchUpdateDependencies,
): ResearchUpdateResult {
  const { int, pointer, scalar } = raw(memory);
  if (!dependencies.profileEnter142551e20) return required('profile-enter', 0x142551e20n);
  dependencies.profileEnter142551e20();
  if (!dependencies.prepareSlots140f615c0) return required('prepare-slots', 0x140f615c0n);
  dependencies.prepareSlots140f615c0(owner);
  const count = int(at(owner, 0xacn));
  for (let index = 0; index < count; index++) {
    const slot = pointer(at(pointer(at(owner, 0xa0n)), BigInt(index) * 8n));
    const updated = researchSlotUpdate(memory, slot, dependencies);
    if (updated.kind !== 'returned') return updated;
    const state = pointer(at(slot, 0x18n));
    const maximum = state === 0n ? scalar(0x1433e4098n) : threshold(memory, state);
    const value = state === 0n ? scalar(at(slot, 0x20n)) : scalar(at(state, 0x198n));
    if (maximum <= value && pointer(at(slot, 0x18n)) !== 0n) return required('completion', 0x140f5dd50n);
  }
  if (!dependencies.profileExit142552500) return required('profile-exit', 0x142552500n);
  dependencies.profileExit142552500();
  return returned();
}
