// Renders the QCC Games app icon: a square, opaque wrapper around the poster engine's projection.
//   node scripts/posters/render-icon.mjs   (needs scripts/posters/engine.mjs from the production branch)
// Writes public/app-icon.svg and the PNG icons into public/, plus review sheets into the scratch folder given as
// the first argument (default: the system temp folder).
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as engine from './engine.mjs';
import model from './models/app-icon.mjs';
const sharp = createRequire(import.meta.url)('sharp');
import {tmpdir} from 'node:os';
const here = new URL('../../public/', import.meta.url);
const review = new URL(`file://${process.argv[2] || tmpdir()}/`);
const S = 1024, BG = process.env.BG ?? '#4a2a7a', MARGIN = Number(process.env.MARGIN ?? .12);
const TITLE = 'A white voxel game controller in front of a film clapperboard with its striped arm raised';
const r1 = v => (+v).toFixed(1).replace(/\.0$/, '');

const scene = new engine.Scene();
const bg = scene.bg = BG;
model(scene, engine);
const m = S * MARGIN, out = engine.render(scene, {x0: m, x1: S - m, y0: m, y1: S - m});
// The engine biases the model downwards in its fit box; recentre the bounding box on the square.
const dx = S / 2 - (out.box[0] + out.box[2]) / 2, dy = S / 2 - (out.box[1] + out.box[3]) / 2 + Number(process.env.DY ?? 0);
const disc = (r, c) => `<circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="${c}"/>`;
const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" role="img" aria-labelledby="title desc">` +
  `<title id="title">${TITLE}</title><desc id="desc">Original Pocket Arcade voxel app icon, rendered with the lit voxel poster engine.</desc>` +
  `<path fill="${bg}" d="M0 0h${S}v${S}H0Z"/>` + disc(S * .47, engine.shift(bg, 2.5, 2)) + disc(S * .36, engine.shift(bg, 5, 3)) +
  (process.env.GUIDE ? `<circle cx="512" cy="512" r="${S * .4}" fill="none" stroke="#f0f" stroke-width="3"/>` : '') +
  `<g transform="translate(${r1(dx)} ${r1(dy)})">${out.svg}</g></svg>\n`;
await writeFile(new URL('app-icon.svg', here), svg);
const png = size => sharp(Buffer.from(svg), {density: 72 * Math.max(1, size / 256)}).resize(size, size, {kernel: 'lanczos3'}).flatten({background: bg}).removeAlpha().toColourspace('srgb').png({compressionLevel: 9});
const SIZES = {'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180};
for (const [name, size] of Object.entries(SIZES)) await png(size).toFile(new URL(name, here).pathname);

// sizes.png: the icon at Home Screen sizes under an iOS-like corner mask, on a dark wallpaper.
const master = await png(1024).toBuffer();
const masked = async size => {
  const r = size * .2237;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`);
  return sharp(await sharp(master).resize(size, size, {kernel: 'lanczos3'}).toBuffer()).ensureAlpha().composite([{input: mask, blend: 'dest-in'}]).png().toBuffer();
};
const row = [180, 120, 60, 40]; let x = 40; const comps = [];
for (const size of row) { comps.push({input: await masked(size), left: x, top: 40 + (180 - size)}); x += size + 40; }
// 2x zooms of the two smallest (nearest neighbour), to inspect what survives.
for (const size of [60, 40]) { comps.push({input: await sharp(await masked(size)).resize(size * 3, size * 3, {kernel: 'nearest'}).toBuffer(), left: x, top: 40 + 180 - size * 3}); x += size * 3 + 40; }
const wall = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="260"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2140"/><stop offset="1" stop-color="#3a1f4d"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
await sharp(wall).composite(comps).removeAlpha().png().toFile(new URL('sizes.png', review).pathname);

// style-compare.png: the 1024 icon beside two live posters at the same height.
const art = new URL('../../public/game-art/', import.meta.url).pathname;
const posters = await Promise.all(['blockcraft', 'crossy-road'].map(id => sharp(art + id + '/cover.svg', {density: 72 * 1024 / 410}).resize(799, 1024).png().toBuffer()));
await sharp({create: {width: 1024 + 2 * (799 + 16), height: 1024, channels: 3, background: '#111111'}})
  .composite([{input: master, left: 0, top: 0}, ...posters.map((input, i) => ({input, left: 1024 + 16 + i * (799 + 16), top: 0}))]).png().toFile(new URL('style-compare.png', review).pathname);
console.log(svg.length, 'bytes', out.voxels, 'voxels, scale', out.a.toFixed(2), 'box', out.box.map(v => Math.round(v)).join(' '));
