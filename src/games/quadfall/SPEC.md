# Quadfall

Arrange seven four-cell pieces in a ten-column well with two hidden rows. Complete horizontal rows to clear them. A shuffled seven-piece bag feeds the next queue; hold can be used once per piece. A piece locks after 500 ms on the floor, with at most 15 movement or rotation resets at the same lowest row; reaching a new lowest row resets the timer and count. Pieces spawn in the visible rows when space permits, falling back to the hidden rows when necessary. A blocked spawn or a piece locking entirely above the visible well ends the run.

A one, two, three or four-line clear scores 100, 300, 500 or 800 times the current level. Soft drop adds one point per cell; hard drop adds two. Level is 1 plus completed lines divided by 10, rounded down. Gravity is `max(50, 1000 * 0.82 ** (level - 1))` milliseconds per row.

Left/right or A/D move; Down/S soft drops; Up/W/X and Z rotate; Space hard drops; C/Shift holds. Touch controls offer the same actions; left, right and soft drop repeat while held. Narrow screens show two next pieces. Cleared rows flash briefly unless reduced motion is enabled. Drag horizontally or down on the board, tap to rotate, or flick up to hard drop. Escape opens Study through the host. The host stores the versioned run and local best; signed-in accounts sync both.

A restored running game waits for Continue; returning from Study resumes the current game without that prompt.
