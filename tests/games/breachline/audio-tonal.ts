/** Finds the moments in a render that sound like notes ("piano keys"): the harness's tonal ratio (audio-reference.ts)
 * over 300 ms windows every 100 ms, against a floor taken from the real gunshot takes in the pack. Each moment over the
 * floor is listed with the cues (from the round job in audio-scenes.ts) that started in the second before it.
 * Usage: npx vite-node tests/games/breachline/audio-tonal.ts -- <round.wav> [packDir=public/audio/breachline]
 *   or -- --keys [packDir]: every sound the game plays (pack takes, and the synthesised sounds the pack does not
 *   replace), each alone, most tonal first. */
import { readFileSync } from 'node:fs';
import { decodeWav, mono } from './audio-harness';
import { decode } from './audio-pack';
import { profile } from './audio-reference';
import { round } from './audio-scenes';
import { catalogue, renderSound } from '../../../src/games/breachline/audio/sounds';

const args = process.argv.slice(2).filter(a => a !== '--');
const keysMode = args[0] === '--keys';
const [wav, pack = 'public/audio/breachline'] = keysMode ? ['', args[1]] : args;

// The floor: the most tonal of the real gunshot takes (a recording's own ring), plus a margin.
const idx = JSON.parse(readFileSync(`${pack}/guns.json`, 'utf8')) as { keys: Record<string, { start: number; length: number }[]> };
const guns = decode(`${pack}/guns.ogg`);
let floor = 0;
for (const [k, takes] of Object.entries(idx.keys)) if (k.endsWith('.fp') || k.endsWith('.tp')) for (const t of takes) floor = Math.max(floor, profile(guns.subarray(t.start, t.start + t.length), 48000).tonal);
const limit = floor * 1.25 + 0.02;

if (keysMode) {
  const rows: [string, number, string][] = [], packed = new Set<string>();
  for (const name of ['guns', 'foley', 'amb']) {
    const ix = JSON.parse(readFileSync(`${pack}/${name}.json`, 'utf8')) as { keys: Record<string, { start: number; length: number }[]> }, y = decode(`${pack}/${name}.ogg`);
    for (const [k, takes] of Object.entries(ix.keys)) { packed.add(k); rows.push([k, Math.max(...takes.map(t => profile(y.subarray(t.start, t.start + t.length), 48000).tonal)), 'recorded']); }
  }
  for (const d of catalogue()) if (!packed.has(d.key) && !/^(gun|rl|casing|step|glass|body|amb)\./.test(d.key)) {
    let worst = 0; for (let v = 0; v < d.variants; v++) worst = Math.max(worst, profile(renderSound(d, v), d.sr).tonal);
    rows.push([d.key, worst, 'synthetic']);
  }
  rows.sort((a, b) => b[1] - a[1]);
  console.log(`floor ${floor.toFixed(3)}, limit ${limit.toFixed(3)}`);
  for (const [k, v, kind] of rows) if (v > limit) console.log(`${k.padEnd(18)} ${v.toFixed(3)}  ${kind}`);
  process.exit(0);
}
const { ch, sr } = decodeWav(readFileSync(wav)), x = mono(ch);
const cues = round('/src/games/breachline/audio.ts').cues.filter(c => c.call !== 'listen');
const win = Math.round(sr * 0.3), hop = Math.round(sr * 0.1), hits: { t: number; tonal: number; who: string }[] = [];
for (let s = 0; s + win <= x.length; s += hop) {
  const seg = x.subarray(s, s + win);
  let e = 0; for (const v of seg) e += v * v;
  if (10 * Math.log10(e / win + 1e-12) < -50) continue; // silence and the ambience bed alone
  const tonal = profile(seg, sr).tonal;
  if (tonal <= limit) continue;
  const t = s / sr, who = [...new Set(cues.filter(c => c.t <= t + 0.3 && c.t >= t - 1).map(c => `${c.call}${typeof c.args[0] === 'string' ? ' ' + c.args[0] : ''}`))].join(', ');
  hits.push({ t, tonal, who });
}
console.log(`floor (most tonal real gunshot take) ${floor.toFixed(3)}; listing windows over ${limit.toFixed(3)}`);
// Merge runs of neighbouring windows into one moment.
let last = -9;
for (const h of hits) { if (h.t - last > 0.15) console.log(`${h.t.toFixed(1)} s  tonal ${h.tonal.toFixed(3)}  ${h.who || '(no cue: a tail or the bed)'}`); last = h.t; }
console.log(`${hits.length} windows over the floor`);
