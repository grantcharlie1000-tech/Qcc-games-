# Color Blocks

An endless, fixed-orientation 8×8 block-placement puzzle. This is a Block Blast-style tray game, distinct from Block Fill's finite silhouette puzzles and unrelated to match-three.

## Rules and research

Read on 2026-10-19: [RisticDjordje/BlockBlast-Game-AI-Agent README](https://github.com/RisticDjordje/BlockBlast-Game-AI-Agent/blob/main/README.md), retrieved from its raw GitHub URL. Its introduction describes an 8×8 board, three randomly supplied shapes, completed rows/columns and successive-clear combos. Its human controls use selection, hover preview and placement. This is a secondary implementation reference, not an official scoring specification; no code or art was copied. The Apple App Store listing request at https://apps.apple.com/us/app/block-blast/id1617391485 was blocked by network policy. Fixed orientations, exact scoring and fair-deal policy below are explicit product choices under the assigned brief.

- There are 64 logical integer cells and nineteen fixed shapes ranging from a dot to a 3×3 square. Shapes cannot rotate or mirror during play. Colour is decorative.
- A tray holds three pieces. Used slots stay empty until all three are used. The next tray contains exactly three pieces.
- Placement must put every shape cell in bounds on empty cells. Invalid placements do nothing. Pieces never fall or move after placement.
- Identify all full rows and columns from the same post-placement board, then remove the union of cells. Intersections clear once while both lines count.
- Each placed cell earns one point. Each line earns `20 × current streak`; a clearing placement increments the streak, and a placement with no clear resets it. Clearing two lines with a one-cell crossing placement gives 41 points at streak one.
- Shapes are dealt from a seeded Fisher–Yates shuffle bag: all nineteen appear before that bag repeats. At refill, when all three upcoming bag entries cannot fit but another bag entry can, move that entry forward without discarding any shape. Choices are saved, not rerolled by restore. This balances shape variety while reducing needless dead deals. It does not guarantee that every three-piece set can all be played, or that every board remains solvable.
- Loss is derived solely by checking all 64 anchors of every remaining tray piece. A blocked first piece never causes loss while a later piece fits. No timer, rotation, undo, paid continuation or external calls.

## Input and presentation

Drag a tray piece from any occupied constituent cell; the grabbed cell stays under the pointer. A valid ghost highlights exactly the cells `place` will commit. Bounds and collisions suppress the ghost. A release outside the board cancels. Touch shares Pointer Events with mouse/trackpad; pointer capture survives leaving the tray. Every event maps client coordinates through the current board bounding rectangle, so scroll, CSS scale and resize do not change logical results. This is endpoint placement, not path painting: intermediate pointer samples never alter state, so sample interpolation is unnecessary.

Alternative: select a tray button then tap a board cell as the piece's bounding-box top-left anchor. Keyboard: 1/2/3 select, arrows aim, Enter/Space place; native tray-button activation also selects. A labelled ARIA grid reports cell occupancy and active destination. Colourblind settings reveal high-contrast unique marks; every piece has a shape label, number and accessible colour/pattern description. No decoration animates; reduced-motion preference remains respected. Sound is requested only through the shared context, whose default is off.

Original artwork: `art.ts` draws beveled glossy gems with highlights, dark bases and seven geometric marks. `public/game-art/color-blocks/spark.svg` supplies the original stacked-gem banner illustration. The parent owns the replacement `cover.svg`; it was intentionally untouched under the latest task instruction. The board fits a 366px stage without horizontal overflow.

## State and lifecycle

`model.ts` is renderer/input independent. A version-one snapshot stores board, tray, shuffle bag, PRNG state, moves, score, cleared lines and combo. `restoreGame(unknown)` validates shapes, dimensions, ranges, bag uniqueness and unresolved full lines, then returns defensive copies. Invalid or incompatible saves are ignored. Preview/drag is ephemeral and cancelled on pause, restore or restart.

The frozen GameModule exposes pause/resume/restart/serialize/restore/dispose. Pause rejects all actions; restart resets even while paused, with the parent deciding when to resume. Disposal aborts every event listener and releases pointer capture. There are no game RAFs, intervals, timeouts, observers, global storage or runtime requests. Rendering publishes scores and status only when they change, so pointer movement does not repeatedly write parent score storage.
