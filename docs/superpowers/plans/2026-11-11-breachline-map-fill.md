# Breachline: filling the map

Owner, 2026-11-11: "The map looks empty. Fix that." This plan says why it is empty, what "full" means in numbers,
and how to get there without breaking the game. It was written from a research pass (a Haiku agent, read-only; its
scratch files are not in the repo) and the planner's own knowledge of `map.ts`. The build session for it is the
environment session (Opus 5.5), which owns the art pipeline.

## 1. Why it is empty

1. **The art pass was forbidden to add cover.** Every prop so far was placed on or against collision that already
   existed, "so nothing new reads as cover". That kept gameplay unchanged and left the open floor bare. This rule is
   **withdrawn** for this plan: rooms and yards get real furniture and cover, with collision.
2. **The original layout was sparse.** Three to eight solid objects per area, with 85–98% of every floor uncovered.
3. **Little above the knee or below the ceiling.** Few overhead services, few things on surfaces, plain floors.

Measured from `map.ts` (furniture boxes whose centre is in the area; largest empty rectangle on a 0.25 m grid):

| Emptiest first | Area | Floor m² | Furniture boxes | Per 10 m² | Largest empty rectangle |
| --- | --- | --- | --- | --- | --- |
| 1 | North Yard | 672 | 5 | 0.07 | 49.5 × 5.0 m |
| 2 | East Lane | 260 | 3 | 0.12 | 5.5 × 20.0 m |
| 3 | South Yard | 672 | 8 | 0.12 | 42 × 5.0 m |
| 4 | West Lot | 260 | 4 | 0.15 | 6.5 × 15.5 m |
| 5 | Corridor | 90 | 3 | 0.33 | 30 × 2.2 m |
| 6 | Server Room | 88 | 4 | 0.45 | 11 × 2.0 m |
| 7 | Lobby | 72 | 4 | 0.56 | 5.0 × 5.0 m |
| 8 | Lab (site A) | 80 | 5 | 0.62 | 9.0 × 3.5 m |
| 9 | Office | 63 | 4 | 0.63 | 5.0 × 5.5 m |
| 10 | Break Room | 63 | 4 | 0.63 | 6.0 × 4.2 m |
| 11 | Garage | 72 | 5 | 0.69 | 9.0 × 4.0 m |
| 12 | Archive (site B) | 72 | 5 | 0.69 | 3.5 × 6.5 m |

## 2. What "full" means (targets the build session measures and reports)

| Measure | Now | Target |
| --- | --- | --- |
| Indoor objects with collision, per 10 m² | 0.3–0.7 | **1.4–2.0** |
| Indoor dressing objects without collision (surface, wall, overhead, floor), per 10 m² | about 2 | **8 or more** |
| Largest empty floor rectangle, indoor rooms | up to 9 × 4 m | **no more than 4 × 3 m** outside the two site cores |
| Longest unbroken sight line in the corridor | 30 m | **12 m** |
| Largest empty rectangle, yards and lanes | up to 49.5 × 5 m | **no more than 12 × 5 m** |
| From any doorway, share of the room's floor visible standing | most of it | **no more than about two thirds** |
| Draw calls and triangles per view, High | 209–315, 75–160k | **under 400 and 500k**, unchanged budgets |
| Distinct prop models | 11 of 30 | cap raised to **40**; everything repeated is instanced |
| Download, Low tier | 13.4 MB | no more than **+10 MB** |

Low tier draws every other dressing instance and the same cover (cover is gameplay and never differs by tier).

## 3. Rules for cover (collision). These protect the game.

The planner authorises edits to `map.ts` **for this plan only**, and only as follows:

1. **Additive only.** New `box(...)` lines inside one marked block (`// --- fill pass 2026-11-11 ---`). No existing
   box, room, panel, door, window, spawn, site, post, roam point or lamp is moved, resized or removed. No other core
   file is edited (`world.ts`, `sim.ts`, `state.ts`, `nav.ts`, `bots.ts`, `config.ts`, `index.ts`, `input.ts`,
   `hud.ts`), except one bump of `NET_VERSION` in `net.ts` when the block is complete.
2. **Destruction stays usable.** No new collision within **0.75 m of any destructible panel face, door or window
   opening**, at any height: panels must stay shootable, breachable and reinforceable from both sides. Cover goes
   against solid walls and piers, or stands free in the open floor.
3. **Movement stays open.** At least **1.2 m** of clear width on every route between doors, at least **1.8 m** along
   the corridor, nothing within 1.5 m of the corridor side of a doorway, nothing that turns a route into a dead end.
4. **Objectives, spawns and bot points stay clear.** A clear 2.5 × 2.5 m core at each site's plant spot; 3 m clear
   round every attack spawn and 1 m round every defend spawn; 1 m clear round every defender post, roam point and
   reinforce point (`map.ts` about lines 185–205).
5. **Two heights, mixed.** Waist-high (0.9–1.1 m: desks, low cabinets, crates, pallet stacks, planters) can be shot
   and seen over when standing; full-height (1.8 m or more: lockers, bookcases, racks, vending machines, dumpsters
   on end) blocks sight. Each room gets both. Nothing between 1.2 and 1.7 m (it reads ambiguously).
6. **Break the long looks.** In each room the new pieces must cut the longest sight line from each doorway. In the
   corridor, two full-height stubs at piers on alternating sides (about 0.6 m deep, 1.2 m long) plus two waist-high
   pieces make a chicane without closing the lane. Outdoors, an attacker crossing from a spawn to any entrance must
   pass cover at least every 8–10 m.
7. **Fair to both sides.** No addition may give a defender a new protected angle onto an attack spawn, or leave an
   attacker's approach with less cover from the windows than it has now. Check each window's view of each spawn.
8. **Collision equals what is drawn.** Each cover box is filled by a model fitted to it (within 3 cm), never an
   invisible volume and never a model larger than its box. Fences that can be seen through are boundary dressing
   only, placed where nobody walks, never across a route.

Nav facts to respect (`nav.ts`): 0.5 m grid, agent radius 0.2 m; a solid box with top above 0.3 m and bottom below
1.78 m blocks cells; wall proximity raises path cost. Overhead and under-knee dressing must be `solid=false`.

## 4. Rules for dressing (no collision)

- **On surfaces:** every desk, counter, shelf, bench and table carries things suited to the room (monitors, keyboards,
  paper trays, mugs, lab glassware, tools, folders, a plant). No bare tops.
- **On solid walls and piers only** (never on destructible panels): notice and white boards, signs, clocks, shelves,
  conduit, switch boxes, vents, radiators, hooks with coats, fire kit, framed prints, AC units; outside: downpipes,
  cable runs, wall lights, signage, meter boxes, vents.
- **Overhead, top at or below 2.9 m, clear of the light fittings:** cable trays, ducts, pipes, sprinklers, hanging
  signs, smoke detectors, a ceiling tile out with cables showing.
- **Under the knee (below 0.3 m):** rugs and mats, floor boxes and cable covers, papers and debris near sites,
  stains and wear paths, markings and manhole covers outside, kerbs, weeds along wall bases, puddles.
- **Outdoors, off the routes:** lamp posts, bollards, bins, cones, planters with shrubs, a gate and fence along the
  boundary, stacked materials; and the skyline: the flat coloured blocks beyond the wall get window grids, roof
  plant and a second, hazier row behind.

## 5. Where the objects come from

In order of preference, all through the existing pipeline (fetch, licence check, decimate, bake down, KTX2, credit
line into `public/THIRD_PARTY_NOTICES.txt`, manifest entry):

1. **Scanned or artist-made models, decimated:** Poly Haven (CC0: barrels, tyres, tool chest, generator, pipes and
   ducts, plants, street lamp, crates) and the Patch library's Amazon Berkeley Objects (`abo:` ids, CC-BY: desks,
   chairs, bookcases, sofas, tables, cabinets; real product models, usually 30–140k triangles, so decimate to about
   1.5–4k for repeated items and bake the detail). SimReady (CC-BY) for pallets and industrial items.
2. **Code-built and instanced with a real material set**, as the Archive boxes were, for simple regular things:
   lockers, shelving, cabinets, cable trays, ducts, fences, bollards, planters, kerbs, signs.
3. **Not to be used:** flat-coloured low-poly kits (Kenney, KayKit, and Patch's `polyfork:` models unless one passes
   a visual check beside our rooms; they are 300–1,000 triangles with vertex colours and were ruled out for the
   van), and any object over budget after decimation.

Leads from the research (ids on Patch): `abo:B07GFWF2GM` desk, `abo:B075Z7SQND` bookcase, `abo:B01FK3FWNG` desk,
`polyhaven:Barrel_01`, `polyhaven:old_tyre`, `simready:pallet_block_b03`, `polyhaven:modular_industrial_pipes_01`,
`polyhaven:modular_airduct_circular_01`, `polyhaven:metal_tool_chest`, `polyhaven:portable_generator`,
`polyhaven:potted_plant_04`, `polyhaven:weed_plant_02`, `polyhaven:street_lamp_01`, `polyhaven:side_table_tall_01`.
No chair under 30k triangles was found: decimate an `abo:` task chair hard and bake, or build one in code.

## 6. Area by area (starting points; the build session adjusts to the rules and reports what it placed)

C = cover with collision, D = dressing without.

| Area | C | D |
| --- | --- | --- |
| Corridor | 2 full-height stubs at piers on alternating sides; 2 waist-high pieces (a filing run, a trolley of boxes) | cable tray and pipe run overhead its full length; hanging room signs; bins; wear path; one ceiling tile out |
| Lobby | a second seating group with a low table; a tall display or vending unit on a solid wall; a planter run as waist-high cover | rug; plants; leaflet rack; desk clutter; hanging sign; mat |
| Office | 2 more desk pods in the open centre with low screens between them; a tall cabinet run on a solid wall | monitors, keyboards, trays and chairs at every desk; rug; whiteboard notes; coats; bins |
| Archive (site B) | 2 short shelving stubs at right angles to the lane, staggered; a map chest (waist-high) | rolling steps; trolley; ceiling tray; stacked boxes on the floor by the shelves |
| Server Room | 2 low equipment crates or UPS units off the aisles; one tall cabinet on a solid wall | floor cable covers; overhead trays joined across aisles; warning signs; a crash cart |
| Lab (site A) | an island bench piece and 2 tall storage cabinets on solid walls, keeping the site core open | glassware, instruments, monitors on every counter; fume-hood ducting overhead; stools; floor tape |
| Break Room | a second table group; a tall vending or fridge unit on a solid wall | counter clutter; bins; notice board; mat |
| Garage | 2 pallet stacks and 2 barrel clusters; a tall shelving bay on a solid wall | tyres, jacks, hoses, oil stains, hanging lights, a creeper |
| South Yard | 2 dumpsters or skips, 3 pallet stacks, 2 barrel clusters, a low planter wall, a parked trailer or second vehicle | bollards, cones, lamp posts, weeds, puddles, markings, wall services, boundary fence and gate |
| North Yard | 2 skips, 3 pallet or material stacks, a low wall, a generator on a plinth | as South Yard |
| West Lot | 1 skip, 2 material stacks, a low wall | bollards, bins, lamp post, markings |
| East Lane | 3 staggered pieces down its length (bins store, material stack, skip) | cones, weeds, wall services, lamp |

## 7. Order of work and gates

**Phase A: greybox the cover (gameplay first).**
1. Add every C piece to `map.ts` as plain boxes in the marked block. No art yet.
2. Add tests (new file under `tests/games/breachline/`): every rule in section 3 that can be checked from data
   (panel, door and window clearance; route width; spawn, site, post, roam and reinforce clearance; nothing between
   1.2 and 1.7 m; every attack spawn can path to both sites and through every door; corridor sight line no more than
   12 m; largest empty rectangle per area within target). Run the existing nav, bot, sim and online tests, and
   several seeds of bot-only rounds to check no bot stalls.
3. Produce **one top-down plan image** of the whole map, before and after, showing walls, panels, doors, windows,
   old boxes, new boxes (waist-high and full-height in different colours), spawns, sites, posts, and the longest
   sight lines; plus the section 2 table filled in. Push it and message the planner. **Gate: the planner approves
   the greybox before any cover is given art.** Do not wait idle: go straight on to Phase C while waiting.

**Phase B: art for the cover.** Fit a model to each approved box; bump `NET_VERSION` once; rebake.

**Phase C: dressing, emptiest first:** corridor, Lobby, Office, the Archive lane, South Yard, North Yard, West Lot,
East Lane, Server Room, Break Room, Lab, Garage. This absorbs the small-objects and floors work already under way.
Evidence per area: the same bookmark before and after, 960 px.

**Phase D: budgets and tiers.** Draw calls, triangles and download per view on High and Low against section 2;
`warm.spec.ts` still passes (nothing compiles or uploads in play); the online test passes three times alone.

## 8. How it is judged

By the section 2 numbers, the tests, and the owner's eye on the before/after frames: does each room look used, and
does each yard look like somewhere? Scores on the stricter scale should reach 7 in every area. If a rule in
section 3 and a target in section 2 conflict anywhere, the rule wins and the conflict is reported.

## 9. Risks

- New cover changes how rounds play; that is intended, but it is why the greybox gate exists.
- A box in front of a panel can make it unreachable for breach or reinforcement (`nav.ts` about lines 61–71).
- Bots path through fixed points (`bots.ts` about lines 63–76); a box on one stalls them.
- Decimated product scans can look melted; reject and fall back to code-built pieces rather than ship them.
- Draw calls: everything repeated must be instanced, and the distance culling already in place must cover the new
  props.
