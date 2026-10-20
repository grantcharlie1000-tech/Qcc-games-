// Restore the compiled native engine from small, checksum-verified repository parts.
// Node >=22 and Python 3 only; the normal site build does not compile C++.
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isDigest = (digest) => typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest);
const isSize = (size, maximum) => Number.isSafeInteger(size) && size > 0 && size <= maximum;

const extractVerified = String.raw`
import hashlib, json, pathlib, sys, tarfile

manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
destination = pathlib.Path(sys.argv[3])
expected = {entry['path']: entry for entry in manifest['files']}
seen = set()
with tarfile.open(sys.argv[2], 'r:gz') as archive:
    for member in archive:
        name = member.name
        if name not in expected or name in seen or not member.isfile():
            raise ValueError('Unexpected, duplicate, or non-file runtime member: ' + repr(name))
        entry = expected[name]
        if member.size != entry['bytes']:
            raise ValueError('Runtime member size mismatch: ' + name)
        with archive.extractfile(member) as source:
            data = source.read(entry['bytes'] + 1)
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('Runtime member checksum mismatch: ' + name)
        target = destination.joinpath(*name.split('/'))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(0o644)
        seen.add(name)
if seen != expected.keys():
    raise ValueError('Missing runtime files: ' + ', '.join(sorted(expected.keys() - seen)))
`;

function validateManifest(manifest) {
  if (manifest.format !== 1 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 100) {
    throw new Error('Unsupported or invalid VoxeLibre runtime manifest.');
  }
  const archive = manifest.archive;
  if (!archive || !isDigest(archive.sha256) || !isSize(archive.bytes, 32 * 1024 * 1024)
      || !Array.isArray(archive.parts) || !archive.parts.length || archive.parts.length > 150) {
    throw new Error('Invalid VoxeLibre runtime archive metadata.');
  }
  let compressedBytes = 0;
  const names = new Set();
  for (const part of archive.parts) {
    if (!/^runtime-parts\/runtime\.tar\.gz\.part-\d{3}$/.test(part.file)
        || names.has(part.file) || !isDigest(part.sha256) || !isSize(part.bytes, 300000)) {
      throw new Error('Invalid VoxeLibre runtime archive part.');
    }
    names.add(part.file);
    compressedBytes += part.bytes;
  }
  if (compressedBytes !== archive.bytes) throw new Error('Runtime archive part sizes do not match its total.');
  names.clear();
  let extractedBytes = 0;
  for (const file of manifest.files) {
    const segments = typeof file.path === 'string' ? file.path.split('/') : [];
    if (segments[0] !== 'runtime' || segments.length < 2 || segments.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')
        || names.has(file.path) || !isDigest(file.sha256) || !isSize(file.bytes, 64 * 1024 * 1024)) {
      throw new Error('Invalid VoxeLibre runtime file metadata.');
    }
    names.add(file.path);
    extractedBytes += file.bytes;
  }
  if (extractedBytes > 128 * 1024 * 1024) throw new Error('Runtime exceeds the total extracted size limit.');
  for (const required of ['luanti.js', 'luanti.wasm', 'launcher.js', 'worker.js', 'lockworker.js', 'packs/base.pack', 'packs/certs.pack']) {
    if (!names.has(`runtime/${required}`)) throw new Error(`Runtime manifest omits ${required}.`);
  }
  if (manifest.buildInputs) {
    if (!isDigest(manifest.buildInputs.pinsSha256) || !Array.isArray(manifest.buildInputs.patches)
        || manifest.buildInputs.patches.length > 20) throw new Error('Invalid native source provenance.');
    for (const patch of manifest.buildInputs.patches) {
      if (!/^build\/patches\/[a-z0-9-]+\.patch$/.test(patch.file) || !isDigest(patch.sha256)) {
        throw new Error('Invalid native patch provenance.');
      }
    }
  }
  return manifest;
}

async function matches(path, expected) {
  try {
    const bytes = await readFile(path);
    return bytes.length === expected.bytes && sha256(bytes) === expected.sha256;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Preserve the separately generated game pack and worlds: replace only listed engine files. */
export async function prepareVoxeLibreRuntime({
  vendorDirectory = join(projectDirectory, 'vendor/voxelibre'),
  publicDirectory = join(projectDirectory, 'public'),
} = {}) {
  const manifestPath = join(vendorDirectory, 'runtime-manifest.json');
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (manifest.buildInputs) {
    const inputs = [{ file: 'build/pins.json', sha256: manifest.buildInputs.pinsSha256 }, ...manifest.buildInputs.patches];
    for (const input of inputs) {
      if (sha256(await readFile(join(vendorDirectory, input.file))) !== input.sha256) {
        throw new Error(`Native build input changed (${input.file}); rebuild and package the engine before deployment.`);
      }
    }
  }
  const gameDirectory = join(publicDirectory, 'voxelibre');
  if ((await Promise.all(manifest.files.map((file) => matches(join(gameDirectory, file.path), file)))).every(Boolean)) {
    return { reused: true, files: manifest.files.length, archiveSha256: manifest.archive.sha256 };
  }
  const parts = [];
  for (const part of manifest.archive.parts) {
    const bytes = await readFile(join(vendorDirectory, part.file));
    if (bytes.length !== part.bytes || sha256(bytes) !== part.sha256) throw new Error(`Runtime part checksum mismatch: ${part.file}.`);
    parts.push(bytes);
  }
  const archive = Buffer.concat(parts);
  if (archive.length !== manifest.archive.bytes || sha256(archive) !== manifest.archive.sha256) {
    throw new Error('Joined native runtime archive failed its checksum.');
  }
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'qcc-runtime-'));
  try {
    const archivePath = join(temporaryDirectory, 'runtime.tar.gz');
    const extractedDirectory = join(temporaryDirectory, 'verified');
    await writeFile(archivePath, archive);
    try {
      await runFile('python3', ['-c', extractVerified, manifestPath, archivePath, extractedDirectory], { maxBuffer: 1024 * 1024, timeout: 60000 });
    } catch (cause) {
      throw new Error(`Cannot restore the verified VoxeLibre runtime: ${cause.stderr || cause.message}`, { cause });
    }
    // All archive files have passed verification before any deployed file changes.
    for (const file of manifest.files) {
      const destination = join(gameDirectory, file.path);
      await mkdir(dirname(destination), { recursive: true });
      const temporaryPath = `${destination}.prepare-${randomUUID()}`;
      try {
        await writeFile(temporaryPath, await readFile(join(extractedDirectory, file.path)), { flag: 'wx' });
        await rename(temporaryPath, destination);
      } finally {
        await rm(temporaryPath, { force: true });
      }
    }
    return { reused: false, files: manifest.files.length, archiveSha256: manifest.archive.sha256 };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await prepareVoxeLibreRuntime();
    console.log(`VoxeLibre native engine: ${result.reused ? 'verified existing' : 'restored'} ${result.files} files (archive SHA256 ${result.archiveSha256}).`);
  } catch (error) {
    console.error(`VoxeLibre runtime preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
