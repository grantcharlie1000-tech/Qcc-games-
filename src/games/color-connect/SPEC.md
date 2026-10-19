# Color Connect specification

Connect every matching pair with orthogonal paths. Paths occupy cells, never cross or share them, and cannot enter another pair's endpoint. A board wins only when all pairs connect AND every cell is covered. Release may leave a partial path. Drag from an endpoint to redraw its colour; grab an existing trail to trim it, backtrack along it, or erase the selected colour. Undo restores the previous whole gesture. There is no timer or penalty for experimenting.

Twelve deterministic boards progress from 4×4/three pairs to 7×7/seven pairs. A seeded Hamiltonian backbite construction supplies a coverage witness, then endpoints alone form the playable puzzle. An independent CSP search verifies the shipped endpoint boards. Hints solve from current prefixes and occupied cells; one press adds a legal next cell, or, only after an exhaustive impossibility proof, identifies a required backtrack. Search exhaustion is reported as uncertainty.

Presentation: an ink-blue recessed board, beveled cell wells, shaded candy trails, glossy shape-marked pegs and permanent A–G labels. Cell and path identities remain readable without hue. Mobile layout fits a 366px stage; board scales as SVG with semantic cell buttons above it. Arrow keys move a roving grid focus; Space/Enter starts or ends drawing, arrows extend the active path, Backspace trims and Delete erases. No global keyboard interception. Pointer capture and segment-to-grid interpolation preserve every crossed cell during fast mouse/touch traversal.

Lifecycle: context owns score (100 per distinct solved puzzle), level, status, sound and persistence. Pause gates every mutation and disables controls. Restart resets the complete run, including selection, progress, history and score. Snapshots project an in-flight gesture as one complete transaction (paths, undo record, move and distinct completion award) without interrupting pointer input. Restore rejects invalid coordinates, endpoint order, overlaps, jumps, malformed history and incompatible snapshots. All event handlers use one abort signal; disposal aborts handlers and clears the host. No runtime requests, timers or decorative animation.

Research read 2026-10-19:
- https://github.com/mzucker/flow_solver/blob/master/README.md and flow_solver.c: Numberlink endpoint formats, cardinal movement and search/constraint approach. Original implementation below; no copied solver code.
- https://github.com/w3c/pointerevents/blob/gh-pages/index.html: pointer capture, coalesced events, touch-action. DOM Pointer Events, geometric interpolation, cancellation and capture release.
- https://github.com/w3c/aria-practices/blob/main/content/patterns/grid/grid-pattern.html: directional grid navigation and one tab stop.

Acceptance evidence is recorded separately in TEST_RESULTS.md. Cover artwork is owned by the parent under the current task override.
