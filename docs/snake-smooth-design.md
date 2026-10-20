# Snake smooth presentation — 2026-10-20

The 16 × 16 seeded grid and its 160 ms tick are unchanged (`model.ts` has no diff). Grid positions, collision timing, score, food selection, queue capacity, reversal rejection, tail legality and the save version remain authoritative.

## Motion sketch

A render interval displays the most recently committed edge, from the previous head cell to the current head cell, at `elapsed / 160`. This is standard fixed-step interpolation: its visible position can be one grid interval behind the authoritative grid. It does not predict a future move. A buffered turn changes the visible head's facing and begins its new edge on the first simulation tick that consumes that turn. No extra queued tick, easing, input throttle or variable game speed is added.

```text
Committed path after right → up:

        new head (6,5)
             |
        rendered head (6,5.5) at 80 ms
             |
  tail —— (5,6) —— corner (6,6)
```

The drawing retains every original corner between the fractional head and tail. Joining individually interpolated segment centres would form diagonal chords at turns; this implementation samples a single shared orthogonal path instead. Round stroke joins form the connected body silhouette. Growth holds the old tail and increases the visible path length over that interval. Each dropped-frame update splits at the existing model tick boundaries and retains only the final committed edge, producing the same model state as `advance`.

Pause withholds active simulation time and retains the fractional accumulator and presentation history. Resume/start/restore set a fresh RAF timestamp. Optional, separately validated `presentation` metadata stores the previous body, whether that step grew, and independently validated finite food/eating ages (0–200 ms) with the eaten cell, preserving the exact fractional pose and active feedback across reload. Legacy version-1 saves remain accepted and display their current grid until the next committed step. Invalid presentation metadata is ignored independently of valid grid data.

## Art and feedback

Original Canvas artwork uses a continuous shaded green body, direction-facing eyes, a red apple with leaf/stem and stationary quiet checker grass. No external artwork, Google logo or Google asset is used. Reference navigation to Google Search Snake and the Google fbx game was blocked in this environment; these pages were not visually inspected, and no exact-reference-match claim is made.

The animation purpose is spatial consistency and readable state feedback. Canvas/RAF uses linear fixed-step travel, without easing or rotation tweening. Food settles once from 94% to 100% scale over 200 ms; eating has a restrained 200 ms mouth/head response and fading ring. Collision changes the face and opens the replay card on the authoritative collision tick. There are no flashes, particles, idle pulses or screen shakes. Both live OS reduced-motion preference and the app setting use exact discrete grid poses and suppress these small food/eating effects. The controls themselves have immediate feedback.

## Layout and resolution

At sufficient viewport width **and height**, the garden's outer box is exactly 728 px, up 40% from 520 px. Desktop padding 14.8 px and a real 2 px border yield a 694.4 px canvas, up 40% from 496 px (Chromium measures 694.40625 because CSS geometry uses fractional units). Shorter screens compare a below-board control arrangement with controls beside the board, selecting the latter when it permits a meaningfully larger square. The board alone shrinks; the 48 px direction targets do not scale down. Phone padding stays 7 px with a 2 px border, preserving the previous full-width playable cap.

Only Snake overrides the shared stage transform fit. No global shell/game layout is changed. A ResizeObserver measures both available stage dimensions and the controls. Canvas backing pixels follow the actual displayed canvas width times the complete device pixel ratio, including paused resize, rather than a fixed logical 480 px image or a capped DPR. All geometry remains in 480 board units, so resize cannot affect a turn, queue, clock or collision.

## Verification scope

Focused pure tests cover orthogonal midpoint bends, consecutive turns, queue/reversal rules, identical 30/60/120 Hz and dropped-frame outcomes, authoritative model equivalence including collision, held-tail growth, exact fractional save/restore including active food/eating feedback, invalid presentation recovery, inactive time/reduced motion and resize-independent geometry. Browser tests use the actual shell route, clock-driven continuous frames, mid-tick keyboard buffering, pixel-identical paused/reloaded canvas, `fastForward` dropped RAF catch-up, resizing at five viewport sizes, actual backing resolution, 48 px controls, live OS/app reduced motion and real Chromium touch cancellation with page-error assertions.

There is no speed selector. Frame-cadence changes and browser clock jumps exercise timing variation without changing the fixed 160 ms rule. Physical touch hardware and physical Chromebook performance require device checks. The coordinator owns independent review, full-suite/offline verification, final screenshots and measured performance evidence. Existing baseline and legacy evidence files are preserved.
