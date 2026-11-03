/** Production-build benchmark. Build first, then run under the shared test lock:
 * flock /tmp/qcc-test.lock node scripts/perf/crossy-ballrun.mjs --output docs/evidence/perf-crossy-ballrun/before.json
 * One preview, browser, page and profile at a time. Never builds or installs packages.
 */
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { SourceMap } from 'node:module';
import { gzipSync } from 'node:zlib';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const output = process.argv.includes('--output') ? arg('--output') : 'docs/evidence/perf-crossy-ballrun/after.json';
const port = 4685, baseURL = `http://127.0.0.1:${port}`;
const durationMs = 15000, profileMs = 3000, seed = 11;
const profiles = [
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, cpuRate: 4 },
  { name: 'desktop', viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, cpuRate: 1 },
];
const directory = dirname(output), label = basename(output, '.json');
await mkdir(directory, { recursive: true });
if (!existsSync('dist/index.html')) throw new Error('Build first: npm run build');
if (await fetch(baseURL).then(() => true, () => false)) throw new Error(`Port ${port} is already occupied`);
const preview = spawn('npm', ['run', 'preview', '--', '--port', String(port), '--strictPort'], { detached: true, stdio: 'ignore' });
let browser;
const stop = () => { try { process.kill(-preview.pid, 'SIGTERM'); } catch {} };
process.once('SIGINT', () => { stop(); process.exit(130); });
process.once('SIGTERM', () => { stop(); process.exit(143); });
const percentile = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
const round = number => Math.round(number * 100) / 100;
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { mean: round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)), p95: round(percentile(sorted, .95)), max: round(sorted.at(-1) ?? 0) };
};

async function hotspots(profile) {
  const hits = new Map(), nodes = new Map(profile.nodes.map(n => [n.id, n]));
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) hits.set(profile.samples[i], (hits.get(profile.samples[i]) ?? 0) + profile.timeDeltas[i]);
  const maps = new Map();
  const top = [];
  for (const [id, micros] of [...hits].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    const frame = nodes.get(id).callFrame;
    let source = frame.url ? `${new URL(frame.url).pathname}:${frame.lineNumber + 1}:${frame.columnNumber + 1}` : frame.functionName;
    if (frame.url?.includes('/assets/')) {
      const path = resolve('dist', new URL(frame.url).pathname.slice(1)) + '.map';
      if (!maps.has(path)) maps.set(path, await readFile(path, 'utf8').then(s => new SourceMap(JSON.parse(s)), () => null));
      const original = maps.get(path)?.findEntry(frame.lineNumber, frame.columnNumber);
      if (original?.originalSource) source = `${original.originalSource}:${original.originalLine + 1}:${original.originalColumn + 1}`;
    }
    top.push({ function: frame.functionName || '(anonymous)', selfMs: round(micros / 1000), source });
  }
  return top;
}

try {
  for (let tries = 0; ; tries++) {
    if (await fetch(baseURL).then(r => r.ok, () => false)) break;
    if (tries >= 100 || preview.exitCode !== null) throw new Error('Preview did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
    headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = {
    measuredAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    browser: browser.version(), renderer: 'ANGLE SwiftShader (software GPU)', durationMs, profileMs, seed,
    method: 'Production preview; 2s warmup; 15s unprofiled rAF; separate 3s CDP CPU profile. Real key/button input, automatic retry after deaths. Crossy begins from the same revision 4 save; retries use the current generator revision. Heap measured after forced GC, outside rAF timing. One browser/page at a time.',
    results: [],
  };
  for (const game of (process.argv.includes('--crossy-only') ? ['crossy-road'] : ['crossy-road', 'ball-run'])) for (const settings of profiles) {
    const context = await browser.newContext({ viewport: settings.viewport, deviceScaleFactor: settings.deviceScaleFactor, serviceWorkers: 'block' });
    try {
      await context.addInitScript(({ game, seed }) => {
        localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true');
        localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept');
        sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
        // Deterministic fresh Ball Run courses and Crossy retries, without any production test hook.
        crypto.getRandomValues = array => { for (let i = 0; i < array.length; i++) array[i] = seed; return array; };
        const fixedNow = 1700000000000 + seed;
        Date.now = () => fixedNow;
        if (game === 'crossy-road') localStorage.setItem('pocket-arcade:v1:save:crossy-road', JSON.stringify({version:1,data:{
          v:1,worldVersion:4,seed,t:0,phase:'ready',row:0,x:4,fromRow:0,fromX:4,hop:-1,hopDir:'up',facing:'up',queued:null,
          maxRow:0,lastProgress:0,safeLine:0,started:false,death:null,
        }}));
        // Three's supported devtools observer exposes renderer.info without changing the game.
        const observer = new EventTarget();
        window.__THREE_DEVTOOLS__ = observer;
        window.__perfRenderers = [];
        observer.addEventListener('observe', event => { if (event.detail.isWebGLRenderer) window.__perfRenderers.push(event.detail); });
      }, { game, seed });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: settings.cpuRate });
      await cdp.send('Performance.enable');
      await page.goto(`${baseURL}/#/game/${game}`);
      await page.locator(game === 'crossy-road' ? '.hw-canvas' : '.ball-run canvas').waitFor();
      await page.evaluate(game => {
        const key = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
        function drive() {
          const root = document.querySelector(`.${game}`);
          if (!root) return;
          if (game === 'crossy-road') {
            if (root.dataset.phase === 'over') root.querySelector('.hw-again').click();
            else root.querySelector('canvas').dispatchEvent(key);
          } else if (root.dataset.phase === 'ready') root.querySelector('.br-play').click();
          else if (root.dataset.phase === 'over') root.querySelector('.br-again').click();
        }
        drive(); window.__perfDriver = setInterval(drive, 180);
      }, game);
      await page.waitForTimeout(2000);
      await cdp.send('HeapProfiler.collectGarbage');
      const heapBefore = await cdp.send('Runtime.getHeapUsage');
      const metricsBefore = await cdp.send('Performance.getMetrics');
      const sample = await page.evaluate(({ durationMs, game }) => new Promise(resolve => {
        const frames = [], calls = [], triangles = [], geometries = [], textures = [], phases = {}, pixels = [];
        let first = 0, previous = 0, renderedFrames = 0;
        const root = document.querySelector(`.${game}`), canvas = root.querySelector('canvas');
        function tick(now) {
          if (!first) first = now;
          if (previous) frames.push(now - previous);
          previous = now;
          const info = window.__perfRenderers.at(-1)?.info;
          if (info) {
            calls.push(info.render.calls); triangles.push(info.render.triangles);
            geometries.push(info.memory.geometries); textures.push(info.memory.textures);
            if (info.render.frame !== window.__perfLastFrame) renderedFrames++;
            window.__perfLastFrame = info.render.frame;
          }
          const phase = root.dataset.phase; phases[phase] = (phases[phase] ?? 0) + 1;
          const ratio = canvas.width / canvas.clientWidth;
          if (pixels.at(-1)?.ratio !== ratio) pixels.push({ ms: now - first, ratio });
          if (now - first < durationMs) requestAnimationFrame(tick);
          else resolve({ frames, calls, triangles, geometries, textures, phases, pixels, renderedFrames, elapsedMs: now - first });
        }
        requestAnimationFrame(tick);
      }), { durationMs, game });
      const metricsAfter = await cdp.send('Performance.getMetrics');
      const heapUncollected = await cdp.send('Runtime.getHeapUsage');
      await cdp.send('HeapProfiler.collectGarbage');
      const heapAfter = await cdp.send('Runtime.getHeapUsage');
      await page.screenshot({ path: `${directory}/${label}-${game}-${settings.name}.png` });
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      await cdp.send('Profiler.start');
      await page.waitForTimeout(profileMs);
      const { profile } = await cdp.send('Profiler.stop');
      await cdp.send('Profiler.disable');
      const profileFile = `${label}-${game}-${settings.name}.cpuprofile.json.gz`;
      await writeFile(`${directory}/${profileFile}`, gzipSync(JSON.stringify(profile)));
      const sorted = [...sample.frames].sort((a, b) => a - b);
      const metric = (metrics, name) => metrics.metrics.find(m => m.name === name)?.value ?? 0;
      const result = {
        game, profile: settings.name, ...settings, frames: sample.frames.length, elapsedMs: round(sample.elapsedMs),
        avgFps: round(sample.frames.length * 1000 / sample.elapsedMs), p95Ms: round(percentile(sorted, .95)), p99Ms: round(percentile(sorted, .99)),
        longFramesOver33ms: sample.frames.filter(ms => ms > 33).length, renderedFrames: sample.renderedFrames, phases: sample.phases,
        drawCalls: summarize(sample.calls), triangles: summarize(sample.triangles), geometries: summarize(sample.geometries), textures: summarize(sample.textures),
        resolution: sample.pixels, heap: { beforeBytes: heapBefore.usedSize, afterBytes: heapAfter.usedSize, retainedGrowthBytes: heapAfter.usedSize - heapBefore.usedSize, uncollectedBytes: heapUncollected.usedSize },
        mainThread: Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(name => [name, round(metric(metricsAfter,name)-metric(metricsBefore,name))])),
        cpuProfile: profileFile, hotspots: await hotspots(profile), errors,
      };
      if (errors.length || sample.renderedFrames < sample.frames.length * .5) throw new Error(`Invalid benchmark: ${game}/${settings.name}: ${JSON.stringify({errors, renderedFrames:sample.renderedFrames, frames:sample.frames.length})}`);
      report.results.push(result);
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
      console.log(`${game}/${settings.name}: ${result.avgFps} fps; p95 ${result.p95Ms} ms; p99 ${result.p99Ms} ms; >33ms ${result.longFramesOver33ms}; calls ${result.drawCalls.mean}; retained heap ${result.heap.retainedGrowthBytes}`);
    } finally { await context.close(); }
  }
} finally { await browser?.close(); stop(); }
