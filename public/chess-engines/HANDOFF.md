# Chess AI handoff

Base contract merge: `25c0f8d34568001aa9f4a32a96031c8827393b10`, PR #186.
Branch: `feature/chess-ai-implementations`.

## Delivered providers

The complete stable-id/name/target table is in [README.md](README.md). Twelve
opponents are installed:

- Pebble 300 and Sprout 500: original QCC beginner decision system.
- Ember 700 and Brook 900: the same explicitly identified lightweight family,
  with stronger capture/threat perception and elementary reply inspection.
- Atlas 1100, Quill 1300, Orbit 1600 and Vega 1900: genuine Maia3 policy
  inference, conditioned on the selected rating and sampled over legal moves.
- Titan 2200, Zenith 2600 and Nova 3000: genuine Stockfish native UCI strength
  control. Apex: unrestricted Stockfish 19 Lite search.

Lumen/Leela is unavailable. No validated, maintained LC0 browser runtime/model
combination was established for this deployment, so no Leela provider is
registered. Dala and older Maia weights are not bundled. Dala's real released
transformer weights and inference requirements were investigated; the low
tiers accurately identify their custom fallback. See [NEURAL_RESEARCH.md](NEURAL_RESEARCH.md).

Maximum is unrestricted **lite** Stockfish, using its smaller network and
one CPU thread, 16 MiB hash, no pondering and caller-controlled search time.
It does not claim full-network Stockfish strength. All target ratings remain
goals/conditioning parameters, not independently established online ratings.

## Included executable/model files

| Provider | Exact artifact | First-use asset bytes |
| --- | --- | ---: |
| QCC beginner 1.0.0 | Original TS Worker + vendored chess.js 1.4.0 | Small generated Worker bundle, no weights |
| Stockfish.js 19.0.1 | `stockfish-19-lite-single.js` + `.wasm`, embedded `nn-61e7af4bb97d` | 1,874,201 |
| Maia3 | Official frontend ONNX at `0013cc8e6ec52c88f5b3d694781d4cc8427cb91a`, three unchanged-byte model parts + ORT Web 1.23.0 JS/WASM | 57,569,361 |

Every public file fits the 25 MiB individual Cloudflare Pages limit. Models
and engines load only when selected, from the configured same-origin Vite
base, including repository subpaths. No runtime CDN or Python server is used.

## Functional capabilities and limits

All three providers asynchronously initialize, report progress, use dedicated
Workers, consume the frozen contract and return UCI moves from the supplied
legal set. They respect abort, revision/request identity, absolute chess clock
deadlines and repeated disposal. Concurrent games have independent Workers.
Cancellation during search terminates computation; reusing a canceled neural
session may require a visible model reload within bounded recovery time.

Stockfish supplies separate real post-game analysis: White-oriented centipawn
or mate scores, principal variations and depth, with MultiPV and cancellation.
Limited-strength moves do not inherit an unrelated strongest-line evaluation.
Maia and the beginner provider do not manufacture analysis scores.

The frozen contract exposes a thinking-time budget, not configurable depth or
node controls. Search uses UCI `movetime`; node/depth controls would require an
agreed contract extension. Maximum has no intentional move weakening or depth
cap. The ordinary engine does not require cross-origin isolation or a GPU.

## Browser and performance evidence

Actual locally served Workers/WASM pass at `/Qcc-games-/` in desktop Chromium,
Firefox 157 on Linux, Pixel Chromium emulation with 4x CPU throttling, and iPhone
WebKit emulation. Physical Android/iPhone devices remain untested. Localhost/cache
measurements are not mobile-network download forecasts. All 66 named browser
cases passed, including real Stockfish games and neural parity/recovery tests.

Core and neural reports/screenshots are in
`tests/chess-ai/providers/browser/artifacts/`. The neural suite compares raw
WASM logits with an independently generated native Python ORT reference at
four positions, including Black, castling and promotion. Maximum observed
policy-logit difference was 0.015625; LDW-logit difference was 0.007486.

Maia measured 224 MiB of actual WASM arenas, plus 45.7 MB of assembled model
bytes and other allocations. A Chromium process measurement rose from roughly
165 MiB baseline renderer RSS to 575 MiB while ready, then declined after
Worker termination. These are aggregate process observations, not isolated
engine allocation sizes. Small physical phones may lack sufficient memory.
Stockfish's compiled initial linear memory is 128 MiB, with growth enabled.
Its hash size is not a total memory measurement.

The final Stockfish baseline played six color-balanced complete games against
the 900 fallback and won all six, with no illegal moves, failures or capped
games. At 50 ms UCI search it averaged 45.55 ms, p95 51.07 ms under shared load.
The approximate 95% score interval is 0.61 to 1.00, with paired-game dependence;
six games establish a gross strength distinction rather than an Elo estimate.
The complete moves, source hashes and budgets are in
`tests/chess-ai/providers/stockfish-strength-results.json`.

See [CALIBRATION.md](CALIBRATION.md) for beginner tuning, final pool, draw/cap
handling, timing, tactics and statistical limitations. The final beginner core
SHA-256 is `cc2abb0fc7f37bc760dce77c185e1b30b555db86aa7def4c51de8a969e5f1148`.
Across 120 selected, color-balanced beginner games, stronger-tier scores were
81.25% (500/300), 72.5% (700/500) and 65% (900/700). All games reached actual
rules endings: 87 checkmates, 33 draws, no failures or capped games. The first
80 games used an earlier source snapshot; a reconstruction check proves that
only the unused 900 profile changed before the last 40 games.

The final Maia 1100/fallback 900 boundary was seven wins and one draw for Maia
from eight games. Four-game Maia adjacent samples scored 62.5%, 62.5% and
87.5% for the stronger conditioning input. These small neural samples check
for obvious inversions; they do not establish adjacent Elo differences. The
900/1100 boundary may still be wider than the catalog target and needs larger
future samples. This limitation is not hidden by claiming a measured rating.
The neural adjacent matrix ran 912 genuine inferences averaging 78.6 ms, p95
91.0 ms on the test VM, excluding browser pacing/startup.

## Licensing

| Component | License and distribution evidence |
| --- | --- |
| Original QCC beginner | MIT, local license and source |
| chess.js 1.4.0 | BSD-2-Clause, unmodified executable logic, retained notice/checksums |
| Stockfish.js/embedded NNUE/provider | GPL v3; local COPYING, AUTHORS, complete corresponding source archive, exact rebuild network and build instructions |
| Official Maia frontend export/inference | GPL v3; exact pinned model, source archive, attribution and provenance; no separate model override found upstream |
| Maia3 upstream model/code | AGPL v3; upstream source archive and notice retained |
| ONNX Runtime Web 1.23.0 | MIT plus required third-party notices, exact local binaries/checksums |

Engine-specific notices, source links, checksums and build/export limitations
are beside the assets. The public QCC repository contains local provider
source. Neither Python checkpoint regeneration nor physical-device performance
is claimed where not verified.

## Integration requirements

The game imports only the existing `src/chess-ai` registry. There are no shared
dependency, registry, contract, game, routing, board, multiplayer or leaderboard
changes in this branch. Display the actual provider identity/download estimate
and loading/failure state. Supply valid FEN, start FEN, complete UCI history,
legal moves, monotonically increasing revisions and available clock time.
Dispose sessions on leaving/game end/restart. Only expose analysis after play
where ranked-game policy allows it. Serve every runtime/model part with its
normal JavaScript/WASM MIME type and retain source/licensing files.

Verification commands, repository baseline failures and compatibility limits
are recorded in [VERIFICATION.md](VERIFICATION.md). Independent code review
resolved the identified cancellation/recovery/clock issues and found no
remaining Critical or Important code defects.
