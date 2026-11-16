import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, extname, sep, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir, cpus, loadavg } from 'node:os';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const workspace = process.env.CHESS_PERF_ROOT || join(tmpdir(), 'qcc-imported-chess-performance');
const cpuTotals = () => cpus().reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle,
  total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });
const busyPercent = (before, after) => 100 * (1 - (after.idle - before.idle) / Math.max(1, after.total - before.total));
await mkdir(workspace, { recursive: true });
const [mode, label = 'baseline'] = process.argv.slice(2);
const committedProviders = () => ({
  name: 'committed-imported-providers', enforce: 'pre',
  load(id) {
    const path = relative(root, id.split('?')[0]).replaceAll('\\', '/');
    if (/^src\/chess-ai\/providers\/(maia|stockfish)\/.+\.ts$/.test(path)) {
      return execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' });
    }
  },
});
if (mode === 'build') {
  if (!['baseline', 'candidate'].includes(label)) throw new Error('Expected baseline or candidate');
  const output = join(workspace, label);
  await build({ root, configFile: false, base: './', publicDir: join(root, 'public'),
    plugins: label === 'baseline' ? [committedProviders()] : [],
    worker: { plugins: () => label === 'baseline' ? [committedProviders()] : [] }, build: {
    target: 'es2022', outDir: output, emptyOutDir: true, rollupOptions: { input: join(directory, 'performance.html') },
  }, logLevel: 'warn' });
  const html = await readFile(join(output, 'tests/chess-ai/providers/browser/performance.html'), 'utf8');
  await writeFile(join(output, 'index.html'), html.replaceAll('../../../../assets/', './assets/'));
  console.log(`Built ${label}: ${output}`);
} else {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
  let current = label;
  const server = createServer(async (req, res) => {
    const base = join(workspace, current);
    const path = resolve(base, '.' + new URL(req.url, 'http://localhost').pathname.replace('/Qcc-games-/', '/'));
    if (!path.startsWith(base + sep)) { res.writeHead(403); res.end(); return; }
    try {
      const bytes = await readFile(path);
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'" });
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const results = [];
  try {
    const sides = mode === 'paired' ? Array.from({ length: 5 }, () => ['baseline', 'candidate']).flat() : [label];
    for (const side of sides) {
      current = side;
      const idleStart = cpuTotals();
      await new Promise(done => setTimeout(done, 250));
      const workStart = cpuTotals();
      const hostCpuBeforePercent = busyPercent(idleStart, workStart);
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/Qcc-games-/index.html`);
        await page.waitForFunction(() => typeof window.chessTiming === 'function');
        const engines = await page.evaluate(() => window.chessTiming());
        if (errors.length) throw new Error(errors.join('\n'));
        results.push({ side, at: new Date().toISOString(), hostCpuBeforePercent,
          hostCpuDuringPercent: busyPercent(workStart, cpuTotals()), engines, errors });
        console.log(JSON.stringify(results.at(-1)));
        await page.screenshot({ path: join(workspace, `${side}.png`), fullPage: true });
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
    await writeFile(join(workspace, `${mode}.json`), JSON.stringify({ baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), cpu: cpus()[0].model, cores: cpus().length,
      loadAverage: loadavg(), notes: ['Local no-store asset delivery. Mobile viewport, no physical phone or worker CPU emulation.',
        'Fresh browser context per side. Fixed sampling draws. Stockfish has unchanged 100 ms search budgets.',
        'Host may run unrelated applications; alternate five runs per side. No process/RAM claims.'], results }, null, 2));
    console.log(`Artifacts: ${workspace}`);
  }
}
