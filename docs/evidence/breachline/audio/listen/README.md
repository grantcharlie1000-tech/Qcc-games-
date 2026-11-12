# Breachline sound: listening guide

## One round in sound (2026-11-12): please play this first

`c2-round-in-sound.wav`: a whole round in one minute, stereo. Prep (a reinforcement going up, a barricade), go,
distant fire, a breach blast, the fight through the hole, a grenade, a far blast, furniture breaking, the uplink
planted and defused, the win. New since the first version: the blasts fall away naturally instead of holding flat,
and the wall crumbling, gear, melee, swap, tape, bounce, hammer and the room tone are now real.

- **Real:** almost everything.
- **Still synthetic:** the round cues, hit markers and uplink beeps; the sofa (fabric) break; the grenade throw;
  the defuse.

The `b3-*` files below were re-rendered with the new real breaks, hits, reinforcement and weapon drop.

## Phase 3: footsteps, impacts, glass, bodies (2026-11-12)

| File | What it is | Real, derived or synthetic |
| --- | --- | --- |
| `b3-footsteps-by-floor.wav` | Walking on asphalt, grass, concrete, tile, lino, carpet, boards, the raised metal floor, chequered tile | **Real**: concrete, gravel (for asphalt), grass, parquet (boards), tile, metal stairs (raised floor). **Derived**: lino (tile, lower and softer), chequered tile (tile, slightly higher), carpet (parquet, heavily damped). The occasional gear rustle is synthetic. |
| `b3-crouch-walk-sprint.wav` | Crouching, walking, sprinting on tile | Real steps; crouching is much quieter and duller |
| `b3-impacts.wav` | A bullet stopping in: wallboard, concrete, brick, wood, fabric, earth, ceiling tile, floor tile, plastic, glass, cardboard, metal, leaves | **Derived** from real hits (no licensed bullet impacts exist): wallboard and brick (a hammer on concrete and falling stone, re-pitched), concrete (hammer and stone), wood (paintball hits on wood). **Real**: glass, metal (a steel bar). **Synthetic**: fabric, earth, ceiling tile, floor tile, plastic, cardboard, leaves. |
| `b3-glass-and-breaks.wav` | A pane cracking then shattering; then furniture breaking: wood, steel, fabric, a shelf, a drum, a crate | Glass **real**; the furniture breaks **real** except fabric. Since this set: boards and frames falling off a broken wall use the real wood hit, and the shotgun hull is derived from real casings. |
| `b3-bodies-and-reinforcement.wav` | Hits on flesh and armour, a body falling and settling, a dropped weapon; then a reinforcement deploying | All **real** |
| `b3-breach.wav` | The breach scene with everything together | Mixed |

No more ricochets: the only licensed ones are Western-film ricochets, the cartoon sound you rejected.

## Reloads, second pass: each gun its own, real casings (2026-11-12)

| File | What to listen for |
| --- | --- |
| `a3-reload-ar.wav`, `-carbine`, `-smg`, `-shotgun`, `-dmr`, `-pistol` | Each weapon's reload with ammunition left, then from empty. The AR and carbine now differ, each with real rifle handling under the magazine and a real rifle cocking for the bolt. The DMR ends an empty reload with a **real bolt-action cycle**. The pistol slide is real. The new magazine comes out of a real cloth pouch, and from empty the old one hits the floor (a real metal drop). |
| `a3-automatic-casings.wav` | AR, carbine and SMG bursts: the spent cases tinkling afterwards are now **real cases on concrete** (9 mm, 5.56 mm, 7.62 mm by gun). |

Which sounds are real and which are "derived" (real recordings repurposed, because no licensed take exists):
- **Real:** the guns; casings; pistol magazine, slide and hammer; shotgun shells and pump; the AR and carbine
  magazines and bolts; the DMR bolt; the pouch and cloth; the magazine drop; the handling clicks.
- **Derived:** the SMG magazine (the pistol magazine pitched down over real rifle rattle) and the SMG bolt (a real
  rifle cocking pitched up).
- **Still synthetic:** the shotgun hull hitting the floor.

## Route A, step 2: reloads from real handling recordings (2026-11-12)

You said the reloads need work. Each reload is now a sequence of **real recorded handling sounds** (CC0, from
OpenGameArt: zer0_sol's handgun and shotgun reloads, SpringySpringo's gun reloads, LFA's equipment clicks), one per
step of the reload animation, with small handling clicks between steps and a little natural timing and level drift.

| File | What to listen for |
| --- | --- |
| (`a2-reload-*.wav`, removed: replaced by `a3`) | Each weapon's reload with ammunition left, then from empty. From empty, the magazine drops to the floor and the bolt or slide slams home at the end. The shotgun loads shell by shell (and from empty, one through the port and a pump first). Does it sound like real hands on a real gun? |

Still synthetic: the cloth move as a new magazine comes out of the pouch, and the magazine hitting the floor (no
licensed recording yet). The AR, carbine and DMR share one rifle reload recording; the SMG uses it slightly
faster. More takes are being sought.

## Route A, step 1: the guns from real recordings (2026-11-12)

You chose A. All six guns are now **real public-domain (CC0) recordings** from The Free Firearm Sound Library by
Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney: AR-5 = AR-15, Tern C8 carbine = SKS (so it differs
from the AR), Wren-9 SMG = Carl Gustav M45 9 mm, Halden 12 = Benelli Nova and Winchester Model 12, Corvin DMR =
Mosin-Nagant, P-11 = Walther PPQ 9 mm. We cut and levelled them; the game's own rooms, walls and distance do the rest.

| File | What to listen for |
| --- | --- |
| `a1-gun-ar.wav`, `-carbine`, `-smg`, `-shotgun`, `-dmr`, `-pistol` | Each gun four ways: your shot in the Lab, your shot in the yard, someone else's 10 m away indoors, someone else's 60 m away outdoors. Do they sound like those guns? Does indoors sound like a room and outdoors like open air? Is the 60 m shot believable? |
| `a1-automatic.wav` | Two-second bursts from the AR, the carbine and the SMG. Does any of them sound like a loop? (The AR library has only two close takes, so the game also uses two blends of them.) |

Still synthetic for now: the shotgun pump, the spent cases (and all reloads, which are next).



**`decision-A-real.wav`**: the rifle and the shotgun built from **real public-domain (CC0) recordings** from The Free Firearm Sound Library by **Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney**, trimmed and played through our own rooms, walls and distance. **`decision-B-fitted.wav`**: the same moments from our own synthesis, refitted to measure like those recordings.
Each file plays the rifle then the shotgun, four ways each (your shot in the Lab, your shot in the yard, someone else's 10 m away indoors, someone else's 60 m away outdoors), then a two-second rifle burst. In both, the shotgun pump and the spent cases are still synthetic: there are no real takes of those yet.
Which do you want: A (real recordings in the game, credited), or B (our own synthesis)? Nothing from the recordings is in the game until you say yes.

Nobody building this sound can hear it. These files are how you judge it. Please use headphones or decent speakers at
a normal volume, and tell us what sounds wrong, in any words you like ("the rifle sounds like a cap gun", "the
corridor is too echoey"). Your verdict is the final gate for every phase.

All files are generated by the game's own sound code, rendered offline. Nothing is a recording or a downloaded sound.

## Phase 1: the mix and the rooms

The sounds themselves are still first drafts (guns are rebuilt in phase 2, footsteps and destruction in phase 3).
What phase 1 changed is everything *around* them: rooms, walls, distance, loudness. Listen for that.

| File | What it is | What to listen for |
| --- | --- | --- |
| `p1-corridor-firefight.wav` (9 s, stereo) | You in the corridor: your rifle bursts, an enemy carbine far down the corridor, an SMG behind a soft wall to your left, footsteps, a hit, a wall crumbling, a reload, a marksman rifle behind brick. | **Compare with `../baseline/scene-corridor-baseline.wav` (the old sound).** Your own gun should sit clearly on top. The enemy down the corridor should sound further away and ring in the corridor. The SMG behind the wall should sound muffled and come from the left. The marksman rifle behind brick (around 5.6 s and 6.1 s) should be a dull thud. Nothing should crackle or distort. |
| `p1-breach.wav` (6.5 s, stereo) | A breach charge set on the wall beside you, the blast, the wall coming down, shotgun and rifle fire through the hole. | The blast should be big but not distorted (the old sound clipped here). Everything should go briefly dull right after the blast, then open up again. |
| `p1-rooms.wav` (four shots) | The same rifle shot of yours in four places: a carpeted office, the hard Lab, the corridor, the open yard. | Each should sound like a different place: the office short and dead, the Lab a hard ring, the corridor a longer, fluttery ring, the yard an open slap with a long thin tail. |
| `p1-walls.wav` (four shots) | Someone else's rifle 12 m away: in the open, through one wallboard, through three, through brick. | Each step should be clearly more muffled and quieter. The open one should be bright and close; the brick one a distant thump. |

What we already know is weak: the gunshots themselves (synthetic, light in the low end), footsteps, reloads and
destruction are first drafts and will be rebuilt in phases 2 and 3.

## Phase 2: the guns and reloads

**Owner's verdict (2026-11-12): "nothing like actual weapons, super cartoonish". Failed.** The guns are being rebuilt against real recordings; see STATUS.md for the diagnosis. These files are kept as the record of what failed.

Every gun is built from the same five parts in its own proportions: the crack (the bullet), the blast (the gas),
the punch (the low thump you feel), the sizzle (the air right after the crack) and the action (the bolt or slide,
heard only by whoever is firing). Each has six versions, so automatic fire should never sound like a loop.

| File | What it is | What to listen for |
| --- | --- | --- |
| `p2-gun-ar.wav`, `-carbine`, `-smg`, `-shotgun`, `-dmr`, `-pistol` | Each gun four ways: your own shot in the Lab, your own shot in the yard, someone else's 10 m away, someone else's 60 m away outdoors. | Can you tell the six guns apart with your eyes closed? Does your own shot feel weighty (a thump, not a pop)? Does the yard shot ring out longer than the indoor one? Does 60 m sound like a distant pop rather than a quiet copy? The SMG and pistol have no supersonic crack on purpose. |
| `p2-automatic.wav` | A two-second burst from the AR, then from the SMG. | Each shot should be distinct, with no machine-gun buzz, no obvious repeating pattern, and a few spent cases tinkling at the end. Is it tiring to listen to? |
| `p2-reloads.wav` | Rifle reload (magazine not empty), rifle reload from empty, shotgun loading shell by shell from empty, pistol reload from empty. | The empty reloads end with the bolt or slide slamming home. The shotgun should go "pump, then shell, shell, shell". The magazine seating should be a firm click, not a boom. |

What we already know is weak: the sounds are synthesised and will not pass for recordings; the SMG and pistol are
the least distinctive pair; reloads are clean but simple (no hand or cloth detail between the beats).
