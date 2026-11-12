/** Fits a gun's report shape (sounds.ts SHAPES) to a real reference recording, by random search. Offline model of
 * the game's outdoor chain: the dry shot plus the yard response at a calibrated wet level. Usage:
 *   npx vite-node tests/games/breachline/audio-fit.ts -- <gun> <reference.wav> [iterations=120] [wet=0.15]
 * Prints the best shape as a SHAPES entry and its distance. The result is checked afterwards through the real
 * engine with the lab (audio-compare.ts), since the offline model leaves out the compressor and the ceiling. */
import { readFileSync } from 'node:fs';
import type { WeaponId } from '../../../src/games/breachline/config';
import { rng } from '../../../src/games/breachline/audio/dsp';
import { gunshot, SHAPES, type Shape } from '../../../src/games/breachline/audio/sounds';
import { impulse } from '../../../src/games/breachline/audio/spaces';
import { decodeWav, fft, mono } from './audio-harness';
import { distance, profile } from './audio-reference';

const SR = 32000;
function convolve(x: Float32Array, h: Float32Array): Float32Array {
  let n = 1; while (n < x.length + h.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x); br.set(h); fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] - ai[i] * bi[i], im = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; ai[i] = -im; }
  fft(ar, ai); // inverse via conjugate trick
  const out = new Float32Array(x.length + h.length - 1);
  for (let i = 0; i < out.length; i++) out[i] = ar[i] / n;
  return out;
}
export function outdoor(w: WeaponId, seed: number, wet: number, ir: Float32Array): Float32Array {
  const dry = gunshot(w, 'fp', rng(seed), SR), rev = convolve(dry, ir), out = new Float32Array(Math.round(SR * 1.0));
  for (let i = 0; i < out.length; i++) out[i] = (dry[i] ?? 0) + wet * (rev[i] ?? 0);
  return out;
}
async function main() {
  const [w, refPath, itArg = '120', wetArg = '0.15'] = process.argv.slice(2).filter(a => a !== '--') as [WeaponId, string, string?, string?];
  const { ch, sr } = decodeWav(readFileSync(refPath)), ref = profile(mono(ch), sr);
  const [irL] = impulse('yard', SR), wet = +wetArg, r = rng(99);
  let irRms = 0; for (const v of irL) irRms += v * v; const ir = irL.map(v => v / Math.sqrt(irRms));
  const score = (sh: Shape) => { SHAPES[w] = sh; let d = 0; for (const seed of [1, 2]) d += distance(profile(outdoor(w, seed, wet, ir), SR), ref).total; return d / 2; };
  let best = { ...SHAPES[w] }, bestD = score(best);
  console.log('start', bestD.toFixed(3));
  const span: Record<keyof Shape, [number, number, boolean]> = { spikeTau: [0.0003, 0.002, true], hump: [200, 900, true], body: [-14, 0, false], bodyTau: [0.005, 0.04, true], air: [-26, -6, false], airTau: [0.002, 0.02, true], rumble: [-26, -4, false], rumbleTau: [0.04, 0.4, true] };
  for (let i = 0; i < +itArg; i++) {
    const c = { ...best }, scale = 1 - i / +itArg * 0.7;
    for (const k of Object.keys(span) as (keyof Shape)[]) {
      if (r() < 0.5) continue;
      const [lo, hi, log] = span[k];
      const v = log ? c[k] * Math.exp((r() * 2 - 1) * 0.5 * scale) : c[k] + (r() * 2 - 1) * 3 * scale;
      c[k] = Math.min(hi, Math.max(lo, v));
    }
    const d = score(c);
    if (d < bestD) { best = c; bestD = d; }
  }
  SHAPES[w] = best;
  const round = (v: number) => (Math.abs(v) < 0.1 ? +v.toPrecision(2) : +v.toFixed(Math.abs(v) < 10 ? 1 : 0));
  console.log(`best ${bestD.toFixed(3)}  ${w}: { ${Object.entries(best).map(([k, v]) => `${k}: ${round(v)}`).join(', ')} },`);
}
if (process.env.AUDIO_FIT_MAIN !== '0') main().catch(e => { console.error(e); process.exit(1); });
