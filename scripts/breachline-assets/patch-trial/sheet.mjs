// Sheet composition: rows of equally tall cells with captions, on a dark band, written with sharp.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const text = (w, h, s, size = 22, weight = 600, fill = '#e8e8e8', bg = '#2a2c2e') => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>` +
  `<text x="12" y="${Math.round(h / 2 + size * 0.36)}" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text></svg>`);

/** rows: [{ title, cells: [{ buf, caption }] }]. Cells keep their size; a caption strip sits under each. */
export async function compose(rows, { width, title, out, jpeg = 0 }) {
  const parts = []; let y = 0;
  if (title) { parts.push({ input: text(width, 48, title, 26, 700, '#ffffff', '#1c1d1f'), top: 0, left: 0 }); y = 48; }
  for (const r of rows) {
    if (r.title) { parts.push({ input: text(width, 36, r.title, 20, 700, '#ffd27a'), top: y, left: 0 }); y += 36; }
    let x = 0, hmax = 0;
    for (const c of r.cells) {
      const m = await sharp(c.buf).metadata();
      parts.push({ input: c.buf, top: y, left: x });
      if (c.caption) parts.push({ input: text(m.width, 26, c.caption, 15, 400, '#cfcfcf', '#2a2c2e'), top: y + m.height, left: x });
      x += m.width; hmax = Math.max(hmax, m.height + (c.caption ? 26 : 0));
    }
    y += hmax;
  }
  const img = sharp({ create: { width, height: y, channels: 3, background: '#2a2c2e' } }).composite(parts);
  const buf = jpeg ? await img.jpeg({ quality: jpeg, mozjpeg: true }).toBuffer() : await img.png({ compressionLevel: 9, palette: false }).toBuffer();
  await writeFile(out, buf);
  return { out, bytes: buf.length, height: y };
}
/** Nearest-neighbour enlargement, so a 1:1 game-scale crop stays honest about its pixels. */
export const enlarge = (buf, k) => sharp(buf).metadata().then(m => sharp(buf).resize(m.width * k, m.height * k, { kernel: 'nearest' }).png().toBuffer());
