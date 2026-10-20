// Build-time preparation only. The deployed game fetches its assets from this site.
// Requires Python 3 and Node >=22.15 (built-in Zstandard), with no extra packages.
// An existing download can be supplied with VOXELIBRE_SOURCE_ARCHIVE=/path/to.zip.
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';

const runFile = promisify(execFile);
const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const VOXELIBRE_RELEASE = Object.freeze({
  version: '0.92.4',
  contentDbRelease: 39534,
  commit: 'a5078bab2efbc8a670b8b10c290ade73aa87be6a',
  url: 'https://cdn.content.luanti.org/uploads/3e11bd7181.zip',
  archiveBytes: 84226154,
  archiveSha256: '6215d4da27900874959ff586fb266091be3d4161b9d4f5d27ce0d0cdc49f1af2',
  tarBytes: 109762560,
  tarSha256: '76d1820db71d051a7ad5452e2d98e24561f04427526f2dc4e78060ce5d705168',
});

// Read ZIP members directly: nothing from the archive is extracted onto the host.
// PAX headers, normalized metadata, sorted filenames and tarfile's record padding
// reproduce the pinned tar payload independently of ZIP timestamps or host paths.
const makeTar = String.raw`
import os, stat, sys, tarfile, zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    members = sorted(archive.infolist(), key=lambda member: member.filename)
    if len(members) > 20000 or sum(member.file_size for member in members) > 268435456:
        raise ValueError('Archive exceeds the game package size limit')
    seen = set()
    files = []
    for member in members:
        name = member.orig_filename
        parts = name.rstrip('/').split('/') if member.is_dir() else name.split('/')
        if (name.startswith('/') or '\\' in name or '\x00' in name
                or any(part in ('', '.', '..') for part in parts)
                or parts[0] != 'mineclone2'
                or (len(parts) < 2 and not member.is_dir())):
            raise ValueError('Unsafe archive path: ' + repr(name))
        normalized = '/'.join(parts)
        if normalized in seen:
            raise ValueError('Duplicate archive path: ' + repr(name))
        seen.add(normalized)
        kind = stat.S_IFMT(member.external_attr >> 16)
        allowed = (0, stat.S_IFDIR) if member.is_dir() else (0, stat.S_IFREG)
        if kind not in allowed:
            raise ValueError('Archive member must be a regular file or directory: ' + repr(name))
        if not member.is_dir():
            files.append(member)
    if not files:
        raise ValueError('Archive contains no game files')
    with tarfile.open(sys.argv[2], 'w', format=tarfile.PAX_FORMAT) as output:
        for member in files:
            info = tarfile.TarInfo('luanti/games/' + member.filename)
            info.mtime = 0
            info.mode = 0o644
            info.size = member.file_size
            with archive.open(member) as data:
                output.addfile(info, data)
`;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireZstandard() {
  if (typeof zlib.zstdCompressSync !== 'function' || typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error('VoxeLibre packaging requires Node.js 22.15 or newer with built-in Zstandard support.');
  }
}

function verifyBytes(bytes, digest, length, label) {
  const actual = sha256(bytes);
  if (actual !== digest || bytes.length !== length) {
    throw new Error(`${label} checksum mismatch: expected ${digest} (${length} bytes), received ${actual} (${bytes.length} bytes).`);
  }
}

/** Validate the filesystem payload, even if Node's bundled zstd version changes. */
export function inspectGamePack(pack, expected = VOXELIBRE_RELEASE) {
  requireZstandard();
  let tar;
  try {
    tar = zlib.zstdDecompressSync(pack, { maxOutputLength: expected.tarBytes });
  } catch (cause) {
    throw new Error('Invalid VoxeLibre pack: cannot decode a complete Zstandard stream.', { cause });
  }
  verifyBytes(tar, expected.tarSha256, expected.tarBytes, 'VoxeLibre pack content');
  return { packBytes: pack.length, packSha256: sha256(pack), tarBytes: tar.length, tarSha256: expected.tarSha256 };
}

/** Convert a game ZIP into a deterministic, compressed Luanti filesystem pack. */
export async function packGameArchive(sourceArchive, expected) {
  requireZstandard();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'qcc-voxelibre-pack-'));
  try {
    const tarPath = join(temporaryDirectory, 'mineclone2.tar');
    try {
      await runFile('python3', ['-c', makeTar, resolve(sourceArchive), tarPath], { maxBuffer: 1024 * 1024 });
    } catch (cause) {
      if (cause.code === 'ENOENT') throw new Error('VoxeLibre packaging requires Python 3 (python3 on PATH).', { cause });
      throw new Error(`Cannot package the VoxeLibre archive: ${cause.stderr || cause.message}`, { cause });
    }
    const tar = await readFile(tarPath);
    const payload = { tarBytes: tar.length, tarSha256: sha256(tar) };
    if (expected) verifyBytes(tar, expected.tarSha256, expected.tarBytes, 'Canonical VoxeLibre tar');
    const pack = zlib.zstdCompressSync(tar, {
      params: {
        [zlib.constants.ZSTD_c_compressionLevel]: 15,
        [zlib.constants.ZSTD_c_checksumFlag]: 1,
        [zlib.constants.ZSTD_c_contentSizeFlag]: 1,
        [zlib.constants.ZSTD_c_nbWorkers]: 0,
      },
    });
    return { pack, ...inspectGamePack(pack, payload) };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function readIfPresent(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeAtomically(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.prepare-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, bytes, { flag: 'wx' });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function downloadSourceArchive() {
  const response = await fetch(VOXELIBRE_RELEASE.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) {
    throw new Error(`Cannot download VoxeLibre ${VOXELIBRE_RELEASE.version}: HTTP ${response.status}.`);
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > VOXELIBRE_RELEASE.archiveBytes) throw new Error('Downloaded VoxeLibre archive exceeds the pinned size.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, length);
}

/** Prepare the source download and game pack; native runtime packaging is separate. */
export async function prepareVoxeLibre({
  publicDirectory = join(projectDirectory, 'public'),
  sourceArchive,
} = {}) {
  requireZstandard();
  const sourcePath = join(publicDirectory, 'voxelibre/sources/voxelibre-0.92.4.zip');
  const packPath = join(publicDirectory, 'voxelibre/runtime/packs/mineclone2.pack');
  // An explicitly supplied archive must pass the same release pin as a download.
  // Keep existing assets intact if a source check or a later build step fails.
  const publishedSource = await readIfPresent(sourcePath);
  if (sourceArchive) {
    const suppliedSource = await readFile(sourceArchive);
    verifyBytes(suppliedSource, VOXELIBRE_RELEASE.archiveSha256, VOXELIBRE_RELEASE.archiveBytes, 'VoxeLibre source archive');
    if (!publishedSource || sha256(publishedSource) !== VOXELIBRE_RELEASE.archiveSha256) {
      await writeAtomically(sourcePath, suppliedSource);
    }
  } else if (publishedSource) {
    verifyBytes(publishedSource, VOXELIBRE_RELEASE.archiveSha256, VOXELIBRE_RELEASE.archiveBytes, 'Cached VoxeLibre source archive');
  } else {
    const downloadedSource = await downloadSourceArchive();
    verifyBytes(downloadedSource, VOXELIBRE_RELEASE.archiveSha256, VOXELIBRE_RELEASE.archiveBytes, 'Downloaded VoxeLibre source archive');
    await writeAtomically(sourcePath, downloadedSource);
  }

  const existingPack = await readIfPresent(packPath);
  if (existingPack) {
    try {
      return { packPath, sourcePath, reused: true, ...inspectGamePack(existingPack) };
    } catch {
      // A partial or stale output is rebuilt from the verified source archive.
    }
  }
  const { pack, ...metadata } = await packGameArchive(sourcePath, VOXELIBRE_RELEASE);
  await writeAtomically(packPath, pack);
  return { packPath, sourcePath, reused: false, ...metadata };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await prepareVoxeLibre({ sourceArchive: process.env.VOXELIBRE_SOURCE_ARCHIVE });
    console.log(`VoxeLibre ${VOXELIBRE_RELEASE.version}: ${result.reused ? 'verified existing' : 'prepared'} game pack (${result.packBytes} bytes, SHA256 ${result.packSha256}).`);
  } catch (error) {
    console.error(`VoxeLibre preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
