#!/usr/bin/env node
/** The cheap shading path against the full one: the same views at 1280 x 720, each frame forced to finish (a one-pixel
 * read, in this script only) so the GPU cost shows even on a software renderer; frames side by side.
 *   node scripts/breachline-assets/shading.mjs --out <dir> [--url http://127.0.0.1:5199]
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
await page.goto(`${url}/?festive=off&arttier=high&artdbg=world#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 90000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); });
await page.waitForFunction(() => window.__breachlineTest.stats().ready, undefined, { timeout: 240000, polling: 500 });
await page.addStyleTag({ content: '.bl-hud { visibility: hidden !important; }' });
// Let every texture finish uploading and the probes be captured before timing.
await page.evaluate(() => { const h = window.__breachlineTest; for (let i = 0; i < 50; i++) h.advance(0.02); for (let i = 0; i < 14; i++) h.draw(); });
await mkdir(out, { recursive: true });
const VIEWS = { corridor: [-12, -0.5, -Math.PI / 2, 0], office: [-6.2, 2, -2.4, -0.1], lab: [-5.4, -2.6, -2.5, -0.05] };
for (const [name, [x, z, yaw, pitch]] of Object.entries(VIEWS)) {
  const ms = {};
  for (const cheap of [false, true]) {
    ms[cheap ? 'cheap' : 'full'] = await page.evaluate(([x, z, yaw, pitch, cheap]) => { const h = window.__breachlineTest, gl = document.querySelector('.breachline canvas').getContext('webgl2'), px = new Uint8Array(4);
      window.__blShade(cheap); h.place(x, z, yaw, pitch); h.advance(0.02); h.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now(); for (let k = 0; k < 3; k++) { h.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((performance.now() - t0) / 3).toFixed(0); }, [x, z, yaw, pitch, cheap]);
    await page.locator('canvas').first().screenshot({ path: join(out, `${name}-${cheap ? 'cheap' : 'full'}.png`), timeout: 300000 });
  }
  console.log(name, JSON.stringify(ms), (ms.full / ms.cheap).toFixed(2) + 'x');
}
await browser.close();
