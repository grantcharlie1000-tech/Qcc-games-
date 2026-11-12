# Breachline

An original five-a-side tactical first-person shooter for the browser. It belongs to the attack-and-defend genre
(two squads, no respawns, destructible walls, a preparation phase, an objective to arm or protect) and copies no
game's name, characters, maps, art or sounds. The squads, kits, weapons and the Tidewater Annex are its own.

It was requested as a remake of a commercial shooter "matching graphical and audio quality". That is not what this
is, for two reasons that should stay written down:

- A recreation of a specific existing game is out of scope; a genre game with its own content is in scope.
- A browser game that must hold 30 fps on a Chromebook cannot look or sound like a large-studio console title. The
  design below spends the frame budget where this genre needs it: readable destruction, sight lines and sound.

## One mode: Uplink

| | |
| --- | --- |
| Squads | Azure (◆) and Ember (▲), up to 5 v 5. Colour is never the only cue: each squad has a shape. |
| Round | 20 s preparation, then up to 2:45 of action. No respawns. |
| Attackers win | by arming the uplink in the Lab (A) or the Archive (B) and keeping it running for 40 s, or by eliminating every defender. |
| Defenders win | by shutting the uplink down (6 s), by the clock running out before it is armed, or by eliminating every attacker before it is armed. |
| Match | First to 4 rounds. Squads swap roles every 3 rounds. |

During preparation the attackers stand at one of three yard entrances (chosen per round) and pick a kit; the
defenders stay indoors, reinforce walls and barricade doorways.

## One map: Tidewater Annex

A single-storey research annex (30 m x 20 m) in a walled yard (56 m x 44 m): Garage, Lab, Server Room, a corridor,
Lobby, Office, Archive and Break Room. The brick shell has four barricaded doors and ten barricaded windows. Almost
every inner wall is destructible. `map.ts` authors it with wall helpers on a half-metre grid.

## Destruction

Soft walls and barricades are grids of 0.25 m cells (`world.ts`).

- A bullet knocks out the cell it hits and carries on with less damage (62 % through wall board, 78 % through a
  barricade, at most three layers). Holes are real: you can see, shoot and be shot through them.
- Shotgun pellets and melee swings open wider patches; a melee swing takes a big bite out of a barricade.
- A breach charge (attackers) or an impact grenade (defenders) opens a patch more than a metre across. Once a gap is
  wide and tall enough, fighters walk through it (crouched through a low one), and bots route through it.
- A reinforced wall stops everything and cannot be damaged. Each kit carries a fixed number of reinforcements.
- Solid props and the outer shell block bullets and movement.

## Kits

| Role | Kit | Primary | Gadgets |
| --- | --- | --- | --- |
| Attack | Breacher | Halden 12 shotgun | 3 breach charges, 1 frag |
| Attack | Assault | Marrow AR-5 rifle | 1 breach charge, 2 frags |
| Attack | Marksman | Corvin DMR | 1 breach charge, 1 frag |
| Defend | Anchor | Tern C8 carbine | 3 reinforcements, 1 impact grenade |
| Defend | Roamer | Wren-9 submachine gun | 1 reinforcement, 3 impact grenades |
| Defend | Warden | Halden 12 shotgun | 2 reinforcements, 2 impact grenades |

Everyone carries the P-11 sidearm. Head shots multiply damage by 3.5. There is no friendly fire; your own
explosives can hurt you.

## Controls

Desktop and Chromebook: W A S D move, mouse or trackpad looks (arrow keys also look), click fires, right-click or
**Space** aims (Space suits a trackpad), Shift sprints, C crouches, Q / E lean, F is held to plant, shut down,
reinforce or barricade, G throws a grenade, B places a breach charge and sets it off, V strikes, R reloads, X or the
wheel swaps weapons, 1 to 3 pick a kit during preparation, Tab shows the scoreboard, P pauses, Esc frees the mouse.
Touch: a move stick on the left, drag to look on the right, and buttons.

## Online

One player hosts a room through the shared room layer (`src/multiplayer/`): Multiplayer, Create room, share the
six-character code or invite link. Up to ten people; bots fill empty seats when they are on.

- **The host is authoritative** for rounds, damage, destruction, gadgets and objectives (`sim.ts`, `HostSession`).
- **Each device runs its own fighter**: movement, stance, lean and weapon handling (`control()` in `state.ts`), so
  moving and firing feel immediate. It reports its pose 20 times a second and sends commands (shot, melee, grenade,
  breach, use). The host accepts a reported position only if the fighter could have walked there: within a sprint's
  distance for the time elapsed, along an open path, not into anything solid, not while frozen. It refuses fire
  faster than the weapon's rate (a short burst may arrive at once), limits melee swings, and takes kit changes only
  during preparation or between rounds.
- **Shots are judged against what the shooter saw**: the host keeps 0.8 s of poses and rewinds targets by half the
  guest's round trip plus 100 ms.
- The host sends **events** (reliable, ordered: destroyed cells, hits, eliminations, phase changes) and **15
  snapshots a second** (poses, health, gadget counts, grenades). Other fighters are smoothed between snapshots.
- A guest who joins mid-match takes over a bot at once and receives the world as it stands. A guest who leaves
  hands the seat back to a bot. There is no host migration: when the host leaves, the room ends.
- When the host pauses (or hides the tab), the room pauses and guests see "Waiting for the host".

Guests still own their ammunition count and their aim, and nothing stops a modified client from aiming perfectly.
It is meant for friends, not a public server.

## Bots

`bots.ts` and `nav.ts`. Bots see through the same sight lines as people, including holes, and send the same
commands. Defenders reinforce and barricade their site during preparation, hold posts, and go for the shut-down.
Attackers split across two entrances, knock out barricades by hand, breach soft walls with charges when that is the
shorter way, plant and guard. Three skill levels change reaction time, aim error and burst length. All randomness
comes from the match seed, so a bot match replays exactly.

## Picture

- Lighting is baked at load into vertex colours (`lightbake.ts`): an evening sun and sky outdoors, ceiling lamps
  indoors, each shadowed by ray tests. Level materials are unlit textured, the cheapest shading there is.
- Every texture is drawn on a canvas at load (`textures.ts`); there are no image files.
- Static geometry is merged into one mesh per texture. Each destructible panel is one small mesh, rebuilt when it
  changes. Fighters are six meshes each. Effects are pooled.
- Resolution adapts: when frames run long the render scale steps down (to 50 %), and back up when there is room.
  The Performance preset renders at 30 fps and a lower scale; simulation and input stay at 60 Hz.

Measured in this repository's container (software rasteriser, 1366 x 768, 5 v 5 with bots): about 1 to 1.6 ms of
script per drawn frame and 0.3 ms per simulation step; 40 to 190 draw calls and 31 000 to 47 000 triangles. Frame
rate on real hardware has **not** been measured here: the container has no GPU. The 30 fps Chromebook target is a
design budget, not a verified result.

## Sound

The guns are real public-domain (CC0) recordings from The Free Firearm Sound Library, trimmed and levelled into one
small Opus pack (`public/audio/breachline/`, credited in `public/THIRD_PARTY_NOTICES.txt`), fetched and decoded
once at the first gesture; everything else is synthesised with Web Audio (`audio.ts`, `audio/`), and the guns fall
back to synthesis if the pack cannot be loaded. Every world sound is panned, fades with
distance, is muffled by what stands between it and the listener (a little for wall board, a lot for brick) and
feeds a shared reverb, so footsteps, reloads and gunfire can be placed through walls. Sound follows the arcade's
sound setting, which is off by default.

## Saving

Only preferences are saved (team size, bots, graphics, look speed). A match in progress is not saved.

## Not in this version

Drones and cameras, operator abilities, more than one floor, vaulting through windows, ranked play, host migration,
and anti-cheat beyond the host's checks.
