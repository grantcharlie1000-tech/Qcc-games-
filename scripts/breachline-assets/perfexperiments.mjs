#!/usr/bin/env node
/** Performance experiments: the same views timed under debug switches (flat colour, overdraw count, depth pre-pass,
 * no post, no fighters, no viewmodel, no transparents, lowest LOD, only the rooms in view), each frame forced to finish
 * (a one-pixel read, in this script only) so the GPU cost shows even on a software renderer.
 *   node scripts/breachline-assets/perfexperiments.mjs [--quality high|low|auto] [--size 1280x720] [--views corridor,office,lab] --cases '{"label":{...switches}}'
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'shading');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
const size = (arg('size', '1280x720')).split('x').map(Number), quality = arg('quality', 'high');
await page.setViewportSize({ width: size[0], height: size[1] });
await page.goto(`${url}/?festive=off&arttier=high&artdbg=world#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 90000 });
await page.evaluate(q => { const h = window.__breachlineTest; h.start({ seed: 7, quality: q, teamSize: 5, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); }, quality);
await page.waitForFunction(() => window.__breachlineTest.stats().ready, undefined, { timeout: 240000, polling: 500 });
await page.evaluate(() => { const h = window.__breachlineTest; for (let i = 0; i < 50; i++) h.advance(0.02); for (let i = 0; i < 14; i++) h.draw(); });
const R = { corridor: { x0: -15, z0: -2, x1: 15, z1: 1 }, office: { x0: -7, z0: 1, x1: 0, z1: 10 }, lab: { x0: -6, z0: -10, x1: 4, z1: -2 } };
const VIEWS = { corridor: [-12, -0.5, -Math.PI / 2, 0, ['corridor']], office: [-6.2, 2, -2.4, -0.1, ['office', 'corridor']], lab: [-4, -6.5, 2.4, -0.05, ['lab', 'corridor']] };
const frame = (view, X) => page.evaluate(([v, X, R]) => {
  const h = window.__breachlineTest, gl = document.querySelector('.breachline canvas').getContext('webgl2'), px = new Uint8Array(4), E = window.__blExperiment, S = window.__blScenes;
  for (const k of Object.keys(E)) delete E[k];
  const hideAll = X.hideAll; delete X.hideAll; if (X.cheap !== undefined) window.__blShade(X.cheap); delete X.cheap;
  Object.assign(E, X, { on: true }); if (X.rooms) E.rooms = X.rooms.map(n => R[n]);
  S.scene.visible = S.artScene.visible = !hideAll;
  h.place(v[0], v[1], v[2], v[3]); h.advance(0.02); h.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now(); for (let k = 0; k < 3; k++) { h.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } const ms = (performance.now() - t0) / 3;
  let od = null;
  if (X.overdraw) { h.draw(); const w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, all = new Uint8Array(w * hh * 4); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, all); let sum = 0, max = 0; for (let i = 0; i < all.length; i += 4) { sum += all[i]; if (all[i] > max) max = all[i]; } od = { avg: +(sum / (w * hh)).toFixed(2), max }; }
  for (const k of Object.keys(E)) delete E[k]; S.scene.visible = S.artScene.visible = true;
  return { ms: Math.round(ms), od, calls: h.stats().calls };
}, [view, X, R]);
const which = arg('views', 'corridor,office,lab').split(',');
const CASES = JSON.parse(arg('cases', '{}'));
for (const name of which) {
  const v = VIEWS[name], out = {};
  for (const [label, X] of Object.entries(CASES)) { const X2 = { ...X }; if (X2.rooms === 'view') X2.rooms = v[4]; out[label] = await frame(v, X2); }
  console.log(name, JSON.stringify(out));
}
await browser.close();
