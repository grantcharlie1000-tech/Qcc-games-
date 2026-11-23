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
//  - Online, the page comes from the network, so a returning visitor gets the deployed version and its
//    chunk names. The stored page is for offline (or a network slower than PAGE_TIMEOUT).
//  - Stored copies keep the site's security headers (Content-Security-Policy and the rest).
//  - Install fails, and the current version stays, if any shell file cannot be fetched and verified.
const VERSION = '__OFFLINE_VERSION__';
const SCOPE = self.registration.scope;
const SHELL = 'pocket-arcade-v3:shell:' + VERSION, FILES = 'pocket-arcade-v3:files', META = 'pocket-arcade-v3:meta';
const MOVIE_FILES = 'qcc:movies:downloads-files:v1', MOVIE_META = 'qcc:movies:downloads-meta:v1';
const OWNED = /^pocket-arcade(?::|-v2:|-v3:shell:)/;
const BASE = new URL(SCOPE).pathname;
// Accounts, sync, leaderboards, Movies and live data always go to the network.
const NETWORK_ONLY = /^(?:\.netlify\/|api\/|movies\/|deploy-info\.json|santa\/departure\.json)/;
const at = path => new URL(path, SCOPE).href;
const PAGE_TIMEOUT = 3000;
const KEPT_HEADERS = ['content-type', 'content-security-policy', 'x-content-type-options', 'referrer-policy', 'x-robots-tag', 'x-dns-prefetch-control'];

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
  for (const name of KEPT_HEADERS) { const value = response.headers.get(name); if (value) headers[name] = value; }
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
    if (record.state !== 'ready' && record.state !== 'stale') continue;
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

/** Delete game files that no download (finished or in progress) still lists.
 * Caches belong to the whole origin: the site is served from one path per origin (/ on Pages). */
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
// Expected hashes for this version, so a game file stored by an older version is never served while online.
let expected;
function expectedHashes() {
  expected ??= (async () => {
    const map = new Map();
    try {
      const packs = await (await (await caches.open(SHELL)).match(at('offline/packs.json'))).json();
      for (const game of Object.values(packs.games)) for (const file of game.files) map.set(at(file.path), file.sha256);
    } catch { /* No packs: every stored file is trusted as before. */ }
    return map;
  })();
  return expected;
}
const answer = (request, hit) => request.method === 'HEAD' ? new Response(null, {headers: hit.headers}) : request.headers.has('range') ? partial(request, hit) : hit;

// Only separately reviewed, same-origin local MP4/WebM files can be served from the movie cache.
// Third-party streams and catalogue API responses are never put here.
async function downloadedMovie(request, path) {
  const meta = await caches.open(MOVIE_META);
  let approved = false;
  for (const request of await meta.keys()) {
    let record;
    try { record = await (await meta.match(request)).json(); } catch { continue; }
    if (record?.path === path && record?.source?.path === path &&
      record?.source?.reviewed === true && record?.source?.territory === 'Worldwide' &&
      typeof record?.source?.expires === 'string' &&
      Date.parse(record.source.expires + 'T23:59:59Z') >= Date.now()) {
      approved = true; break;
    }
  }
  if (approved) {
    const hit = await (await caches.open(MOVIE_FILES)).match(at(path));
    if (hit) return answer(request, hit);
  }
  return fetch(request);
}
async function cached(request) {
  const key = request.url.split('#')[0];
  const shellHit = await (await caches.open(SHELL)).match(key, {ignoreMethod: true});
  if (shellHit) return answer(request, shellHit);
  const hit = await (await caches.open(FILES)).match(key, {ignoreMethod: true});
  if (hit) {
    const sha = (await expectedHashes()).get(key);
    if (!sha || hit.headers.get('x-qcc-sha256') === sha) return answer(request, hit);
    // An older version's copy: the network first, the old copy only if that fails.
    try { const fresh = await fetch(request); if (fresh.ok) return fresh; } catch { /* offline */ }
    return answer(request, hit);
  }
  return fetch(request);
}
async function page(request) {
  const stored = () => caches.open(SHELL).then(cache => cache.match(at('./')));
  // Online, the deployed page: its chunk names exist on the server. Offline or very slow, the stored page,
  // which matches this version's downloaded games.
  try {
    const response = await Promise.race([fetch(request), new Promise((_, fail) => setTimeout(() => fail(new Error('slow')), PAGE_TIMEOUT))]);
    if (response.ok || response.type === 'opaqueredirect') return response;
    return (await stored()) || response;
  } catch {
    const hit = await stored();
    if (hit) return hit;
    return fetch(request);
  }
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if ((request.method !== 'GET' && request.method !== 'HEAD') || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  if (path.startsWith('movies/media/')) {
    event.respondWith(downloadedMovie(request, path));
    return;
  }
  if (path === 'movies/catalog.json' || path === 'movies/licenses.json') {
    // These two small, versioned static files are also in the shell for offline browsing.
    event.respondWith(fetch(request).then(response => response.ok ? response : cached(request), () => cached(request)));
    return;
  }
  if (NETWORK_ONLY.test(path)) return;
  // The page asks for the file list of its own version, which online is the deployed one.
  if (path === 'offline/packs.json') {
    event.respondWith(fetch(request).then(response => response.ok ? response : cached(request), () => cached(request)));
    return;
  }
  if (request.mode === 'navigate') {
    if (path === '' || path === 'index.html') event.respondWith(page(request));
    return;
  }
  event.respondWith(cached(request));
});
