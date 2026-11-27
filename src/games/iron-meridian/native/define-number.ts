const minimumSigned64 = -(1n << 63n);
const signed64Limit = 2 ** 63;

export interface NativeDefineNumber {
  readonly value: bigint;
  readonly invalidConversion: boolean;
}

/** Numeric branch of VA 0x1420D8AB0, including helper CVTSD2SS.
 * Assumes MXCSR 0x1f80: nearest/even, no FTZ/DAZ, masked exceptions.
 * The running game's MXCSR and floating exception flags were not observed.
 */
export function nativeDefineNumberAtDefaultMxcsr(input: number): NativeDefineNumber {
  const narrowed = Math.fround(input);
  const nonnegative = narrowed >= 0 ? 1 : 0;
  const scaled = Math.fround(narrowed * 100_000);
  // Keep the original ADDSS then SUBSS. Reassociation changes real cases.
  const added = Math.fround(nonnegative + scaled);
  const adjusted = Math.fround(added - 0.5);
  const invalidConversion = !Number.isFinite(adjusted) || adjusted < -signed64Limit || adjusted >= signed64Limit;
  return {
    value: invalidConversion ? minimumSigned64 : BigInt(Math.trunc(adjusted)),
    invalidConversion,
  };
}

/** Numeric input branch and observed negative clamp of loader VA 0x1409FF870. */
export function minimumResearchSpeedFromNumber(input: number): bigint {
  const { value } = nativeDefineNumberAtDefaultMxcsr(input);
  return value < 0n ? 0n : value;
}
