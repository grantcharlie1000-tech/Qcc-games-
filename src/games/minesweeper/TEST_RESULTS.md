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
