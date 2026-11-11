#!/usr/bin/env node
/** Builds Breachline's shipped art from the fetched sources (run fetch.mjs first).
 *
 * Textures: per tier size, colour as BC1 (sRGB), normals as BC5 (two channels, z rebuilt in the shader), packed
 * AO/roughness/metal as BC1; plus small JPEG fallbacks for GPUs without S3TC (most ARM Chromebooks).
 * Models: geometry as binary glTF with images stripped; their textures go through the same texture path.
 * Writes public/game-art/breachline/assets.json (what exists, sizes) and the Breachline block of THIRD_PARTY_NOTICES. */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encode, GL, ktx } from './bc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CACHE = join(HERE, '.cache');
const OUT = join(ROOT, 'public', 'game-art', 'breachline');
const manifest = JSON.parse(await readFile(join(HERE, 'manifest.json'), 'utf8'));

/** Sizes per tier. Surfaces: Low 512, Medium/High 1K (2K only where listed, to hold the download budget). */
const SURFACE_SIZES = [512, 1024];
const PROP_SIZES = [256, 512];
const FALLBACK = 512;

async function rgbaAt(file, size) {
  const { data, info } = await sharp(file).resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function renormalise(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const x = rgba[i] / 127.5 - 1, y = rgba[i + 1] / 127.5 - 1, z = Math.max(0, rgba[i + 2] / 127.5 - 1), l = Math.hypot(x, y, z) || 1;
    rgba[i] = Math.round((x / l + 1) * 127.5); rgba[i + 1] = Math.round((y / l + 1) * 127.5); rgba[i + 2] = Math.round((z / l + 1) * 127.5);
  }
}

/** A full mip chain, each level resized from the source (no compounding blur). */
async function compressed(file, size, kind) {
  const fmt = kind === 'nor' ? 'bc5' : 'bc1', mips = [];
  for (let s = size; s >= 4; s >>= 1) {
    const { data, w, h } = await rgbaAt(file, s);
    if (kind === 'nor') renormalise(data);
    mips.push(encode(fmt, data, w, h));
  }
  const gl = kind === 'nor' ? GL.bc5 : kind === 'diff' ? GL.bc1srgb : GL.bc1;
  return ktx(gl, size, size, mips);
}

const report = { textures: {}, models: {}, bytes: { low: 0, high: 0, fallback: 0 } };
const written = async (path, buf, tiers) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
  for (const t of tiers) report.bytes[t] += buf.length;
  return buf.length;
};

async function textureSet(id, sources, sizes, outDir) {
  const entry = { sizes, files: {} };
  for (const [kind, src] of Object.entries(sources)) {
    for (const [i, size] of sizes.entries()) {
      const name = `${kind}-${size}.ktx`;
      const n = await written(join(outDir, name), await compressed(src, size, kind), i === 0 ? ['low'] : ['high']);
      entry.files[name] = n;
    }
    const jpg = await sharp(src).resize(FALLBACK, FALLBACK, { kernel: 'lanczos3' }).jpeg({ quality: kind === 'diff' ? 82 : 90, mozjpeg: true }).toBuffer();
    entry.files[`${kind}-${FALLBACK}.jpg`] = await written(join(outDir, `${kind}-${FALLBACK}.jpg`), jpg, ['fallback']);
  }
  report.textures[id] = entry;
}

/** Binary glTF without images: the runtime supplies its own materials, keyed by the source material names. */
function glbWithoutImages(gltf, bin) {
  const g = structuredClone(gltf);
  delete g.images; delete g.textures; delete g.samplers;
  for (const m of g.materials ?? []) {
    delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
  }
  g.buffers = [{ byteLength: bin.length }];
  g.asset = { version: '2.0', generator: 'breachline-assets', copyright: gltf.asset?.copyright };
  const json = Buffer.from(JSON.stringify(g));
  const jpad = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const bpad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jpad.length + 8 + bpad.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4); return b; };
  return Buffer.concat([head, ch(jpad.length, 'JSON'), jpad, ch(bpad.length, 'BIN\0'), bpad]);
}

async function main() {
  await rm(join(OUT, 'tex'), { recursive: true, force: true });
  await rm(join(OUT, 'models'), { recursive: true, force: true });
  for (const a of manifest.assets) {
    const dir = join(CACHE, a.id);
    if (a.kind === 'texture') {
      const src = k => join(CACHE, a.files.find(f => f.path.includes(`_${k}.`)).path);
      await textureSet(a.id, { diff: src('diff'), nor: src('nor_gl'), arm: src('arm') }, SURFACE_SIZES, join(OUT, 'tex', a.id));
    } else {
      const gltf = JSON.parse(await readFile(join(dir, `${a.id}.gltf`), 'utf8'));
      const bin = await readFile(join(dir, gltf.buffers[0].uri));
      const glb = glbWithoutImages(gltf, bin);
      const size = await written(join(OUT, 'models', `${a.id}.glb`), glb, ['low', 'high']);
      // Textures per source material, named after it.
      const mats = [];
      for (const m of gltf.materials) {
        const img = t => (t ? join(dir, gltf.images[gltf.textures[t.index].source].uri) : null);
        const diff = img(m.pbrMetallicRoughness?.baseColorTexture), nor = img(m.normalTexture), arm = img(m.pbrMetallicRoughness?.metallicRoughnessTexture);
        if (!diff || !nor || !arm) throw new Error(`${a.id}/${m.name}: expected diffuse, normal and ARM maps`);
        const key = `${a.id}--${m.name}`;
        await textureSet(key, { diff, nor, arm }, PROP_SIZES, join(OUT, 'tex', key));
        mats.push(m.name);
      }
      report.models[a.id] = { glb: size, materials: mats, triangles: triangles(gltf) };
    }
  }
  report.bytes = Object.fromEntries(Object.entries(report.bytes).map(([k, v]) => [k, v]));
  await writeFile(join(OUT, 'assets.json'), JSON.stringify({ version: 1, ...report }, null, 1) + '\n');
  await notices();
  const mb = v => (v / 1e6).toFixed(2);
  console.log(`low tier ${mb(report.bytes.low)} MB, medium/high extra ${mb(report.bytes.high)} MB, fallback JPEGs ${mb(report.bytes.fallback)} MB`);
}

function triangles(gltf) {
  let n = 0;
  for (const m of gltf.meshes) for (const p of m.primitives) n += (p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count) / 3;
  return n;
}

/** Keeps the Breachline block of public/THIRD_PARTY_NOTICES.txt in step with the manifest. */
async function notices() {
  const path = join(ROOT, 'public', 'THIRD_PARTY_NOTICES.txt');
  const text = await readFile(path, 'utf8');
  const begin = '----- Breachline art (generated by scripts/breachline-assets/build.mjs) -----', end = '----- end of Breachline art -----';
  const lines = [begin, 'Textures and models from Poly Haven (https://polyhaven.com), released under CC0 1.0 Universal', '(https://creativecommons.org/publicdomain/zero/1.0/). Credit is not required; it is given anyway.', ''];
  for (const a of manifest.assets) lines.push(`${a.name} (${a.kind}) by ${a.author}. ${a.source}. License: ${a.licence}.`);
  lines.push(end);
  const block = lines.join('\n');
  const i = text.indexOf(begin), j = text.indexOf(end);
  const next = i >= 0 && j > i ? text.slice(0, i) + block + text.slice(j + end.length) : text.replace(/\s*$/, '\n\n') + block + '\n';
  await writeFile(path, next);
}

main().catch(e => { console.error(e); process.exit(1); });
