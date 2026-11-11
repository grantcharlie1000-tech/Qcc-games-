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
  'corridor-west': [-13.6, 0.3, -1.35, -0.06],
  archive: [7.2, 9.3, 0.9, -0.08],
  'archive-north': [3.75, 1.5, 3.1416, -0.06],
  // The reading table and its desk lamp.
  'archive-desk': [5.6, 4.3, 0.95, -0.3],
  'server-room': [14.3, -2.6, 0.95, -0.06],
  // The Lobby from the east by the entrance, and the reception desk's public front.
  lobby: [-7.7, 9.2, 0.6, -0.08],
  'lobby-desk': [-10.4, 2.0, 2.9, -0.15],
  // Down the aisle between the two long rack runs, and close on a rack face.
  'server-aisle': [12.6, -6.3, 1.5708, -0.05],
  'server-rack': [8.2, -6.5, 0.25, -0.12],
  'south-yard': [3, 19.5, 0, -0.02],
  // The south yard's painted bays and a grass verge, looking south.
  'yard-bays': [3.5, 13.2, 2.75, -0.22],
  // Yard dressing: the covered car and the crate stack from the building's apron; the drums by the west container.
  'yard-car': [3.2, 11.6, -2.28, -0.12],
  'yard-drums': [-14.5, 17.2, 2.45, -0.1],
  // The south container's door end, close.
  'yard-container': [2.2, 18.8, 0.85, -0.08],
  // The crate stack by the building with its military crate and jerrycans.
  'yard-crate': [4.6, 11.5, 2.18, -0.3],
  // Readability: a full squad lined up at the South Yard spawn against the perimeter, seen from near the building
  // (about 7 m), once per squad (seed 2 puts squad 0's attack there in round 2 and squad 1's in round 4).
  'yard-squad-0': [2.5, 12.6, 3.1416, -0.02],
  'yard-squad-1': [2.5, 12.6, 3.1416, -0.02],
  'west-lot': [-25.5, 0.5, -1.5708, -0.02],
  // Destruction views (rendered after the damage setup below): the charge's breach from the corridor and from the
  // Lab, and the rifle-chewed wall west of it.
  breach: [1.5, 0.35, 0, -0.06],
  'breach-lab': [1.2, -3.6, 3.1416, -0.06],
  'shot-wall': [-4.4, -0.4, 0.15, -0.04],
  'breach-close': [1.9, -1.2, 0.35, -0.12],
  // A charge placed on the Lab's south wall, before it goes off (taken first: the damage set detonates it).
  charge: [1.62, -0.05, 0.3, -0.32],
  // The barricaded north window of the Lab, from inside.
  barricade: [-2.75, -8.2, 0, -0.05],
  // The same window after a burst: snapped planks and splinters (taken after 'barricade').
  'barricade-shot': [-2.75, -8.2, 0, -0.05],
  // A wall the defending bots reinforce in preparation (panel 32, z = 1, x 0 to 2.75); needs REINFORCE=1.
  'reinforced-a': [1.4, 3.2, 0, -0.02],
  'reinforced-b': [1.4, -1.2, 3.1416, -0.02],
  'reinforced-shot': [1.4, -1.2, 3.1416, -0.02],
  // The uplink planted at site A (counting), then the same after the link completes.
  uplink: [1.6, -2.7, 0.78, -0.34],
  'uplink-done': [1.6, -2.7, 0.78, -0.34],
  // A frag thrown into the Lab; FRAG_T seconds after it goes off (FXDRAWS extra frames age the effects).
  frag: [2.2, -2.2, 1.25, -0.3],
};
/** A breach charge pressed onto the wall and left armed. */
const PLANT = `(() => { const h = window.__breachlineTest; h.place(1.5, -0.6, 0, -0.25); h.advance(0.1); h.hold({}, 1.4, { breach: true }); h.advance(0.3); })()`;
/** The same damage every time: a magazine into the Lab's south wall from the corridor, then a breach charge. */
const DAMAGE = `(() => { const h = window.__breachlineTest;
  h.place(-4.6, 0.2, 0, -0.05); h.advance(0.1); h.hold({ fire: true, mx: 1 }, 0.8);
  h.place(1.5, -0.6, 0, -0.25); h.advance(0.1); h.hold({}, 1.4, { breach: true });
  h.place(1.5, 0.55, 0, -0.1); h.advance(0.2); h.hold({}, 0.2, { breach: true }); h.advance(${Number(process.env.AFTER ?? 9)}); for (let i = 0; i < ${Number(process.env.FXDRAWS ?? 0)}; i++) h.draw(); })()`;

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
await page.goto(`${url}/?festive=off${process.env.FIGHTERS ? `&fighters=${process.env.FIGHTERS}` : ""}${art === 'off' ? '&art=off' : ''}${dbg ? `&artdbg=${dbg}` : ''}&arttier=${tier === 'low' ? 'low' : 'high'}#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
// REINFORCE=1: a full squad each side, and the defending bots get their preparation (they reinforce site walls).
if (process.env.REINFORCE) await page.evaluate(q => { const h = window.__breachlineTest; h.start({ seed: 7, quality: q === 'low' ? 'low' : 'high', teamSize: 5, bots: true }); h.freeze(true); for (let i = 0; i < 12; i++) h.advance(2); h.still(); }, tier);
else await page.evaluate(q => { const h = window.__breachlineTest; h.start({ seed: 7, quality: q === 'low' ? 'low' : 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.advance(5); }, tier);
// Let the art stream in.
if (art !== 'off') await page.waitForFunction(() => window.__breachlineTest.stats().level > 0 && window.__breachlineTest.stats().calls > 0, undefined, { timeout: 60000 });
// The art warms up off the critical path (seconds under software GL), then goes live; High then captures its probes.
if (art !== 'off') await page.waitForFunction(t => { const a = window.__breachlineTest.stats().art; return t === 'low' ? a !== 'none' : a === 'env'; }, tier, { timeout: 120000, polling: 500 });
await page.waitForTimeout(art === 'off' ? 500 : 3000);
// Transient banners and prompts are hidden so rounds compare like for like; the rest of the HUD stays.
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-prep { visibility: hidden !important; }' });
await mkdir(out, { recursive: true });
let damaged = false;
for (const [name, [x, z, yaw, pitch]] of Object.entries(BOOKMARKS)) {
  if (only.length && !only.includes(name)) continue;
  if (name === 'charge') await page.evaluate(PLANT);
  // The frag's fuse is 2.6 s: throw, then step just past it (effects age only with drawn frames, FXDRAWS of them).
  if (name === 'frag') await page.evaluate(n => { const h = window.__breachlineTest; h.place(1.2, -2.6, 0.75, -0.45); h.advance(0.1); h.hold({}, 0.1, { grenade: true }); h.advance(2.65); for (let i = 0; i < n; i++) h.draw(); }, Number(process.env.FXDRAWS ?? 0));
  if (name.startsWith('yard-squad-')) await page.evaluate(r => { const h = window.__breachlineTest;
    if (r === 2 || h.state().round > r) { h.start({ seed: 2, teamSize: 5, bots: true }); h.freeze(true); h.advance(0.2); h.still(); }
    for (let i = 0; i < 20 && !(h.state().round === r && h.state().phase === 'prep'); i++) { h.skip(999); h.advance(0.3); }
    h.advance(1); }, name.endsWith('0') ? 2 : 4);
  if (name === 'uplink') await page.evaluate(() => { const h = window.__breachlineTest; h.place(-1, -4, 0, 0); h.hold({ use: true }, 5.3); h.advance(8); });
  if (name === 'uplink-done') await page.evaluate(() => { const h = window.__breachlineTest; h.skip(31); h.advance(0.8); });
  if (name === 'reinforced-shot') await page.evaluate(() => { const h = window.__breachlineTest; h.place(1.4, -1.2, 3.1416, 0.02); h.advance(0.1); h.hold({ fire: true, mx: 0.6 }, 0.8); h.advance(0.3); for (let i = 0; i < 8; i++) h.draw(); });
  if (name === 'barricade-shot') await page.evaluate(() => { const h = window.__breachlineTest; h.place(-2.75, -8.2, 0, 0.05); h.advance(0.1); h.hold({ fire: true, mx: 0.8 }, 0.7); h.advance(0.5); for (let i = 0; i < 6; i++) h.draw(); });
  if (['breach', 'breach-lab', 'shot-wall', 'breach-close'].includes(name) && !damaged) { await page.evaluate(DAMAGE); damaged = true; await page.waitForTimeout(500); }
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
// Script cost (after the screenshots: 60 back-to-back frames queue up in a software GPU): 60 frames at the first bookmark, smoothed in the scene's own counter.
if (process.env.MEASURE) {
  const [x, z, yaw, pitch] = BOOKMARKS[only[0] ?? 'lab'];
  const ms = await page.evaluate(([x, z, yaw, pitch]) => {
    const h = window.__breachlineTest; h.place(x, z, yaw, pitch);
    const t = []; for (let i = 0; i < 60; i++) { const a = performance.now(); h.draw(); t.push(performance.now() - a); }
    t.sort((p, q) => p - q);
    return { median: t[30], p90: t[54], sceneCpu: h.stats().cpu };
  }, [x, z, yaw, pitch]);
  console.log('script ms per frame', JSON.stringify(ms));
}
await browser.close();
