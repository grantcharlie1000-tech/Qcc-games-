import { describe, expect, it } from 'vitest';
import { foldNativeSelectionAsciiByte, readNativeSelectionJson } from '../../../src/games/iron-meridian/native/selection';
import reference from '../../../work/iron-meridian/native-selection/reference.json';

const bytes = (value: string) => Uint8Array.from(value.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
const hex = (value: Uint8Array) => [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');

describe('selection JSON against original native parser, lookup and extraction instructions', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const foldArguments: number[] = [];
    const result = readNativeSelectionJson(bytes(input.bytes), {
      foldByte(value) {
        foldArguments.push(value);
        if (input.locale === 'unsigned-high' && value === 0xe9) return 0x64;
        if (input.locale === 'high-both' && (value === -23 || value === 0xe9)) return 0x64;
        return foldNativeSelectionAsciiByte(value);
      },
    });
    expect(result.kind).toBe(expected.kind);
    expect(foldArguments).toEqual(expected.foldArguments);
    if (result.kind === 'runtime-required') {
      expect(result.reason).toBe(expected.reason);
      expect(result.offset).toBe(expected.offset);
    }
    else {
      expect(result.parsed).toBe(expected.parsed);
      expect(result.disabledDlcs.map(hex)).toEqual(expected.disabledDlcs);
      expect(result.enabledMods.map(hex)).toEqual(expected.enabledMods);
      expect(result.diagnostics).toEqual(expected.diagnostics?.map(({ list, index, kind }) => ({ list, index, kind })));
    }
  });
});
