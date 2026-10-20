import { afterEach, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

// @ts-expect-error The standalone Node build script intentionally has no application typings.
import { packGameArchive, inspectGamePack, prepareVoxeLibre } from '../../scripts/prepare-voxelibre.mjs';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'qcc-voxelibre-package-test-'));
  temporaryDirectories.push(path);
  return path;
}

type Entry = { name: string; text?: string; year?: number; mode?: number };
function fixtureArchive(path: string, entries: Entry[]) {
  const result = spawnSync('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for entry in json.loads(sys.argv[2]):
        info = zipfile.ZipInfo(entry['name'], (entry.get('year', 2020), 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = entry.get('mode', 0o100755) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, entry.get('text', ''))
`, path, JSON.stringify(entries)], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
}

test('game packaging preserves files and licenses while removing archive ordering and timestamp differences', async () => {
  const dir = await directory();
  const first = join(dir, 'first.zip');
  const second = join(dir, 'second.zip');
  const entries = [
    { name: 'mineclone2/mods/example/init.lua', text: 'return "game content"' },
    { name: 'mineclone2/LICENSE.txt', text: 'Example source license' },
    { name: 'mineclone2/game.conf', text: 'name = Example Game\n' },
  ];
  fixtureArchive(first, entries);
  fixtureArchive(second, [{ name: 'mineclone2/', mode: 0o40755 }, ...entries.slice().reverse().map(entry => ({ ...entry, year: 2026 }))]);
  const firstPack = await packGameArchive(first);
  const secondPack = await packGameArchive(second);
  expect(firstPack.pack.equals(secondPack.pack)).toBe(true);
  const tar = zstdDecompressSync(firstPack.pack);
  const tarPath = join(dir, 'game.tar');
  await writeFile(tarPath, tar);
  const listing = spawnSync('python3', ['-c', `
import json, sys, tarfile
with tarfile.open(sys.argv[1]) as archive:
    print(json.dumps([{'name': member.name, 'text': archive.extractfile(member).read().decode(), 'mtime': member.mtime, 'mode': member.mode, 'uid': member.uid, 'gid': member.gid} for member in archive]))
`, tarPath], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
  expect(listing.status).toBe(0);
  expect(JSON.parse(listing.stdout.toString())).toEqual([
    { name: 'luanti/games/mineclone2/LICENSE.txt', text: 'Example source license', mtime: 0, mode: 0o644, uid: 0, gid: 0 },
    { name: 'luanti/games/mineclone2/game.conf', text: 'name = Example Game\n', mtime: 0, mode: 0o644, uid: 0, gid: 0 },
    { name: 'luanti/games/mineclone2/mods/example/init.lua', text: 'return "game content"', mtime: 0, mode: 0o644, uid: 0, gid: 0 },
  ]);
});

test.each([
  '../outside.txt',
  '/mineclone2/absolute.txt',
  'mineclone2/../outside.txt',
  'mineclone2//ambiguous.txt',
  'mineclone2/./ambiguous.txt',
  'mineclone2\\outside.txt',
  'other-game/init.lua',
])('rejects archive entry %s before it can become a runtime filesystem path', async name => {
  const archive = join(await directory(), 'unsafe.zip');
  fixtureArchive(archive, [{ name, text: 'unexpected content' }]);
  await expect(packGameArchive(archive)).rejects.toThrow(/unsafe archive path/i);
});

test('rejects ZIP symlinks and duplicate filenames instead of producing ambiguous game content', async () => {
  const dir = await directory();
  const symlink = join(dir, 'symlink.zip');
  fixtureArchive(symlink, [{ name: 'mineclone2/link', text: '../../outside', mode: 0o120777 }]);
  await expect(packGameArchive(symlink)).rejects.toThrow(/regular file/i);
  const duplicate = join(dir, 'duplicate.zip');
  fixtureArchive(duplicate, [{ name: 'mineclone2/init.lua', text: 'first' }, { name: 'mineclone2/init.lua', text: 'second' }]);
  await expect(packGameArchive(duplicate)).rejects.toThrow(/duplicate archive path/i);
});

test('pack validation rejects a truncated download and wrong decompressed checksum', () => {
  const expected = { tarBytes: 6, tarSha256: '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03' };
  const valid = zstdCompressSync(Buffer.from('hello\n'));
  expect(inspectGamePack(valid, expected).tarBytes).toBe(6);
  expect(() => inspectGamePack(valid.subarray(0, valid.length - 1), expected)).toThrow();
  expect(() => inspectGamePack(zstdCompressSync(Buffer.from('jello\n')), expected)).toThrow(/checksum/i);
});

test('a mismatched pinned source archive fails without replacing an existing game pack', async () => {
  const dir = await directory();
  const publicDirectory = join(dir, 'public');
  const output = join(publicDirectory, 'voxelibre/runtime/packs/mineclone2.pack');
  await mkdir(join(publicDirectory, 'voxelibre/runtime/packs'), { recursive: true });
  await writeFile(output, 'previous game pack');
  const sourceArchive = join(dir, 'wrong-release.zip');
  await writeFile(sourceArchive, 'not the pinned release');
  await expect(prepareVoxeLibre({ publicDirectory, sourceArchive })).rejects.toThrow(/checksum/i);
  expect(await readFile(output, 'utf8')).toBe('previous game pack');
});
