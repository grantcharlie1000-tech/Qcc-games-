# Last Light revamp

Branch `last-light-revamp`. Do not merge to main from this document. Do not deploy.

## Sharpened job

Make the existing 40-level precision platformer feel like one place you cross, with a story you can see and obstacles that belong there. Do not port it to Phaser. Do not add a second game on top of this one.

A working platformer already exists: Canvas 2D, 120 Hz simulation, coyote time, jump buffering, variable jump, air dash, five districts, optional story, score cap 62,000, and a large replay suite. The gap is that routes still read as pads hung in front of scenery, the story repeats the same errand forty times, and the first hazard arrives before the jump has been taught.

Raw material for every change: `docs/reference/platformer-level-design-handbook.txt`, `docs/reference/last-light-environment-correction-rev2.txt`, and the live level data in `src/games/last-light/`. Proof is a browser play of the changed level (start, middle, end), the existing journey replay for that level, and `npm test -- tests/games/last-light`.

## What the code does today

- Engine is custom, not Phaser. `package.json` has no Phaser dependency. Physics lives in `src/games/last-light/model.ts`: player 16×24, run 220 px/s, jump velocity −420, gravity 1120, extra gravity on early release, dash 560 px/s for 0.15 s, coyote 0.1 s, jump buffer 0.12 s. A full jump is about 79 px high and about 165 px of running air travel. A dash adds about 84 px.
- Forty authored routes in `campaign-opening.ts`, `campaign-middle.ts`, and `campaign-final.ts`, assembled by `createLevel`. Surfaces: stone, crumble, moving, spring, ice, belt, grate. Hazards: spikes, saw, laser, steam, crusher. Enemies: crawler and moth only. Both are stomped or dashed. Defeats give no points.
- Districts of eight: Old Quarter (roofs, canal, tower), Mossworks (garden), Clockworks (factory), Frostline (ice), Afterglow (sky).
- Score, in `rankScore`: 1,000 per cleared level + 100 per memory spark (max 3 a level) + pace bonus up to 250 (minus 2 per active second and 25 per setback). `normalizeLastLightScore` still folds old million-scale leaderboard keys down to 1,000 per level. That conversion stays.
- Story is forty optional chapters in `story.ts` (`CHAPTERS`). Lamps, rescues, and memories never lock the exit. Two endings remain: share the flame, or carry it home. Most chapters are the same shape: a neighbour, three lights or a rescue, and a note Mira left.
- Level 1 (`The Window Left Open`) puts spikes on the third landing. The jump has not had a safe, empty practice gap yet. `architecture.ts` builds a facade down from each platform rectangle, so a street of roofs still looks like separate columns.
- The environment correction’s governing rule stands: an object has to be a roof, cliff, dock, or machine in a real installation before it is a challenge. Frostline lasers and steam on open ridges fail that test (level 28 is the documented case). Rev 2 dropped story rewrites. Charlie wants the story improved anyway. Place rules stay; the repetitive errand text does not.
- Art is drawn in code and from generated sheets (`generated-art.ts`, `enemy-art.ts`, death and facade modules). New bitmaps go through Codex image generation, then `pixelize`, then a look at the PNG. Palette: `docs/reference/palettes/qcc-16.png`. Refs stay out of git when the folder is ignored.
- Controls already cover arrows, Space, Right Shift, Enter, Down, and touch. Keyboard, mouse, and touch stay. The frame budget for a low-power Chromebook stays: no extra full-screen buffers, no per-frame pattern rebuilds, simulation stays at 120 Hz independent of the paint rate.
- The screenshot in `docs/evidence/last-light/desktop-play.png` is an older build (title “A Small Beginning”, A/D controls). It is not the current HUD. A live capture of current main is the next proof, once dependencies are installed.

## Decisions already made

- Stay on the canvas engine and the current score formula.
- Story stays optional. Better story means a visible event in the place, shorter lines, and less repeated “light three lamps.”
- Rebuild by district, starting with the Old Quarter, instead of regenerating all forty layouts at once.
- New verbs are few. Each one is introduced safe, then tested, and it replaces a fixture that does not belong (generic spikes, mountain lasers) rather than stacking on top.
- Terra’s CLI is not installed here. General coding uses this session, or a Grok / Codex delegate when a slice is independent. Level design is Claude Opus. Art is Claude Fable after references exist, with Codex generating the reference images.

## Story outline

The courier still follows Mira through a city that kept its light in one machine. Each district shows one change in that fact. Dialogue does not explain the jump.

| District | Levels | What you see | Story turn |
| --- | --- | --- | --- |
| Old Quarter | 1–8 | Lived-in roofs, a bell tower, a real dock | Mira’s window is still open. Neighbours are home. The trail is a ticket and a lit kitchen, not a quest log. |
| Mossworks | 9–16 | Glasshouse, orchard, roots, irrigation that is actually plumbing | The garden is alive and short of water. Mira passed through planting, not repairing a power grid. |
| Clockworks | 17–24 | One factory: presses, belts, a clock, a barge under the pipes | The dawn engine is a building you enter. People work there. Mira went in to keep the light, and the place shows the cost. |
| Frostline | 25–32 | Ice shelves, a ridge, a docked icebreaker, a lens hut | Cold and wind. No electrical gates on an open mountain. The lens was never only in the hut; the lantern already carries half. |
| Afterglow | 33–40 | Two towers, a sky bridge, an airship home | You find Mira. The last choice is still share or carry home, and it stays after the campaign results, never a gate. |

Chapter titles can stay so saves and the journal still match. The visible event and the line the player hears change. Exits, bells, and wheels stay skippable.

## Level list

One idea each. Detailed Old Quarter beat sheets (gap widths, first legal spike, first dash, first enemy) land in `docs/last-light-revamp-design.md` from the design pass and get reviewed before those layouts change.

| Level | Name | Place | Idea |
| --- | --- | --- | --- |
| 1 | The Window Left Open | A row of house roofs on one street | Teach variable jump. No spikes until a later rest. |
| 2 | A Bell Above the Rain | A real bell tower with landings | Teach climb, turn, and short hop. Rescue Ivo on a landing, not in empty air. |
| 3 | The Last Ferry | Stone quay and moored ferry | Teach moving decks as barges on water. |
| 4 | Windows, Not Stars | Market roofs and one arch | Test jump height across a street. Lamps are windows, optional. |
| 5 | The Roof That Remembers | A failing roof over a lane | Teach crumble, with a safe first tile, then the dark as weather behind you. |
| 6 | Under the Sleeping City | A pipe basement under the street | Teach reading a vent. Steam comes from a grate in a real pipe. |
| 7 | The Counterweight | Lift shaft in a service tower | Teach a wheel that is part of the lift, then the ride. |
| 8 | The Quarter’s Reply | Bridge between two built banks | Test the Quarter’s jumps. Signals are bridge lamps. |
| 9 | Water for the Living | Greenhouse plumbing | Teach a spring as a water ram, inside the glasshouse. |
| 10 | A Voice in the Reeds | Sunken garden steps | Practice height change. Pip is on a step, not a floating pad. |
| 11 | The Orchard Circuit | Trellis and orchard | Signature: spring, then a controlled landing in branches. |
| 12 | A House Made of Glass | Greenhouse floors | Climb inside one building. |
| 13 | Borrowed Ground | A root-pulled footbridge | Crumble that is a living bridge, then escape. |
| 14 | The Rain Machine | Pump house | Wheels and rain that falls from a real sprinkler. |
| 15 | Where the Roots Go | Root cellar | Descent and a person at the bottom. |
| 16 | The Garden’s Answer | The great tree | Rest and a send-off. Moths here are living, or a later enemy if the silhouette is honest. |
| 17 | First Shift, Last Shift | Factory floor | Teach steam as a vent on a machine. |
| 18 | The Clock Without Hands | Clock tower interior | Climb toward a face you can see from the start. |
| 19 | Someone on the Night Shift | Lower floor to loading bay | Escort space: wide decks, one press. |
| 20 | Teeth of the City | Conveyor bridge | Teach belts. The teeth are the belt, not random spikes. |
| 21 | The Unwinding | Feed and return wheels | Combine wheel, lift, and a timed vent. |
| 22 | Cargo for the Morning | Freight dock | Ferry pattern in an industrial canal. |
| 23 | A Signal Through Steel | Antenna mast on the roof | Vertical test. The mast is the building’s aerial. |
| 24 | Let the Machines Dream | Quiet floor, lit windows above | Rest. The factory is off. The homes stay lit. |
| 25 | Footprints in the White | Ice bridge on a ridge | Teach ice braking on a real span. |
| 26 | The Frozen Intake | Intake house cut into the rock | Wheels inside a hut, not on the snowfield. |
| 27 | The Aurora Bells | Ridge and a stone bell tower | Signature vertical ice. Bells, not lasers. |
| 28 | The Whiteout | Storm shelter route | Replace the four lasers and open-ridge steam with wind, ice, and a sheltered door. |
| 29 | The Icebreaker | Dock and icy decks | Moving ice floes with a visible boat at the end. |
| 30 | A Warmth Beneath | Geothermal stones | Steam only where the ground vents. |
| 31 | The Keeper Who Stayed | Ice cave to a hut | Rescue along a path that is a cave, not a column grid. |
| 32 | North Star, Nearer | Observatory stair | The lens is a building you reach. |
| 33 | The City From Above | Sky walk between roofs | Dash gaps with the city already visited underneath. |
| 34 | A Sister in the Tower | West tower | Find Mira on a stair you can see. |
| 35 | All the Roads We Took | Return along the towers | Wind and alternating routes, still one building to the next. |
| 36 | When the Tower Lets Go | Breaking sky bridge | Escape. The bridge is a structure that fails, not a row of pads. |
| 37 | The Heart, Unlocked | Engine heart inside the tower | Wheels on the machine itself. |
| 38 | Everybody Aboard | Sky dock | Airship that is a ship, boarded from a dock. |
| 39 | One Last Conversation | Observatory balcony | Rest, then the optional choice is offered, not required. |
| 40 | What We Leave Alight | Dawn relays to the last lantern | Final test of the moves you have. The ending stays optional. |

## Obstacles and enemies

Keep stomps and dashes. No score for a defeat. First meeting is on a wide deck with time to watch.

| Thing | Where it belongs | Replaces | First meeting |
| --- | --- | --- | --- |
| Broken gutter teeth | Roof edge of a house, after a clean jump lesson | Early generic spikes in the Quarter | Level 1, only after two safe gaps. One tooth, then a pair. |
| Shop sign on a hinge | Shopfront under a market roof | A saw floating over a street | Old Quarter market, level 4, safe distance first. |
| Chimney rook | Patrols a roof ridge. Pauses, turns, same stomp and dash. | A crawler with no home | After the player has landed cleanly twice. Not on level 1. |
| Ridge gust | Wind already in the model, shown as blowing snow on an exposed span | Frostline lasers and steam that have no installation | Level 25 tell, level 28 test. |
| Press, belt, steam, lift | Stay, and only inside the factory, pump house, or lift shaft | — | Already introduced in Clockworks and the counterweight tower. |

No new boss. No second attack pattern that hides its counter.

## Art list

Look at every `pixelize` output before it is wired in. Natural pixel grid, or a reference drawn at the target size. Shared palette.

1. Courier sheet: stand, run (4), jump, fall, dash, land. About 32×32 a frame. Replaces the code-drawn body only after the sheet reads at game scale.
2. Shop sign, two frames, on a real bracket.
3. Chimney rook, patrol and turn.
4. Gutter teeth as part of a roof edge tile, not a floating spike sprite.
5. One Old Quarter building face: door, two windows, drainpipe, roof lip. Used by the construction pass so a block is one house.
6. Frostline rock shelf and wind pennant, so ice ledges are cliff, not brick.

Refs: `docs/reference/refs/<name>/` (do not force-add if ignored). Finished files beside the current last-light art, drawn with smoothing off.

## Milestones

Each one is playable and tested before the next. Commit and push this branch at the end of each.

1. **Audit and this plan.** Live screenshot of the current opening once the dev server is up. Design notes reviewed from the Opus pass before layouts change.
2. **Level 1 teaching street.** Rebuild the route so the first two gaps are safe, the houses read as houses, and the gutter tooth is the first spike. Re-record that journey. Browser shots of start, middle, and Nell’s window.
3. **Shop sign.** New hazard, market roof only, telegraph, tests for the swing and for “not on a mountain.”
4. **Courier sheet.** Reference, pixelized sheet, in-game run and jump. Sheet image in the notes.
5. **Levels 2–4.** Tower, ferry, and market use the same place rule. One new enemy (the rook) on a wide roof, not in the tutorial gaps.
6. **Frostline correction.** Level 28 loses lasers. Gust and shelter replace them. Journey re-recorded.
7. **Story lines.** Shorten the heard line and the task hint so the place carries the plot. Journal and endings stay. No exit locks. Screenshot of one conversation in the street.
8. **Remaining districts in batches of four**, only where the line above says the object is still a pad. Performance check on the paint path. Full `tests/games/last-light` and a Chromebook-minded frame check (no new per-frame allocations in `draw`).

## Verification

- `npm test -- tests/games/last-light` after every code milestone. Journey witnesses regenerate with `node tests/games/last-light/record-journeys.mjs <stage>` and the unit replay must pass with no deaths and no forced positions.
- Browser: `/#/game/last-light`, keyboard jump and dash, touch on a narrow viewport, pause, retry. Screenshots of the level being played.
- Score tests stay green without edits to `rankScore` or `normalizeLastLightScore`.
- If a search says a new layout might be impossible, fix the layout. Do not assign the courier onto the exit.

## Out of scope

Phaser rewrite, new score curve, paid image APIs, pushing main, production deploy, and any story beat that gates the gold exit.
