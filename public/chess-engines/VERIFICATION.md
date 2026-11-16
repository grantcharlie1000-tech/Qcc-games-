# Verification record

Base: `25c0f8d34568001aa9f4a32a96031c8827393b10`.
Environment: managed Linux workspace, 2026-11-16. Physical Android and iOS
devices are not attached. Browser device emulation is labeled as such.

## Repository checks

`npm ci --no-audit --no-fund` installed the existing lockfile without changing
the manifest or lockfile. `npm run build` completed, including TypeScript,
Vite, Whetu host preparation and service-worker recovery verification. Existing
large-chunk warnings remain. Providers are independently built in the browser
harness because the separate game owner has not yet merged a chess UI import.

The initial full `npm test` run took 359.70 seconds:

- 289 test files passed, four failed, one skipped.
- 5,535 tests passed, eight failed, seven skipped.
- Two failures were timing-sensitive tests under concurrent test/benchmark
  load: Color Blocks `fair-deal` witness replay and Crossy Road terrain reachability.
- Six were deterministic existing Last Light failures: campaign stage 7 pickup
  overlaps platform 5; level 2 opening journey uses dash; continuous journeys
  1, 2, 3 and 4 die at frames 1773, 843, 1651 and 2442 respectively.

To distinguish these from the AI changes, a detached temporary worktree at the
exact unmodified base was tested with:

```
npx vitest run --root /tmp/qcc-ai-contract-baseline \
  tests/games/last-light/campaign.test.ts \
  tests/games/last-light/journey.test.ts \
  tests/games/color-blocks/fair-deal.test.ts \
  tests/games/crossy-road/terrain.test.ts \
  --maxWorkers=1 --testTimeout=15000
```

That unmodified-base reproduction had the identical six Last Light assertion
failures, with 172 other tests passing. The contract PR's existing build check
also failed before these providers existed:
<https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/43798383204/job/133072494761>.

The final full serial run, `npm test -- --maxWorkers=1`, completed in 706.26 s:
297 files passed, two failed, one skipped; 5,598 tests passed, six failed, seven
skipped. All six failures are the same existing Last Light assertions described
above. Both initial timing-sensitive tests passed in this serial run. No game
files were changed to conceal or fix unrelated failures.

The focused `npx vitest run tests/chess-ai --maxWorkers=1` run passed 84 tests
across eight files. `npm run check` and `npm run build` passed. Independent code
review cleared the found cancellation, restart, clock and late-delivery defects.

## Final merge review

Fresh independent review approved the implementation and independently reran
61 provider checks. Actual GitHub CI logs confirm 5,598 passing unit tests and
the same six failures as the exact main-content baseline, which had 5,531
passing tests. All 84 chess AI tests explicitly pass in head CI. The two
campaign browser checks also pass. Full repository browser shards may still
be running when the scoped AI change merges; their completion is not claimed.

A fresh Chromium/WebKit run of `stockfish-browser.spec.ts` exposed an overly
strict assertion requiring two MultiPV lines within 200 ms. WebKit returned
one legal line at the deepest completed depth. The frozen contract permits
fewer lines, so the test now requires one or two legal lines rather than
requiring a timing-dependent second line. The engine implementation is
unchanged. This test correction does not change calibration or model hashes.
The corrected Chromium and WebKit cases were each repeated three times:
12 real browser tests passed in 15.7 seconds, covering search, cancellation,
restart, analysis and missing WASM. Command:

```
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright test tests/chess-ai/providers/stockfish-browser.spec.ts --project=chromium --project=webkit --workers=1 --repeat-each=3 --reporter=line
```

The owner requested final review and merge after the baseline comparison.
Main has no required status checks, review gate or ruleset. The known unrelated
CI failures remain reported; no checks were disabled or represented as green,
and no unrelated game files were changed to make this PR pass.

That base run reproduced all six Last Light assertion failures, with the same
values, while both timing-sensitive files passed. Result: 172 passed, six
failed across four files, 36.22 seconds. No unrelated game files were edited.
The full repository suite must not be reported as green.

## Genuine browser evidence

`node tests/chess-ai/providers/browser/run.mjs` builds a separate Vite entry,
serves it at `/Qcc-games-/` with the site's same-origin Worker/WASM CSP and
tests the actual discovered providers and local binaries. The companion
neural run is documented in that directory's README. Reports and screenshots:

- `tests/chess-ai/providers/browser/artifacts/report.json`
- `tests/chess-ai/providers/browser/artifacts/report-neural.json`
- The adjacent desktop, mobile Chromium and iPhone WebKit screenshots.

These checks distinguish startup, normal search, cancellation and disposal.
They also check missing assets, Worker failures, concurrent games, stale
requests, special moves, terminal positions and real Stockfish analysis.
The Stockfish full-game test starts from the ordinary chess initial position
and must finish with a rules-confirmed result, rather than a mocked response.

Chromium's JS heap measurement excludes native/WASM memory. Counting constructed
and terminated Workers verifies cleanup but does not prove the browser returns
all process RSS immediately. Stockfish's compiled initial linear memory is
128 MiB, with growth enabled; its 16 MiB hash option is not its total memory.
Maia's model plus ORT first transfer is 57,569,361 bytes. The test-only parity
Worker observed actual WASM linear arenas totaling 234,881,024 bytes (224 MiB)
in all three browser environments, plus the separately assembled 45,683,686-byte
model buffer during initialization. Model sessions are per game.

The Chromium CDP/process snapshot observed aggregate renderer RSS increasing
from about 163 MiB to 588 MiB with Maia ready, then 471 MiB immediately after
disposal. The throttled mobile-emulation run measured 189, 572 and 469 MiB.
Those totals include the page, Workers, native allocator and possibly shared
pages; they are not isolated model allocations. Full browser RSS in the
desktop run increased from about 419 MiB to 845 MiB. Immediate allocator/RSS
retention after Worker termination is visible, rather than hidden by JS heap
measurements. This makes Maia an optional substantial-memory download, not a
safe assumption for a low-memory phone. See the raw per-run report for exact
measurements and caveats; timings and RSS vary across runs.

Firefox 157 on Linux also passed the genuine core and neural runs, including
a complete Stockfish game. Its Playwright desktop profile uses a Windows-style
user agent; Windows itself was not tested. Separate `report-firefox*.json` files
preserve this evidence. Physical mobile devices remain untested. The tested
WebKit build is the Playwright Linux build with iPhone emulation, not Safari
on an iPhone. Do not present upstream compatibility claims as measurements
from this run.

The combined four browser reports contain 66 passing named cases and no page
errors or remaining tracked Workers. Exact durations, full game moves and
per-process memory/CPU observations remain in the JSON evidence. Test commands:

```
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node tests/chess-ai/providers/browser/run.mjs
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 CHESS_NEURAL_ONLY=1 node tests/chess-ai/providers/browser/run.mjs
CHESS_FIREFOX_ONLY=1 node tests/chess-ai/providers/browser/run.mjs
CHESS_FIREFOX_ONLY=1 CHESS_NEURAL_ONLY=1 node tests/chess-ai/providers/browser/run.mjs
node tests/chess-ai/providers/stockfish-strength.mjs
```

The skip-host-validation variable was needed only for locally extracted WebKit
system libraries in this environment. The browser executable itself ran all
checks; no browser tests were skipped by that variable.
