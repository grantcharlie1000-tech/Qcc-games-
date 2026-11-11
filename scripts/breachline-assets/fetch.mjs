#!/usr/bin/env node
/** Downloads Breachline's external source assets into scripts/breachline-assets/.cache, by manifest.
 *
 *   node scripts/breachline-assets/fetch.mjs            fetch what is missing, verify every hash
 *   node scripts/breachline-assets/fetch.mjs --add ID   add a Poly Haven asset (CC0) to the manifest, then fetch
 *   node scripts/breachline-assets/fetch.mjs --add-acg ID   add an ambientCG material (CC0), 2K JPEG set
 *
 * Only Poly Haven and ambientCG assets can be added this way, because both publish everything as CC0. Anything else must be
 * added to manifest.json by hand with its source, author and licence, and only after the owner agrees to non-CC0. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const MANIFEST = join(HERE, 'manifest.json');
const API = 'https://api.polyhaven.com';
/** Source resolution: 2K is the largest shipped size, so nothing bigger is downloaded. */
const TEX_RES = '2k', MODEL_RES = '1k';

const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const exists = p => stat(p).then(() => true, () => false);
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise(res => setTimeout(res, 2000 * 2 ** attempt));
    }
  }
}
const json = async url => JSON.parse((await get(url)).toString('utf8'));

/** Builds a manifest entry for a Poly Haven texture set or model. Hashes are filled in on first download. */
async function describe(id) {
  const [info, files] = await Promise.all([json(`${API}/info/${id}`), json(`${API}/files/${id}`)]);
  if (info.type !== 1 && info.type !== 2) throw new Error(`${id}: only textures and models are supported`);
  const authors = Object.keys(info.authors ?? {}).join(', ');
  const out = [];
  if (info.type === 1) {
    for (const [map, key] of [['diff', 'Diffuse'], ['nor_gl', 'nor_gl'], ['arm', 'arm']]) {
      const f = files[key]?.[TEX_RES]?.jpg ?? files[key]?.[TEX_RES]?.png;
      if (!f) throw new Error(`${id}: no ${key} at ${TEX_RES}`);
      out.push({ path: `${id}/${id}_${map}.${f.url.split('.').pop()}`, url: f.url, size: f.size, sha256: null });
    }
  } else {
    const g = files.gltf[MODEL_RES].gltf;
    out.push({ path: `${id}/${id}.gltf`, url: g.url, size: g.size, sha256: null });
    for (const [name, f] of Object.entries(g.include)) out.push({ path: `${id}/${name}`, url: f.url, size: f.size, sha256: null });
  }
  return {
    id, kind: info.type === 1 ? 'texture' : 'model', name: info.name,
    source: `https://polyhaven.com/a/${id}`, author: authors, licence: 'CC0-1.0',
    // Real-world size in metres, from Poly Haven (textures: the area one tile covers).
    dimensions: info.dimensions ? info.dimensions.map(v => +(v / 1000).toFixed(4)) : null,
    files: out, use: '',
  };
}

/** An ambientCG material: one zip of maps, extracted beside it on fetch. */
async function describeAcg(id) {
  const d = await json(`https://ambientcg.com/api/v2/full_json?id=${encodeURIComponent(id)}&include=downloadData,dimensionsData`);
  const a = d.foundAssets?.[0];
  if (!a) throw new Error(`${id}: not found on ambientCG`);
  let zip = null;
  for (const f of Object.values(a.downloadFolders)) for (const c of Object.values(f.downloadFiletypeCategories)) for (const x of c.downloads) if (x.attribute === '2K-JPG') zip = x;
  if (!zip) throw new Error(`${id}: no 2K-JPG download`);
  return {
    id, kind: 'texture', name: a.displayName, source: a.shortLink ?? `https://ambientcg.com/a/${id}`, author: 'ambientCG (Lennart Demes)', licence: 'CC0-1.0',
    dimensions: a.dimensionX ? [a.dimensionX / 100, a.dimensionY / 100] : null, provider: 'ambientcg',
    files: [{ path: `${id}/${id}_2K-JPG.zip`, url: zip.fullDownloadPath, size: zip.size, sha256: null }], use: '',
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const acg = process.argv.indexOf('--add-acg');
  if (acg >= 0) {
    for (const id of process.argv.slice(acg + 1)) {
      if (manifest.assets.some(a => a.id === id)) { console.log(`${id}: already listed`); continue; }
      manifest.assets.push(await describeAcg(id));
      console.log(`${id}: added`);
    }
  }
  const add = process.argv.indexOf('--add');
  if (add >= 0) {
    for (const id of process.argv.slice(add + 1)) {
      if (manifest.assets.some(a => a.id === id)) { console.log(`${id}: already listed`); continue; }
      manifest.assets.push(await describe(id));
      console.log(`${id}: added`);
    }
  }
  let fetched = 0, bytes = 0;
  for (const a of manifest.assets) {
    if (a.licence !== 'CC0-1.0' && !a.ownerApproved) throw new Error(`${a.id}: licence ${a.licence} needs the owner's approval`);
    for (const f of a.files) {
      const dest = join(CACHE, f.path);
      let buf = (await exists(dest)) ? await readFile(dest) : null;
      if (!buf) { buf = await get(f.url); await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, buf); fetched++; }
      const h = sha256(buf);
      if (f.sha256 && f.sha256 !== h) throw new Error(`${f.path}: hash mismatch (have ${h}, manifest ${f.sha256})`);
      f.sha256 = h; f.size = buf.length; bytes += buf.length;
      if (dest.endsWith('.zip')) execFileSync('unzip', ['-o', '-q', dest, '-d', dirname(dest)]);
    }
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${manifest.assets.length} assets, ${fetched} files downloaded, ${(bytes / 1e6).toFixed(1)} MB of sources verified`);
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
