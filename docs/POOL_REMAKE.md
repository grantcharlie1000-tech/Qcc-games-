# Pool remake (2026-11-04)

Pool was rebuilt from scratch. The previous version moved balls at a constant deceleration with no spin, judged pockets
with a simple radius, shot by dragging the white ball itself, kept the called pocket and players in form controls under the
table, and drew flat balls. The new version:

| Area | Before | Now |
| --- | --- | --- |
| Physics | Constant deceleration, fixed cushion bounce, no spin | Slide → roll friction model with follow, draw, stun and side spin; throw on ball contacts; english off cushions; speed-dependent cushions; angled pocket jaws with capture behind the mouth (`physics.ts`) |
| Rules | Fixed break spot, repeating rack, simplified break fouls | Break from anywhere behind the head string, shuffled seeded rack, illegal break re-rack for the opponent, kitchen ball in hand after a break scratch, 8 re-spotted on the break, called 8 pocket chosen on the table, match of alternating racks (`game.ts`) |
| Computer | Geometric guess, hard checked power ±20% | Candidate pots verified in the real physics at several speeds and spins, position play, safeties, kicks, ball-in-hand placement; difficulty sets exploration and error (`ai.ts`) |
| Controls | Pull the white ball back; selects under the table | Drag the cloth to aim; power cue slider; fine-aim wheel; spin picker; drag the cue ball for ball in hand; tap a pocket to call the 8; hold the table to fast-forward; complete keyboard play |
| Presentation | Flat circles, static numbers | Per-pixel shaded balls that roll, soft shadows, walnut table with pearl sights, drawn cue with pull-back, ghost ball and object/cue-ball guide lines, dimmed illegal balls, foul/group toasts, result card with match score, synthesised table sounds |
| Layout | Fixed canvas size, rotated by media query | Canvas sized to its box at device resolution (max 2×), landscape or portrait chosen from the available space, controls beside the table |

Online play keeps the host-authoritative design; the protocol version is now `pool-online-2` (spin and called pocket travel
with the shot; the separate pocket command is gone). Saves use version 2; older saves are ignored and a new rack starts.

The retired offline-verifier helper for the old drag gesture (`scripts/pool-verifier-shot.mjs`) and its tests were removed
with the gesture. Details: [SPEC](../src/games/pool/SPEC.md), [test results](../src/games/pool/TEST_RESULTS.md).
