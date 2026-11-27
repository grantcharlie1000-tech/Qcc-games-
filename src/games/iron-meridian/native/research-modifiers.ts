export interface ResearchModifierMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
}

export interface ResearchModifierDependencies {
  entryVirtual78(input: { target: bigint; entry: bigint }): { begin: bigint; end: bigint };
  resolveCountry140c07bf0(countryIdAddress: bigint): bigint;
  resolveGroup140c08790(countryIdAddress: bigint): number;
  entryVirtual80(input: { target: bigint; entry: bigint; definition: bigint; countryIdAddress: bigint }): number;
  contextMask(input: { target: bigint }): number;
  localeCompare1425d05d0(input: { target: bigint; left: bigint; right: bigint }): number;
}

export interface ResearchModifierResult {
  readonly stack30: bigint;
  readonly stack38: bigint;
  readonly temporarySourceEntries: readonly bigint[];
}

const u64 = (value: bigint) => BigInt.asUintN(64, value);
const i64 = (value: bigint) => BigInt.asIntN(64, value);
const at = (address: bigint, offset: bigint) => u64(address + offset);

/** Daily caller path of VA 0x140F537E0: arg3=0, arg4 flag=false, arg5=null. */
export function researchModifiersDaily(
  memory: ResearchModifierMemory,
  state: bigint,
  dependencies: ResearchModifierDependencies,
): ResearchModifierResult {
  const byte = (address: bigint) => memory.readByte(u64(address)) & 255;
  const dword = (address: bigint) => memory.readDword(u64(address)) >>> 0;
  const signedDword = (address: bigint) => dword(address) | 0;
  const pointer = (address: bigint) => u64(memory.readQword(u64(address)));
  const scalar = (address: bigint) => i64(memory.readQword(u64(address)));
  const country = () => pointer(at(pointer(at(state, 0x158n)), 0x130n));

  // VAs 0x140C08790/0x140C07BF0: initialized world lookup; unresolved TLS/assertion paths stay explicit.
  function resolveGroup(countryIdAddress: bigint): number {
    const world = pointer(0x1433dd6b0n);
    if (world === 0n) return dword(countryIdAddress);
    if (byte(0x14368f611n) !== 0 && byte(0x1433dd131n) === 0) {
      return dependencies.resolveGroup140c08790(countryIdAddress) >>> 0;
    }
    return dword(at(pointer(at(world, 0x340n)), BigInt(signedDword(countryIdAddress)) * 4n));
  }

  function resolveCountry(countryIdAddress: bigint): bigint {
    if (byte(0x14368f611n) !== 0 &&
        ((byte(0x1433dd130n) === 0 && pointer(0x1433dd6b0n) === 0n) || byte(0x1433dd131n) === 0)) {
      return u64(dependencies.resolveCountry140c07bf0(countryIdAddress));
    }
    const world = pointer(0x1433dd6b0n);
    const index = dword(countryIdAddress) === 0 ? 0 : resolveGroup(countryIdAddress) | 0;
    return pointer(at(pointer(at(world, 0x310n)), BigInt(index) * 8n));
  }

  // VA 0x1405A5210: unsigned-key lower bound in 16-byte records, then descriptor gates.
  function modifier(collection: bigint, key: number): bigint {
    let count = BigInt(signedDword(at(collection, 0xcn)));
    let current = pointer(collection);
    const end = at(current, count * 16n);
    while (count > 0n) {
      const half = count >> 1n;
      if (dword(at(current, half * 16n)) < key) current = at(current, (half + (count & 1n)) * 16n);
      count = half;
    }
    if (current === end || key < dword(current)) return 0n;
    const descriptorOffset = BigInt(key | 0) * 0x78n;
    let registry = pointer(0x1433dd1d0n);
    const descriptor = at(registry, descriptorOffset);
    if (dword(at(descriptor, 0x68n)) !== 0) {
      const target = pointer(0x1433de580n);
      if (target === 0n) return 0n;
      const mask = dependencies.contextMask({ target }) >>> 0;
      if ((dword(at(descriptor, 0x68n)) & mask) === 0) return 0n;
      registry = pointer(0x1433dd1d0n);
    }
    const value = scalar(at(current, 8n));
    if ((dword(at(at(registry, descriptorOffset), 0x60n)) & 16) === 0) return value;
    return value < 0n ? 0n : value > 100_000n ? 100_000n : value;
  }

  function upperClamp(value: bigint): bigint {
    if (value < 0n) return 0n;
    const upper = scalar(0x1433e4280n);
    return value > upper ? upper : value;
  }

  function compareStrings(leftRecord: bigint, rightRecord: bigint): number {
    let left = pointer(at(leftRecord, 0x18n)) > 15n ? pointer(leftRecord) : leftRecord;
    let right = pointer(at(rightRecord, 0x18n)) > 15n ? pointer(rightRecord) : rightRecord;
    if (dword(0x143694cccn) !== 0) {
      return dependencies.localeCompare1425d05d0({ target: 0x1425d05d0n, left, right }) | 0;
    }
    for (;;) {
      const leftByte = byte(left), rightByte = byte(right);
      const a = leftByte >= 65 && leftByte <= 90 ? leftByte + 32 : leftByte;
      const b = rightByte >= 65 && rightByte <= 90 ? rightByte + 32 : rightByte;
      if (a !== b || a === 0) return a - b;
      left = at(left, 1n); right = at(right, 1n);
    }
  }

  // VA 0x140DEA430: ordered 40-byte category/string records from virtual slot 0x78.
  function categoryMatch(entry: bigint, definitionCategories: bigint): boolean {
    const target = pointer(at(pointer(entry), 0x78n));
    const range = dependencies.entryVirtual78({ target, entry });
    const begin = u64(range.begin), end = u64(range.end);
    if (begin === end) return true;
    let definition = pointer(definitionCategories);
    const definitionsEnd = at(definition, BigInt(signedDword(at(definitionCategories, 0xcn))) * 40n);
    while (definition !== definitionsEnd) {
      let current = begin;
      while (current !== end) {
        const definitionKey = dword(at(definition, 0x20n));
        const entryKey = dword(at(current, 0x20n));
        if (entryKey === definitionKey && compareStrings(current, definition) === 0) return true;
        if (definitionKey < entryKey || (definitionKey === entryKey && compareStrings(definition, current) < 0)) break;
        current = at(current, 40n);
      }
      definition = at(definition, 40n);
    }
    return false;
  }

  // VA 0x140DEA2A0: recovered direct fields, identifier scan and fixed-point arithmetic.
  function entryContribution(entry: bigint, definition: bigint, countryIdAddress: bigint): bigint {
    let value = 0n;
    if (categoryMatch(entry, at(definition, 0x2c0n))) {
      const resolvedCountry = resolveCountry(countryIdAddress);
      const factor = i64(modifier(at(resolvedCountry, 0x5b8n), 0xcf) + 100_000n);
      const target = pointer(at(pointer(entry), 0x80n));
      const level = dependencies.entryVirtual80({ target, entry, definition, countryIdAddress }) | 0;
      if (level > 0) {
        const id = dword(countryIdAddress);
        const group = id === 0 ? 0 : resolveGroup(countryIdAddress);
        const count = signedDword(at(entry, 0x24n));
        let bonus = 0n;
        for (let index = 0; index < count; index++) {
          const idAddress = at(pointer(at(entry, 0x18n)), BigInt(index) * 4n);
          const candidate = dword(idAddress);
          if (id === candidate || (id !== 0 && candidate !== 0 && group === resolveGroup(idAddress))) {
            bonus = scalar(at(pointer(at(entry, 0x30n)), BigInt(index) * 8n));
            break;
          }
        }
        const base = i64(scalar(at(entry, 0x10n)) + bonus);
        value = i64(i64(base * BigInt(level)) * factor) / 100_000n;
      }
    }
    return upperClamp(value);
  }

  // VA 0x140F535C0: source pointer-vector traversal, per-entry evaluation and aggregate clamp.
  function sourceContribution(): bigint {
    const definition = pointer(at(state, 0x160n));
    if (byte(at(definition, 0x409n)) !== 0) return 0n;
    const owner = pointer(at(state, 0x158n));
    let current = pointer(at(owner, 0x118n));
    const end = at(current, BigInt(signedDword(at(owner, 0x124n))) * 8n);
    const countryIdAddress = at(pointer(at(owner, 0x130n)), 8n);
    let total = 0n;
    while (current !== end) {
      total = i64(total + entryContribution(pointer(current), pointer(at(state, 0x160n)), countryIdAddress));
      current = at(current, 8n);
    }
    return upperClamp(total);
  }

  // VAs 0x140ECDD20 and 0x1414D6CF0: getter plus first matching object in a pointer vector.
  function matchingObject(collection: bigint, key: bigint): bigint {
    const count = signedDword(at(collection, 0x2cn));
    if (count <= 0) return 0n;
    let current = pointer(at(collection, 0x20n));
    for (let index = 0; index < count; index++, current = at(current, 8n)) {
      const object = pointer(current);
      if (pointer(at(object, 0x3f0n)) === key) return object;
    }
    return 0n;
  }

  // VA 0x140EE82E0: original 32-bit hash, byte-distance probing and payload-vector concatenation.
  function keyedContribution(table: bigint, keys: bigint): { total: bigint; entries: bigint[] } {
    let current = pointer(keys);
    const end = at(current, BigInt(signedDword(at(keys, 0xcn))) * 4n);
    let total = 0n;
    const entries: bigint[] = [];
    while (current !== end) {
      const key = dword(current);
      let hash = Math.imul((key >>> 16) ^ key, 0x45d9f3b) >>> 0;
      hash = Math.imul((hash >>> 16) ^ hash, 0x45d9f3b) >>> 0;
      const mask = signedDword(at(table, 0x94n));
      const buckets = pointer(at(table, 0x88n));
      const bucket = (BigInt(hash >>> 16) ^ BigInt(hash | 0)) & BigInt(mask);
      let slot = at(buckets, bucket * 48n);
      let distance = 1;
      let found = false;
      while (distance <= byte(at(slot, 4n))) {
        if (dword(at(slot, 8n)) === key) { found = true; break; }
        slot = at(slot, 48n);
        distance = (distance + 1) & 255;
      }
      if (!found) {
        const missingIndex = (byte(at(table, 0x98n)) + 1 + mask) | 0;
        slot = at(buckets, BigInt(missingIndex) * 48n);
      }
      const sentinelIndex = BigInt((byte(at(table, 0x98n)) + mask) | 0) + 1n;
      if (slot !== at(buckets, sentinelIndex * 48n)) {
        total = i64(total + scalar(at(slot, 0x10n)));
        const source = pointer(at(slot, 0x18n));
        const count = dword(at(slot, 0x24n));
        for (let index = 0; index < count; index++) entries.push(pointer(at(source, BigInt(index) * 8n)));
      }
      current = at(current, 4n);
    }
    return { total, entries };
  }

  const includeDefinition538 = byte(at(state, 0x1e8n)) !== 0;
  let total = modifier(at(country(), 0x5b8n), 0xcd);
  total = i64(total + sourceContribution());
  const objectCollection = at(pointer(at(country(), 0xf68n)), 0x190n);
  const count = signedDword(at(state, 0x74n));
  for (let index = 0; index < count; index++) {
    const key = pointer(at(pointer(at(state, 0x68n)), BigInt(index) * 8n));
    if (matchingObject(objectCollection, key) !== 0n) {
      total = i64(total + scalar(0x1433e4328n));
      break;
    }
  }
  total = i64(total + scalar(at(state, 0x190n)));
  total = i64(total + scalar(at(state, 0x1a0n)));
  if (includeDefinition538) total = i64(total + scalar(at(pointer(at(state, 0x160n)), 0x538n)));
  const keyed = keyedContribution(pointer(at(country(), 0xfa8n)), at(state, 0x140n));
  return { stack30: i64(total + keyed.total), stack38: 0n, temporarySourceEntries: keyed.entries };
}
