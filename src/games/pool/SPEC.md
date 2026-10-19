# Pool — The Pocket Club

A local, top-down, single-rack eight-ball game. Default: you versus an offline computer. “Two people” passes one device between two players. Changing mode starts a fresh rack. No cards, deck, currency, online opponent, tracking or runtime network requests.

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
- Physics uses circles and simplified planar cushion noses with circular pocket capture regions. It does not simulate pocket jaws, rattling, cloth spin, throw or a real table's exact dimensions.

## Controls and feedback

Click/tap anywhere to aim; shot preview shows the first cue collision and a short object direction. It is geometric, not a promised pot. Power slider pulls the cue back and changes speed. Shoot is a separate button for trackpads. Aim slider covers 360 degrees, with one-degree nudge buttons; on the focused table, left/right rotate (Shift gives fine 0.2°), up/down change power, Space/Enter shoot.

Ball-in-hand: click/tap an empty position and confirm Place cue. Arrow keys move the candidate; Enter confirms. Placement rejects balls, pockets, rails and positions outside the field. The AI chooses its placement locally. The gold ring and numbered native select identify the 8 pocket. Player cards show whose turn, assigned group, remaining ball numbers and “ON THE 8”. Full color versus stripes plus printed numbers provide non-color identification.

## Simulation and AI

The model is separate from DOM and uses a fixed 1/240 second step. Equal-mass impulses affect the collision normal only; position separation and approaching-only impulses prevent repeated bounce jitter. Ball restitution 0.97, cushion restitution 0.88, linear rolling deceleration 105 units/s². Maximum shot speed 900 units/s advances only 3.75 units per step, below half the 9.5-unit radius. Four contact iterations per step handle the rack. Pocket checks measure swept segment distance to each opening before cushion response. Speeds below 2 settle exactly to zero.

The offline computer scores legal target/pocket pairs using ghost-ball geometry, cut angle, distance and clear paths for cue and object. It selects legal direct contacts if no pot is open, then searches one-cushion kicks. As a last resort when no legal escape is found it shoots toward a legal target; a resulting obstruction/foul is judged normally. It is a casual opponent, not an optimal solver. Power estimates include travel and cut loss. A deterministic both-sides simulation tests complete rack progression.

## Lifecycle, score and art

Snapshots preserve all ball coordinates/velocities, shot first-contact/pocket/rail events, assignments, turn, selected pocket, aim, power, shot count, AI delay and mode. Unknown snapshots are explicitly validated and cloned. No own storage is used: the shell context owns saving, settings and sound. Score counts colored balls removed (100 each), plus 1000 for a player-1 rack win. Restart resets the model and works during pause. Pause stops the RAF and disables all game actions; resume starts one RAF. Dispose aborts every owned listener, cancels RAF and removes the root.

Original in-game canvas artwork: layered warm wood, teal felt texture, six numbered pockets, rail diamonds, shaded numbered balls and a cue with a blue tip. The static artwork is cached in an offscreen canvas. DPR is capped at 2. The game measures 366px wide without document overflow at a 390px viewport; its portrait table and controls scroll vertically.

`public/game-art/pool/cover.svg` is the shared starting cover. Per parent instruction, its final SVG-skill replacement is owned by the integrating parent, so this game commit does not modify it.
