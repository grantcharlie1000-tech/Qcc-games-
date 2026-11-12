import { test, expect, type Page } from '../../fixtures';
import { measure } from './audio-harness';
import type { RenderJob, RenderResult } from './audio-page';
import { catalogue, scenes } from './audio-scenes';

/** Renders a lab job through the game's sound module offline in this page (see audio-page.ts). */
async function render(page: Page, job: RenderJob) {
  // Chromium's offline context stalls about once in a hundred renders and freezes the page (see STATUS.md); give
  // each render 40 s and retry once on a fresh page. A stall in the game's own (live) context has never been seen.
  const once = (p: Page) => Promise.race([
    p.evaluate(`import('/tests/games/breachline/audio-page.ts').then(lab => lab.renderInPage(${JSON.stringify(job)}))`) as Promise<RenderResult>,
    new Promise<never>((_, no) => setTimeout(() => no(new Error('stalled')), 40_000)),
  ]);
  let r: RenderResult;
  try { r = await once(page); } catch {
    const fresh = await page.context().newPage();
    await fresh.route('**/__audio-lab', rt => rt.fulfill({ contentType: 'text/html', body: '<!doctype html><title>audio lab</title>' }));
    await fresh.goto('/__audio-lab');
    r = await once(fresh);
  }
  const ch = r.channels.map(b64 => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); });
  return { r, m: measure(ch, r.sampleRate) };
}

test.setTimeout(120_000);

test('the sound lab renders the three scenes through the game sound offline, with no errors or broken samples, never above −1 dBFS', async ({ page }) => {
  await page.route('**/__audio-lab', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>audio lab</title>' }));
  for (const job of scenes('/src/games/breachline/audio.ts')) {
    await page.goto('/__audio-lab');
    const { r, m } = await render(page, job);
    expect(r.errors, job.name).toEqual([]);
    expect(m.nan, job.name).toBe(0);
    expect(m.rmsDb, job.name).toBeGreaterThan(-60);
    expect(m.span, job.name).toBeGreaterThan(job.seconds * 0.5);
    // Phase 1 gate: the whole graph never goes over −1 dBFS.
    expect(m.peakDb, job.name).toBeLessThanOrEqual(-1);
    expect(m.clipped, job.name).toBe(0);
  }
});

interface Probe { contexts: { at: number; active: boolean | null }[]; created: Record<string, number>; total: number; firstBank: number; bankBuffers: number; acceptMax: number; acceptSum: number; ctx: AudioContext | null }
interface LiveHook { state(): { phase: string; me: { mag: number[] } | null }; freeze(on: boolean): void; advance(s: number): void; still(): void; skip(s: number): void; place(x: number, z: number, yaw?: number, pitch?: number): void; hold(p: Record<string, unknown>, s: number): void }
type ProbeWin = { __audioProbe: Probe; __breachlineTest?: LiveHook };

test('live: no sound before a gesture; the bank fills on a throttled CPU; no hitch; few nodes per shot; pause and leave release it', async ({ page, context }) => {
  await context.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('pocket-arcade:v1:settings', JSON.stringify({ sound: true }));
    const probe: Probe = { contexts: [], created: {}, total: 0, firstBank: -1, bankBuffers: 0, acceptMax: 0, acceptSum: 0, ctx: null };
    (window as unknown as ProbeWin).__audioProbe = probe;
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(o?: AudioContextOptions) { super(o); probe.contexts.push({ at: performance.now(), active: (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? null }); probe.ctx = this; }
    };
    const proto = BaseAudioContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
      if (!k.startsWith('create') || typeof proto[k] !== 'function') continue;
      const fn = proto[k];
      proto[k] = function (this: BaseAudioContext, ...a: unknown[]) {
        probe.created[k] = (probe.created[k] ?? 0) + 1;
        if (k === 'createBuffer') { probe.bankBuffers++; if (probe.firstBank < 0) probe.firstBank = performance.now(); } else probe.total++;
        return fn.apply(this, a);
      };
    }
    // Main-thread cost of taking each rendered buffer from the worker (create + copy), the only audio work there.
    const copy = AudioBuffer.prototype.copyToChannel;
    AudioBuffer.prototype.copyToChannel = function (this: AudioBuffer, ...a: Parameters<typeof copy>) {
      const t = performance.now(); copy.apply(this, a); const d = performance.now() - t;
      probe.acceptMax = Math.max(probe.acceptMax, d); probe.acceptSum += d;
    };
  });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?festive=off#/game/breachline');
  await page.waitForFunction(() => (window as unknown as ProbeWin).__breachlineTest !== undefined, undefined, { timeout: 60000 });
  await page.waitForTimeout(500);
  const probe = () => page.evaluate(() => { const p = (window as unknown as ProbeWin).__audioProbe; return { ...p, ctx: null, state: p.ctx?.state ?? 'none' }; });
  expect((await probe()).contexts).toHaveLength(0);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as ProbeWin).__audioProbe.firstBank > 0, undefined, { timeout: 30000 });
  // Wait for the whole bank (it stops growing).
  let n = -1;
  for (let i = 0; i < 120; i++) { const b = (await probe()).bankBuffers; if (b === n && b > 100) break; n = b; await page.waitForTimeout(500); }
  // And for every sample pack to be decoded, so the ambience beds (started once theirs arrives) are not counted as shots.
  await page.waitForFunction(() => performance.getEntriesByName('breachline-audio-pack').length >= 3, undefined, { timeout: 30000 }); // guns, foley, amb
  const loaded = await probe();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const first = loaded.firstBank - loaded.contexts[0].at;
  console.log(JSON.stringify(await page.evaluate(() => performance.getEntriesByType('measure').filter(m => m.name.startsWith('breachline-audio')).map(m => [m.name, Math.round(m.duration)]))));
  console.log(`first buffer ${first.toFixed(0)} ms after the context (6x throttle); ${loaded.bankBuffers} buffers; main-thread accept max ${loaded.acceptMax.toFixed(2)} ms, total ${loaded.acceptSum.toFixed(0)} ms`);
  expect(loaded.contexts).toHaveLength(1);
  expect(loaded.contexts[0].active).not.toBe(false);
  // Under the dev server each worker module is transformed and served on demand, so time to first sound here swings
  // from 1 to 17 s and says nothing about a real build: that budget is measured on a production build with
  // audio-prodtime.mjs (STATUS.md). Here: the whole bank arrives, and taking each buffer never costs a frame.
  expect(first).toBeGreaterThan(0);
  expect(loaded.bankBuffers).toBeGreaterThanOrEqual(231);
  expect(loaded.acceptMax).toBeLessThan(12);

  // A burst of rifle fire into a soft wall: count the nodes it makes.
  await page.evaluate(() => { const h = (window as unknown as ProbeWin).__breachlineTest!; h.freeze(true); h.advance(0.2); h.still(); h.skip(19.9); h.advance(0.3); });
  const before = await probe(), magBefore = await page.evaluate(() => (window as unknown as ProbeWin).__breachlineTest!.state().me!.mag[0]);
  await page.evaluate(() => { const h = (window as unknown as ProbeWin).__breachlineTest!; h.place(-4.6, 0.2, 0, -0.05); h.advance(0.1); h.hold({ fire: true }, 0.6); });
  const after = await probe(), shots = magBefore - await page.evaluate(() => (window as unknown as ProbeWin).__breachlineTest!.state().me!.mag[0]);
  const perShot = (after.total - before.total) / Math.max(1, shots);
  console.log(`${shots} shots, ${after.total - before.total} nodes (${perShot.toFixed(1)} per shot, impacts and crumbles included)`);
  console.log('by type', JSON.stringify(Object.fromEntries(Object.entries(after.created).map(([k, v]) => [k, v - (before.created[k] ?? 0)]).filter(([, v]) => (v as number) > 0))));
  expect(shots).toBeGreaterThan(3);
  expect(perShot).toBeLessThanOrEqual(8);
  expect(after.state).toBe('running');

  await page.locator('.bl-canvas').focus();
  await page.keyboard.press('KeyP');
  await expect.poll(async () => (await probe()).state).toBe('suspended');
  await page.keyboard.press('KeyP');
  await expect.poll(async () => (await probe()).state).toBe('running');
  await page.goto('/?festive=off#/collection');
  await expect.poll(async () => (await probe()).state).toBe('closed');
  expect(errors).toEqual([]);
});

test('a sample pack replaces the guns it covers, decoded once; without one the synthesis plays (plan A machinery)', async ({ page }) => {
  const { buildPack } = await import('./audio-pack');
  const { encodeWav } = await import('./audio-harness');
  const { profile } = await import('./audio-reference');
  const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  // Generated fixture "recordings": 1 kHz tone bursts, which nothing in the synthesis resembles.
  const dir = mkdtempSync(join(tmpdir(), 'fixture-pack-')), SR = 48000, x = new Float32Array(SR * 4);
  for (const t0 of [0.4, 1.9]) for (let i = 0; i < SR * 0.3; i++) x[Math.round(SR * t0) + i] = 0.8 * Math.sin(2 * Math.PI * 1000 * i / SR) * Math.exp(-i / SR / 0.06);
  writeFileSync(join(dir, 'tones.wav'), encodeWav([x], SR, true));
  buildPack({ takes: [{ key: 'gun.ar.fp', file: 'tones.wav', keepMs: 200, fadeMs: 60 }] }, dir, join(dir, 'out'));
  await page.route('**/__fixture-pack/*', r => r.fulfill({ body: readFileSync(join(dir, 'out', r.request().url().split('/').pop()!)) }));
  await page.route('**/__missing-pack/*', r => r.fulfill({ status: 404, body: '' }));
  await page.route('**/__audio-lab', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>audio lab</title>' }));
  const shot = catalogue('/src/games/breachline/audio.ts').find(j => j.name === 'shot-ar-fp-in')!;
  const tonal = async (pack: string | null) => {
    await page.goto('/__audio-lab');
    const { r, m } = await render(page, { ...shot, options: { ...shot.options, pack } });
    expect(r.errors).toEqual([]); expect(m.nan).toBe(0); expect(m.peakDb).toBeLessThanOrEqual(-1);
    const ch = r.channels.map(b64 => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); });
    return profile(ch[0], r.sampleRate).tonal;
  };
  const withPack = await tonal('/__fixture-pack/pack.json'), without = await tonal('/__missing-pack/pack.json'), none = await tonal(null);
  console.log(`tonal ratio: pack ${withPack.toFixed(3)}, missing pack ${without.toFixed(3)}, no pack ${none.toFixed(3)}`);
  expect(withPack).toBeGreaterThan(0.3);
  expect(without).toBeLessThan(0.1);
  expect(none).toBeLessThan(0.1);
});

test('sound is on in Breachline even with the arcade Sound off; its own Sound control turns it off and on', async ({ browser }) => {
  // Arcade Sound off (the default). Each case is a fresh page: the menu (and the control) is shown in the lobby.
  const run = async (choices: string[]) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem('pocket-arcade:v1:settings', JSON.stringify({ sound: false }));
      localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
      const snd: { contexts: AudioContext[]; sources: number } = { contexts: [], sources: 0 };
      (window as unknown as { __snd: typeof snd }).__snd = snd;
      const Real = window.AudioContext;
      window.AudioContext = class extends Real { constructor(o?: AudioContextOptions) { super(o); snd.contexts.push(this); } };
      const make = BaseAudioContext.prototype.createBufferSource;
      BaseAudioContext.prototype.createBufferSource = function (this: BaseAudioContext) { if (snd.contexts.includes(this as AudioContext)) snd.sources++; return make.call(this); };
    });
    const page = await context.newPage();
    await page.goto('/?festive=off#/game/breachline');
    const sound = page.locator('.bl-sound');
    await expect(sound).toHaveValue('on');
    for (const c of choices) await sound.selectOption(c);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => { const s = (window as unknown as { __snd: { contexts: AudioContext[]; sources: number } }).__snd; return { contexts: s.contexts.length, state: s.contexts[0]?.state ?? 'none', sources: s.sources }; });
    await context.close();
    return r;
  };
  const on = await run([]);
  expect(on.contexts).toBe(1); expect(on.state).toBe('running'); expect(on.sources).toBeGreaterThan(0);
  const off = await run(['off']);
  expect(off.contexts).toBe(0); expect(off.sources).toBe(0);
  const back = await run(['off', 'on']);
  expect(back.contexts).toBe(1); expect(back.state).toBe('running');
});
