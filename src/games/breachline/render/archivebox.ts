/** The archive box, built in code (our own design) and drawn instanced on the Archive's shelving: a cardboard front
 * with bevelled edges, the lid's line, a punched hand-hole and a label holder, plus four label variants (two printed,
 * two hand-written) on one small canvas atlas. The shelving's solid box is the volume, so each box is its front: a
 * slab a few centimetres deep, scaled in depth per box. Unit depth here; width 0.32 m, height 0.26 m. */
import * as THREE from 'three';

export const BOX_W = 0.32, BOX_H = 0.26;
type V3 = [number, number, number];

/** Body geometry: front (z = 1), the four sides back to z = 0, a chamfer round the front, a dark lid groove and a
 * recessed hand-hole. Vertex colours shade the details; UVs are in metres for the cardboard set. */
export function archiveBoxGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const W = BOX_W / 2, H = BOX_H, B = 0.008, TILE = 0.6;
  const quad = (a: V3, b: V3, c: V3, d: V3, n: V3, shade: V3 = [1, 1, 1], uvOf: (p: V3) => [number, number] = p => [p[0] / TILE, p[1] / TILE]) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) { pos.push(...p); nor.push(...n); col.push(...shade); uv.push(...uvOf(p)); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const zf = 1, zb = 1 - 0.02;
  // Front, inset by the chamfer.
  quad([-W + B, B, zf], [W - B, B, zf], [W - B, H - B, zf], [-W + B, H - B, zf], [0, 0, 1]);
  // Chamfers (the front edge rounded off), slightly darker where the cardboard is crushed.
  const ch: V3 = [0.85, 0.83, 0.8], s = Math.SQRT1_2;
  quad([-W, 0, zb], [W, 0, zb], [W - B, B, zf], [-W + B, B, zf], [0, -s, s], ch);
  quad([-W + B, H - B, zf], [W - B, H - B, zf], [W, H, zb], [-W, H, zb], [0, s, s], ch);
  quad([-W, H, zb], [-W, 0, zb], [-W + B, B, zf], [-W + B, H - B, zf], [-s, 0, s], ch);
  quad([W, 0, zb], [W, H, zb], [W - B, H - B, zf], [W - B, B, zf], [s, 0, s], ch);
  // Sides back to the shelf face.
  const side = (p: V3) => [p[2] * 0.3 / TILE, p[1] / TILE] as [number, number];
  quad([-W, 0, 0], [-W, 0, zb], [-W, H, zb], [-W, H, 0], [-1, 0, 0], [0.8, 0.8, 0.8], side);
  quad([W, 0, zb], [W, 0, 0], [W, H, 0], [W, H, zb], [1, 0, 0], [0.8, 0.8, 0.8], side);
  quad([-W, H, zb], [W, H, zb], [W, H, 0], [-W, H, 0], [0, 1, 0], [0.95, 0.95, 0.95], p => [p[0] / TILE, p[2] * 0.3 / TILE]);
  quad([-W, 0, 0], [W, 0, 0], [W, 0, zb], [-W, 0, zb], [0, -1, 0], [0.6, 0.6, 0.6], p => [p[0] / TILE, p[2] * 0.3 / TILE]);
  // The lid's lower edge: a dark shadow line across the front, just proud.
  const lid = H - 0.045, zl = zf + 0.03; // detail offsets are in unit depth (scaled by each box's depth)
  quad([-W + B, lid - 0.003, zl], [W - B, lid - 0.003, zl], [W - B, lid + 0.002, zl], [-W + B, lid + 0.002, zl], [0, 0, 1], [0.35, 0.32, 0.28]);
  // The hand-hole: a dark rounded slot.
  const hy = H * 0.66, hw = 0.045, hh = 0.014, n = 10, c0 = pos.length / 3;
  pos.push(0, hy, zl); nor.push(0, 0, 1); col.push(0.08, 0.07, 0.06); uv.push(0, hy / TILE);
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2, x = Math.cos(a) * hw, y = hy + Math.sin(a) * hh * (Math.abs(Math.cos(a)) > 0.7 ? 1 : 1.05);
    pos.push(x, y, zl); nor.push(0, 0, 1); col.push(0.08, 0.07, 0.06); uv.push(x / TILE, y / TILE);
    if (i) idx.push(c0, c0 + i, c0 + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

export const LABEL_VARIANTS = 4;
/** A label card in its holder, for variant `k` of the atlas (a quad in the box's front plane, z just proud). */
export function labelGeometry(k: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.11, 0.06);
  g.translate(0, BOX_H * 0.36, 1.04);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (k + uv.getX(i)) / LABEL_VARIANTS, uv.getY(i));
  return g;
}

/** The label atlas: printed department labels with a barcode, and hand-written ones in marker. Our own text. */
export function labelAtlas(): THREE.CanvasTexture {
  const w = 256, h = 140, c = document.createElement('canvas'); c.width = w * LABEL_VARIANTS; c.height = h;
  const g = c.getContext('2d')!;
  const lines: [string, string][] = [['RECORDS 2019', 'Q3  BOX 14'], ['ESTATES', 'LEASES A-F'], ['old invoices', 'DO NOT BIN'], ['minutes', '2016-17']];
  lines.forEach(([a, b], k) => {
    const x = k * w;
    g.fillStyle = k < 2 ? '#f2efe6' : '#e9e2cf'; g.fillRect(x + 4, 4, w - 8, h - 8);
    g.strokeStyle = '#6d6a62'; g.lineWidth = 6; g.strokeRect(x + 3, 3, w - 6, h - 6);
    if (k < 2) {
      g.fillStyle = '#1c1c1c'; g.font = 'bold 30px sans-serif'; g.fillText(a, x + 18, 46); g.font = '24px sans-serif'; g.fillText(b, x + 18, 80);
      for (let i = 0; i < 40; i++) { const bw = 1 + ((i * 7) % 4); g.fillRect(x + 18 + i * 5, 96, bw, 28); }
    } else {
      g.fillStyle = k === 2 ? '#1e2f80' : '#202020'; g.font = 'italic bold 34px cursive, serif';
      g.save(); g.translate(x + 20, 56); g.rotate(-0.06); g.fillText(a, 0, 0); g.fillText(b, 8, 46); g.restore();
    }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
