#!/usr/bin/env node
/** Evidence for the map-fill plan's section 12.1: an enemy hit in the chest, the leg and the head (spray, spatter on
 * the wall behind), then killed (fall, pool spreading). `--blood off` shows the stand-ins.
 *
 *   node scripts/breachline-assets/blood.mjs --out <dir> [--blood off]
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'blood'), off = arg('blood', 'on') === 'off';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.text().startsWith('bleed')) console.log(m.text()); });
await page.goto(`${url}/?festive=off&arttier=high&artdbg=fxfast${off ? '&blood=off' : ''}#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); });
await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 });
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-prep { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
// Stand 3.5 m from the enemy on the side away from the nearest wall behind it, and aim at a body height.
const aim = (y, shots) => page.evaluate(([y, shots]) => {
  const h = window.__breachlineTest, s = h.state(), me = s.players[s.self], foe = s.players.find(p => p.squad !== me.squad && p.alive);
  if (!foe) return null;
  const x = foe.x + 3.5, z = foe.z, yaw = Math.atan2(-(foe.x - x), -(foe.z - z)), pitch = Math.atan2(y - 1.6, 3.5);
  h.place(x, z, yaw, pitch); h.advance(0.1);
  for (let i = 0; i < shots; i++) { h.hold({ fire: true }, 0.05, { fire: true }); h.advance(0.12); }
  for (let i = 0; i < 2; i++) h.draw();
  return { foe: [foe.x, foe.z], hp: h.state().players.find(p => p.id === foe.id).hp };
}, [y, shots]);
for (const [name, y] of [['leg', 0.55], ['chest', 1.15], ['head', 1.62]]) {
  console.log(name, JSON.stringify(await aim(y, 1)));
  await page.waitForTimeout(200);
  await page.locator('canvas').first().screenshot({ path: join(out, `hit-${name}.png`), timeout: 120000 });
}
// The fall, then the pool spreading: effects age with drawn frames (`fxfast` ages them 25 times faster).
for (const [i, draws] of [[0, 1], [1, 4], [2, 12]]) {
  await page.evaluate(([i, draws]) => { const h = window.__breachlineTest; if (i === 0) h.advance(0.6); const s = h.state(), me = s.players[s.self]; h.place(me.x, me.z, Math.PI / 2, -0.55); h.advance(0.02); for (let k = 0; k < draws; k++) h.draw(); }, [i, draws]);
  await page.locator('canvas').first().screenshot({ path: join(out, `death-${i}.png`), timeout: 120000 });
}
await browser.close();
