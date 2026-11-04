/** Procedural canvas textures for Quad Clash: brick facades with windows, pavers, planks, lockers, crates, the ground
 * plans of the arenas, signs and the QCC crest. Drawn once per mount; no image files are loaded. */
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

/** Broad, faint colour variation; wrap each stain so repeated materials have no hard seam. */
function weather(g: Ctx, w: number, h: number, seed: number, strength = 0.08) {
  const r = rng(seed);
  for (let i = 0; i < 18; i++) {
    const x = r() * w, y = r() * h, radius = (0.1 + r() * 0.22) * Math.min(w, h);
    const color = i % 3 === 0 ? '255,248,224' : '34,43,35';
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
      grad.addColorStop(0, `rgba(${color},${strength})`); grad.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = grad; g.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
    }
  }
}

/** Painted grain and bevels provide depth without normals, extra meshes or a lighting pass. */
function planks(g: Ctx, w: number, h: number, count: number, seed: number, base: readonly number[]) {
  const r = rng(seed), step = h / count;
  for (let i = 0; i < count; i++) {
    const y = i * step, tint = 0.88 + r() * 0.2;
    g.fillStyle = `rgb(${base.map(v => Math.round(v * tint)).join(',')})`; g.fillRect(0, y, w, step);
    g.fillStyle = 'rgba(255,233,193,.25)'; g.fillRect(0, y + 1, w, 1);
    g.fillStyle = 'rgba(48,32,19,.46)'; g.fillRect(0, y + step - 2, w, 2);
    for (let k = 0; k < 13; k++) {
      const gy = y + 3 + r() * (step - 7), phase = r() * Math.PI * 2;
      g.strokeStyle = k % 3 ? 'rgba(72,40,16,.13)' : 'rgba(255,228,180,.2)'; g.lineWidth = 0.6 + r();
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, gy + Math.sin(x / 28 + phase) * 1.6);
      g.stroke();
    }
    const knot = 30 + r() * (w - 60);
    g.strokeStyle = 'rgba(78,43,19,.23)'; g.lineWidth = 1;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(knot, y + step * 0.55, 3 + k * 4, 1 + k * 1.5, 0, 0, Math.PI * 2); g.stroke(); }
    for (const x of [8, w - 8]) { g.fillStyle = '#675a46'; g.fillRect(x, y + 6, 2, 2); }
  }
  weather(g, w, h, seed + 1, 0.07);
}

function roofing(mat: Material): HTMLCanvasElement {
  const [c, g] = canvas(256, 256);
  const colors = mat === 'roof-light' ? ['#c9cbc2', '#f1eee0', '#929c98'] : mat === 'roof-muted' ? ['#7c8376', '#a1a794', '#58665e'] : mat === 'roof' ? ['#84949e', '#c4ced0', '#586a75'] : ['#465457', '#657578', '#2e3f44'];
  // Sixteen corrugations per two metres, with a folded sheet join and screw rows.
  for (let x = 0; x < 256; x += 16) {
    const grad = g.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, colors[2]); grad.addColorStop(0.22, colors[0]); grad.addColorStop(0.5, colors[1]); grad.addColorStop(0.7, colors[0]); grad.addColorStop(1, colors[2]);
    g.fillStyle = grad; g.fillRect(x, 0, 16, 256);
  }
  weather(g, 256, 256, 25, 0.11); speckle(g, 256, 256, 1800, 0.09, 26);
  for (const y of [2, 128]) {
    g.fillStyle = 'rgba(20,35,34,.28)'; g.fillRect(0, y, 256, 3);
    g.fillStyle = 'rgba(247,246,223,.3)'; g.fillRect(0, y + 3, 256, 1);
    for (let x = 8; x < 256; x += 32) {
      g.fillStyle = colors[2]; g.beginPath(); g.arc(x, y + 6, 2.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = colors[1]; g.fillRect(x - 1, y + 4, 2, 1);
    }
  }
  return c;
}

/** World size in metres that one texture repeat covers, and whether UVs follow world position or each face. */
export const MATERIAL_SCALE: Record<Material, { u: number; v: number; face?: boolean }> = {
  brick: { u: 6, v: 7.5 }, concrete: { u: 2, v: 2 }, wood: { u: 2, v: 2 }, metal: { u: 1.5, v: 1.5 }, locker: { u: 1.5, v: 2.2 },
  planter: { u: 2, v: 1 }, roof: { u: 2, v: 2 }, crate: { u: 1, v: 1, face: true }, bleacher: { u: 2, v: 0.55 }, trunk: { u: 1, v: 2 },
  cladding: {u: 4, v: 3.3}, 'campus-roof': {u: 2, v: 2}, fence: {u: 2, v: 3.2}, 'roof-light': {u: 2, v: 2}, 'roof-muted': {u: 2, v: 2}, 'pool-edge': {u: 1, v: 1}, bin: {u: 1, v: 1, face: true}, recycling: {u: 1, v: 1, face: true},
  glass: { u: 2, v: 2 }, stage: { u: 2, v: 1.5 }, turf: { u: 4, v: 4 }, pillar: { u: 1, v: 3 },
};

function draw(mat: Material): HTMLCanvasElement {
  switch (mat) {
    case 'cladding': {
      const [c, g] = canvas(512, 416), r = rng(71);
      for (let y = 0; y < 416; y += 16) {
        const v = Math.floor(r() * 8);
        g.fillStyle = `rgb(${231 - v},${229 - v},${214 - v})`; g.fillRect(0, y, 512, 16);
        g.fillStyle = 'rgba(255,255,244,.6)'; g.fillRect(0, y + 1, 512, 1);
        g.fillStyle = 'rgba(72,85,74,.22)'; g.fillRect(0, y + 14, 512, 2);
      }
      weather(g, 512, 416, 73, 0.09); speckle(g, 512, 416, 1600, 0.06, 74);
      const trim = g.createLinearGradient(0, 344, 0, 416); trim.addColorStop(0, '#45665b'); trim.addColorStop(1, '#2e4c43');
      g.fillStyle = trim; g.fillRect(0, 344, 512, 72); g.fillStyle = '#355249'; g.fillRect(0, 0, 512, 20);
      // Recessed window bank, with a sill shadow and quiet reflected trees/sky.
      const shadow = g.createLinearGradient(0, 270, 0, 304); shadow.addColorStop(0, 'rgba(38,55,47,.27)'); shadow.addColorStop(1, 'rgba(38,55,47,0)');
      g.fillStyle = shadow; g.fillRect(40, 270, 432, 34);
      g.fillStyle = '#2e4946'; g.fillRect(36, 72, 440, 208);
      g.fillStyle = '#b5beb4'; g.fillRect(42, 78, 428, 196);
      const glass = g.createLinearGradient(0, 86, 0, 264); glass.addColorStop(0, '#b5d1d5'); glass.addColorStop(0.55, '#7ea3aa'); glass.addColorStop(1, '#42666d');
      g.fillStyle = glass; g.fillRect(48, 84, 416, 184);
      g.fillStyle = 'rgba(32,65,59,.19)'; g.beginPath(); g.moveTo(48, 253);
      for (let x = 48; x <= 464; x += 12) g.lineTo(x, 231 + Math.sin(x * 0.035) * 9 + Math.sin(x * 0.17) * 5);
      g.lineTo(464, 268); g.lineTo(48, 268); g.fill();
      g.fillStyle = 'rgba(240,251,247,.18)';
      for (const x of [70, 267]) { g.beginPath(); g.moveTo(x, 268); g.lineTo(x + 66, 84); g.lineTo(x + 93, 84); g.lineTo(x + 27, 268); g.fill(); }
      g.fillStyle = '#ececdb'; g.fillRect(182, 84, 6, 184); g.fillRect(326, 84, 6, 184); g.fillRect(48, 176, 416, 5);
      g.fillStyle = 'rgba(21,47,48,.3)'; g.fillRect(188, 84, 2, 184); g.fillRect(332, 84, 2, 184); g.fillRect(48, 181, 416, 2);
      g.fillStyle = '#efeedc'; g.fillRect(35, 276, 442, 6);
      return c;
    }
    case 'campus-roof': case 'roof-light': case 'roof-muted': case 'roof': return roofing(mat);
    case 'pool-edge': {
      const [c,g] = canvas(256,256), r=rng(81);
      g.fillStyle='#929e98';g.fillRect(0,0,256,256);
      for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=64){
        const v=Math.floor(r()*10);g.fillStyle=`rgb(${234-v},${234-v},${218-v})`;g.fillRect(x+2,y+2,61,61);
        g.fillStyle='rgba(255,255,255,.65)';g.fillRect(x+3,y+3,59,1);g.fillRect(x+3,y+3,1,59);
        g.fillStyle='rgba(83,106,100,.16)';g.fillRect(x+61,y+3,2,60);g.fillRect(x+3,y+61,60,2);
      }
      weather(g,256,256,82,0.07);speckle(g,256,256,1100,0.07,83);
      return c;
    }
    case 'bin': case 'recycling': {
      const [c,g]=canvas(128,160),blue=mat==='recycling';
      const grad=g.createLinearGradient(0,0,128,0);grad.addColorStop(0,blue?'#244e68':'#2c4f3c');grad.addColorStop(.3,blue?'#4184a5':'#548a65');grad.addColorStop(1,blue?'#285f7e':'#315a43');
      g.fillStyle=grad;g.fillRect(0,0,128,160);
      for(let x=14;x<128;x+=20){g.fillStyle='rgba(255,255,255,.09)';g.fillRect(x,116,2,39);g.fillStyle='rgba(0,0,0,.15)';g.fillRect(x+2,116,2,39);}
      speckle(g,128,160,450,.12,blue?85:86);weather(g,128,160,87,.1);
      g.fillStyle='#172a2b';g.fillRect(20,20,88,18);
      g.fillStyle='#e9eee4';g.fillRect(22,66,84,45);
      g.fillStyle='#233e40';g.font='900 13px Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';
      g.fillText(blue?'RECYCLE':'WASTE',64,89);
      g.fillStyle='rgba(255,255,255,.3)';g.fillRect(9,8,110,2);
      g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=3;g.strokeRect(7,7,114,146);
      return c;
    }
    case 'fence': {
      const [c,g] = canvas(192,256);
      g.clearRect(0,0,192,256);g.fillStyle='#3f5f58';
      for(let x=0;x<192;x+=12)g.fillRect(x,0,3,256);
      g.fillRect(0,12,192,5);g.fillRect(0,215,192,5);g.fillRect(0,0,7,256);
      return c;
    }
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
      weather(g,256,256,8,0.11);
      speckle(g, 256, 256, 2900, 0.13, 9); speckle(g, 256, 256, 1200, 0.22, 11, true);
      g.strokeStyle = 'rgba(50,58,50,.24)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
      g.strokeStyle = 'rgba(255,255,239,.45)'; g.lineWidth = 1; g.strokeRect(3, 3, 250, 250);
      return c;
    }
    case 'wood': case 'stage': {
      const [c, g] = canvas(256, 256);
      const base = mat === 'stage' ? [176, 118, 66] : [190, 138, 84];
      planks(g,256,256,8,mat === 'stage' ? 5 : 7,base);
      if (mat === 'stage') { g.fillStyle = '#1d2f5c'; g.fillRect(0, 200, 256, 56); g.fillStyle = '#f2b733'; g.fillRect(0, 200, 256, 6); }
      return c;
    }
    case 'metal': {
      const [c, g] = canvas(128, 128);
      const grad = g.createLinearGradient(0, 0, 128, 128); grad.addColorStop(0, '#8d97a3'); grad.addColorStop(1, '#5e6873');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128); speckle(g, 128, 128, 300, 0.15, 4, true);
      g.strokeStyle='rgba(238,246,245,.08)';g.lineWidth=.5;
      for(let y=0;y<128;y+=3){g.beginPath();g.moveTo(0,y);g.lineTo(128,y);g.stroke();}
      weather(g,128,128,12,.09);
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
        g.fillStyle='#244b50';g.font='bold 7px Arial,sans-serif';g.textAlign='center';g.fillText(`${101+i}`,x+32,79);
        g.fillStyle='rgba(255,255,238,.25)';g.fillRect(x+4,7,1,264);g.fillRect(x+4,7,56,1);
        g.fillStyle='#a7b5ae';g.fillRect(x+6,49,3,12);g.fillRect(x+6,224,3,12);
      }
      weather(g,192,280,15,.1);speckle(g,192,280,650,.1,16);
      return c;
    }
    case 'planter': {
      const [c, g] = canvas(256, 128);
      g.fillStyle = '#6b6f73'; g.fillRect(0, 0, 256, 128);
      for (let x = 0; x < 256; x += 64) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, 0, 62, 128); }
      g.fillStyle = '#42464a'; g.fillRect(0, 0, 256, 14); speckle(g, 256, 128, 500, 0.2, 21);
      weather(g,256,128,22,.16);g.fillStyle='rgba(237,240,227,.3)';g.fillRect(0,14,256,2);
      return c;
    }
    case 'crate': {
      const [c, g] = canvas(256, 256);
      planks(g,256,256,6,35,[192,143,83]);
      g.strokeStyle = '#7e5226'; g.lineWidth = 26; g.strokeRect(13, 13, 230, 230);
      g.beginPath(); g.moveTo(26, 26); g.lineTo(230, 230); g.stroke();
      g.strokeStyle='rgba(255,222,168,.45)';g.lineWidth=2;g.strokeRect(3,3,250,250);
      for(const x of [14,242])for(const y of [14,128,242]){g.fillStyle='#4f493b';g.beginPath();g.arc(x,y,3,0,Math.PI*2);g.fill();g.fillStyle='#c1b291';g.fillRect(x-1,y-2,2,1);}
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
      speckle(g,256,70,450,.1,39);g.fillStyle='rgba(255,255,244,.4)';g.fillRect(0,22,256,1);
      return c;
    }
    case 'trunk': {
      const [c, g] = canvas(128, 256);
      g.fillStyle = '#6a5035'; g.fillRect(0, 0, 128, 256);
      const r = rng(17);
      for(let x=0;x<128;x+=4){g.strokeStyle=x%3?'rgba(37,31,19,.42)':'rgba(202,172,113,.23)';g.lineWidth=1+r()*3;g.beginPath();g.moveTo(x,0);for(let y=0;y<=256;y+=12)g.lineTo(x+Math.sin(y/24+x)*2,y);g.stroke();}
      weather(g,128,256,18,.12);speckle(g,128,256,650,.14,19);
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

export type GunFinish = 'paint' | 'steel' | 'grip' | 'wood' | 'brass';

/** Small neutral albedo sheets, tinted by each weapon's existing school-colour palette. */
export function gunTexture(finish: GunFinish, anisotropy: number): THREE.CanvasTexture {
  const w=finish==='paint'?512:finish==='wood'?256:128,h=finish==='steel'?256:128;
  const [c,g]=canvas(w,h),r=rng(201);
  g.fillStyle='#ececeb';g.fillRect(0,0,w,h);
  if(finish==='wood')planks(g,w,h,3,202,[237,232,217]);
  else if(finish==='grip') {
    g.fillStyle='#d0d1cc';g.fillRect(0,0,w,h);
    for(let y=-8;y<h+8;y+=8)for(let x=-8;x<w+8;x+=8){
      g.fillStyle='#a5aaa6';g.beginPath();g.moveTo(x,y+4);g.lineTo(x+4,y);g.lineTo(x+8,y+4);g.lineTo(x+4,y+8);g.fill();
      g.strokeStyle='#e2e4dc';g.lineWidth=1;g.beginPath();g.moveTo(x,y+4);g.lineTo(x+4,y);g.lineTo(x+8,y+4);g.stroke();
    }
  } else if(finish==='steel'||finish==='brass') {
    const grad=g.createLinearGradient(0,0,w,0);grad.addColorStop(0,'#b5bab9');grad.addColorStop(.35,'#fafbf2');grad.addColorStop(.65,'#d5d9d4');grad.addColorStop(1,'#a8afad');
    g.fillStyle=grad;g.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){g.strokeStyle=`rgba(57,67,63,${.025+r()*.06})`;g.lineWidth=.5;const x=r()*w;g.beginPath();g.moveTo(x,0);g.lineTo(x+.6,h);g.stroke();}
    if(finish==='steel') {
      for(const y of [8,h-12]){g.fillStyle='rgba(47,58,56,.27)';g.fillRect(0,y,w,2);g.fillStyle='rgba(255,255,244,.55)';g.fillRect(0,y+2,w,1);}
    }
  } else {
    // Receiver panel edges, rail grooves, fasteners and a small stamped school mark.
    const grad=g.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#fbfbf5');grad.addColorStop(.45,'#e5e8e3');grad.addColorStop(1,'#c6ceca');
    g.fillStyle=grad;g.fillRect(0,0,w,h);
    g.fillStyle='rgba(54,66,63,.35)';g.fillRect(0,12,w,3);g.fillRect(0,h-16,w,3);
    g.fillStyle='rgba(255,255,242,.8)';g.fillRect(0,16,w,2);g.fillRect(0,h-12,w,2);
    g.strokeStyle='rgba(58,71,67,.3)';g.lineWidth=2;g.strokeRect(80,29,310,65);
    for(let x=95;x<220;x+=20){g.fillStyle='#9eaba6';g.fillRect(x,42,10,36);g.fillStyle='#f7f8ee';g.fillRect(x+10,42,2,36);}
    g.fillStyle='#798d85';g.font='900 22px Arial,sans-serif';g.textAlign='center';g.fillText('QCC',300,64);
    g.font='9px monospace';g.fillText('CAMPUS SERIES',300,80);
    for(const x of [26,w-26])for(const y of [30,h-30]){
      g.fillStyle='#87958f';g.beginPath();g.arc(x,y,5,0,Math.PI*2);g.fill();
      g.fillStyle='#edf0e6';g.fillRect(x-3,y-3,5,1);g.fillStyle='#52645e';g.fillRect(x-3,y,6,1);
    }
    g.strokeStyle='rgba(255,255,241,.6)';g.lineWidth=1;
    for(let i=0;i<30;i++){const x=r()*w,y=r()>.5?19:h-20;g.beginPath();g.moveTo(x,y);g.lineTo(x+2+r()*10,y-1);g.stroke();}
  }
  weather(g,w,h,204,.04);speckle(g,w,h,Math.floor(w*h/70),.065,205);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=anisotropy;return t;
}

/** One extra, mipmapped sample keeps the floor crisp without a huge arena-wide image.
 * The colour/markings atlas stays separate from this neutral, two-metre aggregate tile. */
export function applyGroundDetail(material: THREE.MeshStandardMaterial, map: MapDef, pad: number, anisotropy: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256), r = rng(113), pixels = g.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 117 + Math.floor(r() * 24);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
  }
  g.putImageData(pixels, 0, 0);
  weather(g, 256, 256, 114, 0.055);
  const detail = new THREE.CanvasTexture(c);
  // Linear multiplier data, deliberately not sRGB colour.
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.anisotropy = anisotropy;
  material.onBeforeCompile = shader => {
    shader.uniforms.qcGroundDetail = { value: detail };
    shader.uniforms.qcGroundRepeat = { value: new THREE.Vector2(map.hx + pad, map.hz + pad) };
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D qcGroundDetail;\nuniform vec2 qcGroundRepeat;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(qcGroundDetail, vMapUv * qcGroundRepeat).rgb * 2.0;');
  };
  material.customProgramCacheKey = () => 'qcc-ground-detail-v1';
  return detail;
}

/** The whole arena floor as one painted plan. Covers [-hx-pad, hx+pad] x [-hz-pad, hz+pad]. */
export function groundTexture(map: MapDef, pad: number, anisotropy: number, resolution = 2048): THREE.CanvasTexture {
  const W = (map.hx + pad) * 2, H = (map.hz + pad) * 2, ppm = resolution / Math.max(W, H);
  const [c, g] = canvas(Math.round(W * ppm), Math.round(H * ppm));
  const X = (x: number) => (x + map.hx + pad) * ppm, Z = (z: number) => (z + map.hz + pad) * ppm, S = (m: number) => m * ppm;
  if (map.ground === 'campus') {
    const grass = (x: number, y: number, w: number, h: number, seed: number) => {
      g.fillStyle='#809766';g.fillRect(x,y,w,h);
      for(let row=0;row<h;row+=S(5)){g.fillStyle=Math.floor(row/S(5))%2?'rgba(42,80,42,.07)':'rgba(236,230,157,.06)';g.fillRect(x,y+row,w,Math.min(S(5),h-row));}
      g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.translate(x,y);
      weather(g,w,h,seed,.1);speckle(g,w,h,Math.floor(w*h/50),.045,seed+1);speckle(g,w,h,Math.floor(w*h/90),.04,seed+2,true);
      g.restore();
    };
    grass(0,0,c.width,c.height,97);
    for(const [surfaceIndex,p] of (map.surfaces ?? []).entries()) {
      const w=p.x1-p.x0,h=p.z1-p.z0;
      const px=X(p.x0),py=Z(p.z0),pw=S(w),ph=S(h);
      g.save();g.beginPath();g.rect(px,py,pw,ph);g.clip();
      g.fillStyle={paving:'#b9b9ab',court:'#628d81',asphalt:'#656f70',timber:'#bd9a6e',pool:'#39b4d2',grass:'#809766',parking:'#727a76'}[p.kind];
      g.fillRect(px,py,pw,ph);
      if(p.kind==='grass')grass(px,py,pw,ph,98+surfaceIndex);
      else {
        g.save();g.translate(px,py);weather(g,pw,ph,131+surfaceIndex,.075);
        speckle(g,pw,ph,Math.floor(pw*ph/32),.045,151+surfaceIndex);
        speckle(g,pw,ph,Math.floor(pw*ph/55),.04,171+surfaceIndex,true);g.restore();
      }
      if(p.kind==='paving'||p.kind==='timber') {
        if(p.kind==='paving') {
          const r=rng(141+surfaceIndex),step=S(1.25);
          for(let y=py;y<py+ph;y+=step)for(let x=px;x<px+pw;x+=step){
            g.fillStyle=`rgba(${r()>.5?'245,239,215':'53,68,56'},${.025+r()*.05})`;g.fillRect(x+1,y+1,step-2,step-2);
            g.strokeStyle='rgba(61,75,66,.24)';g.lineWidth=S(.035);g.strokeRect(x,y,step,step);
            g.strokeStyle='rgba(245,242,217,.32)';g.beginPath();g.moveTo(x+1,y+step-1);g.lineTo(x+1,y+1);g.lineTo(x+step-1,y+1);g.stroke();
          }
        } else {
          g.strokeStyle='rgba(77,50,24,.25)';g.lineWidth=1;
          for(let z=p.z0;z<p.z1;z+=.4){g.beginPath();g.moveTo(px,Z(z));g.lineTo(px+pw,Z(z));g.stroke();}
        }
      }
      if(p.kind==='asphalt'||p.kind==='parking') {
        // A few repaired hairline cracks, kept quiet enough to preserve target readability.
        const r=rng(181+surfaceIndex);g.strokeStyle='rgba(36,49,45,.23)';g.lineWidth=S(.045);
        for(let i=0;i<Math.floor(w*h/55);i++) {
          let x=px+r()*pw,y=py+r()*ph;g.beginPath();g.moveTo(x,y);
          for(let k=0;k<5;k++){x+=(r()-.45)*S(.6);y+=S(.2+r()*.35);g.lineTo(x,y);}g.stroke();
        }
      }
      if(p.kind==='parking') {
        g.strokeStyle='#e1e0ca';g.lineWidth=S(0.08);
        for(let z=p.z0+0.5;z<p.z1-2;z+=3.1)g.strokeRect(X(p.x0+0.4),Z(z),S(Math.min(4.5,w-0.8)),S(2.8));
      }
      if(p.kind==='pool') {
        // Swim lanes follow the pool's long image-horizontal axis; water stays part of the floor texture.
        const water=g.createLinearGradient(px,py,px,py+ph);water.addColorStop(0,'#399bb7');water.addColorStop(.35,'#54ccdc');water.addColorStop(1,'#268eaf');
        g.fillStyle=water;g.fillRect(px,py,pw,ph);
        g.strokeStyle='rgba(12,99,129,.24)';g.lineWidth=S(.025);
        for(let x=p.x0;x<p.x1;x+=.5){g.beginPath();g.moveTo(X(x),py);g.lineTo(X(x),py+ph);g.stroke();}
        for(let z=p.z0;z<p.z1;z+=.5){g.beginPath();g.moveTo(px,Z(z));g.lineTo(px+pw,Z(z));g.stroke();}
        g.strokeStyle='#196a88';g.lineWidth=S(.1);
        for(let k=0;k<6;k++){const z=p.z0+h*(k+.5)/6;g.beginPath();g.moveTo(X(p.x0+.7),Z(z));g.lineTo(X(p.x1-.7),Z(z));g.stroke();
          for(const x of [p.x0+.7,p.x1-.7]){g.beginPath();g.moveTo(X(x),Z(z-.25));g.lineTo(X(x),Z(z+.25));g.stroke();}}
        for(let k=1;k<6;k++)for(let x=p.x0+.3;x<p.x1-.3;x+=.3){g.fillStyle=Math.floor((x-p.x0)/.3)%4===0?'#eddfb3':'#e9f1dc';g.fillRect(X(x),Z(p.z0+h*k/6),S(.18),S(.055));}
        g.strokeStyle='rgba(237,255,244,.24)';g.lineWidth=S(.035);
        for(let z=p.z0;z<p.z1;z+=.55){g.beginPath();for(let x=p.x0;x<=p.x1;x+=.2)g.lineTo(X(x),Z(z+Math.sin(x*5+z)*.12));g.stroke();}
      }
      if(p.kind==='court'||p.kind==='timber') {
        const count=p.divisions??1, alongX=p.orientation==='x', inset=p.kind==='court'?0.6:2;
        for(let i=0;i<count;i++) {
          const x0=p.x0+(alongX?w*i/count:0),x1=p.x0+(alongX?w*(i+1)/count:w);
          const z0=p.z0+(!alongX?h*i/count:0),z1=p.z0+(!alongX?h*(i+1)/count:h);
          const mid=(z0+z1)/2,cx=(x0+x1)/2;
          if(p.kind==='court') {
            g.fillStyle=i%2?'rgba(29,91,85,.18)':'rgba(146,179,140,.12)';g.fillRect(X(x0+inset),Z(z0+inset),S(x1-x0-2*inset),S(z1-z0-2*inset));
          }
          // Outdoor court paint is vector geometry in scene.ts to stay sharp at foot level.
          if(p.kind==='court')continue;
          g.strokeStyle='#e7e5c6';g.lineWidth=S(0.09);g.strokeRect(X(x0+inset),Z(z0+inset),S(x1-x0-2*inset),S(z1-z0-2*inset));
          g.beginPath();g.moveTo(X(x0+inset),Z(mid));g.lineTo(X(x1-inset),Z(mid));g.stroke();
          g.beginPath();g.arc(X(cx),Z(mid),S(0.8),0,2*Math.PI);g.stroke();
          for(const z of [z0+inset,z1-inset]){g.beginPath();g.arc(X(cx),Z(z),S(Math.min(2,(x1-x0-2*inset)/2)),z<mid?0:Math.PI,z<mid?Math.PI:2*Math.PI);g.stroke();}
        }
      }
      g.restore();
    }
    g.fillStyle='#f4ecd6';g.font=`700 ${S(0.75)}px Arial,sans-serif`;g.textAlign='center';
    g.fillText('JOSEPH SULLIVAN DR',X(0),Z(-57));g.fillText('SOUTH ENTRANCE',X(4),Z(58));
    g.fillStyle='#4c6242';g.font=`900 ${S(1.8)}px Arial,sans-serif`;g.fillText('ENDEAVOUR PARK',X(0),Z(-36));
  } else if (map.ground === 'field') {
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
