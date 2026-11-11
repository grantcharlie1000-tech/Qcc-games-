#!/usr/bin/env node
/** Evidence for the map-fill plan's section 10.1: a short burst into each material, then the marks it left, close.
 *
 *   node scripts/breachline-assets/marks.mjs --out <dir>
 * Writes <material>.png at 1280x720 (software rendering; frame rate means nothing here). */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'marks');
/** material: [x, z, yaw, pitch] to stand and shoot from (yaw 0 looks north, -z). */
const SHOTS = {
  'brick-outside': [-1, 11.4, 0, 0.1],
  asphalt: [0.5, 13.2, 0, -1.2],
  'tile-floor': [-1, -4, 0, -1.25],
  ceiling: [-1, -4.3, 0, 1.35],
  'painted-block': [-13.6, 3.6, Math.PI / 2, 0.1],
  timber: [2.2, 11.5, Math.PI, -0.3],
  fabric: [-10.4, 3.3, -Math.PI / 2, -0.55],
  steel: [8, -6.3, 0, -0.1],
  carpet: [-3.2, 8.2, 0, -1.25],
  plasterboard: [-12.5, -0.2, 0, 0.05],
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.goto(`${url}/?festive=off&arttier=high&artdbg=fxfast#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); });
await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 });
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-prep { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
for (const [name, [x, z, yaw, pitch]] of Object.entries(SHOTS)) {
  await page.evaluate(([x, z, yaw, pitch]) => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.place(x, z, yaw, pitch); h.advance(0.1); h.hold({ fire: true, mx: 0.25 }, 0.6); h.advance(0.3); for (let i = 0; i < 12; i++) h.draw(); }, [x, z, yaw, pitch]);
  await page.waitForTimeout(300);
  await page.locator('canvas').first().screenshot({ path: join(out, `${name}.png`), timeout: 120000 });
  console.log(name);
}
await browser.close();
