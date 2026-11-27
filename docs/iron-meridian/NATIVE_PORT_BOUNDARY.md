# Native HOI4 port boundary

Inspected 17 November 2026. The target is the installed `hoi4.exe` under `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV`, not the fictional Iron Meridian simulation. This document inventories dependencies and specifies the first actual native-code port slice. It does not claim that a browser port, recovered simulation, or equivalent game already exists.

## Evidence and scope

Observed means a file, table, or source statement was read. Inferred means a role or port consequence deduced from that evidence. Unknown means evidence has not established the claim. Static imports do not prove that an API was called during a game session.

The prior [investigation report](INVESTIGATION_REPORT.md) and [source inventory](source-inventory.json) identify the selected installation and selected mechanics declarations. Their earlier references to an original game are historical scope, not the current port objective. The [native inventory](../../work/iron-meridian/native-inventory/inventory.json) binds the import observations below to a 56,535,160-byte executable with SHA-256 `709F916AFBEBCFE64A26678702691AEB40945D206074C2A80DE8E9D601FCE148` and preferred image base `0x140000000`. This pass performed ordinary PowerShell/ripgrep reads and recursive file-extension counts. These are shell observations, not REA Evidence IDs. No game was executed, no original installation file was changed, and no binary or asset was added to the web application by this pass.

The recursive extension inventory found zero ordinary files ending in `.c`, `.cc`, `.cpp`, `.cxx`, `.h`, `.hpp`, `.pdb`, or `.wasm` inside the installation. This is a bounded filename observation. It does not establish that no source-like payload exists inside an archive or resource, nor that every installed binary lacks embedded symbols.

## Readable sources and binary assets

Counts below are current recursive ordinary-file counts for the named base-install directories. DLC and integrated-DLC directories are outside these particular rows. Parent and child directory totals overlap.

| Shipped material | Observed evidence | What can be retained in an actual port | What is still missing |
| --- | --- | --- | --- |
| Game definitions | `common`: 2,267 files, including 2,224 `.txt` and three `.lua`; selected mechanics and hashes are in `source-inventory.json` | Original identifiers, declarations, relationships and scalar values, through a parser that preserves their real syntax | Effective file order, overrides, scopes, operator semantics, native trigger/effect/modifier evaluation and DLC/mod enablement |
| Initial world history | `history`: 2,058 `.txt` files | Actual country, state and order-of-battle declarations after effective configuration is established | Native initialization order, defaults, cross-reference resolution, scenario selection and runtime validation |
| Map input | `map`: 391 files, including 317 `.txt`, nine `.bmp`, two `.csv`, one `.map`, 62 `.dds`; `default.map:1-13` names its map inputs; `definition.csv` contains semicolon-separated IDs, RGB, province type and terrain fields | The original raster ID map, tables, rail/supply declarations and geography as local input to a separate loader | RGB/province consistency, topology, seam handling, rivers/straits and adjacency rules, projection/coordinate behavior, engine geometry generation and all effective overrides |
| GUI definitions | `interface`: 454 `.gui` and 162 `.gfx`; `abilitylist.gui:1-55` declares containers, sprites and a button | Original layout and sprite references can inform a real layout loader | Native widget classes, bindings, event routing, focus, input, text metrics, state updates and screen scaling |
| Localization | `localisation`: 2,103 `.yml` files and one `.txt` | Original localization keys and strings after format-aware decoding | Native token expansion, scripted localization, pluralization/formatting, font fallback and contextual substitutions |
| Shader source | `gfx/FX`: 45 `.shader` and 13 `.fxh`; `border.shader:1-7,72-103,120-167` has includes, constant buffers and shader bodies | These are real readable rendering source, distinct from a decompilation. Selected bodies can be translated with their dependencies and verified numerically and visually | Shader container parsing, include/macro expansion, native uniforms and texture meanings, binding layouts, render passes, color spaces and correct browser shader equivalents |
| Small Lua scripts | `script`: five `.lua` files totaling 3,455 bytes; `utils.lua:24-46` performs country-function lookup/dispatch; `ai_diplomacy.lua:3-11` calls engine-bound objects | Exact small script functions can be carried through a compatible Lua environment or a faithful translation | Engine bindings and invocation rules; a script naming a native method does not implement it. `utils.lua:50-74` also contains host directory/shell behavior requiring an explicit replacement |
| Browser material | `browser` contains only `hoi4wiki.js`, 727 bytes; it injects wiki CSS. `tools` has nine files, including two JavaScript libraries and two HTML files for auxiliary tools | Auxiliary code can be analyzed separately | This is not a JavaScript build of the game. CEF resource packs and `libcef.so` exist, but their presence does not make the simulation a web application or prove a native execution path |
| Art, models and animation | `gfx`: 30,602 files, including 21,898 `.dds`, 6,851 `.tga`, 535 `.anim`, 435 `.mesh`, 379 `.fnt`, 213 `.asset` | Actual assets can be decoded with format and reference preservation for local analysis | Browser texture/model/font representations, animation semantics, GPU budgets, level of detail and native renderer parity. Filenames do not establish format support |
| Audio | `sound`: 982 `.wav` plus ten `.asset`; `music`: 61 `.ogg`, three `.txt`, three `.asset` | Original decoded audio and declarative asset references as explicit local inputs | Mixer graph, categories, timing, triggers, priority, looping, spatial behavior and browser audio lifecycle |

The readable declarations are not a complete engine implementation. The shader and Lua rows do contain actual authored code, but translating one of them alone would not satisfy the requested native executable decompilation.

Selected directly read source identities:

| Relative installation path | Bytes | SHA-256 |
| --- | ---: | --- |
| `map/default.map` | 504 | `AF7037B4BE45C903FC3E136462DCE7071EB468EAC9A50F9D81C48DBF7D6A16F2` |
| `map/definition.csv` | 465,289 | `86846BE71198D6772C651638AA22E3656133198DE9B7C49C6234ED48CF33D87B` |
| `map/adjacencies.csv` | 13,091 | `26A26C3F42A4B01FB905C99659024E857FFC05E3172FCD9953395321FB76ED64` |
| `gfx/FX/border.shader` | 4,040 | `1E04CD680502B797E3701CF75F11FBE43044A4AB41147BE17C832FDA230987CC` |
| `interface/abilitylist.gui` | 1,247 | `11C7F76B0F5C19D7D5B724D911175CF58FFA864CC86CAF670CE72BA4058C676B` |
| `script/utils.lua` | 1,957 | `1C24BC3BD7D4420C5A7A9B7BEFE30E010A89135C32709D11317D1EC9FCB3B89C` |
| `script/ai_diplomacy.lua` | 349 | `1D2F0854E39FF4A98C21E2F1DF302437168E80C03B766278999425BB484C7812` |
| `script/autoexec.lua` | 583 | `B34571F7032B7EFF26145FC7C426ACB23EEB2E6A5A1207F0A6F40F804E7D6CE7` |
| `browser/hoi4wiki.js` | 727 | `05F79B32C7F73DEC01FF3BD6312912659C50610BCD78D35D16DA594022F45ADD` |

## Native platform dependencies

The [native inventory](../../work/iron-meridian/native-inventory/inventory.json) decodes 536 ordinary import entries from 23 DLLs, including exact IAT/ILT RVAs and named or ordinal entries. PE directory 13, the delay-import directory, has address and size zero; no delay imports were decoded. DLL role labels and proposed replacements below are interpretations of static import declarations, not runtime traces. Counts are import entries, not runtime call counts.

| Imported DLL and entry count | Observed symbol examples | Inferred role and browser boundary |
| --- | --- | --- |
| `steam_api64.dll` (16) | `SteamAPI_Init`, `SteamAPI_RunCallbacks`, `SteamInternal_FindOrCreateUserInterface`, `SteamGameServer_RunCallbacks` | Steam client/server interfaces and callbacks. Recover exact call sites and requested interfaces before specifying a service adapter; its native DLL cannot be assumed browser callable |
| `PDXSDK.dll` (38) | Decorated names contain `SetSessionToken`, `GetTelemetryEnabled`, `SetTelemetryConsentChoice`, `QueueAndSendTelemetry` | Paradox configuration/session and telemetry integration. These names do not establish which flows run or provide implementation of the service. Both this DLL and Steam DLL implementations/transitive imports are uninspected |
| `OPENGL32.dll` (46) | `glViewport`, `glTexSubImage2D`, `wglGetProcAddress` | OpenGL and extension loading. Browser rendering requires an explicit compatible renderer and shader/API translation; backend selection is unobserved |
| `D3DCOMPILER_47.dll` (1), `d3d11.dll` (1), `dxgi.dll` (2) | `D3DCompile`, `D3D11CreateDevice`, `CreateDXGIFactory1`, `CreateDXGIFactory2` | Direct3D 11 shader/device and graphics infrastructure. Reproduce shader compilation inputs, bindings and render behavior with browser GPU APIs rather than importing these Windows DLLs |
| `d3dx9_43.dll` (8), `d3d9.dll` (2) | `D3DXCreateLine`, `D3DXCompileShader`, `D3DXLoadSurfaceFromMemory`, `Direct3DCreate9`, `Direct3DCreate9Ex` | A separate Direct3D 9/helper path is declared. Its effective use and fallback relationship to D3D11/OpenGL remain unknown |
| `KERNEL32.dll` (203) | `CreateFileW`, `ReadFile`, `WriteFile`, `CreateThread`, `QueryPerformanceCounter`, `GetProcAddress`, `LoadLibraryW` | Files, timing, synchronization, threads, process/runtime and dynamic loading. Recover simulation scheduling separately from the OS adapter. Dynamically resolved and transitive dependencies can exceed this import ledger |
| `USER32.dll` (119), `GDI32.dll` (26) | `CreateWindowExW`, `PeekMessageW`, `DispatchMessageW`, `CreateDIBSection`, `GetTextMetricsW` | Native windows/events and graphical/text services. A browser needs DOM/canvas input, focus, layout and text adapters with verified behavior |
| `IMM32.dll` (10) | `ImmGetCandidateListW`, `ImmSetCompositionStringW`, `ImmSetCompositionWindow` | Input-method composition. Retain composition behavior through a browser text-input adapter |
| `WINMM.dll` (20) | `waveOutOpen`, `waveOutWrite`, `waveInOpen`, `waveInStart`, `timeEndPeriod` | Audio device I/O and timer control are declared. Browser audio/capture and scheduling need separate adapters. Their presence does not prove gameplay microphone use |
| `XINPUT1_3.dll` (2) | Ordinals 4 and 2 only | Controller-related dependency inferred from DLL identity. Ordinal meanings were not resolved here; do not label them as particular functions |
| `SETUPAPI.dll` (9) | `SetupDiEnumDeviceInfo`, `CM_Locate_DevNodeA`, `CM_Get_Device_IDA` | Host device discovery; determine which features depend on it before designing a browser replacement |
| `WS2_32.dll` (1) | Ordinal 57 only | Winsock-related dependency inferred from DLL identity. The ordinal, protocol and service call path remain unresolved; this does not establish the multiplayer transport |
| `SHLWAPI.dll` (2), `SHELL32.dll` (10) | `PathFileExistsW`, `PathAppendW`, `SHGetFolderPathW`, `ShellExecuteW`, `DragQueryFileW` | Paths, host shell and file/drop handling. Replace with an explicit local-content import and browser navigation/export boundary |
| `ole32.dll` (6), `OLEAUT32.dll` (1) | `CoInitializeEx`, `CoCreateInstance`, `CoTaskMemFree`; OLEAUT ordinal 6 | COM object/runtime integration is declared. Determine object identities and feature paths before replacing them. OLEAUT ordinal meaning is unresolved |
| `ADVAPI32.dll` (7) | `GetUserNameA`, `RegOpenKeyExW`, `RegQueryValueExW`, `OpenProcessToken` | Host account/registry/token services. Browser settings and identity need an explicit separate adapter |
| `VERSION.dll` (3) | `GetFileVersionInfoA`, `VerQueryValueA`, `GetFileVersionInfoSizeA` | Executable file-version metadata lookup; replace only where an actual feature requires it |
| `bcrypt.dll` (3) | `BCryptOpenAlgorithmProvider`, `BCryptGenRandom`, `BCryptCloseAlgorithmProvider` | Native cryptographic RNG provider. This does not identify the gameplay PRNG, its seed, state or deterministic behavior |

This is a direct-import inventory of `hoi4.exe`. Imported COM interfaces, `LoadLibrary*`/`GetProcAddress` paths, extension functions, linked DLL internals and statically linked libraries are outside its coverage. `PDXSDK.dll` and `steam_api64.dll` are visible local root files; `cef` resource packs and `libcef.so` are also shipped but are not named in these 23 direct import descriptors. No conclusion about their runtime loading follows from either presence or absence in this one table.

## Native code that remains to recover

| Subsystem | Observed anchor | Required recovery or replacement | Current evidence limit |
| --- | --- | --- | --- |
| Data/runtime interpreter | Shipped DSL files name triggers, effects, scopes, modifiers, conditions and native objects | Recover parser/load order and evaluator semantics; implement the same state and dispatch rules in portable code | Detailed evaluation and override behavior remain unknown |
| Simulation core | Definitions cover production, research, construction, units, supply, diplomacy, combat and AI | Recover exact arithmetic widths, rounding, branches, update order, random state, dependencies and native object layouts | Shipped scalar values establish neither a final formula nor a tick result |
| World and pathfinding | Actual province bitmap, ID table, adjacency rules, rail and supply input exist | Recover topology construction, path costs, route permissions, supply solving and incremental invalidation | Existing 84-province fictional geometry is not evidence about the native world |
| Rendering and UI | Original shader/GUI/asset input exists | Retain portable algorithms where recovered; replace Win32/GPU/widget adapters and reproduce bindings | Readable shaders are only part of the renderer; no native frame was observed |
| Persistence | Native executable and scenario declarations exist | Recover serialization, compression, schema versions, references, checksums and deterministic restoration | QCC JSON saves do not establish native save compatibility |
| Multiplayer and service integration | Native import evidence is a separate static inventory | Separate simulation synchronization from transport, identities, sessions, achievements and online service adapters | Protocols, lockstep state, desync behavior and service enablement are not established by DLL names |
| Runtime/OS services | PE/import tables and directory layout | Replace native file/process/window/clock/thread/network adapters; preserve recovered scheduling semantics | Runtime use, dynamic imports and transitive paths remain unobserved |

WebAssembly is a portable virtual instruction set, not an x86-64 Windows PE loader. The observed executable cannot be made a browser module by changing its extension. Emscripten targets portable C/C++ code, and its guidance calls out architecture-specific assembly and low-level native dependencies as rewrite work. This is a port consequence inferred from the PE target and the target model described by the [WebAssembly core specification](https://webassembly.github.io/spec/core/intro/introduction.html) and [Emscripten portability guidance](https://emscripten.org/docs/porting/guidelines/portability_guidelines.html), checked 17 November 2026.

WASM is a possible output for recovered portable routines. It does not recover their original source, infer missing structure layouts, implement Win32/Direct3D/Steam APIs, or prove gameplay accuracy. A TypeScript translation can also be valid for a small recovered routine if its exact integer/floating semantics are preserved. Those are implementation choices after recovery, not evidence that recovery has occurred.

## Current web build boundary

These are direct source observations from the present working tree, including existing uncommitted work. No application file was changed by this pass.

| Existing host | Evidence | Consequence for the actual port |
| --- | --- | --- |
| Browser application | `package.json`, `tsconfig.json`, `vite.config.ts`: TypeScript, Vite, ES2022/DOM output; no native executable build step | A recovered native slice needs an explicit browser adapter and, if WASM is selected, its own reproducible compile step |
| Lazy game lifecycle | `src/core/catalog.ts` loads `../games/*/index.ts`; `src/core/types.ts` defines `mount`, pause/resume, serialization and disposal | A real port can use this lifecycle, but the lifecycle does not implement the native engine |
| Current Iron Meridian | `src/games/iron-meridian/index.ts`, `model.ts`, `content.ts`, `map-data.ts`, `render.ts`; fictional campaign state and Canvas 2D renderer | Preserve this existing work. Its original six-nation/84-province model, rules, save format and arithmetic must not be relabeled as recovered HOI4 code |
| Existing WASM/worker precedent | `src/games/breachline/render/assets.ts` fetches a `.wasm` transcoder and creates workers; `vite.config.ts` permits same-origin workers and `wasm-unsafe-eval` | The host has a path to load a separately built WASM artifact. That establishes no support for the HOI4 executable or its imports |
| Storage | `src/core/storage.ts:20-51` writes JSON through localStorage with memory fallback; Iron Meridian has its own version-1 snapshot | A native save requires a distinct decoder/schema. Large map/assets/state need an explicit storage design; current small JSON persistence must not be assumed sufficient |
| Offline delivery | `scripts/offline-packs.mjs` computes chunk closure, public extras and SHA-256/size manifests; `src/offline/downloads.ts` handles quota failures | Locally selected original installation files need a separate import path. They must not silently enter the public game-art tree or ordinary public offline bundle |

For browser execution, direct host-file access and a blocking native main loop need replacement with imported/packaged data and cooperative callbacks or worker work. Emscripten documents its virtual filesystem and browser-loop boundary explicitly. This is an implementation constraint, not a measurement of this game. See [Emscripten runtime environment](https://emscripten.org/docs/porting/emscripten-runtime-environment.html), checked 17 November 2026.

## First actual native-code slice

The first proposed slice is the installed build's technology-rate and remaining-research calculation, exposed in an isolated browser inspection view. Native analysis is focusing on candidate VA `0x140F53350`, caller `0x140F52500`, and completion-related candidate `0x140F5DD50`. These semantic labels are provisional until the retained disassembly/decompilation establishes their complete behavior. The first slice must recover their dependencies rather than substitute a base-cost define or Iron Meridian's authored research rules. There is no accepted native-code port to claim here.

The retained [bounded caller disassembly](../../work/iron-meridian/native-inventory/research-rate-140f52500.asm), SHA-256 `B5A3F74F6729F9E95FD96B22F745B9D2039CCAD6B5BB8E113721015BBB02712B`, already establishes a concrete arithmetic boundary:

| Address range | Observed machine behavior | Remaining interpretation |
| --- | --- | --- |
| `0x140F52797-0x140F527D4` | Loads through `[r12+0x160]`, reads `+0x3E0`, combines a global, subtracts `[r12+0x198]`, and conditionally selects the positive result into a local | Research-cost/progress field and global meanings, all earlier paths, units and scales need recovery |
| `0x140F527D8-0x140F527E4` | Passes a stack output address and `r12` to `0x140F53350`, then loads its 64-bit output into `rbx` | The full rate-producing function and its dependencies remain to be established |
| `0x140F527FA-0x140F52840` | A conditional diagnostic path tests that value against zero; a failure path references `0x1429F1DE0` and can reach `INT3` | The diagnostic gates and assertion meaning require caller/global context; this is not unconditional game failure behavior |
| `0x140F52841-0x140F52877` | Initializes `-1` and `0x7FFFFFFFFFFFFFFE`, branches around division for nonpositive output or a special comparison, otherwise performs 64-bit `IMUL` by `0x186A0` (100,000), `CQO`, and signed `IDIV` by `rbx` | This supports a conditional scaled quotient, not an unconditional universal research-days formula. Preserve wrap, signed division and exceptional-value behavior exactly |

The disassembler's nearest-export annotations containing `PHYSFS_swapULE64` do not name the recovered research candidates. Use their actual addresses and call/field evidence. This is machine-code disassembly evidence, not original source or a completed decompiler result.

This gives a concrete smaller fallback: translate the conditional block at `0x140F52841-0x140F52877` with explicit raw 64-bit inputs and label it as that block. It can demonstrate an actual executable-derived arithmetic port while rate derivation and gameplay integration remain open. JavaScript `number` multiplication is not automatically equivalent to this 64-bit integer block; a faithful translation must use exact widths and signed operations, or a suitably compiled WASM equivalent.

1. Retain the actual instruction and decompiler output for the three candidates and all arithmetic/data-producing dependencies for the exact selected executable. Record the executable hash, preferred image base, function RVA/VA, instruction bytes/hash, caller context, constants/tables, referenced globals and every call target. RTTI, diagnostic strings and candidate xrefs alone are search seeds.
2. Establish a complete bounded operation for research rate and remaining work. Recover object field offsets and meanings, fixed-point scale, widths, signedness, integer division/rounding, modifier order, cap/zero/negative handling, and return/output semantics from the instructions and reachable dependencies. If a required modifier or indirect call is unresolved, retain the gap and do not guess it. A state snapshot adapter may supply explicitly recovered fields, but must not silently invent a native object model.
3. Port only the established operation into a separate private candidate, preserving the recovered semantics. Use an explicitly designed browser adapter with raw input and output fields. The adapter is new code; label its boundary separately from the recovered routine. Record each recovered branch and constant's originating address. Keep existing Iron Meridian simulation and saves untouched.
4. Create reference vectors at every recovered branch boundary, including zero work, fractional progress, rate changes, caps, invalid or nonpositive-rate handling if present, integer-division boundaries and overflow-sensitive values. Static instruction-based vectors establish a translation check only. Compare the browser translation with an isolated reference implementation derived from the same instructions, retaining both outputs and mismatches. Modifier-combination vectors are required once modifier inputs have been recovered.
5. Verify browser input/output, pause/dispose behavior, artifact identity and build reproducibility. Show the exact executable hash and covered function address in the inspection evidence. A working view proves that this slice runs in a browser; it does not prove native game behavior.
6. Native runtime equivalence remains unmeasured while original-game execution is excluded. A later explicitly authorized native scenario or isolated native-code reference run is a separate gate, with exact inputs and returned outputs. Do not mark this gate passed from decompiler text, a title string, or an inspired game test.

The resulting deliverable would be a real address-bound research routine port and a small inspection harness. It would not yet be a playable HOI4 port. If full rate computation is too entangled, a smaller recovered arithmetic leaf can be delivered with explicit inputs and an explicit statement that native rate derivation remains missing. Calendar/date conversion is a possible later candidate only after a real native implementation is located. Reading the research base-cost define and multiplying it by a technology cost does not qualify.

An actual-map viewer loading the original `provinces.bmp`/`definition.csv` through a user-selected local import is useful parallel infrastructure. Its RGB-to-ID hit test and table integrity checks should be honest new loader work. Without a recovered native routine it remains a data-viewing tool, not the requested native-code port slice.

## Validation and open gates

This pass read the listed files, counted the stated directories/extensions, hashed the selected source files, inspected the current browser host source, and read the shared import inventory and selected bounded caller disassembly. These checks establish inventory, architectural boundaries and the specific static instruction observations above. It did not execute the game, run the web application, install tools, take gameplay screenshots, compile a port, or run behavior/performance tests. Broader native function recovery is owned by the native analysis work.

The direct import ledger is complete to the decoded PE table's stated scope; transitive/dynamic dependencies remain open. Other open gates are native function recovery, effective content configuration, a faithful compiled/translated slice, browser verification, native runtime comparison, and then subsystem-by-subsystem expansion. Full content and engine parity, multiplayer, save compatibility, accessibility, and full-world performance remain separate unproven requirements.
