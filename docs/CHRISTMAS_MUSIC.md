# App-wide Christmas music

“Snowfall on the Square” is an original one-minute Christmas waltz for the whole QCC app: celesta, pizzicato, soft strings, flute, bass and sleigh bells, in D major at 96 BPM, 3/4. The 32-bar composition includes a quieter middle section and a full melodic return. It uses no external recordings or traditional-carol arrangements.

**Menu → Sound** and **Christmas theme** enable it. A trusted first interaction starts playback; neither an AudioContext nor an audio download is created before that, or while Sound is off. A single decoded loop persists across library, games and other app routes. Study Mode and movie/TV watch pages suppress it before media loads. Muting, tab/window blur, hidden documents and pagehide stop playback while preserving musical position; return resumes it. Game music in Last Light and Minecraft yields to the seasonal track, preserving their effects and ambience. Turning Christmas off restores the normal background-music policy, including Last Light’s original tune.

The common player lives in `src/core/music.ts`, seasonal policy in `src/festive/music.ts`, and score/synthesis in `src/festive/music-score.ts`. `node scripts/compose-christmas.mjs` regenerates `public/audio/christmas/snowfall-on-the-square.mp3` and its measured metadata using the shared `scripts/render-score.mjs` helper. The original Last Light exporter still uses that same helper with its original score and output asset.

## Verification — 8 November 2026

- `npm test -- tests/festive/music.test.ts tests/games/blockcraft/sounds.test.ts tests/games/last-light/music.test.ts`: 48 tests passed, including the new score, route silence policy, unchanged Last Light score, and suppressing only Minecraft’s local music while preserving effects.
- `npx playwright test tests/festive/music.spec.ts tests/games/last-light --project=chromium --workers=1`: all 12 tests passed. Native decoding and loop sources, gesture gating, persistent music across library/Last Light/Snake, Sound/Christmas controls, Study, movie/TV watch routes, real blur/focus after disabling forced headless focus, pagehide/pageshow, and original Last Light playback/lifecycle were exercised.
- `npm run build`: passed, including TypeScript, Vite, Whetū host preparation and the service-worker retirement check. The built MP3 matches the source asset.
- Independent review found no actionable issues and separately confirmed native 60-second decoding, one persistent source, no Last Light overlap, Study/video silence, and position-preserving return.
- PCM measurements: 60 seconds, peak 0.84, RMS 0.1805, boundary delta 0.00477 with adjacent-slope error 0.000818. Rendering uses two cycles to warm up instrument/reverb tails. MP3 container duration includes encoder padding; Chromium decodes exactly 60 seconds.

Listen to [the completed theme](../public/audio/christmas/snowfall-on-the-square.mp3).
