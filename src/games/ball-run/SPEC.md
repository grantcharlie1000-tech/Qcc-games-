# Ball Run

A perspective 3D endless runner in a black void: elevated indigo road and pale violet grid, tall gridded structures on both sides, glossy magenta ball and block hazards, cyan chevrons and acceleration gates. Three loads only through the existing lazy game module. No new dependency, external asset or shader pipeline.

Drag horizontally on the canvas to choose a continuous lateral position. Hold Left/Right or A/D for continuous steering. There is no jump action or mandatory onscreen directional UI. Ramps supply launch velocity; gravity carries the ball across three-metre gaps to lower landing surfaces. Each 24m section has continuous full-width seams, and every obstacle leaves a navigable center corridor. Narrow sections still permit deliberate steering. The opening 72m introduces rolling, a cyan acceleration zone and a ramp gap before the first obstacle.

Fixed 120Hz simulation; exponential steering integrates analytically. Forward speed rises from 12 to 22m/s, with smooth local boosts of up to 40% in cyan zones. Distance score is floor(metres); best remains the maximum distance. Edge falls and sphere/box collisions end the run.

The game root fills its parent's entire stage. The renderer uses the real canvas aspect at each resize; short/wide displays extend the black scene. Shared shell controls and pause overlay remain parent-owned. The module supplies only its distance/record HUD and start/retry/loss/fallback messages.

Pause/blur/cancel/resize clear input and capture. Restored runs require explicit Continue. v2 saves store absolute terrain elevation for real ramp physics. v1 snapshots preserve seed, distance, best and phase, rebasing their old relative height onto the new course and retaining airborne velocity. The changed terrain is disclosed in Continue text; old airborne state cannot reproduce obsolete jump-course geometry exactly.

The city uses fixed instanced boxes plus one combined grid-line buffer. Road/grid/obstacle/gate buffers are reused. Disposal releases geometry, materials, instances, observers, events, RAF, renderer and context. Missing WebGL shows a visible exit; context loss saves the run and requires exit/re-entry.

Stills support composition, not exact continuous motion or original timing. See TEST_RESULTS.md for actual evidence and limits.
