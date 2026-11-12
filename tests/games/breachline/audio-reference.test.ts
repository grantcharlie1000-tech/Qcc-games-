import { describe, expect, it } from 'vitest';
import { distance, profile, sheetSvg } from './audio-reference';

const SR = 48000;
function rnd(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }
const noiseBurst = (seed: number, tau = 0.05, seconds = 0.8) => { const r = rnd(seed); return Float32Array.from({ length: SR * seconds }, (_, i) => r() * Math.exp(-i / SR / tau) * 0.8); };
const sineBurst = (hz: number, tau = 0.05, seconds = 0.8) => Float32Array.from({ length: SR * seconds }, (_, i) => Math.sin(2 * Math.PI * hz * i / SR) * Math.exp(-i / SR / tau) * 0.8);
const pad = (x: Float32Array, ms: number) => { const y = new Float32Array(x.length + Math.round(SR * ms / 1000)); y.set(x, y.length - x.length); return y; };

describe('reference matching', () => {
  it('scores a sound against itself as identical, and is blind to leading silence', () => {
    const a = noiseBurst(1);
    expect(distance(profile(a, SR), profile(a, SR)).total).toBe(0);
    expect(distance(profile(a, SR), profile(pad(a, 37), SR)).total).toBeLessThan(0.05);
  });

  it('sees a tone as tonal and not flat, and decaying noise as flat and not tonal', () => {
    const tone = profile(sineBurst(150), SR), noise = profile(noiseBurst(2), SR);
    expect(tone.tonal).toBeGreaterThan(0.5);
    expect(noise.tonal).toBeLessThan(0.05);
    expect(noise.flatness[1]).toBeGreaterThan(0.4);
    expect(tone.flatness[1]).toBeLessThan(0.05);
  });

  it('measures attack and decay: a 5 ms ramp, and noise decaying 20 dB in ~115 ms', () => {
    const ramp = noiseBurst(3, 0.05); for (let i = 0; i < SR * 0.005; i++) ramp[i] *= i / (SR * 0.005);
    expect(profile(ramp, SR).attackMs).toBeGreaterThan(2.5);
    expect(profile(ramp, SR).attackMs).toBeLessThan(7);
    expect(profile(noiseBurst(4), SR).attackMs).toBeLessThan(2);
    const p = profile(noiseBurst(5, 0.05), SR); // 20 dB = ln(10) * tau = 115 ms
    for (const k of [5, 6, 7]) { expect(p.t20[k]).toBeGreaterThan(90); expect(p.t20[k]).toBeLessThan(140); }
  });

  it('puts two takes of the same kind of sound closer than two different kinds', () => {
    const a = profile(noiseBurst(6), SR), b = profile(noiseBurst(7), SR), tone = profile(sineBurst(200), SR), long = profile(noiseBurst(8, 0.25), SR);
    const same = distance(a, b).total;
    // Two takes of the same noise scatter by up to ~0.8 (few degrees of freedom in a short sound's low bands): that is
    // this measure's floor, and differences under it mean nothing.
    expect(same).toBeLessThan(0.9);
    expect(distance(a, tone).total).toBeGreaterThan(same + 5);
    expect(distance(a, long).total).toBeGreaterThan(same + 0.7);
  });

  it('draws a sheet', () => {
    const svg = sheetSvg('ours', profile(sineBurst(120), SR), 'reference', profile(noiseBurst(9), SR));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('distance');
  });
});
