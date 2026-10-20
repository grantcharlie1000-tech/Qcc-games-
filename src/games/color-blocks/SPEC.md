# Color Blocks

An endless, fixed-orientation 8×8 block-placement puzzle. This is a Block Blast-style tray game, distinct from Block Fill's finite silhouette puzzles and unrelated to match-three.

## Rules and research

Read on 2026-10-19: [RisticDjordje/BlockBlast-Game-AI-Agent README](https://github.com/RisticDjordje/BlockBlast-Game-AI-Agent/blob/main/README.md), retrieved from its raw GitHub URL. Its introduction describes an 8×8 board, three randomly supplied shapes, completed rows/columns and successive-clear combos. Its human controls use selection, hover preview and placement. This is a secondary implementation reference, not an official scoring specification; no code or art was copied. The Apple App Store listing request at https://apps.apple.com/us/app/block-blast/id1617391485 was blocked by network policy. Fixed orientations, exact scoring and fair-deal policy below are explicit product choices under the assigned brief.

- There are 64 logical integer cells and nineteen fixed shapes ranging from a dot to a 3×3 square. Shapes cannot rotate or mirror during play. Colour is decorative.
- A tray holds three pieces. Used slots stay empty until all three are used. The next tray contains exactly three pieces.
- Placement must put every shape cell in bounds on empty cells. Invalid placements do nothing. Pieces never fall or move after placement.
- Identify all full rows and columns from the same post-placement board, then remove the union of cells. Intersections clear once while both lines count.
- Each placed cell earns one point. Each line earns `20 × current streak`; a clearing placement increments the streak, and a placement with no clear resets it. Clearing two lines with a one-cell crossing placement gives 41 points at streak one.
- Every newly dealt tray has at least one complete placement sequence from the current board, including simultaneous line clears between placements. The seeded Fisher–Yates bag supplies the first fitting shape at each of three private planning steps; a seeded random legal anchor is chosen and its lines cleared on the private board before planning the next piece. Only the pieces are dealt; the real board is unchanged. This constructive witness bounds work to three scans of at most nineteen shapes × 64 anchors, with no retries or exponential runtime search.
- Blocked bag entries stay in their existing order for a later deal. If none fits, a dot fallback is used only after validating an actual anchor. That necessary fairness fallback may repeat a dot before all nineteen bag shapes have appeared. A fully occupied invalid board yields no new hand; arbitrary dead boards are not claimed to be rescued. Existing or partially used saved trays are preserved exactly. Other placement choices can still strand remaining pieces and cause a normal loss; no automatic hints or rerolls are added.
- Loss is derived solely by checking all 64 anchors of every remaining tray piece. A blocked first piece never causes loss while a later piece fits. No timer, rotation, undo, paid continuation or external calls.

## Input and presentation

The parent provides a viewport-filling stage and compact HUD. The centered module reserves its top 76px, uses the parent `--scene-width`, a flat #30223b background and square dark 8×8 inset. No banner, rounded card frames or movement/placement control panel is present. The tray beneath the board has three clear hit regions and half-board-cell artwork; pickup immediately renders the entire fixed shape at the actual board cell scale. Original SVG cubes have straight faces, light top/left bevels and dark bottom/right bevels. Colourblind marks remain available.

A drag anchors an occupied constituent cell. Mouse/pen keep that cell at the pointer; touch lifts it by `max(26px, 1.25 × current cell width)` above the finger. `input.ts` maps both movement and release through the same actual board bounding rectangle and touch offset. The ghost contains exactly the integer cells `place` will accept; invalid overlap/bounds show no legal ghost. Valid release snaps immediately; invalid release returns the artwork to its tray over 180ms without altering state. A cancelled pointer, lost capture, Escape, pause, blur or resize clears the gesture/selection and never places it. Only one primary pointer owns a gesture.

Alternative: select a tray button then tap the board's top-left destination cell. Keyboard: 1/2/3 select, arrows aim, Enter/Space place; native tray-button activation also selects. Repeated held placement keys cannot commit another piece. A labelled ARIA grid reports occupancy/preview; every tray piece has an accessible shape, block-count and colour/pattern label. Instructions/status remain available to assistive technology without a large visible panel.

Pointer placement uses small 280ms score feedback, 250ms row/column streaks and restrained combo text on consecutive clearing moves. WAAPI effects animate only transform/opacity, respect system/product reduced-motion preferences and are cancelled on lifecycle interruption. Keyboard placement is immediate. Sounds remain through the shared context. No original reference image is bundled as artwork.

## State and lifecycle

`model.ts` is renderer/input independent. A version-one snapshot stores board, tray, shuffle bag, PRNG state, moves, score, cleared lines and combo. `restoreGame(unknown)` validates shapes, dimensions, ranges, bag uniqueness and unresolved full lines, then returns defensive copies. Invalid or incompatible saves are ignored. Preview/drag is ephemeral and cancelled on pause, restore or restart.

The frozen GameModule exposes pause/resume/restart/serialize/restore/dispose. Pause rejects all actions; restart resets even while paused, with the parent deciding when to resume. Disposal aborts every event listener and releases pointer capture. A ResizeObserver cancels stale geometry when the board size changes and is disconnected on disposal. WAAPI effects are cancelled and removed on interruption. There are no game RAFs, intervals, timeouts, global storage or runtime requests. Rendering publishes scores and status only when they change, so pointer movement does not repeatedly write parent score storage.
