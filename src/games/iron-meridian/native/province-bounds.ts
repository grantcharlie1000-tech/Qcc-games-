export interface NativeProvinceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Complete 0x1414a6580 rectangle writer, called by 0x140ab0cd0 while collecting
 * province pixel spans. Inputs and outputs are signed interpretations of raw
 * dwords. The destination fields are +0x88, +0x8c, +0x90 and +0x94.
 */
export function nativeProvinceBounds(input: NativeProvinceBounds): NativeProvinceBounds {
  const x = input.x | 0;
  const y = input.y | 0;
  // Native LEA/CMOV first expands each extent for an odd origin, then rounds
  // that intermediate extent up to even. Every operation wraps to 32 bits.
  const width = ((input.width | 0) + (x & 1)) | 0;
  const height = ((input.height | 0) + (y & 1)) | 0;
  return {
    x: (x - (x & 1)) | 0,
    y: (y - (y & 1)) | 0,
    width: (width + (width & 1)) | 0,
    height: (height + (height & 1)) | 0,
  };
}
