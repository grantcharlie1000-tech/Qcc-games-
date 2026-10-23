# Water Sort

A quiet, colourful sorting puzzle for mouse, touch and keyboard. Seventy-seven original
levels offer Gentle (two/three colours), Flow (four), and Deep (five to seven) difficulty.
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
The user's requested goal takes precedence: **every colour is sorted into its
own single tube**. Every nonempty tube holds one colour and no colour appears in
two tubes, so a colour split among two partial tubes does not win. An entirely
empty board does not win. Capacity remains four during all pours.

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

Every one of the 77 shipped levels is additionally solved in tests by a
separate breadth-first implementation that calls none of the production rules,
goal, canonicalizer or search. Its plan and the reverse witness are replayed
through the player rules. The constructor's fully consolidated witness solves
this goal; play stops once each colour occupies exactly one tube. No unchecked random board
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
Score is a campaign sum over solved levels of a base 50 × colours × (witness pours / 3 + 2)
plus an efficiency bonus of base × min(1, witness pours / pours), less a tenth of
base per hint or undo (bonus floored at 0). The snapshot keeps each level's best
{pours, assists}; replays only improve it, and it survives restart and level changes.

## Presentation and input — 19 October correction

The shared shell supplies the fixed viewport and corner back/restart controls.
The module fills its height on a flat aubergine background with open, evenly
spaced rows. Actual levels have four to seven tubes, arranged in two balanced
rows; no invented ad-locked slot is added. A small native difficulty control
sits above the bold Level N heading; activating the heading's native level
select chooses any shipped level. Round gold Undo and Hint remain in the bottom
corners. The selected source uses an outline/underline rather than a card.

Original SVG glass has a narrow neck, slightly flared lip, thin pale lavender
outline, rounded bottom and restrained highlights. Empty glass is transparent.
Flat saturated colour bands are clipped to the interior. Colour-blind mode adds
letter/pattern marks, and each button always has an accessible bottom-to-top
colour description. Existing levels/colour counts are preserved.

`geometry.ts` conserves liquid volume as polygon area. It intersects the rotated
rounded-bottom interior with horizontal half-planes and transforms each band
back into glass coordinates. Glass rotation therefore does not rotate painted
stripes. The round bottom is sampled in 32 segments for area solving and given
a smooth SVG clip. `spillAngle` chooses the tilt at which the remaining liquid
reaches the low lip. This is controlled vector liquid, not hydrodynamic physics.

A normal 1.4-second transaction travels/lifts, tips, streams, returns upright
and travels back to the original slot. The source drains and destination rises
together during the flow phase. A narrow continuous stream joins the actual low
lip to the receiving tube. Only completion commits the already-validated pure
move and one undo entry. Pause and Study retain the pending transaction and its
elapsed animation time; resize refits the scene without committing a move.
Reduced-motion and keyboard selection use a gentle 160ms transfer without glass
travel or stream. Brief bubbles identify a completed single-colour tube; the
whole puzzle gets a brief victory overlay and an accessible next-level button.

Native buttons support source-then-destination clicks/taps, Tab, arrow focus,
Enter and Space. Repeated held Enter/Space is suppressed. Optional old
pointer-drag input remains compatible but is never required; pointercancel,
blur, resize and pause clear a pending gesture. Optional drags actually capture
the primary pointer on the source button; release/lost-capture cleanup occurs
before rerender or disposal. Only tube targets disable native touch panning. There is no separate Pour button,
large dashboard, duplicated parent toolbar, or new runtime dependency.

Reference stills and continuous-motion limits are recorded in SKILL_USAGE.md.
No original MP4 was provided, so timing is an implementation choice. Evidence
and exact observed checks are in TEST_RESULTS.md and the owned test directory.

## Level expansion — 21 October 2026

27 distinct boards are shipped, with nine levels in each existing difficulty tier.
The first nine boards, indices and generator are unchanged, preserving saved games.
Eighteen named seeded boards are appended. Every level is verified by an independent
BFS, its reverse-construction witness, the normal solver and reachable-state hint
recovery. Level selection exposes all 27; completing Level 27 wraps to Level 1.

## Level expansion — 23 October 2026

The original 27 boards remain unchanged. Fifty new Deep puzzles extend the catalogue to 77, with independent minimum-pour difficulty rising from 14 to 21. New boards are distinct even under tube reordering and colour renaming; each has an independently solved route and legal construction witness. The final level now wraps from Level 77 to Level 1. See `docs/LEVEL_EXPANSION.md` for the full arcade inventory and verification.
