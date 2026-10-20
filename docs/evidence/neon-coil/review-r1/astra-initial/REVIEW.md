# Astra initial exact-checkpoint audit

Reviewed checkpoint: `cc08465d3cf015ca842f8de80d9c92e6f77f953e`.
Base: `a7f7631d4f606667f23b016ad6091cb3899365e8`.
Reviewer: parent-allocated `gpt-6-astra`, one review seat, read-only checkout.

## Strengths

- Fixed-step movement, curved body history, real growth, collisions, collectible death trails, bot behavior, and snapshot validation are implemented coherently.
- Existing Snake, Pool, and Study source directories remain unchanged.
- Performance evidence honestly separates the default Canvas benchmark from slower concurrent SwiftShader measurements.

## Critical findings

None found.

## Important findings

### R1 — Holding Boost first prevents touch steering

Checkpoint location: `src/games/neon-coil/index.ts:91`.

The canvas rejects non-primary pointers. When the first finger holds Boost, the second finger cannot acquire steering capture.

Reproduction: at 390×844, enter the arena, hold Boost with finger one, then drag finger two from the arena center upward. Native Chromium touch input produced `boosting=true`, but `angle=0` and `y=0` after 500 ms.

Impact: a natural ordering of the two touch controls leaves the player accelerating without steering.

Requested fix: accept an eligible touch pointer when no steering pointer is tracked, independent of global `isPrimary`. Preserve mouse filtering and capture cleanup. Test both input orders and steering reacquisition while Boost remains held.

### R2 — Short landscape layouts overlap ranking and clip the introduction

Checkpoint locations: `src/games/neon-coil/index.ts:48` and `style.css:35`.

Ranking length depends only on width. At 844×390, the YOU row occupies `(630,343,175,26)` while the footer toolbar overlays it; Restart alone occupies `(626,328,42,42)`. The introduction card extends to `y=426.7`, beyond the viewport. At 740×360, Enter extends to `y=365.1`.

Impact: the required player ranking is obscured, and short-screen introduction content is clipped.

Requested fix: use height-aware ranking and card layouts, reserving space for toolbar controls. Test actual visibility and overlap, including intro/Enter, rather than only canvas dimensions and selected button bounds.

Failing screenshots are retained as `landscape-running.png`, `landscape-intro.png`, and `landscape-360.png` in this directory.

## Minor findings

None separately identified.

## Independent verification

- Strict TypeScript and **288 tests across 25 files** passed.
- All **eight Chromium browser cases** passed from a private temporary copy in **58.2 seconds**. Existing tests did not cover R1 and R2.
- Longer deterministic model probes checked snapshot validity every simulated second. Seeds 1 and 42 completed 7,200 ticks with 21 and 23 bot defeats; seed 2 reached player death at tick 2,730 with eight bot defeats. No checked snapshot failed validation.
- Final checkout remained clean at the exact reviewed SHA. Frozen evidence was untouched.

Original scratch scripts/results were copied unchanged into this directory. Their original paths were `/tmp/neon-review-model-probe.mjs`, `/tmp/neon-review-model.mjs`, `/tmp/neon-review-input-probe.mjs`, `/tmp/neon-review-observed-results.json`, and `/tmp/neon-review-suite-J0l7vV/`. Scripts may retain references to their original scratch paths; these are preserved evidence, not shipped runtime code.

## Recommendations

Fix both Important findings, add their regression coverage, then request re-review in this same allocated review seat. Preserve prior failures and environment limitations alongside subsequent passing results.

## Declined to judge

- Reference PDF/video fidelity: unavailable here because the Library helper returned `skill package is not available`; assessed supplied textual requirements and original implementation.
- WebKit behavior: executable absent after the documented normal installer HTTP 403 `Domain forbidden`; no bypass attempted.
- Physical trackpad/device behavior and sustained hardware performance: browser-generated input and container measurements cannot establish these.

## Assessment

**Ready for parent review: fixes required.**

The core arena and existing verification are sound, but touch input ordering and short-screen layout need correction. No review action remained pending or denied. This verdict does not authorize merge, push, or deployment.
