# Ball Run

An endless 3D downhill precision runner. A striped pink sphere rolls automatically down a floating neon road. Steer around orange cuboid obstacles and jump the yellow-striped gaps. Travel distance is the score. Collision or falling ends the run; retry starts immediately with a fresh deterministic seed. Best distance persists through the parent shell.

## Controls and states

Start rolling explicitly starts the simulation. Arrows / A-D steer; Space / Up / W jumps. Native direction buttons support pointer holds and keyboard holds; drag on the canvas steers relative to drag origin at all CSS scales. Jump is an explicit touch button. Releasing, blurring, pausing or disposing clears held input. Ready / running / over are the run states. Parent pause stops RAF and physics; restart resets even while paused. A restored running snapshot waits for Continue rolling. No gameplay occurs behind dialogs.

## Course guarantees

Distance is measured along a forward coordinate; rendered z is its negative. The surface descends at 0.16 vertical units per forward unit. Every section is 24 units. A smooth sum of two sine curves supplies continuous centerlines, with derivative bounded by 0.041 units per forward unit. Width narrows from 6 to a minimum of 4.8. The ball radius is 0.38. Cross-section support allows a small visual overhang but requires the center within half-width minus 0.133.

Sections 2, 6, 10, … contain a 3-unit gap at local distance 17–20. The preceding 4 units carry wide yellow warning strips. Sections 4, 8, 12, … contain a 0.96 × 0.95 × 0.96 block at local distance 12, offset ±1.5 from the center. Seed chooses the side. Sections 0 and 1 provide a full safe starting stretch. Hazard sections alternate with 24-unit recovery sections. Obstacles and gaps never share a section. The center route always clears blocks with 0.64 extra lateral clearance beyond the sphere. Adjacent curves require far less lateral speed than available steering.

Speed increases from 12 to a capped 22 units/s. Jump impulse is 7.6 units/s and gravity is 20 units/s² in the descending surface frame, producing 0.76 seconds of flight and 1.444 units of elevation above grounded height. At minimum speed a jump travels 9.12 units; launching 3 units before a gap clears its 6-unit approach-plus-gap distance. At maximum speed the same launch lands before the next hazard. Deterministic tests drive the center route for 1200 metres across four seeds, including all intervening gaps.

## Physics and collision

Simulation uses fixed 1/120-second steps and a bounded display-time accumulator. Lateral velocity approaches input × 6 exponentially, using the analytical integral so steering is independent of display refresh rate. Vertical motion integrates constant gravity. Landing requires descending from above the surface; balls below an edge cannot snap back onto the road. Falling 7 units below the surface ends the run. Sphere–box collision uses squared nearest-axis distances and a swept forward interval. Maximum movement per physics step is 0.184, below ball radius and obstacle depth, avoiding tunnelling.

## Rendering and lifecycle

Three.js is imported only inside the lazy game module. The scene uses a perspective camera, rotation tied to ball travel, fog, flat unlit road geometry and lit low-poly ball/blocks. The camera follows the current descent; lateral sway is disabled with reduced motion. No shadows, postprocessing, textures or external calls. Four track instance pools plus one obstacle pool recycle transforms, with a fixed 112 road slices and 9 obstacle slots. Shared sphere, torus, box and cone geometry: four GPU geometries and nine draw calls measured in Chromium. Relative coordinates avoid rendering precision loss during long runs. DPR is capped at 1.5.

Dispose cancels RAF, aborts DOM listeners, disconnects ResizeObserver, disposes all owned geometry/material/instance buffers, disposes the renderer and releases its WebGL context. No WebGL 2 produces a visible explanatory fallback and library link. Context interruption stops simulation, saves, and explains reopening. Sound goes through the parent, whose default is muted.

## Persistence

Version 1 snapshots serialize seed, run counter, phase, distance, lateral position/velocity, vertical position/velocity, grounded status, elapsed time, best and loss reason. Restore checks object shape, finite bounded numbers, integer identifiers, phase, grounded consistency and best-distance consistency, then copies only accepted fields. The parent owns storage and calls restore once. No local game storage.

## Art

The original replacement SVG illustrates the actual striped ball, cyan/magenta descending track, orange block and warning-marked gaps. viewBox is 0 0 320 410; y < 95 stays empty for the shell title. The parent is applying a final common cover redesign after integration, per its latest direction.
