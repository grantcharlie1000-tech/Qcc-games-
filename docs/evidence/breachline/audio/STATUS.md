# Breachline sound overhaul: status

Plan: `docs/superpowers/plans/2026-11-11-breachline-audio-overhaul.md`. Updated at every phase gate.

**Read this first: nobody building this sound can hear it.** The build container has no speakers and the builder
has no ears. Every judgement below comes from measurements and from looking at spectrogram pictures. A sound that
passes all of them can still sound bad. **The owner's ears are the final gate**; the listening files below are
for that.

## Where it stands

| Phase | State | Gate |
| --- | --- | --- |
| 0. Harness | **Done** (2026-11-11) | Passed: baseline numbers and pictures exist; scores confirmed, Mix corrected down |
| 1. Graph and space | **Done** (2026-11-12) | Passed on measurement (below): Space 6, Mix 6, walls 6; the corridor and breach scenes render at −2.3 and −2.0 dBFS with no clipping. **Owner's listening still to come** (`listen/p1-*.wav`). |
| 2. Weapons and reloads | **Failed by the owner's ear** (2026-11-12) | **Partly met.** Sustained fire shows no repeating pattern (`phase2/auto-*`), and all six guns are distinct in unit tests. Gunfire scores **6.5, not the ≥ 7 asked**: synthesis without recordings lands here by my reading. The owner's notes on `listen/p2-*.wav` decide the next pass. |
| 3. Foley and destruction | **Built, on hold** (2026-11-12) | Footsteps by floor, impacts in 13 materials, ricochets, glass, set-piece breaks, bodies, hits and the reinforcement sequence are built, wired and tested. They use the same method as the guns, so they are expected to fail the same way, and no listening set was made. They wait for the rebuild. |
| 4. Blasts, objective, feedback | | |
| 5. Ambience, cues, polish | | |

## The owner's verdict on phases 1–2, and the diagnosis

The owner's words on the phase 1 and 2 listening files: **"The sounds sound nothing like actual weapons and sound
super cartoonish."** That is a fail for the guns, and it overrides every measurement in this file: the numbers
passed and the ear did not. Rooms, walls, distance, the mix ceiling, the engine and the event wiring stay; the
sound sources are to be rebuilt against real recordings (see "Reference matching" below). Until then, no new
sounds are made by the old method and no new listening set is made.

Why it is cartoonish. These were measured on our own dry buffers with the new reference profiler
(`audio-compare.ts --profile`), before and after the quick fixes below:

1. **Pitched elements.** Every gun had a sine "punch" falling in pitch (for example 120 → 62 Hz): the cartoon
   "thoom". The blast was noise in a resonant band (Q 0.6–1.2) swept down an octave or more: the "pew". Reload
   parts are struck resonators (the magazine seat has a tonal ratio of 0.19: a "boing"). The variants moved every
   filter by ±4% together, so the variation itself was pitched.
2. **No hit at the front.** The loudest moment came 4–16 ms after onset, against well under 1 ms for a real shot.
   Three causes. `brown()` noise started from silence and wandered up for ~10 ms, so every low layer swelled. The
   bolt or slide was louder than the shot (SMG, DMR). And the low punch crested after the initial edge.
3. **Squashed.** Saturation at drive 2–3.4 held the crest factor at 13–15 dB, which sounds compressed, like a toy
   (references to be measured, but real near-field shots have a far higher peak over their body).
4. **A plateau, not a decay.** Blast decay constants of 30–100 ms, inside the gun, made a 30 ms flat "pshhh" (the
   DMR's 1 ms envelope sits within ±2 dB for 30 ms). A real muzzle blast is mostly gone in 5–25 ms near the gun;
   the long tail belongs to the room.
5. **Too clean and too coloured.** Spectral flatness at 5 ms was 0.10–0.25 and fell below 0.1 by 40 ms: shaped,
   filtered noise rather than the ragged, broadband burst of a real report.
6. **Targets I invented.** "Energy below 150 Hz and above 4 kHz", "6 dB over world fire" and the rest were my
   numbers, not measurements of real guns, so passing them proved nothing. Those tests are removed or replaced.

Quick fixes applied while waiting (no new listening set, as asked). The sine punch is gone (low noise burst
instead). The blast is broadband with a gentle shelf and no sweep. Saturation is about a third of what it was.
`brown()` is run in before use. The action is about 12 dB under the bang. The blast decays 3× faster. Measured
effect on dry buffers: onset-to-peak is now 0.9–4.7 ms for five of six guns (the DMR is still 16 ms: its long
crack hiss and sizzle hold a plateau), and the tonal ratio is ≤ 0.03 for every gun. These are stop-gaps. The
rebuild waits for the reference recordings and the owner's decision on whether recordings may be used as source
material.

## Real recordings: inventory and comparison (2026-11-12)

**Source.** The Free Firearm Sound Library ("Prepared SFX Library.7z", 194 MB) from
https://opengameart.org/content/the-free-firearm-sound-library. The page states **CC0**: "Our team holds CC0 NO
RIGHTS RESERVED for this library. It may be used without royalty or credit … for any application", recorded by Ben
Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney. The archive has no readme. Each WAV carries a description in
its `comment` tag (weapon, calibre, near or mid distance, single shot or burst). Following the owner's open decision,
the recordings are **measurement references only**. They were downloaded and unpacked (with a scratch-installed
`py7zr`, nothing run from the archive) to `/tmp/claude-0/refs/`, outside the repository. **No audio from them is
committed.** Only analysis pictures are, and those contain spectrograms of the references.

**Inventory.** 56 WAVs, all 96 kHz 24-bit stereo, 5–30 s each, all **outdoors**, all "front of shooter" at
**near** or **mid** distance (two microphone pairs: near is left-right, mid is forward-back). There are no indoor
takes, no distant takes, and no separate mechanical sounds (no magazine, bolt, charging handle, pump, shell insert,
dry fire or casings). A few files have quiet events between shots, −12 to −42 dB under the shot, which are probably
actions cycling, but they are not labelled.

| Gun in the library | Kind | Files (near / mid) | Single-shot takes found |
| --- | --- | --- | --- |
| AR-15 (5.56) | semi-auto rifle | 1 / 1 | 2 / 2 |
| AK-47 (7.62×39) | auto rifle: single, short and long bursts | 3 / 3 | bursts of 4–12 |
| SKS (7.62×39) | semi-auto carbine | 1 / 1 | 5 / 3 |
| Carl Gustav M45 "Swedish K" (**9 mm**) | SMG: single, short and long bursts | 3 / 3 | 3 / 3, plus bursts |
| PPSh (7.62×25) | SMG: single and bursts | 3 / 3 | 5 / 4, plus bursts |
| Benelli Nova, Winchester Model 12, Charles Daly (12 ga pump) | shotgun | 1 / 1 each | 2 / 2 each |
| Mossberg 190 (12 ga bolt) | shotgun | 1 / 1 | 2 / 3 |
| Mosin-Nagant (**7.62×54R**), Tikka T3 / Springfield 1917 / Arisaka (.30-06), Savage 10 (.300 BLK) | bolt rifles | 1 / 1 each | 2–4 each |
| Marlin 336, Winchester 1894 | lever rifles | 1 / 1 each | 2 each |
| Walther PPQ (**9 mm**), 1911 (.45), Bersa (.380), Ruger Mk III (.22) | pistols | 1 / 1 each | 2–3 each |
| S&W 642 (.38), Ruger Single Six (.22) | revolvers | 1 / 1 each | 2 each |

**Mapping to our six guns** (nearest real match): AR-5 → AR-15. Tern C8 carbine → AR-15 (same round, shorter
barrel), or the SKS as a second, different carbine. Wren-9 SMG → **Carl Gustav M45**, a true 9 mm SMG (the
researcher thought none existed: this library has one). Halden 12 pump → Benelli Nova, with the Model 12 as a
second voice. Corvin DMR (7.62 marksman) → **Mosin-Nagant 7.62×54R**, the closest full-power 7.62 (Tikka .30-06 as
an alternate). P-11 → **Walther PPQ 9 mm**.

**Comparison.** For each gun I cut the first single shot (10 ms before the onset, 1 s long, mono 48 kHz). Ours is
the game's current sound, rendered through the whole graph in the South Yard. Near is your own shot vs the near
take; mid is someone else's shot at 15 m vs the mid take. Floor is take 1 vs take 2 of the same real gun: how far
two real shots differ.

| Gun | Floor (real vs real) | Ours vs real, near | Ours vs real, mid | Largest near terms |
| --- | --- | --- | --- | --- |
| AR | 0.31 | 3.55 | 4.17 | crest 0.98, envelope 0.92, decay 0.89 |
| Carbine (vs SKS) | 0.33 | 3.57 | 3.06 | decay 1.11, envelope 1.02, attack 0.93 |
| SMG | 0.41 | **1.84** | 4.85 | decay 0.69, envelope 0.56 |
| Shotgun | 0.53 | 3.57 | 4.05 | decay 1.40, crest 1.00, envelope 0.91 |
| DMR (vs Mosin) | 0.38 | 3.73 | 3.29 | decay 1.45, envelope 0.83, crest 0.62 |
| Pistol (vs PPQ) | 0.50 | 2.44 | 3.81 | envelope 1.11, decay 0.69 |

Sheets: `reference/near-<gun>.jpg` and `reference/mid-<gun>.jpg` (both spectrograms, then envelopes, flatness,
band decay curves and the numbers). What they show, which corrects part of the diagnosis above:
- **Real shots are peakier:** the AR has a crest factor of 26.8 dB against our 21.0, with all the energy in a
  few milliseconds and then a much lower tail.
- **Real shots are more coloured early, not flatter.** Their spectral flatness at 5–20 ms is lower than ours (the
  AR is ~0.1 against our ~0.2): the energy sits in a broad hump around 250–600 Hz and falls away above 2 kHz, about
  5 dB under ours at 8–12 kHz. Diagnosis item 5 ("too clean and too coloured") was wrong about the colour: the
  current stop-gap blast is too white.
- **Highs die faster and lows last longer:** in the real AR every band above 1 kHz falls 20 dB in 20–40 ms (ours
  holds its highs about twice as long). The 31–63 Hz bands rise more slowly and roll on as a sub rumble for
  0.3–0.5 s, which ours lacks.
- **There is a distinct slap echo about 70 ms after the shot,** then a long diffuse tail around 250 Hz–2 kHz at
  about −30 dB lasting most of a second. Our yard response has no clear slap and a thinner tail.
- **The SMG is already the closest (1.84):** the 9 mm report is short and mid-heavy, as ours is.
- **Ours is further off at 15 m** (3.1–4.9): the real mid takes keep more low end and more tail than our distance
  chain leaves.

**Caveats.** One take per comparison. "Mid" in the library is unspecified (I compared with 15 m). The references
are outdoors only, so indoor sound cannot be judged against them. The floor figures show this measure separates
real from ours by 4–10× the take-to-take spread.

## Plans for the gun rebuild (the owner's decision chooses one)

**A. If recordings may be used in the game.**
- **Sources:**
  - Near takes become our own-gun body (first person), with 2–5 takes per gun.
  - Mid takes become someone else's gun up close.
  - The far version is the mid take through our distance chain (air absorption, the yard response), checked
    against the mid takes.
  - The bolt or slide layer, casings and every reload beat stay synthesised: the library has no clean mechanical
    takes. Those may be filled later from the smaller CC0 sets the researcher listed (`reload.wav`,
    `shotgunsounds.zip`), after an audit.
- **Trimming:** from 2 ms before the onset; keep up to −45 dB or 350 ms, whichever comes first, then a 40 ms fade.
  The recordings' own outdoor tail is cut off, because each room's response supplies the tail; in the yard the
  first 150 ms of the recorded tail is kept for the slap. Each take is high-passed at 30 Hz with its DC removed.
- **Levels:** every take normalised to the same short-term loudness, then a per-gun offset (the shotgun and DMR
  loudest, the pistol quietest). Our engine's ceiling and ducking stay.
- **Variety:** round-robin over the takes, never the same twice, with ±3% rate and ±1 dB per shot. Bursts use only
  single-shot takes, so each round's onset is clean.
- **Encoding and memory:**
  - The takes would ship as files: about 30 takes of about 0.35 s each, Opus or OGG at about 64 kb/s, roughly
    200 KB to download, served from the site.
  - They would be decoded once at the first gesture (`decodeAudioData`), never during play.
  - Decoded at 32 kHz mono they take about 1.4 MB, replacing the 2.3 MB of synthesised guns, so the bank stays
    under 12 MB.
  - This changes the "no audio files" rule in SPEC.md and the plan; the owner decides.

**B. If recordings may only be measured.** The synthesis must close the measured gaps, in this order, each
change checked against the reference sheets until every gun is within about 1.0 of its reference (the floor is
0.3–0.5):
1. **Shape:** a single very short initial pressure spike (≤ 2 ms) carrying the peak, with the body 15–20 dB under
   it, to bring the crest factor from ~21 to ~27 dB.
2. **Colour:** move the body's energy into a broad hump around 250–600 Hz (wide, gentle shelving, never a
   resonant peak, and checked by the tonal ratio), with −5 dB at 8–12 kHz.
3. **Decay by band:** highs (> 1 kHz) fall 20 dB within 20–40 ms; lows (31–63 Hz) swell more slowly and roll on
   for 0.3–0.5 s as a sub rumble.
4. **Outdoor response:** a distinct slap at 60–90 ms and a longer diffuse 250 Hz–2 kHz tail at about −30 dB in the
   yard response. This is a change to `spaces.ts`, matched against the references' tails.
5. **Fitting:** a Node script that renders each gun dry, convolves it with the yard response offline, measures the
   distance to the reference, and searches the gun's parameters (a few dozen) to minimise it. Then the takes'
   spread sets the variant range. Indoor rooms are not covered by these references and stay as designed.

## Packs split by bitrate, shotgun hull, falling wall items (2026-11-12)

- **Two packs.** `guns.ogg` holds the guns at 96 kb/s (316 KB). `foley.ogg` holds reloads, casings, footsteps,
  impacts, glass and bodies at 64 kb/s (619 KB). Together that is **935 KB**, inside the planner's 1.2 MB ceiling.
  The game loads both at the first gesture. If either fails, everything it would have supplied is synthesised
  instead.
- **48 kb/s was tried and rejected for footsteps and cloth:** against the uncompressed take, the harness distance
  went from 0.06 at 64 kb/s to 0.22 (footstep) and 0.35 (cloth) at 48 kb/s.
- **Shotgun hull:** derived from the real 7.62 casings, pitched to 0.55–0.6 and low-passed.
- **Falling wall items** (the scene's `wallitem` pieces): the real wood hit, pitched lower.
- **Bank 11.87 MB.** The synthetic guns, reloads, steps, glass and bodies are rendered only if a pack fails.
- **Tests:** a test that only checked that the comparison sheet contained the word "distance" was removed (owner
  rule: only real-behaviour tests). Current results: 140 unit tests; audio.spec, play.spec, warm.spec and the
  two-device test pass; the production build loads both packs with no errors or policy violations.

## Phase 3 on real sources (2026-11-12)

**Sources** (each BigSoundBank page and Red Library record read; all CC0; credited in THIRD_PARTY_NOTICES):
- footsteps on concrete 0514, gravel 1117, parquet 0376, grass 1253; Red Library tile R10-05 and metal stairs
  R10-56;
- glass 0771 and 0148, bulbs 2040–2042;
- hammer on concrete 1108, stone fall 1022, paintball wood hits 0529, sheet steel 1771 and 1774;
- Red Library body falls R09-76 and R15-19.

BigSoundBank 0165 is by DavidGreck, not Sardin; downloaded but unused. Older BigSoundBank sounds have no FLAC, so
their OGG was used.

**Mapping:**
- *Real:* slab ← concrete, asphalt ← gravel, planks ← parquet, grass, tile, raised ← metal stairs.
- *Derived:* lino ← tile at 0.92 pitch, low-passed 4 kHz; check ← tile at 1.04; carpet ← parquet at 0.9,
  low-passed 900 Hz.
- *Impacts:* concrete and brick ← hammer and stone (brick at 0.85); wall ← the hammer at 1.25, low-passed (plaster,
  derived); wood ← paintball on wood; metal ← steel bar; glass crack ← 0771. The other materials stay synthetic
  (rendered after the pack loads).
- *Glass and bodies:* glass shatter ← 0148 and 0771; screens, lights and mugs ← bulbs; body fall and settle ← Red
  Library.
- **Ricochets removed:** the only licensed ones are Western-film ricochets, and our own was a tonal whine. Both are
  cartoon tells.

**Pack 809 KB** at 64 kb/s: guns, reloads, casings and foley, now about 22 s of audio. Families kept at half rate
after decoding: handling, casings, steps, impacts, glass, bodies, and someone else's and far gun takes.
**Bank 11.80 MB** (budget 12). To make room: one variant each for the near blasts (pitch varied at play time) and
4 s room loops.

**Still synthetic:** furniture breaks; flesh and armour hits; the weapon drop; the reinforcement stages;
fabric, earth, ceiling, floor-tile, plastic, cardboard and leaf impacts; the shotgun hull; blasts; ambience;
cues.

## Reloads, second pass and real casings (2026-11-12)

The researcher's sources. I read each page or record myself:
- **BigSoundBank:** each sound page states CC0, author Joseph Sardin. I used the lossless FLAC rather than the MP3.
- **archive.org Red Library:** the items' metadata declares CC0 (uploader jscott@archive.org, no author named).
  Older recordings with an audible tape floor, so they are used short or layered quietly.
- **"Equipment Clicks III" by LFA** (OpenGameArt, CC0): a real bolt-action rifle cocking.

All are credited in THIRD_PARTY_NOTICES. The pack builder can now pitch-shift a take ("derived" takes), layer a
second recording under a take, and mark families the game keeps at half rate (24 kHz) after decoding.

| Slot | Source |
| --- | --- |
| AR out, in, seat | SpringySpringo rifle magazine with Red Library R28-36 real rifle handling layered 8–10 dB under, against the airsoft lightness the planner warned of |
| AR bolt | Red Library R12-24 and R12-25 rifle cocking |
| Carbine out, in, seat | SpringySpringo's other reload, with R28-36 under |
| Carbine bolt | Red Library R11-50 |
| DMR bolt | LFA bolt-action clicks (two takes of the bolt cycle); its other beats use the rifle slots |
| SMG | **derived**: the pistol magazine pitched to 0.85 over R28-36 rattle; bolt from R12-26 rifle cocking pitched to 1.15 |
| Pistol slide | zer0_sol, plus BigSoundBank "Pistol, cocking" |
| Dry fire | BigSoundBank hammer release, and LFA |
| Fetch (pouch) | BigSoundBank "Cloth" and Red Library R21-42 heavy fabric |
| Magazine on the floor | Red Library R15-08 (the light drops) |
| Casings | BigSoundBank cases on concrete, three takes per calibre: 9 mm (pistol, SMG), 5.56 (AR, carbine), 7.62 (DMR) |

- **Levels:** pack-only slots take their family's level, so reloads peak at −10 to −13.5 dBFS against −3 for a
  shot.
- **Pack:** **768 KB**, up from 472. The guns are still 316 KB; the rest is real handling and casings at 96 kb/s
  Opus. This is over the "≤ 400 KB for guns" aim only because of the non-gun sounds. Dropping to 64 kb/s would
  save about 250 KB if the download matters more.
- **Memory:** **11.95 MB** (budget 12). That is 7.85 MB of synthesis and 4.05 MB of decoded takes (handling and
  casings kept at 24 kHz), plus the synthetic shotgun hull. Tight: phase 3 will need room, by lowering sample
  rates or sharing takes.
- **Still missing:** a shotgun hull on the floor; brass on tile and wood; separate SMG takes (derived for now);
  a true bolt slam; a weapon swap.

## Route A, step 2: reloads from real recordings (2026-11-12)

**Sources.** I read each page myself; all are CC0 1.0 on OpenGameArt:
- *"Handgun Reload Sound Effect"* by zer0_sol (`reload.wav`).
- *"Shotgun Reload Sound Effects"* by zer0_sol (`shotgunsounds.zip`).
- *"Gun Reload Sounds"* by SpringySpringo (assault rifle reload, gun reload, shotgun cock).
- *"Equipment Clicks II"* by LFA.

All are credited in `public/THIRD_PARTY_NOTICES.txt`. Also checked and not used:
- *"Gun Reload Sound Effects"* by BMacZero (CC0): `clipload1` carries a steady 900 Hz whistle.
- *"Handling Guns"*: CC-BY-SA, so rejected.
- *"2 Metal Weapon Clicks"* by Michel Baradari, and *"Shotgun Shoot Reload"* (CC-BY 3.0): usable with credit, not
  yet needed.
- *"Equipment Clicks III"* by LFA (CC0): many clean clicks, kept in reserve.

**Slots in the pack** (cut by time with a 3 ms fade-in and a 30 ms fade-out, levelled):
- Pistol: release, out, in, seat and slide, one take each, from `reload.wav`.
- Shotgun: 6 shell inserts and 3 pumps (zer0_sol's "Rack" with its opening hum cut, the rack at the end of
  "4 Shell Reload", and SpringySpringo's shotgun cock).
- Rifle class, used by the AR, carbine and DMR, and by the SMG played 8% faster: release, out ×2, in ×2, seat,
  and bolt ×2, from SpringySpringo's two reloads.
- 5 handling clicks and a dry-fire click from LFA.

The pack is now **472 KB** (guns 316 KB). The memory bank is **11.67 MB** with the pack, under the 12 MB budget,
because the synthesis skips everything the pack supplies.

**Sequencer** (`audio.ts` `reload`): each beat in `reloads.ts` plays its slot, recorded where the pack has one,
with ±15 ms of timing and ±1.3 dB of level drift and ±3% rate. A handling click falls between beats more than
0.25 s apart, 60% of the time. On an empty reload the magazine drops (synthetic, light) about 0.35 s after "out".

**Still missing** (for the researcher):
- separate AR, carbine, SMG and DMR magazine and bolt takes (they share one rifle recording);
- a DMR bolt-action cycle;
- a charging-handle pull distinct from the bolt release;
- a magazine hitting hard floor and carpet;
- pouch and cloth handling;
- brass casings on concrete and tile, and a shotgun hull on the floor;
- a weapon swap and sling move;
- grenade pin, spoon and throw.

Production build re-checked after adding the reloads: `pack.json` and `pack.ogg` load, no errors or policy
violations at 6x throttle, and the pack is decoded and in place 3.3 s after the context starts. Tests: 136 unit
tests, `audio.spec` 3/3, `play.spec` 6/6.

## Route A, step 1: the guns are real recordings (2026-11-12)

The owner chose A ("i would pick a - real") and said the reloads need work. All six guns now play real CC0 takes:
- **Pack:** `public/audio/breachline/pack.ogg` (316 KB, Opus 96 kb/s, mono 48 kHz) and `pack.json` (index).
  It is built from `tests/games/breachline/audio-pack.planA.json` by `audio-pack.ts`; the library itself stays
  outside the repository.
- **Credit:** in `public/THIRD_PARTY_NOTICES.txt`.
- **Loading:** the pack is fetched and decoded once at the first gesture (`Engine.loadPack`). The worker then
  skips the synthesised guns, and if the pack fails they are rendered after all.
- **Takes per gun:** AR 2 close takes plus 2 blends of them (each take's first 4 ms on the other's body), so a
  burst never alternates between two. Carbine (SKS) 4. SMG 15 (3 single shots plus 12 split from the M45's
  close bursts). Shotgun 4 (Nova and Model 12). DMR 3. Pistol 3.
- **Mid and far takes:** 2–4 mid takes per gun for someone else's shot (kept to 150 ms so the blast after the
  bullet's crack survives), and 2 for the far version.
- **Trimming:** close takes are cut before the recordings' outdoor slap (45–70 ms plus a fade), so our rooms
  supply the space.
- **Action layer:** a synthetic bolt layer was tried on top and removed. It added ringing (the tonal term went
  from 0 to 0.55–0.74), and the close recordings already contain the real action.

| Gun | Ours vs real, near (floor 0.3–0.5) | Ours vs real, mid | Before (phase 2) near / mid |
| --- | --- | --- | --- |
| AR | 0.89 | 2.17 | 3.55 / 4.17 |
| Carbine (SKS) | 0.99 | 2.48 | 3.57 / 3.06 |
| SMG | 1.15 | 3.04 | 1.84 / 4.85 |
| Shotgun | 1.16 | 2.32 | 3.57 / 4.05 |
| DMR | 1.51 | 4.04 | 3.73 / 3.29 |
| Pistol | 1.18 | 2.17 | 2.44 / 3.81 |

The near shots are now within 2–4× the real take-to-take spread. The mid figures stay higher because "mid" in the
library is an unknown distance; I compare with our 15 m.

**Built site, checked:** `npm run build` passes, including the service-worker check. In the preview with sound
on, `audio/breachline/pack.json` and `pack.ogg` load (200, `audio/ogg`), with no security-policy violations and
no page errors, at 1x and 6x CPU throttle. The pack is decoded and in place 3.96 s (6x) and 5.0 s (1x) after the
context starts, inside the 20 s preparation phase. Decoding takes 40–44 ms (off the main thread).

**Budget:** measured, the synthesis bank without the guns is 8.89 MB and the decoded takes are 2.04 MB, so
**10.93 MB** (budget 12). While it is being sliced, the whole decoded pack (about 2.7 MB) is held once,
briefly. Download: 316 KB. Tests: all Breachline unit tests pass (136), and so do the sound browser tests
(including the fixture-pack test), `play.spec`, `warm.spec` and the two-device online test. The scene-render test
now retries a stalled offline render once.

## Decision pair for the owner (rifle and shotgun, 2026-11-12)

`listen/decision-A-real.wav` and `listen/decision-B-fitted.wav` (0.79 MB each, mono 22.05 kHz) play the same nine
moments: AR then shotgun, each your own shot in the Lab, your own shot in the yard, someone else's at 10 m
indoors and someone else's at 60 m outdoors; then a two-second AR burst. Evidence only. **The game does not load
any recording**, and nothing from the library is under `public/` or `src/`. A is rendered by the lab's audition
override (`createSfx(…, { override })`, which the game never passes).

- **A (real):**
  - Your own shot uses the near takes only: the AR-15's two, and two each from the Benelli Nova and the Model 12.
    The mid mic hears the bullet's crack about 30 ms before the blast, which is wrong for the shooter.
  - Each take is cut from 2 ms before the onset and kept for 55–60 ms, then faded over 60 ms, so the recording's
    outdoor slap (about 70 ms) is gone and our rooms supply the space.
  - Someone else's shot uses the mid takes, kept for 150 ms so the blast after the crack survives.
  - Far is the mid take kept for 300 ms, then our air absorption and the yard response.
  - Each take is high-passed at 30 Hz, its DC removed, levelled +6 dB over peak normalisation, varied ±1.5% in
    pitch and ±1 dB per shot by the engine, never the same take twice in a row.
- **B (fitted):** the five measured fixes are in `sounds.ts` (`SHAPES`, the yard slap at about 68 ms and its
  longer mid tail). Then a fit through the real engine (`tests/games/breachline/audio-fit-lab.ts`: candidates
  rendered in Node, played through the lab, measured against the reference), 5–6 rounds of 12 per gun inside the
  time box.

| | AR near | AR at 15 m | Shotgun near | Shotgun at 15 m |
| --- | --- | --- | --- | --- |
| Two real takes (the floor) | 0.31 | – | 0.53 | – |
| Before (phase 2 guns) | 3.55 | 4.17 | 3.57 | 4.05 |
| **A, real takes through our engine** | **0.91** | 5.09 | **1.27** | 2.38 |
| **B, fitted synthesis through our engine** | 2.46 (1.70 at fit) | 4.19 | 3.81 (2.97 at fit) | 6.06 |

The figures are one in-game render each, with a random variant, so they move by a few tenths between runs. The
"at fit" figures are the best candidate over two variants. Mid distance in the library is unspecified, so the
15 m column is a weaker test. A's 5.09 at 15 m comes from mixing near and mid takes for someone else's shot; the
mid takes alone would be closer. B's shotgun at 15 m got worse than before. Sheets: `reference/decision-*.jpg`.
**B is now what the game plays for all six guns**: the rifle and shotgun shapes are fitted; the other four use
starting shapes from the same model and are not fitted yet.

**Node budget after wiring the scene's impacts.** A burst into a wall now makes impact sounds too, and the live
test caught 13.2 nodes per shot (budget 8). Three changes fixed it, with no change to how a shot sounds:
impacts (and casings) have no reverb send; impact sounds are limited to one per 50 ms (a round through a wall
marks both faces); and your own gun reaches the reverb through one fixed send per space, switched with the
listener, instead of a node per shot. The live figure is now 4.8 nodes per shot, impacts and crumbles included.
The casing is heard on 35% of shots.

**Plan A coverage of what the library lacks:**
- *Indoor:* the near body, cut before its outdoor slap, then our room responses (as in A).
- *Distant:* the mid take with our air absorption, the speed-of-sound delay and the yard response (as in A).
- *Mechanics, reloads, casings:* these still need real sources; generated ones were part of what the owner
  called cartoonish. I audited the small CC0 files (licence as stated by the researcher; I have not seen their
  pages), downloaded to their own scratch folders:
  - `reload.wav` (44.1 kHz stereo, 1.6 s): three clean handgun magazine and slide events. Noise floor 71 dB
    under the sound, with a faint hum at about −70 dB. Usable for the pistol's release, in and seat, and the
    slide.
  - `shotgunsounds.zip` (six MP3s, 44.1 kHz mono): "4 Shell Reload" and "5 Shell Reload" (clean inserts plus a
    rack), "First Shell", "Subsequent Shells", "Shell in Chamber", "Rack". Noise floors 75–80 dB under. "Rack"
    opens with a 0.13 s burst of low hum that must be cut off. Usable for every shotgun beat (shell, pump).
  - Both are band-limited a little (99.5% of their energy is below 9–10 kHz, normal for MP3), which is acceptable
    for handling sounds.
- *Still missing* (to get from Freesound CC0 or elsewhere): rifle and SMG magazine out, in and seat; a charging
  handle or bolt (AR, SMG, DMR); a bolt-action cycle for the DMR (the Mosin files may hold one between shots at
  −11 dB, unconfirmed); dry fire; brass casings on hard floors (Freesound 210102 was suggested); weapon swap and
  handling.

**Budget:** 30 Opus takes at 64 kb/s come to 66 KB for 5.8 s; a full plan-A set (about 10–12 s) would be about
150 KB. `decodeAudioData` took 23 ms unthrottled and 20 ms with the CPU throttled 6x: Chromium decodes off the
main thread, so the throttle barely touches it. That is about 45 ms for the full set, once, at the first gesture.

## Reference matching (built for the rebuild)

`tests/games/breachline/audio-reference.ts` measures a sound the way a recording of the real thing can be
measured. From the onset it takes the attack (10 → 90% of a 1 ms RMS envelope), decay curves in ten octave bands
(31.5 Hz – 16 kHz, at 0–640 ms), a per-band T20, the long-term third-octave envelope, spectral flatness over time,
the crest factor, the tonal-peak ratio (energy in narrow peaks over a running median: a real gunshot has almost
none), and the length. `distance(ours, reference)` folds the differences into one number. Two takes of the same
short noise burst land up to ~0.8 apart, which is the measure's floor; a pitched burst lands ~17 away, and a
burst 5× longer ~1.7 away. Unit-tested on synthetic inputs (`audio-reference.test.ts`, 5 tests).
`tests/games/breachline/audio-compare.ts` gives a side-by-side sheet (both spectrograms, then the curves and the
numbers) and the distance for any WAV against a reference, or `--profile` for a list of files.

**The game plays the new sound.** Every sound is generated in code (`audio/sounds.ts`), several variants each,
rendered after the first gesture in a same-origin module worker (`audio/render.ts`, `audio/worker.ts`) and played
through `audio/engine.ts`: buses (own gun, near foley, world, ambience, cues), a compressor and a soft ceiling
that cannot exceed −1 dBFS, one synthesised reverb per kind of space (`audio/spaces.ts`: hard room, soft room,
corridor, yard, each with explicit early reflections) fed by the room each sound is made in, ducking under the
player's own fire, a blast low-pass over the whole mix, 32 voices and 6 HRTF voices at most, occlusion states,
air absorption and the speed of sound. Phases 2–5 rebuild the sounds themselves; most are still first drafts.

## Scorecard (plan §1)

Score /10, where 8 = would not stand out in a 2009 console shooter. Evidence is under `baseline/` and `phase1/`
(spectrograms) with the numbers in each `metrics.json`; renders are offline through the whole graph at 48 kHz.

| Row | Baseline | Phase 1 | Phase 2 | Evidence |
| --- | --- | --- | --- | --- |
| Gunfire | 2 | 3 | 6.5 by my measures; **fail by the owner's ear (cartoonish)** | Phase 2: every gun is five layers in its own proportions: crack, blast, punch, sizzle and action, plus a spring ring and casings for your own gun. Dry buffers have 15–20% of their energy below 150 Hz (was 10%) and 2.6–12% above 4 kHz; unit tests check rifles have both and that all six guns differ pairwise. Automatic fire: each shot separates below 200 Hz and there is no repeating pattern (`phase2/auto-ar-fp`). Your own gun sits 6.0–7.1 dB over the same gun at 10 m (carbine 4.0, shotgun 3.2). Not 7: it is synthetic and will not pass for a recording, and the SMG and pistol are the least distinct pair. Phase 1 note:  Six variants per gun, never the same twice, ±1.5% pitch; first- and third-person and far versions; own shot rings 0.40 s in a soft room, 0.73 s in a hard room, 1.06 s in the corridor and 1.33 s in the yard (`phase1/shot-ar-fp-*`). Still first-draft recipes: a mid-heavy noise bang (centroid ~1.8 kHz), light below 150 Hz (10% of energy). Phase 2. |
| Space | 2 | **6** | 6 | Four distinct responses (unit-tested: soft decays fastest and darkest, the yard has the longest span). Every sound uses the reverb of the room it is in. Distance adds delay (343 m/s) and air absorption: a rifle at 60 m in the yard has a centroid of 502 Hz vs 1712 Hz at 12 m. |
| Reading the fight through walls | 4 | **6** | 6 | Rifle at 12 m: open −6.9 dB peak / 1712 Hz centroid; one wallboard −11.3 / 1272; three −19.3 / 662; brick or reinforced −27.8 / 472 (`phase1/shot-ar-12m-block*`). Reads the live destructible state through `obstruction()`, so a hole opens the sound back up. Does not yet bend the direction toward an opening. |
| Foley | 2 | 3 | 4 | Phase 2: reloads per weapon class, tactical and from empty, on the beats in `reloads.ts` (`index.ts` now passes the weapon and the empty flag); the seat and the bolt carry the gun body's knock and a spring; the shotgun loads shell by shell and pumps. Footsteps unchanged (phase 3). Phase 1 note:  Footsteps for all nine floors with four variants each, separate heel and toe; per-beat reloads from `reloads.ts` (wired, but `index.ts` doesn't pass the weapon yet). Phase 3. |
| Destruction and explosions | 2 | 3 | 3 | No clipping now; the blast closes a low-pass over the mix. The breach scene shows the blast body as a 2 s wall below 200 Hz (`phase1/scene-breach`): too long. Phase 4. |
| Mix | 1 | **6** | 6 | Every scene ≤ −2 dBFS with no clipped samples; the ceiling makes > −1 dBFS impossible. Own rifle 6.1 dB over someone else's at 10 m (short-term level; target ~6). Ambience 27.3 dB under own gunfire indoors and out (target ≥ 20). The world ducks 4 dB and the ambience 9 dB under own fire. |
| Ambience and music cues | 2 | 3 | 3 | A loop per kind of space, cross-faded as you move, with the yard faintly audible from inside. First-draft content. Phase 5. |

## Iteration log

### Round 0 (baseline, old sound)

Looked at: the twelve baseline pictures in `baseline/`, plus the full sheets in the lab output. Defects noted
(these are the brief for phases 1–5, not fixes yet):

1. Automatic fire is a train of identical clones (`auto-ar-fp`): no round-robin, no pitch or level variation.
2. Own gunfire has no tail at all after 0.2 s and is identical indoors and out.
3. The single reverb is dark mud: energy piles up under 200 Hz for over a second and swamps distant fire
   (`shot-ar-10m-in`); no early reflections, so rooms do not have a size.
4. Distance only scales level and a low-pass: no delay, no change of tail; 60 m outdoors reads like 10 m indoors.
5. Walls: one soft layer vs three differ by 2 dB; reverb is not occluded.
6. The breach clips the master by 6 dB (`scene-breach`); the compressor does not catch it.
7. Reloads are four clicks, the same for every weapon (`reload-ar`).
8. Footsteps are one identical filtered-noise lump per step; surfaces differ only in a filter cutoff.
9. The ambience bed is constant broadband low noise, too loud relative to gunfire, the same everywhere.
10. The uplink pulse is a fixed square beep, louder than the gunfire around it in `scene-uplink`.

### Phase 2, rounds w1–p2 (guns and reloads; pictures in `phase2/`)

Round w1:
1. The SMG and the pistol looked almost identical. Fix: the SMG got a lower, wider blast (1.5 kHz falling to 650 Hz) and a louder open-bolt clatter; the pistol stays bright and thin.
2. The SMG and the pistol had 2–3% of their energy in the low-mids. Fix: stronger, lower punch layers.
3. The shotgun's blast was a full-band wash for 0.35 s and ran into the pump. Fix: blast decay 60 ms, drive 2.8.
4. The AR and the DMR had too little above 4 kHz. Fix: a longer crack hiss, and sizzle up 5 dB.
5. The carbine had only 8% of its energy below 150 Hz. Fix: punch +3 dB.

Round w3:
1. Someone else's gun at 10 m had 2–6% of its energy below 150 Hz. Fix: their punch is now 4 dB under your own, not 8.
2. Automatic fire's 0.5–2 kHz band merged through the room's reverb. Fix: your own gun's reverb send 0.4 → 0.32.
3. The magazine seat and the bolt knock rang at 200 Hz for about 0.25 s. Fix: knock decay 14 ms, level −4 dB.
4. Scrapes buzzed (a hard level step every 64 samples). Fix: glide between target levels.
5. Scrapes carried a low skirt down to 20 Hz. Fix: high-pass at 250 Hz.

Round p2:
1. Your own gun sat only 4.6 dB over the same gun at 10 m. Fix: the world gun's reference distance 4.2 → 3.5 m.

Also in phase 2: a lab render stalls about once in a hundred, because Chromium's offline context stops answering
and freezes the page. The lab now throws the page away and retries on a new one. This has not been seen with a
live `AudioContext` (the live test has passed every run).

### Phase 1, rounds 1–5 (new sound; `test-results/breachline-audio/r1`…`p1`, final pictures in `phase1/`)

Round 1:
1. Own shot: a sustained sub-bass drone for 300 ms after every shot. Cause: saturating the whole shot lifted the low tails. Fix: saturate only the crack and blast; add the low layers after.
2. Automatic fire: a solid wall with no shot-to-shot shape. Fix: shorter thump and push (see round 3).
3. The distant shot ended on a click at 1.28 s (its buffer cut off mid-decay). Fix: `trim` fades over 60 ms whenever a sound reaches the end of its buffer.
4. The distant shot was 75% sub-rumble (centroid 125 Hz). Fix: a low-mid pop with a high-pass at 120 Hz and a shorter roll; centroid now ~500 Hz.
5. Ambience never played (a looped voice at gain 0 was rejected as inaudible). Fix: loops may start silent.
6. Indoor and outdoor own shots measured identically: the lab put every listener at the map's origin. Fix: each lab job places the listener in a real room (Lab, Archive, Corridor, South Yard).

Round 2:
1. The ambience bed was louder than footsteps (−26.7 dBFS RMS). Fix: ambience bus cut, measured again in round 5.
2. Footsteps were all thud, with centroids 120–580 Hz. Fix: less thud, louder heel clicks.
3. One soft wall layer barely changed the sound. Fix: stronger occlusion table (−5 dB and 2.2 kHz for one layer).
4. The soft room's response was brighter than the hard room's. Fix: a brightness limit per space on the late tail and the early taps.
5. Ambience loops carried DC (0.03). Fix: DC block before the loop crossfade.

Round 3:
1. Own bursts were still a solid block below 200 Hz. Fix: thump decay ×0.45, push 22 ms.
2. The corridor bed sat in 20–100 Hz throughout. Fix: high-pass the duct rumble at 70 Hz.
3. Someone else's fire 16 m away kept almost all its top. Fix: air absorption `20 kHz·e^(−d/40)`.
4. A rifle through brick came out as a pitched 200 Hz "boop" (only the thump's sine survived the low-pass). Fix: the third-person thump is 10 dB lower and the noise push stronger.
5. The yard's wall slaps blurred into a wash. Fix: early reflections 7 dB louder.

Round 4:
1. Sub-bass below 100 Hz still lingered after shots in every room. Cause: the reverbs' low band. Fix: a second high-pass on each reverb input (24 dB/oct at 180 Hz, 140 Hz in the yard) and the response's low band at 0.4×.
2. 20–40 Hz carried energy no laptop speaker can play. Fix: guns high-passed at 38 Hz.
3. The corridor bed was still heavy between bursts. Fix: ambience bus a further −3.5 dB (27 dB under gunfire).
4. 10 nodes for a shot at 25–50 m, because the near and far versions overlapped. Fix: one buffer by distance (38 m switch); blasts the same.
5. A lab render stalled once in about 100 (the bank's worker never answered). Fixes: the lab retries a stalled job once; the engine falls back to rendering on the main thread if its worker says nothing within 8 s.

Still visible in the final phase 1 pictures, for later phases: the blast body is a 2 s low wall (phase 4); own automatic fire is still dense below 200 Hz, though each shot now shows (phase 2); footsteps on carpet and planks are low and similar (phase 3).

## Budgets (plan §5)

| Budget | Target | Baseline | Phase 1 |
| --- | --- | --- | --- |
| Buffers in memory | ≤ 12 MB | ~0.2 MB | **11.4 MB** at a 48 kHz context (unit-tested < 12): sounds 9.3 MB, four stereo reverbs 2.1 MB |
| Time to first sound | ≤ 150 ms | immediate | Production build: **144 ms unthrottled**. With the CPU throttled 6x, the worker is up in 164 ms, but the first buffer is not taken until **3.3 s**, because the main thread is busy starting the match. Rendering now starts at the first press anywhere in the page, so in practice the bank fills in the lobby. The first gunshot can come no sooner than 20 s (preparation phase). Measured with `audio-prodtime.mjs`. |
| No hitch while filling | no visible hitch | n/a | Taking each buffer on the main thread costs ≤ 5.5 ms at 6x throttle, 40–60 ms in total over 231 buffers, each in its own task (live test) |
| Live voices | ≤ 32, HRTF ≤ 6 | 40, no HRTF | 32 and 6, quietest dropped first (engine) |
| Nodes per shot | ≤ 8 | **28–31** | **3** own, **≤ 6** others (lab); **3.7–5.3** in a live match including impacts and crumbles |
| Master peak | ≤ −1 dBFS | +6.1 (breach) | −2.0 worst scene; the ceiling caps at −1.0 |
| Own weapon over world gun at 10 m | ~6 dB | ~4.4 dB | **6.1 dB** |
| Ambience under gunfire | ≥ 20 dB | ~12 dB | **27.3 dB** |
| Script cost | no per-frame allocation |: | `listen` per frame does a room lookup and sets gains only when the room changes; no allocation |

## The lab (how this is measured)

- `tests/games/breachline/audio-page.ts` runs in a page on the dev server: it replaces the page's `AudioContext`
  with an `OfflineAudioContext`, imports a sound module, plays a script of `Sfx` calls at set times (seeded
  `Math.random`, so renders repeat exactly) and returns the samples and a count of the nodes each call created.
- `tests/games/breachline/audio-scenes.ts`: the catalogue (every sound, near/far, in/out, through 0–4 wall
  layers, automatic fire) and three scenes (corridor firefight, breach, last ten seconds of an armed uplink),
  written against today's `Sfx` calls so the baseline and the new sound render from the same scripts.
- `tests/games/breachline/audio-harness.ts`: peak, RMS, short-term level, DC, NaN, clipping, attack, span, decay
  to −40 dB, energy share in seven bands, centroid; WAV export; spectrogram pictures (ffmpeg) and contact sheets.
- `tests/games/breachline/audio-lab.ts`: the driver. It starts its own dev server and Chromium.
- `tests/games/breachline/audio-baseline/audio-v0.ts`: a frozen copy of the old `audio.ts`, so "before" can
  always be re-rendered beside "now".

Commands:

```sh
# Render everything (57 renders, ~95 s) to test-results/breachline-audio/<label>/ (wav/, png/, sheet-*.png, metrics.json)
npx vite-node tests/games/breachline/audio-lab.ts -- now                       # the game's audio.ts
npx vite-node tests/games/breachline/audio-lab.ts -- baseline /tests/games/breachline/audio-baseline/audio-v0.ts
npx vite-node tests/games/breachline/audio-lab.ts -- now - - '^shot-ar'      # only names matching a regex
# The owner's listening files from a render, and time to first sound on a production build
node tests/games/breachline/audio-listen.mjs test-results/breachline-audio/<label> docs/evidence/breachline/audio/listen phase1
npx vite build --outDir <dir> && npx vite preview --outDir <dir> --port <p> &  node tests/games/breachline/audio-prodtime.mjs http://127.0.0.1:<p> 6
# Tests
npx vitest run tests/games/breachline/audio-harness.test.ts tests/games/breachline/audio-sounds.test.ts
ARCADE_URL=http://127.0.0.1:<port> CHROMIUM_PATH=/opt/pw-browsers/chromium BLOCKCRAFT_BROWSER_CHANNEL=headless-shell \
  npx playwright test tests/games/breachline/audio.spec.ts --project=chromium --trace off --workers=1
```

## Tests at this gate

Phase 2 (2026-11-12): `tsc` clean. `npx vitest run tests/games/breachline` all green, including `audio-sounds.test.ts` 9/9, which adds rifle weight and crack, six distinct guns, and someone else's gun leaner and the far report darker. Browser: `play.spec.ts` 6/6, `warm.spec.ts` 1/1 plus its known-failure case, `audio.spec.ts` 2/2, two-device `breachline-online.spec.ts` 1/1.

Phase 1:

- `npx tsc --noEmit`: clean.
- `npx vitest run` (whole repository): 5405 passed, 4 failed in a run alongside a browser. All 4 are outside the sound
  code and pass when re-run alone: social pagination, Ball Run Christmas course ride, the Breachline fighter frame-time
  budget, and Colour Blocks fair-deal (a 5 s limit hit at 5.1–5.5 s under load; passes alone with and without this
  work).
- Sound unit tests: `audio-harness.test.ts` 5/5; `audio-sounds.test.ts` 6/6. The latter checks that every sound and
  variant renders clean, that rendering is deterministic (the bank buffer is byte-identical to the measured one),
  that variants differ, that the bank stays under 12 MB with guns and steps first, that the four spaces differ,
  and that carpet is duller than tile.
- Browser (Chromium, one at a time): `play.spec.ts` 6/6, `warm.spec.ts` 1/1 plus its known-failure case, `audio.spec.ts`
  2/2, `tests/multiplayer/breachline-online.spec.ts` (two devices) 1/1. The new live sound test turns sound on and
  checks that no context exists before a gesture; that the whole bank arrives under a 6x CPU throttle; that taking a
  buffer costs < 12 ms; that a burst uses ≤ 8 nodes per shot; that pause suspends and resume runs again; that
  leaving closes the context; and that there are no page errors. The scene test asserts ≤ −1 dBFS and no clipped
  samples.

## Listening guide for the owner

The plain-words guide is `listen/README.md`. Phase 1 set (1.96 MB): `listen/p1-corridor-firefight.wav` (compare
with `baseline/scene-corridor-baseline.wav`), `listen/p1-breach.wav`, `listen/p1-rooms.wav` (one shot in four
rooms), `listen/p1-walls.wav` (a rifle through 0, 1 and 3 wallboards, then brick). Phase 2 set (2.76 MB):
`listen/p2-gun-<weapon>.wav` (each gun four ways), `listen/p2-automatic.wav`, `listen/p2-reloads.wav`.

## Notes for the plan and the other sessions

- `reloads.ts` was created by the weapons session to the shape in plan §4 before this session started. This
  session owns it from here and has not changed it. The sound will use every beat name in it, including
  `shell` and `pump`.
- The planner approved two `index.ts` changes (2026-11-12): passing the weapon and the empty-magazine flag to
  `sfx.reload` (phase 2), and passing the floor material through `SURFACES`/`surfaceAt` (phase 3).
- The planner approved plain-JS pre-rendering in a worker (plan §3.1 updated), on two conditions. The first is the
  first-sound and no-hitch budgets measured with the CPU throttled 4–6x (see Budgets: met unthrottled, missed at 6x
  because the match start holds the main thread; mitigated by starting at the first press). The second is that the
  buffer the tests measure is byte-identical to the one played (unit-tested).
- Decisions in phase 1: one buffer per distant shot or blast (near or far by distance, not both) to keep within
  8 nodes; the engine renders on the main thread in slices if its worker is silent for 8 s; the lab can leave
  ambience out of single-sound renders (`createSfx(enabled, { ambience: false })`); the time-to-first-sound budget
  is gated on a production build, because the dev server serves the worker's modules one by one (1–17 s there).
- The Saltline reference was not fetched: the Artifact tool waited on a permission nobody could answer. The
  planning session read its source statically and sent the technique (per-bus sends into two cross-faded
  convolvers, ducking with cancel-then-setTargetAtTime, buffer playback). That is enough; nothing of it is copied.

## Still weak

- Reloads now use real handling recordings, but the four magazine weapons share one rifle recording, and the cloth and magazine-drop layers are still synthetic.

- Guns are synthetic: weighty and distinct on measurement, but not recordings. The SMG and pistol are the least
  distinct pair. Reloads are clean beats without hand or cloth detail between them.
- Footsteps on soft floors are low and alike; blasts have a 2 s low wall; ambience is plain noise beds. Phases 3–5.
- At 6x CPU throttle the first buffer waits about 3 s behind the match start on the main thread (see Budgets).
- Sound does not yet bend toward a doorway or breach when the straight line is solid (plan §3.3, stretch goal).
- New visual-only events (impacts by material, glass, set pieces, bodies, reinforcement stages) have no sound until
  the environment session's event stream exists; sounds for them come in phases 3–4.
- I cannot hear any of this. The owner's ears are the gate.
