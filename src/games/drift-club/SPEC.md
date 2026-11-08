# Drift Club

Drift Club is a perspective 3D shuffleboard game for the QCC Games library. The harbour, board, pucks and obstacles are drawn from world coordinates on a 2D canvas. The fixed camera and cached scenery keep the board playable on browsers without WebGL.

- **Solo tour** gives you four deliveries on each of three courts. A puck's centre determines its ring score of 1, 3, 5 or 8. A bank adds one and a gate crossing adds two, provided the puck still scores when the court closes. Moving an earlier puck can change the score.
- **Rival** plays the same three courts against the harbour pilot. The pilot simulates legal draws, curls and takeouts using the same physics and the same one-left/one-right curl allowance per player per court.
- **Pass & play** and **Online** alternate four shots per player per court. The opening player rotates. Both players keep their court totals across the 24-delivery match. The online host accepts the current seat's legal commands, owns completion and rematch, and sends the ordered history through the shared QCC WebRTC room. Each player can use their own seasonal and reduced-motion settings.
- **The logbook** records scoring banks, gates, pilot victories, tour bests and Master completion. A 24-point solo tour or a win against the pilot unlocks three expert courts in a separate solo save. Standard solo medals are bronze at 24, silver at 42 and gold at 60.
- **Controls** support pulling back on the court and releasing, native angle/weight sliders, or arrow keys and Space with the court focused. The QCC menu handles pause, restart and rules.

The standard courts are Sunset Pier, Tidal Narrows and Beacon Reach. The three Master layouts are Breakwater, Switchback Sound and Lantern Hook. Each has a Christmas counterpart with identical physics. Host and guest can choose different themes in one match.

The catalog poster is a voxel scene in the shared generator. Rebuild it with `node scripts/generate-posters.mjs drift-club`. The [development gallery](../../../docs/evidence/drift-club/index.html) includes the design sheet, early board, both skins, progression, multiplayer and the poster in the library.

Run `npx vitest run tests/games/drift-club tests/core/posters.test.ts` for rules, progression and poster validation. Browser scenarios live in `tests/games/drift-club`. The separate `tests/multiplayer/drift-club-online.spec.ts` uses two Chromium processes and the public signalling service.
