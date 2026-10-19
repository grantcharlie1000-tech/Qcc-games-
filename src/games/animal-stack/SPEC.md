# Animal Stack

Original woodland balancing game. There is no universal fixed Animal Stack ruleset; these are the shipped rules rather than a claim to reproduce another game.

Aim a waiting animal horizontally, then drop with pointer release, the Drop button, or Space. Left/Right and labelled arrow buttons move the preview. Preview bodies never join the world. A dropped animal must contact a chain of bodies reaching the island and stay below 0.45 px/frame speed and 0.018 rad/frame angular velocity for 30 fixed ticks. It then earns 100 points. The run score is supported count × 100 + best supported tower height in centimetres × 2 (one logical pixel = one game centimetre). Points are awarded once. Any dropped animal falling 135 pixels below the island, or more than 100 pixels beyond the side, ends the run. Forty settled animals complete it. Waiting and aiming cannot lose.

## Physical model and tuning

Matter.js 0.20.0, manually stepped at 60 Hz; wall-time accumulation is limited to 80 ms per animation frame, with no large delayed update after pause. Gravity 0.9, position iterations 12, velocity iterations 10, sleeping enabled. Static island spans x=75..285 at y=422. Animals use chamfered convex torsos plus physical heads, and the fox has a physical triangular ear. Masses: hippo 5.8, capybara 4.2, turtle 3.6, sheep 2.6, fox 2.2 game kilograms. Friction 0.85, static multiplier 1.5, air friction 0.018, restitution 0.025, slop 0.025. Rotation and inertia remain finite; there are no invisible constraints, placement snapping, scripted topple, forced stability or static settled animals.

New bodies spawn at min(110, highest geometry − 96), with at least 60 pixels of separation from existing bodies. Shapes can turn and overhang. A newly dropped body blocks the next drop until scored, or until five seconds of actual support; the latter avoids a tilted animal blocking play forever. Support uses exact convex-part collision queries, including sleeping foundations. Matter's active collision list excludes sleeping contacts, so relying on active pairs would incorrectly stop scoring later animals.

A fixed xorshift32 state chooses the next animal without an immediate repeat. Seed, current choice, aim, score, stable ticks, active animal, world tick, body position, angle, linear/angular velocity and sleep state are serialized. Restore validates every field, limits population, rejects nonfinite/extreme values and rejects deep intersections before altering the current world. The world is rebuilt from known species geometry; arbitrary body data never enters Matter. Run state is owned by the shell context.

## Presentation and lifecycle

Original pastel vector animals have distinct shells, ears, coats, faces and body proportions, with dark consistent outlines. Body artwork rotates around Matter's centre of mass with a recorded local art offset. Collision events paint brief highlights without altering collision shapes. Reduced motion removes those accents and uses immediate camera following. A height ruler explains camera travel. Camera following uses scored friends, so a new airborne drop cannot yank the scene upward. Height rewards use the support graph and never include an airborne newcomer. All essential physics remains active with reduced motion.

The logical 360 × 480 canvas scales to a 366-pixel phone stage, with pixel ratio capped at two. Pointer coordinates are transformed through actual canvas bounds. Pointer capture supports release after dragging. Keyboard handling belongs to the stage and ignores buttons, editable fields and open dialogs. Pause stops world ticks and all gameplay input; restart resets the world even if paused. Disposal aborts listeners, cancels RAF, removes all engine events/bodies, clears engine state and DOM.

## Research

Read official Matter 0.20.0 source, rather than treating Phaser adapters as standalone API documentation:

- https://github.com/liabru/matter-js/blob/0.20.0/src/body/Body.js — `Body.create`/`setParts`, compound mass-centroid aggregation, finite inertia, position/velocity/angular setters.
- https://github.com/liabru/matter-js/blob/0.20.0/src/factory/Bodies.js — chamfered rectangles, polygons and trapezoids. Concave decomposition requires an extra library, so all parts are convex and no poly-decomp is needed.
- https://github.com/liabru/matter-js/blob/0.20.0/src/core/Engine.js — solver iterations, gravity, sleeping, `Engine.update`, collisionStart events and collision response ordering.
- https://github.com/liabru/matter-js/blob/0.20.0/src/collision/Query.js — `Query.collides` checks geometry without excluding sleeping bodies. Each compound input is queried by its own parts to avoid treating the compound hull's empty space as support.
- https://github.com/liabru/matter-js/blob/0.20.0/src/collision/Pairs.js — sleeping contacts may become inactive; source confirmed the observed scoring defect.

These are documentation/source research, not installed skill invocations. Actual test results and remaining browser limits are recorded separately.
