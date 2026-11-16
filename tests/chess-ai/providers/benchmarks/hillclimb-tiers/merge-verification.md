# Main integration verification

The owner subsequently requested merging this work to main. The reviewed chess
work was committed as `f70016ea`, then current main `3f5082a9` was integrated
without conflicts at `1e7b682c`. The custom provider source did not change.

Fresh local checks on the integrated tree:

- All 144 chess tests passed in 16 files, including main's imported-engine updates.
- Both offline unit tests passed. The new pack-generation regression first failed
  with `offline-packs: no chunk contains sample`, then passed after the fix below.
- `npm run build` completed with native exit code 0, including TypeScript, Vite
  and host preparation. Existing large-chunk and mixed-import warnings remain.
- Explicit offline-build verification passed: all listed sizes and SHA-256
  hashes match the output, with 40 shell files and 29 games, version
  `f20e716e4afcc2f3`. It was called directly because the existing CLI entry guard
  does not invoke verification on Windows.
- The final strength assembler passed after Git's LF normalization. It reconstructs
  the measured CRLF image before accepting the archived source hash. The committed
  source identity and line-ending-only difference are in `merge-source-identity.json`.

Main's newly added offline-pack builder used native Windows backslashes to look
up Vite's normalized module IDs, which broke the first integrated build at
`animal-stack`. The integration fix normalizes that one path to forward slashes.
The regression exercises real temporary files, pack output and worker stamping.
No bot parameters, search behavior or timing gates changed during integration.

An intermediate PowerShell wrapper reported failure after successful bundling
because Vite warnings were redirected as native errors. The final run explicitly
records the native build and verifier exit codes; both are zero. Failed and
intermediate logs remain in the ignored `.omc/state/chess-merge-*` files.

The earlier full-suite failures remain disclosed in `verification.md`; the full
suite was not rerun on this integrated tree. GitHub CI is separate from these
local checks. Physical-device and production-runtime validation were not added.
