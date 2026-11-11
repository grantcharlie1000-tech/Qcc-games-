import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav, measure } from './audio-harness';

const SR = 48000;
const sine = (hz: number, seconds: number, amp = 0.5) => Float32Array.from({ length: SR * seconds }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / SR));

describe('the sound lab measures what it is given', () => {
  it('reads level, balance and span of a plain tone', () => {
    const m = measure([sine(1000, 0.5)], SR);
    expect(m.peakDb).toBeCloseTo(-6.02, 1);
    expect(m.rmsDb).toBeCloseTo(-9.03, 1);
    expect(m.bands.mid).toBeGreaterThan(0.95);
    expect(m.centroid).toBeGreaterThan(900); expect(m.centroid).toBeLessThan(1100);
    expect(m.span).toBeCloseTo(0.5, 2);
    expect(m.nan + m.clipped).toBe(0);
    expect(Math.abs(m.dc)).toBeLessThan(1e-3);
  });

  it('puts a low tone below 150 Hz and a high one above 4 kHz', () => {
    expect(measure([sine(60, 0.5)], SR).bands.sub).toBeGreaterThan(0.9);
    const hi = measure([sine(6000, 0.5)], SR);
    expect(hi.bands.pres).toBeGreaterThan(0.9);
  });

  it('times a decaying burst: fast attack, a decay that follows the envelope', () => {
    const x = new Float32Array(SR);
    for (let i = 0; i < x.length; i++) x[i] = Math.exp(-i / SR / 0.05) * Math.sin(i * 0.3) * 0.8; // 40 dB down in ~0.23 s
    const m = measure([x], SR);
    expect(m.attack).toBeLessThan(0.002);
    expect(m.decay40).toBeGreaterThan(0.18); expect(m.decay40).toBeLessThan(0.3);
  });

  it('counts clipping and broken samples', () => {
    const x = sine(200, 0.1, 1.4); x[10] = Number.NaN;
    const m = measure([x], SR);
    expect(m.clipped).toBeGreaterThan(100); expect(m.nan).toBe(1);
  });

  it('round-trips WAV files', () => {
    const a = sine(440, 0.05), b = sine(880, 0.05, 0.25);
    const back = decodeWav(encodeWav([a, b], SR, true));
    expect(back.sr).toBe(SR); expect(back.ch[1][100]).toBeCloseTo(b[100], 6);
    const pcm = decodeWav(encodeWav([a], SR));
    expect(pcm.ch[0][77]).toBeCloseTo(a[77], 3);
  });
});
