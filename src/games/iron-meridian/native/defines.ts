import createRuntime from './lua51/runtime.mjs';
import type { Lua51Runtime, Lua51RuntimeOptions } from './lua51/runtime-types';

export interface OrderedLuaChunk {
  readonly path: string;
  readonly source: string | Uint8Array;
}

export type LuaValue =
  | { readonly type: 'nil' }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string'; readonly value: Uint8Array }
  | { readonly type: 'light-userdata' | 'table' | 'function' | 'userdata' | 'thread' };

export class LuaConfigurationError extends Error {
  constructor(readonly phase: 'execute' | 'read', readonly path: string, readonly status: number, message: string) {
    super(`${path}: ${message}`);
    this.name = 'LuaConfigurationError';
  }
}

/** A candidate Lua 5.1.1 configuration VM with the recovered native library table.
 * Mounted-file selection, Luabind, native registry conversion and validation are separate.
 */
export class OrderedDefines {
  private closed = false;

  private constructor(private readonly runtime: Lua51Runtime, private readonly state: number) {}

  static async load(chunks: readonly OrderedLuaChunk[], options?: Lua51RuntimeOptions): Promise<OrderedDefines> {
    const runtime = await createRuntime(options);
    const state = runtime._im_lua_create();
    if (!state) throw new Error('Lua state allocation failed');
    const context = new OrderedDefines(runtime, state);
    try {
      for (const chunk of chunks) context.execute(chunk);
      return context;
    } catch (error) {
      context.close();
      throw error;
    }
  }

  private withStrings<T>(values: readonly string[], callback: (pointers: number[]) => T): T {
    if (this.closed) throw new Error('Lua context is closed');
    const pointers: number[] = [];
    try {
      for (const value of values) {
        const size = this.runtime.lengthBytesUTF8(value) + 1;
        const pointer = this.runtime._malloc(size);
        if (!pointer) throw new Error('Lua string allocation failed');
        pointers.push(pointer);
        this.runtime.stringToUTF8(value, pointer, size);
      }
      return callback(pointers);
    } finally {
      for (const pointer of pointers) this.runtime._free(pointer);
    }
  }

  private error(phase: 'execute' | 'read', path: string, status: number): LuaConfigurationError {
    const pointer = this.runtime._im_lua_result_string(this.state);
    const message = pointer ? new TextDecoder().decode(this.readBytes(pointer)) : 'Lua error';
    return new LuaConfigurationError(phase, path, status, message);
  }

  private readBytes(pointer: number): Uint8Array {
    const length = this.runtime._im_lua_result_length(this.state);
    return this.runtime.HEAPU8.slice(pointer, pointer + length);
  }

  private execute(chunk: OrderedLuaChunk): void {
    if (chunk.path.includes('\0')) throw new Error('Lua chunk path contains a null byte');
    const bytes = typeof chunk.source === 'string' ? new TextEncoder().encode(chunk.source) : chunk.source;
    const buffer = this.runtime._malloc(Math.max(1, bytes.byteLength));
    if (!buffer) throw new Error('Lua source allocation failed');
    try {
      this.withStrings([chunk.path], ([name]) => {
        this.runtime.HEAPU8.set(bytes, buffer);
        const status = this.runtime._im_lua_execute(this.state, buffer, bytes.byteLength, name);
        if (status) throw this.error('execute', chunk.path, status);
      });
    } finally {
      this.runtime._free(buffer);
    }
  }

  get(root: string, section = '', key = ''): LuaValue {
    if ([root, section, key].some(value => value.includes('\0'))) throw new Error('Lua field name contains a null byte');
    return this.withStrings([root, section, key], ([rootPointer, sectionPointer, keyPointer]) => {
      const status = this.runtime._im_lua_get(this.state, rootPointer, sectionPointer, keyPointer);
      if (status) throw this.error('read', [root, section, key].filter(Boolean).join('.'), status);
      switch (this.runtime._im_lua_result_type(this.state)) {
        case 0: return { type: 'nil' };
        case 1: return { type: 'boolean', value: !!this.runtime._im_lua_result_boolean(this.state) };
        case 2: return { type: 'light-userdata' };
        case 3: return { type: 'number', value: this.runtime._im_lua_result_number(this.state) };
        case 4: return {
          type: 'string',
          value: this.readBytes(this.runtime._im_lua_result_string(this.state)),
        };
        case 5: return { type: 'table' };
        case 6: return { type: 'function' };
        case 7: return { type: 'userdata' };
        case 8: return { type: 'thread' };
        default: throw new Error('Unknown Lua value type');
      }
    });
  }

  close(): void {
    if (!this.closed) {
      this.runtime._im_lua_destroy(this.state);
      this.closed = true;
    }
  }
}
