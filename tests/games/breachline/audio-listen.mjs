// Builds the owner's listening files from a sound-lab render (tests/games/breachline/audio-lab.ts output).
// Usage: node tests/games/breachline/audio-listen.mjs <labDir> <outDir> <set>
//   set "phase1": scenes (stereo) plus "rooms" and "walls" comparisons (mono), 16-bit 22.05 kHz.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [lab, out, set = 'phase1'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const wav = n => join(lab, 'wav', `${n}.wav`);
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const single = (name, file, stereo) => ff(['-i', wav(name), '-ac', stereo ? '2' : '1', '-ar', '22050', '-c:a', 'pcm_s16le', join(out, file)]);
/** Several renders one after another, each followed by a short gap. */
const chain = (names, file) => ff([...names.flatMap(n => ['-i', wav(n)]), '-filter_complex',
  names.map((_, i) => `[${i}]aformat=channel_layouts=mono,apad=pad_dur=0.35[a${i}]`).join(';') + ';' + names.map((_, i) => `[a${i}]`).join('') + `concat=n=${names.length}:v=0:a=1`,
  '-ar', '22050', '-c:a', 'pcm_s16le', join(out, file)]);

const files = [];
if (set === 'phase1') {
  single('scene-corridor', 'p1-corridor-firefight.wav', true); files.push('p1-corridor-firefight.wav');
  single('scene-breach', 'p1-breach.wav', true); files.push('p1-breach.wav');
  chain(['shot-ar-fp-soft', 'shot-ar-fp-in', 'shot-ar-fp-corridor', 'shot-ar-fp-out'], 'p1-rooms.wav'); files.push('p1-rooms.wav');
  chain(['shot-ar-12m-block0', 'shot-ar-12m-block1', 'shot-ar-12m-block3', 'shot-ar-12m-block4'], 'p1-walls.wav'); files.push('p1-walls.wav');
}
let total = 0;
for (const f of files) { const b = statSync(join(out, f)).size; total += b; console.log(`${f} ${(b / 1024).toFixed(0)} KB`); }
console.log(`total ${(total / 1048576).toFixed(2)} MB`);
