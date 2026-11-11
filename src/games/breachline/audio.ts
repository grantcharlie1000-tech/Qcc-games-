/** Sound, synthesised with Web Audio: no audio files. Every world sound is placed (pan and distance), muffled by
 * whatever stands between it and the listener (a soft wall a little, brick a lot), and sent to a shared reverb, so
 * footsteps and gunfire can be read through walls. Nothing plays unless the arcade's sound setting is on. */
import type { WeaponId } from './config';

export type Surface = 'hard' | 'soft' | 'wood' | 'metal' | 'grass';
export interface At { x: number; y: number; z: number; /** 0 clear, 1-3 destructible layers, 4 solid. */ block: number }
export interface Sfx {
  listen(x: number, y: number, z: number, yaw: number, indoors: boolean): void;
  shot(w: WeaponId, at: At | null): void;
  step(surface: Surface, loud: number, at: At | null): void;
  reload(seconds: number, at: At | null): void;
  melee(at: At | null): void;
  crumble(wood: boolean, big: boolean, at: At): void;
  boom(at: At, power: number): void;
  bounce(at: At): void;
  throwIt(at: At | null): void;
  chargeSet(at: At): void;
  build(reinforce: boolean, at: At): void;
  work(kind: 'plant' | 'defuse' | 'reinforce' | 'barricade' | 'charge', at: At | null): void;
  beep(at: At, urgent: boolean): void;
  hit(head: boolean): void; hurt(): void; kill(): void; dry(): void; swap(): void; ui(): void;
  round(kind: 'start' | 'go' | 'win' | 'lose' | 'planted' | 'matchWin' | 'matchLose'): void;
  suspend(): void; resume(): void; dispose(): void;
}

const GUN: Record<WeaponId, { band: number; decay: number; thump: number; gain: number; crack: number }> = {
  ar: { band: 1700, decay: 0.14, thump: 150, gain: 1, crack: 5200 }, carbine: { band: 2100, decay: 0.12, thump: 165, gain: 0.95, crack: 6000 },
  smg: { band: 2700, decay: 0.085, thump: 190, gain: 0.8, crack: 6500 }, shotgun: { band: 800, decay: 0.3, thump: 105, gain: 1.35, crack: 3200 },
  dmr: { band: 1300, decay: 0.22, thump: 125, gain: 1.25, crack: 4500 }, pistol: { band: 2300, decay: 0.09, thump: 200, gain: 0.75, crack: 5600 },
};

export function createSfx(enabled: () => boolean): Sfx {
  let ctx: AudioContext | null = null, master: GainNode, reverb: ConvolverNode, noiseBuf: AudioBuffer, wind: GainNode, hum: GainNode;
  const ear = { x: 0, y: 1.6, z: 0, yaw: 0, indoors: false };
  let dead = false, voices = 0;
  function start(): AudioContext | null {
    if (dead || !enabled()) return null;
    if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return ctx; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // A small-room impulse: decaying noise, darker as it dies away.
    const len = Math.floor(ctx.sampleRate * 1.5), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const b = ir.getChannelData(c); let low = 0; for (let i = 0; i < len; i++) { const t = i / len; low += ((Math.random() * 2 - 1) - low) * (0.5 - 0.42 * t); b[i] = low * Math.pow(1 - t, 3.2) * (i < 400 ? i / 400 : 1); } }
    reverb = ctx.createConvolver(); reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55; reverb.connect(wet); wet.connect(master);
    // Ambience: wind outdoors, a mains hum indoors.
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    wind = ctx.createGain(); wind.gain.value = 0; src.connect(lp); lp.connect(wind); wind.connect(master); src.start();
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 120; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    hum = ctx.createGain(); hum.gain.value = 0; hum.connect(master);
    for (const [f, g] of [[60, 0.5], [120, 0.22], [180, 0.08]] as const) { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = f; og.gain.value = g; o.connect(og); og.connect(hum); o.start(); }
    return ctx;
  }
  /** The output chain for a sound at a place (or in the head when `at` is null). Null when out of earshot. */
  function bus(at: At | null, vol: number, reach = 60, wetness = 0.3): AudioNode | null {
    const c = start();
    if (!c || voices > 40) return null;
    const out = c.createGain();
    if (!at) { out.gain.value = vol; out.connect(master); return out; }
    const dx = at.x - ear.x, dz = at.z - ear.z, dist = Math.hypot(dx, at.y - ear.y, dz);
    if (dist > reach) return null;
    const block = at.block, fall = Math.pow(1 - dist / reach, 2) / (1 + dist * 0.09);
    out.gain.value = vol * fall * (block >= 4 ? 0.42 : block > 0 ? 0.8 - block * 0.08 : 1);
    // Bearing relative to where the listener faces; sounds behind are a touch duller.
    const fx = -Math.sin(ear.yaw), fz = -Math.cos(ear.yaw), rx = Math.cos(ear.yaw), rz = -Math.sin(ear.yaw), d = Math.max(0.5, Math.hypot(dx, dz));
    const side = (dx * rx + dz * rz) / d, front = (dx * fx + dz * fz) / d;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = (block >= 4 ? 700 : block > 0 ? 3200 - block * 600 : 18000) * (front < 0 ? 0.7 : 1) * Math.max(0.25, 1 - dist / (reach * 1.6));
    const pan = c.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, side * 0.9));
    out.connect(lp); lp.connect(pan); pan.connect(master);
    const send = c.createGain(); send.gain.value = wetness * (ear.indoors ? 1.25 : 0.6) * (1 + dist / 25); pan.connect(send); send.connect(reverb);
    return out;
  }
  function track(node: AudioScheduledSourceNode) { voices++; node.onended = () => { voices--; }; }
  function noise(dest: AudioNode, when: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, attack = 0.002) {
    const c = ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(20, f0), when); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + attack); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(when, Math.random() * 0.9); src.stop(when + dur + 0.02); track(src);
  }
  function tone(dest: AudioNode, when: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number, attack = 0.004) {
    const c = ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), when + dur);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + attack); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest); o.start(when); o.stop(when + dur + 0.02); track(o);
  }
  const now = () => ctx!.currentTime + 0.004;
  const notes = (freqs: number[], gap: number, type: OscillatorType, gain: number, len = 0.22) => { const b = bus(null, 1); if (!b) return; freqs.forEach((f, i) => tone(b, now() + i * gap, len, type, f, f, gain, 0.01)); };

  return {
    listen(x, y, z, yaw, indoors) {
      ear.x = x; ear.y = y; ear.z = z; ear.yaw = yaw; ear.indoors = indoors;
      if (!ctx) return;
      const on = enabled() ? 1 : 0, t = ctx.currentTime;
      wind.gain.setTargetAtTime(on * (indoors ? 0.03 : 0.16), t, 0.4); hum.gain.setTargetAtTime(on * (indoors ? 0.012 : 0), t, 0.4);
    },
    shot(w, at) {
      const g = GUN[w], b = bus(at, g.gain * (at ? 1.5 : 0.85), 95, 0.45);
      if (!b) return;
      const t = now(), k = 0.94 + Math.random() * 0.12;
      noise(b, t, 0.018, 'highpass', g.crack * k, g.crack * 0.6, 0.7, 0.9, 0.0008);
      noise(b, t, g.decay, 'bandpass', g.band * k, g.band * 0.4, 0.8, 1.1, 0.001);
      noise(b, t, g.decay * 2.2, 'lowpass', 900, 160, 0.5, 0.5, 0.004);
      tone(b, t, g.decay * 0.9, 'sine', g.thump * k, g.thump * 0.3, 1, 0.001);
    },
    step(surface, loud, at) {
      const b = bus(at, (at ? 0.5 : 0.22) * loud, 24, 0.15);
      if (!b) return;
      const t = now(), f = surface === 'grass' ? 500 : surface === 'soft' ? 260 : surface === 'wood' ? 340 : surface === 'metal' ? 700 : 420;
      noise(b, t, surface === 'grass' ? 0.11 : 0.07, 'lowpass', f * (0.9 + Math.random() * 0.3), f * 0.5, 1.2, 0.8, 0.003);
      if (surface === 'wood' || surface === 'metal') tone(b, t, 0.05, 'sine', surface === 'metal' ? 320 : 150, 90, 0.35);
      if (surface === 'hard') noise(b, t + 0.012, 0.02, 'highpass', 2600, 2000, 0.6, 0.12);
    },
    reload(seconds, at) {
      const b = bus(at, at ? 0.55 : 0.4, 22, 0.12);
      if (!b) return;
      const t = now();
      for (const [when, f] of [[0.12, 1900], [0.42, 1300], [0.78, 2400], [0.86, 1500]] as const) { noise(b, t + seconds * when, 0.03, 'bandpass', f, f * 0.7, 2.5, 0.9, 0.001); tone(b, t + seconds * when, 0.025, 'square', f * 0.25, f * 0.2, 0.12); }
    },
    melee(at) { const b = bus(at, at ? 0.7 : 0.5, 20, 0.15); if (!b) return; const t = now(); noise(b, t, 0.16, 'bandpass', 500, 2200, 0.9, 0.6, 0.05); noise(b, t + 0.13, 0.07, 'lowpass', 300, 120, 1, 0.9); },
    crumble(wood, big, at) {
      const b = bus(at, big ? 1.3 : 0.6, 50, 0.3);
      if (!b) return;
      const t = now(), n = big ? 7 : 2;
      for (let i = 0; i < n; i++) { const f = wood ? 500 + Math.random() * 900 : 1100 + Math.random() * 2200; noise(b, t + i * 0.035 + Math.random() * 0.03, wood ? 0.07 : 0.11, 'bandpass', f, f * 0.5, wood ? 4 : 1, 0.8, 0.001); }
      if (wood) tone(b, t, 0.06, 'triangle', 240, 110, 0.5);
    },
    boom(at, power) {
      const b = bus(at, 2.4 * power, 130, 0.9);
      if (!b) return;
      const t = now();
      noise(b, t, 0.05, 'highpass', 3000, 900, 0.5, 1.2, 0.0008);
      noise(b, t, 1.3, 'lowpass', 2600, 70, 0.6, 1.4, 0.003);
      tone(b, t, 0.7, 'sine', 95, 26, 1.5, 0.002); tone(b, t, 0.3, 'triangle', 160, 40, 0.7, 0.002);
    },
    bounce(at) { const b = bus(at, 0.5, 28, 0.2); if (!b) return; const t = now(); tone(b, t, 0.04, 'sine', 1700 + Math.random() * 500, 1200, 0.5, 0.001); noise(b, t, 0.03, 'highpass', 3000, 2500, 1, 0.3, 0.001); },
    throwIt(at) { const b = bus(at, at ? 0.5 : 0.35, 16, 0.1); if (b) noise(b, now(), 0.18, 'bandpass', 700, 1900, 1.2, 0.5, 0.06); },
    chargeSet(at) { const b = bus(at, 0.6, 30, 0.15); if (!b) return; const t = now(); noise(b, t, 0.05, 'lowpass', 500, 200, 1, 0.8); tone(b, t + 0.1, 0.06, 'square', 1250, 1250, 0.25); tone(b, t + 0.22, 0.06, 'square', 1250, 1250, 0.25); },
    build(reinforce, at) {
      const b = bus(at, 0.9, 40, 0.3);
      if (!b) return;
      const t = now();
      if (reinforce) { noise(b, t, 0.09, 'bandpass', 900, 500, 1.5, 1.1, 0.001); tone(b, t, 0.3, 'triangle', 190, 150, 0.8, 0.002); tone(b, t + 0.01, 0.5, 'sine', 870, 850, 0.25, 0.002); }
      else for (let i = 0; i < 3; i++) { noise(b, t + i * 0.09, 0.05, 'bandpass', 800, 400, 3, 0.9, 0.001); tone(b, t + i * 0.09, 0.05, 'triangle', 210, 120, 0.5); }
    },
    work(kind, at) {
      const b = bus(at, at ? 0.5 : 0.3, 26, 0.15);
      if (!b) return;
      const t = now();
      if (kind === 'reinforce') { tone(b, t, 0.2, 'sawtooth', 120, 150, 0.22, 0.02); noise(b, t, 0.2, 'bandpass', 1800, 2400, 5, 0.25, 0.02); }
      else if (kind === 'barricade') { noise(b, t, 0.05, 'bandpass', 700, 400, 3, 0.7, 0.001); tone(b, t, 0.05, 'triangle', 190, 110, 0.4); }
      else if (kind === 'charge') noise(b, t, 0.12, 'bandpass', 1500, 800, 2, 0.3, 0.03);
      else tone(b, t, 0.05, 'square', kind === 'plant' ? 880 : 660, kind === 'plant' ? 880 : 660, 0.16);
    },
    beep(at, urgent) { const b = bus(at, 0.7, 45, 0.25); if (b) tone(b, now(), urgent ? 0.07 : 0.11, 'square', urgent ? 1560 : 1040, urgent ? 1560 : 1040, 0.3, 0.002); },
    hit(head) { const b = bus(null, 0.5); if (!b) return; const t = now(); tone(b, t, 0.05, 'triangle', head ? 2100 : 1250, head ? 1700 : 900, 0.5, 0.001); if (head) tone(b, t + 0.03, 0.12, 'sine', 3100, 3000, 0.25, 0.001); },
    hurt() { const b = bus(null, 0.6); if (!b) return; const t = now(); tone(b, t, 0.16, 'sine', 130, 60, 0.9, 0.002); noise(b, t, 0.09, 'lowpass', 900, 300, 1, 0.5); },
    kill() { notes([880, 1320], 0.07, 'triangle', 0.3, 0.14); },
    dry() { const b = bus(null, 0.35); if (b) noise(b, now(), 0.025, 'bandpass', 2400, 1800, 4, 0.9, 0.001); },
    swap() { const b = bus(null, 0.3); if (!b) return; const t = now(); noise(b, t, 0.12, 'bandpass', 900, 1700, 1, 0.5, 0.04); noise(b, t + 0.2, 0.03, 'bandpass', 2000, 1500, 3, 0.7, 0.001); },
    ui() { const b = bus(null, 0.25); if (b) tone(b, now(), 0.05, 'sine', 720, 900, 0.5); },
    round(kind) {
      if (kind === 'start') notes([196, 262, 330], 0.11, 'sawtooth', 0.16, 0.5);
      else if (kind === 'go') notes([392, 523], 0.09, 'square', 0.14, 0.3);
      else if (kind === 'win') notes([392, 494, 587, 784], 0.11, 'triangle', 0.3, 0.4);
      else if (kind === 'lose') notes([392, 370, 311, 262], 0.13, 'triangle', 0.28, 0.45);
      else if (kind === 'planted') notes([1047, 784, 1047, 784], 0.14, 'square', 0.14, 0.12);
      else if (kind === 'matchWin') notes([262, 330, 392, 523, 659, 784], 0.12, 'triangle', 0.3, 0.6);
      else notes([330, 311, 262, 233, 196], 0.16, 'triangle', 0.28, 0.6);
    },
    suspend() { if (ctx && ctx.state === 'running') void ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended' && enabled()) void ctx.resume(); },
    dispose() { dead = true; if (ctx) void ctx.close().catch(() => {}); ctx = null; },
  };
}
