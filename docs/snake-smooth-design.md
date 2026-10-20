# Continuous authoritative Snake — local candidate

The current candidate moves continuously along grid-aligned legs. Model and renderer use the **same current head and body trail**, so contact feedback has no intentional display offset. This is a new local redesign authorized after the reviewed discrete checkpoint; its post-audit legacy validation correction still awaits independent re-review and acceptance.

## Turn timing and causal event clock

Speed remains one cell per 160 ms, but the old input deadline changes. The heading of a leg is bound when it starts. A turn arriving during that leg queues for the next grid center; it cannot redirect travel already underway. Two turns can be buffered, with no duplicates or reversals relative to the last accepted heading. Initial direction input selects the first leg; restored legacy queued turns take priority at their held starting junction.

```text
start right at (5,6)
80 ms:  head (5.5,6), up input queues
160 ms: head (6,6), up leg starts
240 ms: head (6,5.5), still the same authoritative position on canvas
```

Before input, pause or save, the module advances active simulation to `performance.now()`. This prevents an input after a stalled frame from retroactively changing a passed junction. RAF timestamps and event times share one monotonic baseline; a stale RAF cannot rewind it. Start/resume/active restore set a fresh baseline and exclude offline/paused time. The browser regression suppresses RAF, sends trusted keys after a passed junction, replays an older captured RAF, and checks both the future turn queue and an already-occurred wall loss.

## Visible contact geometry

One set of constants defines rendering and physics: head/body radius 0.40 cell and fruit-flesh radius 0.33. Body ink is a round tube on the authoritative orthogonal trail; head and fruit solids are disks. Stem, leaf, highlight and shadow are decorative. Their shared dimensions make the solid silhouettes readable on the smallest board: a 278 px canvas gives approximately 13.9 px head/body diameter and 11.5 px fruit diameter.

Eating occurs when head and fruit disks touch (center distance 0.73); body collision uses 0.80. The first connected 1.20 arc cells are excluded from head/self contact, which is long enough for ordinary 90° bends. Walls lie half a cell beyond the outer grid centers, so a head radius reaches them at model coordinate −0.10 / 15.10. An outward leg may collide before its next junction; a late queued turn cannot rescue it.

The solver splits travel at head junctions, body-trim corners and growth completion. Within each interval it solves head-vs-edge interiors and relative-motion endcap quadratics analytically. Tail caps can move or remain held by growth. Loss wins a simultaneous collision/eating tie, and a tangent moving away is not a fresh collision. Contact events are independent of RAF partition. A 1e−9-cell geometry tolerance handles floating arithmetic; time/budget for tiny residual steps is retained, and event progress is determined by actual advance/junction/food events rather than a mixed-unit epsilon guard.

Each fruit grants ten points, one earned segment and one cell of growth credit. The tail holds while that credit is used, producing continuous growth. Food candidates must clear head/body contact solids. The goal stays 256 earned segments / 2530 points; final victory may freeze with the last growth credit pending. That is an earned-length goal, not a claim that all body ink has already expanded to the final length.

## Saves, accessibility and viewport

Version 2 persists the complete fractional trail, leg origin/progress, executing heading, two-turn queue, growth credit, seed/food, score/earned count, phase and active effect timeline. Exact pause/reload does not reconstruct a pose from older grid snapshots.

A version-1 save has a wait accumulator rather than a moving pose. Conversion keeps its body, score, seed, food, direction, queue, phase and tick count at their saved junction; the old fraction is explicitly archived. A running conversion waits for **Continue saved run** or valid direction input, then adopts the new cutoff once. It does not infer travel through a possible collision or silently spend saved time. Old prototype/checkpoint effect metadata remains optional and safe through the next v2 reload.

Core travel remains continuous with reduced motion because it communicates gameplay. OS and app preferences suppress the spawn-opacity/eating/facial extras. No flashes, shake or idle pulses are added. Responsive 40%-larger roomy sizing, unscaled touch controls and paused DPR-only invalidation remain. Canvas rounding is capped at half a cell and the old pseudo-rim is hidden so valid corner contact is not visually clipped.

## Evidence and history

Current logs, failure history and later coordinator checks live in `docs/evidence/snake-redesign/continuous-authoritative/`. The earlier `89b4dee` delayed continuous prototype and reviewed `e5a0cd9` discrete checkpoint remain historical fallback artifacts. Their logs/screenshots are not presented as verification of this candidate. See the new evidence README for current checks and `coordinator-verification.md` when supplied by the coordinator.

No Google artwork/logo is used. Google reference navigation and WebKit installation were blocked earlier; no exact-reference, WebKit or physical-device performance claim is made. No publication/deployment or unrelated game/shared-shell/package change is authorized by this local candidate.

Junction normalization uses a separate 1e−11 ms tolerance for floating-point roundoff. The full seed-40 input history and minimal 33 + 127 ms partition are regression tests; real 1e−7/1e−8 ms pre-junction deadlines remain uncommitted. Clock/growth budgets retain positive sub-geometric residuals without adding an unresolvable trail vertex.
