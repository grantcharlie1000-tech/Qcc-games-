# E2E CI repair

Branch: `fix/e2e-green`. Starting WIP: `0f46bd3`. `origin/main` was fetched and merged; both merge attempts were already up to date at `f31711e`.

The [latest main CI run](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/41578315987) had 78 Chromium and 64 WebKit test failures across the full-suite shards. Build and both campaign checks passed. This branch retains and verifies the earlier WIP's selector/material repairs; this session additionally reproduced and repaired the Movies grid-key collision and manual-context port mismatch.

## Failure causes and repairs

| Specs | Cause | Repair |
| --- | --- | --- |
| `tests/movies/movies.spec.ts` | Library assertions predated Crossy Road joining the catalogue. | Follow the current 23-game library and separate Movies tab. |
| Glass/material specs under `tests/e2e/`, `tests/movies/glass.spec.ts` | Tests expected the older clear navigation/sheet material and old icon geometry after the intentional #92 frost/icon changes. | Update material contracts and raster sampling geometry; retain clear HUD checks, 4.5:1 text contrast, and 3:1 icon contrast. No production styling changes. |
| `tests/e2e/study-expansion.spec.ts`, `tests/accounts/storage-full.spec.ts` | Removed Drop fruit button, renamed reading return link, and rankings/settings moved into the shared game menu. | Use current visible basket, return link, and shared menu entry points; preserve persistence, focus, and storage-capacity checks. |
| Crossy lifecycle/death/rendering specs | Hidden legacy shell controls, renamed reading return link, and screenshots written to the absent `/workspace/qcc-crossy-work/shots` directory (`ENOENT` in CI). | Use shared menu actions and per-test artifact paths. Check gameplay and overlay state without depending on disposable hint elements. |
| `tests/games/ball-run/play.spec.ts` | Real simulation time elapsed during asynchronous focus/HUD assertions before checking launch speed. | Capture distance/speed in the trusted Play click, then separately verify acceleration. |
| `tests/games/blockcraft/weather.spec.ts` | A brief lightning bolt expired while the software renderer and test driver exchanged messages. | Hold the clock, advance weather explicitly, and verify the rendered bolt while its lifetime is held. |
| `tests/movies/network-recovery.spec.ts`, `src/movies/view.ts` | Late status updates replaced pressed result links; Retry could be inserted below the fallback grid. The WIP's grid reuse key also included loaded Home titles absent from an unfiltered section grid. | Preserve unchanged result nodes, retain incoming sibling order, and key reuse from the titles actually rendered. Regressions cover a response during pointer press, Retry placement, and search/fallback transitions. |
| `tests/games/animal-stack/play.spec.ts`, `tests/multiplayer/*` | Manual browser contexts/navigation still hardcoded port 4173 while the configured server uses 4600. Both targeted reproductions failed with `ERR_CONNECTION_REFUSED`. | Use the configured Playwright base URL for manual contexts and relative multiplayer navigation. |
| `tests/e2e/focus-rings.spec.ts` | After opening the menu, the test queried its trigger by accessible role while modal navigation asynchronously hid/inerted that trigger. It intermittently timed out after the sheet had opened successfully. | Keep the in-sheet search checks, then close with real pointer input and verify the trigger's restored focus and absent ring when it is accessible again. |

## Verification record

All install/test/build commands use `flock /tmp/qcc-test.lock`. Browser verification uses one Chromium worker and the configured server on port 4600.

- Locked `npm ci`: passed.
- Initial broad Chromium baseline: 106 passed, then intentionally interrupted to address the independently identified Movies grid-key regression.
- New Movies grid regression before fix: failed (result count 2, visible cards 1).
- Movies network recovery after fix: 19 passed (44.3 seconds).
- Animal Stack CDP and multiplayer Blockcraft before base URL fix: both failed immediately at hardcoded 4173.
- Base URL fix verification: all 13 Animal Stack and multiplayer browser tests passed (2.9 minutes), including the full online Pool rack and relay-failure behavior.
- Full local shard 1 additionally exposed the menu-trigger race above and a Chromium process abort (`D-Bus connection was disconnected`) during a screenshot. The latter did not reach a failed app contrast assertion; a private D-Bus rerun is pending.
- Remaining verification: in progress.

Independent review checked the complete prior WIP and the new Movies and base URL changes. Its actionable Movies finding was reproduced, fixed, and re-reviewed. No additional correctness findings were reported.
