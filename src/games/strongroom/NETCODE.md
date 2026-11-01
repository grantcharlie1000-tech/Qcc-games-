# Strongroom authority and wire protocol

Round 2 runs Harbor team elimination. Customs House/objectives, destruction and gadgets are the later M2–M4 work, rather than client-side exceptions to these rules.

`sim.ts` is the only gameplay owner, offline or on the room host. It owns actors, bots, movement/collision, ammunition, reload/fire cadence, hits, health and rounds. `net/session.ts` drives it from a fixed clock; guests submit actions and never submit a position, health or a hit. `render.ts`, the HUD and the client prediction model are presentations of that state. New round models, wall stores and gadget inventories belong in the simulation; their reliable changes extend the existing host event stream. Guest requests must pass the host input parser and action checks. Wall/gadget state must never be mutated by a guest renderer.

The QCC `RoomPanel` creates/joins the actual QCC Room. Room uses PeerJS signalling and the existing Cloudflare TURN function, with the existing public PeerJS relay fallback. No Tiny Strike WebSocket, server, directory or ranking service remains. `Room.sendUnreliable()` sends bounded game envelopes through the negotiated unordered, zero-retransmission channel from Round 1; it retains the existing reliable fallback. Room admission authenticates the peer identity used to select a simulation seat. Room host pause freezes every client; host departure ends the match.

## Rates and clocks

- Normal host: 60 simulation steps/s, 20 snapshots/s. Device-check failure: 30 steps/s. Potato: 30 steps/s and 15 snapshots/s.
- Human inputs: 30 frames/s, the most recent three frames in every packet. A bounded, deduplicating host queue consumes at most one frame per 30 Hz input slot. Its sequence recovery allowance grows only with elapsed host simulation time; a short channel outage cannot permanently strand a current input stream. Packet bursts never grant extra movement time.
- Guests predict local movement using the same collision/movement function, remove acknowledged frames and replay the remaining inputs on each authoritative snapshot. Local rendering interpolates prediction steps; the host interpolates its fixed steps too.
- Other actors use a 100 ms interpolation buffer against the host clock, adjusted for one-way latency. Extrapolation stops at 150 ms.
- The host records one second of capsules at its simulation rate. Hitscan rewinds target capsules at the shooter's view time, capped at 200 ms. The eye and direction come from the host actor's validated input; world line of sight, ammo, fire cadence, team and current life state remain authoritative. Rewind never moves the live actors.

## Packed arrays (version 1)

Positions and velocities use centimetres and centimetres/s; angles use milliradians. All fields below are integers except the first tag. Room's JSON envelope is `{t:'game',d:array}`.

- Input: `['i', epoch, round, ...frames]`, where each of up to three frames has ten integers: `seq, sampleMs, viewMs, strafe, forward, yaw, pitch, buttons, gun, reservedZero`. Axes are −127..127 and diagonals are normalized. The active button mask is Fire=1, Reload=2, Jump=4, Crouch=8, Walk=16, ADS=32, Interact=64. Unknown masks, extra fields, invalid coordinates/angles, invalid guns, stale rounds, repeated sequences and excessive lead are refused. Interact has no effect in this baseline; distance/inventory validation must accompany the M2–M4 actions that implement it.
- Snapshot: `['s', 1, epoch, round, tick, simMs, phase, timerMs, defendScore, attackScore, winner, entityCount, ...entities]`. Each entity has eighteen integers: `seat, x, y, z, vx, vy, vz, yaw, pitch, hp, mag, reserve, flags, gun, reloadMs, eliminations, deaths, ack`. Flags: crouch=1, grounded=2, bot=4, attacking=8, Away=16, jumpHeld=32. Names and peer identities arrive in the reliable lobby, not in the frequent snapshots.
- Reliable lobby: `['lobby', lobby]`; start/resync: `['start', lobby, snapshot]`. Lobby includes validated seats/options, seed, rates and a monotonically numbered revision.
- Reliable events: `['events', epoch, eventSeq, round, tick, events, phaseSnapshotOrNull]`. Combat and round events are ordered and scoped to their authoritative round/tick; stale events cannot damage a respawn. Phase state is applied before callbacks. Phase changes carry a complete snapshot so an unreliable loss cannot strand a round transition.
- Guest reliable requests: `['sync']`, `['seat', seat]`, `['away', 0|1]`. Every request is tied to the admitted Room peer; a guest cannot select another guest's identity. Other requests are ignored.

The epoch changes on a new match and sequences reset per round. Old epochs/rounds/ticks and duplicate events are rejected. Bots share the same actor model as humans. Disconnect changes the existing actor to a bot without refilling its equipment; a rejoin waits for the next round. Guest Away zeros input immediately and yields to a bot after 60 seconds. Returning from Away drops the bot's acknowledgement sequence before accepting the human again.

## Development verification

`?test`, `?seed=N`, `?quality=potato` and `window.__game` are development-only helpers (the seed also works in normal play). `?netsim=1` in a development build delays each outgoing game packet by 75 ms and drops 5% of unreliable packets with a reproducible stream. Reliable events are delayed but not lost. Room heartbeat/pause control stays on Room's own path, and the simulation compensates its clock estimate for the injected one-way delay. No CDP network setting is used to claim WebRTC impairment.

The browser scenario asserts actual travel and simulation time before reporting p95 reconciliation correction. It arranges an open Harbor firing fixture and suppresses bot fire while retaining bot navigation, so human damage and the controlled network measurement are deterministic. Separate solo performance runs keep all five bot brains/combat active. Relay-only verification follows Pool: it either completes through a reported relay or verifies a plain failure without a direct fallback. A failure-path pass is not a successful relay gameplay certification.
