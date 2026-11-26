# Stockfish browser engine

QCC serves the unmodified Stockfish.js **19.0.1** release, built from
`nmrugg/stockfish.js` commit `0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6`.
The engine identifies itself through UCI as `Stockfish 19 Lite WASM`.

## Files and provenance

| File | Purpose | Source |
| --- | --- | --- |
| `stockfish-19-lite-single.js` | Unmodified browser Worker, 28,230 bytes | [release v19.0.1](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1) |
| `stockfish-19-lite-single.wasm` | Unmodified single-threaded lite engine and embedded NNUE, 1,845,971 bytes | same release |
| `nn-61e7af4bb97d.nnue` | Corresponding embedded network, retained separately for rebuilding; not downloaded at runtime | [Fishtest network download](https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue) |
| `stockfish.js-v19.0.1-source.tar.gz` | Complete upstream source, including C++, Emscripten glue and build scripts | [tagged source archive](https://github.com/nmrugg/stockfish.js/archive/refs/tags/v19.0.1.tar.gz) |
| `COPYING`, `AUTHORS`, `UPSTREAM-README.md` | Unmodified upstream license, credits, documentation | same source tag |
| `SHA256SUMS` | Pinned hashes of the above assets | Generated with `sha256sum` |

Upstream engine: https://github.com/official-stockfish/Stockfish.
Browser port: https://github.com/nmrugg/stockfish.js.
The lite network is credited by the binary to **Chris Bao (sscg13)**,
https://github.com/sscg13/Stockfish/tree/sf19-1mb.
Its SHA256 begins `61e7af4bb97d`, matching the network's content-based filename.

## License and corresponding source

The distributed Stockfish.js engine package, including its embedded network,
is published under **GPL v3**. Preserve `COPYING` and `AUTHORS` when distributing
it. Stockfish C++ headers permit GPL version 3 or later; the browser distribution
declares GPL-3.0. The manifest conservatively declares `GPL-3.0-only` for the
combined published artifact. No separate permissive weight license is assumed.
The upstream README acknowledges neural training data from Leela Chess Zero,
available under ODbL: https://storage.lczero.org/files/training_data.

The complete pinned upstream source is served alongside the executable, and the
separate original NNUE file supplies the network required to rebuild the lite
binary. QCC provider adapter sources are in `src/chess-ai/providers/stockfish/`
in the public QCC repository and distributed under GPL-3.0-only.

To rebuild from the supplied source using the upstream toolchain:

```sh
tar -xzf stockfish.js-v19.0.1-source.tar.gz
cp nn-61e7af4bb97d.nnue stockfish.js-19.0.1/src/
cd stockfish.js-19.0.1
# Install/activate Emscripten 6.0.9 first, as required by upstream README.
node build.js --lite --single-threaded --no-split
```

QCC did not rebuild or modify the released JS/WASM and does not claim
bit-for-bit reproduction of the upstream build. All necessary source and build
instructions are included. Verify downloads with `sha256sum -c SHA256SUMS` from
this directory.

## Strength and search

| Opponent id | Configuration |
| --- | --- |
| `elo-2200` | `UCI_LimitStrength=true`, `UCI_Elo=2200`, `Skill Level=20` |
| `elo-2600` | `UCI_LimitStrength=true`, `UCI_Elo=2600`, `Skill Level=20` |
| `elo-3000` | `UCI_LimitStrength=true`, `UCI_Elo=3000`, `Skill Level=20` |
| `max` | `UCI_LimitStrength=false`, `Skill Level=20`, no node/depth weakening |
| Post-game analysis | Unrestricted search with up to five principal variations |

The actual binary advertises `UCI_Elo` range **1320 to 3190**. Targets inside
that range use genuine Stockfish strength control, rather than fabricated
low-depth presets. These UCI targets are upstream calibration parameters,
not verified Chess.com ratings. Finite thinking budgets, device speed and
the lite neural network affect achieved strength.

Maximum is **unrestricted Stockfish 19 Lite**, not the full 99 MB neural
network build. The lite build is the strongest practical bundled option under
the current Cloudflare Pages per-file limit of 25 MiB and this project's mobile
download constraints. No intentional move weakening is applied in Maximum.
The adapter caps thinking at 30 seconds per request and uses the caller's
smaller clock-aware budget, one thread, 16 MiB hash and no pondering.
Cold initialization time is deducted from the search budget. A separate hard
deadline includes initialization and reserves 15 milliseconds of the remaining
chess clock; insufficient time rejects with a timeout and releases the Worker.
Upstream compiles **128 MiB initial WASM linear memory**, with memory growth
enabled and a 2 GiB compiled ceiling. The 16 MiB hash setting is not total
engine memory. JavaScript, compilation and browser overhead add to this; an
allocation failure makes initialization fail, rather than selecting a different
engine. The compiled ceiling is not a claim of routine 2 GiB use.

When the caller supplies exactly one legal move, move selection returns it
immediately without starting a search or fabricating an evaluation. Analysis
still performs a full search. Position, opponent and clock checks remain active.

## Hosting and lifecycle

Only JS + WASM (1,874,201 bytes) are loaded for a selected Stockfish session.
Nothing is preloaded on the homepage. Serve `.wasm` as `application/wasm` and
`.js` as JavaScript. The Worker starts compiling while the adapter checks the
WASM URL and MIME. After that check it performs `uci`, option setup, `ucinewgame`, `isready` and waits
for `readyok`. All URLs respect Vite's relative base, including subpath hosting.

The verified upstream single-threaded asyncify build needs no
`SharedArrayBuffer`, cross-origin isolation, WebGPU, CDN or server inference.
Current Chromium and WebKit are exercised by the provider browser suite;
upstream specifies iOS 16+, macOS 11+, modern Android/desktop browsers.
Upstream compatibility is not a claim of physical-device testing.

Every session owns one Worker. Cancellation sends `stop` and terminates it,
settles the pending request, clears listeners/timers and invalidates the Worker
generation. The next request reinitializes a fresh Worker, using browser HTTP
caching for local assets. Disposal is idempotent. Outdated Worker output is
ignored. Ordinary completed requests reuse the Worker. Analysis is separate
from move selection and converts side-to-move scores to White's perspective.

## Verification commands

From the repository root:

```sh
npx vitest run tests/chess-ai/providers/stockfish-protocol.test.ts tests/chess-ai/providers/stockfish-lifecycle.test.ts
npx playwright test tests/chess-ai/providers/stockfish-browser.spec.ts --project=chromium
node tests/chess-ai/providers/stockfish-strength.mjs
```

The strength benchmark runs the bundled WASM through its real UCI Node entry
point, six full games with reversed colors and three paired openings. It
records every move, seed, time, engine depth/nodes, exact source/asset hashes,
failures and unfinished games in `stockfish-strength-results.json`. The normal
custom 900 core receives 75 ms per move and unrestricted Stockfish receives
50 ms per move. This checks the expected large strength gap, not target Elo.
The separate `stockfish-strength-pilot-results.json` and
`stockfish-strength-pre-final900-results.json` are explicitly historical
pre-tuning runs and are not evidence for the final beginner profiles.

The final recorded run against beginner core SHA256
`cc2abb0fc7f37bc760dce77c185e1b30b555db86aa7def4c51de8a969e5f1148`
ended in **six Stockfish wins in six completed games**, with no draws, illegal
output, failures or ply caps reached. Colors were balanced three games each.
Stockfish averaged 45.55 ms over 87 moves (p95 51.07 ms); custom averaged
26.54 ms over 84 moves (p95 56.91 ms). These include shared-machine scheduling
overhead. The approximate 95% Wilson score interval is 0.610 to 1.000; paired
openings make games correlated. This supports a large strength advantage in
this small test pool and does not establish a numeric Elo or platform rating.
