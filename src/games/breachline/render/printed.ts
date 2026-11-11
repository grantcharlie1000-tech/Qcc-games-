/** Printed things drawn at load time: an original safety sign and a wall-clock face. No external art. */
import * as THREE from 'three';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** A mandatory-action sign in the usual blue disc style: goggles pictogram over a short instruction. */
export const safetySign = () => canvasTexture(192, 256, g => {
  g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, 192, 256);
  g.fillStyle = '#1d5fa8'; g.beginPath(); g.arc(96, 92, 70, 0, 7); g.fill();
  // Goggles: a band, two lenses and a bridge, in white.
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.beginPath(); g.moveTo(34, 88); g.lineTo(158, 88); g.stroke();
  g.fillStyle = '#ffffff';
  for (const x of [70, 122]) { g.beginPath(); g.ellipse(x, 94, 24, 17, 0, 0, 7); g.fill(); }
  g.fillStyle = '#1d5fa8'; for (const x of [70, 122]) { g.beginPath(); g.ellipse(x, 94, 15, 9, 0, 0, 7); g.fill(); }
  g.fillStyle = '#1d5fa8'; g.fillRect(0, 178, 192, 78);
  g.fillStyle = '#ffffff'; g.font = 'bold 21px sans-serif'; g.textAlign = 'center';
  g.fillText('EYE PROTECTION', 96, 210); g.fillText('MUST BE WORN', 96, 236);
});

/** A plain office clock face at ten past ten. */
export const clockFace = () => canvasTexture(256, 256, g => {
  g.fillStyle = '#f2f1ec'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  g.strokeStyle = '#222'; g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, long = i % 5 === 0, r0 = long ? 96 : 106;
    g.lineWidth = long ? 7 : 2; g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114); g.stroke();
  }
  const hand = (a: number, len: number, w: number, col: string) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(128 - Math.sin(a) * 14, 128 + Math.cos(a) * 14); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke(); };
  hand((10 + 10 / 60) / 12 * Math.PI * 2, 62, 9, '#1b1b1b'); hand(10 / 60 * Math.PI * 2, 92, 6, '#1b1b1b'); hand(38 / 60 * Math.PI * 2, 100, 2, '#b02020');
  g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(128, 128, 7, 0, 7); g.fill();
});

/** An exit sign: a running figure heading for a doorway, and an arrow, white on green. */
export const exitSign = () => canvasTexture(256, 128, g => {
  g.fillStyle = '#1f8a4c'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#f4fff6';
  g.fillRect(150, 18, 52, 92); g.fillStyle = '#1f8a4c'; g.fillRect(158, 26, 36, 84);
  g.fillStyle = '#f4fff6'; g.strokeStyle = '#f4fff6'; g.lineCap = 'round'; g.lineWidth = 10;
  g.beginPath(); g.arc(112, 30, 10, 0, 7); g.fill();
  g.beginPath(); g.moveTo(106, 46); g.lineTo(96, 74); g.lineTo(116, 92); g.lineTo(108, 112); g.moveTo(96, 74); g.lineTo(78, 100);
  g.moveTo(104, 52); g.lineTo(126, 64); g.moveTo(104, 52); g.lineTo(84, 62); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.moveTo(20, 64); g.lineTo(62, 64); g.stroke();
  g.beginPath(); g.moveTo(44, 44); g.lineTo(66, 64); g.lineTo(44, 84); g.stroke();
});

/** A fire-equipment sign: an extinguisher silhouette, white on red. */
export const fireSign = () => canvasTexture(128, 160, g => {
  g.fillStyle = '#c4231c'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(48, 46, 32, 88, 10); g.fill();
  g.fillRect(56, 30, 16, 18); g.fillRect(70, 30, 26, 7); g.fillRect(40, 34, 18, 6);
  g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText('FIRE', 64, 156);
});
