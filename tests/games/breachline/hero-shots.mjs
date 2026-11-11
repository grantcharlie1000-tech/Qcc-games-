// Evidence renders for the hero models: drives the dev-only studio and the game, writes PNGs.
// Usage: node tests/games/breachline/hero-shots.mjs <baseUrl> <outDir> <job> [args...]
//   job "turntable" <weapon> [lod]: three angles plus a close-up.
//   job "eval" <js>: runs an expression in the studio page and screenshots it as <outDir>/eval.png.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, job, ...args] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${base}/src/games/breachline/render/hero/studio/index.html`);
await page.waitForFunction(() => window.__breachlineHero && window.__heroReady);
const shot = async name => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('wrote', `${out}/${name}.png`); };
if (job === 'turntable') {
  const [id, lod = '0'] = args;
  for (const [name, o] of [['side', { yaw: 90, pitch: 6 }], ['front34', { yaw: 35, pitch: 18, dist: 1.6 }], ['rear34', { yaw: 215, pitch: 22, dist: 1.6 }], ['left', { yaw: -90, pitch: 4 }], ['close', { yaw: 70, pitch: 14, dist: 0.7 }]]) {
    const r = await page.evaluate(([id, o]) => window.__breachlineHero.weapon(id, o), [id, { ...o, lod: Number(lod) }]);
    if (name === 'side') console.log(JSON.stringify(r));
    await shot(`${id}-l${lod}-${name}`);
  }
} else if (job === 'fp') {
  const [id] = args;
  for (const [name, o] of [['hip', {}], ['ads', { ads: 1 }], ['orbit-r', { orbit: true, yaw: 60, pitch: 10 }], ['orbit-l', { orbit: true, yaw: -70, pitch: 5 }], ['orbit-low', { orbit: true, yaw: 20, pitch: -35 }], ['grip-r', { orbit: true, yaw: 80, pitch: 5, dist: 0.45, at: [0, -0.12, 0.02] }], ['grip-l', { orbit: true, yaw: -80, pitch: 5, dist: 0.45, at: [0, -0.12, 0.02] }], ['support-l', { orbit: true, yaw: -60, pitch: -20, dist: 0.5, at: [0, -0.1, -0.3] }], ['support-r', { orbit: true, yaw: 70, pitch: -10, dist: 0.5, at: [0, -0.1, -0.3] }]]) {
    console.log(name, JSON.stringify(await page.evaluate(([id, o]) => window.__breachlineHero.fp(id, o), [id, o])));
    await shot(`fp-${id}-${name}`);
  }
} else if (job === 'hand') {
  for (const [name, o] of [['open-top', { pose: 'open', pitch: 70 }], ['open-palm', { pose: 'open', pitch: -70 }], ['open-side', { pose: 'open', yaw: -90, pitch: 10 }], ['relaxed-side', { pose: 'relaxed', yaw: -90, pitch: 10 }], ['fist-34', { pose: 'fist', yaw: -40, pitch: 30 }], ['wire', { pose: 'open', pitch: 70, wire: true }]]) {
    console.log(name, JSON.stringify(await page.evaluate(o => window.__breachlineHero.hand(o), o)));
    await shot(`hand-${name}`);
  }
} else if (job === 'eval') {
  console.log(JSON.stringify(await page.evaluate(args[0])));
  await shot(args[1] ?? 'eval');
}
await browser.close();
