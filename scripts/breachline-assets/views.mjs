#!/usr/bin/env node
/** Renders named views (x, z, yaw, pitch) of a running Breachline build, for before-and-after evidence.
 *
 *   node scripts/breachline-assets/views.mjs --views views.json --out <dir> [--url http://127.0.0.1:5199]
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'views'), views = JSON.parse(await readFile(arg('views', 'views.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/?festive=off&arttier=high#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); });
await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 });
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-prep, .bl-hud { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
for (const [name, v] of Object.entries(views)) {
  await page.evaluate(v => { const h = window.__breachlineTest; h.place(v[0], v[1], v[2], v[3]); h.advance(0.1); for (let k = 0; k < 4; k++) h.draw(); }, v);
  await page.locator('canvas').first().screenshot({ path: join(out, `${name.replace(/ /g, '-')}.png`), timeout: 120000 });
  console.log(name);
}
await browser.close();
