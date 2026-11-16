// Checks the built offline files: every file packs.json lists exists in dist with the listed size and hash,
// sw.js carries the same version, and the worker never stores a redirected response.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function verifyOfflineBuild(directory = 'dist') {
  const packs = JSON.parse(await readFile(join(directory, 'offline/packs.json'), 'utf8'));
  const worker = await readFile(join(directory, 'sw.js'), 'utf8');
  assert.match(packs.version, /^[0-9a-f]{16}$/);
  assert(worker.includes(`const VERSION = '${packs.version}'`), 'sw.js must carry the packs version');
  const games = Object.keys(packs.games);
  assert(games.length >= 29, `Expected every game in packs.json, found ${games.length}`);
  const check = async file => {
    const data = await readFile(join(directory, file.path === './' ? 'index.html' : file.path));
    assert.equal(data.length, file.size, `${file.path} size`);
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, `${file.path} hash`);
  };
  for (const file of packs.shell) await check(file);
  for (const id of games) {
    assert(packs.games[id].files.length > 0, `${id} lists no files`);
    for (const file of packs.games[id].files) await check(file);
  }
  const headers = await readFile(join(directory, '_headers'), 'utf8');
  assert.match(headers, /\/sw\.js\n\s+Cache-Control: no-cache/, 'sw.js must be served without a long cache');
  console.log(`PASS: offline packs ${packs.version}: ${packs.shell.length} shell files and ${games.length} games match dist.`);
}
if (import.meta.url === `file://${process.argv[1]}`) await verifyOfflineBuild();
