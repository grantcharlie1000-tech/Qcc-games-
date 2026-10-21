# Fair Color Blocks hands

Color Blocks is the repository's Block Blast-style 8×8 three-piece tray game.
Block Fill is a separate path-filling puzzle and is unchanged.

The previous dealer ensured at most one upcoming piece could fit. A board with
isolated empty cells could therefore receive a dot followed by two impossible
large shapes. The new dealer constructs a complete three-placement witness on
a copy of the board, using the same fixed shapes and simultaneous line clears
as actual play. It deals the three shapes and leaves the real board untouched.

Each step uses the first fitting entry of the seeded shuffled bag, chooses a
legal anchor using the saved PRNG, places it on the private board and clears
completed rows and columns before selecting the next piece. Blocked bag entries
are deferred without discarding or reordering them. When none fits, a dot is the
explicit fallback and must have a validated anchor. Repeated fallback dots can
therefore precede some bag shapes; that exception to the old shape-cycle rule is
necessary to guarantee a complete hand on a fragmented board.

Runtime construction is bounded: three steps, at most nineteen bag shapes and
64 anchors per shape, plus one 64-anchor fallback scan per step. There is no
random retry loop, runtime backtracking solver, timer or network request. A
full invalid board cannot receive a legal piece and is returned unchanged with
no new hand. Normal completed placements clear lines before the next deal.

The guarantee applies when a new tray is dealt. A player can choose a different
placement and strand the remaining pieces. Previously saved or partially used
trays are preserved rather than rerolled. The version-one snapshot, score and
combo rules, fixed orientations, board, mouse/touch/keyboard controls, pause,
restart, accessibility and artwork are unchanged.

Verification uses an independent test-only occupancy solver that explores the
remaining pieces and removes all complete rows/columns between moves. It does
not call production placement or line-clear functions. Cases cover isolated
holes, a vertical piece clearing three rows and a column to unlock a big square,
dot fallback, impossible input, preserved trapped trays and an initially
solvable tray that poor choices can lose. A deterministic corpus checks 384
sparse/dense boards; ten seeded runs follow thirty complete trays each and
compare future states after serialization/restore. The browser regression
finishes an old tray, receives a fair hand, plays it with native touch, mouse
and keyboard, reloads its save and restarts.

This is a separate local increment based on PR #1's verified application tree.
It contains no study redesign, ads, provider integration, hosting, permission
or security changes. Publication awaits its own reviewed checkpoint and scope
approval. Raw verification results are recorded with the final checkpoint.

## Local verification

- Original implementation failed the full-hand, fallback and seeded-run cases;
  the new browser regression also failed against the old application, receiving
  `[18,16,17]` instead of a playable fallback. The initial unit red log includes
  one corrected fixture count: its vertical placement clears three rows **and
  column zero**, four lines in total.
- Full unit suite: **274/274**, including all **23 Color Blocks model/input
  cases**. The independent corpus covers 384 seeded boards and 300 full trays.
- Color Blocks Chromium browser suite: **18/18**, including mouse/touch/keyboard,
  new-tray play, scoring, cancellation, pause, restore, restart and three layouts.
- TypeScript/build passed; offline pack: **69 files**, version `1d30dcc85e95`.
  Color Blocks and Study passed offline at root and repository subpath.
- Fragmented-board benchmark, 1,000 local Node24 runs: mean **0.109 ms**, p95
  **0.237 ms**, max **0.962 ms**. This is this container's measurement, not a
  device-independent timing guarantee; the operation bound is deterministic.
- Local WebKit remains unavailable after the previously recorded dependency
  download denial. Fresh full hosted Chromium/WebKit CI is required before any
  later merge. No gates are waived by this local checkpoint.

Raw logs are in `docs/evidence/fair-color-blocks/`; native-input screenshot:
`tests/games/color-blocks/evidence/fair-hand-390x844.png`. Astra review is pending.


## Random fresh runs and exact saved continuation

Fresh mounts and Restart seed the existing dealer with browser random values.
The pure model retains explicit seeded reproducibility. Previously every browser
run used the model's fixed default seed, so fresh boards and restarts repeated
the same first hand and followed the same sequence for the same placements.
That seed boundary predates the complete-hand dealer.

Reload continues the saved tray, bag and PRNG state exactly. The host mounts
before restoring, so its temporary fresh state does not replace a valid save.
Hands remain constrained by the complete-placement witness and line clears;
validated dot fallback on fragmented boards and occasional repeated random
hands are expected. New-run randomness does not promise a uniform distribution
of all possible hands or different pieces on every restart.
