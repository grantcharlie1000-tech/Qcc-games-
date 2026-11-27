/* New browser adapter for upstream Lua 5.1.1. Native library-table evidence:
 * hoi4.exe VA 0x142ba9120, SHA-256
 * 709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148.
 * Luabind and engine VFS/host bindings are separate, unresolved dependencies.
 */
#include <stdlib.h>
#include <string.h>
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

typedef char number_must_be_double[(sizeof(lua_Number) == 8) ? 1 : -1];
typedef char integer_must_be_64_bit[(sizeof(lua_Integer) == 8) ? 1 : -1];

struct lua_context {
  lua_State *state;
  int type;
  int boolean;
  double number;
  char *bytes;
  unsigned int length;
};

static void clear_result(struct lua_context *context) {
  free(context->bytes);
  context->bytes = NULL;
  context->length = 0;
  context->type = LUA_TNONE;
}

/* Copy before another Lua allocation, GC, or close can invalidate a string.
 * These Lua APIs cannot allocate for the already-checked scalar types. */
static int capture_result(struct lua_context *context) {
  lua_State *state = context->state;
  context->type = lua_type(state, -1);
  if (context->type == LUA_TBOOLEAN) context->boolean = lua_toboolean(state, -1);
  if (context->type == LUA_TNUMBER) context->number = lua_tonumber(state, -1);
  if (context->type == LUA_TSTRING) {
    size_t length;
    const char *bytes = lua_tolstring(state, -1, &length);
    context->bytes = malloc(length + 1);
    if (!context->bytes) return 0;
    memcpy(context->bytes, bytes, length);
    context->bytes[length] = 0;
    context->length = (unsigned int)length;
  }
  return 1;
}

static int native_empty_library(lua_State *state) { (void)state; return 1; }

static int open_libraries(lua_State *state) {
  static const luaL_Reg libraries[] = {
    {"", luaopen_base}, {LUA_LOADLIBNAME, luaopen_package},
    {LUA_TABLIBNAME, luaopen_table}, {LUA_IOLIBNAME, native_empty_library},
    {LUA_OSLIBNAME, native_empty_library}, {LUA_STRLIBNAME, luaopen_string},
    {LUA_MATHLIBNAME, luaopen_math}, {LUA_DBLIBNAME, luaopen_debug},
    {NULL, NULL}
  };
  const luaL_Reg *library;
  for (library = libraries; library->func; ++library) {
    lua_pushcfunction(state, library->func);
    lua_pushstring(state, library->name);
    lua_call(state, 1, 0);
  }
  return 0;
}

struct lua_context *im_lua_create(void) {
  struct lua_context *context = calloc(1, sizeof(*context));
  if (!context) return NULL;
  context->state = luaL_newstate();
  if (!context->state) { free(context); return NULL; }
  context->type = LUA_TNONE;
  if (lua_cpcall(context->state, open_libraries, NULL)) {
    lua_close(context->state);
    free(context);
    return NULL;
  }
  return context;
}

void im_lua_destroy(struct lua_context *context) {
  lua_close(context->state);
  clear_result(context);
  free(context);
}

struct chunk_operation {
  const char *buffer;
  unsigned int size;
  const char *name;
  int status;
};

static int execute_chunk(lua_State *state) {
  struct chunk_operation *operation = lua_touserdata(state, 1);
  operation->status = luaL_loadbuffer(state, operation->buffer, operation->size, operation->name);
  if (!operation->status) operation->status = lua_pcall(state, 0, 0, 0);
  if (operation->status) return lua_error(state);
  return 0;
}

int im_lua_execute(struct lua_context *context, const char *buffer, unsigned int size, const char *name) {
  struct chunk_operation operation = {buffer, size, name, 0};
  int protected_status;
  clear_result(context);
  lua_settop(context->state, 0);
  protected_status = lua_cpcall(context->state, execute_chunk, &operation);
  if (protected_status) capture_result(context);
  return operation.status ? operation.status : protected_status;
}

struct read_operation {
  struct lua_context *context;
  const char *root;
  const char *section;
  const char *key;
};

static int read_fields(lua_State *state) {
  struct read_operation *operation = lua_touserdata(state, 1);
  lua_getglobal(state, operation->root);
  if (operation->section[0]) lua_getfield(state, -1, operation->section);
  if (operation->key[0]) lua_getfield(state, -1, operation->key);
  if (!capture_result(operation->context)) return luaL_error(state, "Result allocation failed");
  return 0;
}

int im_lua_get(struct lua_context *context, const char *root, const char *section, const char *key) {
  struct read_operation operation = {context, root, section, key};
  int status;
  clear_result(context);
  lua_settop(context->state, 0);
  /* Includes closure creation, field-key allocation, metamethods, hooks and GC. */
  status = lua_cpcall(context->state, read_fields, &operation);
  if (status) {
    clear_result(context);
    capture_result(context);
  }
  return status;
}

int im_lua_result_type(struct lua_context *context) { return context->type; }
int im_lua_result_boolean(struct lua_context *context) { return context->boolean; }
double im_lua_result_number(struct lua_context *context) { return context->number; }
const char *im_lua_result_string(struct lua_context *context) { return context->bytes; }
unsigned int im_lua_result_length(struct lua_context *context) { return context->length; }

/* These numeric API paths only access the existing stack and numeric TValue.
 * They cannot allocate or call Lua/GC. lua_Integer is proven signed64. */
long long im_lua_integer_from_number(struct lua_context *context, double number) {
  lua_Integer value;
  lua_settop(context->state, 0);
  lua_pushnumber(context->state, number);
  value = lua_tointeger(context->state, -1);
  lua_settop(context->state, 0);
  return value;
}

double im_lua_number_from_integer(struct lua_context *context, long long integer) {
  double value;
  lua_settop(context->state, 0);
  lua_pushinteger(context->state, integer);
  value = lua_tonumber(context->state, -1);
  lua_settop(context->state, 0);
  return value;
}
