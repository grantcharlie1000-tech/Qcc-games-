# Breachline sound overhaul: assessment and plan

Date: 2026-11-11. Companion to `2026-11-11-breachline-visual-overhaul.md`. The owner asked at the outset for sound
to match a large-studio shooter, has ruled that **sound effects must be our own work** (nothing downloaded, from any
pack, under any licence), and has shown a reference artifact by the same model family whose sound is far ahead of
Breachline's. This is the assessment, the plan, and the contract for the session that carries it out. It was
reviewed twice; the log is at the end.

Roles: the commissioning session plans and reviews. An Opus 5.5 session builds.

## 1. Where the sound is today

`src/games/breachline/audio.ts`, 183 lines, written without ever being listened to:

| | Today | Score /10 (8 = would not stand out in a 2009 console shooter) |
| --- | --- | --- |
| Gunfire | Three noise bursts and a sine thump per shot, one recipe scaled per weapon, no variation between shots, no tail that differs indoors and out | 2 |
| Space | One synthetic impulse response for everything; stereo pan only | 2 |
| Reading the fight through walls | Low-pass and gain by what blocks the straight line | 4 |
| Foley (steps, reloads, gear) | One thud per step; four clicks for any reload | 2 |
| Destruction and explosions | Noise bursts; no debris settling, no pressure, no ear ring | 2 |
| Mix | One compressor; no buses, no ducking, no loudness targets | 2 |
| Ambience and music cues | Filtered noise and a mains hum; short note runs | 2 |

## 2. What is achievable, and what is not

- **Everything stays synthesised in the browser.** That is the owner's rule and it is enough: the reference artifact
  (https://claude.ai/artifact/BGY1SztrAYcJQHSsnHHGmp) builds separate buses (world, near, gun, music), two
  convolution reverbs and ducking from Web Audio alone. Study its source statically for technique. Do not run it and
  do not copy its code or its sounds' character; Breachline keeps its own.
- **Synthesised gunfire will not be mistaken for a recording.** Real gunshots are chaotic; the aim is weighty,
  distinct, non-fatiguing and informative, which layered synthesis can reach. Say honestly where it lands.
- **Nobody building this can hear it.** The build container has no speakers and the agent has no ears. Verification
  is therefore by measurement and by pictures of the sound (section 6), and **the owner's ears are the final
  gate**: listening files are committed for that purpose.
- **Chromebooks:** audio runs on its own thread but competes for the same two to four cores. Budgets in section 5.

## 3. Design

### 3.1 Render once, play many

Rich sound built live from oscillators costs too many nodes per shot. Instead, **pre-render** each sound's layers
into `AudioBuffer`s after the first user gesture. *(Changed in phase 1, approved by the planner: the rendering is
plain-JavaScript DSP in a same-origin module worker, with a chunked main-thread fallback, rather than
`OfflineAudioContext`, so the same generators run in Node unit tests and the buffer measured is byte-identical to the
buffer played. Budgets are checked with the main thread throttled 6x.)* The rendering runs progressively (most-needed first, so
nothing blocks); play-time then plays buffers. Each sound gets several variants (round-robin, never the same twice in a row)
plus small random pitch and level changes at play time. All generators are deterministic from a seed.

### 3.2 Bus graph

```
own weapon ─┐
near foley ─┼─► dry mix ─┬────────────────► master limiter ─► out
world (3D) ─┤            ├─► room reverb ──►
ambience ───┤            └─► far reverb ───►
stingers/UI ┘  (ducked by own gunfire and by nearby blasts)
```

- A limiter on the master; loudness targets per bus (section 5); the player's own weapon sits on top of the mix,
  world sounds duck briefly under it, ambience ducks more.
- A nearby explosion closes a low-pass over everything for about a second and adds a faint ring, scaled by distance
  and reduced-motion-safe (no flash, no shake: this is audio only, and it must stay comfortable).

### 3.3 Space

- **Reverb:** synthesised impulse responses for at least four spaces — small hard room (Lab, Server Room), soft room
  (Office, Archive), corridor, and the open yard (short slap from the walls, long thin tail). The listener's room
  picks the send; a source in another room is sent through *its* room's response first. Early reflections are part
  of the response, not an afterthought.
- **Placement:** `PannerNode` with HRTF for the few sounds that matter most at any moment (nearest gunfire and
  footsteps, capped), equal-power panning for the rest. Distance roll-off per sound class. Distant gunfire arrives
  late (speed of sound) and darker.
- **Through walls:** keep the existing obstruction query (open, one to three soft layers, solid) and make each
  state sound different, not just quieter: a hole in a wall must audibly open the sound up. Stretch goal: bend the
  apparent direction toward the nearest doorway or breach when the straight line is solid.

### 3.4 The sounds

| Group | Requirements |
| --- | --- |
| Weapons (six) | Each has its own identity built from layers: mechanism, crack, body, low thump, and a tail that differs indoors and outdoors; a distant version; a dry-fire click; fire-selector and safety are not needed. First-person and third-person versions differ. The shotgun has a pump cycle. Sustained automatic fire must not sound like a loop. |
| Reloads | One sound per beat of the reload timeline (magazine release, out, pouch, in, seat, bolt or slide), from `reloads.ts` (section 4), so sound and animation stay in step. Tactical and empty reloads differ. Shotgun loads shell by shell. |
| Movement | Footsteps for every floor surface in `map.ts` (asphalt, grass, concrete slab, tile, lino, carpet, boards, raised metal floor), at least four variants each, scaled for crouch, walk and sprint; gear rustle; crouch and lean movement; landing a vault is not needed. |
| Destruction | Bullet through wallboard, through a barricade plank, into brick, concrete, metal, wood; board crumbling under sustained fire; a breach with a pressure thump, splintering and debris that keeps settling for a second; reinforcement deploying (ratchet, slam); barricade hammering. |
| Grenades and charges | Pin and throw, bounces by surface, frag and impact blasts near and far, charge placement and arming beeps. |
| Objective | Planting and shutting down the uplink (progress you can hear), the armed uplink's pulse quickening toward the end, round-critical cues. |
| Feedback | Hit confirm, head-shot confirm, elimination, being hit (with direction where possible), low health. Distinct, short, never harsh. |
| Ambience | Per-room beds: server fans, lab refrigeration, fluorescent hum, corridor air handling, yard wind and far-off city. Cross-fade on room change. |
| Cues | Round start, action start, uplink armed, round won and lost, match won and lost: short, original, tonal. No downloaded music. |

### 3.5 Behaviour that must not change

- Sound stays off until the arcade's sound setting is on, and no `AudioContext` is created before a user gesture.
- Pause and hidden tabs suspend audio; resume restores it; dispose closes the context and releases every buffer.
- The `Sfx` interface may grow, but every existing call site keeps working.

## 4. Shared contract with the visual overhaul: `src/games/breachline/reloads.ts`

Reload sound and reload animation must agree, and two sessions are building them. The contract is a small pure data
module, **created by the sound session first** and then shared:

```ts
export interface ReloadBeat { name: 'release' | 'out' | 'fetch' | 'in' | 'seat' | 'bolt' | 'shell' | 'pump'; at: number } // at: 0..1 of WeaponDef.reload
export const RELOADS: Record<WeaponId, { tactical: ReloadBeat[]; empty: ReloadBeat[] }>;
```

Times are fractions of `WeaponDef.reload` in `config.ts`, which does not change. The visual session animates to
these beats and may adjust the numbers in this file (pull, edit, push; both sides read the same table). Neither
session adds beats the other does not handle without saying so in its status file.

## 5. Budgets

| | Budget |
| --- | --- |
| Pre-rendered buffers in memory | ≤ 12 MB (mono, 32 kHz is enough for most; 44.1 kHz only where it matters) |
| Time to first sound after the first gesture | ≤ 150 ms (the first weapon and footsteps render first; the rest fill in over the next seconds without a visible hitch) |
| Live voices | ≤ 32 at once, HRTF on at most 6; the quietest and farthest drop first |
| Nodes created per shot | ≤ 8 |
| Master peak | ≤ −1 dBFS in the firefight render; no clipping anywhere |
| Loudness | Own weapon about 6 dB above typical world gunfire at 10 m; ambience at least 20 dB under gunfire |
| Script cost | No audio work in the render loop beyond scheduling; nothing allocated per frame |

## 6. How it is judged without ears

1. **Offline renders.** A script renders every sound, and three scripted scenes (a corridor firefight, a breach,
   the last ten seconds of an armed uplink) through the *whole* graph with `OfflineAudioContext` in the browser
   test harness.
2. **Measurements** asserted in tests: peak, RMS, duration, DC offset, silence, NaN; spectral balance in bands per
   sound class (a rifle must have energy below 150 Hz and above 4 kHz; a footstep on carpet must be duller than on
   tile); variants must differ from each other; indoor and outdoor tails must differ; an occluded version must be
   measurably duller than a clear one.
3. **Spectrograms.** Each render is also saved as a spectrogram image. The builder must *look* at them, as the
   visual session looks at screenshots: transient at the front, body, tail; no buzz bands; no hard edges from
   clipped envelopes. At least five noted defects and fixes per round; expect two to four rounds per group.
4. **Listening files for the owner.** The three scene renders and one file per weapon are committed as small WAV
   files under `docs/evidence/breachline/audio/` (16-bit mono, kept under 3 MB in total), with a short guide to
   what to listen for. The owner's verdict is the final gate, and the status file says so.
5. Scorecard from section 1, re-scored at each gate with evidence (which render, which measurement).

## 7. Phases

| Phase | Work | Gate |
| --- | --- | --- |
| 0. Harness | Offline render and measurement harness, spectrogram output, WAV export; baseline renders of today's sounds saved | Baseline numbers and pictures exist; today's scores confirmed or corrected |
| 1. Graph and space | Buses, limiter, ducking, four impulse responses, HRTF cap, occlusion states | Space and mix rows ≥ 6; the corridor scene renders without clipping |
| 2. Weapons and reloads | Six weapons, first and third person, indoor and outdoor tails, distant versions; `reloads.ts`; beat sounds | Gunfire ≥ 7; sustained fire shows no repeating pattern in the spectrogram |
| 3. Foley and destruction | Footsteps by surface, gear, impacts by material, crumble, breach, reinforcement, barricade | Foley and destruction ≥ 7 |
| 4. Blasts, objective, feedback | Grenades, charges, uplink, hit and elimination cues, low health | All present, measured, distinct |
| 5. Ambience, cues, polish | Room beds, cross-fades, round and match cues, final loudness pass, budgets | Every row ≥ 7; budgets met; listening files and guide committed |

Each gate: tests green, a commit and push, the status file updated.

## 8. Fences

- **Owned:** `src/games/breachline/audio.ts`, new files under `src/games/breachline/audio/`, `reloads.ts` (shared,
  see section 4), `tests/games/breachline/audio*.{test,spec}.ts`, `docs/evidence/breachline/audio/`.
- **`index.ts`:** only the lines that call `sfx.*` (in `onEvents`, `onPhase`, `ambient`) and, if needed, one line
  in the menu telling the player that sound is off and where to turn it on. Also the `SURFACES` table and `surfaceAt` (they
  fold the nine floor materials into five sound surfaces, and footsteps per floor need the material itself; found in
  phase 0). Another session is changing `index.ts`
  for loading and graphics tiers at the same time: keep edits small, pull with rebase before every push.
- **Off limits:** the simulation, netcode, bots, map and rules (`sim.ts`, `state.ts`, `net.ts`, `bots.ts`,
  `nav.ts`, `world.ts`, `map.ts`, `config.ts`), and everything the visual session owns (`scene.ts`,
  `levelmesh.ts`, `lightbake.ts`, `textures.ts`, `models.ts`, `effects.ts`, `render/`, `scripts/breachline-assets/`,
  `public/game-art/breachline/`).
- No audio files shipped to players, no downloaded sounds, no network requests. Workers and worklets, if any, are
  served from the site (the security policy allows same-origin workers only).
- All existing tests stay green. The known failure on the base branch (`tests/e2e/shell.spec.ts`, "library at …")
  is not yours.

## 9. Risks

| Risk | Likelihood | Response |
| --- | --- | --- |
| It measures well and sounds bad | High, by nature | Spectrogram review each round; committed listening files; the owner's ears as the final gate; be ready for a second pass on their notes |
| Pre-rendering stalls weak machines | Medium | Render progressively in small jobs, lowest sample rate that holds up, most-needed sounds first |
| HRTF cost on Chromebooks | Medium | Cap at six; fall back to equal-power when the frame budget is under pressure |
| Reload beats drift from the animation | Medium | One shared table (section 4) |
| Two sessions editing `index.ts` | Medium | Narrow edits, rebase before push, call sites only |
| Offline rendering differs from live playback | Low | A live smoke test with sound on counts nodes and checks for errors, as today |

## Resumed, 2026-11-12 (owner: "I do want good sound design as a key factor to this game")

Sound was paused on 2026-11-11 to save the usage allowance for graphics. The owner has now said sound design is a
key factor, so it resumes at full priority alongside the visual work. Phases 1-5 stand. What has changed in the
game since the pause, and what it adds to the sound work:

**New things that now need sound** (all visual-only today):
| Thing | Sound it needs |
| --- | --- |
| Bullet marks by material (plasterboard, painted block, brick, concrete, asphalt, timber, cardboard, steel, glass, fabric, carpet, floor tile, ceiling tile, earth) | A distinct impact per material, several variants each, with the debris tail that suits it (crumble, chips, splinters, ring and ricochet, tinkle, thud, lint) |
| Window glass: crack on the first hit, shatter on the second or a blast | A sharp crack; a full shatter with shards falling and settling |
| Furniture and cover with intact, damaged and wrecked states | The break at each change of state: wood splitting, sheet steel denting and a door springing, fabric tearing, a shelf collapsing, drums punctured and leaking, crates bursting |
| Blood, wounds and ragdoll bodies | A wet hit on flesh distinct from armour and cloth; a body and its kit hitting the floor (by floor material) and settling; the dropped weapon clattering |
| Breach charge, grenade blasts with their own looks, reinforcement that lifts, unfolds and fires anchors, barricade boards that splinter | Each stage audible and distinct; the reinforcement is a short mechanical sequence ending in anchor shots |
| New floors (terrazzo, raised floor tiles, carpet, boards, tile, asphalt, grass, mats, cable covers) and far more furniture | Footsteps by the surface actually under the player; rooms that sound furnished rather than empty |
| Six weapons being rebuilt | Each weapon's own shot (near, mid, far, indoor and outdoor tails), mechanical layer, casing and reload; the shared beat table in `reloads.ts` stays the contract |

**What makes this genre's sound matter, restated as requirements:**
1. **You can play by ear.** Footsteps, reloads, gadget use and barricade work are audible through walls at realistic
   ranges, and their direction and distance can be judged. Crouching and walking are much quieter than running.
2. **Walls change what you hear, and holes change it back.** Sound through an intact soft wall is muffled; through a
   reinforced wall, more so; once a hole, a breach or an open door exists, sound passes more clearly along that
   path. The occlusion model must read the destructible state, not just the map.
3. **Every room has its own voice:** the corridor's flutter, the Server Room's hum and dead air, the Garage's hard
   slap, the carpeted Office, the open yards with distant city and wind.
4. **Weapons carry the fight:** a tight mechanical crack up close, a body of low end, a tail that tells indoors from
   outdoors, and a clearly different report at distance and through walls.
5. **Feedback is unmistakable but not tiring:** hit and kill confirmations, low-health, objective armed and
   counting, round start and end, all in one consistent family.
6. **Never clips, never drowns the cues, never hitches the game:** the mix targets and the pre-render budget in
   sections 5 and 6 stand, and nothing may build or decode during play.

**Hooks.** Sounds for the new visual-only events need those events. The environment session will expose one stream
from the scene for cosmetic events (impact with material and position; glass crack and shatter; a set piece
changing state; a body coming to rest; reinforcement stages), and the sound code subscribes to it. The sound
session keeps its fences (section 8) and asks the planner for any hook it lacks rather than editing other files.

**The owner's ears are the gate.** Because nobody building this can hear it, the listening files matter more than
before: after each phase, publish a short set of WAV or MP3 files with a one-page listening guide (what to listen
for in each, in plain words), and a one-minute scripted "round in sound" mixdown when phase 4 is done.

## Working notes

- Fresh checkout: `npm ci`; `npx tsc --noEmit`; `npx vitest run tests/games/breachline`.
- Browser tests need the pre-installed Chromium: `ARCADE_URL=http://127.0.0.1:<port> CHROMIUM_PATH=/opt/pw-browsers/chromium BLOCKCRAFT_BROWSER_CHANNEL=headless-shell npx playwright test <files> --project=chromium --trace off --workers=1`, with `npx vite --host 127.0.0.1 --port <port> --strictPort` running. One browser at a time.
- The sound setting is read from `localStorage['pocket-arcade:v1:settings']` (`{"sound":true}`); the game exposes `window.__breachlineTest` in dev builds for driving a match.
- `ffmpeg` and ImageMagick are installed and can turn rendered audio into spectrogram images and WAV files.

## Review log

**Pass 1 (will it work, in what order).** Changes made: the first draft built sounds live from oscillators with
more layers; counted the nodes per automatic-fire shot and moved to pre-rendered buffers with variants, which is
also what makes offline measurement honest (the buffer measured is the buffer played). Put the harness first, so
every later claim has a number and a picture behind it. Added the owner's listening files as the final gate,
because no measurement proves a sound is good. Added the limit on HRTF voices after weighing Chromebook cores.

**Pass 2 (against the code and the other session).** Changes made: reload sound and reload animation are being
built by two sessions, so a shared beat table was specified, with the sound session creating it and the visual
session free to retime it. `index.ts` is being edited by the visual session too, so this plan's access is cut down
to the `sfx.*` call sites. Confirmed the arcade's sound setting is off by default and that no context may exist
before a gesture, so pre-rendering starts at the first gesture, not at load. Checked the security policy: workers
must be same-origin, which rules out worklets built from `blob:` URLs. Footstep surfaces were listed from the
floor materials actually in `map.ts` rather than from memory.
