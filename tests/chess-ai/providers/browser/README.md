# Real browser checks

Run from the repository root:

```sh
node tests/chess-ai/providers/browser/run.mjs
```

The runner builds an independent test entry with Vite and serves it at
`/Qcc-games-/`, with the website's same-origin WASM policy. It imports the frozen
registry, uses actual providers, actual browser Workers and local engine assets.
No engine or chess UI is mocked.

It checks discovery, legal replies, loading progress, cancellation, stale replies,
restart, concurrent games, Worker disposal, special moves, invalid FEN, real
Stockfish analysis and a complete Stockfish game. Separate pages remove the WASM
response and crash the engine script to check truthful initialization failure.

Chromium runs on desktop and with Pixel device emulation. WebKit runs with iPhone
emulation. These are browser compatibility checks, not physical phone benchmarks.
The report includes actual load/search durations, requests, Worker counts and
Chromium's JavaScript heap counter where available. That counter does not measure
native/WASM memory. Screenshots and `report.json` are written to `artifacts/`.

`CHESS_SKIP_FULL_GAME=1` skips the longer standard-start Stockfish game for quick
iteration. The final verification must include that game. `CHROMIUM_PATH` may
select another installed Chromium executable. Install WebKit with the project's
Playwright CLI before running if that browser is unavailable.

Maia3 has a separate run so that loading its 57.57 MB of assets is explicit:

```sh
CHESS_NEURAL_ONLY=1 node tests/chess-ai/providers/browser/run.mjs
```

That run writes `artifacts/report-neural.json` and `neural-*.png`. It checks
three real 1300-conditioned moves, both player colors, 700 ms budgets, cancellation,
Worker disposal and failure after a model part is removed. No model or WASM is
requested before the selected provider starts.

The mobile Chromium run applies Chromium's 4x CPU throttle in addition to device
emulation. An emergency 20 ms clock may legitimately produce a bounded timeout;
it must not continue searching or produce a stale move.

This Cloud environment initially lacked several WebKit system libraries. For the
recorded run, Debian trixie packages were downloaded and extracted under `/tmp`
with `dpkg-deb -x`, then their libraries were copied into Playwright's user-owned
browser runtime. No system packages or website settings were changed. WebKit's
actual executable then launched and ran the suite. Its host validator still did
not find the locally supplied GLES library, so the recorded commands used
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. Normal machines with Playwright's
system dependencies installed do not require that variable.

The neural run also compares real WASM logits at four white, black, castling and
promotion positions with Python ONNX Runtime 1.23.0 CPU reference outputs. It
aborts an active request after 20 ms, then asks the same session for another
700 ms move to exercise actual model reload recovery.

Localhost timings are not download predictions. The files and OS caches may be
warm, and emulation does not reproduce phone memory limits or thermal behavior.

On Linux Chromium, `processMemorySamples` records CDP process identities, CPU time
and `/proc` RSS before engine loading, while the engine is ready, and immediately
after disposal. `rendererRssKiB` includes all page and Worker memory in renderer
processes. `totalProcessRssKiB` also includes the browser, GPU and utility processes.
Neither value isolates engine allocations, and summing process RSS can count
shared pages more than once. Browser allocators and the OS need not return RSS
immediately after termination. WebKit has no equivalent process API in this runner.

Optional desktop Firefox checks use the same real engines, production subpath and
security policy without replacing the Chromium/WebKit reports:

```sh
npx playwright install firefox
CHESS_FIREFOX_ONLY=1 node tests/chess-ai/providers/browser/run.mjs
CHESS_FIREFOX_ONLY=1 CHESS_NEURAL_ONLY=1 node tests/chess-ai/providers/browser/run.mjs
```

Those commands write `artifacts/report-firefox.json` and
`artifacts/report-firefox-neural.json`, plus separate Firefox screenshots. Firefox
runs include the complete Stockfish game unless `CHESS_SKIP_FULL_GAME=1` is set.

The recorded Firefox engine runs on Linux. Playwright's Desktop Firefox profile
sets a Windows-style user agent; that profile does not verify Windows itself.
