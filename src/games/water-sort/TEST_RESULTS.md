# Water Sort correction verification — 19 October 2026

Worktree `/workspace/Qcc-games-/.worktrees/correction-water`, branch
`correction/water-sort`, original base `6861106`. Parent viewport commit
`6e0b12d4a94b24efed18ce75ae837f31e8dc38ec` was cherry-picked locally as
`7305ba9` for integration/capture; it is **not** part of the game-only handoff.
Vite served this worktree on port **4176**. Chromium jobs used one worker and
ran only in the parent-assigned browser slot; the slot was released afterward.
No dependency or shared API/configuration change is included.

## Actual fresh checks

| Command | Observed result |
| --- | --- |
| `npm test` | **233 passed**, 18 files, including Water Sort's unchanged rules 10, solver/levels 21, session 21, and new geometry 5. |
| `npm run check` | TypeScript, exit 0. |
| `npm run build` | TypeScript/Vite build, exit 0; 87 modules, offline pack 57 files. |
| `ARCADE_URL=http://127.0.0.1:4176 npx playwright test tests/games/water-sort --project=chromium --workers=1` | **13 passed**, 43.1 seconds; no failing browser case. |
| `ARCADE_URL=http://127.0.0.1:4176 node tests/games/water-sort/capture-correction.mjs` | Actual real-time tap/pour/return recording, three viewport screenshots, an extracted rendered SVG, and measured root/tube bounds. |
| `bash .agents/skills/svg-skill/scripts/validate.sh tests/games/water-sort/evidence` | **2 SVGs passed, 0 failed**; `correction-tube.svg` is the current rendered artwork; `tube.svg` is historical baseline evidence. |
| `ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of json tests/games/water-sort/evidence/correction-pour-390x844.webm` | VP9 WebM, **390×844**, **3.6 seconds**, **173,346 bytes**. |
| `git diff --check` | Exit 0. |

The geometry tests were observed failing against missing/stub behavior before
implementation (three failures), then green. A later deliberate rotation-to-
identity mutation was caught by two tests, including the independent literal
quarter-turn coordinates; restoration produced five passing geometry tests.
The full unit suite above was run after restoring production geometry.

## What the tests prove

The existing 52 pure acceptance cases remain intact: legal maximal top-run and
partial-capacity pours, immutable board state, invalid moves, the requested
homogeneous partial-tube goal, nine independently solved shipped levels,
repeated valid solver hints, legal save chains, bounded history, malformed
snapshot rejection, exactly-once animation commit, pause/resume, restart and
undo. `rules.ts`, `solver.ts`, `levels.ts` and `session.ts` were not changed.

Five new geometry cases verify the mouth pivot's scene axes, conserved area per
band during rotation, conserved source+destination volume across transfer,
horizontal liquid free surfaces, travel/flow/upright/return ordering, increasing
spill tilt as liquid drains, and absence of phantom empty bands.

Seven new Chromium cases exercise the **actual running DOM/SVG**:

- A real pour, measured source/destination volume changing together, moving
  glass bounds, horizontal surfaces checked through `getScreenCTM()`, and a
  continuous vertical stream. Pause retains exactly the same fractional liquid
  volumes; resume commits once and returns the source to its original slot.
- Native Enter/Space and arrow navigation, held-key repeat suppression, pointer
  cancellation with zero lost liquid/moves, and focus returning to the keyboard
  destination after completion.
- Every tube/control fits **390×844**, **844×390**, and **1366×768** with no
  document scrolling; even short landscape retains at least 44px-wide tube
  targets. The landscape artwork follows the frozen narrow scene-width limit.
- Reduced-motion legal volume transfer without glass movement.
- Study switching halfway through a pour retains the same root and fractional
  transfer; returning commits the same transaction exactly once.

The six preserved browser acceptance cases also pass: illegal destination and
solution hints, victory/undo/next/restart, virtual-clock pause/resume, legal save
and reload/repeated navigation, difficulty/level/native keyboard/rules controls,
optional mouse dragging/corrupt-save recovery, actual touch-emulated taps and
colour-blind marks. The old pause test's clock advance was updated from 350ms
to 1500ms for the deliberate new 1400ms game animation; the expected scene width
now follows the full-viewport contract.

## Current visual and motion evidence

All current evidence is in `tests/games/water-sort/evidence/`:

- `correction-390x844.png`, `correction-844x390.png`,
  `correction-1366x768.png`: actual Level 8, seven-tube open rows, compact heading,
  round gold controls, transparent empty glass and flat aubergine background.
- `correction-pour-390x844.webm`: **real-time actual browser recording**, including
  source selection, lift/travel, tip, continuous stream with changing volumes,
  upright/return and a completed legal move. It does not use a fake clock.
- `correction-flow-390x844.png`, `correction-return-390x844.png`: actual mid-flow
  and returned source, inspected using `view_image`.
- `correction-motion-sheet.jpg`: 4fps contact sheet decoded from that real WebM,
  also inspected, showing the full motion sequence rather than invented poses.
- `correction-measurements.json`: viewport/root/scroll dimensions and all tube
  bounds from Chromium. Document dimensions equal viewport dimensions in all
  three cases. Roots measure 390×844, 226.1875×390, and 445.4375×768 respectively,
  reflecting the parent's `.58 × viewport height` fitting contract.
- `correction-tube.svg`: serialized current in-game SVG, passed the installed
  SVG skill's actual validator.
- `chromium.png`: refreshed current touch/pattern/hint browser acceptance image.
  Other unprefixed baseline evidence remains historical and is superseded for
  visual acceptance by the correction files above.

## Limits and parent integration

The supplied ZIP has labelled stills/contact sheets and **no original MP4s**.
Reference comparison verifies composition, colours, shape and sampled poses;
exact original continuous timing/easing/frame cadence cannot be established.
The 1.4-second choreography is this implementation's deliberate choice. This
is volume-conserving **controlled vector geometry**, not a real-fluid simulator.
The rounded-bottom area solver uses a 32-segment arc with a smooth final SVG clip.

Touch is Chromium emulation, not a physical device result. No measured frame-
rate, physical phone or Chromebook performance claim is made. WebKit and physical
Safari were not run in this specialist slot. Whole-app offline/subpath/production
checks and independent code review belong to the parent's sequential integration
pass. Exact actual skill loads, documentation reads and applicability gaps are
listed separately in SKILL_USAGE.md.

## Follow-up: explicit optional-drag pointer capture

A late input audit identified missing actual pointer capture in the optional
legacy drag path. The primary native source/destination click/tap interaction
remains intact. The source now calls setPointerCapture for a live primary
pointer, releases capture before choose/render replaces the button, and clears
capture on cancel, lost capture, blur, resize, pause, reset/restore and disposal.
Only tube targets use touch-action:none. A defensive pointerup ownership check
also cancels capture released before activation: Chromium may emit no lost-
capture event in that case. Guarded API calls tolerate synthetic events whose
pointer ID has no active browser pointer. Pointer click suppression does not
consume native keyboard activation.

Observed checks after this isolated follow-up:

- The new actual-mouse capture test was first **RED** against the prior adapter:
  hasPointerCapture was false. It then passed with source capture, retargeted
  moves/up outside the source, release before rerender and one legal pour.
- The initial cleanup loop exposed the early pending-capture-release edge case;
  the ownership guard prevents that gesture from starting a pour.
- `ARCADE_URL=http://127.0.0.1:4176 npx playwright test tests/games/water-sort --project=chromium --workers=1`:
  **15 passed, 41.3s**, including all prior click/touch/keyboard, rules, solver-
  hint, animation, pause/Study, save/reload and viewport cases.
- The cleanup test was then expanded with an explicit pre-activation release
  and immediate keyboard activation after a real cancellation. Its targeted
  rerun passed **1/1, 10.3s**, covering cancel, pending release, active capture
  loss, blur, resize, pause and disposal, with no liquid loss or pending pour.
- `npm run check`: exit 0. `npm test -- tests/games/water-sort`: **57 passed**.
- Browser slot released after these checks. No visual geometry, state/session,
  rules, solver or level changes. Prior motion/art evidence remains applicable;
  a one-byte nondeterministic screenshot rewrite was omitted from the patch.

The parent independently verifies the final integrated input change and owns
final all-game build/offline checks. This section reports specialist checks;
it does not claim the earlier whole-app 139-case run covered this later patch.

## 27 levels and shared scoreboards — 21 October 2026

- Expanded from **9 to 27 distinct boards**; original nine indexes/boards preserved.
- `npm test`: **482 passed across 32 files**. All 27 levels pass independent BFS,
  reverse witnesses, decreasing winning hints and reachable-state recovery; the
  original ninth-level save remains compatible. Water Sort has 112 model checks.
- `npm run build`: **passed** with the pre-existing large-bundle advisory.
- Chromium Water Sort + initial shared-board run: **17 passed (1.9 minutes)**,
  including the final added level's select/reload/win/wrap to Level 1.
- Chromium shell + Study + online-board/pause run: **38 passed (2.8 minutes)**.
  Shared-board test overlaps the previous run; shell checks retain all games and
  cover menu, blocked storage, Study, pause/return and library viewports.
- Real Postgres integration validates shared ranking between tokens, monotonic
  personal bests, nickname/game isolation, validation and payload limits.
- `dev:online` also passed a real HTTP round trip: two distinct player submissions
  return one shared board ordered 200 then 120 points.
- Independent review: connection pool reuse fixed and re-reviewed; no remaining
  blocking findings. Online activation still requires a Netlify deploy of this code,
  including the function and automatic database migration; production was not changed.
- Additional real-game publication browser check: **1 passed (10.7s)**. Joining,
  earning points by revealing a safe Minesweeper tile, and reopening the board
  publishes the actual GameContext score and displays the player's matching best.
  Across the overlapping runs, **55 distinct browser scenarios passed**.
