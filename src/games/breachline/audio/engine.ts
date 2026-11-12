/** Breachline sound: the live graph. Buffers rendered ahead of time (render.ts) are played through per-voice
 * placement (gain, occlusion filter, wall colour, panner, reverb send) into buses, the buses into a mix, the mix
 * through a blast low-pass, a compressor and a soft ceiling to the output. Plan §3.2–3.3, budgets §5.
 *
 *   own ─┐
 *   near ┼─► mix ─► blast LP ─► compressor ─► ceiling (≤ −1 dBFS) ─► out
 *   world┤    ▲
 *   amb ─┤    └── reverb returns (one convolver per space, fed by each voice's send)
 *   cue ─┘        world and ambience duck under the player's own gunfire
 */
import { dbToGain } from './dsp';
import type { Done } from './render';
import { SPACES, type Space } from './spaces';

export type BusName = 'own' | 'near' | 'world' | 'amb' | 'cue';
export interface Ear { x: number; y: number; z: number; yaw: number; space: Space }
export interface Place { x: number; y: number; z: number; block: number; space: Space }
export interface PlayOpts {
  bus: BusName;
  /** Linear gain on top of the sound's catalogue level. */
  gain?: number;
  /** Playback-rate change (pitch), 1 = none. */
  rate?: number;
  /** Seconds from now. */
  delay?: number;
  /** Where it is; null or absent plays in the head. */
  at?: Place | null;
  /** Reverb send, 0..1 of the space's nominal send. */
  wet?: number;
  /** Distance (m) at which the level is 0 dB; it halves (−6 dB) per doubling beyond. */
  ref?: number;
  /** Beyond this distance the sound is not played. */
  reach?: number;
  /** May use HRTF (otherwise equal-power). */
  hrtf?: boolean;
  /** Extra low-pass cut-off for this voice. */
  lowpass?: number;
  /** Variant to use; random (never the last one twice) when absent. */
  variant?: number;
  /** Loop until stopped. */
  loop?: boolean;
}

/** Bus levels (linear) and each space's reverb return. */
const BUS_GAIN: Record<BusName, number> = { own: 1, near: 0.85, world: 0.9, amb: 0.04, cue: 0.55 };
const RETURN: Record<Space, number> = { hard: 0.55, soft: 0.35, corridor: 0.6, yard: 0.5 };
export const MAX_VOICES = 32, MAX_HRTF = 6;
/** Occlusion by the number of soft layers (index 1..3) or solid (4): [low-pass Hz, gain dB, wall-colour dB at 280 Hz, send ×]. */
const BLOCK: [number, number, number, number][] = [[20000, 0, 0, 1], [2200, -5, 3, 0.85], [1500, -8, 4, 0.75], [1000, -11, 4, 0.7], [600, -16, 0, 1.6]];

interface Voice { src: AudioBufferSourceNode; out: GainNode; loud: number; hrtf: boolean; end: number }

export class Engine {
  readonly ctx: AudioContext;
  private mix: GainNode;
  private blastLp: BiquadFilterNode;
  private bus: Record<BusName, GainNode>;
  private verbIn = {} as Record<Space, GainNode>;
  private verb = {} as Record<Space, ConvolverNode>;
  /** The player's own gun reaches the reverb through one fixed send per space (not a node per shot), switched by
   * the listener's space. */
  private ownSend = {} as Record<Space, GainNode>;
  private ownSpace: Space | null = null;
  static readonly OWN_WET = 0.32;
  private voices: Voice[] = [];
  private bank = new Map<string, { sr: number; loop: boolean; bufs: AudioBuffer[] }>();
  private levels = new Map<string, number>();
  private last = new Map<string, number>();
  readonly ear: Ear = { x: 0, y: 1.6, z: 0, yaw: 0, space: 'yard' };
  bytes = 0;
  readyAt = -1;
  private worker: Worker | null = null;
  private disposed = false;
  private done!: Promise<void>;

  constructor(ctx: AudioContext, levels: Map<string, number>) {
    this.ctx = ctx; this.levels = levels;
    const c = ctx;
    // Output: a compressor to hold the mix together, then a soft ceiling that cannot exceed −1 dBFS.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
    const pre = c.createGain(); pre.gain.value = 0.5;
    const ceiling = c.createWaveShaper(); ceiling.curve = ceilingCurve(); ceiling.oversample = 'none';
    this.blastLp = c.createBiquadFilter(); this.blastLp.type = 'lowpass'; this.blastLp.frequency.value = 20000; this.blastLp.Q.value = 0.5;
    this.mix = c.createGain(); this.mix.gain.value = 0.8;
    this.mix.connect(this.blastLp); this.blastLp.connect(comp); comp.connect(pre); pre.connect(ceiling); ceiling.connect(c.destination);
    this.bus = {} as Record<BusName, GainNode>;
    for (const b of Object.keys(BUS_GAIN) as BusName[]) { const g = c.createGain(); g.gain.value = BUS_GAIN[b]; g.connect(this.mix); this.bus[b] = g; }
    for (const s of SPACES) {
      const inp = c.createGain(), conv = c.createConvolver(), ret = c.createGain();
      ret.gain.value = RETURN[s];
      // Low end into a reverb is what turns sustained fire into mud: the rooms only answer above ~180 Hz.
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = s === 'yard' ? 140 : 180; hp.Q.value = 0.6;
      const hp2 = c.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = hp.frequency.value; hp2.Q.value = 0.6;
      inp.connect(hp); hp.connect(hp2); hp2.connect(conv); conv.connect(ret); ret.connect(this.bus.world);
      this.verbIn[s] = inp; this.verb[s] = conv;
      const os = c.createGain(); os.gain.value = 0; this.bus.own.connect(os); os.connect(inp); this.ownSend[s] = os;
    }
  }

  /** Starts rendering the bank (in a worker; on the main thread in slices if workers are unavailable). */
  /** `skip`: keys a sample pack will supply, left out of the synthesis (see `fill` if the pack fails). */
  load(skip: string[] = []): Promise<void> {
    if (this.done) return this.done;
    const t0 = performance.now();
    this.done = new Promise<void>(resolve => {
      performance.mark('breachline-audio-load');
      const take = (d: Done | { kind: 'end' } | { kind: 'up'; at: number }) => {
        if (d.kind === 'up') { clearTimeout(watchdog); try { performance.measure('breachline-audio-worker-up', { start: 'breachline-audio-load', end: d.at - performance.timeOrigin }); } catch { /* timing only */ } return; }
        if (d.kind === 'end') { performance.measure('breachline-audio-all', 'breachline-audio-load'); resolve(); return; }
        if (this.readyAt < 0) performance.measure('breachline-audio-first', 'breachline-audio-load');
        if (this.readyAt < 0) this.readyAt = performance.now() - t0;
        this.accept(d);
      };
      // A worker that never answers (seen once in the lab) must not leave the game silent: after 8 s without a word
      // from it, render on the main thread in slices instead.
      const watchdog = setTimeout(() => { if (this.worker && !this.disposed) { this.worker.terminate(); this.worker = null; void this.fallback(take); } }, 8000);
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = e => take(e.data as Done);
        this.worker.onerror = () => { clearTimeout(watchdog); this.worker?.terminate(); this.worker = null; void this.fallback(take); };
        this.worker.postMessage({ rate: this.ctx.sampleRate, skip });
      } catch { clearTimeout(watchdog); void this.fallback(take); }
    });
    return this.done;
  }
  private async fallback(take: (d: Done | { kind: 'end' }) => void, only?: readonly string[]) {
    const { plan, run } = await import('./render');
    const jobs = plan(this.ctx.sampleRate).filter(j => !only || (j.kind === 'sound' && only.includes(j.key))).filter(j => j.kind === 'ir' ? !this.verb[j.space].buffer : !this.bank.get(j.key)?.bufs[j.v]);
    for (let i = 0; i < jobs.length && !this.disposed; i++) {
      take(run(jobs[i]));
      if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
    }
    if (!only) take({ kind: 'end' });
  }
  /** Renders sounds that were skipped for a pack that then failed to load (main thread, in slices). */
  fill(keys: readonly string[]): Promise<void> { return this.fallback(d => { if (d.kind !== 'end') this.accept(d); }, keys); }
  private accept(d: Done) {
    if (this.disposed) return;
    if (d.kind === 'sound' && this.packed.has(d.key)) return; // a recorded take wins over the synthesised one
    if (d.kind === 'ir') {
      const b = this.ctx.createBuffer(2, d.data[0].length, d.sr);
      b.copyToChannel(d.data[0] as Float32Array<ArrayBuffer>, 0); b.copyToChannel(d.data[1] as Float32Array<ArrayBuffer>, 1);
      this.verb[d.space].buffer = b; this.bytes += d.data[0].length * 8;
      return;
    }
    const b = this.ctx.createBuffer(1, d.data.length, d.sr);
    b.copyToChannel(d.data as Float32Array<ArrayBuffer>, 0);
    const e = this.bank.get(d.key) ?? { sr: d.sr, loop: d.loop, bufs: [] };
    e.bufs[d.v] = b; this.bank.set(d.key, e); this.bytes += d.data.length * 4;
  }
  has(key: string) { return !!this.bank.get(key)?.bufs.length; }
  /** Sounds that come from a sample pack (recordings) rather than synthesis. */
  readonly packed = new Set<string>();
  /** Loads a sample pack (pack.json and pack.ogg beside it; see tests/games/breachline/audio-pack.ts): fetched
   * and decoded once (the browser decodes off the main thread), sliced into takes, and used in place of the
   * synthesised sounds of the same keys. Any failure leaves the synthesis in place, silently. */
  async loadPack(indexUrl: string): Promise<boolean> {
    try {
      const index = await (await fetch(indexUrl)).json() as { version: number; sr: number; keys: Record<string, { start: number; length: number }[]> };
      const audio = await (await fetch(new URL('pack.ogg', new URL(indexUrl, location.href)).href)).arrayBuffer();
      const all = await this.ctx.decodeAudioData(audio), data = all.getChannelData(0);
      if (this.disposed) return false;
      for (const [key, takes] of Object.entries(index.keys)) {
        const bufs = takes.filter(t => t.start + t.length <= data.length).map(t => {
          const b = this.ctx.createBuffer(1, t.length, all.sampleRate);
          b.copyToChannel(data.slice(t.start, t.start + t.length), 0);
          return b;
        });
        if (!bufs.length) continue;
        this.packed.add(key);
        this.bank.set(key, { sr: all.sampleRate, loop: false, bufs });
        this.bytes += takes.reduce((n, t) => n + t.length * 4, 0);
      }
      return true;
    } catch { return false; }
  }
  /** Replaces a sound's variants (the sound lab uses this to audition other sources; the game never calls it). */
  replace(key: string, takes: Float32Array[], sr: number) {
    const bufs = takes.map(t => { const b = this.ctx.createBuffer(1, t.length, sr); b.copyToChannel(t as Float32Array<ArrayBuffer>, 0); return b; });
    this.bank.set(key, { sr, loop: false, bufs });
  }
  /** Count of buffers loaded, for tests. */
  get loaded() { let n = 0; for (const e of this.bank.values()) n += e.bufs.filter(Boolean).length; return n; }

  /** Plays a sound; returns its output gain (to stop or fade it) or null when nothing was played. */
  play(key: string, o: PlayOpts): GainNode | null {
    const c = this.ctx, e = this.bank.get(key);
    if (!e) return null;
    const have = e.bufs.map((b, i) => (b ? i : -1)).filter(i => i >= 0);
    let v = o.variant ?? have[Math.floor(Math.random() * have.length)];
    if (o.variant === undefined && have.length > 1 && v === this.last.get(key)) v = have[(have.indexOf(v) + 1) % have.length];
    this.last.set(key, v);
    const buffer = e.bufs[v] ?? e.bufs[have[0]];
    const level = dbToGain(this.levels.get(key) ?? 0) * (o.gain ?? 1);
    let gain = level, delay = o.delay ?? 0, lp = o.lowpass ?? 20000, colour = 0, send = o.wet ?? 0, dist = 0;
    const at = o.at ?? null;
    if (at) {
      const dx = at.x - this.ear.x, dy = at.y - this.ear.y, dz = at.z - this.ear.z;
      dist = Math.hypot(dx, dy, dz);
      if (dist > (o.reach ?? 80)) return null;
      const ref = o.ref ?? 3;
      gain *= Math.min(1, ref / Math.max(ref, dist)) * (1 - Math.pow(dist / (o.reach ?? 80), 3));
      const [cut, db, col, sendK] = BLOCK[Math.max(0, Math.min(4, Math.round(at.block)))];
      gain *= dbToGain(db); lp = Math.min(lp, cut, 20000 * Math.exp(-dist / 40)); colour = col; send *= sendK;
      delay += dist / 343;
    }
    if (gain < 1e-4 && !o.loop) return null;
    // Voice budget: drop the quietest if this one is louder; otherwise skip this one.
    const now = c.currentTime;
    this.voices = this.voices.filter(x => x.end > now);
    if (this.voices.length >= MAX_VOICES) {
      let q = 0;
      for (let i = 1; i < this.voices.length; i++) if (this.voices[i].loud < this.voices[q].loud) q = i;
      if (this.voices[q].loud >= gain) return null;
      this.kill(this.voices[q]); this.voices.splice(q, 1);
    }
    const src = c.createBufferSource(); src.buffer = buffer; src.loop = !!o.loop;
    if (o.rate && o.rate !== 1) src.playbackRate.value = o.rate;
    const out = c.createGain(); out.gain.value = gain;
    src.connect(out);
    let tail: AudioNode = out, hrtf = false;
    if (lp < 16000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.6; tail.connect(f); tail = f; }
    if (colour) { const f = c.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = 280; f.Q.value = 1.1; f.gain.value = colour; tail.connect(f); tail = f; }
    if (at) {
      hrtf = !!o.hrtf && this.voices.filter(x => x.hrtf).length < MAX_HRTF;
      const p = c.createPanner(); p.panningModel = hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'linear'; p.rolloffFactor = 0;
      // Listener-relative position: the listener stays at the origin facing −Z, so nothing per frame touches it.
      const rx = Math.cos(this.ear.yaw), rz = -Math.sin(this.ear.yaw), fx = -Math.sin(this.ear.yaw), fz = -Math.cos(this.ear.yaw);
      const dx = at.x - this.ear.x, dz = at.z - this.ear.z;
      setPos(p, dx * rx + dz * rz, at.y - this.ear.y, -(dx * fx + dz * fz));
      tail.connect(p); tail = p;
    }
    tail.connect(this.bus[o.bus]);
    if (o.bus === 'own' && !at) { this.setOwnSpace(this.ear.space); send = 0; }
    if (send > 0) { const s = c.createGain(); s.gain.value = send; tail.connect(s); s.connect(this.verbIn[at ? at.space : this.ear.space]); }
    const t = now + 0.005 + delay;
    src.start(t);
    const voice: Voice = { src, out, loud: gain, hrtf, end: o.loop ? Infinity : t + buffer.duration / (o.rate ?? 1) };
    src.onended = () => { const i = this.voices.indexOf(voice); if (i >= 0) this.voices.splice(i, 1); out.disconnect(); };
    this.voices.push(voice);
    return out;
  }
  private kill(v: Voice) {
    const t = this.ctx.currentTime;
    v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.004);
    try { v.src.stop(t + 0.03); } catch { /* already stopped */ }
  }
  /** Points the own gun's reverb send at the listener's space (cross-fading when it changes). */
  setOwnSpace(space: Space) {
    if (space === this.ownSpace) return;
    this.ownSpace = space;
    const t = this.ctx.currentTime;
    for (const s of SPACES) this.ownSend[s].gain.setTargetAtTime(s === space ? Engine.OWN_WET : 0, t, 0.05);
  }
  /** Pulls a bus down by `db`, holds, then lets it back up; repeated calls do not stack. */
  duck(bus: BusName, db: number, hold: number, release = 0.25) {
    const g = this.bus[bus].gain, t = this.ctx.currentTime, base = BUS_GAIN[bus];
    g.cancelScheduledValues(t);
    g.setTargetAtTime(base * dbToGain(-db), t, 0.006);
    g.setTargetAtTime(base, t + hold, release);
  }
  /** Closes a low-pass over the whole mix and lets it open again (a nearby blast). */
  muffle(hz: number, seconds: number) {
    const f = this.blastLp.frequency, t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setTargetAtTime(hz, t, 0.01);
    f.setTargetAtTime(20000, t + seconds * 0.3, seconds * 0.35);
  }
  /** Sets a bus level target (ambience cross-fades use their own gains). */
  busGain(bus: BusName) { return this.bus[bus]; }
  get activeVoices() { const now = this.ctx.currentTime; return this.voices.filter(v => v.end > now).length; }
  get activeHrtf() { const now = this.ctx.currentTime; return this.voices.filter(v => v.end > now && v.hrtf).length; }
  dispose() {
    this.disposed = true;
    this.worker?.terminate(); this.worker = null;
    for (const v of this.voices) this.kill(v);
    this.voices = []; this.bank.clear(); this.bytes = 0;
    for (const s of SPACES) this.verb[s].buffer = null;
  }
}

function setPos(p: PannerNode, x: number, y: number, z: number) {
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
}
/** The output ceiling. Input is the mix at half level; the curve is the identity up to 0.6 (of full scale) and
 * bends smoothly into 0.89 (−1 dBFS), which it never exceeds. */
function ceilingCurve(): Float32Array<ArrayBuffer> {
  const n = 4096, c = new Float32Array(n), knee = 0.6, top = 0.89;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1) * 2 - 1) * 2, a = Math.abs(s);
    c[i] = Math.sign(s) * (a < knee ? a : knee + (top - knee) * Math.tanh((a - knee) / (top - knee)));
  }
  return c;
}
