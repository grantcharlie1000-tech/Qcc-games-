/** Writes a texture set (albedo; tangent-space normal; occlusion, roughness, metalness) as PNG masters in .cache,
 * KTX2 at each size (cached by content and settings) and 512 px JPEG fallbacks,
 * into public/game-art/breachline/hero/<dir>/. ETC1S throughout (see SETTINGS). */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const SETTINGS = {
  diff: { isUASTC: false, qualityLevel: 160, compressionLevel: 2, isSetKTX2SRGBTransferFunc: true, isPerceptual: true },
  // ETC1S for the data maps too: UASTC at 2048 is about 2 MB a map even with RDO, and the weapons and hands have 12 MB
  // between them. The normal-map flag only tunes the encoder (linear metrics, no selector RDO); channels stay RGB.
  nor: { isUASTC: false, isNormalMap: true, isPerceptual: false, qualityLevel: 230, compressionLevel: 2 },
  arm: { isUASTC: false, isPerceptual: false, qualityLevel: 160, compressionLevel: 2 },
} as const;
const imageDecoder = async (buf: Uint8Array) => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };

export async function writeSet(root: string, dir: string, S: number, maps: Record<'diff' | 'nor' | 'arm', Buffer>, sizes: number[], preview = true): Promise<number> {
  const out = join(root, 'public/game-art/breachline/hero', dir), cache = join(root, '.cache/hero', dir);
  await mkdir(out, { recursive: true }); await mkdir(cache, { recursive: true });
  let bytes = 0;
  for (const kind of ['diff', 'nor', 'arm'] as const) {
    const master = await sharp(maps[kind], { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();
    await writeFile(join(cache, `${kind}-${S}.png`), master);
    for (const size of sizes) {
      const png = size === S ? master : await sharp(master).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
      const key = createHash('sha256').update(png).update(kind).update(JSON.stringify(SETTINGS[kind])).digest('hex').slice(0, 20), cached = join(cache, `${kind}-${size}-${key}.ktx2`);
      let ktx: Buffer;
      try { await stat(cached); ktx = await readFile(cached); } catch {
        const log = console.log; console.log = () => {};
        try { ktx = Buffer.from(await encodeToKTX2(new Uint8Array(png), { ...SETTINGS[kind], generateMipmap: true, isKTX2File: true, imageDecoder } as never)); } finally { console.log = log; }
        await writeFile(cached, ktx);
      }
      await writeFile(join(out, `${kind}-${size}.ktx2`), ktx); bytes += ktx.length;
    }
    const jpg = await sharp(master).resize(512, 512).jpeg({ quality: 88 }).toBuffer();
    await writeFile(join(out, `${kind}-512.jpg`), jpg); bytes += jpg.length;
    if (preview) await sharp(master).resize(1024, 1024).jpeg({ quality: 80 }).toFile(join(cache, `preview-${kind}.jpg`));
  }
  return bytes;
}
