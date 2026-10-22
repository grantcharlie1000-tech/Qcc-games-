# Online multiplayer (Pool and Blockcraft)

Two games can be played online between devices: **Pool** (two players) and **Blockcraft** (up to four). Both use one shared
service in `src/multiplayer/`. Everything else in the arcade stays offline and unchanged.

## How a room works

- **Create room** registers a six-character room code (no look-alike characters, e.g. `K7Q2MX`) with the PeerJS Cloud
  signalling server. The player who creates the room is the **host** and runs the authoritative game.
- **Join by code**, or open the **invite link** (`…#/collection/<n>?room=CODE`, from **Copy invite link**; older `#/game/<game>?room=CODE` links work too). The link opens the
  game with the code filled in; the player confirms their name and presses Join.
- Every guest connects to the host only (a star). Messages are JSON over one reliable, ordered WebRTC data channel per
  guest; large messages (Blockcraft worlds) are split into frames and reassembled (`src/multiplayer/protocol.ts`).
- On join the guest sends its protocol version, game and game version. The host refuses other versions (“Reload both
  devices so they match”), other games, and full rooms (“That room is full.”). Unknown codes report “No room with that code
  is open.” Malformed codes are rejected before any network request.
- Heartbeats every 2 s. A silent host ends the room for guests after 10 s (90 s while the host is paused, because hidden
  tabs throttle timers). A silent guest is dropped after 12 s.
- **Leave room** ends a guest’s session, or the whole room when the host leaves. Closing or navigating away from the game
  sends a goodbye first; guests see “The host ended the online game.” and return to their own offline game. Automatic host
  migration is not part of this version.
- **Pause:** when the host pauses (toolbar, Escape/Study Mode, a dialog, or a hidden tab) the room pauses. Guests see
  **Waiting for host**, and the host refuses gameplay actions until it resumes, then resends the current state.

The panel (`src/multiplayer/panel.ts`) uses the arcade’s button styles, works with keyboard, mouse and touch (44 px
targets, labelled fields, status announcements) and shows whether each peer is connected directly or through the TURN
relay. Keys typed in the name and code fields never reach the game.

## Pool

The host’s device runs the only simulation (`src/games/pool/online.ts`), with the unchanged rules and physics in
`model.ts`. Seats are fixed: the host is seat 1 and breaks; the guest is seat 2.

- Guests send numbered commands — `shoot` (angle, power, called pocket), `place` (ball-in-hand position), `pocket` — each
  made against a state revision. The host refuses commands that are duplicated (old sequence number), stale (another
  revision), out of turn, sent while balls move or while paused, and anything the rules reject. Refusals are reported to the
  guest (“It is not your turn.”).
- While balls roll the host streams ball positions every 50 ms (0.1-unit precision and a pocketed mask); the guest plays them
  back about 100 ms behind with interpolation. The guest never simulates physics.
- Every change (shot start, settle, placement, pocket choice, new rack) sends the complete authoritative state, so pockets,
  fouls, ball-in-hand, turns, groups and the winner are always the host’s.
- Aim (angle and power) is shown to the other player as it changes.
- Online racks are not saved; the shell keeps saving the offline game, which comes back when the room ends. The host’s
  Restart starts a new online rack; a guest’s Restart is refused.

## Blockcraft

Choose **Multiplayer** in the start or game menu (in Pool, the **Multiplayer** button beside Players). The menu floats in the centre of the screen over the game, so nothing in the game resizes; close it with ✕ or by clicking outside it. The host’s world becomes the shared world, saved on the host’s device under
its own key (`mp:blockcraft:world`), separate from the single-player save. Guests keep their single-player world aside and get
it back when they leave or the host goes.

**Joining.** The host sends a snapshot: seed and world generation version, every block edit (including unloaded chunks),
chests and furnaces, time, weather, world rules and where the guest stands. The guest regenerates terrain from the seed and
applies the edits. Block updates carry a sequence number continuing from the snapshot, so changes made while a guest is
joining apply in order afterwards (a gap triggers a fresh snapshot).

**Authority.**

| Runs on the host | Runs on each player’s device |
| --- | --- |
| Blocks: validates every guest edit, then applies it so fluids, supports, fire and growth react | Own movement and physics (reported 20×/s; others see it smoothed) |
| Mobs, AI and spawning around every player; dropped items, experience orbs, projectiles | Own inventory, crafting, armour |
| Chests and furnaces (contents, smelting), with one user at a time | Own hunger, air, environmental damage (fall, lava, drowning) |
| Damage from mobs, arrows and explosions to every player | Death screen and respawn (at the world spawn or own bed) |
| Time of day, weather, world rules (mode, difficulty, game rules) | Rendering, sound and settings like view distance |

- **Guest block edits** apply at once on the guest and go to the host as one request per action (e.g. both door halves).
  The host accepts it only when every cell still holds what the guest saw (so of two simultaneous edits the first wins), the
  cells are within reach and loaded, nothing is placed inside another player, the rate is reasonable, and the change is
  possible with the item in hand (survival). Otherwise the guest gets the host’s blocks back and a short reason.
- **Loot** for a guest’s mining is rolled by the host with the guest’s tool; items and experience go to whichever player
  picks them up. Guests report how much inventory room they have, so items only fly to someone who can take them.
- **Mobs** chase, hit, push and shoot the nearest targetable player, and explosions hurt and throw guests too.
  Damage is sent to the player’s device, which applies armour and shields.
- **Entities** are sent to each guest within 80 blocks: full records when new, then only states that changed (positions to
  1 cm, angles to 1 mrad), data when it changed, and removals. Guests move copies smoothly toward the latest states.
- **Chunks** stay generated, lit and simulated within 4 chunks of every guest on the host, as well as around the host.
- **Characters.** Every player is drawn to the others as an original blocky character in its seat colour, with a name tag
  and health bar.
- Guest progress (position, inventory, health) is stored in the host’s world save by name, so a guest who rejoins that
  world gets it back.

## TURN relay and the Netlify Function

Direct WebRTC fails on some networks (symmetric NAT, strict firewalls, many school networks). The client then needs a TURN
relay. `netlify/functions/turn.mts` issues temporary Cloudflare TURN credentials:

1. In the Cloudflare dashboard, open **Realtime → TURN Server** (Calls/Realtime) and create a TURN key. Note the **Turn Token
   ID** and its **API token**.
2. In Netlify, **Site configuration → Environment variables**, add (scope: Functions):
   - `CLOUDFLARE_TURN_KEY_ID` = the Turn Token ID
   - `CLOUDFLARE_TURN_API_TOKEN` = the API token
3. Redeploy. The function answers `POST /.netlify/functions/turn` with `{iceServers, ttl}` (credentials valid for one hour)
   by calling `https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers`.

The master token never reaches browsers. The function accepts only same-origin POSTs, returns `Cache-Control: no-store`, drops
port-53 URLs (browsers block them), and is rate-limited twice: Netlify’s rule (20 requests per minute per IP, in the function’s
`config`) and an in-memory limit of 6 per minute per client per function instance. Without the variables it answers 503 and the
game falls back to **PeerJS’s free public relay** (`turn:eu-0/us-0.turn.peerjs.com:3478`, the relay PeerJS Cloud configures by
default). That relay is shared, rate-limited and best effort: it lets most phones on blocked networks connect, but for reliable play
at school configure Cloudflare TURN. The panel then notes “The private relay is not configured here. If a direct connection is
blocked, the free public relay is tried (best effort).”

A failed join on such a network used to show “The connection failed (negotiation-failed)”: the devices reached each other through
signalling, but no direct or relayed path existed. It now says the network may block device-to-device connections.

**Testing a forced relay:** add `?relay=1` to the game link (e.g. `#/game/pool?relay=1`, or an invite link with
`&relay=1`). Every connection then uses `iceTransportPolicy: 'relay'`. The panel shows “Connected through the TURN relay” only
when the selected ICE candidate pair is actually a relay pair (read from `RTCPeerConnection.getStats()`); a direct pair shows
“Direct peer-to-peer connection.”

## Content Security Policy

`netlify.toml` and `public/_headers` add `https://0.peerjs.com wss://0.peerjs.com` (PeerJS Cloud signalling) to
`connect-src`. The TURN function is same-origin. STUN/TURN traffic itself is not governed by `connect-src`. PeerJS is loaded
only when a player opens online play.

## Versions

- `PROTOCOL_VERSION` (`src/multiplayer/protocol.ts`): room messages.
- `POOL_ONLINE_VERSION` (`src/games/pool/online.ts`): bump when Pool rules, physics or messages change.
- `BLOCKCRAFT_ONLINE_VERSION` (`src/games/blockcraft/net/protocol.ts`): network messages, `WORLD_GENERATION_VERSION`
  (bump whenever terrain generation changes) and the save format.

## Limitations of this first version

- No host migration: the room ends when the host leaves.
- Guests’ inventories, crafting and personal survival stats run on their own devices. The host checks block edits (each cell
  once per action, current contents, reach, loaded chunks, no block inside another player, edit and break rates, and that the
  change fits the item in hand), hits (reach, damage cap, rate), drops, experience and spawns (near the guest, rate) — but it
  does not keep its own copy of each guest’s inventory, and reach is measured from the position the guest reports. A modified
  client could still create items it does not own or skip mining time. This is meant for friends in one room, not a public
  server.
- Room admission: a connection must say hello within 10 s with a message under 4 KB; at most 8 connections may wait at once.
  Guest records in the host’s save are kept for the 24 most recent names, keyed by display name.
- Blockcraft guests cannot shear, milk, breed or tame animals, and only the host can sleep through the night (a guest’s bed
  still sets its respawn point). Wolves follow and defend the host only; endermen and slimes react to the host only. Lightning,
  snow layers and rain sounds happen around the host only; guests see the weather but not the bolts.
- No player-versus-player damage.
- The host’s death screen pauses the room until the host respawns (the world only runs while the host plays).
- Two independent sessions were tested on one machine; testing on actual QCC Wi‑Fi is outstanding.
