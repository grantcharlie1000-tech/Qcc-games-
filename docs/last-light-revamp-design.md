# Last Light revamp: level, story and encounter design

Detailed beat sheet for `docs/last-light-revamp.md`. Design only. No code, no geometry edits. Every number below is a target for the layout pass. A target is final only after a journey replay passes and a browser play feels right.

## Movement envelope used for every gap

These numbers come from `model.ts`: run 220, jump −420, gravity 1120, +1700 while jump is released and vy < −160, dash 560 × 0.15 s, coyote 0.1 s, buffer 0.12 s, body 16×24.

| Move | Height | Flat air travel | Notes |
| --- | --- | --- | --- |
| Full jump | ~79 px | ~165 px | 0.75 s in the air |
| Full jump, land +40 | | ~140 px | |
| Full jump, land +64 | | ~118 px | +72 leaves ~107 px. Nothing taught above +64. |
| Full jump, land −48 | | ~187 px | Downhill gaps are generous, so use them for teaching. |
| Tap (short hop) | ~38 px | ~110 px | Release at once |
| Jump + dash | | ~249 px | Treat as +84 px until a replay confirms whether gravity pauses during the dash |

Gaps are measured edge to edge. Coyote time (about 22 px) and the 16 px body both help the player, so there is real margin. Bands used below:

- **Demonstrate:** 48–80 px flat, or any drop. A miss lands on something you can walk back from.
- **Practise:** 96–120 flat, rises up to +40.
- **Test:** 128–144 flat (about 85% of max), +64 only on gaps of 80 or less.
- **Dash:** 184–216 flat, always wider than a full jump, so the dash is clearly needed and not just a bonus.
- **Landing width:** at least 120 px after any new idea, at least 96 px in tests, and at least 64 px before a hazard edge.
- **Headroom:** an eave 48–56 px above the takeoff deck stops a full jump but lets a tap through.

## 1. Player promise and what the opening teaches

**Promise:** Cross one real, lived-in city by roof, tower, quay and bridge, with moves that become fluent, chasing your sister's light, and stop to help people only when you want to.

The opening (levels 1–3) must teach three things:

1. **Commit to a full run-up jump.** Run, take off at the edge, land. Misses can be recovered from before they can kill.
2. **Hold length is height.** A low eave punishes a full jump and lets a tap through. A chimney step punishes a tap.
3. **The air dash crosses what a jump cannot.** It refills on landing. The first dash is over a landing below you, not over a drop.

Corrections to `docs/last-light-revamp.md`, and why:

- *"Level 1: teach variable jump, no spikes until a later rest"* contradicts the same plan's obstacle table ("Level 1, after two safe gaps"). The handbook says to separate an unknown control from an unknown rule and to let the first try be informative. So level 1 teaches the full jump first, then hold length, and only then shows one gutter tooth. The tooth sits on flat roof after at least six clean non-lethal gaps, never on a landing. Pairs come in sector 3.
- The plan says the opening teaches the dash but gives no level for it. Level 2 gets the safe demonstration. Level 3 gets the first dash where a miss is lethal.
- The plan says the shop sign *"replaces a saw floating over a street"*. None of the 40 routes places a saw (`saw(` has no uses). The sign actually replaces roof steam (L1 ledge 11, L4) and generic spike pairs on market roofs.
- The plan treats L28 as *the* Frostline laser case. Every Frostline route (25–32) has 2–4 laser gates and open-air steam. The gust has to cover the whole district.
- Level 1 already has an enemy: `ENCOUNTER_ADDITIONS[0]` puts a crawler on ledge 4 (keys are 0-based stage ids). Remove it. The first enemy is the rook on L4.
- Level 4 as played is `FEATURE_ROUTES[3]` (the grate stair across four streets, with a crawler and a moth), not the `campaign-opening.ts` entry. Its beat sheet targets the feature route.
- The 165 px figure is flat air travel. Rising landings shrink it (+40 gives ~140, +64 gives ~118). Several current "+40 after 150 px" gaps (L1 ledge 2→3) sit at the edge of the test band and should not be teaching gaps.

## 2. Story spine

The premise, shown and not explained: the city's light runs up wires and pipes to one dawn engine in the high towers. When the blackout came, Mira, its keeper, pulled every light inward to stop it failing. That is why the homes are dark. She left before you woke and left her window open, and you carry her lantern. Each district shows one more piece of where the light went. Speech stays short, one line heard and one after. Every person, lamp and bell is optional, and no exit waits on them.

Repetition cut. There is at most **one** optional lamp chain per district, and the other "relay/signal" chapters change to a visible event. Mira's trail is physical: a red thread on a chimney, her chalk tally marks, a glove, a seedling. There is at most **one written note from Mira per district**. Other memories become objects you see.

| District | What the player sees in the place | Beat |
| --- | --- | --- |
| Old Quarter | Your own roof, Mira's window open with the curtain moving. Dark windows with candles behind curtains. Wires sagging off every house toward the far towers. Her chalk tally on chimneys. | People are home and waiting. By L8 the windows you passed are lit behind you. |
| Mossworks | Dry beds. Irrigation pipes run uphill out of the garden toward the factory. Sprouts along Mira's route. | The engine drank the garden's water too. The rain at L14 is the payoff. |
| Clockworks | Wires from every district enter one building. A board of house lights dims as you climb past it. Workers on shift. | Mira's radio voice (L23). At L24 the engine stops and the homes stay lit, so sharing works. |
| Frostline | Storm, a ridge, a stone shelter with a fire, a lens hut with an empty case. | The lantern you carry holds the missing half of the lens (L31). The road of light opens (L32). |
| Afterglow | The towers seen from the Quarter since L1, the sky bridge, the engine heart, an airship. | You find Mira (L34). The heart opens (L37). Share or carry home (L39–40), offered and never gated. |

Chapter decisions (titles stay, so saves and the journal still match):

- **Stay as written** (the place carries them): 1, 2, 3, 5, 10, 12, 13, 15, 19, 20, 22, 25, 28, 29, 31, 33, 34, 36, 38, 40.
- **Merge** (one thread across two levels; the second level shows the consequence with no new errand):
  - 4→8: L4's lamps are the district's chain. On L8 the bridge lamps light themselves as you cross.
  - 6→7: Oren's "the engine is still breathing" becomes the lift that L7 rides.
  - 9→14: L9 shows the dry beds. L14's rain answers them, and L9 drops its wheel errand.
  - 11→16: L11 is Mossworks' one lamp chain. L16's tree lights on arrival as the moths rise.
  - 17→21: Ren's wheels become one thread.
  - 18→23: the clock becomes the radio.
  - 26→30: intake to geothermal.
  - 27→32: bells to lens.
  - 35→39: sky lamps to observatory.
- **Change the visible event:**
  - 6: pipes knock back and light runs under the grates.
  - 8: the lit windows behind you, then one green answer.
  - 24: a quiet floor, homes lit above.
  - 26: water heard moving.
  - 27: bells ring and the aurora answers. No lamps.
  - 30: snowdrops at warm stones.
  - 32: the lens unfolds.
  - 35: light climbs from every district below.
  - 39: the balcony turns to dawn.
- Endings `share` and `home` stay word for word. Lamps, wheels and bells keep their `activated` state for the journal. They never gate the gold exit.

## 3. Old Quarter beat sheets (levels 1–8)

Each sector starts at a checkpoint. A *rest* is a wide deck (≥ 240 px) with nothing urgent, where a person or a view can sit. First-appearance rules:

| First… | Allowed at | Rule |
| --- | --- | --- |
| Spike (gutter tooth) | L1 sector 3 | Single tooth on a ≥ 300 px roof, mid-deck, after ≥ 6 non-lethal gaps |
| Lethal fall | L1 sector 3 | After the tap lesson. Gap ≤ 128 px flat. |
| Dash gap | L2 sector 2 (safe), L3 sector 2 (lethal) | Missing the L2 one drops you one flight |
| Crumble | L5 sector 0 | One tile over a lower roof 48 px down |
| Enemy (rook) | L4 sector 1 | On a ≥ 260 px roof ridge, never in a gap lesson |
| Steam | L6 sector 0 | A pipe vent on a 300 px floor, nothing else in view |
| Moving deck | L3 sector 0 | A barge tied 32 px off the quay |

**L1 The Window Left Open. One terraced street, Nell's house at the end.** Each terrace is a single continuous roof made of joined houses. Gaps are alleys and the one real street. Remove: the ledge-3 spike, the ledge-11 roof steam, the crumbles, and the L1 crawler.

- *Demonstrate, "Our roof":* start on Mira's roof (300 px) by her open window. Alleys of 48 and 64 px, flat. A lean-to 48 px below each one catches a miss, with a step back up.
- *Practise, "Washing lines":* alleys of 96, 112 (+32) and 120 px. Yards below have crate steps, so misses still cost time and nothing else.
- *Twist, "Low eaves":* a dormer eave 52 px above a 96 px gap. A full jump bonks and drops you into the yard; a tap clears it. Then a chimney step of +64 over 72 px that a tap cannot reach. One spark sits on the eave roof for players who experiment.
- *Test, "The street":* one gutter tooth (22 px) mid-roof on a 300 px deck. A 128 px gap over the street, which is lethal. Then a 96 px landing and a tooth pair at the far edge, approached by a 112 px gap with a 120 px landing before the teeth.
- *Rest:* Nell's roof, 340 px. The kettle steam comes from her chimney and is decoration only.

**L2 A Bell Above the Rain. Inside one bell tower, stair landings around a shaft.**

- *Demonstrate:* switchback stair landings, rising +40 over 64–80 px gaps. A miss drops one flight.
- *Practise:* bell-frame beams under a 52 px ceiling: taps of 80–96 px, the L1 rule in a new place.
- *Twist, "The broken flight":* a missing stair, 184 px flat. The first dash, with the landing below still there. A glint marks the dash refill on landing.
- *Test:* alternate sides, a 200 px dash gap, a +40 jump over 112 px, then a 96 px catch. A miss costs one flight (two at most). No spikes in L2.
- *Rest:* Ivo's landing (240 px, checkpoint), then the belfry. Ivo stands on a landing, not in empty air.

**L3 The Last Ferry. Stone quay, piles and moored boats on the canal. Water is lethal.**

- *Demonstrate:* a barge tied 32 px off a 300 px quay drifts 20 px. Step on, ride, step off.
- *Practise:* jump 96 px onto a barge moving toward you, then 112 px onto a pile cap (96 px wide).
- *Twist:* the first lethal dash, from a moving barge to a fender 192 px away. The quay behind is the retry.
- *Test:* two barges out of phase, and a 208 px dash between them onto a 120 px deck. Spikes only as broken fender bolts on pile tops, never on the quay walk.
- *Rest:* Ada's ferry, on a 320 px deck. The departure bell is optional.

**L4 Windows, Not Stars. Market roofs over four streets (live route `FEATURE_ROUTES[3]`).** Grates are iron fire escapes on house walls.

- *Demonstrate:* a fire-escape stair. Jump up through the grates, and press Down once onto a balcony with floor below.
- *Practise, rook:* the first enemy patrols a 260 px roof ridge, pausing at each end. Stomp it, or dash it on the wide part. Taking a hit sends you back to the checkpoint at the start of the ridge.
- *Twist, shop sign:* one sign under a 280 px awning, seen from a safe step. Pass under it as it swings out.
- *Test, "Across the street":* the full height test, +64 over 80 px onto a dormer, then a 136 px street gap. Signs and a rook stay on separate decks.
- *Rest:* east street arch. The bakery, market and east lamps are the optional chain (they are windows).

**L5 The Roof That Remembers. One long failing roof over a lane.** Crumbles are cracked slate with a dust tell, and they come back after 2.5 s.

- *Demonstrate:* one crumble tile (100 px) over a lower roof 48 px down. Stand still and watch it fall. Walk back.
- *Practise:* a two-tile run (100 + 95 px, gaps 30) onto solid roof, over the same lower roof.
- *Twist:* the dark pressure starts (`pressure:88`). Crumble, then a +40 rise over 96 px, with no waiting.
- *Test:* a crumble pair over the lane (lethal), then a 136 px gap onto a chimney stack (120 px). Gutter teeth only at roof edges.
- *Rest:* Tomas at a chimney, on a 340 px deck.

**L6 Under the Sleeping City. Pipe basement under the street.** Steam only comes from a vented pipe joint drawn on a real pipe run. It dims before it shuts off (the wind-down already exists).

- *Demonstrate:* one vent mid-floor on a 300 px floor. Watch a full cycle.
- *Practise:* a vent at the far edge of a 140 px landing, so you time the landing.
- *Twist:* two vents out of phase across 96 px gaps, then a drop through a grate into a lower duct.
- *Test:* a vent beside a +40 jump over 112 px. A tooth pair becomes a broken-flange spike on a pipe only.
- *Rest:* the street stairwell. Pipes knock back, and light runs under the grates (L6 event).

**L7 The Counterweight. A service tower lift shaft.** Moving decks are lift cages on visible rails. The press is the counterweight itself (`ENCOUNTER_ADDITIONS[6]`). Wheels only speed the lift; they never gate it.

- *Demonstrate:* ride a lift cage 300 px up a shaft with walls on both sides.
- *Practise:* jump 96 px from cage to landing at the top of its travel.
- *Twist:* the counterweight drops on a fixed cycle through a 120 px bay. You see its chain move before it falls.
- *Test:* cage → 184 px dash → landing beside the counterweight bay. Steam only from the machine room's pipes.
- *Rest:* the lift crown, with the glass gardens in view.

**L8 The Quarter's Reply. A bridge between two built banks, the middle span fallen.** A test of the whole district, with no new verb.

- *Demonstrate:* the approach, a 120 px gap with teeth (railing stubs) behind a 120 px landing.
- *Practise:* a rook on the 300 px deck of the bank.
- *Twist:* the broken span. Two crumble planks, then a 200 px dash to the far pier.
- *Test:* +64 over 80 px, a tap under the bridge-house eave, and a 136 px gap. Remove all bridge steam (no source).
- *Rest:* the garden lookout. Turning back, you see the windows lit behind you and one green answer.

## 4. New or replacement obstacles and enemies (four)

| | Gutter teeth | Shop sign | Chimney rook | Ridge gust |
| --- | --- | --- | --- | --- |
| In the world | Broken iron gutter at a roof edge | Hanging trade sign on a wall bracket | Mechanical roof bird that nests in chimneys | Wind over an exposed span |
| District | Old Quarter roofs (Mossworks glasshouse gutters) | Old Quarter market (L4), reprised on L8 houses | Old Quarter and Mossworks roofs | Frostline ridges (25, 27, 28, 32) and the Afterglow sky bridge |
| Telegraph | Shown as part of the roof-edge tile, rust-orange teeth, never floating | Creak, then a 2-frame swing with a visible arc and its shadow on the awning | Stops and turns its head at each end of the ridge, 0.4 s before turning | Snow streamers and a pennant on a cairn. A visible lull of at least 1.2 s each cycle. |
| First meeting | L1 sector 3: a single tooth on a flat roof | L4: seen from a step beside the awning, before you walk under it | L4 sector 1, on a 260 px ridge with no gaps | L25: a gust over a 300 px snowfield (no fall). L28: over a gap. |
| Test | L1 street-gap pair; L5 roof edges | L4 test plus a jump | L8 bridge; Mossworks moving decks | L28 mid-jump, with a boulder windbreak as the timing cue |
| Counter | Tap over it, or land short | Pass under it as it swings away | Stomp (counts as a stomp bounce) or dash through it. Defeat gives no score. | Jump in the lull or stand behind a windbreak. The dash still crosses. |
| Replaces | Generic spike pairs across OQ | Roof steam (L1, L4) and spike pairs on market roofs | The homeless L1 crawler and the OQ crawlers | Every Frostline laser and the open-ridge steam |

The gust is today's airborne `wind × sin(0.8t)` (about 7.9 s period) made visible and given a lull. Frostline steam stays only inside the L26 intake house and at the L30 ground vents. Clockworks lasers stay as exposed contacts in a machine. Afterglow lasers each need a visible apparatus or they go to gusts. No boss. No attack that hides its counter. Moths stay in Mossworks and Clockworks only where something lit attracts them.

## 5. Non-goals

- **Score formula** stays: 1000 per level + 100 per spark (3 a level) + pace bonus up to 250 (−2 per active second, −25 per setback). The cap stays 62000. Defeats give no score. `rankScore` and `normalizeLastLightScore` are not touched.
- **Leaderboard**: no new keys, boards or migration.
- **Engine**: the custom Canvas 2D game at 120 Hz stays. No Phaser or any other engine port.
- **Controls**: arrows, Space/Up, Right Shift, Enter, Down through grates, plus keyboard, mouse and touch, unchanged. No new buttons for new obstacles.
- **Locking the exit behind story**: no person, lamp, wheel, bell, memory or the ending choice gates a gold exit. Wheels may shorten a route but never open the only one.
- Also out: new playable abilities, a 41st level, changes to district order, and rewriting `ENDINGS` text.
