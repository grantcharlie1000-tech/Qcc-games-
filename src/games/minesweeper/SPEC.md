# Minesweeper — current implementation

The existing QCC DOM game, shared shell, SVG flag/mine assets, storage, audio generator, account sync and leaderboard service are retained. No dependencies were added.

## Field and rules

- Easy: 9 × 9 / 10 mines. Medium: 16 × 16 / 40. Hard: 30 × 16 / 99.
- Existing deterministic, unbiased placement runs on the first successful reveal. The clicked tile and every neighbour are mine-free. No no-guess guarantee is made.
- Iterative flood reveal opens connected zeros and their number boundaries. Flags block ordinary reveal and expansion.
- Revealing all safe cells wins; flags are optional. A click/Enter/Space on a revealed number chords only when adjacent flags match. An incorrect match can lose. Chords resolve a mine before opening safe targets.
- Loss shows the triggered mine in a red inset square, other mines with the shared mine icon, and wrong flags with a visible cross. Numbers and symbols do not depend on colour alone.

## Presentation and input

Soft green checkerboard covered tiles have shallow relief. Sand/cream revealed tiles are recessed, with bold distinct numbers. A rounded dark field frame centres the board. Easy adapts its initial tile size to the viewport (minimum 32 CSS px); larger fields retain readable tiles and pan rather than scaling the entire game.

The main toolbar contains difficulty, Flags left, time and restart. The existing header menu button opens a native Game options dialog with grouped game actions, preferences/zoom, practice and statistics. Shared restart/fullscreen/help buttons retain their shell handlers and fullscreen fallback. Account/app settings remain one explicit step away. The shared pause overlay moves into the board frame, keeping the toolbar reachable. These nodes are restored on disposal. Game metrics are hidden because the game uses times and per-difficulty records instead of mixed points.

- Mouse left click reveals/chords; right click flags.
- Touch tap uses the prominent Reveal / Flag selector. Optional 480 ms hold flags once. Movement beyond 8 px, a second pointer, capture loss, or pointer cancellation consumes the tap. Compatibility touch clicks never reveal again.
- Native board scrolling works for wheel/trackpad. Pointer dragging pans; two-finger pinching zooms between 32 and 64 px, anchored around the pinch. Accessible −/+ controls offer the same range.
- Grid buttons use one tab stop, visible focus, coordinate/state labels, and row/gridcell semantics. Arrows and Home/End navigate. Enter/Space reveals/chords regardless of touch mode; F flags and C chords. Only focused grid shortcuts act. Synthesized assistive clicks honour the selected action.
- Tile opening ripples use short distance-based opacity/scale animation, flags have a short placement effect, and terminal feedback is restrained. Input never waits for animation. OS and QCC reduced-motion settings disable these effects; keyboard actions do not animate.
- First-play help can be dismissed and is remembered locally; the first opening also clears it. Full rules explain chording, flag uncertainty, timing and eligibility. Settings, statistics and practice tools live in Game options. Opening it pauses and hides the field; dismissing it restores the previous running/paused state and focus. Escape closes this menu before the shell Study shortcut. Transitions to rules, rankings and app settings preserve the pause state. The short first-play instruction is retained; decorative headings and repeated instructions are removed. Sound starts off; user choice is saved.

## Timing, persistence and statistics

The clock starts on the first reveal, uses performance.now(), and stops synchronously on win/loss. Explicit pause, shell dialogs, Study and a hidden document stop it. The board is invisible, inert and hidden from accessibility APIs while paused. Coming back from a background tab requires explicit resume. Time away from a saved game is excluded.

Every action saves through QCC storage, with the shell's periodic/pagehide saves as a backup. The snapshot includes the exact cells, seed, first reveal, reveal/flag masks, status, elapsed time, practice/assistance markers, per-difficulty statistics and preferences. Restore reconstructs and validates the layout from seed + first reveal and checks terminal consistency. Old started snapshots without an eligibility marker can be inspected/continued but count as assisted. Old ready games can start normally.

Unassisted attempts count as played at the first reveal, including later abandoned attempts. Wins and fastest times are separate for each difficulty; win rate is wins / started attempts. Practice is excluded. Statistics are carried in the game save and follow QCC's existing latest-save account merge policy; simultaneous play on devices is not an additive statistics merge.

## Practice

Practice starts a fresh, permanently assisted field. Hints use only revealed numbers; player flags are guesses, not evidence. Direct mine-count and subset constraints deduce a safe tile, explain visible source coordinates and outline it. The player still chooses whether to reveal it. The bounded solver explicitly says when it cannot establish a safe move; it never guesses or reads covered cell contents.

Undo retains time spent and supports up to 80 actions in the current visit, including recovery from a terminal mistake. Undo history is not persisted. Undoing the first reveal may return to ready with retained elapsed time; only explicitly assisted practice snapshots permit that state.

## Rankings and accounts

New leaderboard keys are `minesweeper-easy`, `minesweeper-medium`, and `minesweeper-hard`. Only unassisted wins submit. Scores encode `2147483647 - ceil(elapsedMs)` so the shared higher-is-better service orders faster times first; UI formats them as seconds with millisecond precision. The old combined score table is retained but never copied into these boards.

The existing account-only submission, identity handling, offline pending queue, cached rankings, logout isolation, and best-value merge are reused. Three best keys are added to the account allowlist. Guests retain progress locally and can read rankings; signing in uses the existing sync flow. As with QCC's other games, scores are client-reported, not server replay-verified.

Migration `20261028001000_minesweeper_difficulties.sql` extends the existing score constraint while preserving other game keys. Apply through the normal Netlify deployment migration flow; no live database was changed in this task.
