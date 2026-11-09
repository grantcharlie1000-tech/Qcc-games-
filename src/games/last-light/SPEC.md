# Last Light

Original Canvas 2D precision platformer. Forty authored levels span the Old Quarter, Mossworks, Clockworks, Frostline and Afterglow. Reach the gold exit in each level. Conversations, lamps, rescued residents, departure bells, memory routes and the final story choice are optional. None can lock an exit. The opening teaches variable jump height and air dash. Level 2 begins with three broad landing decks reachable without a dash; later levels combine narrow catches, short hops, braking, collapsing floors, moving platforms, slippery takeoffs, conveyors and pulsing gates.

## Movement and challenge

Run, variable-height jump, wall jump and one air dash, refilled by landing or a blue crystal. Physics runs at 120 Hz with coyote time and buffered jumps. Release direction to brake; holding jump and dashing at the same point cannot serve every crossing. Moving lifts carry horizontally and vertically. Springs launch across their full collision width. Ice reduces friction and belts push. Spikes, moving saws, electrical gates, steam, canal water and the pursuing dark cause checkpoint respawns. End or R retries with one setback; Delete or P pauses. Arrows move and jump, Right Shift dashes and Enter interacts. Arrow keys and Enter also navigate game menus.

Three or four stationary flags per level save the furthest reached checkpoint. Safe flags and optional fixtures have broad decks; transit catches are smaller. Timed paired barriers can be read from stable observation ground, including at 320px width. Amber emitters warn before collision returns. Hazard duty and crumble delay are authored per encounter. Crumble faces separate along deterministic irregular fractures, shed dust, fall as textured stone chips and rebuild before collision returns. Fractures split the material itself; no crack overlay or equal vertical slices are drawn. Supported spikes and machinery fragment with the floor and stop colliding until it reforms. Reduced motion preserves distinct warning, collapse and rebuild states while suppressing decorative motion.

Five escape levels increase base pursuit from 88 to 134 world pixels per second. The dark begins after leaving the safe opening, resets behind the checkpoint and accelerates continuously when far behind, up to 440 pixels per second. It never teleports. The HUD shows the remaining lead and changes colour when close.

## Story on the side

The courier follows their missing sister Mira through a city waiting for dawn. Optional conversations and 120 distinct memory fragments explain the lantern, Mira and the dawn engine. E interacts only when nearby; touch uses the contextual prompt instead of an always-present HELP control. Wheels shut down linked machinery with visible green indicators; players may instead cross the active timed gate. Manual conversations pause until dismissed or movement resumes. Memory pickups save quietly to the journal without opening dialogue.

The primary HUD shares a single 44px glass row with Games and Menu. It reserves 56px above the canvas on desktop and phone; full level names, timer and score compact according to width. Detailed checkpoint and district information sits in the pause menu. There is no route map or map shortcut. Flags and visible landings guide progression. J or Page Down opens the optional journal, containing only collected memories and actually heard conversations; the journal pauses play.

Level completion shows time, memories and banked points immediately, with a Next level button. No chapter aftermath or cinematic delays progression. Completing all forty levels shows campaign results first; reading and choosing the story ending is optional and can be left for later. The narrative has two hopeful conclusions.

## World and presentation

Foreground materials and actors share the courier's native pixel scale: shaded faces, layered clothing, occupation props, wood joinery, ceramic caps, damp masonry, riveted iron, bronze and fractured ice. World-space building faces, windows, columns, brackets and pipe risers follow the actual ledges; distant scenery supplies depth. Brick materials cache only small repeating tiles. Walkable deck edges remain brighter than background construction.

Vents originate in bolted grates. Vapor thins into a feathered upper plume; after the emitter closes, residual wisps move upward and fade. The dangerous jet ends when the emitter stops, while the small trailing plume is cosmetic. Electrical gates have mounted upper and lower contacts with a rear return arm. Compact pressure regulators replace oversized floating wheels. Older keepers have a shaped grey beard, soft work cap, rust scarf and weathered coat; elders retain a distinct wool-and-shawl silhouette. Residents and decorations retain stable opacity at close range. Composition reserves the foreground silhouettes and travel sweeps of terrain, pickups, hazards, fixtures and actors. Trees and habitat dressing remain sparse to preserve sightlines. The library poster uses the shared isometric voxel generator.

The canvas occupies its own area below the single glass row. Desktop rendering uses integer pixel scaling near a 360-world-pixel height; short landscape and phone views preserve native pixel aspect. Touch permits simultaneous movement and jump/dash with four persistent controls; optional interaction appears only in context. Decorative movement freezes under reduced motion; mechanical collision timing remains consistent.

## Points and persistence

Each cleared level banks 1,000 + 100 per spark collected there + max(0, 250 − whole active seconds × 2 − setbacks × 25). Later levels cannot remove earlier bonuses. Maximum score: 62,000. Results explain the calculation. Old million-scale leaderboard/local/cloud bests convert to 1,000 per earned level because separate bonuses cannot be recovered from the former sort key; known saved spark bonuses are preserved. Other games are unchanged. Shared server-side score storage has a separately documented backend migration.

Version 2 saves validate level progress, discoveries, encounter IDs, checkpoint index and optional ending. Earlier preview saves preserve level progress and discoveries, including migration away from the obsolete escape lamp requirement. Saves resume only after Continue. A new run asks for confirmation and preserves the personal best. Music, sound, focus, visibility, pause and disposal follow the shared arcade lifecycle.

## Verification approach

Continuous legal-input recordings are replayed independently through the real 120 Hz model for all forty levels, with interaction disabled. Local reachability checks cover main and optional paths; composition checks cover headroom and artwork clearance. A separate bounded policy audit samples a generous repeated full jump and midair dash across different takeoffs and platform phases, including optional shortcuts and ignoring hazards. It checks that precision sections require control changes; it is not an exhaustive proof over all possible techniques. Recorded routes establish playability, not average human completion time. Browser checks exercise actual keyboard events, touch, rendering, overlays, audio and saves.

## Death feedback and frame stability

A hit retains the impact pose, briefly separates the courier into lantern-lit fragments, then rekindles the checkpoint under a short transition. The sequence occupies the existing 0.35-second respawn delay; it does not add a gameplay wait or extra setback. Reduced motion uses a restrained dissolve. Supported hazards stop colliding when their floor crumbles.

The render loop changes HUD text and attributes only when their values change. Stable viewport dimensions do not reallocate the canvas or reset its camera, and retries retain the terrain texture cache. Camera look-ahead eases through turns rather than flipping instantly. These reduce unnecessary layout work and respawn hitches without changing the 120 Hz movement simulation.
