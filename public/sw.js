// Offline worker. The build writes dist/sw.js from this file with its version stamped in
// (scripts/offline-packs.mjs), so the browser only updates the worker when the site's content changes.
//
// Caches:
//   pocket-arcade-v3:shell:<version>  the page, entry script, styles, fonts, icons and covers for this version
//   pocket-arcade-v3:files            downloaded game files, shared between games and kept across versions
//   pocket-arcade-v3:meta             one record per downloaded game: {id, state, version, files}
// Every stored file carries its SHA-256 in an x-qcc-sha256 header, so "already have it" needs no body read.
//
// Rules:
//  - Never store or serve a redirected response. Cloudflare Pages answers index.html with a 308, and a
//    cached redirected response breaks navigation (the cause of the 2026-11-03 outage). Every response is
//    rebuilt before it is stored, and the page is stored under the scope URL.
//  - A new version waits. The app asks it to take over (SKIP_WAITING) from the library, never mid-game.
//  - Install fails, and the current version stays, if any shell file cannot be fetched and verified.
const VERSION = '__OFFLINE_VERSION__';
const SCOPE = self.registration.scope;
const SHELL = 'pocket-arcade-v3:shell:' + VERSION, FILES = 'pocket-arcade-v3:files', META = 'pocket-arcade-v3:meta';
const OWNED = /^pocket-arcade(?::|-v2:|-v3:shell:)/;
const BASE = new URL(SCOPE).pathname;
// Accounts, sync, leaderboards, Movies and live data always go to the network.
const NETWORK_ONLY = /^(?:\.netlify\/|api\/|movies\/|deploy-info\.json|santa\/departure\.json)/;
const at = path => new URL(path, SCOPE).href;

async function digest(buffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** Fetch one listed file, check its size and hash, and store a clean copy. Throws a TypeError when offline. */
async function store(cache, file) {
  const response = await fetch(at(file.path), {cache: 'no-cache', credentials: 'same-origin'});
  if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`);
  const body = await response.arrayBuffer();
  if (body.byteLength !== file.size || await digest(body) !== file.sha256) throw new Error(`${file.path}: content does not match this version`);
  const headers = {'x-qcc-sha256': file.sha256};
  const type = response.headers.get('content-type');
  if (type) headers['content-type'] = type;
  await cache.put(at(file.path), new Response(body, {headers}));
}
async function has(cache, file) {
  const hit = await cache.match(at(file.path));
  return hit?.headers.get('x-qcc-sha256') === file.sha256;
}
async function pool(items, limit, task) {
  let next = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => { while (next < items.length) await task(items[next++]); }));
}
const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});

async function install() {
  const packs = await (await fetch(at('offline/packs.json'), {cache: 'no-store'})).json();
  if (packs.version !== VERSION) throw new Error('A newer version is being published');
  const shell = await caches.open(SHELL), files = await caches.open(FILES);
  // Hashed assets keep their name only while their content is unchanged, so earlier copies are reused.
  const old = (await caches.keys()).filter(key => key.startsWith('pocket-arcade-v3:shell:') && key !== SHELL);
  await pool(packs.shell, 6, async file => {
    for (const key of old) {
      const hit = await (await caches.open(key)).match(at(file.path));
      if (hit?.headers.get('x-qcc-sha256') === file.sha256) { await shell.put(at(file.path), hit); return; }
    }
    await store(shell, file);
  });
  await shell.put(at('offline/packs.json'), json(packs));
  // Bring every downloaded game to this version before it can take over, so it still opens offline after.
  const meta = await caches.open(META);
  for (const request of await meta.keys()) {
    const record = await (await meta.match(request)).json();
    if (record.state !== 'ready') continue;
    const pack = packs.games[record.id];
    if (!pack) { await meta.delete(request); continue; }
    try {
      await pool(pack.files, 4, async file => { if (!await has(files, file)) await store(files, file); });
      await meta.put(request, json({id: record.id, state: 'ready', version: VERSION, size: pack.size, files: pack.files.map(file => file.path)}));
    } catch (error) {
      // Offline part way: keep the current version and try again on the next visit.
      if (error instanceof TypeError) throw error;
      // Storage full or a bad file: the game is marked for a fresh download instead of blocking the update.
      await meta.put(request, json({...record, state: 'stale'}));
    }
  }
  // A browser still running the pre-November worker can be stuck on its broken redirected page,
  // so this version replaces that one at once instead of waiting.
  if ((await caches.keys()).some(key => /^pocket-arcade(?::|-v2:)/.test(key))) await self.skipWaiting();
}

/** Delete game files that no download (finished or in progress) still lists. */
async function prune() {
  const meta = await caches.open(META), files = await caches.open(FILES), keep = new Set();
  for (const request of await meta.keys()) for (const path of (await (await meta.match(request)).json()).files || []) keep.add(at(path));
  for (const request of await files.keys()) if (!keep.has(request.url)) await files.delete(request);
}

self.addEventListener('install', event => event.waitUntil(install()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (OWNED.test(key) && key !== SHELL) await caches.delete(key);
  await prune();
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'VERSION') event.ports[0]?.postMessage(VERSION);
});

/** A slice of a cached file for Safari's media Range requests. */
async function partial(request, response) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (!match) return response;
  const blob = await response.blob(), size = blob.size;
  let start = match[1] === '' ? size - Number(match[2]) : Number(match[1]);
  let end = match[1] !== '' && match[2] !== '' ? Number(match[2]) : size - 1;
  start = Math.max(0, start); end = Math.min(end, size - 1);
  if (start > end) return new Response(null, {status: 416, headers: {'content-range': `bytes */${size}`}});
  const headers = new Headers(response.headers);
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(blob.slice(start, end + 1), {status: 206, headers});
}
async function cached(request) {
  const key = request.url.split('#')[0];
  for (const name of [SHELL, FILES]) {
    const hit = await (await caches.open(name)).match(key, {ignoreMethod: true});
    if (hit) {
      if (request.method === 'HEAD') return new Response(null, {headers: hit.headers});
      return request.headers.has('range') ? partial(request, hit) : hit;
    }
  }
  return fetch(request);
}
async function page(request) {
  // The app shell this worker was installed with, so the page and its downloaded games always match.
  const hit = await (await caches.open(SHELL)).match(at('./'));
  return hit || fetch(request);
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if ((request.method !== 'GET' && request.method !== 'HEAD') || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  if (NETWORK_ONLY.test(path)) return;
  if (request.mode === 'navigate') {
    if (path === '' || path === 'index.html') event.respondWith(page(request));
    return;
  }
  event.respondWith(cached(request));
});
