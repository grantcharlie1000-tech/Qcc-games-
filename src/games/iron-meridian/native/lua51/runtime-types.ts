export interface Lua51Runtime {
  HEAPU8: Uint8Array;
  _im_lua_create(): number;
  _im_lua_destroy(state: number): void;
  _im_lua_execute(state: number, buffer: number, length: number, name: number): number;
  _im_lua_get(state: number, root: number, section: number, key: number): number;
  _im_lua_result_type(state: number): number;
  _im_lua_result_boolean(state: number): number;
  _im_lua_result_number(state: number): number;
  _im_lua_result_string(state: number): number;
  _im_lua_result_length(state: number): number;
  _im_lua_integer_from_number(state: number, value: number): bigint;
  _im_lua_number_from_integer(state: number, value: bigint): number;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  UTF8ToString(pointer: number, maximumBytes?: number): string;
  stringToUTF8(value: string, pointer: number, maximumBytes: number): void;
  lengthBytesUTF8(value: string): number;
}

export interface Lua51RuntimeOptions {
  wasmBinary?: Uint8Array;
  locateFile?: (path: string, prefix: string) => string;
}
