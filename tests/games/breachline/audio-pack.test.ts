import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeWav } from './audio-harness';
import { buildPack, decode, onsets, shortTerm, type PackIndex } from './audio-pack';

const SR = 48000;
/** A generated "recording": three noise bursts 1.5 s apart, each a sharp hit with a decay, at different levels. */
function fixture(seed: number, levels = [0.9, 0.5, 0.7]): Float32Array {
  let s = seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
  const x = new Float32Array(SR * 5);
  levels.forEach((lv, k) => { const o = Math.round(SR * (0.4 + k * 1.5)); for (let i = 0; i < SR * 0.4; i++) x[o + i] += r() * lv * Math.exp(-i / SR / 0.03); });
  return x;
}

describe('the sample pack builder (plan A)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'));
  writeFileSync(join(dir, 'a.wav'), encodeWav([fixture(1)], SR, true));
  writeFileSync(join(dir, 'b.wav'), encodeWav([fixture(2, [0.3, 0.6])], SR, true));

  it('finds each shot in a recording', () => {
    const o = onsets(decode(join(dir, 'a.wav')));
    expect(o.length).toBe(3);
    o.forEach((v, k) => expect(Math.abs(v - SR * (0.4 + k * 1.5))).toBeLessThan(SR * 0.002));
  });

  it('writes an Opus pack and an index whose takes decode back in place, levelled alike', () => {
    const out = join(dir, 'pack');
    const idx = buildPack({ loudness: -16, takes: [{ key: 'gun.x.fp', file: 'a.wav', keepMs: 60, fadeMs: 40 }, { key: 'gun.x.tp', file: 'b.wav', keepMs: 150, fadeMs: 60, max: 1 }] }, dir, out);
    expect(idx.keys['gun.x.fp']).toHaveLength(3);
    expect(idx.keys['gun.x.tp']).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(out, 'pack.json'), 'utf8')) as PackIndex).toEqual(idx);
    const bytes = statSync(join(out, 'pack.ogg')).size;
    expect(bytes).toBeGreaterThan(1000); expect(bytes).toBeLessThan(40000);
    const back = decode(join(out, 'pack.ogg'));
    for (const t of [...idx.keys['gun.x.fp'], ...idx.keys['gun.x.tp']]) {
      const take = back.subarray(t.start, t.start + t.length);
      // The onset sits 2 ms in, give or take the codec's alignment; every take lands within 1.5 dB of the target.
      const first = take.findIndex(v => Math.abs(v) > 0.05);
      expect(first).toBeGreaterThan(SR * 0.0005); expect(first).toBeLessThan(SR * 0.006);
      expect(Math.abs(shortTerm(take) - -16)).toBeLessThan(1.5);
    }
  });

  it('decodes in the codec ffmpeg reports (Opus)', () => {
    const codec = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', join(dir, 'pack', 'pack.ogg')]).toString().trim();
    expect(codec).toBe('opus');
  });
});
