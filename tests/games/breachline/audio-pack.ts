/** Builds a Breachline sample pack (plan A, docs/evidence/breachline/audio/STATUS.md) from recordings in a folder
 * outside the repository. Each take is found by its onset, trimmed, faded, high-passed, levelled to a common
 * short-term loudness and written, with a gap between takes, into one Opus file plus an index:
 *   <out>/pack.ogg   Opus in Ogg, mono 48 kHz
 *   <out>/pack.json  { version, sr, keys: { "gun.ar.fp": [{ start, length }, ...] } } in samples at 48 kHz
 * Usage: AUDIO_PACK_MAIN=1 npx vite-node tests/games/breachline/audio-pack.ts -- <manifest.json> <sourceDir> <outDir>
 * The manifest: { "takes": [{ "key": "gun.ar.fp", "file": "AR-15/D_32P.wav", "keepMs": 55, "fadeMs": 60,
 *   "max": 2, "gainDb": 0 }, ...], "loudness": -14, "bitrate": 64 }.
 * Nothing here runs in the game; the game only reads the two output files when a pack URL is configured. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** `burst`: the file is automatic fire; shots are split 60 ms apart on an 8 dB rise (single shots need 300 ms and 15 dB). */
/** `ranges`: cut these [start, end] ms spans as takes (for handling sounds with no single onset), with a 3 ms fade-in
 * and `fadeMs` out, instead of finding shots. */
/** `pitch`: playback-rate factor applied before cutting (for "derived" takes: a real recording repurposed).
 * `under`: another recording mixed under each take (same length, from `startMs`, at `gainDb`), e.g. real rifle
 * handling under a light magazine click. */
export interface PackTake {
  key: string; file: string; keepMs: number; fadeMs: number; max?: number; gainDb?: number; burst?: boolean; skip?: number;
  ranges?: [number, number][]; pitch?: number; lowpass?: number; under?: { file: string; startMs: number; gainDb: number; pitch?: number };
}
/** `hybrids`: keys whose takes are also recombined (each take's first 4 ms joined to another's body), for guns with
 * few takes, so automatic fire never alternates between two. */
/** `half`: key prefixes the game may keep at half rate (24 kHz) after decoding: short handling sounds, to save memory. */
export interface PackManifest { takes: PackTake[]; loudness?: number; bitrate?: number; hybrids?: string[]; half?: string[] }
export interface PackIndex { version: 1; sr: number; keys: Record<string, { start: number; length: number }[]>; half?: string[] }

const SR = 48000, GAP = Math.round(SR * 0.1);

/** Mono float samples at 48 kHz, high-passed at 30 Hz, from any file ffmpeg reads. */
export function decode(path: string, pitch = 1, lowpass = 0): Float32Array {
  const af = (pitch !== 1 ? `asetrate=${Math.round(SR * pitch)},aresample=${SR},` : '') + 'highpass=f=30' + (lowpass ? `,lowpass=f=${lowpass},lowpass=f=${lowpass}` : '');
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-af', af, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice();
}
/** Sample indices where a shot starts: a 10 ms window 15 dB over the 50 ms before it, within 12 dB of the loudest. */
export function onsets(x: Float32Array, burst = false): number[] {
  const rise = burst ? 8 : 15, gap = burst ? 6 : 30;
  const w = SR / 100, db: number[] = [];
  for (let i = 0; i + w <= x.length; i += w) { let s = 0; for (let j = i; j < i + w; j++) s += x[j] * x[j]; db.push(10 * Math.log10(s / w + 1e-12)); }
  const top = Math.max(...db), out: number[] = [];
  for (let i = 5; i < db.length; i++) {
    if (db[i] > top - 12 && db[i] - Math.max(...db.slice(i - 5, i)) > rise) {
      const s = Math.max(0, (i - 1) * w), seg = x.subarray(s, s + 3 * w);
      let pk = 0; for (const v of seg) pk = Math.max(pk, Math.abs(v));
      out.push(s + seg.findIndex(v => Math.abs(v) >= pk * 0.0316)); i += gap; // before another shot can start
    }
  }
  return out;
}
/** One take: 2 ms before the onset, `keepMs` kept, then a raised-cosine fade over `fadeMs`; DC removed. */
export function cut(x: Float32Array, onset: number, keepMs: number, fadeMs: number): Float32Array {
  const a = Math.max(0, onset - Math.round(SR * 0.002)), keep = Math.round(SR * keepMs / 1000), fade = Math.round(SR * fadeMs / 1000);
  const y = x.slice(a, Math.min(x.length, a + keep + fade));
  for (let i = 0; i < fade && keep + i < y.length; i++) y[keep + i] *= 0.5 + 0.5 * Math.cos(Math.PI * i / fade);
  let m = 0; for (const v of y) m += v; m /= y.length || 1;
  for (let i = 0; i < y.length; i++) y[i] -= m;
  return y;
}
/** The loudest 50 ms RMS in dB, a short-term loudness stand-in. */
export function shortTerm(x: Float32Array): number {
  const w = SR / 20; let best = 0;
  for (let i = 0; i + w <= x.length; i += w / 2) { let s = 0; for (let j = i; j < i + w; j++) s += x[j] * x[j]; best = Math.max(best, s / w); }
  return 10 * Math.log10(best + 1e-12);
}

export function buildPack(manifest: PackManifest, sourceDir: string, outDir: string): PackIndex {
  mkdirSync(outDir, { recursive: true });
  const target = manifest.loudness ?? -14, parts: Float32Array[] = [], index: PackIndex = { version: 1, sr: SR, keys: {}, ...(manifest.half ? { half: manifest.half } : {}) };
  let at = 0;
  const byKey = new Map<string, Float32Array[]>();
  const emit = (key: string, y: Float32Array) => { (index.keys[key] ??= []).push({ start: at, length: y.length }); parts.push(y, new Float32Array(GAP)); at += y.length + GAP; };
  for (const t of manifest.takes) {
    const x = decode(join(sourceDir, t.file), t.pitch, t.lowpass), under = t.under ? decode(join(sourceDir, t.under.file), t.under.pitch) : null;
    const cuts = t.ranges ? t.ranges.map(([a, b]) => { const y = cut(x, Math.round(SR * a / 1000) + Math.round(SR * 0.002), b - a, t.fadeMs); for (let i = 0; i < Math.min(y.length, SR * 0.003); i++) y[i] *= i / (SR * 0.003); return y; })
      : onsets(x, t.burst).slice(t.skip ?? 0, (t.skip ?? 0) + (t.max ?? 99)).map(o => cut(x, o, t.keepMs, t.fadeMs));
    for (const y0 of cuts) {
      if (under && t.under) { const o = Math.round(SR * t.under.startMs / 1000), g = Math.pow(10, t.under.gainDb / 20); for (let i = 0; i < y0.length; i++) y0[i] += (under[o + i] ?? 0) * g * Math.min(1, i / (SR * 0.003), (y0.length - i) / (SR * 0.02)); }
      const y = y0, g = Math.pow(10, (target - shortTerm(y) + (t.gainDb ?? 0)) / 20);
      let pk = 0; for (let i = 0; i < y.length; i++) { y[i] *= g; pk = Math.max(pk, Math.abs(y[i])); }
      if (pk > 0.98) for (let i = 0; i < y.length; i++) y[i] *= 0.98 / pk; // never clip the encoder
      emit(t.key, y);
      byKey.set(t.key, [...(byKey.get(t.key) ?? []), y]);
    }
  }
  for (const key of manifest.hybrids ?? []) {
    const takes = byKey.get(key) ?? [], head = Math.round(SR * 0.004), xf = Math.round(SR * 0.001);
    for (let i = 0; i < takes.length; i++) for (let j = 0; j < takes.length; j++) {
      if (i === j) continue;
      const a = takes[i], b = takes[j], y = b.slice();
      for (let k = 0; k < Math.min(head + xf, y.length, a.length); k++) { const w = k < head ? 1 : 1 - (k - head) / xf; y[k] = a[k] * w + b[k] * (1 - w); }
      emit(key, y);
    }
  }
  const all = new Float32Array(at); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const raw = join(outDir, 'pack.f32');
  writeFileSync(raw, Buffer.from(all.buffer));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', raw, '-c:a', 'libopus', '-b:a', `${manifest.bitrate ?? 64}k`, '-application', 'audio', join(outDir, 'pack.ogg')]);
  execFileSync('rm', ['-f', raw]);
  writeFileSync(join(outDir, 'pack.json'), JSON.stringify(index));
  return index;
}

if (process.env.AUDIO_PACK_MAIN === '1') {
  const [manifest, src, out] = process.argv.slice(2).filter(a => a !== '--');
  if (manifest && src && out) {
    const idx = buildPack(JSON.parse(readFileSync(manifest, 'utf8')), src, out);
    console.log(Object.entries(idx.keys).map(([k, v]) => `${k}: ${v.length} takes`).join('\n'));
  }
}
