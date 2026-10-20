# Globle verification — 2026-10-20

Environment: cloud container, 4 vCPU, Node 22.22.0, Vite 7 dev server on port 4173, Playwright's bundled
Chromium 1194 (`/opt/pw-browsers/chromium-1194`) with WebGL through **SwiftShader** (software GL, no GPU).
WebKit is not installed here and was not run. No physical Chromebook, phone or touchscreen was available.

## Commands and results

| Command | Result |
| --- | --- |
| `node scripts/build-globle-data.mjs` | 197 countries, 19,306 distances, 245 display features; all built-in geography assertions pass (~16 s) |
| `npx vitest run tests/games/globle` | 18 passed |
| `npm test` | 25 files, 292 tests passed |
| `npm run check` | exit 0 |
| `npm run build` | exit 0; Globle chunk 1.29 MB (460 KB gzip), lazy; offline pack 86 files |
| `npx playwright test tests/games/globle --project=chromium` | 10 passed (final code) |
| `npx playwright test tests/e2e --project=chromium` | 46 passed (final code): shell 14-card library, Study incl. Globle, viewport incl. Globle |
| `npx playwright test --project=chromium` (whole suite, before the review fixes) | 148 passed, 18 failed. 17 failures were `browserContext.newPage: Executable doesn't exist at /opt/pw-browsers/ffmpeg-1013` (video-recording specs: Ball Run, Color Blocks corrections) and 1 was a Solitaire touch test. Rerun with the container's ffmpeg-1011 mapped in a scratch browsers directory: 25 of 26 passed; the remaining one passed every gameplay assertion and failed only on `video.saveAs` (older ffmpeg wrote no WebM). Solitaire passed alone, so the first failure was load-related. None of these involve Globle code. |
| `ARCADE_GAMES=globle node scripts/verify-offline.mjs` (production build) | `OFFLINE PASS root globle + Study`, `OFFLINE PASS subpath globle + Study` — downloaded pack, disabled network, reloaded, played a guess; no external requests; Globle chunk not loaded by the library |

## What the browser tests exercise (real `/#/game/globle` route)

- **Complete winning round** (practice answer France via the real save/restore path): Spain and Belgium are 0 km
  neighbours, coloured dark red and still wrong; `uk`, `usa`, `cote d’IVOIRE` resolve through aliases, case and
  accents; `Great Britain` after `uk` is a duplicate; `Atlantis`, `Germny` (“Did you mean Germany?”), `Congo`
  (ambiguous), `England` (part of the UK) and blank input explain themselves; none increase the count (stays 5).
  France wins on guess 6: green, win panel, input disabled, practice stats “best 6”, Play again resets. Enter and
  the Guess button both submit. No page errors.
- **Tiny countries and saving**: Vatican City, Monaco, Nauru, Tuvalu, Singapore, São Tomé and Príncipe all resolve and
  each gets a visible marker. A daily guess survives a full reload with the same daily answer; practice progress is kept
  separately; a malformed save is ignored and play continues.
- **Mouse**: fly-to reaches Argentina; hovering and clicking unguessed land shows no name and adds no guess; a drag
  started immediately after a guess interrupts the flight; drag rotates, wheel zooms, arrow keys spin the focused
  globe; document scroll stays at 0.
- **Touch** (CDP touch events at 390×844): one-finger swipe rotates, two-finger pinch zooms, taps never guess;
  12-guess list scrolls inside its own area while the document stays at scroll 0 and 844 px tall.
- **Viewport** at 390×844, 844×390, 1366×768 and 320×568: the game fits, the globe is the largest element, and with
  the input focused the window is shrunk to 55% height (keyboard emulation) and the input stays fully visible.
- **Two tabs**: a daily win in one tab is adopted by a stale second tab, whose 5-second autosave then keeps the win.
- **Shell integration**: Escape from inside the text field opens Study and Games returns to the same game; pause stops
  rendering; leaving three times removes every canvas and re-entry restores the guess.
- `tests/e2e/study.spec.ts` includes Globle in the “all retained game instances” Escape/autosave-freeze test and
  `tests/e2e/viewport.spec.ts` in the all-games viewport test; both pass.

## Performance (SwiftShader, so CPU-rendered; not representative of a Chromebook GPU)

- Before optimisation, three-globe's polygon layer made ~3,200 draw calls (one mesh per island) and built them in one
  3.4 s task; drag frames were ~2.1 s apart. Land is now one merged mesh + one border mesh built in ≤10 ms slices:
  drag frame interval median 117 ms in SwiftShader, no long tasks per guess.
- Remaining mount long task (~3 s) is inside Three.js's WebGL program link during the first frame, i.e. SwiftShader
  compiling shaders on the CPU; our own mount work is ~0.5 s in total.
- Rendering stops ≈1.2 s after the last movement (`data-rendering="false"`), pixel ratio ≤ 1.5, 1.4 MP budget.

## Independent review

A separate reviewer found no blockers; all 2 major and 5 minor findings were fixed: per-part save validation,
cross-tab forward merge, midnight submit guard, resumable fly-to, WebGL restore grace period, land/colour-blind
contrast, adjacent-swap typo suggestions, more non-playable explanations, Åland/Hong Kong/Macao merged into
Finland/China, and a single win announcement.

## Evidence

`tests/games/globle/evidence/`: `chromium.png` (win state), `touch-390.png`, `layout-<w>x<h>.png`. Library screenshots
in `docs/evidence/home-*.png` show the 14-card library.

## Not verified here

Real on-screen keyboards (iOS Safari, Android Chrome, ChromeOS), physical touchscreens, WebKit, and frame rates on
actual school Chromebook hardware.
