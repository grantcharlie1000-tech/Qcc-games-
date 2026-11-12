#!/usr/bin/env node
/** Evidence for the map-fill plan's section 12.3: one set piece of each family, intact, damaged and wrecked.
 * Writes <out>/<family>-<state>.png; join them into strips afterwards.
 *
 *   node scripts/breachline-assets/setpieces.mjs --out <dir> [--only skip,pallets]
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'setpieces'), only = arg('only', '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/?festive=off&arttier=high&artdbg=world#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); });
await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env' && window.__blPieces, undefined, { timeout: 180000, polling: 500 });
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-prep, .bl-hud { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
const picks = await page.evaluate(() => { const seen = new Map(); window.__blPieceDefs.forEach((p, i) => { if (!seen.has(p.family)) seen.set(p.family, i); }); return [...seen]; });
for (const [family, i] of picks) {
  if (only && !only.split(',').includes(family)) continue;
  for (const [s, name] of [[0, 'intact'], [1, 'damaged'], [2, 'wrecked']]) {
    await page.evaluate(([i, s]) => {
      const h = window.__breachlineTest, p = window.__blPieceDefs[i], big = Math.max(p.x1 - p.x0, p.z1 - p.z0) > 2;
      const [x, z, yaw] = window.__blPieceView(i, big ? 3.2 : 1.9);
      window.__blPieces.force(i, s);
      h.place(x, z, yaw, p.y1 > 1.5 ? -0.12 : -0.38); h.advance(0.1); for (let k = 0; k < 4; k++) h.draw();
    }, [i, s]);
    await page.locator('canvas').first().screenshot({ path: join(out, `${family}-${name}.png`), timeout: 120000 });
  }
  console.log(family, i);
}
await browser.close();
