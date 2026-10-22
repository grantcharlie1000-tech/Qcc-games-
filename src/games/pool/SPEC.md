# Pool — The Pocket Club

A local, top-down, single-rack eight-ball game. Default: you versus an offline computer. “Two people” passes one device between two players. Changing mode or AI difficulty starts a fresh rack. Easy is a beginner opponent, Medium preserves the original shot planner, and Hard verifies aim and power variations using the table physics. No cards, deck, currency, online opponent, tracking or runtime network requests.

## Source and scope

Rules researched on 2026-10-19 from [WPA Rules of Play](https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf), effective 2025-09-15, especially §§3.1–3.3 and 4.1–4.11 (printed pp.14 and 18–21). The connected web tool read the supplied PDF successfully; direct shell requests to WPA/BCA were blocked by the proxy. This is an explicitly simplified local ruleset, not a tournament rules implementation.

## Rules implemented

There are fifteen numbered object balls and one cue ball. The tightly spaced triangle has the 8 in its centre and opposite groups in its back corners. Player 1 starts with the cue at the head end.

A break needs an object-ball pot or four distinct object balls reaching cushions. The table stays open after a break. The first legal colored pot on a later shot assigns solids (1–7) or stripes (9–15), and the opposite group to the opponent. A player keeps the turn after legally potting their group, otherwise play passes. Opponent balls stay down.

Hit a legal ball first. Then pot a ball or reach a cushion. Scratching, missing every object, wrong first contact, or failing the rail/pot condition gives the opponent ball-in-hand. On an open table, colored balls are legal first contacts. Once a group is cleared, the 8 is the legal target. A called-pocket 8 wins only when the group was clear at the start of the shot and the shot has no foul. An early 8, an 8 with a foul, or the wrong pocket loses the rack.

## Explicit local simplifications (also in visible Game rules)

- Only the 8-ball pocket is called. Other legal group pots count without calling a ball or pocket. When multiple colors drop on an open table, the first event determines the group.
- Player 1 always breaks at a fixed head spot; no lag or repositioning before the break. The non-mandated rack positions repeat deterministically instead of being shuffled.
- Every break foul/illegal break automatically gives the opponent ball-in-hand anywhere; there are no accept-position/re-rack choices or head-string restriction.
- A break 8 is automatically re-spotted near the foot spot, moved along the long axis until clear. No re-break choice.
- No “safety” declaration, temporary group claims while the table is open, automatic stalemate/referee procedure, spin, jumps, off-table balls, equipment/physical-player or tournament conduct fouls. Restart is available for a stalled game.
- Physics uses circles, six finite cushion noses with rounded jaw endpoints, and circular pocket capture regions. It does not simulate pocket rattling, cloth spin, throw or a real table's exact dimensions.

## Controls and feedback

Drag the felt to aim; releasing an aiming drag never shoots. Start a new drag on the white ball, pull backwards along the cue, then release to shoot. Power is proportional to the pull, with a screen-scaled deadzone for finger jitter. The cue, contact marker, short object direction and prominent vertical power meter beside the table provide immediate feedback. The meter includes a numeric percentage; the redundant horizontal power bar is removed. The preview is geometric, not a promised pot. There are no gameplay buttons or sliders.

Return to the white ball or the initial contact to cancel. C/Backspace, a second pointer anywhere in the window, lost capture, pointer cancellation, blur, pause, restart and changed table geometry also discard a loaded stroke. Pointer capture permits deliberate release outside the canvas. A drag must begin on the playing surface, and an existing held contact prevents a new stroke. Escape opens Study through the shell and cancels safely.

On the focused table, left/right rotate (Shift gives fine 0.2°), up/down change power, Space/Enter shoot. Live feedback reports keyboard aim and power. Ball-in-hand uses a tap or drag to an empty felt position followed by release; arrows move the candidate in screen directions and Enter confirms. Placement rejects balls, pockets, rails and positions outside the field. The AI chooses its placement locally. The gold ring and numbered native select identify the 8 pocket. The scoreboard sits above the table, with a large solid/striped group badge, explicit group and number-range labels, a turn indicator and seven slots per player. Each slot fills with its numbered ball as that ball is potted; captions report potted and remaining totals. Before groups are assigned, a shared summary shows balls potted on the open table. HUD changes appear as balls drop, including during motion. “ON THE 8” replaces the group badge once all seven are down. Full color versus stripes plus printed numbers provide non-color identification.

## Simulation and AI

The model is separate from DOM and uses a fixed 1/240 second step. Equal-mass impulses affect the collision normal only; position separation and approaching-only impulses prevent repeated bounce jitter. Ball restitution 0.97, cushion restitution 0.88, linear rolling deceleration 105 units/s². Maximum shot speed 900 units/s advances only 3.75 units per step, below half the 9.5-unit radius. Four contact iterations per step handle the rack. Pocket checks measure swept segment distance to each opening before cushion response. Corner wells have a 22-unit visible and capture radius, with 30-unit mouth cutouts; the smaller middle wells use a 17-unit radius and 26-unit cutouts. These follow the reference proportions of roughly 2.3 and 1.8 ball diameters, with a thin two-unit outer rim. Four fully round corner wells and two inset middle openings follow the reference. Pocket numbers and the selected-pocket ring appear when the player is on the 8. The six finite rails, rounded jaw collisions, cushion artwork and first-contact aim guide share the same geometry. The AI reflects kicks from the actual rail/jaw normal; a ray into a pocket is not treated as a cushion. Speeds below 2 settle exactly to zero.

Medium, the original offline computer, scores legal target/pocket pairs using ghost-ball geometry, cut angle, distance and clear paths for cue and object. It selects legal direct contacts if no pot is open, then searches one-cushion kicks. As a last resort when no legal escape is found it shoots toward a legal target; a resulting obstruction/foul is judged normally. It is a casual opponent, not an optimal solver. Power estimates include travel and cut loss. A deterministic both-sides simulation tests complete rack progression.

## Lifecycle, score and art

Snapshots preserve all ball coordinates/velocities, shot first-contact/pocket/rail events, assignments, turn, selected pocket, aim, power, shot count, AI delay and mode. Unknown snapshots are explicitly validated and cloned. No own storage is used: the shell context owns saving, settings and sound. Score counts colored balls removed (100 each), plus 1000 for a player-1 rack win. Restart resets the model and works during pause. Pause stops the RAF and disables all game actions; resume starts one RAF. Dispose aborts every owned listener, disconnects the resize observer, releases capture, cancels RAF and removes the root.

Original in-game canvas artwork, updated from the supplied table reference: polished red rails with metal corner caps, bright cyan felt, six black pocket wells, rail diamonds, shaded numbered balls, a solid white first-contact guide and a long wooden cue with a blue tip against a navy surround. The static artwork is cached in an offscreen canvas. DPR is capped at 2. The 840 × 440 horizontal view rotates the existing 440 × 840 physics coordinates clockwise, preserving version-1 saves. Ball numbers and labels stay upright. Shared uniform fitting keeps the complete game within desktop, portrait and landscape viewports without document scrolling; pointer mapping uses the actual displayed rectangle. See [direct-input implementation and evidence](../../../docs/POOL_DIRECT_DRAG.md).

`public/game-art/pool/cover.svg` is the shared starting cover. Per parent instruction, its final SVG-skill replacement is owned by the integrating parent, so this game commit does not modify it.
