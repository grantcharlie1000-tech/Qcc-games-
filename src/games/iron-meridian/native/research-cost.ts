export interface ResearchCostMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
}

export type ResearchCostResult =
  | { kind: 'returned'; value: bigint; roundedAdjustment: bigint; rawGap32: bigint; positiveGap32: bigint }
  | { kind: 'runtime-required'; boundary: 'world-assertion' | 'tls-validation'; nativeAddress: bigint };

const i32 = (value: bigint) => BigInt.asIntN(32, value);
const i64 = (value: bigint) => BigInt.asIntN(64, value);
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const at = (address: bigint, offset: bigint) => u64(address + offset);

/** VA 0x142572EF0: signed fixed-point rounding, with exact half ties away from zero. */
export function roundedFixedPoint142572ef0(value: bigint): bigint {
  const input = i64(value);
  const quotient = input / 100_000n;
  const remainder = input - quotient * 100_000n;
  if (remainder >= 50_000n) return quotient + 1n;
  if (remainder <= -50_000n) return quotient - 1n;
  return quotient;
}

/** Daily 0x140B205B0 path: null tooltip, zero other scalar argument, explicit wrapped adjustment. */
export function researchTechnologyDenominatorDaily(
  memory: ResearchCostMemory,
  definition: bigint,
  adjustment: bigint,
): ResearchCostResult {
  const byte = (address: bigint) => memory.readByte(u64(address)) & 255;
  const scalar = (address: bigint) => i64(memory.readQword(u64(address)));

  // 0x140B205BD-0x140B206C1: do not invent assertion decisions, TLS state or runtime writes.
  if (byte(0x14368f611n) !== 0) {
    if (byte(0x1433dd130n) === 0 && u64(memory.readQword(0x1433dd6b0n)) === 0n) {
      return { kind: 'runtime-required', boundary: 'world-assertion', nativeAddress: 0x140b2061bn };
    }
    if (byte(0x1433dd131n) === 0) {
      return { kind: 'runtime-required', boundary: 'tls-validation', nativeAddress: 0x140b20644n };
    }
  }

  const world = u64(memory.readQword(0x1433dd6b0n));
  // 0x140B2072A-0x140B207F9 uses 32-bit arithmetic, including the subtraction before /24.
  const definitionField = i32(BigInt(memory.readDword(at(definition, 0x3d8n)) >>> 0));
  const definitionHours = i32(definitionField * 8_760n);
  const worldHours = i32(BigInt(memory.readDword(at(world, 0x468n)) >>> 0) - 43_800_000n);
  const roundedAdjustment = roundedFixedPoint142572ef0(i64(adjustment * 365n));
  // The native /365 quotient terms cancel modulo 2^32. Preserve the final signed wrapping/clamp.
  const rawGap32 = i32(definitionHours / 24n - worldHours / 24n - roundedAdjustment);
  const positiveGap32 = rawGap32 < 0n ? 0n : rawGap32;

  // 0x140B2001C-0x140B2008E: wrapping products followed by signed constant division.
  const scaled = i64(positiveGap32 * 100_000n);
  const weighted = i64(scaled * scalar(0x1433e4138n)) / 100_000n;
  let value = 0xffff_ffffn;
  if (u64(weighted + 0x7fff_ffff_ffff_fffen) <= 0xffff_ffff_ffff_fffcn) {
    value = i64(weighted * 100_000n) / 36_500_000n;
  }
  return { kind: 'returned', value, roundedAdjustment, rawGap32, positiveGap32 };
}
