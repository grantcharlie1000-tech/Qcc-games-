// Offline play against the real production build, served like Cloudflare Pages (index.html answers 308).
// Run: npm run build && npm run verify:offline
import {test, expect} from '@playwright/test';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {extname, resolve, sep, join} from 'node:path';

const port = 4618, origin = `http://127.0.0.1:${port}`, root = resolve('dist');
const mime = {'.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2'};
const evidence = resolve('docs/evidence/offline');
const sha = data => createHash('sha256').update(data).digest('hex');

// Per-test server state: overrides stand in for a new deploy, failures for a dropped connection.
let server, overrides, failures, served, legacyWorker;
const packs = JSON.parse(await readFile(join(root, 'offline/packs.json'), 'utf8'));
const titles = {};

test.beforeAll(async () => {
  const catalog = await readFile('src/core/catalog.ts', 'utf8');
  for (const [, id, title] of catalog.matchAll(/\{id:'([^']+)',title:'([^']+)'/g)) titles[id] = title;
  await mkdir(evidence, {recursive: true});
  server = createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const base = url.pathname.startsWith('/Qcc-games-/') ? '/Qcc-games-/' : '/';
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    served.push(relative);
    if (relative === 'seed.html') { res.writeHead(200, {'Content-Type': 'text/html'}).end('<!doctype html><title>Seed</title>'); return; }
    if (relative === 'index.html') { res.writeHead(308, {Location: base}).end(); return; }
    if (relative === 'sw.js' && legacyWorker) { res.writeHead(200, {'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache'}).end(legacyWorker); return; }
    if (failures[relative] > 0) { failures[relative]--; res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': '999999'}); res.write('partial'); res.destroy(); return; }
    if (overrides[relative] !== undefined) {
      const body = overrides[relative];
      if (body === 404) res.writeHead(404).end(); else res.writeHead(200, {'Content-Type': mime[extname(relative)] || 'application/octet-stream', 'Cache-Control': 'no-cache'}).end(body);
      return;
    }
    const file = resolve(root, relative === '' ? 'index.html' : relative);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      const data = await readFile(file);
      res.writeHead(200, {'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache'}).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', done); });
});
test.afterAll(async () => { if (server) await new Promise(done => server.close(done)); });
test.beforeEach(async ({context}) => {
  overrides = {}; failures = {}; served = []; legacyWorker = undefined;
  await context.addInitScript(() => {
    localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true');
    localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept');
    sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
    localStorage.setItem('qcc:festive', 'off');
  });
});

async function install(page, base = '/') {
  await page.goto(origin + base + '#/collection');
  await expect(page.locator('.game-card').first()).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 30000});
}
async function download(page, ids) {
  await page.evaluate(() => { location.hash = '#/downloads'; });
  for (const id of ids) {
    // The floating tab bar can slide over a row as the page scrolls, so each tap is confirmed.
    const state = page.locator(`.dl-row[data-game="${id}"] .dl-meta:not(.dl-hint)`);
    await expect(async () => {
      if (await state.getAttribute('data-state') === 'none') await page.getByRole('button', {name: `Download ${titles[id]}`, exact: true}).click({timeout: 2000});
      await expect(state).not.toHaveAttribute('data-state', 'none', {timeout: 1000});
    }).toPass({timeout: 30000});
  }
  for (const id of ids) await expect(page.locator(`.dl-row[data-game="${id}"] .dl-meta:not(.dl-hint)`)).toHaveText(/Downloaded/, {timeout: 240000});
}
/** Close every page and open the app again with no network, like reopening it in Airplane Mode. */
async function reopenOffline(context, base = '/') {
  for (const open of context.pages()) await open.close();
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(origin + base + '#/collection');
  await expect(page.locator('.game-card').first()).toBeVisible();
  return page;
}
async function play(page, id) {
  await page.evaluate(id => { location.hash = '#/game/' + id; }, id);
  await page.waitForFunction(() => {
    const stage = document.querySelector('#game-stage');
    return stage && stage.children.length > 0 && !stage.querySelector(':scope > .loading');
  }, null, {timeout: 60000});
  await expect(page.locator('#game-stage .game-error')).toHaveCount(0);
}
async function deploy(change) {
  // A new version: changed files, their new hashes in packs.json and a new worker version.
  const next = structuredClone(packs);
  for (const [path, body] of Object.entries(change)) {
    overrides[path] = body;
    for (const game of Object.values(next.games)) for (const file of game.files) if (file.path === path && body !== 404) Object.assign(file, {size: Buffer.byteLength(body), sha256: sha(body)});
    for (const game of Object.values(next.games)) for (const file of game.files) if (file.path === path && body === 404) file.sha256 = '0'.repeat(64);
  }
  next.version = sha(JSON.stringify(change)).slice(0, 16);
  overrides['offline/packs.json'] = JSON.stringify(next);
  overrides['sw.js'] = (await readFile(join(root, 'sw.js'), 'utf8')).replace(`'${packs.version}'`, `'${next.version}'`);
  return next.version;
}

for (const base of ['/', '/Qcc-games-/']) {
  test(`the app opens offline at ${base} and says which games need internet`, async ({page, context}) => {
    await install(page, base);
    const offline = await reopenOffline(context, base);
    await expect(offline.locator('.offline-pill')).toBeVisible();
    await expect(offline.locator('.game-card[data-game="snake"] img')).toHaveJSProperty('complete', true);
    await offline.screenshot({path: join(evidence, `library-offline${base === '/' ? '' : '-subpath'}.png`)});
    await offline.locator('.game-card[data-game="snake"]').click();
    await expect(offline.locator('#game-stage .game-error')).toHaveText('Not downloaded. Connect to the internet to play.');
  });
}

test('every downloaded game opens and loads all its files with no network', async ({page, context}) => {
  test.setTimeout(900000);
  const ids = Object.keys(packs.games);
  await install(page);
  await download(page, ids);
  await page.screenshot({path: join(evidence, 'downloads-complete.png'), fullPage: true});
  const offline = await reopenOffline(context);
  const failed = [];
  offline.on('requestfailed', request => { if (new URL(request.url()).origin === origin) failed.push(request.url()); });
  offline.on('response', response => { if (response.status() >= 400 && response.url().startsWith(origin)) failed.push(`${response.status()} ${response.url()}`); });
  await expect(offline.locator('.game-card[data-offline="ready"]')).toHaveCount(ids.length);
  for (const id of ids) {
    await play(offline, id);
    if (['snake', 'pool', 'chess', 'breachline'].includes(id)) await offline.screenshot({path: join(evidence, `offline-${id}.png`)});
  }
  // Chess finds its installed engines through the worker (including a HEAD request) and offers the computer.
  await offline.evaluate(() => { location.hash = '#/game/chess'; });
  await expect(offline.getByText('Not installed')).toHaveCount(0);
  // Only network-only routes (accounts, leaderboards, online rooms) may fail offline.
  expect(failed.filter(url => !/\/(?:\.netlify|api)\//.test(url))).toEqual([]);
});

test('progress made offline survives closing the app', async ({page, context}) => {
  await install(page);
  await download(page, ['fruit-merge']);
  let offline = await reopenOffline(context);
  await play(offline, 'fruit-merge');
  await offline.locator('.fm-board').click();
  await expect(offline.locator('.fm-count')).toContainText('1 fruit');
  await offline.evaluate(() => { location.hash = '#/collection'; });
  await expect(offline.locator('.game-card').first()).toBeVisible();
  offline = await reopenOffline(context);
  await play(offline, 'fruit-merge');
  await expect(offline.locator('.fm-count')).toContainText('1 fruit');
});

test('a new version refreshes downloaded games before it takes over, and never mid-game', async ({page, context}) => {
  await install(page);
  await download(page, ['snake']);
  const changed = 'game-art/snake/mouth-poses.svg';
  const body = (await readFile(join(root, changed), 'utf8')).replace('</svg>', '<!-- next version --></svg>');
  const version = await deploy({[changed]: body});
  await play(page, 'snake');
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), {timeout: 30000}).toBe(true);
  // The running game keeps its version and nothing covers it.
  await expect(page.locator('.update-pill')).toBeHidden();
  await page.evaluate(() => { location.hash = '#/collection'; });
  await page.locator('.update-pill').click();
  await expect.poll(() => page.evaluate(async version => !!navigator.serviceWorker.controller && await caches.has('pocket-arcade-v3:shell:' + version), version).catch(() => false), {timeout: 30000}).toBe(true);
  const offline = await reopenOffline(context);
  await play(offline, 'snake');
  const stored = await offline.evaluate(async path => (await (await caches.open('pocket-arcade-v3:files')).match(new URL(path, location.href).href))?.text(), changed);
  expect(stored).toContain('next version');
  expect(await offline.evaluate(async () => (await caches.keys()).filter(key => key.startsWith('pocket-arcade-v3:shell:')).length)).toBe(1);
});

test('a version that cannot refresh a game marks it to download again', async ({page, context}) => {
  await install(page);
  await download(page, ['snake']);
  await deploy({'game-art/snake/mouth-poses.svg': 404});
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), {timeout: 30000}).toBe(true);
  await page.evaluate(() => { window.beforeUpdate = true; });
  await page.locator('.update-pill').click();
  // The app reloads into the new version, on the same Downloads screen.
  await expect.poll(() => page.evaluate(() => !window.beforeUpdate && !!document.querySelector('.dl-row')).catch(() => false), {timeout: 30000}).toBe(true);
  await expect(page.locator('.dl-row[data-game="snake"] .dl-meta:not(.dl-hint)').first()).toContainText('Update needed');
});

test('an interrupted download fails honestly, then resumes without fetching finished files again', async ({page}) => {
  await install(page);
  const files = packs.games.pool.files.map(file => file.path);
  // A lasting outage for one file. Chromium itself retries a dropped GET once, so the count is generous.
  failures[files.at(-1)] = 100;
  await page.evaluate(() => { location.hash = '#/downloads'; });
  await page.getByRole('button', {name: 'Download Pool', exact: true}).click();
  await expect(page.locator('.dl-row[data-game="pool"] .dl-meta:not(.dl-hint)')).toContainText('Failed', {timeout: 30000});
  expect(await page.locator('.game-card[data-offline="ready"]').count()).toBe(0);
  served = []; failures = {};
  await page.getByRole('button', {name: 'Retry Pool', exact: true}).click();
  await expect(page.locator('.dl-row[data-game="pool"] .dl-meta:not(.dl-hint)').first()).toContainText('Downloaded', {timeout: 30000});
  expect(served.filter(path => files.includes(path))).toEqual([files.at(-1)]);
});

test('a download that does not fit says so before it starts', async ({page, context}) => {
  await context.addInitScript(() => { Object.defineProperty(StorageManager.prototype, 'estimate', {configurable: true, value: async () => ({quota: 50e6, usage: 49e6})}); });
  await install(page);
  await page.evaluate(() => { location.hash = '#/downloads'; });
  await page.getByRole('button', {name: 'Download Breachline', exact: true}).click();
  await expect(page.locator('.dl-row[data-game="breachline"] .dl-meta:not(.dl-hint)')).toContainText('Not enough storage', {timeout: 15000});
});

test('files the browser removed are found and repaired', async ({page}) => {
  await install(page);
  await download(page, ['tower']);
  await page.evaluate(async path => (await caches.open('pocket-arcade-v3:files')).delete(new URL(path, location.href).href), packs.games.tower.files[0].path);
  await page.getByRole('button', {name: 'Check for updates'}).click();
  await expect(page.locator('.dl-row[data-game="tower"] .dl-meta:not(.dl-hint)').first()).toContainText('Update needed');
  await page.getByRole('button', {name: 'Update Stack', exact: true}).click();
  await expect(page.locator('.dl-row[data-game="tower"] .dl-meta:not(.dl-hint)').first()).toContainText('Downloaded', {timeout: 30000});
  await page.getByRole('button', {name: 'Delete Stack', exact: true}).click();
  await expect(page.locator('.dl-row[data-game="tower"] .dl-meta:not(.dl-hint)').first()).not.toContainText('Downloaded');
  expect(await page.evaluate(async () => (await (await caches.open('pocket-arcade-v3:files')).keys()).length)).toBe(0);
});

test('a browser stuck on the old redirected-page worker recovers', async ({page}) => {
  // The pre-November worker cached index.html through Cloudflare's 308, then served that redirected
  // response for navigations, which browsers refuse.
  legacyWorker = String.raw`
    const NAME='pocket-arcade:/:7cc4be4c7742:shell',PAGE=new URL('index.html',self.registration.scope).href;
    self.addEventListener('install',event=>event.waitUntil(caches.open(NAME).then(cache=>cache.addAll([PAGE])).then(()=>self.skipWaiting())));
    self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(caches.open(NAME).then(cache=>cache.match(PAGE)));});`;
  await page.goto(origin + '/seed.html');
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  expect(await page.evaluate(async () => (await (await caches.open('pocket-arcade:/:7cc4be4c7742:shell')).match('/index.html'))?.redirected)).toBe(true);
  const broken = await page.context().newPage();
  // Chromium says ERR_FAILED; WebKit names the cause.
  await expect(broken.goto(origin + '/')).rejects.toThrow(/ERR_FAILED|has redirections/);
  // The browser's update check finds this version at the same URL. It must take over without waiting.
  legacyWorker = undefined;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some(key => key.startsWith('pocket-arcade-v3:shell:')) && !(await caches.keys()).some(key => key.startsWith('pocket-arcade:'))), {timeout: 30000}).toBe(true);
  // Opening the app again in the failed tab now works (WebKit never commits the failed URL, so this is a fresh open).
  await broken.goto(origin + '/#/collection');
  await expect(broken.locator('.game-card').first()).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).filter(key => key.startsWith('pocket-arcade:')))).toEqual([]);
});
