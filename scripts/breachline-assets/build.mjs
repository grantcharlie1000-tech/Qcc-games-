#!/usr/bin/env node
/** Builds Breachline's shipped art from the fetched sources (run fetch.mjs first).
 *
 * Textures: per tier size, KTX2/Basis Universal (one file for every GPU: the browser transcodes to BC, ETC2 or ASTC):
 * colour as ETC1S with the sRGB transfer function, normals and packed AO/roughness/metal as UASTC with RDO and zstd.
 * Small JPEG fallbacks cover a failed transcoder. Encodes are cached in .cache/ktx2 by source hash and settings.
 * Also writes the same-origin Basis transcoder worker (basis/), because the site's CSP forbids blob: workers.
 * Models: geometry as binary glTF with images stripped; their textures go through the same texture path.
 * Writes public/game-art/breachline/assets.json (what exists, sizes) and the Breachline block of THIRD_PARTY_NOTICES. */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { copyFile, stat } from 'node:fs/promises';
import { encodeToKTX2 } from 'ktx2-encoder';
import { MeshoptSimplifier } from 'meshoptimizer';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CACHE = join(HERE, '.cache');
const OUT = join(ROOT, 'public', 'game-art', 'breachline');
const manifest = JSON.parse(await readFile(join(HERE, 'manifest.json'), 'utf8'));

/** Sizes per tier. Surfaces: Low 512, Medium/High 1K (2K only where listed, to hold the download budget). */
const SURFACE_SIZES = [512, 1024];
const PROP_SIZES = [256, 512];
const FALLBACK = 512;

function renormalise(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const x = rgba[i] / 127.5 - 1, y = rgba[i + 1] / 127.5 - 1, z = Math.max(0, rgba[i + 2] / 127.5 - 1), l = Math.hypot(x, y, z) || 1;
    rgba[i] = Math.round((x / l + 1) * 127.5); rgba[i + 1] = Math.round((y / l + 1) * 127.5); rgba[i + 2] = Math.round((z / l + 1) * 127.5);
  }
}

/** Encoder settings per map kind. Bump ENCODE_VERSION when these change, to invalidate the cache. */
const ENCODE_VERSION = 1;
const SETTINGS = {
  diff: { isUASTC: false, qualityLevel: 160, compressionLevel: 2, isSetKTX2SRGBTransferFunc: true, isPerceptual: true },
  nor: { isUASTC: true, isNormalMap: true, isPerceptual: false, uastcLDRQualityLevel: 1, enableRDO: true, rdoQualityLevel: 1.5, needSupercompression: true },
  arm: { isUASTC: true, isPerceptual: false, uastcLDRQualityLevel: 1, enableRDO: true, rdoQualityLevel: 3, needSupercompression: true },
};
const exists = p => stat(p).then(() => true, () => false);
const imageDecoder = async buf => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };

async function compressed(file, size, kind) {
  const src = await readFile(file);
  const key = createHash('sha256').update(src).update(JSON.stringify([ENCODE_VERSION, size, kind, SETTINGS[kind]])).digest('hex').slice(0, 24);
  const cached = join(CACHE, 'ktx2', `${key}.ktx2`);
  if (await exists(cached)) return readFile(cached);
  const { data, info } = await sharp(src).resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (kind === 'nor') renormalise(data);
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  // Quiet the encoder's per-slice progress lines.
  const log = console.log; console.log = () => {};
  let out;
  try { out = Buffer.from(await encodeToKTX2(new Uint8Array(png), { ...SETTINGS[kind], generateMipmap: true, isKTX2File: true, imageDecoder })); }
  finally { console.log = log; }
  await mkdir(dirname(cached), { recursive: true });
  await writeFile(cached, out);
  return out;
}

const NO_EVAL_INVOKER = `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){
  var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!")}
  var isClassMethodFunc=argTypes[1]!==null&&classType!==null,needsDestructorStack=usesDestructorStack(argTypes),returns=argTypes[0].name!=="void",expected=argCount-2;
  var invokerFn=function(...args){
    if(args.length!==expected){throwBindingError("function "+humanName+" called with "+args.length+" arguments, expected "+expected)}
    var destructors=needsDestructorStack?[]:null,wired=[],thisWired;
    if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this);wired.push(thisWired)}
    for(var i=0;i<expected;++i){wired.push(argTypes[i+2].toWireType(destructors,args[i]))}
    var rv=cppInvokerFunc(cppTargetFunc,...wired);
    if(needsDestructorStack){runDestructors(destructors)}else{
      for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(i===1?thisWired:wired[isClassMethodFunc?i-1:i-2])}}
    }
    if(returns){return argTypes[0].fromWireType(rv)}
  };
  return createNamedFunction(humanName,invokerFn)}`;

const NO_EVAL_METHOD_CALLER = `var __emval_get_method_caller=(argCount,argTypes,kind)=>{
  var types=emval_lookupTypes(argCount,argTypes);var retType=types.shift();argCount--;
  var invokerFunction=function(obj,func,destructorsRef,args){
    var offset=0,list=[];
    for(var i=0;i<argCount;++i){list.push(types[i].readValueFromPointer(args+offset));offset+=types[i]["argPackAdvance"]}
    var rv=kind===1?new func(...list):func.call(obj,...list);
    if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}
  };
  var functionName=\`methodCaller<(\${types.map(t=>t.name).join(", ")}) => \${retType.name}>\`;
  return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))};`;

/** The worker three's KTX2Loader would build as a blob: URL, written as a same-origin file instead. */
async function transcoderWorker() {
  const dir = join(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis'), out = join(OUT, 'basis');
  await mkdir(out, { recursive: true });
  const fn = KTX2Loader.BasisWorker.toString();
  let js = await readFile(join(dir, 'basis_transcoder.js'), 'utf8');
  // Embind builds each C++ binding's JavaScript wrapper with new Function, which needs 'unsafe-eval'; the site allows
  // only 'wasm-unsafe-eval'. Swap in the equivalent closure (what Emscripten emits for DYNAMIC_EXECUTION=0).
  const start = js.indexOf('function craftInvokerFunction('), endMark = 'return createNamedFunction(humanName,invokerFn)}';
  const end = js.indexOf(endMark, start);
  if (start < 0 || end < 0) throw new Error('basis_transcoder.js changed: update the no-eval invoker patch');
  js = js.slice(0, start) + NO_EVAL_INVOKER + js.slice(end + endMark.length);
  // The same for emval's method callers (used when the transcoder constructs a KTX2File).
  const m0 = js.indexOf('var __emval_get_method_caller='), mEnd = 'return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))};';
  const m1 = js.indexOf(mEnd, m0);
  if (m0 < 0 || m1 < 0) throw new Error('basis_transcoder.js changed: update the no-eval method-caller patch');
  js = js.slice(0, m0) + NO_EVAL_METHOD_CALLER + js.slice(m1 + mEnd.length);
  if (/newFunc\(Function/.test(js)) throw new Error('no-eval patches did not remove every new Function');
  const body = [
    '/* Generated by scripts/breachline-assets/build.mjs from three r180 KTX2Loader and its Basis transcoder (Apache-2.0). */',
    'let _EngineFormat = ' + JSON.stringify(KTX2Loader.EngineFormat),
    'let _EngineType = ' + JSON.stringify(KTX2Loader.EngineType),
    'let _TranscoderFormat = ' + JSON.stringify(KTX2Loader.TranscoderFormat),
    'let _BasisFormat = ' + JSON.stringify(KTX2Loader.BasisFormat),
    js,
    fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}')),
  ].join('\n');
  await writeFile(join(out, 'ktx2-worker.js'), body);
  await copyFile(join(dir, 'basis_transcoder.wasm'), join(out, 'basis_transcoder.wasm'));
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
      const name = `${kind}-${size}.ktx2`;
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
  await transcoderWorker();
  await rm(join(OUT, 'tex'), { recursive: true, force: true });
  await rm(join(OUT, 'models'), { recursive: true, force: true });
  for (const a of manifest.assets) {
    const dir = join(CACHE, a.id);
    if (a.kind === 'texture' && a.provider === 'ambientcg') {
      // ambientCG ships separate maps: pack AO/roughness/metal into one ARM image, as Poly Haven does.
      const base = join(dir, a.files[0].path.split('/').pop().replace(/\.zip$/, ''));
      const map = k => `${base}_${k}.jpg`;
      const arm = join(dir, 'arm-packed.png');
      if (!(await exists(arm))) {
        const grey = async (k, fill) => (await exists(map(k))) ? sharp(map(k)).greyscale().raw().toBuffer({ resolveWithObject: true }) : null;
        const ao = await grey('AmbientOcclusion'), ro = await grey('Roughness'), me = await grey('Metalness');
        const { width, height } = (ao ?? ro).info, px = Buffer.alloc(width * height * 3);
        for (let i = 0; i < width * height; i++) { px[i * 3] = ao ? ao.data[i] : 255; px[i * 3 + 1] = ro ? ro.data[i] : 200; px[i * 3 + 2] = me ? me.data[i] : 0; }
        await sharp(px, { raw: { width, height, channels: 3 } }).png().toFile(arm);
      }
      await textureSet(a.id, { diff: map('Color'), nor: map('NormalGL'), arm }, SURFACE_SIZES, join(OUT, 'tex', a.id));
    } else if (a.kind === 'texture') {
      const src = k => join(CACHE, a.files.find(f => f.path.includes(`_${k}.`)).path);
      await textureSet(a.id, { diff: src('diff'), nor: src('nor_gl'), arm: src('arm') }, SURFACE_SIZES, join(OUT, 'tex', a.id));
    } else {
      const gltf = JSON.parse(await readFile(join(dir, `${a.id}.gltf`), 'utf8'));
      const bin = await readFile(join(dir, gltf.buffers[0].uri));
      const glb = glbWithoutImages(gltf, bin);
      const size = await written(join(OUT, 'models', `${a.id}.glb`), glb, ['low', 'high']);
      // A far level at about 30 % of the triangles, used beyond a few metres and on the throttled tier.
      const lod = await simplified(gltf, bin, 0.3);
      const lodSize = await written(join(OUT, 'models', `${a.id}.lod1.glb`), glbWithoutImages(lod.gltf, lod.bin), ['low', 'high']);
      // Dressing drawn by the hundred (archive boxes) also gets a crude level: borders free, a few hundred triangles.
      let lod2Triangles;
      if (a.lod2) {
        const crude = await simplified(gltf, bin, a.lod2, false, 0.2);
        await written(join(OUT, 'models', `${a.id}.lod2.glb`), glbWithoutImages(crude.gltf, crude.bin), ['low', 'high']);
        lod2Triangles = triangles(crude.gltf);
      }
      // Textures per source material, named after it.
      const mats = [];
      for (const m of gltf.materials) {
        const img = t => (t ? join(dir, gltf.images[gltf.textures[t.index].source].uri) : null);
        const diff = img(m.pbrMetallicRoughness?.baseColorTexture), nor = img(m.normalTexture), arm = img(m.pbrMetallicRoughness?.metallicRoughnessTexture);
        if (!diff || !nor || !arm) throw new Error(`${a.id}/${m.name}: expected diffuse, normal and ARM maps`);
        const key = `${a.id}--${m.name}`;
        // A colour map turned to normalised grey, so one texture set serves every colour by per-instance tint.
        let base = diff;
        if (a.greyscale?.includes(m.name)) { base = join(dir, `${m.name}-grey.png`); if (!(await exists(base))) await sharp(diff).greyscale().normalise({ lower: 2, upper: 80 }).linear(0.7, 95).png().toFile(base); }
        await textureSet(key, { diff: base, nor, arm }, PROP_SIZES, join(OUT, 'tex', key));
        mats.push(m.name);
      }
      report.models[a.id] = { glb: size, lod1: lodSize, materials: mats, triangles: triangles(gltf), lod1Triangles: triangles(lod.gltf), lod2Triangles };
    }
  }
  report.bytes = Object.fromEntries(Object.entries(report.bytes).map(([k, v]) => [k, v]));
  await writeFile(join(OUT, 'assets.json'), JSON.stringify({ version: 1, ...report }, null, 1) + '\n');
  await notices();
  const mb = v => (v / 1e6).toFixed(2);
  console.log(`low tier ${mb(report.bytes.low)} MB, medium/high extra ${mb(report.bytes.high)} MB, fallback JPEGs ${mb(report.bytes.fallback)} MB`);
}

/** A lower level of detail: every indexed primitive simplified to `ratio` of its triangles (meshoptimizer, borders
 * locked so UV seams and open edges hold). New index buffers are appended to the binary. */
async function simplified(gltf, bin, ratio, lockBorder = true, error = 0.02) {
  await MeshoptSimplifier.ready;
  const g = structuredClone(gltf), extra = [];
  let offset = bin.length;
  const view = i => g.bufferViews[g.accessors[i].bufferView];
  for (const mesh of g.meshes) for (const p of mesh.primitives) {
    if (p.indices === undefined) continue;
    const pa = g.accessors[p.attributes.POSITION], pv = view(p.attributes.POSITION), stride = pv.byteStride || 12;
    const pos = new Float32Array(pa.count * 3);
    for (let k = 0; k < pa.count; k++) for (let c = 0; c < 3; c++) pos[k * 3 + c] = bin.readFloatLE((pv.byteOffset ?? 0) + (pa.byteOffset ?? 0) + k * stride + c * 4);
    const ia = g.accessors[p.indices], iv = view(p.indices), size = ia.componentType === 5125 ? 4 : ia.componentType === 5123 ? 2 : 1;
    const idx = new Uint32Array(ia.count);
    for (let k = 0; k < ia.count; k++) { const at = (iv.byteOffset ?? 0) + (ia.byteOffset ?? 0) + k * size; idx[k] = size === 4 ? bin.readUInt32LE(at) : size === 2 ? bin.readUInt16LE(at) : bin.readUInt8(at); }
    const target = Math.max(3, Math.floor(idx.length * ratio / 3) * 3);
    const [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, error, lockBorder ? ['LockBorder'] : []);
    const buf = Buffer.from(out.buffer, out.byteOffset, out.byteLength), pad = (4 - (offset % 4)) % 4;
    if (pad) { extra.push(Buffer.alloc(pad)); offset += pad; }
    g.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target: 34963 });
    g.accessors.push({ bufferView: g.bufferViews.length - 1, componentType: 5125, count: out.length, type: 'SCALAR' });
    p.indices = g.accessors.length - 1;
    extra.push(buf); offset += buf.length;
  }
  return { gltf: g, bin: Buffer.concat([bin, ...extra]) };
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
  const lines = [begin, 'Textures and models from Poly Haven (https://polyhaven.com) and ambientCG (https://ambientcg.com), released under CC0 1.0 Universal', '(https://creativecommons.org/publicdomain/zero/1.0/). Credit is not required; it is given anyway.', ''];
  for (const a of manifest.assets) {
    if (a.credit) lines.push(`${a.credit}${a.changes ? ` ${a.changes}` : ''}`);
    else lines.push(`${a.name} (${a.kind}) by ${a.author}. ${a.source}. License: ${a.licence}.`);
  }
  lines.push('', 'Basis Universal transcoder (basis_transcoder.js and .wasm, as distributed with three.js r180), by Binomial LLC.',
    'License: Apache-2.0 (full text above in this file). Modified: public/game-art/breachline/basis/ktx2-worker.js wraps it',
    'with three.js\'s KTX2Loader worker, and its embind glue builds function wrappers with closures instead of new Function,',
    'so it runs without \'unsafe-eval\'. The .wasm is unmodified.');
  lines.push(end);
  const block = lines.join('\n');
  const i = text.indexOf(begin), j = text.indexOf(end);
  const next = i >= 0 && j > i ? text.slice(0, i) + block + text.slice(j + end.length) : text.replace(/\s*$/, '\n\n') + block + '\n';
  await writeFile(path, next);
}

main().catch(e => { console.error(e); process.exit(1); });
