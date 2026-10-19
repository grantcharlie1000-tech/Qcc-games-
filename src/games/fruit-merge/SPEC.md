# Fruit Merge specification

An original, offline Suika-style score game. Aim a small fruit over a basket, drop it, and combine matching circles into larger fruit. The run continues after the first watermelon; two watermelons remain separate. This is a deliberate local variant, not a claim to reproduce commercial Suika physics or scoring exactly.

## Rule research and sources

- The assignment supplies the authoritative equal-tier merging, horizontal aiming, gravity, next preview, scoring, and settled danger-line requirements.
- Read `https://raw.githubusercontent.com/liyupi/daxigua/master/README.md` on 2026-10-19. Its customization section documents next-fruit selection, large-to-small merge reversal, circular colliders, bounce, and fall speed. Used only as a qualitative reference for the genre's physics and queue; no assets or implementation copied. The upstream project explicitly warns about distributing its modified assets, so all portraits and cover here are original.
- Tried the original publisher page `https://www.aladdinx.jp/pages/suika-game`; the environment proxy denied the connection (403). Therefore no claim of verification against that page.
- Standalone physics checked against Matter.js 0.20.0 official source: `https://raw.githubusercontent.com/liabru/matter-js/0.20.0/src/core/Engine.js`, `src/body/Body.js`, `src/factory/Bodies.js`, `src/core/Sleeping.js`, and `src/body/Composite.js` at the same repository/tag. See SKILL_USAGE.md for findings.

## Chosen rules

Eleven tiers: cherry, strawberry, grape, mandarin, lemon, apple, pear, peach, pineapple, melon, watermelon. Radii are 15,20,26,32,39,46,53,60,67,75,84 logical pixels. Only tiers 0–3 spawn. An xorshift32 seed shuffles bags containing two of each starting tier. Both previews and the remainder of the bag are saved. A drop has a 450ms cooldown and must have clear space at the spawn point. A rejected drop does not consume its fruit or random sequence. At most 90 dynamic bodies can exist; this limit rejects further drops rather than forcing an artificial loss.

Matching contact pairs are collected from start and active collisions, sorted by game-owned IDs, and applied after the Matter solver completes. One body participates at most once per step. The replacement appears at the midpoint, clamped within walls and above the floor. Average velocity is bounded with a small upward pop; a replacement can merge again on a later physics step. Score for resulting zero-based tier t is `(t+1)*(t+2)/2`, multiplied by consecutive merge count capped at 4 when less than 800ms separates merges. Example: two independent cherry pairs in one step award 3 + 6 = 9. A cherry merge followed by merging its strawberry with another strawberry awards 3 + 12 = 15.

The dashed line is at y114. A fruit must be older than 1200ms, have its top above that line, and move slower than 0.65 pixels per reference tick before its danger timer counts. Two continuous seconds then ends the run. Moving or going below the line resets that fruit's danger timer. The aiming preview is never a physics body. There is no timed win state: reaching a watermelon is the visible objective while score can continue to grow.

## Interaction and presentation

Pointer movement aims. Pointer release drops, enabling touch drag to aim before releasing. Arrows aim in 12px increments on the focused basket; Space/Enter drop. The semantic Drop fruit button provides another action. Preview name, fruit counts, status, shared score, best and level remain readable without canvas interpretation. Optional tier-number badges supplement distinct sizes, faces, fruit textures, and colours. Reduced motion suppresses merge sparks and floating point text; gravity remains essential gameplay. Sound goes exclusively through the supplied context.

Logical board 360×510, CSS width 100%, capped physical pixel ratio 2. Original canvas fruit portraits use stems, leaves, cheeks, highlights, seeds, rind stripes and expressive faces. The SVG cover preserves the 320×410 viewBox and empty visual title zone above y95. Parent will provide final release card art.

## Lifecycle

Fixed 60Hz simulation; frame elapsed time clamped to 100ms. Pause stops simulation and input. Restart resets bodies, scores, timers, queue, loss and effects, including while paused. Serialization contains seed, bag, previews, IDs, timing, combo, aim, score and complete body positions, angles, velocities, sleep state, age and danger. Restore validates finite ranges, unique IDs, queue tiers, body counts and schema before changing state. Dispose cancels RAF, removes input listeners and bodies, clears collision events and engine caches, and removes its DOM. No independent storage, runtime network, ads, accounts, or external assets.
