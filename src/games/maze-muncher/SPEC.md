# Maze Muncher

An original maze-chase game in the classic arcade style. Gameplay follows the genre's well-known rules. The name, characters (Nib and the wisps Rook, Vex, Drift and Mope), maze layout and all artwork are original. No trademarked names, characters, mazes, sprites or sounds are used.

## Rules (implemented in `model.ts`, one `step()` = one 1/60 s tick)
- 28×31 tile maze with 242 dots (10 pts), 4 power berries (50 pts), a side tunnel and a central house with a door.
- Nib keeps moving, reverses instantly, holds a turn pressed early until the next opening, and stops at walls. Each dot pauses Nib for 1 tick (3 ticks for a power berry).
- Chasers alternate scatter and chase phases (L1: 7/20/7/20/5/20/5 s, then chase) and reverse at each switch. Targets: Rook goes for Nib's tile; Vex aims 4 tiles ahead; Drift doubles the vector from Rook to 2 tiles ahead; Mope chases when more than 8 tiles away and otherwise retreats to its corner. The up-facing lookahead keeps the classic diagonal offset. Ties resolve up, left, down, right, and chasers never reverse on their own.
- A power berry frightens chasers for a time set by the level (6 s at L1, falling to 0). Frightened chasers turn blue, pick random turns from a seeded RNG, slow down and flash for the last 5 (or 3) flashes. Eating them scores 200, 400, 800 and 1600, freezes play for 1 s and sends their eyes home to revive.
- Release from the house uses per-chaser dot counters (L1: 0/30/60), a shared counter after a lost life (7/17/32) and a 4 s idle timer (3 s from L5).
- Rook speeds up when 20/10 dots remain (thresholds rise with level). The tunnel slows chasers.
- A bonus treat appears under the house after 70 and 170 dots for 9.5 s: 100 to 5000 pts by level.
- Three lives, plus one extra at 10,000. Clearing the maze flashes the walls, then starts a faster level.

## Presentation
SVG DOM (`art.ts`). The wall outline is traced from the maze and rounded, and the sprites are built from SVG paths, with motion driven by the simulation clock. Reduced motion removes the berry blink, the sway and bob, the death pop and the fright flashing (shown instead as a steady white outline). Each chaser carries a distinct marking (brows, cheek dots, band, droopy lid) so they can be told apart without colour.
