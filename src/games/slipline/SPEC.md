# Slipline

An endless deterministic arrow extraction puzzle. Tap a continuous orthogonal route; its final segment determines the exit ray. An occupied ray costs a heart and marks the route red; a clear ray removes the route. One hint marks a free route. Three lost hearts end the round; completing a board records the best round score for that level and unlocks the next. Campaign score sums the per-level bests. Restart replays the current level without erasing campaign progress.

The reference pack supplies the dark indigo surface, lavender routes, rose level label, three hearts, progress tick and yellow hint. The generator uses seeded walks and constructs a reverse removal order. Geometry is regenerated from the level, rather than stored in snapshots. The host provides the toolbar, study and persistence.

Current deviations: the PDF shows its densest board ("Extra Hard, Level 1", about 27 lattice points); Slipline ramps from 7 points to 26 by level 44. Stroke width and arrowheads scale down on small boards so routes stay thin. The failure and win layers use QCC panels instead of the excluded menus. Reduced-motion clears are immediate. Hint count, scoring and the generator are our own because the pack leaves them unspecified.
