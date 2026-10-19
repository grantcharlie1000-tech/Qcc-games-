# Water Sort

A quiet, colourful sorting puzzle for mouse, touch and keyboard. Nine original
levels offer Gentle (two/three colours), Flow (four), and Deep (five) difficulty.
All colours have exactly four units; every board has two spare tubes.

## Rules and research

The research source was the public Water Sort implementation and explanation at
https://github.com/tanjuntao/water-sort-puzzle, specifically its `README.md`,
`bottle.py` and `board.py`, read through raw.githubusercontent.com on 2026-10-19.
It establishes bottom-to-top stacks, capacity four, exposed contiguous runs,
matching destination tops, spare bottles, and its original homogeneous/full goal.

This game's explicitly requested variant permits a partial run when the target
has less free capacity than the exposed run. That differs from the source's
all-or-nothing `Bottle.push`; none of its code is copied. A legal pour moves
`min(exposed top run, destination free capacity)` units. An empty source, self
pour, out-of-range tube, full target or mismatching target top changes nothing.
The user's requested goal takes precedence: **every nonempty tube contains only
one colour**. Partial tubes count, including one colour split among two tubes.
An entirely empty board does not win. Capacity remains four during all pours.

## Construction and independent verification

`levels.ts` starts with one full tube per colour plus two empties. A seeded
reverse exchange chooses full tubes A and B with different top colours and top
runs longer than one. It chooses `q < min(runA, runB)` and performs three reverse
transfers: A→spare, B→A, spare→B. Both coloured tubes end full; both spares end
empty. These construction transfers may place different colours together and
are **not** presented as legal player moves.

Their inverse is a legal maximal-run sequence: B→spare, A→B, spare→A. The moved
runs have exactly q units, the receiving colour is matching or empty, and there
is enough space. Prepending each inverse triple to the witness proves that the
resulting level has a solution. Fixed seeds give reproducible original boards.

Every one of the nine shipped levels is additionally solved in tests by a
separate breadth-first implementation that calls none of the production rules,
goal, canonicalizer or search. Its plan and the reverse witness are replayed
through the player rules. Actual shortest routes for the relaxed goal are
recorded in TEST_RESULTS.md and evidence/measurements.json. The constructor's
fully consolidated witness is a sufficient solution to this goal too; play
stops as soon as the nonempty tubes are homogeneous. No unchecked random board
is shipped or generated during play.

`solver.ts` performs breadth-first graph search from the **current** board.
Sorted tube encodings remove equivalent tube permutations; nodes preserve real
indices for a usable route. A visited set prevents cycles. Repeatedly taking
the first shortest-path hint strictly decreases remaining distance. If a route
is not found within the 100,000-state budget (including queued boards), the hint offers a finite number of
undos to a searched solvable ancestor. It does not invent a pour or automatically
oscillate between pour and undo.

## State and lifecycle

`rules.ts` contains immutable stack-array transitions, independent of the DOM.
`session.ts` owns committed state and the finite phases represented by selected,
pending, paused and won guards. A pending pour stores its validated result and
elapsed animation time; committing appends one prior board to undo history.
Advance while paused does nothing. Restart cancels the pending move and resets
the current level, retaining the module's pause state. The shell decides when
to resume after its restart action.

Snapshots contain version, level, committed tubes and undo history. A save
during an unfinished pour contains the pre-pour committed board. Restore checks
all dimensions, integer colour ranges, four units per colour, initial history,
every actual legal transition, and absence of moves after victory. It clones
accepted data. Invalid data leaves the current game intact. History is bounded
at 5,000 pours; the player can undo or restart at that limit.

Only pending pours schedule RAF. Pause cancels it and resume starts a fresh
time origin, avoiding hidden elapsed time. Disposal cancels RAF, aborts all
root/window listeners, and removes the game root. No own storage, audio engine,
global keyboard listener, or external runtime request is used. All lifecycle,
score, level, status, sound and save calls use the frozen GameModule contract.

## Presentation and input

Original glass/liquid artwork uses inline SVG with rounded clipping, separate
bands, surface highlights and graduations. A brief lift/tilt and curved liquid
stream explain the transfer before its legal result commits. Normal pours take
260ms; reduced-motion and keyboard pours take 50ms without glass movement.
Desktop fits seven tubes in one row; narrow phones wrap them in centred rows.

Native tube buttons support click/tap, real pointer dragging, Tab, arrow focus,
Enter and Space. Visible A–E letters and accessible bottom-to-top names are
always present; the shell's colour-blind setting adds distinct SVG patterns.
Undo, Hint, Difficulty, Level and Next level are semantic controls. There is no
duplicate shell pause/restart toolbar. The game fits 366px available width.

Per the parent's later instruction, the parent owns the replacement cover at
`public/game-art/water-sort/cover.svg`; this specialist supplies the original
in-game SVGs and does not overwrite that coordinated cover work.
