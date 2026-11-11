// In-game evidence for the hero models, under the real lighting.
// Usage: node tests/games/breachline/hero-game.mjs <baseUrl> <outDir> [job]
//   job "fp" (default): weapon at the hip and aimed at the Lab bench and in the corridor; an eight-frame strip of a
//   tactical and an empty reload (contact sheets). Writes PNGs.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, job = 'fp', kitArg] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => {
  if (window !== window.top) return;
  localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off');
  localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
});
const page = await context.newPage();
page.on('console', m => { if (m.type() === 'error') console.log(`[page] ${m.text()}`); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
const low = !!process.env.LOW;
await page.goto(`${base}/?festive=off${low ? '&arttier=low' : ''}#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
const kit = Number(kitArg ?? 1);
await page.evaluate(low => { const h = window.__breachlineTest; h.start({ seed: 7, quality: low ? 'low' : 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); }, low);
await page.locator('.bl-canvas').focus();
await page.keyboard.press(`Digit${kit}`);
await page.evaluate(() => { const h = window.__breachlineTest; h.advance(0.1); h.still(); h.skip(30); h.advance(0.3); h.advance(5); });
if (process.env.PISTOL) await page.evaluate(() => window.__breachlineTest.hold({}, 0.6, { swap: true }));
await page.waitForFunction(() => window.__breachlineTest.stats().level > 0, undefined, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(5000);
await page.addStyleTag({ content: '.bl-toast, .bl-prompt { visibility: hidden !important; }' });
const shot = async name => { const f = `${out}/${name}.png`; await page.locator('canvas').first().screenshot({ path: f }); return f; };
const place = (x, z, yaw, pitch) => page.evaluate(([x, z, yaw, pitch]) => { const h = window.__breachlineTest; h.place(x, z, yaw, pitch); h.advance(0.05); h.draw(); h.draw(); }, [x, z, yaw, pitch]);
const hold = (patch, s, once = null) => page.evaluate(([p, s, o]) => window.__breachlineTest.hold(p, s, o), [patch, s, once]);
if (job === 'fp') {
  for (const [name, at] of [['lab', [-0.6, -4.6, 1.2, -0.12]], ['corridor', [13.5, -0.5, 1.5708, -0.04]]]) {
    await place(...at); await hold({}, 0.6); console.log(await shot(`${name}-hip`));
    await hold({ ads: true }, 0.6); console.log(await shot(`${name}-ads`));
    await hold({}, 0.5);
  }
  // Tactical reload strip: fire a few, reload, eight frames across the reload.
  await place(-0.6, -4.6, 1.2, -0.12);
  const strip = async (tag, start) => {
    const dur = await page.evaluate(() => { const s = window.__breachlineTest.state(); return s; });
    void dur;
    await start();
    const files = [];
    for (let i = 0; i < 8; i++) { files.push(await shot(`${tag}-${i}`)); await hold({}, 0.27); }
    return files;
  };
  await hold({ fire: true }, 0.25); await hold({}, 0.5);
  console.log(await strip('reload-tac', () => hold({}, 1 / 60, { reload: true })));
  await hold({}, 1.5);
  await hold({ fire: true }, 4.2);
  console.log(await strip('reload-empty', () => hold({}, 1 / 60)));
}
await browser.close();
