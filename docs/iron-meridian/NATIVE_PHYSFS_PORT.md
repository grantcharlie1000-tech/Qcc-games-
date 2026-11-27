# PhysicsFS archive/read dependency candidate

The actual executable reports PhysicsFS **3.1.0**. A pinned official upstream development snapshot with that version now builds to standalone WebAssembly and reads supplied loose files and ZIP archives. This recovers a reusable dependency candidate, not the game's custom PhysicsFS implementation, active mounts or a complete browser loader. Application source remains unchanged.

## Original version and conflicting license metadata

Target: installed `hoi4.exe`, SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. At `0x1425794E0`, the complete 15-byte `PHYSFS_getLinkedVersion` body is:

```text
48 85 c9          test rcx,rcx
74 09             jz return
66 c7 01 03 01    mov word ptr [rcx],0x0103
c6 41 02 00       mov byte ptr [rcx+2],0
c3                ret
```

For a nonnull output, this writes version bytes `03 01 00`, leaving following bytes unchanged. Null is a no-op. Both paths pass isolated original-instruction Unicorn 2.1.4 probes with guarded output memory. The Ghidra C/instruction exports and every instruction byte are bound to the original executable in [identity-evidence.json](../../work/iron-meridian/native-physfs/identity-evidence.json). This does not run the game.

The shipped `licenses.txt` heading at line 1233 instead says `PhysFS 3.0.1`, followed by the zlib license notice with 2001-2017 copyright. The discrepancy is retained, including the source-file identity and notice. The instruction result establishes what this linked-version function reports. Neither the heading nor that result identifies the full fork or its source revision.

## Official source selection

The [official repository](https://github.com/icculus/physfs) tag response returned `release-3.0.3` and `release-3.2.0` but no `release-3.1.0`. Version 3.1.0 therefore cannot be treated as a unique release archive. The selected candidate is official commit [6a7625cd7787f2f006771dbe6cfcf5447f0efdc1](https://github.com/icculus/physfs/tree/6a7625cd7787f2f006771dbe6cfcf5447f0efdc1), dated 29 September 2022, the immediate parent of the official 3.2.0 version-bump commit. Both its header and CMake version report 3.1.0. This is a reproducible selection rule, not evidence that this revision supplied the game.

| Retained input | Identity |
| --- | --- |
| [Official commit archive](https://codeload.github.com/icculus/physfs/tar.gz/6a7625cd7787f2f006771dbe6cfcf5447f0efdc1) | 243,077 bytes, SHA-256 `bcdfa65753f6a366d95e2699eeca0d62181a6471b097aaed1464570962010f04` |
| Extracted source | [native-physfs/upstream](../../work/iron-meridian/native-physfs/upstream/), unchanged against every regular archive member |
| License | Original `LICENSE.txt` retained with the source, zlib terms, 2001-2022 copyright |
| Source/history evidence | Official API responses, URLs, content hashes and exact candidate parent relation retained in `identity-evidence.json` |

No modern PhysicsFS revision or third-party amalgamation is substituted by version resemblance. Matching the version function and selected API structure is partial correspondence only.

## Native custom API boundary

The game's exported decorated signature for `PHYSFS_enumerate`, at `0x142578AA0`, declares a callback with two extra values beyond upstream's `(data, origdir, fname)`: a `PHYSFS_FileType` and an rvalue-reference C++ `std::string`. The recovered caller callback `0x14255F720` actually consumes a type and opaque additional string. This is concrete custom ABI evidence. The stock upstream candidate has neither callback parameter.

The native export and official `physfs.c:2539` share a recognizable outline: validate path/callback, obtain state and locking, allocate path scratch space, sanitize the path, walk a search list, handle mount points, verify paths, consult provider stat, dispatch enumeration, optionally filter symbolic links and return failure on callback error. Their structural resemblance does not resolve custom fields, threading, allocation or provider behavior. Native code accesses a context through `0x14257BD90`, uses TLS error storage and invokes provider function pointers. Some Ghidra prototypes omit live register arguments, so pseudocode alone is not a callable interface definition.

Eight parent exports under `exports/platform` were inspected and independently checked instruction-for-instruction against target file bytes:

| Native entry | Observed role | Still unresolved |
| --- | --- | --- |
| `0x142578AA0` | Search-list enumeration with provider dispatch and custom callback ABI | Provider-generated raw types/string metadata, callback filtering and complete context lifetime |
| `0x1425798D0` | Returns null or a resolved handle field at `+8` | Resolver `0x14257E250`, actual active handles and returned root strings |
| `0x14257A1C0` | Rejects null path, delegates to `0x14257D260` with null IO | Effective mount plan and helper/provider behavior |
| `0x14257A370` | Constructs memory IO state, calls the same mount helper, suppresses supplied destructor on mount failure | Complete native IO implementation, ownership/concurrency and provider equivalence |
| `0x14257A500` | Searches handles for an open-read result, allocates/registers a file wrapper | Path verification, concrete provider open/read functions and platform behavior |
| `0x14257A870` | Rejects counts above signed64 maximum, handles zero/buffering, dispatches IO reads | Actual IO leaf implementation, partial/error/runtime behavior |
| `0x14257B540` | Initializes stat output, searches mounts and dispatches provider stat | Concrete provider values, links, paths and native filesystem metadata |
| `0x14257B7F0` | Returns an initialized context's archive-info array, otherwise records an error | Actual registered native formats and any custom providers |

Do not label the candidate's ten compiled formats as the game's supported formats. The native archive-info pointer is runtime state; static zeroed data is not a captured initialized list.

Stock `PHYSFS_enumerateFiles` also performs its own string collection/sort/deduplication. Its output cannot stand in for the native **callback stream** when validating first-callback metadata retention. A new adapter could supply a declared listing and explicit stat results to [virtual-files.ts](../../src/games/iron-meridian/native/virtual-files.ts), but attaching empty metadata would remain an adapter choice. The existing [VFS port](NATIVE_VFS_PORT.md) keeps that input boundary honest.

## Standalone build and observed checks

[build.py](../../work/iron-meridian/native-physfs/build.py) uses the existing portable Emscripten 7.0.0 SDK through a subprocess-local `EM_CONFIG`. It installs nothing, changes no global environment and writes only under `work/iron-meridian/native-physfs`. The original source has no patches. The new [probe.c](../../work/iron-meridian/native-physfs/probe.c) exposes small inspection helpers alongside stock public APIs.

The build uses upstream's `__EMSCRIPTEN__` Unix/POSIX branch over Emscripten FS, with optical-drive probing disabled. Strict C99 initially failed because upstream's internal header includes `alloca.h` only on Linux/Solaris. Force-including the SDK header fixes that declaration without changing the upstream source. The initial log/manifest are retained. The build targets web, worker and Node environments, dynamic execution disabled, signed64 WASM BigInt calls, and a declared 256 MiB maximum linear memory. This configuration is a new portable adapter choice.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| `candidate/physfs.mjs` | 64,394 | `db49e1f89784dcbc1d2efbc6d4ce88d920796340eb12a0b8fa41f37f4bf05f67` |
| `candidate/physfs.wasm` | 119,583 | `e00342c4fce2877bfbf8b1e5007ddfcaea799436f53eb735f64fcb4ff24aa3a5` |

[build-manifest.json](../../work/iron-meridian/native-physfs/build-manifest.json) retains the exact command, observed compiler version/driver hash, source/header hashes, configuration and output identities. The successful build emits the SDK's `WASM_BIGINT` deprecation warning; signed64 calls remain exercised by the fixture.

[check.mjs](../../work/iron-meridian/native-physfs/check.mjs) passes **268 assertions** in Node 24.17.0 executing the compiled WASM. These overlap within file-read checks and are not 268 independent parity scenarios. They cover:

- Linked version, initialization and the candidate's compiled provider metadata: ZIP, 7Z, GRP, PAK, HOG, MVL, WAD, SLB, ISO and VDF. Availability is not comprehensive format validation.
- Newly authored MEMFS loose files, zero-length bytes, memory-backed stored/deflated ZIPs, binary data including NUL/high bytes, explicit/implicit directories, file size/type, seeks into compressed data, tell/EOF and reads past EOF.
- Explicit synthetic append/prepend search lists, overlapping filenames, mount points, signature recognition with a non-ZIP extension, real-directory lookup, refusal to unmount an open provider, missing files and malformed/truncated archive rejection.
- All **28 regular members** of two explicitly supplied installed ZIPs. Every decoded byte-length/SHA-256 matches independent Python `zipfile` decoding. No installed member bytes are copied into application/public assets.

The fixture's initial relative `argv0` failed initialization because the Unix base-directory path could not be established in its empty virtual environment. Passing the explicit synthetic `/native-physfs-fixture` supplies its base-directory contract. The failed result is retained as `verification-initial-relative-argv.json`; it is not concealed as native behavior or repaired by changing the installed system.

## Actual installed archive inputs

[installed-archives.json](../../work/iron-meridian/native-physfs/installed-archives.json) inventories only `.zip` files beneath the selected installation's `dlc/` and `integrated_dlc/`. It records complete member metadata, compression flags/methods, CRC values and independent decoded hashes. This search does not classify unrelated CEF `.pak` files or assert any selected DLC is active.

| Supplied path | Archive bytes | Entries | Expanded bytes | Observed compression |
| --- | ---: | ---: | ---: | --- |
| `dlc/dlc003_rocket_launcher_unit_pack/dlc003.zip` | 2,461,198 | 36, including 9 directories | 7,571,393 | 9 stored directory records, 27 deflated regular members |
| `dlc/dlc005_heavy_cruisers_unit_pack/dlc005.zip` | 41,971 | 1 regular member | 42,086 | Deflated |

No encrypted entries were observed in those archives. They establish real asset-byte decoding for these two inputs. They do not test script override activation, all archive encodings, ZIP64/encryption, malformed-input safety or native provider parity.

## Browser and native integration still required

This fixture stages explicitly supplied archives in WASM memory and supplies synthetic loose files through MEMFS. It has no browser directory acquisition, retained import store, asynchronous File-backed IO, streaming archive provider or Windows disk access. A browser integration must supply bytes, retain them for the mount lifetime, close file handles before unmounting and release memory only after provider use ends. The fixture models this with caller-owned buffers and null archive destructors, then unmount/deinit before freeing them.

Recover the game's mount-selection and provider paths before applying automatic precedence. Synthetic append/prepend demonstrations establish candidate API behavior only. Recover the custom callback's extra type/metadata production and the read resolver before substituting stock listings. Match the native filename/path, symbolic-link, error, allocator and threading behavior where they affect observable results. Whole-library equivalence cannot follow from the version function.

For a concrete next checkpoint, use an explicitly supplied mount list and these verified byte readers behind the [loader contract](NATIVE_LOADER_CONTRACT.md), retaining `base-loose-explicit` or another declared supplied-input scope. Native selection recovery can later supply an observed/recovered mount plan; it must not be replaced by archive filename order. Feed the recovered VFS exactly the callback/listing information it requires, execute selected chunks as bytes and keep raw-world parsing labeled as its authored adapter.

Reproduction from the retained source and existing SDK:

```powershell
C:/Python314/python.exe -B work/iron-meridian/native-physfs/collect_evidence.py
C:/Python314/python.exe -B work/iron-meridian/native-physfs/create_fixtures.py
C:/Python314/python.exe -B work/iron-meridian/native-physfs/build.py
node work/iron-meridian/native-physfs/check.mjs
```

Evidence is separated into static byte correspondence, two original-instruction version probes, candidate compilation and Node-hosted WASM behavior. No original game, browser, full application check/build, native Ghidra project, package installation, commit, push or deployment was performed for this slice. The full game port remains unfinished.
