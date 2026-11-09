# Last Light: movement-led level design

Reference study, 9 November 2026. Story remains optional. The objective is an engaging precision platformer, with scenery and machinery that belong to its architecture.

## Sources and applied decisions

- [Koichi Hayashida on Mario level design, Game Developer](https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design): a level needs a central idea that develops, changes context and receives a final test. Applied through authored encounter sequences, rather than adding the same object to every third platform.
- [Maddy Thorson, Celeste & Forgiveness](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html): difficult traversal can preserve player intent. Existing coyote time, jump buffering, variable jump height and predictable checkpoints remain. The repaired level 2 opening is preserved.
- [Derek Yu on simple enemy personalities, Game Developer / Noclip](https://www.gamedeveloper.com/design/how-i-spelunky-i-s-designer-set-out-to-create-complexity-with-simplicity): straightforward behaviours can create interesting interactions. Crawlers patrol a deck and pause to turn; moth machines patrol an airborne lane. Both use the same stomp/dash counter, so difficulty comes from the placement and timing, not hidden exceptions.
- [Rooftop Reset, the user's reference](https://www.poteto.com/): the visible public game presents a climb, floor checkpoints, and a rooftop destination. Last Light keeps its own art and layouts while giving traversal clear spatial goals.

- [SpriteCook, normal maps from a sprite outline](https://www.spritecook.ai/blog/pixel-art-normal-maps-from-outline): reviewed the outline-distance height method, six-band lighting, and the warning against rounding box-shaped machinery into pillows. New metal art retains hard silhouettes and limited stepped highlights. This Canvas revision does not claim a normal-map lighting shader.

## New signature journeys

| Chapter | Central skill | Development and change | Final test |
| --- | --- | --- | --- |
| 4 | Jump-through metal grates | Climb four streets, turn left over the skyline, descend, then spring back above the western streets | A spring launch, rising grates and leftward dash to the highest relay |
| 11 | Spring height and controlled landing | Orchard launch, canopy traverse, then descent inside the greenhouse | Spring to a much higher final garden |
| 19 | Press timing and lift ascent | Read a press on a broad deck, climb the shaft, cross over the press floor, enter a conveyor return | Combine a timed machine, braking and rising grates |
| 27 | Ice braking in a vertical hollow | Ascend shelves, wrap around the hollow, descend inside it | Spring out of the hollow to the lens |
| 35 | Wind and alternating tower routes | Climb outside one tower, cross the air bridge, descend inside | Spring launch and narrow rising catches on the second tower |

These five maps are individually authored. They are not translated or rescaled versions of the previous routes. Other selected chapters introduce patrol, aerial and press encounters on explicitly chosen decks. Main routes, memory routes and return paths are checked against real physics.

## Rules for new mechanics

- Enemy side contact causes the existing short death/respawn. Descending onto an enemy bounces the courier; an active dash breaks it. Holding jump on a stomp gives a higher bounce. Enemy defeats grant no points and reset on a retry, preventing farming.
- Patrol extents are deterministic, with a pause before reversing. First exposure has a broad landing and space to observe. Flags and conversations stay outside the patrol sweep.
- Presses mount into the environment. Amber lamps and an exclamation mark precede a quick fall, a visible contact, then slower retraction. Their head's drawn position and collision position use the same function.
- Grates have a solid lip and open lattice. Jumping upward passes through; descending lands. Down drops through. Touch gets a contextual Down control, not another permanent HUD button.
- The camera follows both axes. Reversal points use painted direction marks on the deck, so an optional story prompt never has to explain the route.
- Completion banks score immediately, freezes the active timer and plays a short, skippable physical departure. No cinematic bars or mandatory story panel.

## Verification requirements

Every changed chapter needs a complete 120 Hz input recording with no assigned positions, no story interactions and no deaths. Separate checks cover optional paths, headroom, art clearance, enemy counters, press phases, grate collisions, keyboard/touch actions, reduced motion and the full-screen glass layout. A solver finding a route is a playability check, not a claim that the game is fun; user playtesting remains necessary.
