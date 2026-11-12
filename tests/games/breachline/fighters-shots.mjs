// Evidence renders for the fighters: drives the dev-only fighter studio and writes PNGs.
// Usage: node tests/games/breachline/fighters-shots.mjs <baseUrl> <outDir> <job> [args...]
//   job "turntable" <squad> [lod]: front, side, rear, three-quarter and a head-and-shoulders close-up.
//   job "strip" <script> <squad> <side|front> [frames] [seconds]: frames of an animation, then a contact sheet.
//   job "eval" <js> [name]: runs an expression in the studio page and screenshots it.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [base, out, job, ...args] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${base}/src/games/breachline/render/fighters/studio/index.html`);
await page.waitForFunction(() => window.__breachlineFighters && window.__fightersReady, undefined, { timeout: 60000 });
const shot = async name => { const f = `${out}/${name}.png`; await page.screenshot({ path: f }); console.log('wrote', f); return f; };
if (job === 'turntable') {
  const [squad = '0', lod = '0', extra = '{}'] = args;
  for (const [name, o] of [['front', { yaw: 0 }], ['side', { yaw: 90 }], ['rear', { yaw: 180 }], ['front34', { yaw: 35, pitch: 10 }], ['rear34', { yaw: 215, pitch: 12 }], ['head', { yaw: 28, pitch: 6, dist: 1.3, at: [0, 1.5, 0] }]]) {
    const r = await page.evaluate(o => window.__breachlineFighters.shot(o), { ...o, squad: Number(squad), lod: Number(lod), ...JSON.parse(extra) });
    if (name === 'front') console.log(JSON.stringify(r));
    await shot(`s${squad}-l${lod}-${name}`);
  }
} else if (job === 'strip') {
  const [script, squad = '0', side = 'side', frames = '8', seconds = '1', extra = '{}'] = args;
  const files = [];
  await page.setViewportSize({ width: 360, height: 540 });
  for (let i = 0; i < Number(frames); i++) {
    const r = await page.evaluate(o => window.__breachlineFighters.clip(o), { script, squad: Number(squad), side, frames: Number(frames), frame: i, seconds: Number(seconds), dist: 6, ...JSON.parse(extra) });
    if (i === 0 || i === Number(frames) - 1) console.log(JSON.stringify({ headErr: r.headErr, shift: r.pelvisShift, arm: r.armReach, leg: r.legReach, aim: r.aimErr }));
    files.push(await shot(`${script}-${side}-s${squad}-${i}`));
  }
  const sheet = `${out}/${script}-${side}-s${squad}.png`;
  execFileSync('convert', [...files, '+append', '-colors', '128', sheet]);
  console.log('sheet', sheet);
} else if (job === 'eval') {
  console.log(JSON.stringify(await page.evaluate(args[0])));
  await shot(args[1] ?? 'eval');
}
await browser.close();
