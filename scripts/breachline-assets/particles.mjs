#!/usr/bin/env node
/** Evidence for the particles: frames mid-burst from a fixed spot, rounds into a plasterboard wall and a frag blast,
 * and the cost of the effects update and draw.
 *   node scripts/breachline-assets/particles.mjs --out <dir> [--url http://127.0.0.1:5199]
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'particles');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/?festive=off&arttier=high&artdbg=world#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 90000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); });
await page.waitForFunction(() => window.__breachlineTest.stats().ready, undefined, { timeout: 240000, polling: 500 });
await page.addStyleTag({ content: '.bl-hud { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
// One set of bursts, the same every run: impact dust and sparks on a wall, muzzle smoke, blood spray and a frag
// blast, frozen 0.12 s in.
const burst = async (name, t) => {
  await page.evaluate(t => {
    const h = window.__breachlineTest, fx = window.__blFx;
    h.place(-3.5, 0.6, 0, 0); h.advance(0.02);
    let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Rounds into the partition 2.6 m ahead: plaster dust, chips of light, sparks off the studs.
    for (let k = 0; k < 6; k++) { const x = -3.9 + k * 0.16, y = 1.2 + r() * 0.4; for (let i = 0; i < 6; i++) fx.dust(x, y, -1.95, (r() - 0.5) * 1.2, r() * 0.8, 0.6 + r() * 1.2, 0.08 + r() * 0.06, 0.9, 0.86, 0.82, 0.78, 0.6); for (let i = 0; i < 5; i++) fx.spark(x, y, -1.95, (r() - 0.5) * 3, r() * 2, 1 + r() * 3, 0.03, 0.25); }
    // Muzzle smoke drifting near the gun, and a blood spray off to the right.
    for (let i = 0; i < 8; i++) fx.dust(-3.3 + r() * 0.1, 1.35, 0.1 - r() * 0.3, (r() - 0.5) * 0.3, 0.2 + r() * 0.2, -0.4 - r() * 0.3, 0.05, 1.2, 0.8, 0.8, 0.8, 0.25, 2.5, -0.2, 1.5);
    for (let i = 0; i < 18; i++) fx.dust(-3.0, 1.4, -1.3, 0.6 + r() * 1.5, (r() - 0.3) * 1.5, (r() - 0.5) * 1.2, 0.025 + r() * 0.03, 0.5, 0.42, 0.03, 0.03, 0.9, 0.3, 6, 0.6);
    // A frag in the corridor beyond.
    fx.blast(-4.4, 0.2, -1.4, 1, [1.2, 1.15, 1.1], 'frag');
    for (let k = 0; k < Math.round(t / 0.02); k++) h.advance(0.02);
    h.draw();
  }, t);
  await page.locator('canvas').first().screenshot({ path: join(out, name), timeout: 300000 });
};
await burst('burst-early.png', 0.06);
await burst('burst-late.png', 0.5);
// Cost: 600 frames of the effects update with a full set of bursts, timed in the page.
console.log('cost', await page.evaluate(() => { const fx = window.__blFx, t0 = performance.now(); for (let k = 0; k < 600; k++) { if (k % 30 === 0) fx.blast(-6.5, 0.3, -0.5, 1, [1, 1, 1], 'frag'); fx.update(1 / 60, 720, 70); } return ((performance.now() - t0) / 600).toFixed(3) + ' ms per update'; }));
console.log(JSON.stringify(await page.evaluate(() => window.__breachlineTest.stats())).slice(0, 200));
await browser.close();
