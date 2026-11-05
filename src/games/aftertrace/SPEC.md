# AFTERTRACE — original QCC arcade game

**Pitch.** A fast, score-chasing survival game where your recent movement becomes a weapon only when you choose to ignite it.

**Thirty-second loop.** Steer a tiny cyan craft, draw a route, bait the hunters onto it, ignite with PULSE, grab gold sparks to recharge, and find a better route as more enemies spawn. A single pulse can catch several foes for a rising combo bonus. Three hits end the run.

**Rules and balancing (v1).**
- Free movement at 235 logical CSS pixels/second, bounded by a visible perimeter.
- Only the most recent 3.45 seconds of movement are retained as a fading cyan trace; idle players do not generate trails.
- PULSE needs one charge and at least four trace points. It consumes the trace and ignites its exact segments for 0.82 seconds. Maximum charge: two. Passive recharge: 0.145/s. Gold sparks add 0.26 charge and 45 points.
- Pulse eliminations award 90 times the current same-pulse combo, capped at a 5× multiplier. Survival adds 2.5 points per second. Waves increase every 18 seconds, gradually speeding up pursuers and adding weaving drones after wave 3. Enemies cap at 25.
- Three hits to lose. Each hit gives 1.75s grace and clears the current route.
- Keyboard: arrows/WASD; mouse: seek the pointer; mobile: touch/drag anywhere for analog thumbstick; Space or on-screen PULSE for ignition.

**Visual direction.** Midnight-indigo arena with a restrained dot grid, icy-cyan player and unignited route, hot pink ignition, rose enemy ships, golden-energy diamonds. Distinct geometries keep targets legible independent of color. Cover is original vector art, 320×410, no lettering and no borrowed assets.

**Integration.** A lazy-loaded `GameModule` using the existing shell HUD/pause/save lifecycle; no runtime third-party requests, new dependencies or personal-data collection. Uses a deterministic TypeScript simulation, 60 Hz fixed steps, device-pixel-ratio cap of 2, actual CSS-pixel pointer coordinates, and canvas scaling with resize.

**Acceptance.** Keyboard/mouse/touch controls work; pulse requires fuel and a route; no self-harm from traces; enemies can be eliminated with exact line-segment collision; pause/restart/restore are safe; mobile does not scroll or overflow; leaderboard ranks integer best score. Further physical iPhone/Safari QA and database migration approval remain deployment gates.
