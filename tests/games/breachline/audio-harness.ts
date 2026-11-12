/** Breachline sound lab, Node side: measurements, WAV files and spectrogram pictures for audio rendered offline in
 * the browser (see audio-page.ts and audio-lab.ts). Nobody building the sound can hear it, so every claim about it
 * rests on these numbers and pictures. Plan: docs/superpowers/plans/2026-11-11-breachline-audio-overhaul.md §6. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const BANDS = [
  ['sub', 20, 80], ['low', 80, 150], ['lowmid', 150, 500], ['mid', 500, 2000], ['himid', 2000, 4000], ['pres', 4000, 8000], ['air', 8000, 20000],
] as const;
export type Band = typeof BANDS[number][0];

export interface Measure {
  seconds: number;
  peakDb: number; rmsDb: number; dc: number; nan: number; clipped: number;
  /** Seconds from the start to the first sample within 6 dB of the peak. */
  attack: number;
  /** Seconds of signal: from the first sample above -60 dB re peak to the last above it. */
  span: number;
  /** Seconds after the peak until a 10 ms window falls 40 dB under the loudest window. */
  decay40: number;
  /** Share of energy in each band, 0..1. */
  bands: Record<Band, number>;
  /** Spectral centroid in Hz. */
  centroid: number;
  /** Loudest 400 ms window, in dB RMS (a short-term loudness stand-in). */
  shortTermDb: number;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -200);

/** Mono sum of the channels. */
export function mono(ch: Float32Array[]): Float32Array {
  if (ch.length === 1) return ch[0];
  const out = new Float32Array(ch[0].length);
  for (const c of ch) for (let i = 0; i < out.length; i++) out[i] += c[i] / ch.length;
  return out;
}

/** In-place radix-2 FFT of (re, im), length a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/** Average power spectrum over Hann-windowed frames (hop = size / 2). Returns power per bin, bin width sr / size. */
export function powerSpectrum(x: Float32Array, size = 2048, from = 0, to = x.length): Float64Array {
  const p = new Float64Array(size / 2), re = new Float64Array(size), im = new Float64Array(size);
  let frames = 0;
  for (let s = from; s + size <= Math.max(to, from + size) && s < x.length; s += size / 2) {
    for (let i = 0; i < size; i++) { re[i] = (x[s + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / size)); im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) p[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  if (frames) for (let k = 0; k < p.length; k++) p[k] /= frames;
  return p;
}

export function bandShares(p: Float64Array, sr: number): { bands: Record<Band, number>; centroid: number } {
  const hz = sr / (p.length * 2), bands = Object.fromEntries(BANDS.map(([n]) => [n, 0])) as Record<Band, number>;
  let total = 0, moment = 0;
  for (let k = 1; k < p.length; k++) {
    const f = k * hz; if (f < 20) continue;
    total += p[k]; moment += p[k] * f;
    for (const [n, lo, hi] of BANDS) if (f >= lo && f < hi) bands[n] += p[k];
  }
  for (const [n] of BANDS) bands[n] = total ? bands[n] / total : 0;
  return { bands, centroid: total ? moment / total : 0 };
}

/** RMS of each window of `win` samples. */
export function envelope(x: Float32Array, win: number): Float64Array {
  const out = new Float64Array(Math.ceil(x.length / win));
  for (let w = 0; w < out.length; w++) {
    let s = 0, n = 0;
    for (let i = w * win; i < Math.min(x.length, (w + 1) * win); i++) { s += x[i] * x[i]; n++; }
    out[w] = Math.sqrt(s / Math.max(1, n));
  }
  return out;
}

export function measure(ch: Float32Array[], sr: number): Measure {
  let peak = 0, sum = 0, sq = 0, nan = 0, clipped = 0, n = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) {
    const v = c[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += v; sq += v * v; n++;
  }
  const x = mono(ch), floor = peak * 1e-3;
  let first = -1, last = -1, attackAt = -1;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > floor) { if (first < 0) first = i; last = i; }
    if (attackAt < 0 && a >= peak * 0.5) attackAt = i;
  }
  const w10 = Math.round(sr * 0.01), env = envelope(x, w10);
  let maxW = 0; for (let i = 1; i < env.length; i++) if (env[i] > env[maxW]) maxW = i;
  let endW = maxW; while (endW < env.length - 1 && env[endW] > env[maxW] * 0.01) endW++;
  const w400 = Math.round(sr * 0.4), e400 = envelope(x, Math.round(sr * 0.05));
  let st = 0;
  for (let i = 0; i < e400.length; i++) { let s = 0, k = 0; for (let j = i; j < Math.min(e400.length, i + w400 / Math.round(sr * 0.05)); j++) { s += e400[j] ** 2; k++; } st = Math.max(st, Math.sqrt(s / Math.max(1, k))); }
  const { bands, centroid } = bandShares(powerSpectrum(x, 2048, Math.max(0, first), last + 1), sr);
  return {
    seconds: ch[0].length / sr, peakDb: db(peak), rmsDb: db(Math.sqrt(sq / Math.max(1, n))), dc: sum / Math.max(1, n), nan, clipped,
    attack: attackAt < 0 ? 0 : attackAt / sr, span: first < 0 ? 0 : (last - first) / sr, decay40: (endW - maxW) * 0.01,
    bands, centroid, shortTermDb: db(st),
  };
}

/** 16-bit or 32-bit float PCM WAV. */
export function encodeWav(ch: Float32Array[], sr: number, float = false): Buffer {
  const nc = ch.length, len = ch[0].length, bps = float ? 4 : 2, data = Buffer.alloc(len * nc * bps), hdr = Buffer.alloc(44);
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) {
    const v = ch[c][i], o = (i * nc + c) * bps;
    if (float) data.writeFloatLE(Number.isFinite(v) ? v : 0, o);
    else data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0)) * 32767), o);
  }
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(float ? 3 : 1, 20); hdr.writeUInt16LE(nc, 22); hdr.writeUInt32LE(sr, 24);
  hdr.writeUInt32LE(sr * nc * bps, 28); hdr.writeUInt16LE(nc * bps, 32); hdr.writeUInt16LE(bps * 8, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  return Buffer.concat([hdr, data]);
}

export function decodeWav(buf: Buffer): { ch: Float32Array[]; sr: number } {
  const fmt = buf.readUInt16LE(20), nc = buf.readUInt16LE(22), sr = buf.readUInt32LE(24), bits = buf.readUInt16LE(34);
  let o = 12; while (buf.toString('ascii', o, o + 4) !== 'data') o += 8 + buf.readUInt32LE(o + 4);
  const len = buf.readUInt32LE(o + 4) / (nc * bits / 8), ch = Array.from({ length: nc }, () => new Float32Array(len));
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) {
    const p = o + 8 + (i * nc + c) * bits / 8;
    // Format 3 is float; 0xFFFE (extensible, as ffmpeg writes) carries the real type in its sub-format, which for
    // these files follows the bit depth: 32-bit is float here, 24 and 16 are integers.
    ch[c][i] = fmt === 3 || (fmt === 0xfffe && bits === 32) ? buf.readFloatLE(p) : bits === 24 ? buf.readIntLE(p, 3) / 8388607 : buf.readInt16LE(p) / 32767;
  }
  return { ch, sr };
}

/** A listening file for the owner: 16-bit mono at a reduced rate, through ffmpeg. */
export function listeningWav(srcFloatWav: string, out: string, rate = 22050, stereo = false): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', srcFloatWav, '-ac', stereo ? '2' : '1', '-ar', String(rate), '-c:a', 'pcm_s16le', out]);
}

/** A spectrogram picture (log frequency, dB colour) with the waveform above, for looking at a sound. */
export function spectrogram(wav: string, png: string, title: string, width = 1200): void {
  const tmpS = png.replace(/\.png$/, '.s.png'), tmpW = png.replace(/\.png$/, '.w.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-lavfi', `aformat=channel_layouts=mono,showspectrumpic=s=${width}x360:mode=combined:fscale=log:scale=log:color=intensity:legend=1:drange=90:win_func=hann`, tmpS]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-lavfi', `aformat=channel_layouts=mono,showwavespic=s=${width}x120:colors=0x9fd3ff:scale=sqrt:draw=full`, '-frames:v', '1', tmpW]);
  execFileSync('convert', [tmpW, '-background', '#111', '-gravity', 'center', '-extent', `${width + 240}x120`, tmpS, '-append', '-gravity', 'north', '-fill', 'white', '-pointsize', '18', '-annotate', '+0+4', title, png]);
  execFileSync('rm', ['-f', tmpS, tmpW]);
}

/** Lays several spectrogram pictures out in a grid, to look at a group at once. */
export function contactSheet(pngs: string[], out: string, cols = 3): void {
  execFileSync('montage', [...pngs, '-tile', `${cols}x`, '-geometry', '+4+4', '-background', '#222', out]);
}

export function writeJson(path: string, v: unknown): void { writeFileSync(path, JSON.stringify(v, null, 1) + '\n'); }
