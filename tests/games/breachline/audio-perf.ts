/** Proves (or disproves) that sound costs the frame. Plays a live 5v5 bot match in Chromium with the player firing
 * into a soft wall, profiles the main thread (CPU samples and sampled allocations) and attributes every sample whose
 * stack passes through the sound code (src/games/breachline/audio.ts, audio/*, reloads.ts). Prints per frame and per
 * second: script time, the longest unbroken run in sound code (an upper bound on one call), nodes created, garbage,
 * and any decode or buffer creation while playing; then the cost of the first gesture (pack decode and bank fill) at
 * 1x and 6x CPU. Run: npx vite-node tests/games/breachline/audio-perf.ts -- [seconds=20]
 * (dev server; per-call timing of Engine.play), or with AUDIO_PERF_URL=<url> against a production build made with
 * VITE_BREACHLINE_TEST=1 (the gesture numbers there are the real ones: the dev server serves the worker slowly). */
import { chromium, type CDPSession, type Page } from 'playwright';
import { createServer } from 'vite';

type Win = { __perf: { created: number; buffers: number; decodes: number; decodeSyncMs: number; posts: number }; __breachlineTest?: { freeze(on: boolean): void; skip(s: number): void; place(x: number, z: number, yaw?: number, pitch?: number): void; frames(): number; state(): { holes: number; phase: string } } };
interface ProfNode { id: number; callFrame: { url: string; functionName: string }; children?: number[] }
interface Profile { nodes: ProfNode[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number }
interface HeapNode { callFrame: { url: string }; selfSize: number; children: HeapNode[] }

const SOUND = /\/src\/games\/breachline\/(audio\.ts|audio\/|reloads\.ts)/;

/** Sound share of a CPU profile: total ms with sound on the stack, and the longest unbroken run of such samples. */
function attribute(p: Profile) {
  const byId = new Map(p.nodes.map(n => [n.id, n])), parent = new Map<number, number>();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const inSound = new Map<number, boolean>();
  const test = (id: number): boolean => {
    if (inSound.has(id)) return inSound.get(id)!;
    const n = byId.get(id)!, up = parent.get(id), v = SOUND.test(n.callFrame.url) || (up !== undefined && test(up));
    inSound.set(id, v); return v;
  };
  let total = 0, run = 0, longest = 0, all = 0, runFns = new Map<string, number>(), worst = new Map<string, number>();
  const fns = new Map<string, number>();
  /** The innermost sound-code function on the sample's stack, by name and file. */
  const where = (id: number): string => { let n: number | undefined = id; while (n !== undefined) { const f = byId.get(n)!.callFrame; if (SOUND.test(f.url)) return `${f.functionName || '(anon)'} ${f.url.split('/').pop()}`; n = parent.get(n); } return '?'; };
  for (let i = 0; i < p.samples.length; i++) {
    const dt = (p.timeDeltas[i + 1] ?? 0) / 1000, idle = /\(idle\)|\(program\)|\(garbage collector\)/.test(byId.get(p.samples[i])!.callFrame.functionName);
    if (!idle) all += dt;
    if (test(p.samples[i])) {
      const w = where(p.samples[i]); total += dt; run += dt; fns.set(w, (fns.get(w) ?? 0) + dt); runFns.set(w, (runFns.get(w) ?? 0) + dt);
      if (run > longest) { longest = run; worst = new Map(runFns); }
    } else { run = 0; runFns = new Map(); }
  }
  const top = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(2)}`);
  return { soundMs: total, scriptMs: all, longestMs: longest, top: top(fns), longestIn: top(worst) };
}
/** Bytes allocated (including what was collected) with sound code on the stack, and in all. */
function garbage(h: HeapNode, inSound = false): { sound: number; all: number } {
  const s = inSound || SOUND.test(h.callFrame.url), out = { sound: s ? h.selfSize : 0, all: h.selfSize };
  for (const c of h.children) { const r = garbage(c, s); out.sound += r.sound; out.all += r.all; }
  return out;
}

async function probe(page: Page) { return page.evaluate(() => ({ ...(window as unknown as Win).__perf })); }

async function run(base: string, seconds: number) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out: Record<string, unknown> = {};
  for (const rate of [1, 6]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem('pocket-arcade:v1:settings', JSON.stringify({ sound: true }));
      localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
      const perf = { created: 0, buffers: 0, decodes: 0, decodeSyncMs: 0, posts: 0 };
      (window as unknown as Win).__perf = perf;
      const proto = BaseAudioContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
      for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
        if (!k.startsWith('create') || typeof proto[k] !== 'function') continue;
        const fn = proto[k];
        proto[k] = function (this: BaseAudioContext, ...a: unknown[]) { if (k === 'createBuffer') perf.buffers++; else perf.created++; return fn.apply(this, a); };
      }
      const dec = proto.decodeAudioData;
      proto.decodeAudioData = function (this: BaseAudioContext, ...a: unknown[]) { perf.decodes++; const t = performance.now(); const r = dec.apply(this, a); perf.decodeSyncMs += performance.now() - t; return r; };
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, ...a: Parameters<typeof post>) { perf.posts++; return post.apply(this, a); } as typeof post;
    });
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/?festive=off#/game/breachline`);
    await page.waitForFunction(() => (window as unknown as Win).__breachlineTest !== undefined, undefined, { timeout: 90000 });
    await page.waitForTimeout(1000);
    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    // The first gesture: the context starts, the packs are fetched and decoded, the worker fills the bank.
    await cdp.send('Profiler.start');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    let n = -1;
    for (let i = 0; i < 80; i++) { await page.waitForTimeout(500); const b = (await probe(page)).buffers; if (b === n && b > 100) break; n = b; }
    const start = attribute((await cdp.send('Profiler.stop')).profile as Profile);
    const loaded = await probe(page);
    out[`gesture ${rate}x`] = { soundMainThreadMs: +start.soundMs.toFixed(1), longestRunMs: +start.longestMs.toFixed(2), top: start.top, longestIn: start.longestIn, decodes: loaded.decodes, decodeCallMs: +loaded.decodeSyncMs.toFixed(2), buffers: loaded.buffers };
    if (rate !== 1) { await context.close(); continue; }

    // Play: past the preparation phase, the player at a soft wall, holding fire and reloading, bots fighting.
    await page.evaluate(() => { const h = (window as unknown as Win).__breachlineTest!; h.skip(19.9); });
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as unknown as Win).__breachlineTest!.place(-4.6, 0.2, 0, -0.05));
    // Time every Engine.play call directly (the dev server serves one module instance, so patching its prototype
    // reaches the game's engine): the slowest calls and their keys.
    if (!process.env.AUDIO_PERF_URL) await page.evaluate(`import('/src/games/breachline/audio/engine.ts').then(m => {
      const P = m.Engine.prototype, play = P.play, calls = window.__playCalls = [];
      P.play = function (key, o) { window.__engine = this; const t = performance.now(), r = play.call(this, key, o); calls.push([performance.now() - t, key]); return r; };
    })`);
    const before = await probe(page), f0 = await page.evaluate(() => (window as unknown as Win).__breachlineTest!.frames());
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await cdp.send('Profiler.start');
    const t0 = Date.now();
    // Continuous fire, as the game's own input would give it: every 50 ms of wall time the player holds the trigger
    // for 50 ms of game time, and reloads when the magazine is empty.
    await page.evaluate(() => { const h = (window as unknown as { __breachlineTest: { hold(p: Record<string, unknown>, s: number, once?: Record<string, unknown> | null): void; state(): { me: { mag: number[] } | null } } }).__breachlineTest;
      (window as unknown as { __fire: number }).__fire = window.setInterval(() => { const me = h.state().me; h.hold({ fire: true }, 0.05, me && me.mag[0] === 0 ? { reload: true } : null); }, 50); });
    await page.waitForTimeout(seconds * 1000);
    await page.evaluate(() => clearInterval((window as unknown as { __fire: number }).__fire));
    const prof = (await cdp.send('Profiler.stop')).profile as Profile;
    const heap = (await cdp.send('HeapProfiler.stopSampling')).profile as { head: HeapNode };
    const secs = (Date.now() - t0) / 1000, after = await probe(page);
    const frames = await page.evaluate(() => (window as unknown as Win).__breachlineTest!.frames()) - f0, st = await page.evaluate(() => (window as unknown as Win).__breachlineTest!.state());
    const a = attribute(prof), g = garbage(heap.head);
    const calls = await page.evaluate(() => (window as unknown as { __playCalls?: [number, string][] }).__playCalls ?? []);
    const sorted = calls.map(c => c[0]).sort((x, y) => x - y), q = (f: number) => +(sorted[Math.floor(f * (sorted.length - 1))] ?? 0).toFixed(3);
    out.playCalls = { count: calls.length, perSecond: +(calls.length / ((Date.now() - t0) / 1000)).toFixed(1), median: q(0.5), p99: q(0.99), max: q(1), over1ms: calls.filter(c => c[0] > 1).map(c => `${c[1]} ${c[0].toFixed(2)}`).slice(0, 12), keys: Object.entries(calls.reduce((m: Record<string, number>, c) => { const k = c[1].split('.').slice(0, 2).join('.'); m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(', ') };
    out.play = {
      seconds: +secs.toFixed(1), frames, fps: +(frames / secs).toFixed(1), phase: st.phase, holesInWalls: st.holes,
      scriptMsPerFrame: +(a.scriptMs / frames).toFixed(2), soundMsPerFrame: +(a.soundMs / frames).toFixed(3), soundShareOfScript: +(a.soundMs / a.scriptMs).toFixed(4),
      longestSoundRunMs: +a.longestMs.toFixed(2), top: a.top, longestIn: a.longestIn, nodesPerSecond: +((after.created - before.created) / secs).toFixed(1),
      decodesDuringPlay: after.decodes - before.decodes, buffersCreatedDuringPlay: after.buffers - before.buffers, workerMessagesDuringPlay: after.posts - before.posts,
      soundGarbageKBPerSecond: +(g.sound / 1024 / secs).toFixed(1), allGarbageKBPerSecond: +(g.all / 1024 / secs).toFixed(1),
    };
    // A controlled burst with the game frozen: 400 plays of a realistic mix, timed one by one, with nothing else on
    // the main thread. This is the sound engine's own cost on this machine.
    if (!process.env.AUDIO_PERF_URL) out.burst = await page.evaluate(() => {
      const w = window as unknown as { __breachlineTest: { freeze(on: boolean): void }; __engine?: { play(k: string, o: Record<string, unknown>): unknown; ear: { x: number; y: number; z: number } } };
      w.__breachlineTest.freeze(true);
      const e = w.__engine!, keys = ['gun.ar.tp', 'gun.smg.tp', 'step.tile', 'impact.wall', 'casing.556', 'glass.small', 'gear', 'flesh'], ts: number[] = [];
      for (let i = 0; i < 400; i++) {
        const at = { x: e.ear.x + (i % 7) - 3, y: 1.4, z: e.ear.z - 5 - (i % 11), block: i % 3, space: 'hard' };
        const t = performance.now(); e.play(keys[i % keys.length], { bus: 'world', at, wet: 0.4, ref: 3, reach: 80, rate: 1.02 }); ts.push(performance.now() - t);
      }
      w.__breachlineTest.freeze(false);
      ts.sort((a, b) => a - b); const q = (f: number) => +ts[Math.floor(f * (ts.length - 1))].toFixed(3);
      return { calls: ts.length, median: q(0.5), p99: q(0.99), max: q(1), over1ms: ts.filter(v => v > 1).length };
    });
    out.errors = errors;
    await context.close();
  }
  await browser.close();
  return out;
}

async function main() {
  const seconds = Number(process.argv.slice(2).filter(a => a !== '--')[0] ?? 20);
  if (process.env.AUDIO_PERF_URL) { console.log(JSON.stringify(await run(process.env.AUDIO_PERF_URL, seconds), null, 1)); return; }
  const port = 4900 + Math.floor(Math.random() * 90);
  const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
  await server.listen();
  try { console.log(JSON.stringify(await run(`http://127.0.0.1:${port}`, seconds), null, 1)); } finally { await server.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
