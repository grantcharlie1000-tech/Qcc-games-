import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSfx, type Sfx } from '../../../src/games/hopway/audio';

// A recording stand-in for the Web Audio graph: nodes, connections and scheduled changes are kept for inspection.
interface Change { kind: 'set' | 'exp' | 'lin'; value: number; at: number }

class FakeParam {
  value = 0;
  readonly changes: Change[] = [];
  setValueAtTime(value: number, at: number) { this.changes.push({ kind: 'set', value, at }); return this; }
  exponentialRampToValueAtTime(value: number, at: number) { this.changes.push({ kind: 'exp', value, at }); return this; }
  linearRampToValueAtTime(value: number, at: number) { this.changes.push({ kind: 'lin', value, at }); return this; }
}

class FakeNode {
  readonly outputs: unknown[] = [];
  connect(target: unknown) { this.outputs.push(target); return target; }
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  readonly frequency = new FakeParam();
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  start(at = 0) { this.starts.push(at); }
  stop(at = 0) { this.stops.push(at); }
}

class FakeGain extends FakeNode { readonly gain = new FakeParam(); }

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

// Per-test state, reset in beforeEach.
let contexts: FakeAudioContext[] = [];
let failOscillators = false;
let startState = 'running';

class FakeAudioContext {
  currentTime = 0;
  state = startState;
  readonly destination = new FakeNode();
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  resumes = 0;
  closes = 0;
  constructor() { contexts.push(this); }
  createOscillator() {
    if (failOscillators) throw new Error('createOscillator failed');
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createBiquadFilter() { const filter = new FakeFilter(); this.filters.push(filter); return filter; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
}

const install = (name: 'AudioContext' | 'webkitAudioContext') =>
  Object.defineProperty(globalThis, name, { value: FakeAudioContext, configurable: true, writable: true });
const uninstall = () => {
  Reflect.deleteProperty(globalThis, 'AudioContext');
  Reflect.deleteProperty(globalThis, 'webkitAudioContext');
};

function playEverything(sfx: Sfx) {
  sfx.hop(true); sfx.hop(false); sfx.bonk(); sfx.hit(); sfx.splash();
  sfx.bell(); sfx.rumble(); sfx.ufoWarn(); sfx.beam(); sfx.chime();
}

// Envelope gains are the ones that were scheduled; the master gain is never scheduled.
const envelopes = (ctx: FakeAudioContext) => ctx.gains.filter((g) => g.gain.changes.length > 0);
const peaks = (ctx: FakeAudioContext) => envelopes(ctx).map((g) => Math.max(...g.gain.changes.map((c) => c.value)));
const voices = (ctx: FakeAudioContext) => ctx.oscillators.map((o) => [o.type, o.frequency.changes[0].value]);
const render = (play: (sfx: Sfx) => void) => { contexts = []; play(createSfx(() => true)); return contexts[0]; };

describe('Hopway sound table', () => {
  beforeEach(() => {
    contexts = [];
    failOscillators = false;
    startState = 'running';
    install('AudioContext');
  });
  afterEach(() => uninstall());

  it('creates no context while sound is disabled, whichever method is called', () => {
    const sfx = createSfx(() => false);
    playEverything(sfx);
    sfx.dispose();
    expect(contexts).toHaveLength(0);
  });

  it('creates exactly one context, lazily, on the first sound played while enabled', () => {
    let on = false;
    const sfx = createSfx(() => on);
    sfx.hop(true);
    expect(contexts).toHaveLength(0);
    on = true;
    for (let i = 0; i < 3; i++) playEverything(sfx);
    expect(contexts).toHaveLength(1);
  });

  it('starts and stops every oscillator it creates, after the note has begun', () => {
    playEverything(createSfx(() => true));
    const { oscillators } = contexts[0];
    expect(oscillators).toHaveLength(16);
    for (const osc of oscillators) {
      expect(osc.starts).toHaveLength(1);
      expect(osc.stops).toHaveLength(1);
      expect(osc.stops[0]).toBeGreaterThan(osc.starts[0]);
    }
  });

  it('dispose closes the context once, and later calls create nothing', () => {
    const sfx = createSfx(() => true);
    sfx.bell();
    const [ctx] = contexts;
    const voicesBefore = ctx.oscillators.length;
    sfx.dispose();
    playEverything(sfx);
    sfx.dispose();
    expect(ctx.closes).toBe(1);
    expect(contexts).toHaveLength(1);
    expect(ctx.oscillators).toHaveLength(voicesBefore);
  });

  it('dispose before any sound creates nothing', () => {
    const sfx = createSfx(() => true);
    expect(() => sfx.dispose()).not.toThrow();
    playEverything(sfx);
    expect(contexts).toHaveLength(0);
  });

  it('is a silent no-op when globalThis has no AudioContext', () => {
    uninstall();
    const sfx = createSfx(() => true);
    expect(() => playEverything(sfx)).not.toThrow();
    expect(() => sfx.dispose()).not.toThrow();
  });

  it('keeps a throwing createOscillator or enabled() from escaping any method', () => {
    failOscillators = true;
    expect(() => playEverything(createSfx(() => true))).not.toThrow();
    expect(() => playEverything(createSfx(() => { throw new Error('boom'); }))).not.toThrow();
  });

  it('falls back to webkitAudioContext when AudioContext is absent', () => {
    uninstall();
    install('webkitAudioContext');
    createSfx(() => true).chime();
    expect(contexts).toHaveLength(1);
  });

  it('resumes a suspended context once and never ramps an envelope to zero', () => {
    startState = 'suspended';
    playEverything(createSfx(() => true));
    const [ctx] = contexts;
    expect(ctx.resumes).toBe(1);
    const params = [
      ...ctx.oscillators.map((o) => o.frequency),
      ...ctx.gains.map((g) => g.gain),
      ...ctx.filters.flatMap((f) => [f.frequency, f.Q]),
    ];
    for (const param of params) {
      for (const change of param.changes) if (change.kind === 'exp') expect(change.value).toBeGreaterThan(0);
    }
  });

  it('routes every sound through one master gain of 0.5 into the destination', () => {
    const ctx = render((s) => s.hop(true));
    const master = ctx.gains.find((g) => g.gain.changes.length === 0);
    expect(master?.gain.value).toBe(0.5);
    expect(master?.outputs[0]).toBe(ctx.destination);
  });

  it('follows the sound table: waveforms, pitches, timing and peak gains', () => {
    const hop = render((s) => s.hop(true));
    expect(hop.oscillators[0].type).toBe('square');
    expect(hop.oscillators[0].frequency.changes[0].value).toBeCloseTo(520 * 1.1225, 9);
    expect(hop.oscillators[0].stops[0]).toBeCloseTo(0.04, 9);
    expect(peaks(hop)).toEqual([0.05]);
    expect(render((s) => s.hop(false)).oscillators[0].frequency.changes[0].value).toBe(520);

    const bonk = render((s) => s.bonk());
    expect(voices(bonk)).toEqual([['sine', 110]]);
    expect(bonk.oscillators[0].frequency.changes.at(-1)).toMatchObject({ kind: 'exp', value: 70, at: 0.09 });
    expect(peaks(bonk)).toEqual([0.12]);

    const hit = render((s) => s.hit());
    expect(voices(hit)).toEqual([['square', 180], ['square', 247]]);
    expect(hit.filters.map((f) => [f.type, f.frequency.value])).toEqual([['lowpass', 1200]]);
    expect(peaks(hit)).toEqual([0.08]);

    const splash = render((s) => s.splash());
    expect(voices(splash)).toEqual([['sawtooth', 900], ['sine', 300]]);
    expect(splash.filters.map((f) => [f.type, f.frequency.value, f.Q.value])).toEqual([['bandpass', 700, 0.8]]);
    expect(peaks(splash)).toEqual([0.06, 0.08]);

    const bell = render((s) => s.bell());
    expect(voices(bell)).toEqual([['triangle', 880], ['triangle', 660]]);
    expect(bell.oscillators[1].starts[0]).toBeCloseTo(0.16, 9);
    expect(peaks(bell)).toEqual([0.045, 0.045]);

    const rumble = render((s) => s.rumble());
    expect(voices(rumble)).toEqual([['sawtooth', 55]]);
    expect(rumble.filters.map((f) => [f.type, f.frequency.value])).toEqual([['lowpass', 200]]);
    expect(peaks(rumble)).toEqual([0.07]);

    const ufo = render((s) => s.ufoWarn());
    const [main, lfo] = ufo.oscillators;
    expect([main.type, main.frequency.changes[0].value, main.frequency.changes.at(-1)?.value]).toEqual(['sine', 300, 900]);
    expect([lfo.type, lfo.frequency.changes[0].value]).toEqual(['sine', 7]);
    const depth = ufo.gains.find((g) => g.gain.value === 25);
    expect(lfo.outputs[0]).toBe(depth);
    expect(depth?.outputs[0]).toBe(main.frequency);
    expect(peaks(ufo)).toEqual([0.045]);

    const beam = render((s) => s.beam());
    expect(voices(beam)).toEqual([['sine', 400], ['triangle', 800]]);
    expect(beam.oscillators[0].frequency.changes.at(-1)?.value).toBe(1600);
    expect(beam.oscillators[1].frequency.changes.at(-1)?.value).toBe(3200);
    expect(peaks(beam)).toEqual([0.04, 0.02]);

    const chime = render((s) => s.chime());
    expect(voices(chime)).toEqual([['triangle', 1046.5], ['triangle', 1318.5]]);
    expect(chime.oscillators[0].starts[0]).toBe(0);
    expect(chime.oscillators[1].starts[0]).toBeCloseTo(0.1, 9);
    expect(peaks(chime)).toEqual([0.05, 0.05]);
  });
});
