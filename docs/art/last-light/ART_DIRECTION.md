# Last Light art and animation pass

Base: `production` at `730f397963303f08f1485f5da8b6869638a495af`, fetched on 9 November 2026. No campaign routes, collision shapes, optional conversations, petting, departures, scoring or save fields were replaced.

## References and decisions

- [Celeste developer page](https://maddymakesgamesinc.itch.io/celeste): quick retries preserve learning. Death recovery here is 480 ms: 60 ms contact hold, cause-specific recoil/brace/dissolve, checkpoint return over the last 140 ms. These are Last Light tuning choices, not published Celeste timings.
- [Dead Cells animation pipeline](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-): start with clear poses and timing. Deaths use authored hurt and brace poses; the sprite stays on its native grid without rotations, arbitrary scaling, or dismemberment. Water sinks, electricity removes rows, darkness consumes columns, and physical hits recoil away from contact. Reduced motion uses a stationary fading pose.
- [Dead Cells environment design](https://www.gamedeveloper.com/production/art-design-deep-dive-giving-back-colors-to-cryptic-worlds-in-i-dead-cells-i-): shared materials and construction rules join scenes. Real ledges meet recessed façades, structural brackets, glacial shoulders or lift guide rails. Backdrop geometry is decorative; brighter deck lips remain the collision surface.
- [Shovel Knight: Breaking the NES](https://www.yachtclubgames.com/blog/breaking-the-nes/): depth through independent parallax. The sky, reference-derived district vista, location-specific midground and collision-aligned foreground move at different rates.
- [Saint11's cluster painting guide](https://saint11.art/pixel_art_articles/article2/): silhouettes and deliberate clusters before small detail. References guide the hood lining, muted teal tailoring, rust scarf, stitched satchel, gardener's apron, and elder's ochre coat/plum shawl.

## Original image pipeline

`reference-quarter.png` and `reference-districts.png` were generated specifically for this pass. The first is an environment/character/material direction sheet; the second covers Mossworks, Clockworks, Frostline and Afterglow. No reference game's artwork is included.

Run `node scripts/prepare-last-light-art.mjs` to reproduce the shipped PNGs. Eight sampled material swatches become 32×32 tiles with limited palettes and no dithering. District crops become low-resolution, palette-limited vistas; the authored characters are redrawn/refined from the model sheet rather than stretching a large image over an animated collision body. Runtime uses nearest-neighbour sampling and cached material ramps; no per-frame image processing.

The reference assets are local and self-contained. The original code artwork remains the fallback if image loading fails. Public textures total approximately 256 KB; full reference sheets stay in documentation, outside the shipped game art.

## Fog and verification

Fog starts below the lowest authored landing and blends into the natural lower world cutoff. Its gradient and wisps use world coordinates. Water supplies its own boundary. Removed the viewport-relative haze in sky, landmarks and depth passes; HUD text and actors are drawn afterward.

`node scripts/capture-last-light-art.mjs` captures all five worlds, the phone layout, and nine death sequences. The optional before image uses an untouched production source snapshot in `.cache/last-light-baseline/`. Output: `docs/evidence/last-light/art-pass/`.

Browser tests cover all death causes, pause/retry history, reduced motion, camera-independent fog, mobile input, original optional story interactions, and onward departures. Model/campaign tests cover all 40 routes. Exact command results are recorded in the evidence README.
