import { describe, expect, it } from 'vitest';
import { nativeProvinceBounds } from '../../../src/games/iron-meridian/native/province-bounds';
import reference from '../../../work/iron-meridian/native-map/bounds-reference.json';

describe('native province rectangle writer 0x1414a6580', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    expect(nativeProvinceBounds(input)).toEqual(expected);
  });
});
