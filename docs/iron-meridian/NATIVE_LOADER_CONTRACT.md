# Browser startup contract for recovered native components

Inspected 17 November 2026. This is a proposed integration contract, not implemented startup behavior. The smallest supported result is an inspection session built from user-selected base loose files: recovered VFS ordering, a candidate matching-source Lua VM, and the existing raw world adapter. It can show the actual province map and supplied defines. It cannot start a native campaign.

Recovery target: `hoi4.exe`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. This identifies the recovered code. Imported content gets its own hashes; selecting a folder does not establish its executable version or effective runtime configuration. [NATIVE_PLAN.md](NATIVE_PLAN.md) and [PARITY_LIMITS.md](PARITY_LIMITS.md) remain authoritative about unfinished work.

## Existing code and the integration point

| Existing file | Available behavior | Boundary |
| --- | --- | --- |
| [virtual-files.ts](../../src/games/iron-meridian/native/virtual-files.ts) | Selection and traversal over supplied listings, roots, replacement pairs, stat and real-directory results | No mount creation, archive provider or file-byte resolver |
| [defines.ts](../../src/games/iron-meridian/native/defines.ts) and `native/lua51/runtime.mjs`, `runtime.wasm` | `OrderedDefines.load(chunks)`, typed `get`, `close` | Candidate Lua 5.1.1 dependency with recovered adapters; no complete host bindings or registry initialization |
| [define-number.ts](../../src/games/iron-meridian/native/define-number.ts) | Numeric conversion and minimum-speed clamp under declared default MXCSR | Does not supply missing/non-numeric define behavior or observe the running game's globals |
| [world-data.ts](../../src/games/iron-meridian/native/world-data.ts) | Parse base declarations/BMP/state syntax, construct `RawWorldData`, source-pixel lookup | Newly authored file adapter, not a recovered native world parser or world constructor |
| [native-world/browser-check.mjs](../../work/iron-meridian/native-world/browser-check.mjs) | Diagnostic Canvas 2D map, pan, zoom, source-pixel inspection | Private fixture consumes generated artifacts, not browser-selected original files |
| [core/catalog.ts](../../src/core/catalog.ts) and [main.ts](../../src/main.ts) around line 488 | Lazy game import and asynchronous `GameModule.mount` | Current Iron Meridian entry imports the fictional `model`, `map-data`, `content` and renderer |

The future entry can return a `GameInstance` immediately with an empty import view, then start loading after the user selects content. This keeps `dispose` and navigation available while loading. No shared `GameContext` change is needed. The view supplies pause/resume, restart and cleanup through the existing interface. There is no clock, nation choice, research action or campaign save in this session. Failure shows an import error; it must not silently start the fictional simulation.

## First supported source mode

Use one explicitly selected installation directory, restricted to loose base content. Call this scope `base-loose-explicit`. Its required inputs are:

- `common/defines`, including descendants accepted by the recovered filter/traversal.
- `map/default.map`, and the two files named by its unique `definitions` and `provinces` scalar assignments under `map/`.
- Immediate `history/states` files ending in `.txt`, matching the existing raw-base importer. This selection is an adapter policy, not a recovered native state-loader rule.

Do not read the whole installation into memory. Capture the relevant path index first, then read only selected bytes. The selected parent folder name is a display label and is removed exactly once from directory-input paths. Require relative slash-separated paths with no empty, `.` or `..` segment, NUL, backslash, leading slash or drive prefix. Reject duplicate exact paths and file/directory conflicts. Preserve case and punctuation. These are browser input checks, not new behavior inside the recovered comparator.

For the first mode, require ASCII path components within the selected input subtrees and encode them directly to bytes. All 1,084 paths in the retained raw-world manifest are ASCII. Browser string names do not establish the executable's original narrow filename encoding for arbitrary non-ASCII names. File **contents** remain bytes; the path restriction does not restrict Lua strings or state text.

No archive, DLC, mod, `dlc_load.json`, launcher selection or `replace_path` activation is applied. The folder may contain these files, but their presence does not establish which mounts are active. No supplied active-root snapshot is fabricated from directory names.

## Capture and loader APIs

The following are proposed interfaces. They are not present in the app today.

```ts
interface CapturedBaseSource {
  readonly scope: 'base-loose-explicit';
  readonly label: string;
  readonly acquisition: 'directory-input' | 'directory-handle';
  readonly directoryCoverage: 'captured' | 'inferred-from-files';
  readonly directories: readonly string[]; // relative paths, includes required roots
  readonly files: readonly { path: string; blob: Blob }[];
}

interface InputIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface BaseInspectionManifest {
  readonly schema: 1;
  readonly scope: 'base-loose-explicit';
  readonly snapshotId: string;
  readonly recoveryTargetSha256: string;
  readonly loaderBuildId: string;
  readonly directoryCoverage: CapturedBaseSource['directoryCoverage'];
  readonly inputs: readonly InputIdentity[];
  readonly definePathsInExecutionOrder: readonly string[];
  readonly statePathsInAdapterOrder: readonly string[];
  readonly mapPaths: {
    defaultMap: 'map/default.map'; definitions: string; provinces: string;
  };
  readonly vfsInput: { searchRoots: readonly []; replacementPairs: readonly [] };
  readonly assumptions: readonly string[];
}

// Worker-owned operation. Retain the Lua context in the worker after success.
loadBaseInspection(source: CapturedBaseSource): Promise<{
  manifest: BaseInspectionManifest;
  world: RawWorldData;
  defines: OrderedDefines;
}>;
```

`snapshotId` hashes a versioned canonical manifest payload containing input identities, selected execution order, path/directory coverage and explicit VFS assumptions. It excludes its own ID, timestamps and the display label. It names an imported snapshot, not the user's active installation. `loaderBuildId` binds the adapter/runtime version; retain the concrete component identities alongside the manifest. Blob size and modification time alone are not identities. Capture/read failures abort the operation. This is a recorded set of individually read files, not an atomic snapshot of a changing installation.

## Selection, execution and world assembly

1. **Capture browser inputs asynchronously.** Build an in-memory directory/file index. The recovered `NativeVfsDependencies` API is synchronous, so browser directory reads must finish before calling it. Keep a separate path-to-Blob map for file reads. `rawMetadata` is opaque native output and must not become an invented source resolver.
2. **Supply the explicit loose-tree model.** Direct file children become `NativeVfsEntry` records with `rawFileType: 0`; directories use `1`; metadata is empty. Set `searchRoots: []` and `replacementPairs: []` as a declared adapter input. No replacement bound exists, so `getRealDir` is not reached. Unexpected `stat` or `getRealDir` calls fail the adapter instead of guessing platform results. This reproduces the recovered algorithm for this supplied model, not PHYSFS mounting behavior.
3. **Enumerate defines with the native arguments.** Call `enumerateNativeVirtualFiles` with ASCII `directory: 'common/defines'`, empty `outputPrefix`, literal suffix **`lua`**, `contains: null`, `currentDepth: 0`, `maximumDepth: -1`. Require `kind: 'returned'` and no VFS diagnostics. Join each emitted relative name under `common/defines` and resolve that exact captured path. Preserve returned order without a second full-path sort. Current-directory files precede recursively visited child directories; byte comparison is unsigned and case-sensitive. `filelua` can pass because the native suffix has no dot requirement. See [NATIVE_VFS_PORT.md](NATIVE_VFS_PORT.md) and [CONFIGURATION_LOADING.md](CONFIGURATION_LOADING.md).
4. **Read and hash exact selected chunk bytes.** Create `OrderedLuaChunk` records with full diagnostic path and `source: Uint8Array`; call `OrderedDefines.load` once. Its fresh context executes the ordered list and closes on failure. Do not extract assignments with a text parser or run `script/autoexec.lua` as a substitute. Keep the context until replacement/disposal so typed queries remain available.
5. **Inspect a define without constructing native globals.** Query `get('NDefines', 'NTechnology', 'MIN_RESEARCH_SPEED')`. Preserve the returned `LuaValue` type. Convert only a numeric result through `minimumResearchSpeedFromNumber`; otherwise report the typed result without substituting `0.1`, zero or a fabricated default. A numeric `0.1` gives `10000n` under the adapter's declared default MXCSR. This is a supplied-context inspection value, not a live runtime-global observation or full native validation.
6. **Assemble the raw world independently.** Decode `map/default.map` using fatal UTF-8, parse its ordered syntax tree, require one `=` scalar for each referenced map path, and enforce containment beneath `map/`. Decode definitions and state files using the same explicit UTF-8 policy; preserve the bitmap bytes. For the immediate state list, use the recovered VFS function with suffix `.txt`, maximum depth `0`, then record that adapter-selected order. Call `ingestRawWorld(definitionText, bitmapBytes, stateFiles)`. Block ready status if `issues` contains an error; retain warnings. The existing importer establishes this data contract, not native parser equivalence.
7. **Publish one inspection result.** Commit a ready manifest only after defines and world validation succeed. Display `Raw base map`, source dimensions and lookup details. The map and Lua branches share input provenance; there is no recovered evidence that this Lua context initializes the raw-world adapter or the actual native world. Joining them into one session is new integration plumbing.

The observed base fixture has three supplied define chunks, a 5,632 by 2,048 bitmap, 13,414 definition rows and 1,081 authored states. These are retained reference observations, not hardcoded acceptance counts for every import. The [world input report](../../work/iron-meridian/native-world/input-report.json) records zero relationship errors, one warning and all source hashes. A different valid input receives a different snapshot identity.

## Small proposed file boundary

| Proposed file/change | Responsibility |
| --- | --- |
| `src/games/iron-meridian/native/local-source.ts` | Capture file/directory input into the restricted relative index; no installed-path assumptions |
| `src/games/iron-meridian/native/loader.ts` | The operation above, manifest construction and explicit source/VFS validation |
| `src/games/iron-meridian/native/loader.worker.ts` | Own loader/VM lifetime, progress, typed define queries, result transfer and termination |
| `src/games/iron-meridian/native/local-content-store.ts` | Optional retained snapshots in separate Cache Storage; no server uploads |
| `src/games/iron-meridian/native-view.ts` | `GameInstance` for import/error/ready inspection, adapting the existing raw-map fixture |
| Existing `src/games/iron-meridian/index.ts` | Explicit native-inspection entry wiring when implemented; no call to the fictional model from that path |

A worker keeps synchronous Lua execution and full bitmap parsing off the app thread and makes cancellation possible through termination. `OrderedDefines.load` itself has no interrupt API and does not yield between individual Lua instructions. Do not label an `AbortSignal` check between phases as cancellation of an executing chunk.

Worker execution is a new acceptance gate. The retained Lua build requests `-sENVIRONMENT=web,node`; its generated wrapper also contains worker detection, but no worker fixture has established this proposed use. Explicitly compile/validate the intended worker environment before wiring it. The existing main-window production fixture is separate evidence.

Use messages with a `sessionId`: `load(source)`, `queryDefine(requestId, root, section, key)` and `close`; responses are `progress(phase)`, `ready(manifest, world)`, `defineResult(requestId, LuaValue)` or `failed(phase, detail)`. Send the successful `RawWorldData` with its `Map` collections using structured clone and transfer the province-ID buffer once. Keep the Lua object inside the worker. Byte-string query results are copied arrays; BigInt inspection values stay typed in messages and become decimal strings in persisted JSON. Terminate an old worker before replacing it; ignore old-session responses. `dispose` also releases listeners, renderer buffers and retained File/Blob references. The first implementation should transfer no partial ready world/context after failure.

`GameInstance.serialize` should contain only `{ kind: 'native-base-inspection', version: 1, snapshotId, view }`. Restore accepts that discriminator and resolves content by verified snapshot identity. Do not put bytes, ASTs, typed arrays, Lua handles or native pointer graphs into `GameContext.save`. The current save path is JSON/localStorage and can be synchronized through the existing account flow; it is unsuitable for imported content. Existing fictional campaign saves have a different discriminator and must not be converted into native state.

## Browser folder access and offline retention

The repository has File/Blob selection and preview lifetimes, but no directory picker, directory-handle persistence, IndexedDB or OPFS implementation under `src`, `public` or `scripts`. TypeScript's bundled DOM declarations expose `webkitdirectory`, `File.webkitRelativePath` and filesystem handle types; those declarations are not runtime support evidence.

For the first adapter, feature-detect a directory file input and require usable relative paths. Cancellation returns to the empty view. Reject a flat FileList that cannot reconstruct required paths. Its index infers parent directories from files and cannot establish a complete empty-directory listing, so record `directoryCoverage: 'inferred-from-files'`. A future feature-detected directory-handle adapter can capture directory entries explicitly, read only relevant subtrees and record `captured`; access failure or lost permission requires selection again. Neither adapter needs write permission or a Windows absolute path. Do not promise cross-browser availability or persistent folder access without testing that browser. If neither path adapter works, report unavailable rather than guessing an installation location. No browser folder-access code was exercised for this document.

Reuse the repository's **storage pattern**, not its game-download records:

- [downloads.ts](../../src/offline/downloads.ts) already uses Cache Storage, SHA-256/byte lengths, storage estimates, persistence requests and ready-after-verification. [public/sw.js](../../public/sw.js) prunes `pocket-arcade-v3:files` against its game manifests. Imported blobs placed there would be unlisted and eligible for deletion.
- Use separate namespaces such as `im-native-v1:content` and `im-native-v1:meta`, outside the worker's existing owned-cache prefix. Content entries are Responses keyed by same-origin synthetic URLs ending in the byte SHA-256; snapshot records map validated relative paths to those hashes. Read them with `cache.match` directly. The current service worker does not serve these namespaces, so a synthetic URL is a cache key, not an assumed fetch route.
- Estimate required storage, request persistence when offered, hash/check each stored body, then write the ready snapshot record last. Cache writes are not a multi-record transaction. On failure retain no ready record; on reopening require every referenced body and identity before use. Eviction, missing bodies and quota errors require reimport or an explicitly temporary session. Retention failure need not invalidate an already loaded in-memory inspection. Provide removal for these own namespaces; the current download removal UI does not manage them.
- Retain only selected input bytes plus a small manifest initially. Recompute derived world data rather than storing the large AST/index twice. The retained world sources total 35,575,054 bytes; its province-ID array alone is 46,137,344 bytes. A full RGBA map adds another 46,137,344 bytes before canvas/VM/AST overhead. Storage quota is not available RAM; resource failure must remain an error, not permission to truncate geography.
- App code and WASM must also be present offline. [offline-packs.mjs](../../scripts/offline-packs.mjs) follows game bundle imports, dynamic chunks and emitted asset-name references, including workers/WASM. Future integration must import these modules through the entry and verify the actual emitted pack contains the worker, runtime JS and WASM. The current pack contains the original prototype. The separate successful Lua production fixture does not establish the application pack's native contents.

Local source bytes, derived bulk world files and private fixture inputs do not become public build assets. Offline readiness has two gates: verified app/VM artifacts and a complete local snapshot. A game-download badge alone cannot establish both.

## Remaining native work

The next implementation can satisfy the inspection contract without pretending the following dependencies are implemented:

| Missing dependency | Consequence |
| --- | --- |
| Launcher selection, descriptor parsing/binding, mount loops, archive providers and PHYSFS open/read resolution | Cannot automatically select effective DLC/mod scripts, roots, replacement data or world bytes |
| Complete embedded-VM equivalence, Luabind, engine host/package bindings, registry loop and validation | A successful candidate context is not a fully initialized native configuration subsystem |
| Native world parser/construction, history date/trigger/effect evaluation, localization, topology and ownership | Raw state syntax and source pixels do not construct countries or a campaign |
| Actual research-state initialization and indirect runtime leaves | `researchDaily(memory, state, dependencies)` still needs a real memory/state adapter, vtable/category/context/locale behavior, world/TLS state and other globals; an inspected minimum-speed value alone cannot supply them |
| Outer simulation, AI, save/load, input/render/platform adaptation | No playable native game, save compatibility or end-to-end parity claim |

The concrete follow-on validation should cover selected-folder mapping, VFS-to-byte-path joins and exact execution order, typed missing defines, corrupted/truncated inputs, failed reads, retained-body corruption/eviction, worker cancellation/disposal, stale session responses, real-source map lookup, production worker/WASM inclusion and reopening with the network disabled. Existing component tests and fixtures support these checks but do not replace them.

This document was prepared by source/fixture inspection only. No implementation, dependency, test, build, browser run, original game execution or distribution change was performed for this task.
