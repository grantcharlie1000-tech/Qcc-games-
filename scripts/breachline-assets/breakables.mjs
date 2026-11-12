#!/usr/bin/env node
/** Evidence for map-fill 10.2's breakables: for each class (screen, status light, glass, mug, bin, leaf, ceiling
 * fitting, and a blast knocking loose things off a desk) a frame before and after, from 1.4 m.
 *
 *   node scripts/breachline-assets/breakables.mjs --out <dir>
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'breakables');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/?festive=off&arttier=high&artdbg=world,fxfast#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); });
await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env' && window.__blBreak, undefined, { timeout: 180000, polling: 500 });
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-prep, .bl-hud { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
for (const role of ['screen', 'led', 'glass', 'mug', 'bin', 'leaf', 'fitting', 'blast']) {
  const ok = await page.evaluate(role => {
    const art = window.__blArt, rooms = window.__blRooms;
    const small = p => (p.x1 - p.x0) * (p.y1 - p.y0) * (p.z1 - p.z0) < 0.004;
    const pick = role === 'fitting' ? art.fittings[0] : role === 'blast' ? art.markables.dress.find(p => p.role === 'mug') : art.markables.dress.find(p => p.role === role && (role !== 'glass' || (small(p) && p.y1 < 1.4)));
    if (!pick) return false;
    const cx = role === 'fitting' ? pick.x : (pick.x0 + pick.x1) / 2, cz = role === 'fitting' ? pick.z : (pick.z0 + pick.z1) / 2, cy = role === 'fitting' ? 2.95 : (pick.y0 + pick.y1) / 2;
    // Stand 1.4 m off towards the open side (the four directions, the one furthest from any wall), facing it.
    const room = rooms.find(r => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1) ?? { x0: cx - 3, x1: cx + 3, z0: cz - 3, z1: cz + 3 };
    const mx = (room.x0 + room.x1) / 2, mz = (room.z0 + room.z1) / 2, l = Math.hypot(mx - cx, mz - cz) || 1, d = role === 'fitting' ? 1.2 : role === 'mug' || role === 'glass' || role === 'blast' || role === 'bin' || role === 'leaf' ? 0.8 : 1.4;
    const x = cx + (mx - cx) / l * d, z = cz + (mz - cz) / l * d, yaw = Math.atan2(-(cx - x), -(cz - z)), pitch = Math.atan2(cy - 1.6, d);
    window.__pick = { pick, x, z, yaw, pitch, cx, cy, cz };
    const h = window.__breachlineTest; h.place(x, z, yaw, pitch); h.advance(0.05); for (let k = 0; k < 4; k++) h.draw();
    return true;
  }, role);
  if (!ok) { console.log(role, 'none found'); continue; }
  await page.locator('canvas').first().screenshot({ path: join(out, `${role}-before.png`), timeout: 180000 });
  await page.evaluate(role => {
    const b = window.__blBreak, { pick, cx, cy, cz, x, z } = window.__pick, dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1;
    if (role === 'fitting') b.shotCeiling(cx, 9, cz);
    else if (role === 'blast') b.blast(cx + 0.3, cy, cz + 0.3);
    else b.shotDress(pick, cx, cy, cz, dx / l, 0, dz / l);
    const h = window.__breachlineTest; for (let k = 0; k < 4; k++) { h.advance(0.1); h.draw(); }
  }, role);
  await page.locator('canvas').first().screenshot({ path: join(out, `${role}-after.png`), timeout: 180000 });
  console.log(role);
}
await browser.close();
