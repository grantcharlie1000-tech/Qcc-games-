import { build } from 'vite';
import { chromium, webkit, firefox, devices } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const output = join(tmpdir(), `qcc-chess-browser-${process.pid}`);
const artifacts = join(directory, 'artifacts');
await mkdir(artifacts, { recursive: true });
await build({ root, configFile: false, base: './', publicDir: join(root, 'public'), build: { target: 'es2022', outDir: output, emptyOutDir: true, rollupOptions: { input: join(directory, 'harness.html') } }, logLevel: 'warn' });
const fixtureHTML = await readFile(join(output, 'tests/chess-ai/providers/browser/harness.html'), 'utf8');
await writeFile(join(output, 'index.html'), fixtureHTML.replaceAll('../../../../assets/', './assets/'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.gz': 'application/gzip' };
const prefix = '/Qcc-games-/';
const served = [];
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(prefix)) { res.writeHead(404); res.end('Use repository subpath'); return; }
  const location = resolve(output, path.slice(prefix.length));
  if (!location.startsWith(output + '/')) { res.writeHead(403); res.end(); return; }
  try {
    const metadata = await stat(location);
    if (!metadata.isFile()) throw new Error('not a file');
    served.push({ path, bytes: metadata.size });
    res.writeHead(200, { 'Content-Type': types[extname(location)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'", 'Cache-Control': 'no-store' });
    res.end(await readFile(location));
  } catch { res.writeHead(404); res.end('Missing asset'); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}${prefix}index.html`;
const neuralOnly = process.env.CHESS_NEURAL_ONLY === '1';
const firefoxOnly = process.env.CHESS_FIREFOX_ONLY === '1';
const reportFileName = firefoxOnly ? (neuralOnly ? 'report-firefox-neural.json' : 'report-firefox.json') : (neuralOnly ? 'report-neural.json' : 'report.json');
const report = { date: new Date().toISOString(), base: prefix, fullGame: !neuralOnly && process.env.CHESS_SKIP_FULL_GAME !== '1', notes: ['Mobile Chrome and iPhone runs are browser/device emulation, not physical phone tests.', 'Timings use the same-host localhost static server, with no network throttle; OS and file caches may be warm.', 'JS heap counters exclude native/WASM engine memory. Worker counts track actual constructed/terminated workers.', 'Optional Linux Chromium snapshots report aggregate renderer/worker RSS and full browser process RSS via CDP and /proc. Shared pages may be counted more than once. These are process observations, not isolated engine allocations; RSS need not immediately return after termination.', 'Tests build a separate fixture with production Vite chunking; the main production website is verified separately.'], browsers: [], failures: [] };
const browsers = firefoxOnly ? [{ name: 'desktop-firefox', type: firefox, launch: {}, context: devices['Desktop Firefox'] }] : [
  { name: 'desktop-chromium', type: chromium, launch: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] }, context: { viewport: { width: 1280, height: 900 } } },
  { name: 'mobile-chromium-emulated', type: chromium, launch: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] }, context: devices['Pixel 7'] },
  { name: 'iphone-webkit-emulated', type: webkit, launch: {}, context: devices['iPhone 13'] },
];
try {
  for (const config of browsers) {
    console.log(`Starting ${config.name}`);
    let browser;
    try {
      browser = await config.type.launch({ headless: true, ...config.launch });
      const context = await browser.newContext(config.context);
      const page = await context.newPage();
      if (config.name === 'mobile-chromium-emulated') {
        const devtools = await context.newCDPSession(page);
        await devtools.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      const processMemorySamples = [];
      let browserCDP;
      if (config.type === chromium && process.platform === 'linux') browserCDP = await browser.newBrowserCDPSession();
      const observeMemory = async (label) => {
        if (!browserCDP) return null;
        const { processInfo } = await browserCDP.send('SystemInfo.getProcessInfo');
        const processes = [];
        for (const info of processInfo) {
          try {
            const status = await readFile(`/proc/${info.id}/status`, 'utf8');
            const rssKiB = Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] || 0);
            processes.push({ type: info.type, pid: info.id, cpuSeconds: info.cpuTime, rssKiB });
          } catch { /* A utility process may exit between discovery and sampling. */ }
        }
        const rendererRssKiB = processes.filter((p) => p.type === 'renderer').reduce((n, p) => n + p.rssKiB, 0);
        const totalProcessRssKiB = processes.reduce((n, p) => n + p.rssKiB, 0);
        const snapshot = { label, at: new Date().toISOString(), rendererRssKiB, totalProcessRssKiB, processes };
        processMemorySamples.push(snapshot); return snapshot;
      };
      await page.exposeFunction('qccRecordMemory', observeMemory);
      const errors = [];
      const requests = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(url);
      await page.waitForFunction(() => !!window.qccSmoke);
      await observeMemory('registry-ready-before-engines');
      const eagerEngineAssets = requests.filter((request) => /chess-engines\//.test(request));
      if (eagerEngineAssets.length) throw new Error(`Eager engine fetches ${eagerEngineAssets}`);
      const result = neuralOnly ? await page.evaluate(() => window.qccNeural.run()) : await page.evaluate((full) => window.qccSmoke.run(full), process.env.CHESS_SKIP_FULL_GAME !== '1' && (config.name === 'desktop-chromium' || config.name === 'desktop-firefox'));
      result.errors = errors;
      result.requests = requests.map((request) => new URL(request).pathname);
      result.name = config.name;
      result.processMemorySamples = processMemorySamples;
      result.cpuThrottle = config.name === 'mobile-chromium-emulated' ? 4 : 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      await observeMemory('suite-idle-150ms-after-dispose');
      report.browsers.push(result);
      for (const check of result.results) {
        console.log(`${config.name}: ${check.ok ? 'PASS' : 'FAIL'} ${check.name} (${Math.round(check.elapsedMs)}ms)`);
        if (!check.ok) report.failures.push({ browser: config.name, name: check.name, error: check.error });
      }
      if (errors.length) report.failures.push({ browser: config.name, name: 'page errors', errors });
      await page.screenshot({ path: join(artifacts, `${neuralOnly ? 'neural-' : ''}${config.name}.png`), fullPage: true });
      for (const failure of (neuralOnly ? ['missing-model'] : ['missing-wasm', 'crashed-engine-script'])) {
        const broken = await context.newPage();
        if (failure === 'missing-model') await broken.route('**/chess-engines/maia/model.part1', (route) => route.fulfill({ status: 404, body: 'Missing model fixture' }));
        else if (failure === 'missing-wasm') await broken.route('**/*.wasm', (route) => route.fulfill({ status: 404, body: 'Missing WASM fixture' }));
        else await broken.route('**/chess-engines/stockfish/*.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'throw new Error("Intentional test worker crash")' }));
        await broken.goto(url); await broken.waitForFunction(() => !!window.qccSmoke);
        const outcome = neuralOnly ? await broken.evaluate(() => window.qccNeural.missing()) : await broken.evaluate(() => window.qccSmoke.missing());
        result.results.push({ name: failure, ok: true, detail: outcome });
        console.log(`${config.name}: PASS ${failure} (${Math.round(outcome.elapsedMs)}ms)`);
        await broken.close();
      }
      await context.close();
    } catch (error) {
      const message = error.stack || String(error);
      report.failures.push({ browser: config.name, name: 'runner', error: message });
      console.error(`${config.name}: ${message}`);
    } finally { await browser?.close(); }
  }
} finally {
  await new Promise((done) => server.close(done));
  report.servedAssets = served.filter((asset) => /chess-engines|assets/.test(asset.path));
  await writeFile(join(artifacts, reportFileName), JSON.stringify(report, null, 2) + '\n');
}
console.log(`Report: ${join(artifacts, reportFileName)}`);
process.exitCode = report.failures.length ? 1 : 0;
