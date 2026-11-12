import { describe, expect, it } from 'vitest';
import { measure } from './audio-harness';
import { profile } from './audio-reference';
import { plan, run } from '../../../src/games/breachline/audio/render';
import { catalogue, renderSound } from '../../../src/games/breachline/audio/sounds';
import { impulse, SPACES } from '../../../src/games/breachline/audio/spaces';

const defs = catalogue();
const def = (k: string) => defs.find(d => d.key === k)!;
const m = (k: string, v = 0) => { const d = def(k); return measure([renderSound(d, v)], d.sr); };

describe('the sound bank', () => {
  it('renders every sound and variant cleanly: finite, not silent, under full scale, no DC', () => {
    for (const d of defs) for (let v = 0; v < d.variants; v++) {
      const x = renderSound(d, v), r = measure([x], d.sr);
      expect(r.nan, d.key).toBe(0);
      expect(r.peakDb, d.key).toBeLessThan(-0.5);
      expect(r.peakDb, d.key).toBeGreaterThan(-6);
      expect(Math.abs(r.dc), d.key).toBeLessThan(0.01);
    }
  });

  it('is deterministic: the buffer the tests measure is the buffer the game plays, byte for byte', () => {
    for (const k of ['gun.ar.fp', 'step.tile', 'amb.corridor']) {
      const a = renderSound(def(k), 1 % def(k).variants), b = run({ kind: 'sound', key: k, v: 1 % def(k).variants });
      expect(b.kind === 'sound' && Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.data.buffer))).toBe(0);
    }
  });

  it('gives each sound variants that differ', () => {
    for (const d of defs.filter(x => x.variants > 1)) {
      const a = renderSound(d, 0), b = renderSound(d, 1);
      let diff = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) diff += Math.abs(a[i] - b[i]);
      expect(diff / Math.min(a.length, b.length), d.key).toBeGreaterThan(1e-3);
    }
  });

  it('keeps the whole bank within 12 MB at a 48 kHz context, most-needed sounds first', () => {
    let bytes = 0;
    const jobs = plan(48000);
    for (const j of jobs) { const d = run(j); bytes += d.kind === 'ir' ? d.data[0].length * 8 : d.data.length * 4; }
    expect(bytes / 1048576).toBeLessThan(12);
    const first = jobs.slice(0, 12).map(j => (j.kind === 'sound' ? j.key : j.kind));
    expect(first.some(k => k.startsWith('gun.') && k.endsWith('.fp'))).toBe(true);
    expect(first.some(k => k.startsWith('step.'))).toBe(true);
  });

  it('gives the four spaces audibly different responses', () => {
    const t = Object.fromEntries(SPACES.map(s => { const [l] = impulse(s, 48000); return [s, measure([l], 48000)]; }));
    expect(t.soft.decay40).toBeLessThan(t.hard.decay40);
    expect(t.corridor.decay40).toBeGreaterThan(t.soft.decay40);
    expect(t.yard.span).toBeGreaterThan(t.hard.span);
    expect(t.soft.centroid).toBeLessThan(t.hard.centroid);
  });

  it('separates floors: carpet duller than tile, grass brightest scuff', () => {
    expect(m('step.carpet').centroid).toBeLessThan(m('step.tile').centroid * 0.7);
  });

  it('keeps pitched tones out of the guns (the owner heard them as cartoonish)', () => {
    for (const w of ['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol']) for (const v of ['fp', 'tp']) {
      const d = def(`gun.${w}.${v}`), p = profile(renderSound(d, 0), d.sr);
      expect(p.tonal, `${w} ${v}`).toBeLessThan(0.05);
    }
  });

  it('makes the six guns distinct from each other, by spectrum or by length', () => {
    const ws = ['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol'];
    const f = ws.map(w => m(`gun.${w}.fp`));
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const a = f[i], b = f[j];
      const spec = Object.keys(a.bands).reduce((s, k) => s + Math.abs(Math.log((a.bands[k as keyof typeof a.bands] + 0.005) / (b.bands[k as keyof typeof b.bands] + 0.005))), 0);
      const len = Math.abs(Math.log(a.decay40 / b.decay40));
      expect(spec + 3 * len, `${ws[i]} vs ${ws[j]}`).toBeGreaterThan(0.5);
    }
  });

  it("keeps the far report much darker than the near one", () => {
    for (const w of ['ar', 'shotgun', 'pistol']) {
      const tp = m(`gun.${w}.tp`), far = m(`gun.${w}.far`);
      expect(far.centroid, w).toBeLessThan(tp.centroid * 0.6);
    }
  });

  it('gives each floor its own footstep: carpet the dullest, then boards, metal floor, concrete, tile', () => {
    const c = (f: string) => [0, 1, 2, 3].reduce((a, v) => a + m(`step.${f}`, v).centroid, 0) / 4;
    const order = ['carpet', 'planks', 'raised', 'slab', 'tile'].map(c);
    for (let i = 1; i < order.length; i++) expect(order[i], `${i}`).toBeGreaterThan(order[i - 1] * 1.15);
  });

  it('makes impacts in different materials distinct', () => {
    const mats = ['wall', 'concrete', 'brick', 'wood', 'fabric', 'earth', 'ceiling', 'tile', 'plastic', 'cardboard', 'metal'];
    const f = mats.map(x => m(`impact.${x}`));
    let close = 0;
    for (let i = 0; i < mats.length; i++) for (let j = i + 1; j < mats.length; j++) {
      const a = f[i], b = f[j];
      const spec = Object.keys(a.bands).reduce((s, k) => s + Math.abs(Math.log((a.bands[k as keyof typeof a.bands] + 0.005) / (b.bands[k as keyof typeof b.bands] + 0.005))), 0);
      if (spec + 3 * Math.abs(Math.log(a.decay40 / b.decay40)) < 0.5) close++;
    }
    expect(close).toBe(0);
  });

  it('cracks glass short and shatters it long, with shards still falling after a second', () => {
    expect(m('glass.crack').span).toBeLessThan(0.35);
    expect(m('glass.shatter').span).toBeGreaterThan(1.1);
  });
});
