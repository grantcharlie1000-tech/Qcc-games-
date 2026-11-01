# Quadfall

Arrange seven four-cell pieces in a ten-column well with two hidden rows. Complete horizontal rows to clear them. A shuffled seven-piece bag feeds the next queue; hold can be used once per piece. A piece locks after 500 ms on the floor, with at most 15 movement or rotation resets at the same lowest row; reaching a new lowest row resets the timer and count. Pieces spawn in the visible rows when space permits, falling back to the hidden rows when necessary. A blocked spawn or a piece locking entirely above the visible well ends the run.

A one, two, three or four-line clear scores 100, 300, 500 or 800 times the current level. Soft drop adds one point per cell; hard drop adds two. Level is 1 plus completed lines divided by 10, rounded down. Gravity is `max(50, 1000 * 0.82 ** (level - 1))` milliseconds per row.

The host's shared Liquid Glass dock shows Score, Level and Lines. It reserves its own space below the board; no custom header or touch button grid is used. Hold and the next two pieces appear in compact glass chips above the board on phones and outside its upper corners when there is enough side space. Portrait tablets retain the top band. The board fills the available height while keeping square cells and all twenty rows visible, with a ghost marking the landing position.

Tap to rotate clockwise. Drag horizontally in cell-sized steps to move, drag down to soft drop, use a fast downward flick to hard drop, or swipe up to hold. The Hold chip also holds. One pointer sequence has one intent: a fast flick does not also soft drop or rotate. Pointer cancellation, pausing, focus loss, a hold or a piece lock cancels pending input. Gestures do not scroll or zoom the page.

Left/right or A/D move; Down/S soft drops; Up/W/X rotates clockwise; Z rotates counterclockwise; Space hard drops; C/Shift holds. Movement repeats after 133 ms (DAS), then every 33 ms (ARR). Soft drop repeats every 33 ms. Native key repeats are ignored. Escape opens the shared game menu and pauses; closing it resumes according to the host's pause state.

A fresh game has one Tap to play button; Enter/Space also starts. A restored running game waits for Continue. A lost game shows a glass sheet with Score, Best and Play again; Close results returns access to the dock without resetting the run. Held gameplay keys cannot activate replay when focus changes to the results sheet. The host stores the versioned run and local best; signed-in accounts sync both. Scoring and leaderboard reporting remain with the existing model and context API.

Rendering uses requestAnimationFrame and device-pixel-ratio canvas backing stores, with layout sizes cached by ResizeObserver and DOM reports updated only when state changes. A line clear flashes and collapses over 150 ms, with a 12 ms vibration where supported. Reduced motion uses a gentle static flash without collapse or vibration.
