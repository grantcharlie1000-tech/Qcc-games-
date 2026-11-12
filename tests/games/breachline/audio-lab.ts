/** Breachline sound lab driver. Renders the catalogue and scenes (audio-scenes.ts) through a sound module offline
 * in Chromium, then writes for each job a float WAV, a spectrogram picture and its measurements, plus contact
 * sheets of the pictures and a metrics.json. Run:
 *   npx vite-node tests/games/breachline/audio-lab.ts -- <label> [module] [outDir] [nameFilter]
 * e.g. `-- baseline /tests/games/breachline/audio-baseline/audio-v0.ts` or `-- now` (defaults to the game's audio.ts).
 * Output goes to test-results/breachline-audio/<label>/ unless outDir is given. Plan §6. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { contactSheet, encodeWav, measure, spectrogram, writeJson, type Measure } from './audio-harness';
import type { RenderJob, RenderResult } from './audio-page';
import { catalogue, round, scenes } from './audio-scenes';

export interface LabRecord { name: string; m: Measure; nodes: Record<string, number>; perCue: Record<string, number>; errors: string[] }

export async function renderJobs(jobs: RenderJob[], base: string): Promise<{ result: RenderResult; ch: Float32Array[] }[]> {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const logs: string[] = [];
    const open = async () => {
      const p = await browser.newPage();
      p.setDefaultTimeout(60_000);
      p.on('pageerror', e => logs.push(e.message));
      // The dev client's hot-reload socket is off for the lab; its connection errors are not the sound's.
      p.on('console', m => { if (m.type() === 'error' && !/WebSocket|\[vite\]/.test(m.text())) logs.push(m.text()); });
      await p.route(`${base}/__audio-lab`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>audio lab</title>' }));
      return p;
    };
    let page = await open();
    const out: { result: RenderResult; ch: Float32Array[] }[] = [];
    for (const job of jobs) {
      await page.goto(`${base}/__audio-lab`);
      const t0 = Date.now();
      // A string, so the dynamic import runs in the page rather than being rewritten by vite-node. A render stalls
      // about once in a hundred (Chromium's offline context stops answering and the page freezes): throw that page
      // away and retry once on a new one.
      const once = () => Promise.race([
        page.evaluate(`import('/tests/games/breachline/audio-page.ts').then(lab => lab.renderInPage(${JSON.stringify(job)}))`) as Promise<RenderResult>,
        new Promise<never>((_, no) => setTimeout(() => no(new Error(`render of ${job.name} stalled`)), 60_000)),
      ]);
      let result: RenderResult;
      try { result = await once(); } catch (e) {
        console.error(`  ${(e as Error).message}; retrying on a new page`);
        void page.close().catch(() => {});
        page = await open(); logs.length = 0;
        await page.goto(`${base}/__audio-lab`);
        result = await once();
      }
      result.errors.push(...logs.splice(0));
      if (process.env.AUDIO_LAB_VERBOSE) console.error(`  rendered ${job.name} in ${Date.now() - t0} ms`);
      const ch = result.channels.map(b64 => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); });
      out.push({ result, ch });
    }
    return out;
  } finally { await browser.close(); }
}

export async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const port = 4700 + Math.floor(Math.random() * 200);
  const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
  await server.listen();
  const base = `http://127.0.0.1:${port}`;
  try { return await fn(base); } finally { await server.close(); }
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const [label = 'now', modArg, outArg, filter] = args;
  const module = modArg && modArg !== '-' ? modArg : '/src/games/breachline/audio.ts';
  const outDir = outArg && outArg !== '-' ? outArg : join('test-results/breachline-audio', label);
  mkdirSync(join(outDir, 'wav'), { recursive: true }); mkdirSync(join(outDir, 'png'), { recursive: true });
  let jobs = [...catalogue(module), ...scenes(module), round(module)];
  if (filter) jobs = jobs.filter(j => new RegExp(filter).test(j.name));
  // AUDIO_LAB_OVERRIDE=<json of { key: { sr, takes: number[][] } }>: audition other sources through the same engine.
  if (process.env.AUDIO_LAB_OVERRIDE) {
    const override = JSON.parse(readFileSync(process.env.AUDIO_LAB_OVERRIDE, 'utf8'));
    jobs = jobs.map(j => ({ ...j, options: { ...j.options, override } }));
  }
  const t0 = Date.now();
  const rendered = await withServer(base => renderJobs(jobs, base));
  const records: LabRecord[] = [];
  for (const { result, ch } of rendered) {
    const wav = join(outDir, 'wav', `${result.name}.wav`), png = join(outDir, 'png', `${result.name}.png`);
    writeFileSync(wav, encodeWav(ch, result.sampleRate, true));
    const m = measure(ch, result.sampleRate);
    spectrogram(wav, png, `${label} · ${result.name} · peak ${m.peakDb.toFixed(1)} dBFS · rms ${m.rmsDb.toFixed(1)} · centroid ${Math.round(m.centroid)} Hz`);
    const job = jobs.find(j => j.name === result.name)!, perCue: Record<string, number> = {};
    job.cues.forEach((c, i) => { if (c.call !== 'listen') perCue[c.call] = Math.max(perCue[c.call] ?? 0, result.perCue[i]); });
    records.push({ name: result.name, m, nodes: result.nodes, perCue, errors: result.errors });
    console.log(`${result.name.padEnd(22)} peak ${m.peakDb.toFixed(1).padStart(6)} rms ${m.rmsDb.toFixed(1).padStart(6)} span ${m.span.toFixed(2)} decay40 ${m.decay40.toFixed(2)} centroid ${Math.round(m.centroid).toString().padStart(5)} clip ${m.clipped} nan ${m.nan}${result.errors.length ? ' ERR ' + result.errors.join('; ') : ''}`);
  }
  writeJson(join(outDir, 'metrics.json'), records);
  const groups: Record<string, RegExp> = { weapons: /^shot-/, auto: /^(auto|shot-ar-12m)/, foley: /^(step|reload|melee|work|build|charge)/, blasts: /^(boom|grenade|crumble|beep)/, cues: /^(feedback|cues|ambience)/, scenes: /^scene-/ };
  for (const [g, re] of Object.entries(groups)) {
    const pngs = records.filter(r => re.test(r.name)).map(r => join(outDir, 'png', `${r.name}.png`));
    if (pngs.length) contactSheet(pngs, join(outDir, `sheet-${g}.png`), g === 'scenes' ? 1 : g === 'weapons' ? 4 : 2);
  }
  console.log(`${records.length} renders in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${outDir}`);
}

if (process.env.AUDIO_LAB_MAIN !== '0') main().catch(e => { console.error(e); process.exit(1); });
