// KTX2 encoding with the same settings as scripts/breachline-assets/build.mjs (copied, not imported: that script
// runs its whole build on import). Keep in step with its SETTINGS if those change.
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

export const SETTINGS = {
  diff: { isUASTC: false, qualityLevel: 160, compressionLevel: 2, isSetKTX2SRGBTransferFunc: true, isPerceptual: true },
  nor: { isUASTC: true, isNormalMap: true, isPerceptual: false, uastcLDRQualityLevel: 1, enableRDO: true, rdoQualityLevel: 1.5, needSupercompression: true },
  arm: { isUASTC: true, isPerceptual: false, uastcLDRQualityLevel: 1, enableRDO: true, rdoQualityLevel: 3, needSupercompression: true },
  // Not in build.mjs: a linear single-channel mask, ETC1S like colour but without the sRGB transfer function.
  mask: { isUASTC: false, qualityLevel: 160, compressionLevel: 2, isSetKTX2SRGBTransferFunc: false, isPerceptual: false },
};
const imageDecoder = async buf => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
function renormalise(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const x = rgba[i] / 127.5 - 1, y = rgba[i + 1] / 127.5 - 1, z = Math.max(0, rgba[i + 2] / 127.5 - 1), l = Math.hypot(x, y, z) || 1;
    rgba[i] = Math.round((x / l + 1) * 127.5); rgba[i + 1] = Math.round((y / l + 1) * 127.5); rgba[i + 2] = Math.round((z / l + 1) * 127.5);
  }
}
/** `src`: any image buffer sharp reads. Returns the KTX2 file (mipmapped) at size x size. */
export async function ktx2(src, size, kind) {
  const { data, info } = await sharp(src).resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (kind === 'nor') renormalise(data);
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const log = console.log; console.log = () => {};
  try { return Buffer.from(await encodeToKTX2(new Uint8Array(png), { ...SETTINGS[kind], generateMipmap: true, isKTX2File: true, imageDecoder })); }
  finally { console.log = log; }
}
export const jpeg = (src, size, q = 85) => sharp(src).resize(size, size, { kernel: 'lanczos3' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
