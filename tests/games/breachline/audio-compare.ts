/** Compares sounds with a reference recording. Usage:
 *   npx vite-node tests/games/breachline/audio-compare.ts -- <ours.wav> <reference.wav> <out.png>
 *     a sheet: both spectrograms side by side, then envelopes, band decay curves, flatness and the numbers
 *   npx vite-node tests/games/breachline/audio-compare.ts -- --profile <a.wav> [b.wav ...]
 *     prints each file's measures (attack, crest, tonal ratio, flatness at 5 and 40 ms, length, per-band T20)
 * WAVs are mixed to mono and analysed at their own rate. See audio-reference.ts for what is measured. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import sharp from 'sharp';
import { decodeWav, mono, spectrogram } from './audio-harness';
import { distance, OCTAVES, profile, sheetSvg } from './audio-reference';

const load = (f: string) => { const { ch, sr } = decodeWav(readFileSync(f)); return profile(mono(ch), sr); };

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args[0] === '--profile') {
    console.log('file'.padEnd(28), 'attack', 'crest', 'tonal', 'flat5', 'flat40', 'lenMs', 'T20 ms by octave ' + OCTAVES.join('/'));
    for (const f of args.slice(1)) {
      const p = load(f);
      console.log(basename(f).padEnd(28), p.attackMs.toFixed(2).padStart(6), p.crestDb.toFixed(1).padStart(5), p.tonal.toFixed(3), p.flatness[1].toFixed(2).padStart(5), p.flatness[4].toFixed(2).padStart(6), String(p.lengthMs).padStart(5), p.t20.map(v => Math.round(v)).join('/'));
    }
    return;
  }
  const [ours, ref, out] = args;
  const a = load(ours), b = load(ref), d = distance(a, b);
  const tmp = out.replace(/\.png$/, '');
  spectrogram(ours, `${tmp}.a.png`, `ours: ${basename(ours)}`, 700);
  spectrogram(ref, `${tmp}.b.png`, `reference: ${basename(ref)}`, 700);
  await sharp(Buffer.from(sheetSvg(basename(ours), a, basename(ref), b))).png().toFile(`${tmp}.c.png`);
  execFileSync('convert', ['(', `${tmp}.a.png`, `${tmp}.b.png`, '+append', ')', '-background', '#111', '-gravity', 'center', `${tmp}.c.png`, '-append', out]);
  execFileSync('rm', ['-f', `${tmp}.a.png`, `${tmp}.b.png`, `${tmp}.c.png`]);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v.toFixed(3)]))));
}
main().catch(e => { console.error(e); process.exit(1); });
