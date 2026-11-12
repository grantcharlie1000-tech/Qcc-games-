/** Breachline sound lab: reference matching. Measures a sound the way a recording of the real thing can be measured,
 * so a synthesised gunshot (or footstep, or impact) can be compared with a real recording rather than with targets
 * someone invented. Pure analysis on Float32Arrays plus an SVG sheet; no audio is played or shipped.
 *
 * Measures, from the onset (the first sample within 30 dB of the peak):
 * - attack: 10% to 90% of the peak of a 0.25 ms envelope;
 * - decay curves in ten octave bands (31.5 Hz to 16 kHz): each band's level over time, dB re the loudest band-frame;
 * - long-term spectral envelope in third octaves over the first second, dB re its own total;
 * - spectral flatness over time (geometric over arithmetic mean of the power spectrum; noise ~0.5+, a tone ~0);
 * - crest factor: peak over RMS of the active part, dB;
 * - tonal-peak ratio: the share of energy sitting in narrow peaks well above the local median spectrum (a real
 *   gunshot has almost none; pitched thumps, swept resonances and ringing filters show up here).
 * `distance` folds the differences into one figure: 0 is identical, and lower is closer. Two takes of the same short
 * noise burst land up to ~0.8 apart (the measure's floor: a short sound's low bands carry few degrees of freedom), so
 * only differences well above that mean anything. */
import { fft } from './audio-harness';

export const OCTAVES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
/** Times (ms after onset) at which curves are sampled. */
export const TIMES = [0, 5, 10, 20, 40, 80, 160, 320, 640];
const THIRDS = Array.from({ length: 26 }, (_, i) => 40 * 2 ** (i / 3)); // 40 Hz .. ~12.7 kHz

export interface Profile {
  sr: number;
  attackMs: number;
  /** decay[band][time]: dB re the loudest band-frame, floored at −80. */
  decay: number[][];
  /** Per band, the time in ms to fall 20 dB from its own peak (or the length if it never does). */
  t20: number[];
  /** Third-octave long-term envelope, dB re total, floored at −60. */
  envelope: number[];
  flatness: number[];
  crestDb: number;
  tonal: number;
  /** Length of the active part, ms (until the 10 ms envelope falls 50 dB under its peak). */
  lengthMs: number;
}

const db = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));

/** Short-time power spectra: frames of `size` with a Hann window, hop `hop`, starting at `from`. */
function stft(x: Float32Array, size: number, hop: number, from: number, frames: number): Float64Array[] {
  const out: Float64Array[] = [], re = new Float64Array(size), im = new Float64Array(size), w = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size));
  for (let f = 0; f < frames; f++) {
    const s = from + f * hop - size / 2;
    for (let i = 0; i < size; i++) { const j = s + i; re[i] = (j >= 0 && j < x.length ? x[j] : 0) * w[i]; im[i] = 0; }
    fft(re, im);
    const p = new Float64Array(size / 2);
    for (let k = 0; k < size / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    out.push(p);
  }
  return out;
}
const bandPower = (p: Float64Array, sr: number, lo: number, hi: number) => {
  const hz = sr / (p.length * 2); let s = 0;
  // At least three bins, so the lowest bands do not hang on one noisy bin.
  let k0 = Math.max(1, Math.floor(lo / hz)), k1 = Math.min(p.length - 1, Math.ceil(hi / hz));
  while (k1 - k0 < 2) { k0 = Math.max(1, k0 - 1); k1 = Math.min(p.length - 1, k1 + 1); }
  for (let k = k0; k <= k1; k++) s += p[k];
  return s;
};

export function profile(input: Float32Array, sr: number): Profile {
  const x = input;
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  let onset = 0;
  while (onset < x.length - 1 && Math.abs(x[onset]) < peak * 0.0316) onset++;
  // Attack: 10% to 90% of the peak of a 1 ms RMS envelope (the floor of this measure is ~0.8 ms).
  // Samples before the start of the file count as silence, so a sound that starts at sample 0 measures the same.
  const w = Math.max(1, Math.round(sr * 0.001)), from0 = onset - w * 3, scan = Math.min(x.length, onset + Math.round(sr * 0.05));
  const env: number[] = [];
  for (let i = from0; i < scan; i++) { let s2 = 0; for (let j = Math.max(0, i); j < Math.min(x.length, i + w); j++) s2 += x[j] * x[j]; env.push(Math.sqrt(s2 / w)); }
  let ePeak = 0, ePeakAt = 0;
  env.forEach((e, i) => { if (e > ePeak) { ePeak = e; ePeakAt = i; } });
  // The first time it reaches 90%, and the last time before that it was under 10%.
  let a90 = 0; while (a90 < ePeakAt && env[a90] < ePeak * 0.9) a90++;
  let a10 = a90; while (a10 > 0 && env[a10 - 1] >= ePeak * 0.1) a10--;
  const attackMs = (a90 - a10) / sr * 1000;
  // Band decay curves: 5.3 ms hop, 1024-point frames at 48 kHz (scaled with the rate).
  const size = sr > 32000 ? 2048 : 1024, hop = Math.round(sr * 0.0025), n = Math.max(1, Math.ceil((Math.min(x.length - onset, sr * 0.7)) / hop));
  const spec = stft(x, size, hop, onset, n);
  const bands = OCTAVES.map(c => spec.map(p => bandPower(p, sr, c / Math.SQRT2, Math.min(sr / 2, c * Math.SQRT2))));
  let top = 1e-12;
  for (const b of bands) for (const v of b) top = Math.max(top, v);
  // Each time point averages the frames around it (a quarter of its own time either side, at least one frame), so a
  // random take of the same noise reads the same.
  const around = (b: ArrayLike<number>, t: number) => {
    const c = Math.round(t / 1000 * sr / hop), half = Math.max(1, Math.round(c * 0.25));
    let s2 = 0, m = 0; for (let f = Math.max(0, c - half); f <= Math.min(b.length - 1, c + half); f++) { s2 += b[f]; m++; } return s2 / Math.max(1, m);
  };
  const decay = bands.map(b => TIMES.map(t => Math.max(-80, db(around(b, t) / top))));
  const t20 = bands.map(b => { let m = 0, mi = 0; b.forEach((v, i) => { if (v > m) { m = v; mi = i; } }); if (m <= top * 1e-8) return 0; let i = mi; while (i < b.length - 1 && b[i] > m / 100) i++; return (i - mi) * hop / sr * 1000; });
  // Long-term envelope over the first second.
  const lt = new Float64Array(size / 2);
  for (const p of spec.slice(0, Math.min(spec.length, Math.round(sr / hop)))) for (let k = 0; k < p.length; k++) lt[k] += p[k];
  const tot = lt.reduce((s, v) => s + v, 0) || 1e-12;
  const envelope = THIRDS.map(c => Math.max(-60, db(bandPower(lt, sr, c / 2 ** (1 / 6), c * 2 ** (1 / 6)) / tot)));
  // Flatness over time (on 100 Hz–16 kHz, where a gunshot's noise lives).
  const hz = sr / size, k0 = Math.ceil(100 / hz), k1 = Math.min(size / 2 - 1, Math.floor(16000 / hz));
  const flatness = TIMES.map(t => {
    const c = Math.round(t / 1000 * sr / hop), half = Math.max(1, Math.round(c * 0.25)), vals: number[] = [];
    for (let f = Math.max(0, c - half); f <= Math.min(spec.length - 1, c + half); f++) {
      const p = spec[f]; let lg = 0, ar = 0, m = 0; for (let k = k0; k <= k1; k++) { lg += Math.log(p[k] + 1e-20); ar += p[k]; m++; }
      vals.push(ar > 0 ? Math.exp(lg / m) / (ar / m) : 0);
    }
    return vals.reduce((s2, v) => s2 + v, 0) / Math.max(1, vals.length);
  });
  // Tonal ratio: energy more than 10 dB over a third-octave running median, in the first 300 ms, weighted by frame energy.
  let tonalE = 0, allE = 0;
  const tf = spec.slice(0, Math.min(spec.length, Math.round(sr * 0.3 / hop))).filter((_, i) => i % 3 === 0);
  for (const raw of tf) {
    // Five-bin smoothing first: a tone's main lobe survives it, the scatter of plain noise does not.
    const p = raw.map((_, k) => { let s2 = 0; for (let j = -2; j <= 2; j++) s2 += raw[Math.min(raw.length - 1, Math.max(0, k + j))]; return s2 / 5; });
    for (let k = k0; k <= k1; k++) {
      const half = Math.max(10, Math.round(k * 0.12)), win: number[] = [];
      for (let j = Math.max(k0, k - half); j <= Math.min(k1, k + half); j++) win.push(p[j]);
      win.sort((a, b) => a - b);
      const med = win[win.length >> 1];
      allE += p[k]; if (p[k] > med * 10) tonalE += p[k] - med;
    }
  }
  // Crest factor and length.
  let sq = 0, cnt = 0;
  const e10 = Math.round(sr * 0.01), lvl: number[] = [];
  for (let i = onset; i < x.length; i += e10) { let s = 0; for (let j = i; j < Math.min(x.length, i + e10); j++) s += x[j] * x[j]; lvl.push(s / e10); }
  const lmax = Math.max(...lvl, 1e-20);
  let last = 0; lvl.forEach((v, i) => { if (v > lmax * 1e-5) last = i; });
  for (let i = onset; i < Math.min(x.length, onset + (last + 1) * e10); i++) { sq += x[i] * x[i]; cnt++; }
  const crestDb = 20 * Math.log10(peak / Math.sqrt(sq / Math.max(1, cnt) || 1e-20));
  return { sr, attackMs, decay, t20, envelope, flatness, crestDb, tonal: allE ? tonalE / allE : 0, lengthMs: (last + 1) * 10 };
}

export interface Distance { total: number; envelope: number; decay: number; flatness: number; tonal: number; crest: number; attack: number }
/** How far `a` is from reference `b`. Each term is scaled so that a clearly audible difference is about 1. */
export function distance(a: Profile, b: Profile): Distance {
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
  // Compared after smoothing over neighbouring thirds: the shape matters, not the scatter of one take.
  const sm = (e: number[]) => e.map((_, i) => { let s2 = 0; for (let j = -2; j <= 2; j++) s2 += e[Math.min(e.length - 1, Math.max(0, i + j))]; return s2 / 5; });
  const ea = sm(a.envelope), eb = sm(b.envelope);
  const envelope = Math.sqrt(mean(ea.map((v, i) => (v - eb[i]) ** 2))) / 6;
  const decay = mean(a.decay.flatMap((row, i) => row.map((v, j) => Math.abs(Math.max(v, -60) - Math.max(b.decay[i][j], -60))))) / 10;
  const flatness = mean(a.flatness.map((v, i) => Math.abs(v - b.flatness[i]))) * 4;
  const tonal = Math.abs(a.tonal - b.tonal) * 10;
  const crest = Math.abs(a.crestDb - b.crestDb) / 6;
  const attack = Math.abs(Math.log((a.attackMs + 0.5) / (b.attackMs + 0.5))) / 1.2;
  return { total: envelope + decay + flatness + tonal + crest + attack, envelope, decay, flatness, tonal, crest, attack };
}

/** A side-by-side sheet (SVG): third-octave envelopes, band decay curves, flatness over time, and the numbers. */
export function sheetSvg(nameA: string, a: Profile, nameB: string, b: Profile): string {
  const W = 1200, H = 760, d = distance(a, b), col = ['#ff9f43', '#4fc3f7'];
  const line = (pts: [number, number][], c: string, dash = '') => `<polyline fill="none" stroke="${c}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''} points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}"/>`;
  const panel = (x: number, y: number, w: number, h: number, title: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1b1b1b" stroke="#444"/><text x="${x + 8}" y="${y + 18}" fill="#ddd" font-size="14" font-family="sans-serif">${title}</text>`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#111"/>`;
  s += `<text x="16" y="28" fill="#fff" font-size="18" font-family="sans-serif">${esc(nameA)} (orange) vs ${esc(nameB)} (blue): distance ${d.total.toFixed(2)}</text>`;
  // Envelope.
  s += panel(16, 44, 570, 300, 'Long-term spectrum, third octaves (dB re total), 40 Hz to 12.7 kHz');
  for (const [p, c] of [[a, col[0]], [b, col[1]]] as const) s += line(p.envelope.map((v, i) => [30 + i * 540 / 25, 70 + (-v) / 60 * 260] as [number, number]), c);
  // Flatness.
  s += panel(614, 44, 570, 300, 'Spectral flatness over time (0 tonal, 1 white noise), 0 to 640 ms');
  for (const [p, c] of [[a, col[0]], [b, col[1]]] as const) s += line(p.flatness.map((v, i) => [630 + i * 540 / 8, 330 - v * 260] as [number, number]), c);
  // Decay curves.
  s += panel(16, 360, 1168, 300, 'Band decay curves: level (dB, 0 to −60) at 0, 5, 10, 20, 40, 80, 160, 320, 640 ms, in octaves 31.5 Hz to 16 kHz');
  OCTAVES.forEach((hz, k) => {
    const x0 = 30 + k * 115;
    s += `<text x="${x0}" y="${650}" fill="#999" font-size="11" font-family="sans-serif">${hz >= 1000 ? hz / 1000 + 'k' : hz}</text>`;
    for (const [p, c] of [[a, col[0]], [b, col[1]]] as const) s += line(p.decay[k].map((v, i) => [x0 + i * 13, 390 + Math.min(60, -v) / 60 * 240] as [number, number]), c);
  });
  const row = (label: string, va: string, vb: string, dv: number, y: number) => `<text x="16" y="${y}" fill="#ccc" font-size="13" font-family="monospace">${label.padEnd(14)} ${va.padStart(9)} ${vb.padStart(9)}   term ${dv.toFixed(2)}</text>`;
  s += row('attack ms', a.attackMs.toFixed(2), b.attackMs.toFixed(2), d.attack, 690) + row('crest dB', a.crestDb.toFixed(1), b.crestDb.toFixed(1), d.crest, 708) + row('tonal ratio', a.tonal.toFixed(3), b.tonal.toFixed(3), d.tonal, 726) + row('length ms', String(a.lengthMs), String(b.lengthMs), 0, 744);
  s += `<text x="620" y="690" fill="#ccc" font-size="13" font-family="monospace">envelope ${d.envelope.toFixed(2)}  decay ${d.decay.toFixed(2)}  flatness ${d.flatness.toFixed(2)}</text>`;
  return s + '</svg>';
}
const esc = (t: string) => t.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
