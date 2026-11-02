# Strongroom authority and wire protocol

`sim.ts` owns the offline game and the room host's game: stable teams, sides, Pick/loadouts, body types, bots, movement, gun cadence/ammo/damage, rounds, Cracker and soft walls. Guests send inputs and selection requests. They never submit positions, health, hits, inventory counts, objective progress or wall mutations. Rendering and prediction read the authoritative model.

QCC `RoomPanel` creates and joins the actual QCC Room. PeerJS signalling and the existing TURN/relay configuration remain unchanged. `Room.sendUnreliable()` uses the negotiated unordered, zero-retransmission channel, retaining Room's reliable fallback. An admitted Room peer determines the requesting seat. Host pause freezes simulation; host departure ends the match.

## Rates, movement and round clocks

- A capable host runs at 60 simulation steps/s and 20 snapshots/s. A failed device check uses 30 steps/s; potato uses 30 steps/s and 15 snapshots/s. Only a passing medium/high host offers 5v5.
- Human inputs run at 30 Hz. Each packet repeats the last three frames. The bounded queue deduplicates and reorders them, consumes at most one per input slot and bounds timestamp/sequence lead. Packet bursts cannot buy simulation time.
- Guests predict movement with the same collision function, discard acknowledged inputs and replay the remainder. Movement is allowed in Action/Planted and for defenders during Prep; Pick, round end and attacker Prep never replay movement. Remote actors use a 100 ms interpolation buffer, with at most 150 ms extrapolation.
- The host retains approximately one second of capsule history and caps hitscan rewind at 200 ms. World blocking/penetration, current life, teams, ammo and fire cadence stay authoritative. The nearest enemy capsule is found first; one world shot hook resolves hard/soft geometry up to that distance, applying wall damage once.
- Standard 3v3 clocks are Pick 15 s, Prep 30 s, Action 150 s, fuse 40 s and round end 6 s. Every human locking can end Pick early. First to four wins; stable team identities/scores survive the side swap after round three. A 3–3 match has one decider: the team that lost round six gets a 10 s side vote, followed by the normal Pick. Bot-only teams choose Defend; tied human votes use the seeded coin.
- 5v5 uses Prep 40 s and Action 165 s. Quick uses first to three, swaps after round two and Action 120 s.

## Packed arrays: version 2

Positions and velocities use centimetres and centimetres/s; angles use milliradians; times use integer milliseconds. Room wraps the array in `{t:'game',d:array}`. The version is `NET_VERSION=2`; `ONLINE_VERSION` includes the protocol version and production build identity.

Input packets retain their ten-integer frame and primary/secondary **slot**, even though each slot can select a different gun:

```text
['i', epoch, round, ...upToThreeFrames]
frame = [seq, sampleMs, viewMs, strafe, forward, yaw, pitch,
         buttons, weaponSlot, reservedZero]
```

Axes are −127..127, `weaponSlot` is 0 or 1, and the reserved field must be zero. Button bits are Fire=1, Reload=2, Jump=4, Crouch=8, Walk=16, ADS=32, Interact=64, Charge=128, Melee=256 and Impact=512. Bits outside 0..1023, extra frames/fields, invalid angles/slots, stale epochs/rounds and excessive input lead are rejected.

Snapshots contain a 28-field header, `entityCount × 31` integers and one bounded tools extension. Total array length is `29 + entityCount * 31`:

```text
['s', 2, epoch, round, tick, simMs, phase, timerMs,
 scoreTeam0, scoreTeam1, winnerTeam, entityCount,
 attackTeam, pickStage, overtime, sideVoteTeam, outcome, actionElapsedMs,
 site, revealed, objectiveState, carrierSeat, crackerX, crackerY, crackerZ,
 interactionSeat, interaction, progressMs,
 ...entities, toolsOrNull]
```

Header enums:

- `phase`: Menu=0, Pick=1, Prep=2, Action=3, Planted=4, RoundEnd=5, GameEnd=6.
- `attackTeam`: stable team 0 or 1; `pickStage`: loadout=0, side vote=1; `overtime`: 0/1; `sideVoteTeam`: −1 or a stable team.
- `outcome`: none=−1, detonated=0, defenders eliminated=1, attackers eliminated before plant=2, timeout=3, disabled=4.
- `site`: unknown=−1, A=0, B=1; `revealed`: 0/1; `objectiveState`: carried=0, dropped=1, planted=2, disabled=3.
- `carrierSeat`/`interactionSeat`: −1 or a real seat; `interaction`: none=0, plant=1, disable=2. Progress is elapsed hold time, bounded to 0..6000 ms.

Each entity has 31 integers:

```text
[seat, x, y, z, vx, vy, vz, yaw, pitch, hp, mag, reserve,
 flags, weaponSlot, reloadMs, eliminations, deaths, ack,
 operator, primaryGun, secondaryGun, spawnChoice, siteVote, locked,
 carries, sideVote, primaryMag, secondaryMag, primaryReserve, secondaryReserve,
 spottedUntilMs]
```

Flags are crouch=1, grounded=2, bot=4, **stable team 1=8**, Away=16, jumpHeld=32 and **currently attacking=64**. Team and side are separate. Operator indices are Cinder, Wren, Hush, Latch, Cadet. Gun indices are `ak47, m4a1, mp5, smg, awp, px12, glock, usp, deagle`; the player-facing names and stats live in `loadouts.ts`. PX-12 has authored stats but Pick uses the specified first-primary fallback until its M7 model exists. Spawn is Quay=0/Yard=1, site vote is A=0/B=1 and side vote is none=−1/Attack=0/Defend=1. Names and peer IDs come from the reliable lobby.

The parser checks integer ranges, array length, unique seats, legal operator/side/gun combinations, selected-mag consistency, magazine capacity and `attacking === (team === attackTeam)`. Body health resets on the host to Light 100, Standard 112 or Heavy 125; movement applies the selected body/gun multipliers. `spottedUntilMs` is host time: a living defender more than 3 m outside the building is marked for 500 ms every 2000 ms. Returning inside clears the mark.

The tools extension is host-produced presentation state. It is limited to depth 5, 1024 values, 128 entries per array/object and 16 KB serialized; strings/numbers are bounded. Current M3 data is `[1, round, poolTeam0, poolTeam1, stocks, holds, charges]`: stock rows are `[seat, charges, barricades, impacts]`, hold rows `[seat, kind, elapsedMs, durationMs, panel]` and charge rows `[seat, panel, col, cell]`. It grants no authority to a guest. Inventory/pool/placed-charge changes use a reliable `wall` authority event; hold progress also rides ordinary snapshots.

## Reliable requests, events and site visibility

- Lobby: `['lobby', lobby]`. Start/join/resync: `['start', lobby, snapshot]`. Lobby validates seats/options, seed, rates, epoch and monotonically increasing revision.
- Pick request: `['pick', epoch, round, {operator?, primary?, secondary?, spawnChoice?, siteVote?, locked?}]`. The host accepts only the admitted actor's unlocked human seat in loadout Pick. Unknown keys, illegal combinations, defender spawn choices, attacker site votes and stale scopes are refused. Locking is final for that Pick.
- Decider request: `['sideVote', epoch, round, 'attack'|'defend']`. Only humans on the designated losing team can vote during the side-vote stage.
- Other requests remain `['sync']`, `['seat', seat]`, `['away', 0|1]` and scoped wall resync below. Position/damage/objective/wall claims have no request handler.
- Events: `['events', epoch, eventSeq, round, tick, events, authoritySnapshotOrNull]`. `phase`, `pick`, `objective`, `sideVote` and inventory `wall` events attach a complete per-recipient snapshot. Its state applies before callbacks. Old epochs/rounds and repeated event sequences are refused. If a newer unreliable snapshot overtakes a same-round reliable event, shot/elimination/hit cosmetics still dispatch once, with damage HP stripped; the old snapshot and phase changes cannot roll state back.

Each recipient gets its own packed authority snapshot. Unrevealed attackers receive `site=-1`; defender site votes are masked as well. Defenders retain the live-site identifier. An attacker sightline to the marker (25 m maximum, checked at 4 Hz) or 20 elapsed Action seconds reveals it. A plant reveals it immediately. Actor positions remain replicated; the live-site mask is not a full actor interest-management system.

The Cracker position is always available to attackers. Defender presentation checks line of sight before displaying the prop/marker. Pickup takes 0.3 s within 0.8 m; only the living carrier inside the live floor box can plant for 5 s. A living defender within 1.5 m and with line of sight can disable for 6 s. Releasing or moving more than 0.5 m cancels either hold; damage alone does not cancel disable. Eliminating all attackers after planting leaves the fuse/disable round active.

## Reliable wall cells

Each simulation owns its own `WallStore`; host and guest renderers bind their respective store. Hard solids exclude all authored soft spans. Customs House has 78 panels and 1288 cells, including nine soft interior lintels. Lintels start at y=2.25; the upper 0.25 m of their two-row grid is hidden in the hard roof slab. Exterior door/window headers stay hard. Floor reinforcement/breach priorities exclude lintels. Wood openings begin gone, with the authored drone gap.

Wall messages are reliable and scoped outside the store packet:

```text
['walls', epoch, round, ['wd', seq, cell0, state0, cell1, state1, ...]]
['walls', epoch, round, ['wp', seq, panelId, flags]]
['walls', epoch, round, ['wf', roundId, base64CellStates, base64PanelFlags, seq]]
['wr', epoch, round]  // guest resync request
```

`wd` carries deterministic global cell indices and states 0 intact/1 cracked/2 shattered/3 gone. `wp` flags are Reinforced=1, Barricade=2, Attached=4. `wf` packs four two-bit cell states per byte and one flag byte per panel; its fifth element is the sequence baseline. Host/guest derive geometry and cell indexing from the same map definition.

Diffs/panel events share one increasing sequence. A guest applies them only from the room host for the current epoch/round; invalid indices/states/flags are rejected without partial mutation. A sequence gap requests `wr`; the host answers with `wf`. Start/join, each round reset and periodic five-second recovery also send full wall state. The sequence continues across round resets within a match; a new match creates a new store. The store's compact cell field has a deterministic FNV-1a hash for equality checks.

Host tick drains wall packets once. Bullets, melee, reinforcement, barricades and breach mutations originate from validated host actions; no client cell/HP/flag claim is accepted. Visual dirty tracking is independent of packet draining.

## Lifecycle and development verification

Match epochs change on restart. Input sequences reset per round. Disconnect hands the existing operator/equipment to a bot; a new peer taking the seat back at the next Pick clears the old Away marker and can lock normally. An existing connected Away peer keeps its bot across round boundaries until it returns. Away zeros a guest's input immediately and permits bot takeover after 60 seconds; return drops stale bot acknowledgements. Host pause does not advance simulation or objective/tool holds.

`?test`, debug hooks, `?netsim=1` and the explicit Harbor diagnostic map are development helpers. `?seed=N` reproduces bot/vote decisions. Netsim delays game packets 75 ms each way and drops 5% of unreliable packets, preserving reliable traffic and Room's own heartbeat/control path. This is the impairment used by the browser scenario; CDP HTTP throttling is not presented as WebRTC loss.

Node coverage exercises pure round wins, objective holds, body/gun selection and protocol bounds; real Room pairs cover scoped Pick and reliable wall gap recovery. The actual vendor geometry/navigation builders run headlessly against Customs House. Every ordinary node is reachable, edges avoid hard/soft solids and props, tactics/spawn references exist and all attacker pads have protected nearest-opening approaches. Seeded live-combat simulations check at least one bot plant across ten seeds and complete solo matches for a human on either stable team. Browser and real-device evidence belongs in the report; unit timing is not device performance certification.
