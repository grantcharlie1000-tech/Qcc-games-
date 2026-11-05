# Pool — Christmas skin

## Skills invoked
- `using-superpowers`: session workflow.
- `game-development` (Skill tool), and I read its nested `game-art/SKILL.md` (palette and art direction for the table).
- `requesting-code-review`: invoked, but this agent has no subagent tool, so no independent review was dispatched. The lead should run one.
- `verification-before-completion`: invoked before reporting, and every result below is from a fresh run.
- `systematic-debugging`: invoked for the browser failures (see Tests).
- `svg-skill` and `animate` were not used: the art is Canvas 2D and static.

## What changed
`src/games/pool/render.ts`, in `drawTableArt` (the cached background, drawn once per size):
- A `FESTIVE_TABLE` colour set sits beside the original `TABLE` values:
  - red lacquer rails with red-tinted grain;
  - a gold bevel;
  - a deeper evergreen felt and cushions;
  - gold diamond sights.
- A gold pinstripe at the rail–cushion join, drawn before the cloth so the pocket holes cover it.
- `drawFestiveTrim`: a gold pinstripe inside the outer edge, plus a static string of lights.
  - The light string is a dark green wire 28 mm inside the outer edge, scalloping slightly between bulbs, with `drawBulb` bulbs in `BULBS` colours pointing outward.
  - Bulbs near the corner and side pockets are skipped.
  - All of this is drawn once into the cached table canvas, so there is no per-frame cost.
- The background cache key now includes `christmas()`.

Other files:
- `src/games/pool/christmas.css` (new): a dark evergreen room with faint snowflakes behind the table, and a red and gold active-player ring.
- `src/games/pool/index.ts`: imports `christmas.css`.

## Guaranteed unchanged
- Billiard balls: the sprite code, `COLORS`, numbers, stripes, cue-ball dots, shadows and cue stick are all untouched.
- Table geometry: `CUSHION_W`, `RAIL_W`, `MARGIN`, `fitView`, pocket positions and sizes, and cushion polygons are unchanged.
- Physics, rules, AI, sound, input and the online protocol (`online.ts`) are untouched. The theme is local presentation only, and online peers exchange the same messages.
- Sights stay at the same positions.

## Tests
- `npx tsc --noEmit`: no errors in ball-run, pool or block-fill. The only error is in another agent's file, `tests/games/animal-stack/tall-framing-festive.spec.ts` (missing module `christmas-art.ts`).
- `npx vitest run tests/games/ball-run tests/games/pool tests/games/block-fill tests/core/festive.test.ts`: 17 files, 155 of 155 tests passed (final run).
- Environment note: the live dev server (4600) full-reloads the page every 25–40 s because other agents are editing concurrently. A watcher page saw 8 reloads in 4 minutes. The pristine 4601 server does not reload. The load average was 12–22 throughout.
- Browser: `playwright test tests/games/pool` on 4600: 15 of 15 passed.

## Screenshots
- `before-*.png` and `after-*.png`: the evidence action focuses the table, raises power with ArrowUp and breaks with Enter, so the shot shows balls scattering.
- The break is random per run, so ball positions differ between the before and after shots.
- `detail-corner-lights.png` (corner pocket, wire and bulbs) and `detail-balls.png` (balls unchanged).
- What I checked:
  - the bulbs sit on the rail's outer band, clear of the diamonds and pocket surrounds;
  - the pinstripe is hidden under the pocket holes;
  - the balls, numbers and stripes match the original;
  - the portrait phone layout looks right.
- The gold focus frame visible around the table is the existing keyboard `:focus-visible` outline: the action focuses the canvas.

## Known limitations
- The light-string wire has square corners inside the rounded rail corners.
- On the phone (small scale) the bulbs are small, about 5 px.
- A hair of the inner pinstripe can show where it meets a corner pocket.
