/** Fits a gun's report shape (sounds.ts SHAPES) to a real reference through the real engine: each candidate is
 * rendered in Node, injected into the lab (override), played as your own shot in the South Yard, and measured
 * against the reference. Usage:
 *   AUDIO_LAB_MAIN=0 npx vite-node tests/games/breachline/audio-fit-lab.ts -- <gun> <reference.wav> [rounds=5] [batch=12]
 * Prints the best shape as a SHAPES entry. Random search with a shrinking step. */
import { readFileSync } from 'node:fs';
import type { WeaponId } from '../../../src/games/breachline/config';
import { rng, seedOf } from '../../../src/games/breachline/audio/dsp';
import { gunshot, SHAPES, type Shape } from '../../../src/games/breachline/audio/sounds';
import { decodeWav, mono } from './audio-harness';
import { renderJobs, withServer } from './audio-lab';
import { distance, profile } from './audio-reference';
import { catalogue } from './audio-scenes';

const SPAN: Record<keyof Shape, [number, number, boolean]> = { spikeTau: [0.0003, 0.002, true], hump: [200, 900, true], body: [-16, 0, false], bodyTau: [0.005, 0.04, true], air: [-28, -6, false], airTau: [0.002, 0.02, true], rumble: [-30, -6, false], rumbleTau: [0.04, 0.4, true] };

async function main() {
  const [w, refPath, roundsArg = '5', batchArg = '12'] = process.argv.slice(2).filter(a => a !== '--') as [WeaponId, string, string?, string?];
  const { ch, sr } = decodeWav(readFileSync(refPath)), ref = profile(mono(ch), sr);
  const base = catalogue('/src/games/breachline/audio.ts').find(j => j.name === `shot-${w}-fp-out`)!, r = rng(7);
  const takes = (sh: Shape) => { SHAPES[w] = sh; return [0, 1].map(v => Array.from(gunshot(w, 'fp', rng(seedOf(`gun.${w}.fp`, v)), 32000), x => +x.toFixed(6))); };
  let best = { ...SHAPES[w] }, bestD = Infinity;
  await withServer(async url => {
    for (let round = 0; round < +roundsArg; round++) {
      const cands: Shape[] = round === 0 ? [best] : [];
      while (cands.length < +batchArg) {
        const c = { ...best }, step = 1 - round / +roundsArg * 0.7;
        for (const k of Object.keys(SPAN) as (keyof Shape)[]) {
          if (r() < 0.5) continue;
          const [lo, hi, log] = SPAN[k];
          c[k] = Math.min(hi, Math.max(lo, log ? c[k] * Math.exp((r() * 2 - 1) * 0.6 * step) : c[k] + (r() * 2 - 1) * 4 * step));
        }
        cands.push(c);
      }
      const jobs = cands.map((c, i) => ({ ...base, name: `cand${i}`, options: { ...base.options, override: { [`gun.${w}.fp`]: { sr: 32000, takes: takes(c) } } } }));
      const out = await renderJobs(jobs, url);
      out.forEach(({ ch: chs, result }, i) => {
        const d = distance(profile(mono(chs), result.sampleRate), ref).total;
        if (d < bestD) { bestD = d; best = cands[i]; }
      });
      console.log(`round ${round}: best ${bestD.toFixed(3)}`);
    }
  });
  const fmt = (v: number) => (Math.abs(v) < 0.1 ? +v.toPrecision(2) : +v.toFixed(Math.abs(v) < 10 ? 1 : 0));
  console.log(`${w}: { ${Object.entries(best).map(([k, v]) => `${k}: ${fmt(v)}`).join(', ')} },  // distance ${bestD.toFixed(2)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
