# Verification — 2026-10-28 UI cleanup

The main surface now has one compact difficulty / Flags left / time / restart toolbar, the field, one status line and Reveal / Flag. The extra decorative heading, separate zoom row, repeated instructions and bottom settings disclosure were removed. The existing menu button opens a native dialog that groups game actions, preferences, practice and statistics; account/app settings remain accessible from there. Mobile initial tile sizes use the available width, with a 32 px minimum.

- Targeted Vitest: **32 passed** (Minesweeper rules/practice, shared play-surface and leaderboard formatting).
- Production Chromium: **18 passed** (all game/menu cases and difficulty ranking UI) against the latest production build served on port 4174.
- Account/leaderboard Chromium integration: **11 passed**, including signed-in score publication, save/account transfer, guest isolation and dialog pause transitions.
- `npm run build`: **exit 0**, including TypeScript, production bundling and offline manifest (125 files). Existing unrelated large-chunk warning remains.
- `git diff --check`: **exit 0**.

New tests first reproduced the crowded layout through the presence of the removed heading. They now verify a toolbar under 76 px, grouped options, generous button targets, pause/frozen clock on menu open, Escape/focus restoration, rules and app-menu transitions, and controlled scrolling at 1366×768, 390×844, 320×700 and 844×390. Existing gameplay/touch/restore/record tests were updated to use the simplified menu. Independent review additionally checked explicit paused state, native close-event ordering and disposal; no critical/important issue remained.

Final production screenshots, opened and visually checked, are under `tests/games/minesweeper/evidence/cleanup/`: `game-1366.png`, `game-390.png`, `game-320.png`, `game-844.png` and matching `options-*.png`. Browser input uses Chromium, including trusted CDP touch. No new physical-device or WebKit validation is claimed.

---

# Verification — 2026-10-27 Minesweeper improvement

All work was implemented in the existing codebase. No dependencies, production deploys or live database changes were introduced.

- `npx vitest run tests/games/minesweeper tests/leaderboard tests/accounts tests/core/storage.test.ts`: **97 passed in 10 files**. Includes 19 existing gameplay invariants, six practice/record checks (including 60 seeded hint-safety scenarios), real local database difficulty isolation, faster-time ordering, account-only submission and three new account best-key round trips.
- `npx playwright test tests/games/minesweeper tests/leaderboard/online.spec.ts tests/accounts/accounts.spec.ts --project=chromium`: **21 passed**. Checks real signed-in win publication, no publication for partial progress, two-browser record/save transfer, guest/logout isolation, offline cache and expired sessions as well as game controls.
- Final production-browser check: **13 passed** (12 game cases + difficulty-ranking UI). Uses the built files served by `vite preview` on port 4174, including practice undo after a loss. A subsequent small fix clears stale hint text after a move/undo; its focused practice checks were rerun against a rebuilt production preview.
- `npm run build`: **exit 0**, including TypeScript, Vite production bundling, movie registry validation and offline manifest generation (125 files). Vite reports the existing repository's large-chunk warning; Minesweeper itself is lazy loaded and adds approximately 8.5 KB gzip JS plus 3.2 KB gzip CSS.
- `git diff --check`: **exit 0**.

The game browser cases cover safe opening/flood behavior, correct/mismatched/incorrect chords, flag blocking, win without all flags, exact saved layout/reveal/flag restoration, terminal timer freeze, confirmed/cancelled restart, pause/background hiding and explicit resume, per-difficulty stats, explained/no-deduction hints, assistance surviving reload, first-reveal undo restoration, recovering a practice loss, trusted CDP touch tap/hold/pan/pinch/cancel, keyboard/assistive actions, reduced motion, first-play dismissal, sound default and shared fullscreen controls. Screenshot checks use 1366×768, 390×844 and 320×700 viewports; minimum tiles stay at 32 CSS px and large boards overflow inside the frame.

Screenshots are in `tests/games/minesweeper/evidence/refresh/`: `desktop.png`, `easy-1366.png`, `easy-390.png`, `easy-320.png`, three corresponding Hard screenshots, `result-win.png` and `result-loss.png`. All are browser captures; the final Easy/Hard layout captures are from the production preview. They were opened and visually inspected.

A Hard board with 480 tiles under Chromium 4× CPU throttling measured 18.2 ms for the synchronous reveal action and 21.8 ms to the next frame. Sixty sampled frame intervals had 16.7 ms median / 26.9 ms p95. See `evidence/refresh/performance.json`. These are headless shared Linux measurements, not physical Chromebook/phone performance claims.

Independent read-only review found the practice-ready clock validation, pause overlay placement and assistive-click issues. They were fixed and verified. A proposed account database allowlist issue was withdrawn after review of the existing later migrations. The reviewer reported no remaining critical/important finding.

WebKit's Playwright executable is not installed (`existsSync(webkit.executablePath())` was false). No physical iPhone, Chromebook or screen reader was available. Touch was tested with trusted Chromium CDP input; synthesized assistive clicks were checked separately. No WebKit/hardware validation is claimed. Rankings retain QCC's existing client-reported-score trust model rather than server replay verification.

The initial old browser tests failed where expected because they referenced removed artwork/size controls and the old Flag toggle behavior; one failure exposed the real pause-overlay placement issue. They were replaced with equivalent and expanded behavior tests. The new practice unit suite initially failed with the not-yet-created module. The passing commands above and final production run are the evidence for this implementation, not the historical results below.

---

# Actual verification — 2026-10-19

Worktree `/workspace/Qcc-games-/.worktrees/minesweeper`, isolated Vite server `npm run dev -- --port 4186` (Vite 7.3.7, `.vite-cache` owned/configured by parent). Commands were run here, not against the parent's port 4173.

- `npx vitest run tests/games/minesweeper`: **17 passed**, one file, 36 ms rules execution in final targeted run. Covers exact 10/40/99 mine counts, reproducibility and fixed beginner mine indices/number row; four seeds with protected center/far-edge openings on all sizes; adjacency boundaries; flood safety; flags blocking reveal without winning; all-safe win without flags; terminal input rejection; matched/mismatched/correct/incorrect chords; ready/playing/lost/won restoration; corrupt cells/masks/types/terminal state rejection.
- `npm test`: **21 passed** in two files (17 game rules + 4 existing storage tests), 525 ms wall duration reported by Vitest. No unrelated failing unit test was omitted.
- `npm run check`: **exit 0**, strict TypeScript.
- `ARCADE_URL=http://127.0.0.1:4186 npx playwright test tests/games/minesweeper --project=chromium`: **5 passed, 15.0 seconds**, Chromium **154.0.8037.57**, system `/usr/bin/chromium` with the repository launch options. Pointer/right-click and context-menu default prevention; flagged-cell non-reveal; F/arrows/Enter/C; zero flags on safe cells; correct chord and all-safe win; actual mine loss; wrong chord loss; timer freeze and blocked input while paused; resume; restart while paused; saved masks restored on return; three repeated route exits/re-entries; malformed save ignored; 9×9/16×16/30×16 levels; larger 44 px cells; 390×844 viewport, 366 px stage, no document horizontal overflow; real CDP touch start/hold/end, tap/flag-mode, and moved-touch cancellation.
- `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art/minesweeper/`: **4 passed, 0 failed** (existing unchanged parent cover plus new flag, mine and tile). Only the three new gameplay SVGs were authored here; parent owns the cover replacement.

Screenshot `tests/games/minesweeper/evidence/chromium.png` is an actual full-page capture at 390×844. I opened and inspected it: compact beginner board is legible, tile relief/number contrast is visible and the field stays within the phone width. Screenshot content after a difficulty switch uses a fresh runtime seed; the tests derive decisions from saved seeds rather than guessing positions.

`tests/games/minesweeper/evidence/performance.json` records 60 actual requestAnimationFrame intervals on an active beginner board: mean **17.22 ms**, median **16.70 ms**, p95 **16.80 ms**, maximum **33.40 ms**. This is a shared headless Linux execution host under concurrent work; it is not a physical Chromebook measurement or a performance guarantee.

The initial model stub produced 10 expected assertion failures before implementation. Early browser attempts failed due to starting before the server/UI existed and editing source while a run was active (Vite HMR reset that run). Subsequent failures exposed two test-fixture mistakes: a tile intentionally flagged by F was incorrectly expected hidden during pause, and injecting malformed storage while the game was mounted was overwritten by the shell's pagehide save. Those fixtures were corrected by comparing the pre-pause state and injecting after leaving the route. A later restore regression first demonstrated acceptance of an impossible all-safe loss, then passed after atomic chord hazard resolution and terminal validation were tightened. The final runs above are green.

A WebKit-only phone case was attempted separately. It could not launch because the Playwright WebKit browser executable is not installed; no WebKit interactions or rendering are claimed. Touch was tested through Chromium emulation/CDP, not physical iOS hardware. No physical screen reader was available. Parent still owns root/subpath production/offline and integrated-library checks, shared toolbar behavior and independent review. No outstanding gameplay defect was observed in the exercised paths.

## Independent review follow-up — long touch holds

The parent reviewer found a real P2 defect after the original verification: in Flag mode a sufficiently long hold placed a flag, but the 1.4-second suppression window expired before release and the release click removed it. A new Chromium-only trusted CDP regression reproduced the exact failure (flagged during hold, hidden after release). The initial regression attempt also found the isolated server stopped; after restarting port 4186, the observed assertion failure demonstrated the actual defect.

The fix tracks the active pointer's consumed state until pointerup and suppresses the one subsequent click with that same pointerId and tile. Suppression has no elapsed-time expiry. Pointer cancellation, board rebuild, pause, restart and dispose clear gesture state; a new pointer gesture starts cleanly. Native touch context-menu handling consumes its active gesture once. The regression holds for 2.2 seconds after the flag appears, waits for a trusted release click to reach the document, and verifies the flag remains. It then checks that the next short tap, keyboard F, right-click, and touchCancel followed by a short tap still work.

Fresh verification after this fix:

- Focused long-hold Chromium regression: **1 passed (7.3 seconds)** after observing it fail before the fix.
- Full owned Chromium suite: **6 passed (17.7 seconds)** using `ARCADE_URL=http://127.0.0.1:4186 npx playwright test tests/games/minesweeper --project=chromium`.
- `npx vitest run tests/games/minesweeper`: **17 passed**; `npm test`: **21 passed**.
- `npm run check`: **exit 0**; `git diff --check`: **exit 0**.

The existing committed screenshot/performance evidence remains the original measured layout evidence; this input-only fix changes no artwork or layout. WebKit and physical touch hardware limitations remain as stated above.

## Production artwork follow-up — relative CSS URL resolution

I opened the parent's `/workspace/Qcc-games-/docs/evidence/release/minesweeper-root-390.png` and confirmed the missing covered tiles. Following the local systematic-debugging workflow, I added an assertion to the existing phone browser case before changing production code, built this isolated worktree with `npx vite build --outDir tests/games/minesweeper/.production --emptyOutDir`, and served that owned output on localhost:4496. The regression failed with actual `http://127.0.0.1:4496/assets/game-art/minesweeper/tile.svg` versus expected `http://127.0.0.1:4496/game-art/minesweeper/tile.svg`: the relative custom-property URL was resolved against the emitted CSS directory.

The artwork directory now becomes an absolute same-origin URL using `document.baseURI` and `import.meta.env.BASE_URL` before it enters either CSS or image markup. Covered tiles also retain an opaque mint background and inset relief if their artwork cannot load. The existing phone test now checks the computed background's exact deployment-relative asset URL, actual image decoding/natural dimensions, and a visible fallback color with the image disabled. No additional test case was introduced.

After rebuilding, the production phone case passed (**1 passed, 3.8 seconds**). A separate real Chromium read of the emitted build at both `/` and `/Qcc-games-/` verified the exact same-origin asset URLs (`/game-art/minesweeper/tile.svg` and `/Qcc-games-/game-art/minesweeper/tile.svg`), successful image decode, fallback `rgb(137, 184, 164)`, and **zero HTTP responses >=400** on each game load. This was this specialist's isolated production build, not a claim about the parent's full integrated build. Parent independently owns final root/subpath/offline release evidence.

Fresh focused verification: `npm run check` **exit 0**; targeted rules **17 passed**; `npm test` **21 passed**; `ARCADE_URL=http://127.0.0.1:4186 npx playwright test tests/games/minesweeper --project=chromium` **6 passed (18.4 seconds)**; `git diff --check` **exit 0**. I inspected the refreshed phone screenshot and confirmed visible covered tile relief. Generated screenshot/performance output is left unstaged as requested; this corrective commit contains only game source, the existing browser regression, and these results. Cover and shared files are untouched.
