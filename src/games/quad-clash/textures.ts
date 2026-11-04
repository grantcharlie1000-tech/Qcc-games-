/** Procedural canvas textures for Quad Clash: brick facades with windows, pavers, planks, lockers, crates, the ground
 * plans of both arenas, signs and the QCC crest. Drawn once per mount; no image files are loaded. */
import * as THREE from 'three';
import type { MapDef, Material } from './map';

type Ctx = CanvasRenderingContext2D;
function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
/** Small deterministic noise so textures look the same every visit. */
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; }
function speckle(g: Ctx, w: number, h: number, n: number, alpha: number, seed: number, light = false) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = light ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}

/** World size in metres that one texture repeat covers, and whether UVs follow world position or each face. */
export const MATERIAL_SCALE: Record<Material, { u: number; v: number; face?: boolean }> = {
  brick: { u: 6, v: 7.5 }, concrete: { u: 2, v: 2 }, wood: { u: 2, v: 2 }, metal: { u: 1.5, v: 1.5 }, locker: { u: 1.5, v: 2.2 },
  planter: { u: 2, v: 1 }, roof: { u: 2, v: 2 }, crate: { u: 1, v: 1, face: true }, bleacher: { u: 2, v: 0.55 }, trunk: { u: 1, v: 2 },
  glass: { u: 2, v: 2 }, stage: { u: 2, v: 1.5 }, turf: { u: 4, v: 4 }, pillar: { u: 1, v: 3 },
};

function draw(mat: Material): HTMLCanvasElement {
  switch (mat) {
    case 'brick': {
      // Facade: 6 m wide x 7.5 m tall. Brick with two rows of classroom windows and a cream trim band.
      const [c, g] = canvas(512, 640);
      g.fillStyle = '#9c4a33'; g.fillRect(0, 0, 512, 640);
      const r = rng(3);
      for (let y = 0; y < 640; y += 16) for (let x = -32 + (y / 16 % 2) * 16; x < 512; x += 32) {
        const t = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${Math.round(160 * t)},${Math.round(78 * t)},${Math.round(56 * t)})`;
        g.fillRect(x + 1, y + 1, 30, 14);
      }
      g.fillStyle = '#efe2c4'; g.fillRect(0, 640 - 3.3 * 85, 512, 12); g.fillRect(0, 0, 512, 18);
      for (const [y0, y1] of [[1.1, 2.6], [4.2, 5.7]]) for (let wx = 0; wx < 2; wx++) {
        const x = 40 + wx * 256, top = 640 - y1 * 85, h = (y1 - y0) * 85;
        g.fillStyle = '#f4efe2'; g.fillRect(x - 6, top - 6, 180, h + 12);
        const grad = g.createLinearGradient(0, top, 0, top + h);
        grad.addColorStop(0, '#9fd3f2'); grad.addColorStop(1, '#3d7fb5');
        g.fillStyle = grad; g.fillRect(x, top, 168, h);
        g.fillStyle = '#f4efe2'; g.fillRect(x + 82, top, 5, h); g.fillRect(x, top + h * 0.45, 168, 4);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(x + 10, top + h); g.lineTo(x + 40, top); g.lineTo(x + 58, top); g.lineTo(x + 28, top + h); g.fill();
      }
      return c;
    }
    case 'concrete': case 'pillar': {
      const [c, g] = canvas(256, 256);
      g.fillStyle = mat === 'pillar' ? '#e9e4d8' : '#c9c4b8'; g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 1600, 0.12, 9); speckle(g, 256, 256, 600, 0.25, 11, true);
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
      return c;
    }
    case 'wood': case 'stage': {
      const [c, g] = canvas(256, 256);
      const base = mat === 'stage' ? [176, 118, 66] : [190, 138, 84];
      const r = rng(mat === 'stage' ? 5 : 7);
      for (let i = 0; i < 8; i++) {
        const t = 0.85 + r() * 0.25;
        g.fillStyle = `rgb(${base.map(v => Math.round(v * t)).join(',')})`; g.fillRect(0, i * 32, 256, 32);
        g.fillStyle = 'rgba(60,30,10,.35)'; g.fillRect(0, i * 32 + 30, 256, 2);
        for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(80,40,10,.12)'; g.fillRect(r() * 256, i * 32 + 4 + r() * 22, 30 + r() * 80, 1.5); }
        g.fillStyle = 'rgba(60,30,10,.4)'; g.fillRect(Math.floor(r() * 220), i * 32, 2, 30);
      }
      if (mat === 'stage') { g.fillStyle = '#1d2f5c'; g.fillRect(0, 200, 256, 56); g.fillStyle = '#f2b733'; g.fillRect(0, 200, 256, 6); }
      return c;
    }
    case 'metal': {
      const [c, g] = canvas(128, 128);
      const grad = g.createLinearGradient(0, 0, 128, 128); grad.addColorStop(0, '#8d97a3'); grad.addColorStop(1, '#5e6873');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128); speckle(g, 128, 128, 300, 0.15, 4, true);
      return c;
    }
    case 'locker': {
      // Three doors per 1.5 m, 2.2 m tall.
      const [c, g] = canvas(192, 280);
      for (let i = 0; i < 3; i++) {
        const x = i * 64;
        g.fillStyle = i % 2 ? '#2f7d8f' : '#2a7182'; g.fillRect(x, 0, 64, 280);
        g.strokeStyle = '#174451'; g.lineWidth = 3; g.strokeRect(x + 2, 4, 60, 272);
        g.fillStyle = '#174451'; for (let v = 0; v < 5; v++) g.fillRect(x + 14, 22 + v * 9, 36, 4);
        g.fillStyle = '#dfe6e8'; g.fillRect(x + 48, 130, 6, 26);
        g.fillStyle = '#f2b733'; g.fillRect(x + 22, 70, 20, 12);
      }
      return c;
    }
    case 'planter': {
      const [c, g] = canvas(256, 128);
      g.fillStyle = '#6b6f73'; g.fillRect(0, 0, 256, 128);
      for (let x = 0; x < 256; x += 64) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, 0, 62, 128); }
      g.fillStyle = '#42464a'; g.fillRect(0, 0, 256, 14); speckle(g, 256, 128, 500, 0.2, 21);
      return c;
    }
    case 'roof': {
      const [c, g] = canvas(128, 128);
      for (let x = 0; x < 128; x += 16) { const grad = g.createLinearGradient(x, 0, x + 16, 0); grad.addColorStop(0, '#7f8f9b'); grad.addColorStop(0.5, '#c3ced6'); grad.addColorStop(1, '#7f8f9b'); g.fillStyle = grad; g.fillRect(x, 0, 16, 128); }
      return c;
    }
    case 'crate': {
      const [c, g] = canvas(256, 256);
      g.fillStyle = '#c98f4d'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(90,50,15,.25)'; g.fillRect(0, i * 43, 256, 2); }
      g.strokeStyle = '#7e5226'; g.lineWidth = 26; g.strokeRect(13, 13, 230, 230);
      g.beginPath(); g.moveTo(26, 26); g.lineTo(230, 230); g.stroke();
      g.fillStyle = 'rgba(29,47,92,.82)'; g.font = '900 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(128, 128); g.rotate(-0.08); g.fillText('QCC', 0, 0); g.restore();
      return c;
    }
    case 'bleacher': {
      const [c, g] = canvas(256, 70);
      g.fillStyle = '#9aa7b2'; g.fillRect(0, 0, 256, 70);
      g.fillStyle = '#1d2f5c'; g.fillRect(0, 0, 256, 18);
      g.fillStyle = '#f2b733'; g.fillRect(0, 18, 256, 3);
      g.fillStyle = 'rgba(0,0,0,.15)'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 21, 2, 49);
      return c;
    }
    case 'trunk': {
      const [c, g] = canvas(64, 128);
      g.fillStyle = '#6a4a2e'; g.fillRect(0, 0, 64, 128);
      const r = rng(17); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,18,8,.35)'; g.fillRect(r() * 64, r() * 128, 2, 10 + r() * 20); }
      return c;
    }
    default: {
      const [c, g] = canvas(64, 64); g.fillStyle = '#999'; g.fillRect(0, 0, 64, 64); return c;
    }
  }
}

export function materialTexture(mat: Material, anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(draw(mat));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** The whole arena floor as one painted plan. Covers [-hx-pad, hx+pad] x [-hz-pad, hz+pad]. */
export function groundTexture(map: MapDef, pad: number, anisotropy: number): THREE.CanvasTexture {
  const W = (map.hx + pad) * 2, H = (map.hz + pad) * 2, ppm = 2048 / Math.max(W, H);
  const [c, g] = canvas(Math.round(W * ppm), Math.round(H * ppm));
  const X = (x: number) => (x + map.hx + pad) * ppm, Z = (z: number) => (z + map.hz + pad) * ppm, S = (m: number) => m * ppm;
  if (map.ground === 'field') {
    for (let i = 0; i * 4 < W; i++) { g.fillStyle = i % 2 ? '#4f9a3c' : '#5aa845'; g.fillRect(S(i * 4), 0, S(4), c.height); }
    speckle(g, c.width, c.height, 9000, 0.12, 31);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = S(0.14);
    g.strokeRect(X(-31), Z(-13), S(62), S(26));
    g.beginPath(); g.moveTo(X(0), Z(-13)); g.lineTo(X(0), Z(13)); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), S(5), 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(X(0), Z(0), S(0.3), 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { g.strokeRect(X(s * 31 - (s > 0 ? 6 : 0)), Z(-6), S(6), S(12)); }
    // Running track lane along the stands.
    g.fillStyle = '#b8563d'; g.fillRect(X(-34), Z(-15), S(68), S(1.6));
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 3; k++) g.fillRect(X(-34), Z(-15 + k * 0.53), S(68), S(0.05));
  } else {
    g.fillStyle = '#5e9e45'; g.fillRect(0, 0, c.width, c.height);
    speckle(g, c.width, c.height, 12000, 0.14, 41); speckle(g, c.width, c.height, 4000, 0.1, 43, true);
    const pave = (x0: number, z0: number, x1: number, z1: number) => {
      g.fillStyle = '#cfc8b7'; g.fillRect(X(x0), Z(z0), S(x1 - x0), S(z1 - z0));
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
      for (let x = Math.ceil(x0); x < x1; x++) { g.beginPath(); g.moveTo(X(x), Z(z0)); g.lineTo(X(x), Z(z1)); g.stroke(); }
      for (let z = Math.ceil(z0); z < z1; z++) { g.beginPath(); g.moveTo(X(x0), Z(z)); g.lineTo(X(x1), Z(z)); g.stroke(); }
    };
    pave(-13, -13, 13, 13);
    pave(-3, -30, 3, 30); pave(-30, -3, 30, 3);
    pave(-30, -30, -11, -11); pave(11, -30, 30, -18); pave(11, 11, 30, 30); pave(-30, 13, -11, 30);
    // Four-square court and hopscotch painted on the pavers.
    g.strokeStyle = '#f2b733'; g.lineWidth = S(0.1);
    g.strokeRect(X(-27), Z(-9), S(5), S(5)); g.beginPath(); g.moveTo(X(-24.5), Z(-9)); g.lineTo(X(-24.5), Z(-4)); g.moveTo(X(-27), Z(-6.5)); g.lineTo(X(-22), Z(-6.5)); g.stroke();
    g.strokeStyle = '#ffffff';
    for (let i = 0; i < 6; i++) g.strokeRect(X(10 + i * 0.7), Z(-1), S(0.7), S(0.7));
    g.fillStyle = 'rgba(29,47,92,.9)'; g.font = `900 ${S(2.6)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('QCC', X(0), Z(10.5));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** A sign panel: navy board, gold border, big words and an optional line beneath. */
export function signTexture(text: string, sub: string | undefined, w: number, h: number): THREE.CanvasTexture {
  const ppm = 96, [c, g] = canvas(Math.round(w * ppm), Math.round(h * ppm));
  g.fillStyle = '#1d2f5c'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#f2b733'; g.lineWidth = 10; g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(c.height * (sub ? 0.46 : 0.6))}px Arial, sans-serif`;
  g.fillText(text, c.width / 2, c.height * (sub ? 0.42 : 0.52), c.width - 40);
  if (sub) { g.fillStyle = '#f2b733'; g.font = `800 ${Math.round(c.height * 0.2)}px Arial, sans-serif`; g.fillText(sub, c.width / 2, c.height * 0.78, c.width - 40); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The QCC crest worn on every bot: a navy shield with a gold Q. */
export function crestTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#1d2f5c'; g.strokeStyle = '#f2b733'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(14, 12); g.lineTo(114, 12); g.lineTo(114, 64); g.quadraticCurveTo(114, 104, 64, 120); g.quadraticCurveTo(14, 104, 14, 64); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f2b733'; g.font = '900 72px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Q', 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sky gradient used as the scene background. */
export function skyTexture(map: MapDef): THREE.CanvasTexture {
  const [c, g] = canvas(4, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  if (map.ground === 'field') { grad.addColorStop(0, '#4b8fe0'); grad.addColorStop(0.55, '#a9d4f5'); grad.addColorStop(1, '#f6e7c8'); }
  else { grad.addColorStop(0, '#3f86d8'); grad.addColorStop(0.6, '#9fd0f2'); grad.addColorStop(1, '#e8f3f8'); }
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft round sprite for particles. */
export function dotTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Star-shaped muzzle flash. */
export function flashTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.translate(64, 64);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  grad.addColorStop(0, 'rgba(255,255,230,1)'); grad.addColorStop(0.3, 'rgba(255,214,90,.95)'); grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 22 : 62; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  return new THREE.CanvasTexture(c);
}
