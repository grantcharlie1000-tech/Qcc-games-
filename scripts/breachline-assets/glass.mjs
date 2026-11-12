#!/usr/bin/env node
/** Evidence for the map-fill plan's section 10.2: a window pane intact, cracked by one round, shattered by a second.
 *
 *   node scripts/breachline-assets/glass.mjs --out <dir>
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'glass');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/?festive=off&arttier=high&artdbg=fxfast#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); });
await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 });
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-prep { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
// The south window of the Archive (x 3 to 4.5 on the south wall), from the yard, 2.6 m out.
const at = [3.75, 12.8, 0, 0.0];
for (const [name, shots] of [['intact', 0], ['cracked', 1], ['shattered', 1]]) {
  await page.evaluate(([at, shots]) => { const h = window.__breachlineTest; h.place(at[0], at[1], at[2], at[3]); h.advance(0.1); for (let i = 0; i < shots; i++) { h.hold({ fire: true }, 0.05, { fire: true }); h.advance(0.25); } for (let i = 0; i < 6; i++) h.draw(); }, [at, shots]);
  await page.locator('canvas').first().screenshot({ path: join(out, `${name}.png`), timeout: 120000 });
  console.log(name);
}
await browser.close();
