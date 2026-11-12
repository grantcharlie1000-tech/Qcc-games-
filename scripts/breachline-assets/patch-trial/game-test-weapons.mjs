// Job 5.4 check in the real game: serves scene.ts with both switches (?fighters=patch, ?weapons=patch) injected on
// the fly (file on disk untouched), and photographs the weapon in hand in the corridor and the Lab: hip, aimed, four
// frames across a reload, and the pistol at the hip. Usage: node game-test-weapons.mjs <port> <outDir>
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const [port, outDir] = process.argv.slice(2);
const FIGHTERS = "(new URLSearchParams(location.search).get('fighters') === 'patch' ? __pf.createPatchFighters(scene, heroLighting) : createFighters(scene, heroLighting))";
const WEAPONS = "(new URLSearchParams(location.search).get('weapons') === 'patch' ? __ph.createPatchViewmodel(renderer, heroLighting) : createViewmodel(renderer, heroLighting))";
const SPOTS = { corridor: [13.5, -0.5, 1.5708, -0.04], lab: [3.3, -2.7, 0.78, -0.1] };
async function run(patch) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
  const page = await context.newPage(), tag = patch ? 'patch' : 'stock';
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !m.text().includes('KHR_parallel'))) console.log(`[${tag}] ${m.type()} ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  await page.route(/\/src\/games\/breachline\/scene\.ts(\?.*)?$/, async route => {
    const resp = await route.fetch(); let body = await resp.text();
    body = 'import * as __pf from "/src/games/breachline/render/patchfighters/index.ts";\nimport * as __ph from "/src/games/breachline/render/patchhero/index.ts";\n' + body.replace('createFighters(scene, heroLighting)', FIGHTERS).replace('createViewmodel(renderer, heroLighting)', WEAPONS);
    await route.fulfill({ response: resp, body });
  });
  await page.goto(`http://127.0.0.1:${port}/?festive=off&arttier=high${patch ? '&fighters=patch&weapons=patch' : ''}#/game/breachline`);
  await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 120000 });
  await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 3, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.advance(5); });
  await page.waitForFunction(() => { const s = window.__breachlineTest?.state(); return s && s.players.length > 0; }, undefined, { timeout: 60000 });
  await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 }).catch(() => console.log('art did not reach env'));
  await page.waitForTimeout(3000);
  const phase = await page.evaluate(() => window.__breachlineTest?.state()?.phase);
  if (!phase || phase === 'lobby') { console.log('START FAILED', phase); await browser.close(); return false; }
  await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt { visibility: hidden !important; }' });
  const shot = async name => { await page.waitForTimeout(600); await writeFile(path.join(outDir, `${tag}-${name}.png`), await page.locator('canvas').first().screenshot()); console.log(tag, name); };
  for (const [place, [x, z, yaw, pitch]] of Object.entries(SPOTS)) {
    if (process.env.SHORT && place !== 'corridor') continue;
    await page.evaluate(([x, z, yaw, pitch]) => { const h = window.__breachlineTest; h.place(x, z, yaw, pitch); h.hold({}, 1.0); h.draw(); }, [x, z, yaw, pitch]);
    await shot(`${place}-hip`);
    await page.evaluate(() => { const h = window.__breachlineTest; h.hold({ ads: true }, 0.8); h.draw(); });
    await shot(`${place}-aim`);
    if (process.env.SHORT) continue;
    // Spend a few rounds, settle, then reload; frames at four points of it.
    await page.evaluate(() => { const h = window.__breachlineTest; h.hold({ fire: true }, 0.35); h.hold({}, 0.8); h.hold({}, 0.05, { reload: true }); });
    let t = 0;
    for (const at of [0.35, 0.9, 1.5, 2.1]) { await page.evaluate(d => { const h = window.__breachlineTest; h.hold({}, d); h.draw(); }, at - t); t = at; await shot(`${place}-reload-${at}`); }
    await page.evaluate(() => { const h = window.__breachlineTest; h.hold({}, 2.0); });
  }
  if (process.env.SHORT) { await browser.close(); return true; }
  // The sidearm at the hip, in the Lab.
  await page.evaluate(() => { const h = window.__breachlineTest; h.hold({}, 0.05, { slot: 1 }); h.hold({}, 1.0); h.draw(); });
  await shot('lab-pistol');
  await browser.close();
  return true;
}
for (const patch of process.env.ONLY === 'patch' ? [true] : process.env.ONLY === 'stock' ? [false] : [false, true]) for (let t = 0; t < 3; t++) if (await run(patch)) break;
