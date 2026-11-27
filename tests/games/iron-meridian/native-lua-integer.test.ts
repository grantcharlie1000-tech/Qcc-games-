import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import createRuntime from '../../../src/games/iron-meridian/native/lua51/runtime.mjs';
import type { Lua51Runtime } from '../../../src/games/iron-meridian/native/lua51/runtime-types';
import reference from '../../../work/iron-meridian/native-config/integer-api-vectors.json';

let runtime: Lua51Runtime;
let context: number;
beforeAll(async () => {
  runtime = await createRuntime({ wasmBinary: new Uint8Array(readFileSync(new URL('../../../src/games/iron-meridian/native/lua51/runtime.wasm', import.meta.url))) });
  context = runtime._im_lua_create();
  expect(context).not.toBe(0);
});
afterAll(() => { if (context) runtime._im_lua_destroy(context); });

function fromQword(bits: string): number {
  const data = new DataView(new ArrayBuffer(8));
  data.setBigUint64(0, BigInt(bits), true);
  return data.getFloat64(0, true);
}

function qword(value: number): bigint {
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, value, true);
  return data.getBigUint64(0, true);
}

describe('Lua WASM signed64 API against original x86-64 numeric API paths', () => {
  it.each(reference.push_vectors)('push $label', vector => {
    const number = runtime._im_lua_number_from_integer(context, BigInt(vector.input_signed64));
    expect(qword(number)).toBe(BigInt(vector.output_number_qword));
    expect(runtime._im_lua_integer_from_number(context, number)).toBe(BigInt(vector.output_integer_round_trip_reference));
  });

  it.each(reference.read_vectors)('read $label', vector => {
    expect(runtime._im_lua_integer_from_number(context, fromQword(vector.input_number_qword))).toBe(BigInt(vector.output_signed64));
  });
});
