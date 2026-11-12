// Evidence renders for the second-build weapons (studio v2): design sheet, clay and textured views beside the
// benchmark pistol. Usage: node tests/games/breachline/hero-v2-shots.mjs <baseUrl> <outDir> <job> [dir]
//   job "sheet": the design sheet. job "clay": three-quarter front and rear in clay. job "tex": textured, moving light.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, job, dir = 'ar5'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const vp = job === 'sheet' ? { width: 1600, height: 900 } : { width: 1600, height: 900 };
const page = await browser.newPage({ viewport: vp });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${base}/src/games/breachline/render/hero/studio/v2.html`);
await page.waitForFunction(() => window.__heroV2Ready, undefined, { timeout: 60000 });
console.log(JSON.stringify(await page.evaluate(([d, t]) => window.__heroV2.load(d, t), [dir, job === 'tex'])));
const shot = async name => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('wrote', `${out}/${name}.png`); };
const run = o => page.evaluate(o => window.__heroV2.studio(o), o);
if (job === 'sheet') { await page.evaluate(() => window.__heroV2.sheet()); await shot(`${dir}-design-sheet`); }
else if (job === 'clay') for (const view of ['front34', 'rear34', 'right', 'close']) { await run({ view }); await shot(`${dir}-clay-${view}`); }
else if (job === 'tex') {
  for (const view of ['front34', 'rear34', 'close']) { await run({ view, textured: true }); await shot(`${dir}-tex-${view}`); }
  for (const l of [0, 0.33, 0.66, 1]) { await run({ view: 'close', textured: true, light: l }); await shot(`${dir}-tex-light-${l}`); }
}
await browser.close();
