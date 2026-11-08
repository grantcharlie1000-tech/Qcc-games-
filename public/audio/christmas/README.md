# Snowfall on the Square

Original Christmas theme for QCC Games. D major, 96 BPM, 3/4, 32 bars, exactly 60 seconds per decoded loop. Celesta carries a new melody over pizzicato figures, warm strings, a flute response, waltz bass and synthesized sleigh bells. A quieter B-minor middle section leads to a fuller return.

No recordings, carol arrangements or external samples are used. The score and instruments are in `src/festive/music-score.ts`. Start Vite on port 4600 and run `node scripts/compose-christmas.mjs` to regenerate the mastered MP3 and measured `score.json`; Chromium and ffmpeg are required. `ARCADE_URL` and `CHROMIUM_PATH` can override the defaults. The shared export helper also preserves the original Last Light composition workflow.

Rendering warms up two cycles and exports the second so sustained instruments and reverb are present on both sides of the loop. PCM peak is 0.84 and RMS is about 0.1805. The boundary sample step is 0.00477; neighboring steps are of comparable size, with slope error 0.000818, reflecting continuous high-frequency bell content. Browser decoding trims MP3 encoder padding to the exact 60-second period.

Turn on **Sound** and **Christmas theme** in the app menu. Playback begins after a user gesture, continues across app routes and games, and keeps its position across mute, focus and visibility changes. Study Mode and movie/TV watch routes stay quiet. Local game background music yields to this theme; game effects and ambient sound remain available.
