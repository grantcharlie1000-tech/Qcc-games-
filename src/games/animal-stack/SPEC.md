# Animal Stack correction

Flat skyblue scene; thin lime platform with dark outline/underedge at73% of viewport,90% logical width; centered green DROP below. Parent shell owns compact current/record HUD and toolbar. Native360×666⅔ logical units, responsive aspect-preserving sprites/physics. No landscape, panel, ruler, walls, glue or upright correction.

Approved three-species gate expanded to six complete original elephant, giraffe, horse, tapir, penguin and sloth cutouts. Native-coordinate SVG art and explicitly prepared convex compounds in `shapes.ts` share a body-centred transform. Each piece is checked convex; no `fromVertices` concavity/hull fallback. Empty leg gaps stay empty. Whole body rotates under collision torque. Horse has a mane, ears, tail and separate bent legs; tapir a snout and white saddle; sloth a mask, long limbs and claws.

Input: select only actual suspended-animal parts; captured horizontal drag at fixed release height, threshold and short-tap classification. Drag release never drops or rotates. DROP/Space/Enter deliberately release. A/D/arrows move; Q/E/tap use one isolated45° increment (`TAP_ROTATION_RADIANS=Math.PI/4`). This is an explicit adaptation authorised after the optional clarification remained unanswered; original-video timing/increment is unverified. C toggles real colliders. Interrupted gestures clear capture; key repeats guarded. Pause/dispose cancel simulation RAF and input.

Scoring retained: connected-to-platform stillness30 steps awards100 per animal plus2×maximum measured tower height. Never count airborne geometry in height reward. Falling below platform or off either end loses.40 supported animals complete. Version2 saves store waiting rotation and known body state; validated incompatible version1 geometry starts a fresh stack while archiving and recording its prior score explicitly.

Official source references and actual applied skill paths/provenance are in `SKILL_USAGE.md`. Actual evidence and limitations are in `TEST_RESULTS.md`.

Tall-stack camera framing preserves native scale and world release relationships. A rendered cutout including stroke must stay below84px, beyond the shared76px HUD reserve, even on the first frame after rotation/restore/resize. Camera interpolation is clamped to this safety floor; it may follow the top tower while the platform/lower tower leaves framing. This changes neither physics nor saved state.
