# Installed world input adapter

Inspected 17 November 2026. This implements a new reader for the actual installed Hearts of Iron IV world files. It is infrastructure for a future real-world renderer, not a recovered native engine or an effective content-load implementation. The fictional Iron Meridian geography and simulation are unchanged.

The installation at `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV` was read only. No original file was changed, no browser or original game was executed, and no original content was placed in public assets. All extracted bulk output remains under [work/iron-meridian/native-world](../../work/iron-meridian/native-world/).

## Exact input boundary

The runner reads `map/default.map`, follows its `definitions` and `provinces` declarations, and reads all 1,081 ordinary `history/states/*.txt` base files. It hashes each input as read. [input-report.json](../../work/iron-meridian/native-world/input-report.json) records all 1,084 input paths, byte lengths and SHA-256 values, along with adapter/generator identity and validation findings.

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `map/default.map` | 504 | `af7037b4be45c903fc3e136462dce7071eb468eac9a50f9d81c48dbf7d6a16f2` |
| `map/definition.csv` | 465,289 | `86846be71198d6772c651638aa22e3656133198de9b7c49c6234ed48cf33d87b` |
| `map/provinces.bmp` | 34,603,062 | `e131d30e5dcb13d9c2a8598f820a2de0ae9828f3a24f2bddc1bcfff40f71660a` |

These are raw base files. DLC archives, mods, launcher selection, replacement directives, load order, effective runtime overrides and history evaluation remain unresolved. No ownership or country map is inferred from filename ordering or history statements.

## Observed results

| Check | Result |
| --- | ---: |
| Source bitmap | 5,632 × 2,048, 24-bit BI_RGB, bottom-up |
| Source pixels | 11,534,336 |
| Province definitions | 13,414 |
| Declared land rows | 10,155, including ID 0 |
| Declared lake rows | 126 |
| Declared sea rows | 3,133 |
| Distinct province IDs in pixels | 13,413 |
| Unknown pixel RGB values | 0 |
| Parsed state files / states | 1,081 / 1,081 |
| Unique state-to-province associations | 10,272 |
| Associated land / lake provinces | 10,154 / 118 |
| Definition, grammar or relationship errors | 0 |
| Warnings | 1, ID 0 has no pixels |

All nonzero land definitions have a state association. Authored lake associations are retained exactly. Eight lake definitions have no base state association; no association is invented for them. No state IDs conflict, no province is assigned to multiple states, and no state references an unknown province in this selected input set.

The first validator wrongly imposed a land-only state rule. Actual shipped files showed 118 explicit lake associations. [initial-validation-land-only-assumption.json](../../work/iron-meridian/native-world/initial-validation-land-only-assumption.json) retains that rejected diagnostic result and its adapter hash for audit. Its 118 reported errors describe the rejected adapter assumption, not established defects in the game files. The final report above uses the corrected relationship validation.

## Reusable code and rendering contract

[world-data.ts](../../src/games/iron-meridian/native/world-data.ts) provides:

- `parseClausewitz`: a tokenized, ordered syntax tree for comments, quoted strings, repeated assignments, operators, scalar lists and nested blocks. Unknown string escape pairs remain literal, and raw quoted text is retained. It does not execute scripts or merge repeated keys. A nesting limit of 512 is an adapter resource bound, not a native engine claim.
- `parseProvinceDefinitions`: eight-field CSV validation with exact sparse IDs, RGB, declared type, coastal flag, terrain and continent; rejects duplicate IDs and colors.
- `parseProvinceBitmap`: validates the supported BMP header and complete row payload, including top-down/bottom-up orientation and row padding. Unsupported compression or bit depth is rejected.
- `parseAuthoredState`: requires one state block, one ID, one name and an explicit integer province list. Full ordered document syntax remains attached for later history recovery.
- `ingestRawWorld`: joins exact source pixels, definitions and authored associations. It reports unknown colors, malformed states, duplicate IDs/lists, unknown references, conflicting membership and unassociated land. Ambiguous membership is excluded from the usable association map; no file-order winner is selected.
- `provinceAtPixel`: integer-coordinate source-pixel hit testing, with top-left origin and no assumed wrapping, scaling or projection.

`RawWorldData.provinceIds` is a row-major `Uint32Array`, one exact ID per original pixel. Unknown colors use `0xffffffff`, distinct from province ID 0. `stateByProvinceId` contains only unambiguous associations with unique state IDs. `pixelsByProvinceId` records exact count and inclusive pixel bounds. Bounds can span disconnected regions or map edges; they are not native centroids, topology or UI positions.

[province-ids.u32le](../../work/iron-meridian/native-world/province-ids.u32le) is the corresponding private 46,137,344-byte little-endian index, SHA-256 `f6a3eefe8a34bc3c72d06193cbfa23c84c0a7c26655e900d09d499752311762f`. [world-index.json](../../work/iron-meridian/native-world/world-index.json) retains declarations, source-file associations, full state syntax trees and province pixel counts/bounds. It is original-content-derived bulk analysis output, not an application asset or an authorized distribution package.

## Validation and reproduction

Run the local import from the repository root:

```powershell
node work/iron-meridian/native-world/ingest-installed.mjs
python work/iron-meridian/native-world/independent-pixel-check.py
node node_modules/vitest/vitest.mjs run tests/games/iron-meridian/native-world-data.test.ts
```

Both scripts accept an explicit installation root as their next argument. The importer uses the already installed TypeScript package to transpile this one adapter into its own work directory. It installs nothing. It exits unsuccessfully if relationship validation reports errors. Fatal CSV, BMP or text-decoding errors stop the import instead of supplying defaults.

The narrow test file passes 24 behavior cases, including malformed grammar, repeated/datetime blocks, real lake membership, sparse IDs, duplicate ID/RGB rejection, conflicting state membership, missing references, bitmap row padding/orientation, unknown colors and truncated/unsupported images. A targeted TypeScript compiler program containing only this adapter and its test passes strict/no-unused checks. These checks establish new reader behavior, not native parser equivalence.

[independent-pixel-check.py](../../work/iron-meridian/native-world/independent-pixel-check.py) uses Python standard-library CSV, BMP struct decoding and an independently constructed pixel array. Its [retained result](../../work/iron-meridian/native-world/independent-pixel-check.json) confirms an exact byte-for-byte match for all 11,534,336 IDs and all province pixel counts, bound to input hashes and the TypeScript adapter hash. This is independent file-adapter corroboration, not native execution.

No full repository check/build, browser, screenshot or native-game run was performed. No UI/catalog/renderer, executable analysis, simulation, adjacency, passability, pathfinding, country ownership, seam wrapping or native effective load semantics was changed or validated. Those remain separate parent-owned work.

## Private browser fixture

[browser-check.html](../../work/iron-meridian/native-world/browser-check.html), with [browser-check.mjs](../../work/iron-meridian/native-world/browser-check.mjs), reads the existing private `world-index.json`, `province-ids.u32le` and `input-report.json` over HTTP. From a server whose root is this checkout, its path is `/work/iron-meridian/native-world/browser-check.html`. It requires Canvas 2D, Pointer Events, Web Crypto and the retained input outputs; it adds no package dependency. Use localhost or another secure browser context for Web Crypto.

The fixture verifies both output SHA-256 identities against the report, then renders the full source pixel index at its original aspect ratio. A new deterministic province-ID palette distinguishes declared land, lake and sea rows. These diagnostic colors convey no ownership, history or native rendering meaning. The `Raw base map` label and source dimensions remain visible over the scene. The scene fills the viewport beneath floating controls; no map area is reserved for them.

Drag pans, scroll or pinch zooms, and tap inspects an exact integer source pixel. The inspector shows the actual province ID, declared type/terrain/continent, unambiguous authored state ID, raw state-name key and source filename. No state-name localization or history is evaluated. `Fit` restores the complete map. Keyboard controls are arrow keys to pan, plus/minus to zoom, Enter to inspect the center, and F to fit. There is no automatic motion or assumed horizontal wrapping.

For parent-owned browser probes, `window.nativeWorldFixture.status` and `document.documentElement.dataset.fixtureStatus` expose loading/ready/error state. `window.nativeWorldFixture.lookup(x, y)` returns the raw source-pixel lookup, while `.view` describes the current screen transform and `.source` identifies the loaded index. The selection ring marks only the inspected source pixel.

This fixture is separate private inspection code. It does not change the application entry, catalog, public assets, world adapter, generated inputs or original installation. `node --check` passes for its support module. A Node probe with DOM and Canvas stubs loaded and hash-verified the real artifacts, checked the 5,632 × 2,048 image buffer, resolved source pixel `(3360,874)` to province 1 and state 454, and checked selection, pan, zoom, Fit, a 390 × 844 resize and pinch transforms. Those are code/transform checks, not browser input or visual evidence. Browser rendering, real pointer interaction and screenshots remain for the parent to verify. The fixture does not establish game parity.
