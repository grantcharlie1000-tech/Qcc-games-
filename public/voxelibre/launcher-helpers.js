// Small browser-only helpers. No engine or game assets are imported here.
export function capabilityProblem(features) {
  if (!features.secure) return 'VoxeLibre needs a secure connection. Open the arcade over HTTPS.';
  if (!features.isolated || !features.sharedMemory) return 'Browser isolation is not ready. Return to the arcade and reload once, then try again.';
  if (!features.offscreenCanvas || !features.jspi) return 'This browser cannot run the VoxeLibre engine yet. Try an up-to-date browser; the other arcade games are still available.';
  if (!features.webgl2) return 'The graphics features VoxeLibre needs are unavailable. Check that hardware acceleration is enabled, or use another device.';
  return null;
}

export function observeRuntimeErrors(surface, runtimeDirectory, report) {
  const runtime = new URL(runtimeDirectory);
  const onError = event => {
    if (event.error) { report(event.error); return; }
    const target = event.target;
    if (target?.tagName !== 'SCRIPT' || typeof target.src !== 'string') return;
    let source;
    try { source = new URL(target.src); } catch { return; }
    if (source.origin !== runtime.origin || !source.pathname.startsWith(runtime.pathname)) return;
    report(new Error('The game engine could not be downloaded. Check the connection, then choose Check again.'));
  };
  // Resource errors do not bubble and do not carry ErrorEvent.error. The
  // native launcher inserts luanti.js itself without an onerror callback.
  surface.addEventListener('error', onError, true);
  return () => surface.removeEventListener('error', onError, {capture:true});
}

export function startNativeOperation(work) {
  let fail;
  const failure = new Promise((resolve, reject) => { fail = reject; });
  // Native ZIP promises normally settle through a worker callback. An aborted
  // engine can never send that callback, so its error must settle this race.
  const promise = Promise.race([Promise.resolve().then(work), failure]);
  return {promise, fail};
}

// These are failure diagnostics in the pinned native ServerMap,
// ServerEnvironment and files/SQLite database implementations. Some are caught
// and only logged, so a zero process exit is not sufficient to discard them.
export function nativeSaveProblem(output) {
  const text = String(output);
  if (/ServerMap: (?:Failed to save map to|Map not saved)|Map saving will be disabled\.|Failed to save block\b|deleteBlock: Failed to delete block/.test(text)) return 'The game reported a problem saving world map data.';
  if (/Failed to save player\b.*exception:|Didn't find free file for player\b/.test(text)) return 'The game reported a problem saving player data.';
  if (/ServerEnvironment::saveMeta\(\): Failed to write|Couldn't save env meta|Failed to update world\.mt/.test(text)) return 'The game reported a problem saving world metadata.';
  if (/ModStorageDatabaseFiles(?:: Unable to save\.|\[[^\]]*\]: failed to write file\.)|Failed to set mod entry\b/.test(text)) return 'The game reported a problem saving game data.';
  if (/Failed to (?:start|commit) SQLite3 transaction|Failed to (?:close|create) database\b|Failed to open SQLite3 database file|Database_SQLite3: Failed to create directory|SQLite3 database has been locked.*giving up!|Failed to prepare query\b/.test(text)) return 'The game reported a world database error.';
  if (/Failed to write\s+[^\n]*\/worlds\//.test(text)) return 'The game reported a problem writing world files.';
  return null;
}

export function nativeExitProblem(status, reportedFailure) {
  if (status === 0 && !reportedFailure) return null;
  const reason = status !== 0 ? `The game closed with an error (code ${status}).` : reportedFailure;
  return `${reason} The latest world save could not be confirmed. Use Back to library to leave, and keep your last ZIP backup.`;
}

export function parseParentCommand(event, origin, parentWindow) {
  if (event.source !== parentWindow || event.origin !== origin) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== 'QCC_VOXELIBRE_COMMAND') return null;
  if (!['pause', 'resume', 'quit', 'settings'].includes(data.command)) return null;
  if (data.requestId !== undefined && (typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 100)) return null;
  if (data.command === 'quit' && !data.requestId) return null;
  if (data.settings !== undefined && (!data.settings || typeof data.settings !== 'object' || typeof data.settings.sound !== 'boolean' || typeof data.settings.reducedMotion !== 'boolean')) return null;
  if (data.command === 'settings' && !data.settings) return null;
  const result = {type: data.type, command: data.command};
  if (data.requestId !== undefined) result.requestId = data.requestId;
  if (data.settings) result.settings = {sound: data.settings.sound, reducedMotion: data.settings.reducedMotion};
  return result;
}

function safeZipPath(path) {
  while (path.startsWith('./')) path = path.slice(2);
  if (!path || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path) || path.startsWith('/') || /^[a-z]:/i.test(path)) throw new Error('The ZIP contains an unsafe path.');
  const parts = path.replace(/\/$/, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('The ZIP contains an unsafe path.');
  return path;
}

export function inspectWorldZip(buffer, limits = {}) {
  const maxCompressed = limits.maxCompressed ?? 256 * 1024 * 1024;
  const maxExpanded = limits.maxExpanded ?? 512 * 1024 * 1024;
  const maxEntries = limits.maxEntries ?? 20000;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > maxCompressed) throw new Error('This world ZIP is too large for browser import (256 MB maximum).');
  if (bytes.byteLength < 22) throw new Error('Choose a valid world ZIP archive.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Native libarchive world exports pad their last write to a 10 KiB block.
  // Accept only that bounded zero tail, not arbitrary data after a ZIP.
  const maxNativePadding = 10240;
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557 - maxNativePadding); at--) {
    if (view.getUint32(at, true) !== 0x06054b50) continue;
    const archiveEnd = at + 22 + view.getUint16(at + 20, true);
    const padding = bytes.length - archiveEnd;
    if (padding >= 0 && padding <= maxNativePadding && bytes.subarray(archiveEnd).every(byte => byte === 0)) { end = at; break; }
  }
  if (end < 0) throw new Error('Choose a complete world ZIP archive.');
  const entries = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== entries) throw new Error('Split ZIP archives are not supported.');
  if (entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('This ZIP uses the large ZIP64 format. Export a smaller world ZIP to import here.');
  if (!entries || entries > maxEntries || centralOffset + centralSize > end) throw new Error('This ZIP is too large or its directory is invalid.');
  const decoder = new TextDecoder('utf-8', {fatal:true});
  const files = [];
  const paths = new Set();
  let at = centralOffset, expanded = 0;
  for (let index = 0; index < entries; index++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new Error('The ZIP directory is damaged.');
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > centralOffset + centralSize || flags & 0x41 || ![0,8].includes(method)) throw new Error('Use a standard, unencrypted world ZIP.');
    if (compressed === 0xffffffff || size === 0xffffffff) throw new Error('This ZIP contains a file that is too large for browser import.');
    expanded += size;
    if (expanded > maxExpanded) throw new Error('This world expands to too much data for browser import. The uncompressed ZIP is too large.');
    const mode = view.getUint32(at + 38, true) >>> 16;
    if ((mode & 0xf000) === 0xa000) throw new Error('The ZIP contains an unsafe symbolic link.');
    let path;
    try { path = safeZipPath(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))); }
    catch (error) { throw new Error(error instanceof TypeError ? 'The ZIP contains an unreadable filename.' : error.message); }
    const key = path.replace(/\/$/, '');
    if (paths.has(key)) throw new Error('The ZIP contains duplicate file paths. Choose an unambiguous world backup.');
    paths.add(key);
    const offset = view.getUint32(at + 42, true);
    if (offset + 30 > centralOffset || view.getUint32(offset, true) !== 0x04034b50) throw new Error('A file in the ZIP is damaged.');
    const localNameLength = view.getUint16(offset + 26, true);
    const start = offset + 30 + localNameLength + view.getUint16(offset + 28, true);
    if (start + compressed > centralOffset) throw new Error('A file in the ZIP is incomplete.');
    let localPath;
    try { localPath = safeZipPath(decoder.decode(bytes.subarray(offset + 30, offset + 30 + localNameLength))); }
    catch { throw new Error('The ZIP contains an unsafe or unreadable file header.'); }
    if (localPath !== path || view.getUint16(offset + 6, true) !== flags || view.getUint16(offset + 8, true) !== method) throw new Error('The ZIP contains inconsistent file headers. Choose a complete world backup.');
    if (!(flags & 8) && (view.getUint32(offset + 18, true) !== compressed || view.getUint32(offset + 22, true) !== size)) throw new Error('The ZIP contains inconsistent file sizes.');
    files.push({path, method, size, compressed, start});
    at = next;
  }
  if (at !== centralOffset + centralSize) throw new Error('The ZIP directory is damaged.');
  const markers = files.filter(file => file.path === 'world.mt' || file.path.endsWith('/world.mt'));
  if (markers.length !== 1) throw new Error('Choose a ZIP containing exactly one world, including its world.mt file.');
  const marker = markers[0];
  const prefix = marker.path.slice(0, -'world.mt'.length);
  const count = files.filter(file => file.path.startsWith(prefix) && file.path !== prefix).length;
  return {prefix, count, expanded, marker};
}

export async function readWorldMetadata(buffer, info) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const marker = info.marker;
  if (marker.size > 16384) throw new Error('The world metadata is unexpectedly large.');
  let stream = new Blob([bytes.slice(marker.start, marker.start + marker.compressed)]).stream();
  if (marker.method === 8) {
    try { stream = stream.pipeThrough(new DecompressionStream('deflate-raw')); }
    catch { throw new Error('This browser cannot read compressed world backups. Try a newer browser.'); }
  }
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > 16384 || size > marker.size) { await reader.cancel(); throw new Error('The world metadata is too large or damaged.'); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  if (size !== marker.size) throw new Error('The world metadata is incomplete.');
  const data = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
  const text = new TextDecoder('utf-8', {fatal:true}).decode(data);
  const settings = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([a-z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) settings.set(match[1], match[2]);
  }
  if (settings.get('gameid') !== 'mineclone2') throw new Error('This backup belongs to another game. Choose a VoxeLibre world with gameid = mineclone2.');
  return {gameid:'mineclone2', name:(settings.get('world_name') || 'Imported world').slice(0,100)};
}
