# Lua configuration dependency port

The candidate configuration VM runs the identified upstream Lua 5.1.1 dependency as WebAssembly, with adapters recovered from the installed executable. It executes actual chunk bytes, then permits typed reads from the resulting context. It is separate from the earlier fictional game and from a complete native configuration loader.

[defines.ts](../../src/games/iron-meridian/native/defines.ts) accepts an explicitly ordered list of chunks. A fresh context executes that list in order, aborts on the first failure, and exposes no partially loaded context on failure. Byte-array inputs preserve original source bytes. Lua strings return copied byte arrays, including embedded nulls and non-UTF8 bytes. Text decoding is confined to diagnostic presentation.

## Provenance and recovered adapters

- Target: `hoi4.exe`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`.
- The embedded release identifier, shipped license and selected native API bodies establish the Lua 5.1.1 dependency. [CONFIGURATION_LOADING.md](CONFIGURATION_LOADING.md) records the evidence and its limits.
- Official source archive: [Lua 5.1.1](https://www.lua.org/ftp/lua-5.1.1.tar.gz), 207,810 bytes, SHA-256 `c5daeed0a75d8e4dd2328b7c7a69888247868154acbda69110e97d4a6e17d1f0`. Original source and copyright remain retained. The app dependency directory includes the original MIT copyright notice.
- Portable Emscripten 7.0.0 uses release `6afbd83493d647051772d491124187d4e9a0cda9`. Its 748,527,107-byte official SDK archive has locally recorded SHA-256 `ada8333d584467723321ffe8928fb9dfb64f50bb22cc7c720722aad7fb3163d5` and passed full ZIP CRC validation. The SDK and configuration live outside the checkout; activation did not persist system/user environment changes.
- [build.py](../../work/iron-meridian/native-lua/build.py) records the observed compiler version, driver hash, complete command, source hashes and patches. Compiler settings follow the [Emscripten settings reference](https://emscripten.org/docs/tools_reference/settings_reference.html).

The observed native library table opens base/coroutine, package, table, string, math and debug. Both `io` and `os` point to no-op functions. The new [C bridge](../../src/games/iron-meridian/native/lua51/bridge.c) preserves this initialization table. It does not call stock `luaL_openlibs`.

Native integer APIs use signed64 registers: `CVTSI2SD XMM0,RDX` in `lua_pushinteger` and `CVTTSD2SI RAX,[RAX]` in `lua_tointeger`. WASM32 therefore explicitly uses a signed64 `lua_Integer`. A guarded numeric conversion preserves truncation and the observed masked-invalid `INT64_MIN` result without relying on an undefined C cast, WASM trap or saturating conversion. This patch does not cover unrelated internal `lua_number2int` conversions, exception flags, unmasked traps or unobserved native rounding modes.

[define-number.ts](../../src/games/iron-meridian/native/define-number.ts) separately translates the engine's binary64-to-binary32 conversion and fixed-value arithmetic. It retains each multiply, add and subtract rounding point and the signed64 invalid-conversion result. The minimum-speed numeric branch then clamps negative values to zero. It assumes declared `MXCSR=0x1f80`; the running game's register setting has not been observed.

## Verification

- 482 engine conversion cases match isolated original x86-64 instruction runs, including 10 cases that reject arithmetic reassociation and 139 invalid conversions.
- 211 compiled-VM integer API cases match original numeric API instruction runs: 97 signed64 pushes and 114 numeric reads. `INT64_MAX` correctly rounds to binary64 `+2^63`, whose integer read returns `INT64_MIN` under the declared masked-invalid mode.
- Seven VM behavior tests pass. They check ordered expression/function execution, the recovered library set, syntax/runtime failure, byte-string fidelity, protected metamethod errors, a throwing C return hook after lookup, context lifetime and the three real base chunks.
- The private Chromium 152 fixture passes 693 numeric/API reference cases and executes all three identity-checked chunks. The supplied `0.1` becomes fixed integer `10000`. Desktop 1280x800 and phone 390x844 views were captured with no horizontal overflow.
- A separate Vite production fixture bundles the 179,637-byte WASM and runs the same checks in Chromium using the emitted hashed asset. Vite reports a `node:module` browser external for the generated dual web/Node runtime; the browser branch passes with the emitted bundle. This is a private local test, not a deployment.
- Rebuilding produces identical runtime hashes: JS `9c2e8bcd45a0b0f15f09aef27992b0ba09795c46649575715cd685fc15ac86b2`; WASM `46094f3a588a1cb8672410c75a01b3890b4e7008c94d37c15a9574ef3069e3f6`.

Independent source review found byte-string loss and unprotected Lua allocation/GC paths in the initial adapter. These were fixed before the successful build. Complete operations now run inside `lua_cpcall`; scalar/string snapshots are copied into C-owned storage before return. No allocating registry-reference cleanup occurs outside protection. The return-hook regression passes. An initial installed-script assertion incorrectly queried `NCareerProfile` as a global; the actual script merges it into `NDefines`, and the corrected assertion passes.

Build manifests, reference identities, captured original inputs, screenshots and browser observations are retained in [native-lua](../../work/iron-meridian/native-lua/). A no-server evidence page can display the screenshots. The actual source VM, Lua chunks and numeric adapters are tested separately from original-game runtime equivalence.

## Remaining boundaries

The release identifier and selected matching API bodies do not establish that every embedded Lua function is unmodified. The candidate VM's whole interpreter, standard libraries, libm/RNG behavior, platform paths, package loading, native bytecode format and internal integer conversions have not been exhaustively compared. Luabind and the game's host bindings are absent. Browser memory limits and error presentation are new adapters, not recovered native allocator behavior.

The input list is explicitly supplied. Effective launcher selections, mounts, replacement paths, PHYSFS providers and active override order are not inferred by this VM. The recovered supplied-listing enumeration is a separate layer. Full native registry loading, missing/non-numeric define diagnostics, validation and real runtime-global initialization remain open. Evaluating three base chunks and reading `0.1` does not establish the value in a running game.

These native modules are not imported by the fictional game's entry point. The application build does not yet include them in its offline game pack. The separate production fixture verifies bundling and browser execution, not complete game integration or offline gameplay parity. No commit, push or deployment occurred.
