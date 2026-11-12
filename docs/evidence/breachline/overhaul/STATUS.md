# Breachline visual overhaul: status

Plan: `docs/superpowers/plans/2026-11-11-breachline-visual-overhaul.md`. Branch: `claude/zen-allen-otdlt6`.

## For the planner (latest first)

**2026-11-12: the specs on a production build (authorised `index.ts` line 437 change).** The hook is installed when
`import.meta.env.DEV || import.meta.env.VITE_BREACHLINE_TEST === '1'`; `scripts/breachline-assets/hookcheck.mjs`
proves it: a normal `npm run build` has `__breachlineTest` in no chunk (PASS), a `VITE_BREACHLINE_TEST=1` build has it
(PASS). Against the flagged build served by `serve-built.mjs`:
- `warm.spec.ts`: passes (nothing compiles or uploads in play); the stock-fighters variant fails as known.
- **Online test: passed three times in a row** (1.1 to 1.2 min each), no pulls during the runs. So the earlier
  flakiness was the dev server, not the game.
- `play.spec.ts`: all six fail on one assertion only, "no console errors": seven 404s, six for `hero/ar5`
  textures (the weapons rebuild, mid-way) and one for `/.netlify/functions/chat`. The dev server answers a missing
  file with `index.html` (200), so the same specs pass there. Every other check in them passed. They will pass on the
  build once the AR-5 textures land and the chat call is answered or excluded; neither is mine.

**2026-11-12: production build checked (`npm run build`, served by `scripts/serve-built.mjs` with the real headers).**
Script: `scripts/breachline-assets/builtcheck.mjs --tier low|high` (policy violations, failed requests, console).
- **Security policy:** no violations on either tier. The KTX2 transcoder's workers (`basis/`, same origin) start
  under `worker-src 'self'` and textures transcode.
- **404s:** mine: one, `tex/Cardboard004/diff-256.ktx2` (the archive boxes asked a texture set for a prop size on
  Low; JPEG fallback hid it); fixed in this commit. Not mine: `hero/ar5/{diff,nor,arm}` at every size (the weapons
  rebuild has pushed `hero/ar5/mesh.bin` but not its textures; the game keeps the procedural AR-5 and warns), and
  `/.netlify/functions/chat` (site chat; no function locally).
- **Not runnable on the build:** every Breachline browser test (`warm.spec`, `play.spec`, the online test) waits
  for `window.__breachlineTest`, which `index.ts` installs only when `import.meta.env.DEV` (line 437). The online
  test against the build times out on that hook. I have not touched `index.ts`. A suggestion for its owner: install
  the hook also when the build is made with a test flag (for example `VITE_BREACHLINE_TEST=1`), so CI can run the
  same specs against a production bundle without shipping the hook to players.
- **Sizes:** the Breachline chunk `assets/index-*.js` is 703.6 kB (258 kB gzip); Three.js is a shared 604 kB chunk;
  1.89 MB of JavaScript in all on the game page. Art downloaded on opening the game: Low 22.94 MB (bakes 2.27,
  models 10.9, textures 0.97, transcoder 2.41, Patch fighters 4.14, hero 2.25), High 55.09 MB (textures 28.62,
  bakes 4.45, hero 4.57; the rest as Low).

**2026-11-12: Phase D (budgets and tiers) and the cosmetic event stream (7f42220).**
- High, all 20 bookmarks: 135 to 354 draw calls and 69k to 262k triangles (budget under 400 and 500k).
- Low: the run hit its time limit after 4 bookmarks (lab views: 107 to 228 calls, 72k to 240k triangles, each at or
  below its High figure); the other 16 were not measured.
- Download, Low tier: 18.74 MB (budget 13.4 + 10 = 23.4 MB).
- `warm.spec.ts`: passes (nothing compiles or uploads in play); the stock-fighters variant fails as known.
- Online test alone: passed, passed, failed, passed, passed. The failure was in a run during which I pulled other
  sessions' commits into the working tree (the dev server reloads); the two runs after it passed. Honest count: four
  of five, three in a row not yet shown without that interruption.
- `scene.onCosmetic(fn)` for the sound code: impact (material, power), glass crack and shatter, set-piece damaged and
  wrecked, a body at rest, reinforce and barricade start, unfold, anchor and break.

**2026-11-12: Phase B complete (all 46 fill pieces plus the two old sofas), generator, clean shader steel, blood polish.**
`phaseb/triples/{island,deskpod,mapchest,benchboxes,tableset,sideboard,generator,stub,trolleyboxes,sofa}.png`,
`mapfill/shots/blood-2.png`.
- **The last ten pieces:** lab island benches (epoxy top, laminate doors and drawers both sides, gas tap, bottles; then
  broken bottles and spill; then the top cracked through and dropped, a door hanging, a drawer on the floor), office desk
  pods (two desks across a fabric screen, monitors, keyboards, mugs, pedestals; cracked screens and a holed screen; a
  corner collapsed onto a broken leg, a monitor face down, the screen leaning), the Archive map chest (eight drawers
  with brass pulls and card holders; drawers out, then the top split along its grain and plans fanned on the floor),
  the corridor bench with boxes (slats split along the grain, the stack collapsed), the Break Room table set (table and
  four chairs; split top, a chair down) and sideboard (a door off, the top split, kettle and mugs on the floor), the
  shelving stub (the rack family) and the trolley of boxes (the trolley family). The room dressing skips them.
- **Timber:** true splits along the grain (a dark crack with pale fresh wood along both lips and splinters across it)
  and rounds that burst pale splinters out round a dark hole.
- **Generator:** rebuilt as an enclosed set on a plinth (fuel-tank base, louvred doors with handles and hinges, control
  window, hazard labels, exhaust with rain cap); damage punctures and dents, then a door torn off on the engine, louvres
  stove in, the exhaust bent over, oil from the base.
- **Shader steel:** clean, even paint everywhere it is used (skip, bin store, generator, cabinets): the all-over speckle,
  scratches and floor grime are gone; wear stays at edges, more at the base.
- **Sofa tears:** larger, with a darker slit and the flaps visible.
- **Blood:** the pool has an irregular outline with runnels along floor joints, a darker centre, a thin dried rim, a wet
  highlight and drops round it, and it spreads from where the ragdoll comes to rest; spray is larger (a dense core and a
  mist, some back out of the entry); spatter behind is hand-sized with satellite drops and comes from body shots as well
  as head shots. Honest note: the evidence frames catch the spatter and the pool but not the spray burst, which is over
  before the frame is captured.
- Tests: unit 5403 passed (rebaked Lab, Corridor, Office, Archive, Break Room, Garage). Next: Phase D.

**2026-11-12: Phase B, sofa and steel redone to the reviewer's exact spec (7ad7bf0 and this commit).**
`phaseb/owner-before-after.png` and every `phaseb/triples/<family>.png` re-rendered (three 640 px frames each).
- **Seating:** the chesterfield is gone (sofa_02 removed from the assets). Code-built modern office seating: boxy
  upholstered frame, two rounded seat and two back cushions with a little sag, piped seam along each seat front, slim
  steel legs, mid teal-grey with the shader's weave; the Lobby's second seat is a pair of armchairs from the same set.
  Damage is the fabric torn: slits with flaps peeled back and yellowed foam bulging out; wrecked, a leg is gone so the
  frame leans, a gashed seat cushion lies on the floor, scorched cloth by an arm, foam crumbs. I did not search Patch.
- **Painted steel:** lockers are clean, even grey-blue paint (linear albedo about 0.3, soft sheen, no texture grime);
  their gaps, louvres, label plates and handles are modelled. The code-built cabinets match them (louvres, label
  holder, handle and lock, hinge barrels, plinth); damage is punctures with bright torn rims and shallow dents, then a
  door torn off and lying in front with the insides showing (shelf, hook, a bag), another door sprung, the side
  buckled. The room dressing now skips set pieces, so each draws itself in all three states (that also lets filing
  runs, the vending machines and the low table show their own damage).
- Not yet to this standard: the code shader's steel on the skip, generator and bin store still carries its speckle
  and floor grime; timber splits along the grain are splinters and holes rather than true splits.
- Tests: unit and Breachline tests pass after the Lobby and Break Room rebake.

**2026-11-12: Phase B, reviewer's three corrections applied (sofa as the pattern, then every pushed family).**
`phaseb/owner-before-after.png` (redone) and `phaseb/triples/<family>.png`, now three 640 px frames stacked.
- **Mid-tones:** the sofa's near-black leather (linear albedo about 0.005) is built as grey (`greyscale` in the
  manifest, contrast eased so it does not blotch) and coloured a mid brown; the buttoning and piping read. The lockers'
  metal-plate set (dark blue, linear 0.018, 0.045, 0.071) is lifted per channel to a mid grey-green near 0.2. Honest
  note: the plate set's grime shows strongly on the lockers; they read as worn, used steel rather than clean paint.
  No plainer modern sofa exists on Poly Haven; I have not searched Patch for one yet.
- **States that change the object:** sofa (stuffing bursting through tears; wrecked: it leans on a broken leg, a seat
  cushion is on the floor, the back is split along its top). Crates (holes ringed with splinters; wrecked: the top
  crate smashed into a heap of boards with its tins and straw spilled, a bottom crate's side stove in). Drums (holes
  leaking in streams into a spreading pool; wrecked: one crushed to half height and split, one on its side). Shelving
  (stock knocked down; wrecked: the rack leans on a buckled upright, cartons burst across the floor). Low walls
  (spalled lumps; wrecked: a barrier shunted out of line, the next one's end broken off with rebar showing).
- **Rebuilt in code:** the vending machine (red body round an open bay, rows of drinks on coils behind glass, keypad,
  display, coin slot, lit header; cracked glass; then the glass gone, rows emptied onto the floor, the header dark), the
  display case (aluminium frame, wooden back, glass shelves of trophies and boxed kit; cracked; then shards and fallen
  contents), the skip (deep ribs, box-section rim, a dirt band and a heap of timber, plasterboard, rubble and bags above
  the rim; holes, then a stove-in side and a bent rim), the trailer (a ridged tarp extruded along the bed with straps
  over it; tears showing crates, then the back slumped and flaps hanging), the planter (foliage clusters; cracks; then a
  broken corner and spilled soil).
- **Server racks:** their photo texture is back (the art layer draws their boxes again); only the damage is drawn
  over it: holes, then a unit torn half out, cables hanging, debris.
- Still weak: the generator (a flat green panel), the trolley and the filing run read but are plain; desk pods and
  the other seven unmodelled pieces are next, then the blood corrections, then Phase D.
- Tests: unit 5403 passed; Breachline browser 8 passed plus the expected stock warm failure; online passed alone.

**2026-11-12: Phase B, set pieces with three damage states (first piece), and the owner's steel, fabric and sofa.**
`phaseb/owner-before-after.png` (the three things the owner named) and `phaseb/triples/<family>.png` (intact,
damaged, wrecked). 38 set pieces in 18 families now have art and three states (`render/setpieces.ts`,
`render/setpiecemodels.ts`); collision is unchanged and a test holds every state, model and code part inside its box
within 3 cm (only flat litter lies outside). States follow rounds and blasts from the shared `shot` and `boom` events;
a change throws debris that stays; everything resets at preparation; bullet marks on a set piece land on the visible
model surface by a cosmetic ray test, with the piece's material.
- **Sofa and fabric:** the green block sofas are now Poly Haven's `sofa_02` (CC0, tufted leather, seat and back
  cushions, rolled arms, turned legs), scaled into each box: two facing across the Lobby table, one in the Break Room.
  Damage adds tears with stuffing showing, then a cushion and stuffing on the floor. The tears read as pale specks at
  range; that wants a better overlay.
- **Steel:** the lockers were painted with the plaster set (it read as chalk); they now use the metal-plate set as
  semi-gloss paint, with its seams, scratches and worn edges and a highlight that moves. Code-built steel pieces get a
  surface shader: orange-peel paint, edge wear to bright metal, scratches and a moving highlight.
- **Built from CC0 models (good):** shelving (worn steel rack and a carton), crate stacks, drum clusters, materials
  drops (cement bags on a pallet, compost sacks), low walls (precast barriers), bin stores (sacks). In their damaged and
  wrecked states, models swap (a crate shoved askew, a drum on its side, the top bags gone) and code debris is added.
- **Built in code, passable:** pallets (real slats, blocks and boards), filing, trolley, bin-store enclosure, generator.
- **Built in code, still weak (next piece):** vending machine and display case (flat glass fronts), skip (reads as a
  cut-out), trailer (a box under a tarp), planter, and the server racks. The racks are honestly worse than before: the
  old photo texture had more detail than my code rack, so the next piece restores the texture and draws only the damage
  (with a rebake).
- **Not done:** desk pods, island benches, table set, sideboard, map chest, trolley of boxes, bench with boxes (8 of 46).
- **Blood pool:** it now waits for the body to come to rest (`bodies()[i].still` from the ragdoll; 1.2 s for fighters
  without one) and spreads at the pelvis. Your three blood corrections are next after the weak families.
- Tests: unit 5404 passed; Breachline browser 7 passed plus the expected stock warm failure. The online test failed
  once in the batch run at 59 s and passed alone (1.1 min); Phase D runs it three times alone.

**2026-11-12: section 10.2, window glass.** `mapfill/shots/glass.png` (intact, one round, two rounds; zoom below): a pane
outside each of the eleven barricaded windows in the brick shell (`render/glass.ts`, one instanced sheet and one
instanced jagged rim). The first round through a pane leaves a crack star; the second, or any blast within 5 m,
shatters it: the pane goes, a jagged rim stays in the frame, shards fly out along the shot and stay. Glass never stops
a round or changes sight; it is driven by the `shot` and `boom` events, so every client sees the same, and resets at
each round's preparation. The light square in the frames is the hole the same rounds broke in the barricade behind.
Not done in 10.2 yet: Lobby entrance glazing and door vision panels (the doors are open frames with no leaf to hold
one), monitors and screens going dark, shot light fittings, breakable bottles, boxes, bins, plants, tyres and drums;
these arrive with their dressing in Phase B.

**2026-11-12: section 12.1, blood in the world.** `mapfill/shots/blood.png`: hits in the leg, the chest and the head
(spray along the bullet; spatter and a drip on the wall behind the head shot), then the body down and its pool
spreading; bottom row `?blood=off` (dust and dark scuffs). From the shared events only: the shooter's last `shot` rays
are kept, and on `hit` the nearest point on them to the victim's body (the head on a head hit) is where the round
went in. A cosmetic trace 3 m on from there puts spatter on the first wall, panel cell (it goes with the cell),
furniture or floor, stretched at a grazing angle, with drips on a wall. On `kill` a pool spreads over 5 s under where
the body comes to rest, its size limited by short traces to walls and furniture. Pools are pooled (24), marks share the
256 decal pool, both warmed at load (`warm.spec.ts` passes). The atlas gained spatter, drip, scuff and pool cells.
Next: window glass (10.2).

**2026-11-11: section 10.1, bullet marks by material.** `mapfill/shots/marks-by-material.png` (a burst into each, then
the marks): one pooled decal mesh now draws a mark per material from an atlas (`makeMarks` in `textures.ts`: crater
for plaster and concrete, brick pock, timber splinter hole, fabric tear, ceramic star crack, glass crack, earth divot,
ceiling-tile punch), tinted per instance, with chips per material (none for fabric and earth, which puff). What was
hit is read by `render/surfacehit.ts` (tested): the ground and ceiling by what covers them there (asphalt and grass,
tiles, carpet, boards, ceiling tile), boxes by material, brick by which side of the shell (indoors it is painted
block). Marks on dressed furniture and room floors sit on the visible face. Read on the sheet: asphalt, brick, carpet
(faint), ceiling, fabric (faint), painted block, plasterboard, steel scars, tile; timber's frame missed its crate and
is to redo. Still no marks on modelled props and dressing (rounds pass through them; no collision). Next: window glass
(10.2).

**2026-11-11: greybox revision 2 (plan section 11) for your gate.** `mapfill/greybox-plan-2.png`, every set piece
labelled. 46 hand-placed boxes replace the search's 83; the search is retired (the rule checker stays). 0 rule
breaches; routes, heights and the corridor exception tested. Layout intent per area and the misses are in "Map fill,
Phase A, revision 2" below. Every art region rebaked.

**2026-11-11: map fill C, first pass done in every area.** `mapfill/rooms/server-break-lab-garage.png`: Server Room
floor cable covers, trays joined across the aisles, warning signs, a crash cart; Break Room fruit bowl, cups, pedal
bin, door mat; Lab fume-hood ducting and hazard tape round the site core; Garage tyres, trolley jack, hose, oil
stains, hanging lights, a creeper. Views: 167-315 draw calls, 68-202k triangles (High budget 400 and 500k). Waiting on
the greybox gate for Phase B (art for the cover, one `NET_VERSION` bump); then Phase D (budgets per tier).

**2026-11-11: map fill C, the yards.** `mapfill/rooms/yards.png` (South Yard, bays, North Yard, West Lot): lamp posts
every 12 m along the perimeter with arms over the yard, downpipes at the building's corners and between openings, a
wall light over each outside door, weed tufts along the foot of the perimeter, puddles, manhole covers and cones. No
collision. Yard views 64-314 draw calls. Next: Server Room, Break Room, Lab, Garage.

**2026-11-11: map fill C, Lobby, Office, Archive lane.** `mapfill/rooms/lobby-office-archive.png` (greybox cover in
its procedural look plus the new dressing): Lobby rug, two plants in the solid corners, a leaflet rack on the west
wall; Office rug, coat stand and coats on hooks; Archive boxes stacked on the floor by the runs, a cable tray over the
lane, a rolling step. The greybox desks and tables pick up the rooms' surface clutter already. Next: the yards.

**2026-11-11: map fill C, corridor, and dressing on destructible walls.** `mapfill/corridor/c1.png` (corridor before
and after: pipe run on hangers, hanging double-sided room signs at every doorway, trunking and emergency lights on
the solid headers above the panels, bins at posts, a clock) and `c2-panel-decor.png`. Because nothing may hang on a
destructible wall as an object, soft-wall panels now carry their own dressing in their geometry (`panelDecor` in
`levelmesh.ts`): skirting and a dado rail per cell column, and on each face now and then a noticeboard with sheets, a
poster, a framed print or a whiteboard, plus sockets and a switch. Each piece is tinted board (same texture and baked
light, no extra material or draw call) and is drawn only while every cell under it is intact, so it goes with the
board. This dresses every soft wall on the map at once. Next: the Lobby, Office and Archive lane.

**2026-11-11: map fill, Phase A greybox ready for your gate.** `mapfill/greybox-plan.png` (before above, after
below). 83 new cover boxes in the marked block in `map.ts` (additive only; nothing existing touched), placed by a
rule-checked search (`scripts/breachline-assets/mapfill-place.ts`) and tested (`tests/games/breachline/mapfill.test.ts`).
Section 3 rules: 0 breaches. Indoors 1.38-1.53 objects per 10 m² (target 1.4-2.0; Lab 1.38) and every room within
the 4 x 3 m empty-floor target; yards within 12 x 5 m except the North Yard. Two conflicts where the rule won (below):
the corridor gets no cover, and the North Yard keeps a long strip. `NET_VERSION` not bumped yet (one bump after your
approval, with the art). Going on to Phase C dressing (corridor first) while you look.

**2026-11-11: calmer floors.** `rooms/server/round-2/floors.png` (Server Room, Break Room): the raised floor is the
ceramic set laid square at 600 mm in a cool grey; the Break Room's black-and-white chequer is a warm terrazzo. Both
reuse texture sets already shipped (no new download); both rooms rebaked for the new bounce. Next: small-object models.

**2026-11-11: covered car's tarpaulin lifted.** `rooms/yard/round-2/tarpaulin.png` (South Yard, Garage): a per-model
colour lift (`PROP_TINT` in `artworld.ts`) takes the scan's near-black cover to a dark grey-green, so the folds read
in daylight and indoors. The ground under it already carries the bake's occlusion from the car (it is an occluder in
the bake); I did not add a separate contact decal. Next: small-object models and calmer floors.

**2026-11-11: destructible panels batched.** `render/panelbatch.ts`: every whole, unreinforced panel is split by its
material groups and merged into one mesh per material; a panel leaves the batch (and draws alone) when it is damaged,
reinforced or gone, and only the batches it was in are rebuilt, at that moment. Of 59 panels, 47 start whole. Draw
calls: Lab 221 -> 209, corridor 346 -> 315, Archive 314 -> 281, South Yard 322 -> 296, West Lot 325 -> 285; the
breach and shot-wall views render as before. Next: small-object models, calmer floors, the tarpaulin.

**2026-11-11: East Lane done; no procedural area is left.** `rooms/outdoors/round-1/east.png` (before, after): an
outdoor art region (`east`) with drains, drums against the concrete block, cans and a military crate on the crate.
230 draw calls. No core files touched. Next: batching the destructible panels' draw calls.

**2026-11-11: West Lot and North Yard done, and the draw-call budget restored.** `rooms/outdoors/round-1/round1.png`:
West Lot before and after, the West Lot car, the North Yard. Both are outdoor art regions (sun, sky, half density)
with the South Yard's kit; the West Lot van is a covered car (`NET_VERSION` `breachline-4`). With eleven art regions
the outdoor views had reached 470-541 draw calls (High budget 400): every room's dressing drew from outside. Each
room's dressing now hides beyond 10 m of the room, and props beyond 22 m (small) or 45 m (large): outdoor views are
245-325, rooms 221-346. Also fixed: bakes stored prop probes by list position, so adding props elsewhere had left the
South Yard's props with the wrong light; probes are now keyed by placement, with a test.

**2026-11-11: second round, the Garage (lowest by my reading) done.** `rooms/garage/round-1/round1.png`: before,
after, the north wall and the pegboard close. Baked art region with six fittings; the box van is a covered car
(collision cut to the model, `NET_VERSION` `breachline-3`); workbench cabinetry with the tool chest on it;
roller-door housing and guide rails on the west opening; pegboard of tools and a wall shelf with cans and boxes;
drums, jerrycans and the military crate on existing collision. Next lowest by my reading: the West Lot and North
Yard (still procedural outdoors), then the East Lane.

**2026-11-11: Break Room round 1 done; every room has now had a round.** `rooms/break/round-1/round1.png`: before,
after, the kitchen run and the table. Baked art region with four warm-white fittings; the kitchen run has cabinet
doors and drawers, a sink and tap, kettle, microwave and coffee machine, wall cabinets over it; the fridge has doors
and handles; four chairs and mugs at the table; clock, poster and skirting. Next: a second round on the lowest-scoring
area (by my reading, the yard's West Lot and North Yard, which are still procedural, then the Garage).

**2026-11-11: Office round 1 done.** `rooms/office/round-1/round1.png`: before, after, a workstation, and closer.
Baked art region with four neutral fittings; each desk is a workstation (monitor on a stand, keyboard, mouse,
papers, a mug, a task chair pulled out, a bin); drawer fronts on the filing cabinet; whiteboard with marks, clock and
skirting on the south wall. Next: the Break Room.

**2026-11-11: Lobby round 1 done.** `rooms/lobby/round-1/round1.png`: before (procedural), after, the desk's
public front and the desk close. Baked art region with four warm fittings; the reception desk has panelled fronts,
a ledge and kick plate, the receptionist's monitor, keyboard, phone and papers; entrance mat and exit sign at the
south door; wall TV, noticeboard, clock, skirting, sofa cushion joints, an extinguisher. Next: the Office.

**2026-11-11: Server Room round 1 done.** `rooms/server/round-1/round1.png`: top row the aisle before (procedural)
and after, bottom row the old bookmark and a rack face close. It is now an art region (baked, eight cold troffers
over the aisles). The racks are dressed on both faces: posts, black and silver 1U-4U equipment with green and amber
status lights, patch panels with looms, blanking plates, dark steel end panels with grilles; a cable tray on drop
rods over each run; wall AC unit with its pipe run, skirting, fire panel, extinguisher. Next: the Lobby.

**2026-11-11: yard step 3b (containers and crate) done.** `rooms/yard/round-1/step3b.png`: the yard, the car, a
container's door end, the crate stack. Containers have raised corrugation ribs, top and bottom rails, corner posts,
door leaves with four locking bars and handles, and rust runs; the crate box has edge and cross battens. Next: one
round each on the Server Room, Lobby, Office and Break Room.

**2026-11-11: yard step 3a (vehicle, perimeter wall, first dressing) done.** `rooms/yard/round-1/step3a.png`.
The box van is now Poly Haven's `covered_car` (a CC0 photoscan under a dust cover); its collision box was cut to the
model (1.42 m tall, was 2 m) and `NET_VERSION` bumped to `breachline-2`. The perimeter is precast panels
(`preconcrete_wall_001`) on a footing, with a coping and joints every 4 m. Military crates, jerrycans and drums
stand on or against existing collision. Next: containers, then the crate box.

**2026-11-11: yard step 4 (readability) done.** Both squads at the South Yard spawn against the perimeter
(`rooms/yard/round-1/step4.png`, two halves from one pose). The blue squad vanished into the dark wall; the wall is now
pale precast and the bake's sky is brighter, and both read. Next: step 3, dressing.
Then, on the reviewer's note (yard about 5, too dark overall): the sun is now late afternoon (about 38 degrees up,
was 24), less orange, with an afternoon sky dome; full rebake (17 min). The ground is mid-grey and walls in shade
read. `step4.png` is now four views: the two yard bookmarks, then the two squads. Step 3 starts with the vehicle.

**2026-11-11 ~15:10 UTC: Archive round 2 started, Patch boxes tried and backed out (nothing shipped).**
- **Pipeline (kept, committed):**
  - `fetch.mjs --add-patch ID` takes a Patch model's `web` GLB over HTTPS. It accepts only CC0 or CC-BY and nothing
    AI-generated, checks the file against Patch's SHA-256, keeps Patch's credit line, and unpacks the GLB into
    `.gltf` + `.bin` + images. The binary is compacted to the geometry, so images don't ride along: 14 MB -> 148 KB.
  - The build writes a manifest asset's `credit` (plus our `changes`) into the notices.
  - Two optional per-asset settings: `lod2`, a crude level with borders free (335 triangles for the box), and
    `greyscale`, which turns a colour map grey so one texture set can be tinted per instance.
- **`simready:box_paper_office_burgundy_a01` (CC-BY, 2,318 triangles) didn't work in the Archive:**
  1. The shelving is a solid collision box whose front face is drawn, so a real-depth box sits inside it and is
     hidden. I drew each box as a slab a few centimetres deep, standing just proud of the face.
  2. At about 130 slots, even the 1,658-triangle level costs 310k triangles in view. The 335-triangle crude level
     breaks the UVs; using models in a third of the slots costs 177k.
  3. The box's front reads as a dark face (a dark interior with a coloured rim) whatever the tint, the greyscale
     remap or the orientation. I suspect the asset's front is its open side. Turning it Z-up made it black.
- **Decision:** the Archive keeps its previous dressing. The box asset is removed from the manifest and from
  `public/`, so nothing extra ships and no credit is owed.
- **Next for the Archive:** a different box. A simple closed archive box modelled in code (lid line, hand-hole,
  label slot) drawn instanced would be cheaper than any of these and fits the shelf faces.

**2026-11-11 ~14:20 UTC: the Patch soldiers are the default.** In `scene.ts`:
- `createPatchFighters` by default (it falls back to the stock fighters if an asset fails to load);
  `?fighters=stock` keeps the old ones;
- `?weapons=patch` is opt-in for `createPatchViewmodel`; the default viewmodel is unchanged;
- the scene's warm-up calls whichever fighters and viewmodel are in use (`fighters.warm`, `viewmodel.warm`).

Credits for the Tactical soldier, steel helmet, call headset and protective eyewear are added to
`public/THIRD_PARTY_NOTICES.txt` verbatim from the Patch records (`docs/evidence/breachline/patch-trial/STATUS.md`),
each with our changes stated (CC BY 4.0).

`warm.spec.ts` now has two tests:
- the default (Patch soldiers), unmarked: **passes**, with programs and textures unchanged through the first
  firefight with a breach;
- `?fighters=stock`, marked `test.fail` as the known late upload of level-0 textures.

Results:
- Breachline browser suite (one worker): 9 passed (the stock warm run counted as the expected failure).
- Online test alone on the new default: **3 of 3 passed**.
- Unit tests: 97/97.

**2026-11-11 ~13:30 UTC: `?fighters=patch` switch.** In `scene.ts`; the default is unchanged. The scene's
warm-up already calls `fighters.warm()`, so the Patch module's own warm-up runs behind the menu the same way.
- `warm.spec` with `?fighters=patch` (expected-failure mark removed for the check): **passes**. Programs and
  textures are unchanged through the first firefight, because the Patch module uploads its maps itself. Without
  the switch it still fails only on the stock fighters' +3 textures (still marked as an expected failure).
- Online test with `?fighters=patch`: passed twice. Without: passes (suite 9/9, warm.spec counted as expected).
- Budgets, Lab bookmarks on High (one or two soldiers in view): +1 draw call, +4.8k triangles, +6 programs
  (124 -> 125 calls, 74.7k -> 79.6k triangles; Lab-west 136 -> 137, 92.1k -> 96.9k). Well inside 400 calls and
  500k triangles. The bookmark script takes `FIGHTERS=patch`.
- **The jump to `#/collection/28` is not an error.** That is Breachline's canonical address: the shell
  (`src/main.ts` ~line 369, `entryHash`) rewrites `#/game/breachline` to `#/collection/28` and keeps the game
  running. The one failure I saw right after adding the import was Vite re-optimising its dependencies and
  reloading the page (first load after a new import in dev only).

**2026-11-11 ~10:55 UTC: warm-up wired in; count test added.** The scene now warms everything behind the menu,
in order, and then sets `stats().ready`:
1. the art (as before);
2. `viewmodel.warm()` (retried until its assets are in);
3. `await fighters.warm(renderer, camera)`;
4. one compile and one draw of the whole scene into a small HDR target, with every combat-only object shown for it:
   the effects' flash sprites, the gadgets (charges, uplink, grenades, pulse ring; these were the lambert and basic
   programs new in play), and a tiny triangle per wall material a damaged panel can show (an intact wall draws only
   its face, so the cut-edge, cavity, stud and plank shaders used to compile at the first hole).

New test `tests/games/breachline/warm.spec.ts` waits for `ready`, records `programs` and `textures`, runs gunfire
into a wall, a breach charge and point-blank fire at an enemy, then compares. Programs are now unchanged (they rose
by 2 before this). Textures still rise by 3: the fighters' level-0 baked set (2048 BC7 + 2 x 1024 ASTC). Their
`warm()` compiles those programs, but `compileAsync` does not upload textures. I've asked the fighters session to
`renderer.initTexture` each map in `warm()`. Until then the test is marked `test.fail` with that reason, so it
flags itself as soon as the fix lands. Hole geometry: the rebuild runs once per damage change, not per frame
(`PanelView.sync` compares the panel's damage version); it creates and disposes a geometry each time, so the
geometry count is level and only small buffers upload. Suite: Breachline unit tests 96/96; browser tests plus
online test, one worker: 9 passed (warm.spec counted as an expected failure).

**2026-11-11 ~10:30 UTC: cause of the first-firefight stall.** Method: the real online spec with a 100 ms
`setInterval` gap monitor on both pages, plus `renderer.info` and a wrapper that records every GL texture/buffer
upload, between "round in action" and "4 s after the host's first hit". (`stats()` now also reports `programs`,
`textures` and `geometries`, for the acceptance check.) In that window, on **both** pages:
1. **One new shader program: a `Sprite` material, the muzzle flash.** The weapon viewmodel's flash
   (`render/hero/viewmodel.ts:61-62`) and the fighters' muzzle flash are hidden until the first shot, and
   `compile()` skips invisible objects, so the program is built on the first shot. The sun sprite does not cover it
   (different settings: fog off, not tone-mapped).
   -> **hero and fighters:** build the flash materials at load and compile them once (draw them once at scale ~0, or
   give them identical settings to an already-visible sprite), so no `Sprite` program appears in play.
2. **Three texture uploads: 2048x2048 sRGB BC7 + two 1024x1024 ASTC.** That is a fighter's level-0 baked set
   (`render/fighters/textures.ts`: diff, nor, arm). The fighters build a level's mesh and material on first use
   (`render/fighters/index.ts:103-110`, `meshFor`), so the first time an enemy comes within level-0 range (the
   host stepping in front of the guest), the page builds geometry, makes a new material and uploads ~10 MB of
   textures in one frame. The fighters' first `update` costs 0.3-1.1 s of script time here.
   -> **fighters:** build every level's geometry, mesh and material at load (time-sliced), and `renderer.initTexture`
   each map one per task, before the round starts. `meshFor` should never create anything during play.
3. **~16 buffer uploads**: the wall-hole geometry rebuilt when panels take damage (mine; small, by design).
4. **Post-processing targets reallocated** (mine, `render/post.ts` `setSize` -> `build()`): the resolution scaler
   changes the drawing size, which rebuilt the HDR buffer and the whole bloom chain. **Fixed:** the targets are now
   allocated at the largest size seen (+10%) and drawn into a viewport; every read is clamped to the area in use.
   Scale changes no longer allocate. Lab renders on High (scale 1, MSAA) and Low (scale 0.6) look unchanged.
5. **No lights are added or removed when firing** (checked: only the hemisphere and key lights in `scene.ts` and
   the viewmodel's own three, all permanent).
- Gaps: in my container the longest guest gap was 6.0 s, at the guest's first burst; the online test passes alone
  and in the sequence. Your 17.6 s is the same first-use work on a slower or busier machine.
- A program is also added the first time the corridor is seen on High (lab 46, corridor 47). Not identified yet:
  the names and truncated cache keys I logged don't separate it. Still open.
- The bookmark script now waits for the art to be live (`stats().art`), not a fixed 6 s; the warm-up can take
  longer than that under software GL.
- **Frame cost now vs the Lab gate** (bookmarks, this container): High Lab 113 calls / 73k tris (gate: 78 / 83k);
  corridor 184 / 83k; Archive 179 / 82k; programs 45-46, textures 110-114, geometries 174-208. Low: 93-156 calls,
  67k-83k tris, 39-40 programs, 76-80 textures. Growth: draw calls from the dressing (the corridor and Archive have
  about 20 dressing materials each; merging by material on High is next) and from the textured fighters and weapon;
  triangles are flat thanks to the LODs.

## Current phase: Lab vertical slice (after phase 0; see the plan's "Re-ordering after phase 0")

Weapons, hands and fighters (rows E and F, phases 6 and 7) now belong to the hero session (`render/hero/`,
`docs/evidence/breachline/hero/`). This session supplies its lighting through `HeroLighting`. Next here: Lab lighting
contrast and modelled fixtures, visible specular, post chain basics, dense Lab props; then KTX2 and the phase-1
renderer work, measured against section 5.

**Where I am (keep current):** map fill Phases A to D done (Low per-view measure and a clean three-in-a-row online run outstanding); waiting for the planner's next order.

## Map fill, Phase A, revision 2 (`mapfill/greybox-plan-2.png`, 960 px)

Hand-placed set pieces from the section 11 kit, each named in a trailing comment in `map.ts` and labelled in the image;
the tests judge them. 46 boxes. The checker learnt two things: a gap between two pieces with a wall panel or a third
solid thing in it is not a way through, and the corridor's three pieces follow 11.6 (no more than 1.4 x 0.5 x 1.0 m,
flush to the panels, 2 m from doorways, 6 m apart, at least 2 m of lane; a test routes to the room side of every
panel they stand against).

- **Garage:** a working bay round the parked car: a shelving bay against the brick beside the car, a drum cluster
  against its flank, two crate stacks and an equipment crate in a row across the floor, so the roller door and the
  corridor door do not see each other straight across.
- **Lab (site A):** the two benches become islands (a waist-high return on each), and one tall storage cabinet stands
  on the brick west of the windows; the plant core stays open and readable from both doors.
- **Server Room:** a network cabinet on the north brick and a UPS cabinet on the east brick between the window and the
  crate, a waist-high UPS unit off the aisles; the two aisles stay clear.
- **Corridor:** a filing run, a bench with boxes and a trolley on alternating sides about 9 m apart; it stays a long
  lane with three places to duck.
- **Lobby:** a second seating group (sofa and low table) facing the first, a vending machine and a display case on the
  brick, a planter at the entrance and a planter run splitting the floor between the desk and the door.
- **Office:** two desk pods split the floor so neither door sees across to the other, and a cabinet run stands on the
  brick west of the window.
- **Archive (site B):** a map chest off the long run, a shelving stub against the short run, a trolley of boxes by the
  reading table; the plant core stays open.
- **Break Room:** a second table set, a vending machine beside the fridge, a sideboard under the south wall.
- **South Yard:** a skip on the walk to the lobby door, a pallet stack group and a planter on the flanks, a materials
  drop beside the spawn and a bin store in the corner: cover every 8-10 m from the spawn to each entrance.
- **North Yard:** a parked trailer in the middle, a skip and a pallet stack group on the walks to the north door and
  windows, a low wall to the west, a generator on its plinth and a materials drop near the spawn.
- **West Lot:** a pallet stack group against the container, a skip beside the car, and a low wall across the walk from
  the spawn to the garage door.
- **East Lane:** a bin store at the wall, a materials drop and a skip staggered down the lane.

| Area | Floor m² | Furniture boxes | Per 10 m² | Largest empty rectangle | Within target |
| --- | --- | --- | --- | --- | --- |
| Garage | 72 | 9 | 1.25 | 7.25 x 1.25 m | yes |
| Lab | 80 | 8 | 1 | 8.75 x 2.50 m | yes |
| Server Room | 88 | 7 | 0.8 | 7.25 x 2.25 m | yes |
| Corridor | 90 | 6 | 0.67 | 28.50 x 1.50 m | yes |
| Lobby | 72 | 10 | 1.39 | 3.25 x 4.75 m | no |
| Office | 63 | 7 | 1.11 | 6.75 x 2.00 m | yes |
| Archive | 72 | 8 | 1.11 | 2.50 x 4.25 m | yes |
| Break Room | 63 | 7 | 1.11 | 5.75 x 3.25 m | no |
| South Yard | 672 | 13 | 0.19 | 27.00 x 4.25 m | yes |
| North Yard | 672 | 11 | 0.16 | 24.00 x 6.50 m | no |
| West Lot | 260 | 7 | 0.27 | 5.00 x 20.00 m | no |
| East Lane | 260 | 6 | 0.23 | 3.50 x 17.50 m | yes |

- **Misses (rule won):** the Lobby and the Break Room keep one open area each (the roam points need 1 m and their
  doors need clear approaches); the North Yard keeps the strip under its windows; the West Lot's long open run is the
  attack spawn's 3 m ring. Indoor density is 0.8-1.39 per 10 m² against 1.4: the hand layout keeps rooms walkable rather
  than packing them.
- **Tests:** mapfill suite 7 passed (baseline intact, rules, heights, routes, corridor-panel reach, empty floor as
  reported, corridor sight line); nav, bots, sim, world and net unchanged and passing.

## Map fill, Phase A: greybox (`mapfill/greybox-plan.png`, 960 px)

- **How it was placed.** For each area, emptiest first, a search proposes cover pieces on a 0.25 m grid (0.5 m
  outdoors) plus positions flush with existing walls and furniture, keeps only those that pass every section 3 rule
  that can be checked from data, and greedily takes the one that most shrinks the area's largest empty rectangle until
  the targets are met. Sizes: indoors full-height 1.0 x 0.6 / 0.75 x 0.55 m at 2.0 m, waist-high 1.4 x 0.7 / 1.0 x 1.0
  m at 1.0 m; outdoors skips 2.4 x 1.4 m at 1.9 m, pallet stacks 1.2 x 1.2 m and low walls 3.0 x 0.5 m at 1.0 m. At most
  about a third of each area's new pieces are full-height, and every room gets both heights. A new piece touches walls
  and at most one other piece (no chains). After each pick, every attack spawn must still route to both sites and to
  both sides of every door, or the pick is banned. Lines and points that the existing world, sim, net and bot tests
  probe are kept clear, so those tests still test what they were written for.
- **Rules checked from data** (`tests/games/breachline/mapfill.ts`): baseline boxes unchanged and in order (against
  a snapshot taken before the pass); 0.75 m from every destructible panel, door and window; no squeeze under 1.2 m
  that is a way through (gaps closed at one end, nooks, are allowed; corner gaps under 0.6 m are squeezes); corridor
  1.8 m and 1.5 m from its doorways; site cores 2.5 x 2.5 m clear; 3 m round attack spawns, 1 m round defend spawns,
  posts, roam and reinforce points; heights only 0.9-1.1 or 1.8+; routes from every attack spawn to both sites and both
  sides of every door. Not checked from data: rule 7 (fairness at windows) and the two-thirds doorway view; judge
  from the plan image.

| Area | Floor m² | Furniture boxes | Per 10 m² | Largest empty rectangle | Within target |
| --- | --- | --- | --- | --- | --- |
| Garage | 72 | 11 | 1.53 | 6.75 x 1.25 m | yes |
| Lab | 80 | 11 | 1.38 | 5.00 x 2.50 m | yes |
| Server Room | 88 | 13 | 1.48 | 8.50 x 1.00 m | yes |
| Corridor | 90 | 3 | 0.33 | 28.50 x 2.00 m | yes |
| Lobby | 72 | 11 | 1.53 | 1.75 x 5.25 m | yes |
| Office | 63 | 9 | 1.43 | 7.00 x 1.25 m | yes |
| Archive | 72 | 11 | 1.53 | 7.00 x 1.25 m | yes |
| Break Room | 63 | 9 | 1.43 | 5.00 x 2.50 m | yes |
| South Yard | 672 | 24 | 0.36 | 18.75 x 5.00 m | yes |
| North Yard | 672 | 21 | 0.31 | 52.25 x 2.25 m | no |
| West Lot | 260 | 8 | 0.31 | 3.75 x 14.75 m | yes |

- **Conflicts (rule won).**
  1. *Corridor:* both corridor walls are destructible panels end to end. Rule 2 (0.75 m from every panel) leaves a
     1.5 m band down the middle, and any piece in it leaves less than rule 3's 1.8 m of lane. So no stubs or
     waist-high pieces: the corridor sight line stays 30 m (target 12). Options for you: allow corridor pieces at
     the posts with less clearance, or accept dressing only (overhead services, signs, bins) there.
  2. *North Yard:* a 12 x 5 m empty rectangle remains (the measure's largest strip runs 52 x 2.25 m along the
     perimeter). Its middle is the north windows' field and the spawn's 3 m ring; more pieces there either breach the
     window clearance or stack along the perimeter where they do nothing.
  3. *Lab* reaches 1.38 per 10 m², just under 1.4: posts, defend spawns, the site core and three test probes fill it.
- **Tests:** the new mapfill suite (6) passes; the existing nav, bot, sim, world and online unit tests pass unchanged.
  Every art region was rebaked for the new faces.
- **Not yet:** `NET_VERSION` (one bump with Phase B art, after approval); art for the boxes (they draw as the
  procedural look of their material for now).


## West Lot and North Yard (`rooms/outdoors/round-1/round1.png`, 960 px)

- **Regions:** `west` and `north`, outdoor (`OUTDOOR` in `levelgeo.ts`: half density, `dressYard`); baked in about a
  minute each; bookmarks `west-car` and `north-yard`.
- **Collision:** the West Lot van box is (-22.945, 5.56)-(-21.155, 9.94), 1.42 m tall, for `covered_car`;
  `NET_VERSION` `breachline-4`. Nav, bot and online tests pass.
- **Dressing:** drains (now filtered per region), kerbs where grass meets asphalt; drums, jerrycans and a wooden
  military crate on existing collision.
- **Draw calls:** measured per region by hiding each one's meshes in turn (`?artdbg=world` now also exposes the
  scenes as `__blScenes`). Interior dressing was about 113 calls from the West Lot and props about 114. Fixes:
  `ArtWorld.cull(eye)` hides a room's dressing beyond 10 m of its rectangle; every prop gains an empty LOD level at
  22 m (radius < 0.8 m) or 45 m. Result: West Lot 325, North Yard 245, South Yard 322, corridor 346, Archive 314,
  Lab 221.
- **Probe keys:** bakes now store `propKeys` beside `props`, and the art reads probes by key (older bakes by
  position); a test checks every prop in a room has its probe. The yard was rebaked.
- **Still wrong:** destructible panels are one draw call each (60-116 in view); the East Lane is procedural.
- Tests: unit 5386 passed; Breachline browser 8 passed (stock warm run expected to fail); online 1 passed.


## Garage (`rooms/garage/round-1/round1.png`, 960 px)

- **Region:** `room('Garage', 'garage')`; fixtures `garage` (six troffers; four left it dim behind the car); baked
  in 6.5 min; bookmarks `garage` and `garage-wall`.
- **Collision:** the Garage van box is now (-12.59, -9.345)-(-8.21, -7.555), 1.42 m tall, to match `covered_car`
  (`replaces`); `NET_VERSION` `breachline-3`. Nav, bot and online tests pass.
- **Dressing** (`dressGarage`): workbench cabinetry (the Lab's `cabinetry`) with `metal_tool_chest` on it; a coil
  housing over the west opening and guide rails down both sides; a pegboard with hanging tools; a wall shelf on
  brackets with cans and boxes; skirting; drums, jerrycans and `old_military_crate` on the corner crate.
- **Budget:** 130-136 draw calls, 72-78k triangles.
- **Still wrong:** the slab floor reads mottled and dirty rather than painted garage concrete; no oil stains, bay
  lines or a door control box beyond the red button.
- Tests: unit 5385 passed; Breachline browser 8 passed (stock warm run expected to fail); online 1 passed.


## Break Room, round 1 (`rooms/break/round-1/round1.png`, 960 px)

- **Region:** `room('Break Room', 'break')`; fixtures `break` (four warm-white troffers); baked in 3.7 min;
  bookmarks `break-room` and `break-kitchen`.
- **Dressing** (`dressBreak`): kitchen run on the east wall with doors, drawer line, handles and kick plate; a sink
  and tap, kettle, microwave (with its door glass) and coffee machine on the worktop; wall cabinets over it; the
  steel box is a fridge (two doors, long handles, grille); four chairs (open and low) round the table, mugs and a
  paper; clock, poster and skirting on the solid walls.
- **Budget:** 100-149 draw calls, 52-62k triangles.
- **Still wrong:** the poster reuses the Lab's safety sign; the microwave and kettle are plain blocks; the wall
  cabinets' handles are too small to read from across the room.
- Tests: unit 5385 passed; Breachline browser 8 passed (stock warm run expected to fail); online 1 passed.


## Office, round 1 (`rooms/office/round-1/round1.png`, 960 px)

- **Region:** `room('Office', 'office')`; fixtures `office` (four neutral troffers); baked in 4.8 min; bookmarks
  `office` and `office-desk`.
- **Dressing** (`workstation` and `dressOffice`): per desk, the user's side is the open one; monitor on a stand
  facing them, keyboard, mouse, two paper stacks, a mug, a five-star task chair (low and open, not cover) and a
  bin. Filing cabinet drawer fronts (`filing`). South wall: whiteboard with frame, pen tray and marks; a clock;
  skirting.
- **Found and fixed:** monitors and chairs read pale: detail pieces take the light of the surface they stand on
  (an up-facing desk top or floor), so their vertical faces are over-lit; their tints are set darker to match.
  A per-face light for detail is the proper fix (noted for later).
- **Budget:** 170-177 draw calls, 78-87k triangles.
- **Still wrong:** chairs are blocky; no cables, desk phones or pinboards on the soft walls (kept off destructible
  panels on purpose).
- Tests: unit 5385 passed; Breachline browser 8 passed (stock warm run expected to fail).


## Lobby, round 1 (`rooms/lobby/round-1/round1.png`, 960 px)

- **Region:** `room('Lobby', 'lobby')`; fixtures `lobby` (four warm troffers); baked in 2.8 min; bookmarks `lobby`
  and `lobby-desk`.
- **Dressing** (`dressLobby`): desk fronts in panels with a kick plate and an oversailing ledge (both runs); monitor,
  keyboard, phone and a paper tray for the receptionist; an entrance mat inside the south door, an exit sign over
  it, a wall TV; on the west wall a noticeboard with sheets and a clock; skirting on the solid walls; cushion
  joints on the sofa; an extinguisher by the entrance. Nothing on destructible walls.
- **Found and fixed:** the monitor's back read white (same reflection as the server kit): desk electronics use
  `chassis`.
- **Budget:** 110-162 draw calls, 53-72k triangles.
- **Still wrong:** the TV screen reads as a flat blue panel; no plants (Poly Haven's are 70-96k triangles); the desk
  body is the dark wood box with light fronts, a bit two-tone.
- Tests: unit 5385 passed; Breachline browser 8 passed (stock warm run expected to fail).


## Server Room, round 1 (`rooms/server/round-1/round1.png`, 960 px)

- **Region:** `room('Server Room', 'server')` in `REGIONS`; fixtures `server` (eight troffers, cold white); baked
  in 5.6 min; new bookmarks `server-aisle` and `server-rack`.
- **Dressing** (`dressServer` in `render/labdress.ts`): per rack face, bay posts and rails, a column of equipment
  from 1U to 4U (mostly black, one in five silver), drive bays or vents, two or three status lights (new emissive
  `led` and `ledAmber`), patch panels (ports and a blue loom), blanking plates; end panels in dark steel with a vent
  grille. Over each run a cable tray with a cable loom on drop rods. North wall: AC unit, pipe run, skirting, fire
  panel. An extinguisher by the east wall.
- **Found and fixed:** equipment first read pale grey (a 0.45 roughness reflected the white ceiling), so it has
  its own rough `chassis` material; rack ends read as concrete pillars (the room's light trim), so they got panels.
- **Budget:** 202-252 draw calls, 140-160k triangles in the room views (the rack dressing is the bulk).
- **Still wrong:** the raised floor is the procedural texture (no tile edges or lifting holes in a real set); the
  equipment is boxes without front detail at close range; no cable runs between racks at the floor.
- Tests: unit 5385 passed; Breachline browser 8 passed (stock warm run expected to fail).


## The yard, step 3b: containers and crate (`rooms/yard/round-1/step3b.png`, 960 px)

- **Containers** (`levelmesh.ts`, every container on the map): ribs every 0.3 m on both long sides (outward face
  and ends only), rails top and bottom, corner posts, and at one end the leaves' meeting line, four locking bars
  and their handles. Nothing stands more than 3 cm proud of the collision box. The procedural texture gained rust
  runs from the top rail and a scabbed band low down.
- **Crate box:** battens on all twelve edges (proud of the sides only, so the military crate on top still sits on the
  lid) and a cross batten round the middle.
- **Budget:** yard views 99-257 draw calls, 62-122k triangles (the busiest is the wide south view).
- **Still wrong:** no container numbers or placards (needs a decal texture); the military crate and the jerrycans
  read dark from the north (shade side); the West Lot and North Yard are not art regions yet.
- Tests: unit 5385 passed; Breachline browser 8 passed (the stock warm run is the expected failure).


## The yard, step 3a: vehicle, perimeter, dressing (`rooms/yard/round-1/step3a.png`, 960 px)

- **Vehicle:** Patch's vans and trucks are flat-coloured low-poly (about 1.5k triangles, no textures), which the
  reviewer ruled out. Poly Haven `covered_car` (CC0, 12.6k triangles, 4.38 x 1.79 x 1.41 m) replaces the South
  Yard van. `map.ts`: that box is now (5.11, 14.26)-(9.49, 16.04), 1.42 m tall, to match the model; `NET_VERSION`
  is `breachline-2`. Nav, bot and online tests pass. A `replaces` flag on a placement makes the art layer leave the
  box's own faces out (`emitLevel(L, art)`); the procedural level still draws them where art is not loaded. The West
  Lot and Garage vans are untouched (not art regions yet).
- **Prop probes:** a prop's light probe was 0.4 m above its base, which is inside a car or a drum, so they rendered
  black. The baker now puts each probe just above the model's own top.
- **Perimeter:** a new `precast` surface (Poly Haven `preconcrete_wall_001`, one 4 m panel per repeat) on a darker
  footing, a coping that oversails both faces, and a dark joint every 4 m. The procedural fallback paints a joint.
- **Dressing:** `wooden_military_crate` on the stacked crate, `old_military_crate` and a jerrycan on the steel bin,
  two jerrycans by the crate, drums against the perimeter by the west container and in the east corner.
- **Budget:** 11 prop models (cap 30); download low tier 13.4 MB (was 8.5), High extra 33.6 MB; yard views 35-253
  draw calls, 21-108k triangles.
- **Still wrong:** the containers (flat sides, no door bars, corner posts or numbers); the crate box under the
  military crate is the old procedural box; the wall scan reads a little cream and its tie-hole pattern repeats.
- Tests: unit 5385 passed; Breachline browser 8 passed (the stock warm run is the expected failure); online 1 passed.


## The yard, step 4: readability (`rooms/yard/round-1/step4.png`, 960 px)

- **Check:** a full squad of Patch soldiers at the South Yard spawn, about 7 m away, against the perimeter wall;
  left squad 0 (Azure, blue-grey camouflage), right squad 1 (tan). New bookmarks `yard-squad-0` and `yard-squad-1`
  (seed 2 puts each squad's attack there, in rounds 2 and 4). The squads never share the yard at prep and the
  bots don't bring defenders out in the first minute, so the frame is two halves from the same pose, not one shot.
- **Found:** the perimeter (`concrete`, a floor texture on a wall) was a dark mottled grey at about the same value
  as squad 0's camouflage, so the blue squad dissolved into it; the tan squad read.
- **Fixed:** `concrete` is now pale precast (tint 1.55, 3 m tile; the baker takes the albedo from it, so bounce
  rises too), and the bake's sky is stronger (`BAKE_SKY` default 1.9 -> 3.2) so walls in the sun's shadow are not
  black. Both squads now read as dark and mid figures on a light wall.
- **Still wrong (for step 3):** the wall texture is a noisy floor scan with no panel joints or coping, and it ends
  in a hard line at the sky; the sun disc sits in the south-facing view. Tan camouflage on a brownish mottle is
  readable but weaker than the blue on it.
- **Afternoon sun (reviewer):** `SUN` raised to about 38 degrees, `SUN_COLOR` [1.6, 1.32, 0.98], `SKY` a
  little brighter, sky dome re-graded from dusk to afternoon; the scene's sun now uses `SUN_COLOR`. Every region
  rebaked; Lab and Archive checked (unchanged indoors).
- Tests: unit 5385 passed; Breachline browser 8 passed (the stock warm run is the expected failure); online 1 passed.

## The yard, steps 1-2 (`rooms/yard/round-1/step2.png`, 960 px)

- **Step 1, sun and sky in the bake.** `bake.ts` now adds the scene's evening sun (`SUN`, `SUN_COLOR` from
  `lightbake.ts`, shadowed by a ray) to every point's direct light. Every bounce and probe ray that escapes upward
  sees the sky (`SKY`, brighter towards the zenith). Strengths are `BAKE_SUN` 1.6 and `BAKE_SKY` 1.9. Indoors the
  roof shields both, so only openings let them in; the indoor rooms aren't re-baked yet.
- **Step 2, the region and its surfaces.** The South Yard is an art region (`room('South Yard', 'yard')`, baked at
  half density: 99k texels, 51 s). Poly Haven CC0 sets, credited by the build:
  - `asphalt_02`: the yard ground;
  - `concrete_floor_02`: concrete boxes and slab;
  - `red_brick_03`: the building's brick skin;
  - `aerial_grass_rock`: the grass verges.
- **Dressing:** road paint has its own worn `line` surface, so the bay lines read on the asphalt. Concrete kerbs
  run round the grass verges, and five drain grates (frame, slats, dark pit) sit in the asphalt.
- **Budget:** yard views are 62-242 draw calls and 32-93k triangles. Download: low tier 8.5 MB, High extra 25.5 MB.
- **Next:** step 4, readability. The perimeter wall reads very dark in its own shadow, and the soldiers need to
  separate from it. Then step 3, dressing (crates, jerrycans, barrels).

## The yard: plan

The yard has had no art pass and is still the procedural look. Making it an art region is bigger than a room:
1. **Sky and sun in the bake.** `bake.ts` only knows ceiling fittings. The yard needs a sun term (the scene's
   `SUN` direction, shadowed by `occluded`) and a sky dome term (cosine-weighted samples over the upper
   hemisphere, open sky only), plus the existing bounces. Without that, any outdoor region bakes black.
2. **Region and surfaces.** A `room('Yard', 'yard')` region over the south yard and west lot (the open ground
   faces only), with an asphalt or concrete set (Poly Haven CC0, e.g. `asphalt_02`, `concrete_floor_worn_001`),
   painted bay lines as decals, kerbs and drains as dressing.
3. **Dressing.** Poly Haven crates (`old_military_crate`, `wooden_military_crate`), `metal_jerrycan_green`,
   barrels, all placed against or on existing collision boxes so nothing new reads as cover. The container and
   vehicle get dressing on their faces (doors, ribs, rust).
4. **Readability.** Enough sky light that a dark figure separates from the walls: a brighter sky term and a lifted
   floor bounce, checked with a soldier in frame (`FIGHTERS` default is the Patch soldiers).
Cost estimate: step 1 is a few hours of bake work plus about 10 minutes per re-bake; steps 2-4 are like a room
round each.

## Kit leftovers (no new evidence)

- **Reinforcement deploy:** the plate now rises in the first half of the action, folded to a third of its width, then
  unfolds sideways across the wall about its middle. When the simulation sets the wall reinforced, the anchors fire:
  sparks and a puff of dust at each anchor shoe, floor and ceiling. Still not captured in evidence (bots only).
- **Barricade debris:** a broken barricade now also leaves long flat shards of plank on the floor (they stay for the
  round), beside the existing splinters.
- **Frag scorch:** in place since grenade round 1 (`Effects.blast`, a floor soot mark scaled by power). A close-up
  of it is still owed.

## Corridor round 4 (`rooms/corridor/round-4/`, 960 px)

- **Radiators:** panel radiators in four bays, clear of the doorways, standing on the floor just off the wall (7 cm
  deep, too slim to read as cover), with 16 vertical convector fins, two feet and a valve.
- **Cameras:** Poly Haven `security_camera_01` (CC0, Alexander Otterbeck and Yann Kervran) high on each end post,
  watching down the corridor. They are props, so the corridor was re-baked (522 s) for their occlusion and light
  probes. Credited by the build.
- **Limits:** the plasterboard walls are destructible panels with no baked faces, so nothing can be mounted on them
  (no notice boards). Bulky floor items (benches, trolleys) would read as cover the simulation doesn't have, so
  they're left out.
- **Budget (corridor view, High):** 209 draw calls (round 3: 200), 95k triangles (86k). Download: low tier
  6.18 MB, High extra 16.05 MB.
- Corridor (mine, strict scale): D 6 -> 6.5.

## Archive round 2 (`rooms/archive/round-2/`, 960 px)

The flat card boxes are replaced by a code-built archive box (`render/archivebox.ts`, our own design), drawn
instanced:
- **The box:** a bevelled front, sides, the lid's shadow line, a punched hand-hole, and a label holder. Material:
  CC0 cardboard (ambientCG Cardboard004, colour, normal and roughness).
- **Labels:** four variants on a canvas atlas: two printed with a barcode, two hand-written in marker.
- **Variation:** most boxes plain cardboard, some faded burgundy, green or blue; each pulled forward by up to 6 cm and
  turned a touch; one in twenty tipped against its neighbour; one in twelve open, with files sticking up out of it;
  gaps where boxes are missing. A full-depth box sits on the floor at one end of each run.
- **Depth:** the shelving is a solid box, so each shelf box is its front, a slab 3.5-9.5 cm deep, now bevelled and
  lit as a box, not a flat card.
- **Cost:** one draw call for every box body, plus one per label variant. The Archive view is 93k triangles
  (round 1: 82k), 201 draw calls (round 1: 179).
- **Desk lamp (done):** a modelled lamp on the reading table (weighted base, jointed chrome arm, green enamel
  shade, a glowing warm bulb), baked as a small warm source at 1.1 m. Fixtures can now carry a height and a gain;
  the fitting mesh skips them. Archive re-baked (307 s). The warm pool reads only faintly at evidence size; more
  gain is a re-bake away. Evidence: `archive-desk-high.png`.
- **Not done yet:** darker aisles (the fittings sit between the shelving runs, so the aisles are where the light
  is); rolling steps or a trolley.
- Archive (mine, strict scale): D 5.5 -> 6.5; A unchanged.
- Tests: unit tests 97/97; browser suite plus the online test 10 passed, with the stock-fighters warm run as the
  expected failure.

## Corridor round 3 (`rooms/corridor/round-3/`), against the reviewer's round-2 notes

1. **Doorways:** every doorway now has a frame: off-white painted casings on the posts and across the lintel,
   plinth blocks at their feet, an aluminium threshold strip, three hinges left on one jamb (the doors are gone)
   and a room plate at eye height on the other post. No door leaves yet: an open leaf would sit in a room that is
   not an art room yet.
2. **Posts:** they are collision boxes in the map, so they can't be thinned or removed here. They are repainted from
   near-black to a painted steel a few shades darker than the wall, so the bays read as structure, not stripes.
   Variety between them (notice board, radiator, trolley, boxes, bench) is not done yet.
3. **Fittings:** the diffuser glow is down from 12 to 5, so the prismatic lens shows its texture instead of a white
   rectangle. Three water-stained tiles, and one missing tile with its dark void and two cables hanging out.
   No dead or flickering tube yet.
4. **Walls and floor:** the plasterboard shader gets trolley and bag rub at hip height (a broken grey line), boot
   scuffs as short streaks instead of blocks, and the odd repainted patch. The terrazzo gets a dull walked path
   down the middle and dull margins where the polisher never reached (new `wear` surface option). No hand grime by
   the doors yet.
5. **Light colour:** the corridor's tubes alternate warm (old), neutral and cold (new). Re-baked (corridor only,
   442 s). The difference is subtle. No daylight from doorways (the rooms behind are not art rooms yet).

Scores (mine): A 6.5, B 6.5, C 6.5, D 6. Still below 7 on D: no doors, no variety between the posts. Budgets
(measured, corridor bookmark, High): 200 draw calls (round 2: 184), 86k triangles (83k), 55 programs. Evidence:
`before-after.png` (round 2 left, round 3 right), `corridor-high.png`, `corridor-west-high.png`,
`corridor-low.png`.

## Tactical kit (row K): grenade blasts, round 1 (`kit/grenade-round-1/`)

Every explosion used to share one effect. Now `Effects.blast` takes the source:
- **Frag:** the white flash plus an ember-orange core flash, the dust cloud and floor pressure ring, sparks, a soot
  mark, and floor and wall bits thrown out that come to rest and stay.
- **Impact grenade** (its own look): a cold blue-white flash; a sharp shock ring racing across the floor (a new
  pooled ring, warmed with the effects); more sparks and a thinner cloud; a smaller soot mark.
- **Breach charge:** as in the charge item.
- **Evidence:** `frag-strip.png` (just after the blast, 0.2 s later, after clearing with `fxfast`). The blast is 6 m
  from the camera, so the soot and debris are hard to make out, and the 0.14 s flash isn't caught in the first
  frame. The impact grenade isn't rendered yet: the bookmark player's kit carries frags, and kit choice happens in
  preparation, which the script skips.
- **Mismatches for round 2:**
  - a close-up of the aftermath;
  - the impact grenade in evidence;
  - no light from the flash on the room (the flash is a sprite; a real light needs the fixed light pool);
  - debris is boxes, not shaped fragments.
- K (mine, grenades): 3 -> 4.5.

**Row K overall (mine, my parts only), round 1:** charge 5, barricades 5, reinforcement 5, uplink 5, grenades 4.5,
soft walls (row J) 6. The in-hand and third-person parts are the weapons' and fighters' sessions'.

## Tactical kit (row K): uplink device, round 2 (`kit/uplink-round-2/`)

The reviewer scored round 1 at 5.5 on the stricter scale. Changes:
- **Easier to find:** the screen is about twice as bright, the status lights larger and brighter, the glow wider.
- **Reads as equipment:** a radio module clipped to the case's side with its own stub aerial, and a battery pack on
  the floor joined to the case by a cable.
- **States differ in rhythm as well as colour:**
  - armed: a slow cyan breathing;
  - counting: an amber blink that speeds up as the fuse runs down;
  - complete: steady green;
  - shut down: a dark screen with a single red flash every two seconds.
- **Evidence:** `counting-then-complete-crop.png`.
- **Still open:** the wider glow tints the lid; the shut-down state isn't rendered (needs a scripted defuse).
- Uplink (mine, strict scale): 5.5 -> 6.

## Tactical kit (row K): uplink device, round 1 (`kit/uplink-round-1/`)

Before: six flat boxes and a pulsing ring.
- **Now** (`render/kit.ts` `deviceGeometry`, our own design):
  - a hard case with ribs, rubber feet, latches, a handle and a hazard strip, its lid open and standing at the back;
  - a keypad panel and cable gland inside, and a whip aerial;
  - a screen in the lid's bezel (title, signal trace, status box), with a progress bar in the box;
  - three status lights: power, link, alarm.
- **State drives colour and scale only, never a redraw or upload:**
  - counting (planted): amber screen, a bar that fills over the fuse, and a link light and glow that blink faster
    as time runs out;
  - complete: green, bar full;
  - shut down (defused): dark screen and a red alarm light;
  - otherwise: armed (cyan).
- **The light that carries:** an additive glow over the screen and a pool of its colour on the floor round the case,
  pulsing with the count, plus the existing pulse ring. The case is lit by the bake probe like the charges.
- **Evidence:** `counting-then-complete.png` (amber while counting, green once the link completes),
  `counting-high.png`, `counting-crop.png`. The shut-down state is not rendered yet (it needs a scripted defuse).
- **Mismatches for round 2:**
  - the pool is faint on the bright tile floor;
  - no real light on the room: it would need a permanent light in the art scene and a recompile of every art
    shader to carry it, so it's left as a fake pool for now;
  - the screen is unlit by the room (fine) but has no glass reflection;
  - the plant and shut-down hands belong to the weapons and fighters sessions.
- K (mine, uplink): 3 -> 5.

## Tactical kit (row K): reinforcement, round 2 (`kit/reinforcement-round-2/`)

The reviewer scored round 1 at 5 on the stricter scale: it read as "steel-print wallpaper".
- **Lit steel.** In art rooms the plate now uses the room's lit material: semi-gloss painted steel, dark grey-green,
  on the art pipeline with the reflection probe, instead of the old flat unlit texture. The folds, rails and
  anchors now take light and soft highlights. Its shades are retuned for the lit material.
- **Painted on the geometry:** a yellow-and-black diagonal hazard band across the top, and weld seams down every
  fold.
- **Deploy:** while a defender reinforces a wall, a copy of the finished plate rises from the floor over the
  action's 3.5 s (eased: fast, then settling), and is replaced by the real plate when the simulation sets it. It is
  driven only by the player's existing `act`, `actT` and `actTarget` (`actDuration` from `sim.ts`, read only); no
  new hook. **Not yet captured in evidence:** only bots reinforce in the scripted views, and the hook doesn't
  expose their actions.
- Under fire: scars and sparks as in round 1.
- **Evidence:** `intact-and-shot.png` (intact, then after a burst).
- **Still open:**
  - no anchors visibly entering the floor;
  - no uneven top edge;
  - no brushed-metal streaks;
  - the unfold is a rise, not a fold-out.
- Reinforcement (mine, strict scale): 5 -> 5.5.
- One full-suite run had a single failure I couldn't attribute (the next three runs were clean). Possibly a flake
  in the online test; watching it.

## Tactical kit (row K): reinforcement, round 1 (`kit/reinforcement-round-1/`)

Before: a flat 20 cm slab carrying the old plate texture (dark grey, printed rivets and a hazard band).
- **Now** (`levelmesh.ts` `reinforcement()`): folded steel leaves about 0.5 m wide in a shallow zig-zag; three
  stiffening rails standing proud, with rivet heads at every fold; anchor shoes at the foot and head of every
  other fold, as if fired into the floor and ceiling. Painted blue-grey, a touch different per leaf. Both faces
  alike.
- **Under fire:** rounds that hit a plate leave a bright scar (paint blasted off round bare metal and a lead smear;
  a new decal pool) and a spray of sparks, never a hole. Fixed on the way: the simulation stops a round at the
  panel's centre plane, inside the plate, so the old decals and sparks were buried in the steel. Hits are now
  lifted to the face.
- **Evidence** (a wall the defending bots reinforce; new `REINFORCE=1` mode in the bookmark script, and
  `?artdbg=world` to list the reinforced panels): `before-after.png`, `other-side-high.png`, `shot-high.png`,
  `shot-crop.png` (scars after a burst, dust cleared with `fxfast`).
- **Mismatches for round 2:**
  - the steel is unlit by the room probe (the plate material is the old flat-shaded one), so there's no brushed
    sheen or specular;
  - the scale of the old texture shows through (stretched streaks);
  - no deploy animation: the plate appears whole when the simulation sets it, and the unfold needs the
    defender's progress (`act`/`actT`/`actTarget` on the player is enough; no new hook);
  - no anchor bolts visible in the floor or ceiling;
  - the hazard band is texture-only.
- K (mine, reinforcement): 3 -> 5.

## Tactical kit (row K): barricades, round 2 (`kit/barricade-round-2/`)

The reviewer scored round 1 at 5 on the stricter scale. Changes against the notes:
- Snapped ends break along the grain: nine points down each end, mostly a ragged tear back into the board (to
  10 cm), with about one in three a long splinter finger left reaching into the gap. Pale fresh end grain.
- Boards are thicker (32 mm).
- Two battens behind the boards near each jamb, cell by cell where cells stand, show what the boards are nailed
  to.
- Splinters and broken pieces on the floor were already there (flat timber debris that stays).
- **Evidence:** `shot-high.png`, `shot-crop.png`.
- **Still open:** the battens hide behind intact boards in this view; no staggered board lengths; the first-aid box
  on that wall is still a placeholder cube (Lab dressing).
- Barricades (mine, strict scale): 5 -> 5.5.

## Tactical kit (row K): barricades, round 1 (`kit/barricade-round-1/`)

Doors and windows were a flat sheet of plank texture with square cells cut out.
- **Now** (`levelmesh.ts` `barricade()`): each row of cells is one separate board. Boards are 23 cm tall with gaps
  between them (the sky shows through on outside windows), alternate slightly in depth, and are each tilted a
  little. Each takes its own slice and shade of the timber texture.
- **Nails:** two iron heads where a board rests on the frame.
- **Collision is unchanged:** a run of intact cells is one length of board.
- **Breaks:** where cells are shot or struck out, the board snaps. Top and bottom tear back into the board by
  different amounts, a rough diagonal with a short splinter tip (no more than 3 cm into the gap). The snapped end
  grain is pale. The splinters thrown (existing debris, now flat timber slivers) stay on the floor.
- **Evidence:** `intact-before-after.png`, `shot-before-after.png` (old left, new right), `shot-high.png`.
- **Mismatches for round 2:**
  - no frame or batten behind the boards: they rest on the wall's opening trim;
  - boards are the same length (full width), never staggered or overlapping;
  - no bullet holes in boards that survive a hit;
  - the build-up animation (plank by plank) follows the simulation's cells, but nothing marks a board being
    placed (hammer or fighters' side);
  - the texture still shows the occasional seam inside one board.
- K (mine, barricades): 3 -> 5.

## Tactical kit (row K): breach charge, round 1 (`kit/charge-round-1/`)

My part of the charge is the placed model, the blast and the aftermath. The in-hand charge belongs to the weapons
session and the third-person placing to the fighters session.
- **On the wall** (`render/kit.ts`, new, our own design): an adhesive foam frame, and an olive pack with webbing
  straps, a raised tan core and two printed hazard bands. Tape over two corners onto the wall. A black detonator
  with a cap, a toggle and a cable gland, and a blinking LED that blooms. Red and black firing wires loop down the
  wall. One merged mesh (one draw call) plus the LED. Each charge's material is tinted by the baked light where it
  sits, so it is lit like the wall behind it. Before: three flat-coloured boxes (`models.ts` `chargeParts`, still
  there for the weapons session).
- **Going off:** the existing flash, smoke and sparks, plus a pressure ring (a skirt of dust racing out low along
  the floor), a soot mark on the floor, and soot on the board round the opening on the side the charge was set
  (decals belong to their cells). Board fragments thrown into the room are thin flat plates that come to rest and
  stay.
- **The opening:** ragged, torn skins, studs and the cavity (destruction rounds 1-2), with gunfire-style chips
  round it.
- **Evidence:**
  - `charge-on-wall-high.png` and `-crop.png` (armed charge);
  - `blast-strip.png`: in the smoke after 9 s game time; then 2.4 s and 8 s of effect time with `?artdbg=fxfast`.
    The bookmark tool can't run effects in real time: effects age only with rendered frames, and the test hook
    draws 16 ms frames;
  - `after-high.png`, `after-close-high.png`.
- **Mismatches for round 2:**
  - the pack is flat-coloured (no fabric, print or label textures);
  - no wire running away from the charge to the player;
  - no broken stud ends sticking into the opening (blocked by the "nothing in a passable gap" rule; a short
    splintered stub at the jamb is a possibility);
  - the smoke is a uniform haze rather than rolling clouds;
  - the floor soot sits at the wall base, under the opening, where it is hard to see.
- K (mine, charge only): 3 -> 5.

## Phase 5: destruction look, round 4 (`destruction/round-4/`, 960 px)

The reviewer scored round 3 at **J 6** ("reads as shot plasterboard for the first time"). For 7:
- **Thickness at a distance:** the gypsum core between the paper faces is now a darker grey, so the board's
  thickness reads.
- **Framing in the gap:** where a stud runs on into a hole above or below its cell, its broken end now reaches 6-14 cm
  into the opening, snapped on a slant with pale splintered wood at the tip. That is framing you can see, kept short
  so nothing blocks a gap the simulation says is open. A full stud across an opening stays ruled out by that rule.
- **Debris and powder:** each round through a soft wall leaves a haze that hangs for 3-4 s, pale powder patches on
  the floor under the hole on both sides (a new pooled decal, kept for the round), and crumbs that stay.
- **Evidence:** `shot-wall-high.png`, `breach-close-high.png`.
- J (mine, strict scale): 6 -> 6.5. Walls are left here for now, as the reviewer asked; the kit items come next.
- Tests: Breachline unit tests 97/97. In the full browser run (one worker) the audio session's new
  `audio.spec.ts` failed once and then passed alone (4.7 s); it looks like a timing flake under load, not this
  change. The other tests passed.

## Phase 5: destruction look, round 3 (`destruction/round-3/`), against the reviewer's round-2 notes

The reviewer re-scored round 2 at **J 4.5** on a stricter scale ("about two points generous before"). My own scores
from here on use that scale too.
- (1, 2) **Ragged, layered breaks.** Cells on a hole's rim are now drawn one by one, each skin with its own outline.
  Every side facing a hole is cut into six segments that bite back into the board by 1-5 cm (now and then a bigger
  chunk, or a tongue left hanging a little into the hole). The face is a fan about the cell's middle, so the
  outline stays star-shaped and never folds. Along the break: face paper, white gypsum core and brown back paper,
  the peeled fringe, and now and then a flap of torn paper curling out over the hole. The far skin tears
  differently from the near one, and the back of each skin shows brown in the cavity.
- (3) Studs are still drawn only in intact cells (the gap rule).
- Cost: about 4 ms and 6.4k vertices to rebuild a badly holed panel (a test stress case), once per damage change.
  `panelgeo.test.ts` now checks the bounds as extremes, one assertion per panel (it timed out with one per vertex).
- **Evidence:** `before-after.png` (round 2 left, round 3 right), `shot-wall-high.png`, `breach-close-high.png`.
- **Still open:**
  - (4) the shots still open whole 25 cm cells, which the rough rim disguises but doesn't change;
  - (5) the dust haze hangs only briefly;
  - (6) the wall's own dirt comes from the corridor round.
- J (mine, strict scale): 4.5 -> 5.5.

## Phase 5: destruction look, round 2 (`destruction/round-2/`)

Against round 1's mismatches:
- (1) Torn edges now have a fringe: on both faces the paint and paper peel back 1-4 cm from each break. Bare gypsum
  shows at the break, and a darker ragged paper line at the fringe's inner edge, which follows the tear.
- (3) The cut edge shows the board's layers: face paper, a white gypsum core, brown back paper. The cavity side
  of the board is brown.
- (4) Decals: a round through a soft wall leaves an entry chip on the near face and a wider blow-out on the far
  face. Every cell knocked out by gunfire leaves chips on the intact board round it, on both faces, placed beyond
  where the board can tear back. Decals belong to their cell and go when it falls. The decal texture is now a
  crater: grey bruising, a ring of crushed gypsum chips, a ragged dark hole.
- (2) Dust on every hit: an entry puff, plus a cone of gypsum dust out of the far side. Gypsum crumbs and
  breach/gunfire debris that come to rest stay on the floor until the round is cleared (pooled, oldest recycled
  first), and no longer update once settled.

Still open:
- (5) little light in the cavity;
- debris chunks are flat-shaded boxes (fine at size, plain close up);
- decals are not normal-mapped;
- the Low breach view is still mostly smoke for several seconds.

J score (mine): 5 -> 6. Evidence: `shot-wall-high.png` (holes from a magazine with chips round them),
`breach-close-high.png`, `breach-high.png`, `shot-wall-low.png`. Budgets unchanged (decals and chunks are pooled
instanced meshes; no new draw calls or programs; `warm.spec` still shows programs unchanged).

## Phase 5: destruction look, round 1 (`destruction/round-1/`)

Soft-wall panels are now built as a real partition: two plaster skins (12.5 mm) with a cavity, timber studs every
0.6 m and a noggin at 1.2 m, standing only in cells that are still intact (so nothing visible blocks a passable gap;
`tests/games/breachline/panelgeo.test.ts` checks it). Hole edges tear back into the intact board by a hashed amount
instead of following the cell grid, and the cut edges and cavity faces take the panel's own baked corner light.
Bookmarks `shot-wall` (a magazine through the Lab's south wall), `breach`, `breach-lab`, `breach-close` (after a charge).

Mismatches against the bar, for round 2: (1) torn edges are clean straight polygons with no paper fringe or crumbled
gypsum; (2) no debris left on the floor and no lingering dust after a breach; (3) the cut edge has the face's albedo,
where real board shows a grey gypsum core between paper liners; (4) no bullet decals on the intact plaster around the
holes; (5) the far skin's studs read weakly through a hole (little light reaches the cavity); (6) on Low the breach
smoke hides the hole for several seconds (existing effect; fine for play, but the look can't be judged there).

J score (mine): 3 -> 5. Budgets in the breach views: High 63k-73k triangles, 107-136 draw calls; Low 67k-75k, 99-108.

### Start-up stalls, measured in the two-page online test (planner's request, 08:28)

Long-task observer on both pages, the real online spec, this container (SwiftShader, two browsers on one CPU):
- **Before** (art High, everything in one frame): the guest's single art-integration frame took 1.6-3.9 s, and the
  guest's wall holes dropped from 11 to 0 straight after it (netcode resync after a long stall; reported).
- **After** (bc35092): the art is fully loaded and integrated about 6 s *before* the match starts (guest log: warm
  3.1 s spread over 5 draw batches and 25 one-per-task texture uploads; integrate 67 ms; the largest art task is
  under 1 s, the same as an ordinary software-rendered frame here). On High in one page the largest art step is a
  0.5-1.2 s frame, against 0.95 s for an ordinary frame with art off.
- **Remaining stalls are not loading.** The guest still has tasks of 1.5-6.9 s, all after the round starts. Timed
  inside the frame loop: script work accounts for at most 2 s of them (first draw of the weapon viewmodel 1.1-2.0 s,
  fighters' first updates 0.3-1.1 s, the main scene's first draw 0.3-1.4 s, each once); the rest is time the main
  thread waits on the software GPU process (synchronous GL queries stalling behind queued rasterisation). On a
  real GPU these are tens of milliseconds. Not a host/guest divergence: counts and health converge.
- Result: six Breachline browser tests then the online test, one worker, **passed three times running** (8/8 each).
  The poll timeout was not raised.

### Art streaming no longer stalls a match (online test)

The two-device online test had failed since the corridor commit: when the art arrived mid-match, the guest's frame
froze for 2-4 s (in software GL), and after the stall the guest's wall holes reset to none (a resync issue in the
netcode, reported to the planner; off limits here). Measured with long-task timings, the freezes were the reflection
probes (2 s, all three in one frame), first-draw shader variants, texture uploads and buffer uploads. Now: the art's
shaders are compiled before it goes live, against a half-float target like the game's (the screen variant was the
wrong one); materials hold a black stand-in probe of the same size, so the real probe is a uniform swap, not a
recompile; textures upload one per task; every mesh is drawn once into a 4x4 target, about 8k triangles per task;
probes are captured one room per frame at 128 px with a far plane fitted to the room. And a software rasteriser
(SwiftShader, llvmpipe) now gets the Low art tier, the owner's last-resort mode; `?arttier=high` forces High for
evidence renders (the bookmark script passes it). With that, `breachline-online.spec.ts` passes; with High art on
two software-GL browsers sharing one CPU it still timed out on the hit check (each poll waited seconds for the CPU).


## Roll-out step 3: Archive (site B)

Round 0/1: timber floor (Poly Haven `wood_planks`, CC0, Amal Kumar); four slightly warm fittings between the
shelving runs; shelving dressed on its solid collision boxes: steel uprights and shelf lips, archive-box fronts with
labels and hand-holes, and box files in varied colours, all standing just proud of the faces, so the collision is
unchanged; a bank of filing cabinets with drawer pulls and label holders; the reading table with paper stacks, a box
file and an open archive box (dark veneer, so it separates from the floor); ceiling grid, sprinklers, detector; a
clock, sockets and skirting on the solid south wall. Fixes after the first look: labels and hand-holes were too
large and white, the papers glared, and warm light plus the timber's bounce made the ceiling muddy brown (cooled).
Rooms now load independently: a missing or stale bake keeps that one room on the old look instead of all of them.

Scores (mine, `rooms/archive/round-1/`): A 6.5, B 6.5, C 6.5, D 7. Budgets: High 46k-82k triangles, 88-179 draw
calls (the shelving costs draw calls: about 20 dressing materials; merging by material on High is next if the
total grows); Low 71-151. Three rooms baked in parallel in 447 s.


## Roll-out step 2: corridor (in progress)

Round 0 (`adcd2b9`): the art world now handles any number of rooms (probes, mean light, reflection environment per
room; panel light merged across rooms, so the Lab–corridor wall carries both bakes). Corridor: polished terrazzo
(Poly Haven `terrazzo_tiles`, CC0, Amal Kumar), a line of ten fittings at 3 m, the T-bar ceiling with sprinklers
and smoke detectors, a cable tray on drop rods, hanging exit signs with an original running-figure pictogram, the
cabinet modelled as casework, the lockers facing into the corridor. First render: the floor carries long
reflections of the fittings, and the ceiling recedes properly. Round 1: terrazzo cooled toward the grade (it read
tan), two extinguishers at the foot of the walls.

Round 1 scores (mine, from `rooms/corridor/round-1/`): A 6.5 (even fluorescent light, upper walls near the
camera wash out), B 7 (the terrazzo carries long reflections of every fitting), C 6.5, D 6 (the walls on both sides
are destructible panels, so nothing can be fixed to them: the ceiling, the floor props and the casework carry the
dressing). Budgets: High 73k-76k triangles, 153-158 draw calls; Low 135-140 draw calls (budget 200). Running texture
total: 10 surface sets plus 5 prop sets, 17 MB shipped across all tiers; at 1K the GPU holds about 16 MB for the
Lab and corridor sets together with BC/ASTC transcodes.

Round 2: fittings every 4.5 m instead of 3 m, so the walls get pools; grime gathers toward the ceiling on the
plasterboard; red fire-alarm call points and a fire-equipment sign on the static posts between panels (nothing can
hang on the plasterboard itself). Scores (mine): A 7, B 7, C 6.5, D 6.5. C and D are capped mainly by the bare
plasterboard on both sides; the destruction-look phase, next after the Archive, gives those panels seams, studs
and breakage, which is where they will gain. Budgets: High 73k-77k triangles, 156-161 draw calls; Low 136-141.

`bake-all.mjs` bakes rooms in parallel, one process each. With two rooms it is bounded by the corridor (470 s).

Bake time: Lab and corridor together take 8 minutes single-threaded. The full building would be about 30, so the
baker needs worker threads (4 cores here) before more than two more rooms are added.


## Roll-out step 1: KTX2 (done)

Lab items closed in this step: photo ceiling tiles (ambientCG Office Ceiling 001, CC0, 600 mm tiles on the T-bar
grid); plaster normal strength 2.2x; painted metal doors and lockers glossier with a 1.4x reflection; the grade's toe
lifted (lift 0.03, black point 0.012) so shadowed casework keeps its detail (the reviewer's carry-forward note 1).
On Low, untextured dressing merges into one draw call: Low's Lab draw calls 99-107 -> 87-95.


**Landed:** textures ship as KTX2/Basis (colour ETC1S with the sRGB transfer function; normals and AO/roughness/metal
UASTC with RDO and zstd), one file for every GPU. The browser transcodes to BC, ETC2 or ASTC, so ARM Chromebooks
now get compressed textures. All tiers total 13.3 MB (512 px 3.9 MB, 1K 9.4 MB) against 22.4 MB for the BC/KTX1
set. JPEG 512 fallbacks remain for a failed transcoder, with a 20 s timeout so a dead worker cannot hang loading.
The BC encoder (`bc.mjs`) and the KTX1 files are gone.

**What was in the way, and the fix:** allowing WebAssembly was not enough. The Basis transcoder's Emscripten/embind
glue builds function wrappers with `new Function`, which needs `'unsafe-eval'`, still forbidden (correctly). Two
places do it: `craftInvokerFunction` for bound C++ methods, and `__emval_get_method_caller`, used when it constructs
a `KTX2File`. `build.mjs` swaps both for the closure equivalents Emscripten emits under `DYNAMIC_EXECUTION=0`. It
fails the build if the source text changes, or if any `new Function` survives. It then writes the worker three's
`KTX2Loader` would have made as a `blob:`, as a same-origin file (`basis/ktx2-worker.js` and the unmodified `.wasm`).
`render/assets.ts` runs it through a small `KTX2Loader` subclass. A test (`tests/games/breachline/artcsp.test.ts`)
holds the worker eval-free and the policy unchanged. Notices record the modification (Apache-2.0).

 (evidence: `lab-slice/gate/`; for review before roll-out)

**Changes this round,** in the reviewer's order:
1. Service pipes removed (the services reach the sink inside the cabinetry).
2. Destructible plasterboard gets taped joints every 1.2 m and boot-height scuffs, drawn per pixel, so they break
   with the cells. The painted skirting and rail were already per pixel.
3. More lit/unlit separation: contact occlusion reach 0.5 m at 85 %, a deeper grade toe (gamma 0.9) and black
   point 0.03. Bench tops are sealed epoxy with a soft second reflection.
4. The budget items below.

Also fixed a real bug: the automatic resolution scaler ran after drawing. On a scale change it resized, and so
cleared, the canvas after the frame was drawn, so the screen flashed empty for a frame. That flash was the
intermittent "blank Low frame" in my earlier renders, not the dev server as I wrote in round 3. It now runs before
drawing, and repeated High-then-Low runs are clean.

**Scores (Lab, mine):** A 7, B 6.5, C 6.5, D 7, H 6. A and D are at the gate. B and C are half a point short.
B needs stronger plaster normals and reflections on painted metal. C needs a photo ceiling-tile set to replace the
procedural one; that waits for KTX2, because the texture count is about to grow.

**Budgets, measured on the gate frames (this container, 1280x720):**

| | High | Low (throttled) | Budget High / Low |
| --- | --- | --- | --- |
| Triangles in view | 38k-80k (63k at `lab`) | 57k-59k | 500k / 150k |
| Draw calls | 59-108 | 99-107 | 400 / 200 |
| Script per frame, 60 frames | 0.9 ms median, 2.5 ms p90 | 0.7 ms median, 0.9 ms p90 | 5 ms / 3 ms |
| Lab art textures, GPU | about 16 MB (5 surface sets at 1K, 5 prop sets at 512, lightmaps, 2 canvases) | about 5 MB at 512 | |
| Post targets, GPU | about 42 MB (MSAA 4x HDR 33.6 MB + resolve 8.4 MB + bloom about 1 MB at 1366x768) | about 2.5 MB (HDR at 55 % scale, no bloom) | |
| Medium (not rendered here) | HDR 8.4 MB + bloom 0.5 MB, no MSAA, FXAA | | |
| Committed art | 10.5 MB (all at 512 px until KTX2) | | 60 MB / 20 MB |

Prop LODs: meshoptimizer (pinned dev dependency 0.22.0) writes a level at about 30 % of the triangles for each prop
(tool chest 13.4k to 4.0k, extinguisher 9.9k to 3.1k, stool 8.3k to 2.5k). High switches to it beyond 5 m and
Low always uses it. Triangles at the `lab` bookmark dropped from 91k to 63k. Each LOD file still carries its
model's full vertex buffer: about 1 MB in total, to strip later.

**Per-room allowance for roll-out (proposed):** each new room may add at most two new 1K surface sets. It reuses
the shared family (plaster, tile, painted metal, boards, ceiling) and the dressing kit's untextured and canvas
materials. Its props share 512 px sets. That keeps eight rooms near 60-70 MB of textures on High at BC/ETC sizes
(under 350 MB on Medium) and roughly half the download once KTX2 lands. Post targets are per screen, not per room,
so they do not scale with rooms.

**Tests:** `npx tsc --noEmit` clean; `npx vitest run tests/games/breachline` 53 passed; browser (solo flow) and the
two-device online match: 7 passed; whole suite `npx vitest run` 270 files passed (1 skipped), 5,341 tests passed (7 skipped).

**ARM today:** 512 px JPEG fallback, uncompressed in GPU memory, until KTX2.

**Roll-out order after review (reviewer's):** corridor, Archive, the remaining rooms, the yard, with KTX2 landing
before the texture count grows.

**HeroLighting (planner's decision, 2026-11-11):** `environmentScale(x, z)` added to the interface and implemented:
1 / the room's mean baked surface light inside art rooms (about 1.7 in the Lab), 1 elsewhere. Hero and fighter
materials use `environment()` for specular only, scaled by this, and take diffuse from `probe()`. `probe()` gains
SH when the light grid lands.

## Lab slice, round 3 (evidence: `lab-slice/round-3/`, including `lab-high-vs-low.png`)

From the reviewer's round-1 review (scores A 5.5, B 4, C 6, D 5.5, H 5), in their order:

1. Floor: done in round 2 (darker, glossier, visible reflections). Grounding comes from the kick plates, contact
   occlusion and the floor's reflections of benches and lockers.
2. **Low tier no longer stair-steps:** Low now has a light post tier (grade plus an FXAA edge pass, no bloom) at its
   reduced resolution, so High and Low share one look. Metals on Low (no reflection probe) are drawn as darkened
   paint instead of black or chalk-white.
3. **Paint varies by object:** grey-green lockers on a neutral painted base, blue-grey cabinet doors, charcoal door
   frames, dark carcasses so the gaps between doors and drawers read as gaps.
4. **Black point:** the grade has a black point (0.018 after the curve), so recesses, louvres and the doorway go dark.
5. **Walls:** noticeboard with pinned sheets, first-aid box, an original eye-protection sign, a wall clock, a vent
   grille, cable tray. **Ceiling:** sprinkler heads, a smoke detector, a stepped supply diffuser.
6. **Bench tops:** a monitor on a stand with a keyboard, sample trays, a test-tube rack, a benchtop centrifuge, a
   clipboard, service pipes dropping to the sink.
7. **Site "A" ring:** worn but clearly readable on every tier.
8. **Door posts:** charcoal painted with texture detail.

Also: the bookmark script retakes an empty frame once. The first run after a source edit sometimes captured a
blank canvas; I traced that to the dev server re-transforming modules, not to the renderer (six repeat runs without
edits were all clean).

Found for the hero session (relayed): on High the new AR-5 renders near-black, because the viewmodel uses my room
probe (physical units, mean surface light 0.59) for diffuse as well as reflections; with the probe off it lights
correctly.

**Scores (Lab, mine, from `lab-slice/round-3/`):** A 6.5, B 6, C 6.5, D 7, H 5.5. **Budgets on these frames:**
38k-93k triangles, 59-108 draw calls (High); textures unchanged plus two 256 px canvas textures. Still owed before
the gate: a per-room texture allowance and post targets sized by tier (the reviewer's budget note), script ms,
prop LODs.



From the reviewer's mid-slice look (at 90eeca9) and my own list:

1. **Floor specular now visible.** In a reflection-only render the floor reflections were already strong; the bright
   diffuse floor swamped them. The tile albedo is lowered (floor midtones about a third, as asked), it is glossier
   (roughness about 0.08), and its reflection carries a 2.6x sealed-surface multiplier. `lab-west-high.png` shows
   the sheen and the fittings' reflections along the walls.
2. **Vignette eased** (strength 0.16, starting further out), so the ceiling near the camera is no longer crushed.
3. **Wall band no longer flat:** semi-gloss (it catches the fittings), grime towards boot height, a painted skirting
   zone; the dado rail and skirting are geometry on the solid wall.
4. **Ceiling grid with depth:** T-bars at 600 mm and wall angle trim, over the tile joints, lit by the ceiling's own
   lightmap (`lab-ceiling-high.png`).

Scores (Lab, from `lab-slice/round-2/`): A 6, B 6 (floor and band now reflect), C 6, D 6, H 5. Budgets on these
frames: 36k-91k triangles, 55-102 draw calls (unchanged texture memory). Still to reach 7: door leaves and deeper
frames, more on the benches' far ends and walls (noticeboard, fume cupboard), stronger plaster normals, prop LODs,
then KTX2.



Not at the slice gate yet (rows A-D at 7). Done this round, in the order the reviewer asked:

1. **Light contrast.** Troffer beams tightened (cos^2), sharp contact occlusion on bounced light, 16 texels/m,
   four fittings over the walkways; modelled fittings (housing, rim, prismatic lens) with a baked hot spot on the
   ceiling around each (`lab-ceiling-high.png`).
2. **Specular.** The reflection probe was black (cube faces were never cleared because the game renders with
   `autoClear` off); fixed. Reflections are box-projected onto the room; specular occlusion is normalised to the
   room's mean baked light (it had been normalised to a probe that sees the lamps, which hid the floor's
   reflections). Lenses now carry near-physical radiance, so they show in reflections and bloom.
3. **Post chain** (`render/post.ts`), brought forward: half-float HDR target (MSAA 4x on High), soft-knee bloom
   pyramid, ACES, a lift/gamma/gain grade (cool, slightly desaturated shadows, warm neutral highlights), vignette.
   The throttled tier keeps the renderer's own curve and no post. **Grade direction chosen:** institutional
   blue-grey (walls, casework, trim) against warm beige floors and timber, cool fluorescent light; surfaces in
   later rooms are held to this.
4. **Dense dressing** (`render/labdress.ts`, `render/detail.ts`): bench cabinetry with doors, drawers, bar handles,
   kick plates and end panels; lockers with louvres, latches and number plates; a sink with a gooseneck tap;
   reagent bottles; sockets; a switch on conduit; skirting and a dado rail on the solid wall (painted skirting zone
   on the destructible panels). Every piece borrows the lightmap of the surface it stands on, so it carries the
   baked light and contact shadow with no extra bake or lights.
5. Barricade boards use a CC0 photo set (`raw_plank_wall`, Dimitrios Savva) lit by the panel bake; frames lifted
   off pure black.

Bugs found by looking: the room split rejected faces whose origin lay outside the room on their vertical axis, so
the west end of the Lab's north wall still drew the old way (fixed, rebaked; the stale-bake test caught the
geometry change); on Low, "metal" dressing rendered black without a reflection probe (now painted on Low).

**Scores now (Lab only, from `lab-slice/round-1/`):**

| Row | Phase 0 (reviewer) | Now | Evidence |
| --- | --- | --- | --- |
| A Lighting | 4 | 6 | `lab-west-high.png`: hot spots, darker upper walls and corners, contact shadow under benches and stools; still too even across the floor. |
| B Shading | 3 | 5 | `lab-bench-high.png`: reflections on worktops, bottles and chrome; floor gloss subtle; normal detail on plaster mostly invisible at this exposure. |
| C Texture | 5 | 6 | Photo floor, walls, casework, boards; ceiling tiles and lockers' sides are still procedural or tinted. |
| D Geometry | 2 | 6 | `lab-high.png`: cabinetry, lockers, sink and tap, bottles, sockets, conduit; the room shell is still flat boxes (no ceiling grid in depth, no door leaves, plain posts). |
| H Post | 2 | 5 | Bloom, grade and vignette on High; no AO or depth of field. |

**What would take A-D to 7 next round:** a ceiling grid with depth and a better tile; stronger falloff between
fittings (fewer bounce lumens, or an exposure that lets midtones sit lower); door leaves and frames with depth;
noticeboard, fume cupboard or equipment on the benches' far ends; normal-map strength on plaster; then KTX2 so the
1K sets ship.

**Budgets measured on the Lab bookmarks (High, this container):** triangles in view 36k-91k (budget 500k);
draw calls 54-101 (budget 400); textures for the Lab art about 15 MB of GPU memory at 1K (4 surface sets 11.2 MB,
5 prop sets 3.5 MB, lightmaps 1.2 MB) plus the post chain about 40 MB at 1280x720 (MSAA HDR target and bloom
levels) and the reflection probe about 4 MB; committed art 9.4 MB (all of it at 512 px until KTX2). Script time
per frame is not measured yet (phase-1 counters). The props are still at full resolution (about 50k of the 90k
triangles); LODs are on the list.

**Hero lighting:** `HeroLighting.environment(x, z)` now returns the Lab's reflection probe inside the Lab (null elsewhere); `probe` is still the old per-vertex bake adapter until the light grid lands.

**Tests this round:** `npx tsc --noEmit` clean; `npx vitest run tests/games/breachline` 53 passed; browser tests (solo flow and two-device online) 7 passed.

**What ARM devices get today:** no S3TC, so the 512 px JPEG fallbacks, uncompressed in GPU memory (about 3x the
compressed size). KTX2/Basis (transcoding to ETC2/ASTC) is what fixes this; it is the next renderer task after the
slice.



**Gate verdict.** The Lab now uses photo-sourced CC0 materials, GPU-compressed textures loaded with no WebAssembly
under the real site CSP, a ray-traced lightmap with soft shadows and two bounces, a dominant-direction map so normal
maps shade the baked light, reflection-probe specular, and three modelled CC0 props lit by baked light probes. Compare
`phase-0/lab-high-procedural.png` (the old look, same pose) with `phase-0/lab-high.png`. It is a large step on
lighting, surfaces and texture detail. It is **not yet** "dramatically better" in every respect: the ceiling is still
the old procedural drop ceiling, nothing is post-processed, and the fighters and the weapon in hand are unchanged, so
the frame as a whole still reads as a game in transition. The foundation (texture route, baker, shared geometry,
material family, fallback) is proven, which is what this gate exists to decide, so the plan proceeds.

- **Texture route: go.** KTX 1.1 containers holding BC1 (colour, sRGB), BC5 (normals) and BC1 (AO/roughness/metal),
  encoded by our own deterministic JavaScript encoder (`scripts/breachline-assets/bc.mjs`, 38.5 dB PSNR on the tile
  set) and read by three's stock `KTXLoader` (plain JavaScript). Works under `script-src 'self'` with no change to the
  policy. The software rasteriser here exposes `WEBGL_compressed_texture_s3tc`, `_s3tc_srgb`, `EXT_texture_compression_rgtc`,
  `_etc`, `_astc`, `_bptc`. GPUs without S3TC/RGTC (most ARM Chromebooks) get 512 px JPEG fallbacks automatically.
  No ETC2/ASTC encoder yet: ARM devices take the uncompressed fallback (risk noted in plan section 10).
  This replaces the plan's DDS/ImageMagick idea: ImageMagick cannot write BC5, and KTX needs no custom loader.
- **Update after the owner's answers (WebAssembly now allowed, `worker-src 'self'`):** `ktx2-encoder` 0.6.0 (MIT, a
  Basis Universal build) runs under Node here. On the Lab floor at 1K: colour as ETC1S 154 KB in 2.6 s (BC1 KTX:
  699 KB), normals as UASTC+RDO+zstd 334 KB in 8.2 s (BC5 KTX: 1.4 MB). That is about 4.5 times less download and,
  unlike BC, transcodes to ETC2/ASTC on ARM Chromebooks. **Decision: phase 1 moves the shipped textures to KTX2/Basis**,
  with three's transcoder `.wasm` and worker served same-origin (three's stock `KTX2Loader` builds its worker from a
  `blob:` URL, which `worker-src 'self'` forbids, so it gets a small same-origin worker wrapper). That runtime path is
  the first task of phase 1 and is not yet proven in the browser. The BC/KTX1 path built here stays as the fallback.
- **Baker: go.** `scripts/breachline-assets/bake.ts` (Node via `vite-node`, `three-mesh-bvh` 0.9.1 pinned as a dev
  dependency). Lab at 12 texels/m: 40,349 texels, 512 x 172 atlas, 64 gather rays, two bounces, 384-ray SH probes,
  panel corner samples: **97 s single-threaded** on this container. The whole building is roughly eight Labs, so a
  full bake needs worker threads to meet the 10-minute budget (phase 2).

## Scorecard (0-10, 8 = would not look out of place in MW2 2009; scored from the pixels)

| Row | Baseline | Phase 0 (Lab only) | Evidence |
| --- | --- | --- | --- |
| A World lighting | 3 | **5** (reviewer: 4) | `phase-0/lab-west-high.png`: soft shadows under benches, AO in wall/floor corners, bounce tint; but flat overall exposure, no grade, rest of the map unchanged. |
| B Surface shading | 1 | **4** (reviewer: 3) | `phase-0/lab-bench-high.png`: normal-mapped plaster and metal, probe reflections; specular is subtle, ceiling and panels' broken edges still unlit-style. |
| C Texture detail | 2 | **5** | `phase-0/lab-high.png`: photo tiles, plaster, painted metal at 1K (~400-800 px/m); ceiling, lockers and barricades still procedural. |
| D World geometry | 1 | **2** | `phase-0/lab-high.png`: three real props (tool chest, extinguisher, stools); benches and lockers are still boxes. |
| E First-person weapon | 1 | 1 | Unchanged (phase 6, built in code, gate 8). |
| F Characters | 1 | 1 | Unchanged (phase 7, built in code, gate 7). |
| G Dynamic shadow | 1 | 1 | Unchanged (phase 8). |
| H Post-processing | 2 | 2 | Unchanged: tone mapping only (phase 1 skeleton, phase 8). |
| I Effects | 2 | 2 | Unchanged (phase 8). |
| J Destruction look | 3 | 3 -> **5** (destruction round 1) | `destruction/round-1/breach-close-high.png`, `shot-wall-high.png`: two skins, cavity, studs and noggins, torn edges; no debris, dust or decals yet. |

Scores for A-D are for the Lab; elsewhere the map is still at baseline.

### Reviewer's phase-0 scores (commissioning session, from the pixels): A 4, B 3, C 5, D 2

Taken as the scores of record; mine above were one point generous on A and B. Their findings, folded into phases
(items 1-3 must show in the Lab bookmark by the end of phase 2):

1. Lighting flat and washed, flatter than the old frame: raise key-to-fill, let corners and under-bench go dark,
   check the lightmap range and AO strength. Target: fixtures brightest, floor midtones about a third, contact shadow
   under every prop. (Phase 2.)
2. No visible specular: grazing-angle sheen on tile and metal, fixtures as bright sources in the probes, ARM
   roughness reaching the shader. (Phases 2-3.)
3. Fixtures are flat rectangles: model the troffer (frame, diffuser), hot spot on the ceiling in the lightmap. (Phase 2.)
4. Benches are the most box-like thing in frame: modelled cabinetry, sink, taps, equipment; Lab first. (Phase 4.)
5. Wall band is a featureless strip: dado rail and skirting as geometry, sockets, conduit, scuffs. (Phase 3.)
6. Door posts and frames pure black: proper material and light. (Phase 3.)
7. Site "A" ring reads as fresh flat paint: wear it, take the floor's normal and gloss. (Phase 3.)
8. Palette does not hang together (beige floor, cool grey walls, navy trim): choose a grade direction before phase 3.
9. Barricades, ceiling tiles, lockers, fighters and weapon still old; the photo/box mismatch is now glaring.

From now on each gate records the section 5 budgets measured on the bookmark frames and what ARM devices get
(today: uncompressed 512 px JPEG fallback until KTX2 lands).

## Iteration log (phase 0)

**Reference study.** Poly Haven's own sphere renders of ~45 candidate texture sets (tiles, plaster, block, brick,
metals) and ambientCG's painted-metal range; prop renders and polycounts from the Poly Haven API. Late-2000s military
shooter interiors studied from memory of publicly available material only (nothing saved): strong light pools under
fixtures, dark corners, two-tone institutional walls, dense props, filmic contrast.

**Round 1** (first render, `lab` bookmark): (1) every lightmapped surface black — the lightmap sampled UV set 0
because three's `channel` defaults to 0; (2) only two 0.7 m² lamps for 80 m², floor about 0.3 of target;
(3) destructible panels pure black; (4) bench tops black; (5) navy metal albedo ~0.03 reads as void;
(6) panel corner samples at y = 0 sit under the floor and return zero. Changed: lightmap `channel = 1`; art rooms get
their own fixture layout (`render/fixtures.ts`); corner samples moved just inside the panel rim; metal brightened.
**Round 2**: (1) bench tops and floor darkened by the direction term — traced to the BC5 normal patch never applying
(three resolves `#include`s after `onBeforeCompile`, so z came out as -1); (2) panels still black — panel meshes had
no normals (fine for the old unlit material, NaN for the lit one); (3) lighting too even (six fixtures, heavy fill);
(4) lockers lost their detail under a plain metal texture; (5) walls blank: the two-tone institutional band was gone;
(6) floor has no sheen. Changed: patch the chunk itself; `PanelView` writes normals; four fixtures over the walkways
so benches throw shadow; lockers keep the procedural texture under the lightmap until modelled; a painted lower band
with a dark rail by world height in the shader (works on lightmapped walls and panels alike); tile gloss 0.5.
**Round 3**: (1) tool chest black on its unlit side — L1 SH rings negative; (2) "ROUND 1" banner covering the frame
in some runs; (3) extinguisher very dark in its corner (correct, but dull); (4) barricade planks bright and flat
against the new light (old material); (5) ceiling still the old canvas texture, fixtures flat white. Changed: SH floor
at 30 % of the average; bookmark renders hide transient banners and prompts. (3)-(5) are left for phases 3 and 5.

## Files (phase 0, net lines)

New: `scripts/breachline-assets/` fetch.mjs 88, build.mjs 142, bc.mjs 112, bake.ts 406, bookmarks.mjs 56,
manifest.json; `src/games/breachline/render/` artworld.ts 186, materials.ts 112, levelgeo.ts 109, assets.ts 79,
surfaces.ts 36, fixtures.ts 25, props.ts 13; `tests/games/breachline/levelgeo.test.ts` 52.
Changed: `levelmesh.ts` +52/-15 (face claim hook, per-room ceilings, panel normals and per-panel look),
`scene.ts` +31 (art scene, async load, fallback), `package.json` (dev dependency `three-mesh-bvh` 0.9.1, pinned).
No changes to sim, state, net, bots, nav, world, map or config.

**Committed vs local:** only the 512 px BC files are committed; the 1K BC files are local build outputs, because
phase 1 replaces them with KTX2. A fresh checkout therefore shows the Lab with 512 px surfaces (verified in a render);
the phase-0 evidence images were rendered with the local 1K files.

## Assets (all CC0, Poly Haven; manifest `scripts/breachline-assets/manifest.json`, notices updated)

| Asset | Use | Shipped |
| --- | --- | --- |
| interior_tiles (Charlotte Baglioni) | Lab floor | 512 + 1K KTX, JPEG fallback: 3.57 MB |
| painted_plaster_wall (Amal Kumar) | Lab walls, panels, bench tops | 3.55 MB |
| blue_metal_plate (Rob Tuytel) | Lab benches, posts, frames | 3.54 MB |
| metal_tool_chest (Yann Kervran, John Hutcheson) | Lab prop, 14.6k tris | glb + 256/512 textures |
| korean_fire_extinguisher_01 (UM JOORIN) | Lab prop, 9.9k tris, 3 materials | glb + 3 texture sets (~3 MB) |
| metal_stool_01 (Ulan Cabanilla) | Lab prop x3, 8.3k tris | glb + textures |

Totals: textures 15.6 MB on disk (512/256 tier 6.5 MB, 1K/512 tier 8.4 MB, JPEG fallback 0.8 MB), models 0.94 MB,
bake 0.23 MB. Source downloads 27 MB in `.cache` (not committed).

## Budgets (Lab view, High, measured in this container)

| | Measured | Budget (High) | Note |
| --- | --- | --- | --- |
| Triangles in view | 83k (old look: 38k) | 500k | Props are full-resolution: 50k triangles for five props. LODs needed (phase 4). |
| Draw calls | 78 (old: 64) | 400 | |
| Texture memory (Lab art) | ~12.6 MB | 700 MB | 3 surface sets at 1K (2.8 MB each) + 5 prop sets at 512 + lightmaps. |
| Download (Lab art, High) | ~10 MB | 60 MB | Three surface sets at 1K cost 8.4 MB; 22 sets would cost ~60 MB alone. 1K must be the High ceiling for most sets; small props must share an atlas (the extinguisher's three texture sets for one small prop is wasteful). |
| Script per frame | not measured yet | 5 ms | Phase 1 adds counters. |

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 270 files passed, 1 skipped; 5,341 tests passed, 7 skipped (includes the new
  `tests/games/breachline/levelgeo.test.ts`: no surface lost or doubled by the room split, atlas deterministic and
  non-overlapping, shipped lightmaps match current geometry).
- Browser, with the art loading (dev server, pre-installed Chromium, one worker):
  `npx playwright test tests/games/breachline tests/multiplayer/breachline-online.spec.ts --project=chromium --trace off --workers=1`:
  7 passed (six solo-flow tests and the two-device online match), after rebasing onto the WebAssembly CSP change.
- Fallback checks by render: with the 1K files absent the Lab loads the 512 px set; with the bake missing the
  game logs one warning and keeps the procedural look.

## Owner decisions

Answered 2026-11-11 (plan section 3): WebAssembly allowed (same-origin workers and `.wasm` only); weapons, hands and
characters are authored in code to the bar (rows E >= 8, F >= 7); reloads and sounds must be our own work; Chromebooks
are a hard requirement, optimise first, and the Low tier is the throttled last-resort mode, chosen automatically
only when the startup probe needs it. Still open: the 40-60 MB download budget (assumed acceptable) and which
Chromebook model to benchmark on.

## Known gaps after phase 0

- The default Chromebook experience must be the full look, optimised (owner's rule). Low (throttled) still runs the full PBR shader with features off; phase 1 needs cheaper shader variants per tier and a cost measurement for each.
- Art quality is selected at scene creation (`?arttier=low` for review); the in-game setting does not switch it yet.
- Ceiling, lockers, barricade planks, fighters, weapon: unchanged.
- Bake is single-threaded.
- Bookmarks other than the Lab exist in `scripts/breachline-assets/bookmarks.mjs` but are not yet part of the review.
