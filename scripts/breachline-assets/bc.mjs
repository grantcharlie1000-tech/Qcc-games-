/** Block-compression encoders (BC1, BC4, BC5) and a KTX 1.1 writer, in plain JavaScript.
 *
 * The site's Content-Security-Policy blocks WebAssembly, so Basis/KTX2 cannot be transcoded in the browser. These
 * formats need no decoder at all: the GPU reads them directly (WEBGL_compressed_texture_s3tc / _rgtc, present on
 * every x86 Chromebook and desktop GPU). three's KTXLoader reads the container. Deterministic: same input, same bytes. */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const to565 = (r, g, b) => ((clamp(Math.round(r * 31 / 255), 0, 31) << 11) | (clamp(Math.round(g * 63 / 255), 0, 63) << 5) | clamp(Math.round(b * 31 / 255), 0, 31));
const from565 = c => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];

/** One 4x4 colour block (16 RGB triples, 0-255) → 8 bytes of BC1, opaque four-colour mode. */
function bc1Block(px, out, o) {
  // Principal axis by power iteration on the covariance, then endpoints at the extremes of the projection.
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < 16; i++) { mr += px[i * 3]; mg += px[i * 3 + 1]; mb += px[i * 3 + 2]; }
  mr /= 16; mg /= 16; mb /= 16;
  let crr = 0, crg = 0, crb = 0, cgg = 0, cgb = 0, cbb = 0;
  for (let i = 0; i < 16; i++) {
    const r = px[i * 3] - mr, g = px[i * 3 + 1] - mg, b = px[i * 3 + 2] - mb;
    crr += r * r; crg += r * g; crb += r * b; cgg += g * g; cgb += g * b; cbb += b * b;
  }
  let ar = 0.9, ag = 1, ab = 0.7;
  for (let k = 0; k < 6; k++) {
    const nr = crr * ar + crg * ag + crb * ab, ng = crg * ar + cgg * ag + cgb * ab, nb = crb * ar + cgb * ag + cbb * ab;
    const l = Math.hypot(nr, ng, nb);
    if (l < 1e-9) break;
    ar = nr / l; ag = ng / l; ab = nb / l;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 16; i++) {
    const t = (px[i * 3] - mr) * ar + (px[i * 3 + 1] - mg) * ag + (px[i * 3 + 2] - mb) * ab;
    if (t < lo) lo = t; if (t > hi) hi = t;
  }
  // Inset slightly, as range-fit encoders do, so the interpolated colours land on the data.
  const inset = (hi - lo) / 32;
  lo += inset; hi -= inset;
  let c0 = to565(mr + ar * hi, mg + ag * hi, mb + ab * hi), c1 = to565(mr + ar * lo, mg + ag * lo, mb + ab * lo);
  if (c0 < c1) [c0, c1] = [c1, c0];
  if (c0 === c1) {
    out[o] = c0 & 255; out[o + 1] = c0 >> 8; out[o + 2] = c1 & 255; out[o + 3] = c1 >> 8;
    out[o + 4] = out[o + 5] = out[o + 6] = out[o + 7] = 0;
    return;
  }
  const e0 = from565(c0), e1 = from565(c1);
  const pal = [e0, e1, e0.map((v, i) => (2 * v + e1[i]) / 3), e0.map((v, i) => (v + 2 * e1[i]) / 3)];
  let bits = 0;
  for (let i = 15; i >= 0; i--) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < 4; k++) {
      const dr = px[i * 3] - pal[k][0], dg = px[i * 3 + 1] - pal[k][1], db = px[i * 3 + 2] - pal[k][2], d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (d < bd) { bd = d; best = k; }
    }
    bits = (bits << 2) | best;
  }
  out[o] = c0 & 255; out[o + 1] = c0 >> 8; out[o + 2] = c1 & 255; out[o + 3] = c1 >> 8;
  out[o + 4] = bits & 255; out[o + 5] = (bits >>> 8) & 255; out[o + 6] = (bits >>> 16) & 255; out[o + 7] = (bits >>> 24) & 255;
}

/** One channel of a 4x4 block (16 values, 0-255) → 8 bytes of BC4, eight-value mode. */
function bc4Block(v, out, o) {
  let lo = 255, hi = 0;
  for (let i = 0; i < 16; i++) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
  out[o] = hi; out[o + 1] = lo;
  // With a0 > a1: index 0 = a0, 1 = a1, 2..7 = (6-k... ) interpolations from a0 towards a1.
  const pal = [hi, lo];
  for (let k = 1; k <= 6; k++) pal.push(((7 - k) * hi + k * lo) / 7);
  let bits = 0n;
  for (let i = 0; i < 16; i++) {
    let best = 0, bd = Infinity;
    if (hi !== lo) for (let k = 0; k < 8; k++) { const d = Math.abs(v[i] - pal[k]); if (d < bd) { bd = d; best = k; } }
    bits |= BigInt(best) << BigInt(3 * i);
  }
  for (let k = 0; k < 6; k++) out[o + 2 + k] = Number((bits >> BigInt(8 * k)) & 255n);
}

/** Encodes one mip level. `rgba` is width*height*4 bytes. */
export function encode(format, rgba, w, h) {
  const bw = Math.max(1, Math.ceil(w / 4)), bh = Math.max(1, Math.ceil(h / 4));
  const per = format === 'bc5' ? 16 : 8, out = new Uint8Array(bw * bh * per);
  const px = new Float64Array(48), ch = new Float64Array(16), ch2 = new Float64Array(16);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = Math.min(w - 1, bx * 4 + i), y = Math.min(h - 1, by * 4 + j), s = (y * w + x) * 4, d = j * 4 + i;
      px[d * 3] = rgba[s]; px[d * 3 + 1] = rgba[s + 1]; px[d * 3 + 2] = rgba[s + 2];
      ch[d] = rgba[s]; ch2[d] = rgba[s + 1];
    }
    const o = (by * bw + bx) * per;
    if (format === 'bc1') bc1Block(px, out, o);
    else if (format === 'bc4') bc4Block(ch, out, o);
    else { bc4Block(ch, out, o); bc4Block(ch2, out, o + 8); }
  }
  return out;
}

/** GL internal formats; three's compressed format constants use the same numbers. */
export const GL = { bc1: 0x83f0, bc1srgb: 0x8c4c, bc4: 0x8dbb, bc5: 0x8dbd };

/** KTX 1.1 container: https://registry.khronos.org/KTX/specs/1.0/ktxspec.v1.html */
export function ktx(glInternalFormat, width, height, mips) {
  const head = Buffer.alloc(64);
  Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  const fields = [0x04030201, 0, 1, 0, glInternalFormat, 0, width, height, 0, 0, 1, mips.length, 0];
  fields.forEach((v, i) => head.writeUInt32LE(v, 12 + i * 4));
  const parts = [head];
  for (const m of mips) {
    const size = Buffer.alloc(4); size.writeUInt32LE(m.length, 0);
    parts.push(size, Buffer.from(m.buffer, m.byteOffset, m.length));
    const pad = (4 - (m.length % 4)) % 4;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  return Buffer.concat(parts);
}
