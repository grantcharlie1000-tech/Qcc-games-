# A Light Left On

An original instrumental theme composed for Last Light: A minor, 108 BPM, 4/4, 32 bars, 71.111111 seconds. A soft pulse-wave melody carries a recurring lantern motif over ninth/seventh voicings, alternating arpeggios, triangle bass and light synthesized percussion. The middle eight bars become quieter before the final melodic lift.

All notes, instruments and percussion are synthesized from the score; there are no sampled recordings or third-party melodies. The game uses `a-light-left-on.mp3` as a decoded, seamless Web Audio loop at a low background level. Its existing Sound setting controls both music and effects.

The source score and synthesizer are in `src/games/last-light/music-score.ts`. To render again, start the Vite development server on port 4600, then run `node scripts/compose-last-light.mjs` (Chromium and ffmpeg required; `ARCADE_URL` and `CHROMIUM_PATH` may override the defaults). The renderer warms up two cycles before exporting the second, preserving reverb/delay across the loop. `score.json` records the measured PCM duration, peak, RMS and boundary difference. MP3 encoder padding is trimmed by the browser decoder; native Chromium verification confirms the decoded 71.111111-second period.
