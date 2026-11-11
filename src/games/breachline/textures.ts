/** Every surface in Breachline is drawn here on a canvas at load: no image files. Wall textures span floor to ceiling
 * (3 m), so skirting, wainscot and grime sit at the right height; floor textures tile. */
import * as THREE from 'three';

export type TexId =
  | 'brick' | 'cinder' | 'drywall' | 'core' | 'planks' | 'plate' | 'concrete' | 'trim' | 'wood' | 'crate' | 'container' | 'paint' | 'glass' | 'rack' | 'shelf' | 'steel' | 'counter' | 'fabric' | 'rubber'
  | 'asphalt' | 'grass' | 'slab' | 'tile' | 'lino' | 'carpet' | 'floorboards' | 'raised' | 'check' | 'ceiling' | 'lamp' | 'roof';

type G = CanvasRenderingContext2D;
function rng(seed: number) { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

/** Per-pixel grain; `streak` stretches it along one axis (brushed metal, wood). */
function grain(g: G, s: number, r: () => number, amount: number, streakX = 1, streakY = 1) {
  const img = g.getImageData(0, 0, s, s), d = img.data;
  const w = Math.ceil(s / streakX), h = Math.ceil(s / streakY), n = new Float32Array(w * h);
  for (let i = 0; i < n.length; i++) n[i] = (r() - 0.5) * 2 * amount;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const v = n[Math.floor(y / streakY) * w + Math.floor(x / streakX)], i = (y * s + x) * 4;
    d[i] = Math.max(0, Math.min(255, d[i] + v)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v));
  }
  g.putImageData(img, 0, 0);
}
function blotches(g: G, s: number, r: () => number, n: number, color: string, min: number, max: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s, rad = min + r() * (max - min), grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    // Draw wrapped so the texture tiles.
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { g.beginPath(); g.arc(x + ox, y + oy, rad, 0, 7); g.fill(); }
  }
}

const painters: Record<TexId, (g: G, s: number, r: () => number) => void> = {
  brick(g, s, r) {
    g.fillStyle = '#8f8676'; g.fillRect(0, 0, s, s);
    const rows = 24, h = s / rows, w = s / 6;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 6; x++) {
      const t = r(), base = [150 + t * 36, 82 + t * 26, 62 + t * 20];
      g.fillStyle = rgb(base[0], base[1], base[2]);
      g.fillRect(x * w + (y % 2 ? w / 2 : 0) + 1.5, y * h + 1.5, w - 3, h - 3);
      g.fillStyle = rgb(255, 230, 200, 0.07); g.fillRect(x * w + (y % 2 ? w / 2 : 0) + 1.5, y * h + 1.5, w - 3, 1.5);
    }
    blotches(g, s, r, 10, 'rgba(40,30,25,0.22)', 20, 70);
    grain(g, s, r, 14);
  },
  cinder(g, s, r) {
    // Painted block wall: cool grey above a darker band, with block joints showing through the paint.
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#b9bfc0'); grad.addColorStop(0.62, '#b3b9ba'); grad.addColorStop(0.625, '#5c6a70'); grad.addColorStop(1, '#4c585e');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 1.5;
    const rows = 15, h = s / rows, w = s / 7.5;
    for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * h); g.lineTo(s, y * h); g.stroke(); for (let x = 0; x < 9; x++) { const px = x * w + (y % 2 ? w / 2 : 0); g.beginPath(); g.moveTo(px, y * h); g.lineTo(px, y * h + h); g.stroke(); } }
    g.fillStyle = '#2c3438'; g.fillRect(0, s * 0.965, s, s * 0.035);
    blotches(g, s, r, 8, 'rgba(30,35,40,0.14)', 20, 80);
    grain(g, s, r, 9);
  },
  drywall(g, s, r) {
    // The destructible walls: pale board over timber wainscot, so they read differently from block walls.
    g.fillStyle = '#d9d2c2'; g.fillRect(0, 0, s, s);
    const wains = s * 0.63;
    g.fillStyle = '#7b5a3c'; g.fillRect(0, wains, s, s - wains);
    for (let x = 0; x < 12; x++) { const px = x * s / 12; g.fillStyle = rgb(105 + r() * 30, 76 + r() * 20, 48 + r() * 14); g.fillRect(px + 1, wains + 5, s / 12 - 2, s - wains - 5); }
    g.fillStyle = '#5a4029'; g.fillRect(0, wains, s, 6); g.fillRect(0, s * 0.955, s, s * 0.045);
    g.strokeStyle = 'rgba(90,80,60,0.28)'; g.lineWidth = 1.5;
    for (const x of [0, s * 0.4, s * 0.8]) { g.beginPath(); g.moveTo(x + 1, 0); g.lineTo(x + 1, wains); g.stroke(); for (let y = 12; y < wains; y += 34) { g.fillStyle = 'rgba(80,70,55,0.35)'; g.fillRect(x + 5, y, 2.5, 2.5); } }
    blotches(g, s, r, 6, 'rgba(120,100,70,0.1)', 30, 90);
    grain(g, s, r, 7);
  },
  core(g, s, r) { g.fillStyle = '#e9e5da'; g.fillRect(0, 0, s, s); blotches(g, s, r, 40, 'rgba(150,140,120,0.35)', 3, 14); grain(g, s, r, 26); },
  planks(g, s, r) {
    // Barricade boards: four to the metre, the same height as a destructible cell.
    for (let y = 0; y < 4; y++) {
      const t = r();
      g.fillStyle = rgb(150 + t * 34, 108 + t * 26, 62 + t * 18); g.fillRect(0, y * s / 4, s, s / 4);
      g.fillStyle = 'rgba(40,24,10,0.55)'; g.fillRect(0, y * s / 4, s, 2.5);
      g.fillStyle = 'rgba(255,240,210,0.1)'; g.fillRect(0, y * s / 4 + 2.5, s, 2);
      for (const x of [0.06, 0.5, 0.94]) { g.fillStyle = '#3a3530'; g.beginPath(); g.arc(x * s, (y + 0.5) * s / 4, 2.6, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(70,45,20,0.3)'; g.lineWidth = 1;
      for (let k = 0; k < 5; k++) { const py = (y + 0.15 + r() * 0.7) * s / 4; g.beginPath(); g.moveTo(0, py); g.bezierCurveTo(s * 0.3, py + r() * 6 - 3, s * 0.6, py + r() * 6 - 3, s, py); g.stroke(); }
    }
    grain(g, s, r, 12, 6, 1);
  },
  plate(g, s, r) {
    g.fillStyle = '#4a5157'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < 4; x++) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x * s / 4 + 3, 0, s / 4 - 6, s); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x * s / 4, 0, 2.5, s); }
    for (let y = 0; y < 3; y++) { g.fillStyle = '#343a3f'; g.fillRect(0, (y + 0.5) * s / 3 - 5, s, 10); for (let x = 0; x < 8; x++) { g.fillStyle = '#8a949b'; g.beginPath(); g.arc((x + 0.5) * s / 8, (y + 0.5) * s / 3, 2.4, 0, 7); g.fill(); } }
    // Hazard band across the top.
    g.save(); g.beginPath(); g.rect(0, 0, s, s * 0.07); g.clip();
    for (let x = -s; x < s * 2; x += 24) { g.fillStyle = '#e0b020'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x - 6, s * 0.07); g.lineTo(x - 18, s * 0.07); g.fill(); }
    g.restore();
    blotches(g, s, r, 10, 'rgba(20,15,10,0.25)', 10, 50);
    grain(g, s, r, 10, 1, 5);
  },
  concrete(g, s, r) {
    g.fillStyle = '#8b8d8a'; g.fillRect(0, 0, s, s);
    blotches(g, s, r, 16, 'rgba(50,52,50,0.2)', 20, 90); blotches(g, s, r, 10, 'rgba(210,210,200,0.12)', 20, 70);
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
    const drip = g.createLinearGradient(0, 0, 0, s * 0.4); drip.addColorStop(0, 'rgba(30,30,25,0.3)'); drip.addColorStop(1, 'rgba(30,30,25,0)');
    g.fillStyle = drip; g.fillRect(0, 0, s, s * 0.4);
    grain(g, s, r, 16);
  },
  trim(g, s, r) { g.fillStyle = '#2f3639'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, s * 0.2, s); grain(g, s, r, 8, 1, 8); },
  wood(g, s, r) {
    g.fillStyle = '#9a7146'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(60,35,15,0.25)'; g.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) { const y = r() * s; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + r() * 10 - 5, s * 0.7, y + r() * 10 - 5, s, y); g.stroke(); }
    grain(g, s, r, 10, 8, 1);
  },
  crate(g, s, r) {
    g.fillStyle = '#a07c4a'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < 6; x++) { g.fillStyle = rgb(150 + r() * 30, 116 + r() * 22, 66 + r() * 16); g.fillRect(x * s / 6 + 1, 0, s / 6 - 2, s); }
    g.fillStyle = '#6f5230'; const f = s * 0.1;
    g.fillRect(0, 0, s, f); g.fillRect(0, s - f, s, f); g.fillRect(0, 0, f, s); g.fillRect(s - f, 0, f, s);
    g.save(); g.translate(s / 2, s / 2); g.rotate(Math.PI / 4); g.fillRect(-s * 0.62, -f / 2, s * 1.24, f); g.restore();
    g.fillStyle = 'rgba(20,20,20,0.75)'; g.font = `bold ${s * 0.085}px sans-serif`; g.fillText('TW-ANNEX', s * 0.16, s * 0.3);
    grain(g, s, r, 12, 1, 6);
  },
  container(g, s, r) {
    // Light, so each container can be tinted its own colour.
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < 16; x++) { const px = x * s / 16, grad = g.createLinearGradient(px, 0, px + s / 16, 0); grad.addColorStop(0, 'rgba(0,0,0,0.3)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.14)'); grad.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = grad; g.fillRect(px, 0, s / 16, s); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, s, s * 0.035); g.fillRect(0, s * 0.965, s, s * 0.035);
    blotches(g, s, r, 12, 'rgba(110,60,25,0.22)', 6, 40);
    grain(g, s, r, 9);
  },
  paint(g, s, r) { g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, s, s); const grad = g.createLinearGradient(0, 0, 0, s); grad.addColorStop(0, 'rgba(255,255,255,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0.2)'); g.fillStyle = grad; g.fillRect(0, 0, s, s); blotches(g, s, r, 6, 'rgba(60,50,40,0.12)', 10, 50); grain(g, s, r, 6); },
  glass(g, s) { const grad = g.createLinearGradient(0, 0, s, s); grad.addColorStop(0, '#31475a'); grad.addColorStop(0.45, '#182531'); grad.addColorStop(0.5, '#5d7a90'); grad.addColorStop(0.56, '#182531'); grad.addColorStop(1, '#0d151c'); g.fillStyle = grad; g.fillRect(0, 0, s, s); },
  rack(g, s, r) {
    g.fillStyle = '#15181b'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 14; y++) {
      const py = s * 0.04 + y * s * 0.066;
      g.fillStyle = y % 5 === 4 ? '#0c0e10' : '#262b30'; g.fillRect(s * 0.07, py, s * 0.86, s * 0.055);
      g.fillStyle = '#3a4148'; g.fillRect(s * 0.07, py, s * 0.86, 1.5);
      if (y % 5 !== 4) for (let x = 0; x < 9; x++) { const c = r(); g.fillStyle = c < 0.55 ? '#39e08a' : c < 0.8 ? '#e9a93a' : c < 0.9 ? '#4aa8ff' : '#20262b'; g.fillRect(s * 0.1 + x * s * 0.045, py + s * 0.02, s * 0.02, s * 0.014); }
      g.fillStyle = '#0d0f11'; for (let x = 0; x < 10; x++) g.fillRect(s * 0.56 + x * s * 0.034, py + s * 0.012, s * 0.018, s * 0.03);
    }
    g.fillStyle = '#30363b'; g.fillRect(0, 0, s * 0.045, s); g.fillRect(s * 0.955, 0, s * 0.045, s);
    grain(g, s, r, 5);
  },
  shelf(g, s, r) {
    // Archive shelving: five boards of box files and ledgers.
    g.fillStyle = '#2b2f33'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 5; y++) {
      const top = y * s / 5 + 4, h = s / 5 - 12;
      g.fillStyle = '#16181a'; g.fillRect(4, top, s - 8, h + 4);
      let x = 6;
      while (x < s - 14) {
        const w = 10 + r() * 20, tall = h * (0.72 + r() * 0.28), t = r();
        g.fillStyle = t < 0.4 ? rgb(170 + r() * 40, 150 + r() * 30, 110 + r() * 20) : t < 0.6 ? rgb(60 + r() * 30, 90 + r() * 40, 120 + r() * 40) : t < 0.8 ? rgb(130 + r() * 40, 60 + r() * 20, 50 + r() * 20) : rgb(80 + r() * 30, 100 + r() * 30, 70 + r() * 20);
        g.fillRect(x, top + h - tall + 4, w - 1.5, tall);
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x + 2, top + h - tall * 0.55, w - 5.5, tall * 0.16);
        x += w;
      }
      g.fillStyle = '#8a8f94'; g.fillRect(0, top + h + 4, s, 5);
    }
    g.fillStyle = '#8a8f94'; g.fillRect(0, 0, 4, s); g.fillRect(s - 4, 0, 4, s);
    grain(g, s, r, 6);
  },
  steel(g, s, r) {
    g.fillStyle = '#9aa2a6'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < 2; x++) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(x * s / 2 + 4, 6, s / 2 - 8, s - 12); g.fillStyle = '#4e565a'; g.fillRect(x * s / 2 + s * 0.4, s * 0.45, s * 0.03, s * 0.12); for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x * s / 2 + s * 0.12, s * 0.1 + k * s * 0.03, s * 0.26, s * 0.012); } }
    grain(g, s, r, 10, 1, 10);
  },
  counter(g, s, r) {
    g.fillStyle = '#5d6f78'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < 3; x++) { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.strokeRect(x * s / 3 + 3, s * 0.08, s / 3 - 6, s * 0.84); g.fillStyle = '#c9ced0'; g.fillRect(x * s / 3 + s * 0.13, s * 0.16, s * 0.07, s * 0.02); }
    g.fillStyle = '#20282c'; g.fillRect(0, s * 0.93, s, s * 0.07);
    grain(g, s, r, 7);
  },
  fabric(g, s, r) { g.fillStyle = '#56624f'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(0,0,0,0.1)'; for (let i = 0; i < s; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); } grain(g, s, r, 16); },
  rubber(g, s, r) { g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, s, s); grain(g, s, r, 8); },
  asphalt(g, s, r) {
    g.fillStyle = '#3d3f42'; g.fillRect(0, 0, s, s);
    blotches(g, s, r, 14, 'rgba(20,20,22,0.3)', 20, 80); blotches(g, s, r, 8, 'rgba(120,115,105,0.1)', 30, 90);
    g.strokeStyle = 'rgba(15,15,15,0.5)'; g.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) { let x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 46; y += (r() - 0.5) * 46; g.lineTo(x, y); } g.stroke(); }
    grain(g, s, r, 22);
  },
  grass(g, s, r) {
    g.fillStyle = '#4a5d33'; g.fillRect(0, 0, s, s);
    blotches(g, s, r, 24, 'rgba(90,110,50,0.3)', 10, 50); blotches(g, s, r, 16, 'rgba(70,60,35,0.25)', 10, 40);
    for (let i = 0; i < 900; i++) { g.strokeStyle = rgb(60 + r() * 70, 90 + r() * 70, 30 + r() * 40, 0.6); const x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 4 - 2, y - 3 - r() * 4); g.stroke(); }
    grain(g, s, r, 14);
  },
  slab(g, s, r) {
    g.fillStyle = '#7d7f7c'; g.fillRect(0, 0, s, s);
    blotches(g, s, r, 10, 'rgba(25,22,18,0.35)', 12, 60); blotches(g, s, r, 10, 'rgba(200,200,190,0.1)', 30, 90);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
    grain(g, s, r, 15);
  },
  tile(g, s, r) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const t = r(); g.fillStyle = rgb(196 + t * 16, 202 + t * 14, 200 + t * 14); g.fillRect(x * s / 4, y * s / 4, s / 4, s / 4); }
    g.strokeStyle = '#7f8684'; g.lineWidth = 2.5; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
    blotches(g, s, r, 6, 'rgba(80,70,60,0.12)', 15, 60); grain(g, s, r, 7);
  },
  lino(g, s, r) {
    g.fillStyle = '#a79f8c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(70,64,52,0.35)' : 'rgba(225,220,205,0.4)'; g.fillRect(r() * s, r() * s, 1.6, 1.6); }
    blotches(g, s, r, 8, 'rgba(60,50,40,0.14)', 20, 70); grain(g, s, r, 8);
  },
  carpet(g, s, r) { g.fillStyle = '#3f4c5c'; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += 4) for (let x = 0; x < s; x += 4) { g.fillStyle = rgb(52 + r() * 26, 66 + r() * 26, 84 + r() * 28, 0.8); g.fillRect(x, y, 3, 3); } blotches(g, s, r, 6, 'rgba(20,24,30,0.2)', 20, 70); grain(g, s, r, 10); },
  floorboards(g, s, r) {
    for (let x = 0; x < 8; x++) { const t = r(); g.fillStyle = rgb(128 + t * 34, 88 + t * 26, 52 + t * 18); g.fillRect(x * s / 8, 0, s / 8, s); g.fillStyle = 'rgba(30,18,8,0.55)'; g.fillRect(x * s / 8, 0, 1.6, s); const j = r() * s; g.fillRect(x * s / 8, j, s / 8, 1.6); }
    grain(g, s, r, 11, 1, 8);
  },
  raised(g, s, r) {
    g.fillStyle = '#5a6066'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const ox = x * s / 2, oy = y * s / 2; g.fillStyle = rgb(86 + r() * 14, 92 + r() * 14, 98 + r() * 14); g.fillRect(ox + 2, oy + 2, s / 2 - 4, s / 2 - 4);
      if ((x + y) % 2) for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { g.fillStyle = '#1a1d20'; g.beginPath(); g.arc(ox + s * 0.06 + i * s * 0.047, oy + s * 0.06 + j * s * 0.047, 2.2, 0, 7); g.fill(); }
    }
    grain(g, s, r, 7);
  },
  check(g, s, r) { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#d7d1c1' : '#39403f'; g.fillRect(x * s / 4, y * s / 4, s / 4, s / 4); } g.strokeStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); } blotches(g, s, r, 6, 'rgba(60,50,40,0.14)', 15, 60); grain(g, s, r, 8); },
  ceiling(g, s, r) {
    g.fillStyle = '#d5d6d2'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(90,90,85,0.35)'; g.fillRect(r() * s, r() * s, 1.4, 1.4); }
    g.strokeStyle = '#9fa19c'; g.lineWidth = 3; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * s / 2, 0); g.lineTo(i * s / 2, s); g.moveTo(0, i * s / 2); g.lineTo(s, i * s / 2); g.stroke(); }
    grain(g, s, r, 6);
  },
  lamp(g, s) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); g.strokeStyle = '#c8ccd0'; g.lineWidth = 6; g.strokeRect(0, 0, s, s); },
  roof(g, s, r) { g.fillStyle = '#4b4d50'; g.fillRect(0, 0, s, s); blotches(g, s, r, 12, 'rgba(20,20,20,0.3)', 20, 80); grain(g, s, r, 14); },
};

/** Metres covered by one repeat of each texture, across and up. Wall textures are WALL_H tall. */
export const TILE: Record<TexId, readonly [number, number]> = {
  brick: [1.5, 1.8], cinder: [3, 3], drywall: [3, 3], core: [0.5, 0.5], planks: [1, 1], plate: [1, 2.5], concrete: [3, 3], trim: [0.5, 0.5], wood: [1.2, 1.2], crate: [1, 1], container: [2.4, 2.6],
  paint: [2, 2], glass: [1.4, 1.4], rack: [0.8, 2.1], shelf: [1.8, 2.2], steel: [1, 2], counter: [1.8, 0.95], fabric: [0.6, 0.6], rubber: [0.5, 0.5],
  asphalt: [5, 5], grass: [4, 4], slab: [3, 3], tile: [2, 2], lino: [3, 3], carpet: [1.5, 1.5], floorboards: [2, 2], raised: [1.2, 1.2], check: [2, 2], ceiling: [1.2, 1.2], lamp: [1, 1], roof: [4, 4],
};

export function makeTextures(anisotropy: number, size = 256): Record<TexId, THREE.CanvasTexture> {
  const out = {} as Record<TexId, THREE.CanvasTexture>;
  (Object.keys(painters) as TexId[]).forEach((id, n) => {
    const big = id === 'drywall' || id === 'cinder' || id === 'brick' || id === 'asphalt' || id === 'rack', s = big ? size * 2 : size;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = s;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    painters[id](g, s, rng(977 + n * 131));
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    out[id] = t;
  });
  return out;
}

/** Soft sprites for effects: white on transparent, tinted per use. */
export function makeSprite(kind: 'puff' | 'flash' | 'hole' | 'blob' | 'ring' | 'scorch'): THREE.CanvasTexture {
  const s = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = s;
  const g = canvas.getContext('2d')!, c = s / 2;
  if (kind === 'puff' || kind === 'blob') {
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, kind === 'blob' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)'); grad.addColorStop(0.5, kind === 'blob' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.45)'); grad.addColorStop(1, kind === 'blob' ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    if (kind === 'puff') { const r = rng(5); for (let i = 0; i < 14; i++) { const x = c + (r() - 0.5) * s * 0.6, y = c + (r() - 0.5) * s * 0.6, rad = 10 + r() * 22, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); } }
  } else if (kind === 'flash') {
    const grad = g.createRadialGradient(c, c, 0, c, c, c); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,225,150,0.85)'); grad.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,240,200,0.9)';
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 + 0.3; g.beginPath(); g.moveTo(c + Math.cos(a - 0.16) * 8, c + Math.sin(a - 0.16) * 8); g.lineTo(c + Math.cos(a) * c * 0.95, c + Math.sin(a) * c * 0.95); g.lineTo(c + Math.cos(a + 0.16) * 8, c + Math.sin(a + 0.16) * 8); g.fill(); }
  } else if (kind === 'scorch') {
    // Soot: a dark, uneven core fading out, with streaks thrown radially and a few clean spots where debris lay.
    const r = rng(23), grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(14,12,10,0.6)'); grad.addColorStop(0.35, 'rgba(22,19,16,0.4)'); grad.addColorStop(0.7, 'rgba(30,26,22,0.14)'); grad.addColorStop(1, 'rgba(30,26,22,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      const a = r() * 6.283, l0 = c * (0.15 + r() * 0.2), l1 = c * (0.5 + r() * 0.45), w = 1 + r() * 3;
      g.strokeStyle = `rgba(16,13,11,${0.08 + r() * 0.18})`; g.lineWidth = w; g.beginPath();
      g.moveTo(c + Math.cos(a) * l0, c + Math.sin(a) * l0); g.lineTo(c + Math.cos(a) * l1, c + Math.sin(a) * l1); g.stroke();
    }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.4})`; g.beginPath(); g.arc(c + (r() - 0.5) * c, c + (r() - 0.5) * c, 3 + r() * 6, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  } else if (kind === 'hole') {
    // A crater: faint grey bruising, a ring of crushed, bared gypsum chips, then the ragged dark hole.
    const r = rng(11), grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(70,64,58,0.55)'); grad.addColorStop(0.6, 'rgba(90,84,78,0.25)'); grad.addColorStop(1, 'rgba(90,84,78,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    const ragged = (rad: number, jag: number) => { g.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, q = rad * (1 - jag + 2 * jag * r()); if (i) g.lineTo(c + Math.cos(a) * q, c + Math.sin(a) * q); else g.moveTo(c + Math.cos(a) * q, c + Math.sin(a) * q); } g.closePath(); g.fill(); };
    g.fillStyle = 'rgba(214,208,196,0.85)'; ragged(c * 0.46, 0.3);
    for (let i = 0; i < 18; i++) { const a = r() * 6.283, d = c * (0.3 + r() * 0.35); g.fillStyle = `rgba(${200 + r() * 30},${195 + r() * 28},${185 + r() * 25},${0.5 + r() * 0.4})`; g.fillRect(c + Math.cos(a) * d - 2, c + Math.sin(a) * d - 2, 2 + r() * 4, 2 + r() * 4); }
    g.fillStyle = 'rgba(52,46,40,1)'; ragged(c * 0.26, 0.28);
    g.fillStyle = 'rgba(10,9,8,1)'; ragged(c * 0.16, 0.25);
  } else {
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7; g.beginPath(); g.arc(c, c, c - 8, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, c - 22, 0, 7); g.stroke();
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
