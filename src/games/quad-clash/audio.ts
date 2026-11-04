/** Synthesised Quad Clash sound: per-weapon shots, explosions, hit and elimination ticks, reloads, pickups, streak
 * fanfares and the school bell that opens and closes a match. Web Audio only, created after the first gesture,
 * silent while the shell's sound setting is off. Distant sounds are quieter. */
import type { WeaponId } from './config';

export interface Sfx {
  shot(weapon: WeaponId, distance: number): void;
  explode(distance: number): void;
  hit(head: boolean): void;
  kill(): void;
  hurt(): void;
  reload(): void;
  dry(): void;
  swap(): void;
  pickup(): void;
  jump(): void;
  bounce(distance: number): void;
  streak(): void;
  bell(): void;
  zone(): void;
  dispose(): void;
}

const SHOT: Record<WeaponId, { f: number; len: number; noise: number; body: number; gain: number }> = {
  bell: { f: 900, len: 0.09, noise: 0.7, body: 150, gain: 0.32 },
  detention: { f: 500, len: 0.22, noise: 0.95, body: 90, gain: 0.5 },
  hallpass: { f: 1100, len: 0.14, noise: 0.75, body: 180, gain: 0.4 },
  firedrill: { f: 300, len: 0.3, noise: 0.9, body: 70, gain: 0.45 },
  recess: { f: 1400, len: 0.06, noise: 0.6, body: 220, gain: 0.25 },
  valedictorian: { f: 700, len: 0.32, noise: 0.9, body: 80, gain: 0.55 },
  triple: { f: 1000, len: 0.08, noise: 0.7, body: 170, gain: 0.3 },
  pencil: { f: 1600, len: 0.07, noise: 0.55, body: 260, gain: 0.26 },
};

export function createSfx(enabled: () => boolean): Sfx {
  let ctx: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null;
  function ready(): AudioContext | null {
    if (!enabled()) return null;
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
      master = ctx.createGain(); master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  }
  const falloff = (d: number) => 1 / (1 + d * d / 300);
  function burst(c: AudioContext, len: number, freq: number, gain: number, type: BiquadFilterType = 'bandpass', q = 0.8, at = 0) {
    const src = c.createBufferSource(); src.buffer = noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); const t = c.currentTime + at;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(master!);
    src.start(t, Math.random() * 0.5); src.stop(t + len + 0.02);
  }
  function tone(c: AudioContext, f0: number, f1: number, len: number, gain: number, type: OscillatorType = 'sine', at = 0) {
    const o = c.createOscillator(); o.type = type;
    const g = c.createGain(); const t = c.currentTime + at;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(master!);
    o.start(t); o.stop(t + len + 0.02);
  }
  return {
    shot(weapon, distance) {
      const c = ready(); if (!c) return;
      const s = SHOT[weapon], k = falloff(distance);
      burst(c, s.len, s.f, s.gain * s.noise * k, 'bandpass', 0.7);
      tone(c, s.body * 2, s.body * 0.6, s.len * 1.2, s.gain * 0.6 * k, 'triangle');
      if (weapon === 'bell' && distance < 1) tone(c, 2400, 2350, 0.12, 0.03, 'sine', 0.01);
    },
    explode(distance) {
      const c = ready(); if (!c) return;
      const k = falloff(distance * 0.6);
      burst(c, 0.9, 400, 0.9 * k, 'lowpass', 0.5);
      tone(c, 90, 30, 0.7, 0.6 * k, 'sine');
    },
    hit(head) { const c = ready(); if (!c) return; tone(c, head ? 1800 : 1200, head ? 1700 : 1100, 0.06, 0.18, 'square'); },
    kill() { const c = ready(); if (!c) return; tone(c, 880, 880, 0.08, 0.16, 'triangle'); tone(c, 1320, 1320, 0.14, 0.16, 'triangle', 0.07); },
    hurt() { const c = ready(); if (!c) return; tone(c, 160, 70, 0.18, 0.3, 'sawtooth'); },
    reload() { const c = ready(); if (!c) return; burst(c, 0.05, 2500, 0.25, 'highpass', 1); burst(c, 0.06, 1800, 0.25, 'highpass', 1, 0.28); },
    dry() { const c = ready(); if (!c) return; burst(c, 0.03, 3000, 0.2, 'highpass', 2); },
    swap() { const c = ready(); if (!c) return; burst(c, 0.07, 1500, 0.18, 'bandpass', 2); },
    pickup() { const c = ready(); if (!c) return; tone(c, 660, 990, 0.12, 0.15, 'triangle'); },
    jump() { const c = ready(); if (!c) return; burst(c, 0.05, 600, 0.08, 'lowpass', 1); },
    bounce(distance) { const c = ready(); if (!c) return; tone(c, 1500, 1300, 0.05, 0.1 * falloff(distance), 'sine'); },
    streak() { const c = ready(); if (!c) return; [523, 659, 784, 1047].forEach((f, i) => tone(c, f, f, 0.16, 0.14, 'triangle', i * 0.08)); },
    bell() {
      // The school bell: a fast strike train on a bright partial set.
      const c = ready(); if (!c) return;
      for (let i = 0; i < 10; i++) { tone(c, 1250, 1240, 0.09, 0.08, 'square', i * 0.07); tone(c, 2950, 2940, 0.07, 0.04, 'sine', i * 0.07); }
    },
    zone() { const c = ready(); if (!c) return; tone(c, 440, 660, 0.2, 0.15, 'triangle'); tone(c, 660, 880, 0.25, 0.12, 'triangle', 0.15); },
    dispose() { if (ctx) void ctx.close().catch(() => {}); ctx = null; master = null; noise = null; },
  };
}
