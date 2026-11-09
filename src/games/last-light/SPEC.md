# Last Light

Original Canvas 2D precision platformer. Forty authored levels span the Old Quarter, Mossworks, Clockworks, Frostline and Afterglow. Reach the gold exit in each level. Conversations, lamps, rescued residents, departure bells, memory routes and the final story choice are optional. None can lock an exit. The opening teaches variable jump height and air dash; later levels combine narrow catches, short hops, braking, collapsing floors, moving platforms, slippery takeoffs, conveyors and pulsing gates.

## Movement and challenge

Run, variable-height jump, wall jump and one air dash, refilled by landing or a blue crystal. Physics runs at 120 Hz with coyote time and buffered jumps. Release direction to brake; holding jump and dashing at the same point cannot serve every crossing. Moving lifts carry horizontally and vertically. Springs launch across their full collision width. Ice reduces friction and belts push. Spikes, moving saws, electrical gates, steam, canal water and the pursuing dark cause checkpoint respawns. R retries with one setback; P pauses.

Three or four stationary flags per level save the furthest reached checkpoint. Safe flags and optional fixtures have broad decks; transit catches are smaller. Timed paired barriers can be read from stable observation ground, including at 320px width. Amber emitters warn before collision returns. Hazard duty and crumble delay are authored per encounter. Crumble faces fracture, shake, shed dust, split into falling textured chunks and rebuild before collision returns. Reduced motion preserves distinct warning, collapse and rebuild states while suppressing decorative motion.

Five escape levels increase base pursuit from 88 to 134 world pixels per second. The dark begins after leaving the safe opening, resets behind the checkpoint and accelerates continuously when far behind, up to 440 pixels per second. It never teleports. The HUD shows the remaining lead and changes colour when close.

## Story on the side

The courier follows their missing sister Mira through a city waiting for dawn. Optional conversations and 120 distinct memory fragments explain the lantern, Mira and the dawn engine. E interacts only when nearby; touch uses the contextual prompt instead of an always-present HELP control. Wheels shut down linked machinery with visible green indicators; players may instead cross the active timed gate. Manual conversations pause until dismissed or movement resumes. Memory pickups save quietly to the journal without opening dialogue.

The primary HUD always says “Reach the exit”. Its compass points to the exit; the section-based map supplies the route through roofs, canals, switchback towers, caves, greenhouses and skywalks. Optional encounters are separated from the main route in the map. J opens the persistent journal, containing only collected memories and actually heard conversations. Map and journal pause play.

Level completion shows time, memories and banked points immediately, with a Next level button. No chapter aftermath or cinematic delays progression. Completing all forty levels shows campaign results first; reading and choosing the story ending is optional and can be left for later. The narrative has two hopeful conclusions.

## World and presentation

Foreground materials and actors share the courier's native pixel scale: shaded faces, layered clothing, occupation props, wood joinery, ceramic caps, damp masonry, riveted iron, bronze and fractured ice. World-space building faces, windows, columns, brackets and pipe risers follow the actual ledges; distant scenery supplies depth. Brick materials cache only small repeating tiles. Walkable deck edges remain brighter than background construction.

Vents originate in bolted grates with rising irregular vapor, rather than horizontal blocks that resemble a ladder. Electrical gates have mounted upper and lower contacts with a rear return arm. Compact pressure regulators replace oversized floating wheels. Composition reserves the foreground silhouettes and travel sweeps of terrain, pickups, hazards, fixtures and actors. Trees and habitat dressing remain sparse to preserve sightlines. The library poster uses the shared isometric voxel generator.

The canvas occupies its own area between HUD and controls. Desktop framing targets a close 360-world-pixel height; short landscape and phone views preserve native pixel aspect. Touch permits simultaneous movement and jump/dash with four persistent controls; optional interaction appears only in context. Decorative movement freezes under reduced motion; mechanical collision timing remains consistent.

## Points and persistence

Each cleared level banks 1,000 + 100 per spark collected there + max(0, 250 − whole active seconds × 2 − setbacks × 25). Later levels cannot remove earlier bonuses. Maximum score: 62,000. Results explain the calculation. Old million-scale leaderboard/local/cloud bests convert to 1,000 per earned level because separate bonuses cannot be recovered from the former sort key; known saved spark bonuses are preserved. Other games are unchanged. Shared server-side score storage has a separately documented backend migration.

Version 2 saves validate level progress, discoveries, encounter IDs, checkpoint index and optional ending. Earlier preview saves preserve level progress and discoveries, including migration away from the obsolete escape lamp requirement. Saves resume only after Continue. A new run asks for confirmation and preserves the personal best. Music, sound, focus, visibility, pause and disposal follow the shared arcade lifecycle.

## Verification approach

Continuous legal-input recordings are replayed independently through the real 120 Hz model for all forty levels, with interaction disabled. Local reachability checks cover main and optional paths; composition checks cover headroom and artwork clearance. A separate bounded policy audit samples a generous repeated full jump and midair dash across different takeoffs and platform phases, including optional shortcuts and ignoring hazards. It checks that precision sections require control changes; it is not an exhaustive proof over all possible techniques. Recorded routes establish playability, not average human completion time. Browser checks exercise actual keyboard events, touch, rendering, overlays, audio and saves.
