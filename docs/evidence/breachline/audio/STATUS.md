# Breachline sound overhaul: status

Plan: `docs/superpowers/plans/2026-11-11-breachline-audio-overhaul.md`. Updated at every phase gate.

**Read this first: nobody building this sound can hear it.** The build container has no speakers and the builder
has no ears. Every judgement below comes from measurements and from looking at spectrogram pictures. A sound that
passes all of them can still sound bad. **The owner's ears are the final gate**; the listening files below are
for that.

## Where it stands

| Phase | State | Gate |
| --- | --- | --- |
| 0. Harness | **Done** (2026-11-11) | Passed: baseline numbers and pictures exist; scores confirmed, and Mix corrected down (below) |
| 1. Graph and space | Next | |
| 2. Weapons and reloads | | |
| 3. Foley and destruction | | |
| 4. Blasts, objective, feedback | | |
| 5. Ambience, cues, polish | | |

The sound the game plays is still the old `audio.ts`, unchanged. Phase 0 added only the lab and tests.

## Scorecard (plan §1)

Score /10, where 8 = would not stand out in a 2009 console shooter. Evidence files are under `baseline/` here;
numbers are from `baseline/metrics.json` (rendered offline through the whole old graph at 48 kHz).

| Row | Plan's score | Baseline (measured) | Evidence |
| --- | --- | --- | --- |
| Gunfire | 2 | **2, confirmed** | `auto-ar-fp.jpg`: twenty AR shots are pixel-identical clones (no variation). `shot-ar-fp-in` and `-fp-out` measure identically (peak −15.5, centroid 429 Hz): the own gun has no tail and no sense of place. 78% of an AR shot's energy is under 150 Hz and 2% above 4 kHz: a thump, with the crack lasting ~10 ms. AR and carbine differ only by centroid 429 vs 564 Hz. 28–31 nodes per shot (budget 8). |
| Space | 2 | **2, confirmed** | `shot-ar-10m-in.jpg`: the reverb is a murky bed below 200 Hz for 1.2 s, nothing above 1 kHz after 0.3 s, no early reflections. A shot 60 m away outdoors has the same decay (0.87 s) and nearly the same spectrum (centroid 399 vs 419 Hz) as one 10 m away indoors; no speed-of-sound delay. |
| Reading the fight through walls | 4 | **4, confirmed** | `shot-ar-12m-block0..4`: the clear→solid step is real (peak −21.9 → −32.2 dB, centroid 417 → 162 Hz, air above 4 kHz 2% → 0%), but one soft layer and three differ by only 2 dB and the reverb send ignores the wall (tail decay 0.87 s in every case). A hole in a wall does not open the sound up beyond the gain step. |
| Foley | 2 | **2, confirmed** | `reload-ar.jpg`: four 25 ms clicks and nothing else; the shotgun reload is the same four clicks, longer apart. `step-hard.jpg`: five identical lumps at 200–600 Hz. A carpet step (−40.6 dB peak) is only 6 dB under hard floor. |
| Destruction and explosions | 2 | **2, confirmed** | `boom-8m.jpg`: one low noise sweep and two falling tones; no debris; nothing changes in the listener's ears. `crumble-wall` is a handful of band-pass ticks. |
| Mix | 2 | **1, corrected down** | `scene-breach.jpg`: the breach scene peaks at **+6.1 dBFS with 215 clipped samples**; the compressor does not limit. Own gun (short-term −36.8 dB) sits only ~4 dB over a world shot at 10 m (−41.2 dB); target ~6. Indoor ambience is only ~12 dB under own gunfire (target ≥ 20). |
| Ambience and music cues | 2 | **2, confirmed** | `ambience-in.jpg`: a band of low noise and a 60 Hz hum, the same in every room. `scene-uplink.jpg`: the device beep holds one pitch and changes only its rate in the last 5 s. Cues are short square/triangle note runs. |

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

## Budgets (plan §5)

| Budget | Target | Baseline |
| --- | --- | --- |
| Buffers in memory | ≤ 12 MB | ~0.2 MB (one second of noise, one IR) |
| Time to first sound | ≤ 150 ms | immediate (live synthesis) |
| Live voices | ≤ 32, HRTF ≤ 6 | cap 40 sources, no HRTF |
| Nodes per shot | ≤ 8 | **28–31** |
| Master peak | ≤ −1 dBFS | −1.0 (corridor), **+6.1 (breach)** |
| Own weapon over world gun at 10 m | ~6 dB | ~4.4 dB (short-term) |
| Ambience under gunfire | ≥ 20 dB | ~12 dB |
| Script cost | no per-frame allocation | `listen` allocates nothing; each sound allocates its nodes |

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
# Render everything (55 renders, ~45 s) to test-results/breachline-audio/<label>/ (wav/, png/, sheet-*.png, metrics.json)
npx vite-node tests/games/breachline/audio-lab.ts -- now                       # the game's audio.ts
npx vite-node tests/games/breachline/audio-lab.ts -- baseline /tests/games/breachline/audio-baseline/audio-v0.ts
npx vite-node tests/games/breachline/audio-lab.ts -- now - - '^shot-ar'      # only names matching a regex
# Tests
npx vitest run tests/games/breachline/audio-harness.test.ts
ARCADE_URL=http://127.0.0.1:<port> CHROMIUM_PATH=/opt/pw-browsers/chromium BLOCKCRAFT_BROWSER_CHANNEL=headless-shell \
  npx playwright test tests/games/breachline/audio.spec.ts --project=chromium --trace off --workers=1
```

## Tests at this gate

- `npx tsc --noEmit`: clean.
- `npx vitest run tests/games/breachline`: 58/58 (6 files), including the harness unit tests 5/5.
- `tests/games/breachline/audio.spec.ts` (renders the three scenes through the game sound in Chromium; no errors,
  no NaN, not silent): 1/1. It tightens each phase (peak ≤ −1 dBFS from phase 1).

## Listening guide for the owner

| File | What it is | What to listen for |
| --- | --- | --- |
| `baseline/scene-corridor-baseline.wav` | The old sound, corridor firefight (9 s, mono 22 kHz) | The "before". Note how every rifle shot is the same, the boomy murk after each burst, and how the enemy behind the wall at 2.3 s barely differs from the one in the open. |

New listening files arrive from phase 1 on, each beside its "before".

## Notes for the plan and the other sessions

- `reloads.ts` was created by the weapons session to the shape in plan §4 before this session started. This
  session owns it from here and has not changed it. The sound will use every beat name in it, including
  `shell` and `pump`.
- `sfx.reload(seconds, at)` is told neither the weapon nor whether the magazine was empty, so per-weapon
  tactical and empty reloads need that call site to pass both. It is an `sfx.*` line in `index.ts`, so within the
  fence; done in phase 2.
- `index.ts` folds the nine floor materials into five `Surface` values in its `SURFACES` table, which is not an
  `sfx.*` line. Footsteps per floor (plan §3.4) need the material passed through: the plan's `index.ts` fence is
  widened by this commit to cover that one table and `surfaceAt`; done in phase 3.
- The Saltline reference was not fetched: the Artifact tool waited on a permission nobody could answer. The
  planning session read its source statically and sent the technique (per-bus sends into two cross-faded
  convolvers, ducking with cancel-then-setTargetAtTime, buffer playback). That is enough; nothing of it is copied.

## Still weak

Everything: the game's sound is unchanged at this gate.
