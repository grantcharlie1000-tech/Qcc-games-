export interface ResearchRateBoundaryInputs {
  readonly helper140f537e0Stack30: bigint;
  readonly helper140f537e0Stack38: bigint;
  readonly rawStatusOffset1c0: bigint;
  readonly rawStatusOffset1c8: bigint;
  readonly helper140b205b0Pointee: bigint;
  readonly runtimeGlobal1433e4658: bigint;
}

export type ResearchRateBoundaryResult = {
  readonly helper140b205b0Stack20: bigint;
} & (
  | { readonly kind: 'returned'; readonly value: bigint }
  | { readonly kind: 'divide-error'; readonly outputBeforeFault: bigint }
);

const signed64 = (value: bigint) => BigInt.asIntN(64, value);
const unsigned64 = (value: bigint) => BigInt.asUintN(64, value);
const scale = 100_000n;
const minSigned64 = -(1n << 63n);
const maxSigned64 = (1n << 63n) - 1n;

/** Arithmetic of VA 0x140F53350 with both native helpers and the runtime global supplied explicitly. */
export function researchRateAfterHelpers(input: ResearchRateBoundaryInputs): ResearchRateBoundaryResult {
  const helper140b205b0Stack20 = signed64(input.helper140f537e0Stack38 + input.rawStatusOffset1c0);
  const numerator = signed64(signed64(input.helper140f537e0Stack30 + scale) + input.rawStatusOffset1c8);
  const denominator = signed64(input.helper140b205b0Pointee + scale);

  // 0x140F533E8-0x140F5340C: unsigned guard, followed by low-64-bit IMUL and signed IDIV.
  let candidate = 0xffff_ffffn;
  if (denominator !== 0n && unsigned64(numerator + 0x7fff_ffff_ffff_fffen) <= 0xffff_ffff_ffff_fffcn) {
    const quotient = signed64(numerator * scale) / denominator;
    if (quotient < minSigned64 || quotient > maxSigned64) {
      return { kind: 'divide-error', outputBeforeFault: numerator, helper140b205b0Stack20 };
    }
    candidate = quotient;
  }

  // 0x140F5340C writes ECX, zero-extending its fallback; CMOVG then compares signed qwords.
  const lowerBound = signed64(input.runtimeGlobal1433e4658);
  return {
    kind: 'returned',
    value: candidate > lowerBound ? candidate : lowerBound,
    helper140b205b0Stack20,
  };
}
