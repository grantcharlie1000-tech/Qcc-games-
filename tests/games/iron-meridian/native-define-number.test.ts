import { describe, expect, it } from 'vitest';
import { minimumResearchSpeedFromNumber, nativeDefineNumberAtDefaultMxcsr } from '../../../src/games/iron-meridian/native/define-number';
import reference from '../../../work/iron-meridian/native-config/numeric-conversion.json';

function inputFromBits(width: number, bits: string): number {
  const view = new DataView(new ArrayBuffer(8));
  if (width === 32) {
    view.setUint32(0, Number(BigInt(bits)), true);
    return view.getFloat32(0, true);
  }
  view.setBigUint64(0, BigInt(bits), true);
  return view.getFloat64(0, true);
}

describe('native define conversion against isolated original x86-64 instructions', () => {
  it.each(reference.vectors)('$input_width-bit $label', vector => {
    const input = inputFromBits(vector.input_width, vector.input_bits);
    const result = nativeDefineNumberAtDefaultMxcsr(input);
    expect(result.value).toBe(BigInt(vector.output_signed64));
    expect(result.invalidConversion).toBe(vector.reference_cvtt_invalid);
    expect(minimumResearchSpeedFromNumber(input)).toBe(BigInt(vector.minimum_loader_after_negative_clamp));
  });
});
