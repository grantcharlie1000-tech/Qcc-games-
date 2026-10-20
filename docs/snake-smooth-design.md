# Snake authoritative presentation checkpoint — 2026-10-20

The local checkpoint displays every head/body cell from the authoritative 16 × 16 grid on the tick that commits it. It removes the original redesign's one-interval arrival offset. Cell travel is now **discrete**, with rounded original artwork and small food/facial effects retained. The parent prioritized responsive, truthful collision feedback over delayed continuous travel. The coordinator selected this reversible checkpoint for verification; the parent then clarified that discrete travel does not satisfy the smooth-movement goal. This is not completed redesign acceptance.

`model.ts` remains byte-identical to main `a7f7631d4f606667f23b016ad6091cb3899365e8`: seeded food, one cell per 160 ms, two queued turns, reversal rejection, ten points per apple, held-tail growth, vacating-tail legality and collision timing are unchanged. No prediction, early input cutoff, speed selector or rule change is introduced.

## Position and feedback

```text
159 ms: model head (5,6) → displayed head (5,6)
160 ms, queued up consumed:
        model head (5,5) → displayed head (5,5)
240 ms: model head (5,5) → displayed head (5,5)
```

Every displayed body vertex equals the corresponding grid cell, including on turning, eating and collision ticks. Body joins remain rounded and connected. If a fatal perpendicular turn is consumed, the last valid body remains intact while head facing uses the attempted model direction. This avoids a stale right-facing face after an upward collision.

Food settles once from 94% to 100% scale over 200 ms. Eating has a restrained 200 ms head/mouth response and fading ring. These effects do not displace grid positions. Collision changes the face and opens the replay card on the authoritative tick. There are no flashes, particles, idle pulses or screen shakes. Live OS or app reduced motion suppresses the small food/eating effects; geometry is authoritative in both modes.

## Clock and compatibility

The existing fixed-step presentation updater still delegates all state changes to `model.advance`, splitting large frame gaps at model tick boundaries to retain effect ages and compatible save history. Rendering no longer interpolates that history. Optional previous-body/growth metadata from `89b4dee` remains accepted, but it cannot pull the displayed snake behind its saved authoritative cells. Finite relative effect ages (0–200 ms) and a validated eaten cell preserve active feedback across reload.

Pause withholds active time, retains the fractional model accumulator and freezes effects. Resume/start/restore reset the wall-clock baseline. Dropped-frame tests account for actual delivered active RAF timestamps and compare the complete grid state against pure `model.advance`, instead of assuming identical nominal browser frame phases.

## Layout and resolution

At sufficient width and height, the garden is 728 px outer and approximately 694.4 px playable, 40% larger per axis than the original 520 / 496 px. Shorter screens compare controls below versus beside the board, keeping 48 px minimum direction targets. Phone padding stays 7 px with a 2 px border. Only Snake bypasses the shared whole-stage fit transform.

Canvas backing pixels follow actual displayed width × full DPR. ResizeObserver handles CSS layout changes; the existing RAF loop detects DPR-only changes even while paused. The browser test changes DPR 2 → 3 without changing CSS dimensions, then checks exact backing resolution and a five-second paused autosave. Subsequent resize assertions await stable viewport, CSS, DPR, backing and control coherence after CDP resets.

## Historical continuous prototype and verification

Commit `89b4dee` remains a local historical artifact of continuous previous-to-current committed-edge travel. Its original screenshots, trace archives, size data and logs remain labelled as historical evidence. The coordinator-selected current revision, following the parent’s stated priority, intentionally trades continuous cell travel for zero added visual arrival offset. See `docs/evidence/snake-redesign/astra-audit.md` for the independent findings, concrete options, selected consequence and all failed-run history.

Current focused tests cover exact authoritative geometry before/on committed turns, instant scoring-tick growth, perpendicular wall/body loss, unchanged rule/model equivalence, 30/60/120 Hz and dropped frames, old-save acceptance, effect restoration, pause/reduced motion, resize and DPR changes. The corrected four-case browser run, five serial dropped-RAF repetitions and three serial DPR/resize repetitions pass. Coordinator final checks pass (285 all-unit tests, TypeScript/build, 8 Snake/Study Chromium cases and root/subpath Snake offline). Independent re-review of exact code checkpoint `e5a0cd9293c33ac54bec24cebde3b96e99283ba4` passed scoped correctness with no Critical or Important code findings; its tool-output-only results are recorded in `docs/evidence/snake-redesign/astra-rereview.md`, separately from historical `89b4dee` results.

Artwork is original Canvas code with no Google assets/logos. Real Google reference navigation was blocked and those pages were not visually inspected. WebKit installation was blocked by CDN HTTP 403. No physical touch hardware or Chromebook was used.


Smooth movement remains unresolved. The checkpoint has passed scoped correctness review; a new movement direction is still needed when comparing smaller post-tick offsets, an earlier leg/input deadline, the historical full-interval offset, or continuous simulation. Each has a different movement/input/collision consequence; none is silently implemented here.
