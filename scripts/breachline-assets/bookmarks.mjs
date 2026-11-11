#!/usr/bin/env node
/** Renders Breachline's fixed camera bookmarks for visual review (plan section 8).
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node scripts/breachline-assets/bookmarks.mjs --url http://127.0.0.1:5199 --out <dir> [--only lab,corridor] [--art off] [--tier low|high]
 *
 * Same seed, same poses, every time. Uses the pre-installed Chromium (software rendering here, so frame rate means
 * nothing; the pictures do). Writes <name>-<tier>.png at 1280x720. */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199'), out = arg('out', 'bookmarks'), tier = arg('tier', 'high'), art = arg('art', 'on');
const only = arg('only', '')?.split(',').filter(Boolean), dbg = arg('dbg', '');

/** name: [x, z, yaw, pitch]. yaw 0 looks north (-z), pi/2 west. */
export const BOOKMARKS = {
  lab: [3.3, -2.7, 0.78, -0.1],
  'lab-west': [-5.4, -3.0, -0.95, -0.08],
  'lab-bench': [-0.6, -4.6, 1.2, -0.32],
  'lab-ceiling': [-1.2, -6.2, 0.9, 0.75],
  corridor: [13.5, -0.5, 1.5708, -0.04],
  archive: [7.2, 9.3, 0.9, -0.08],
  'server-room': [14.3, -2.6, 0.95, -0.06],
  'south-yard': [3, 19.5, 0, -0.02],
  'west-lot': [-25.5, 0.5, -1.5708, -0.02],
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
// The same first-visit choices the test fixtures make (tests/fixtures.ts): guest account, a study topic, no festive art.
await context.addInitScript(() => {
  if (window !== window.top) return;
  localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off');
  localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
});
const page = await context.newPage();
page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error' || process.env.VERBOSE) console.log(`[page] ${m.type()} ${m.text().slice(0, 1500)}`); });
page.on('pageerror', e => console.log(`[page] pageerror ${e.message}`));
await page.goto(`${url}/?festive=off${art === 'off' ? '&art=off' : ''}${dbg ? `&artdbg=${dbg}` : ''}${tier === 'low' ? '&arttier=low' : ''}#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(q => { const h = window.__breachlineTest; h.start({ seed: 7, quality: q === 'low' ? 'low' : 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.advance(5); }, tier);
// Let the art stream in.
if (art !== 'off') await page.waitForFunction(() => window.__breachlineTest.stats().level > 0 && window.__breachlineTest.stats().calls > 0, undefined, { timeout: 60000 });
await page.waitForTimeout(art === 'off' ? 500 : 6000);
// Transient banners and prompts are hidden so rounds compare like for like; the rest of the HUD stays.
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
for (const [name, [x, z, yaw, pitch]] of Object.entries(BOOKMARKS)) {
  if (only.length && !only.includes(name)) continue;
  await page.evaluate(([x, z, yaw, pitch]) => { const h = window.__breachlineTest; h.place(x, z, yaw, pitch); h.advance(0.05); h.draw(); h.draw(); }, [x, z, yaw, pitch]);
  await page.waitForTimeout(300);
  const file = join(out, `${name}-${tier}${art === 'off' ? '-procedural' : ''}.png`);
  await page.locator('canvas').first().screenshot({ path: file });
  // The first load after a source edit sometimes captures an empty canvas (the dev server re-transforming
  // modules); a frame with almost no variation is retaken once rather than kept as evidence.
  const { channels } = await sharp(file).stats();
  if (channels.slice(0, 3).every(c => c.stdev < 4)) {
    console.log(`${file}: blank frame, redrawing`);
    await page.evaluate(() => { window.__breachlineTest.draw(); window.__breachlineTest.draw(); });
    await page.waitForTimeout(1500);
    await page.locator('canvas').first().screenshot({ path: file });
  }
  console.log(file, JSON.stringify(await page.evaluate(() => window.__breachlineTest.stats())));
}
await browser.close();
