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
