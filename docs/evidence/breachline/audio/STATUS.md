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
| Script cost | no per-frame allocation | — | `listen` per frame does a room lookup and sets gains only when the room changes; no allocation |

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

- Guns are synthetic: weighty and distinct on measurement, but not recordings. The SMG and pistol are the least
  distinct pair. Reloads are clean beats without hand or cloth detail between them.
- Footsteps on soft floors are low and alike; blasts have a 2 s low wall; ambience is plain noise beds. Phases 3–5.
- At 6x CPU throttle the first buffer waits about 3 s behind the match start on the main thread (see Budgets).
- Sound does not yet bend toward a doorway or breach when the straight line is solid (plan §3.3, stretch goal).
- New visual-only events (impacts by material, glass, set pieces, bodies, reinforcement stages) have no sound until
  the environment session's event stream exists; sounds for them come in phases 3–4.
- I cannot hear any of this. The owner's ears are the gate.
