// Job 12.2 evidence in the real game. Test-only injections at page load (files on disk untouched): scene.ts exposes
// the fighters as window.__pf; index.ts gains teleport and kill. A squad-0 and a squad-1 fighter stand side by side in
// the yard; synthetic shot and hit events (the shooter is this player, the ray aimed at the chest, the leg, the head)
// are fed through the fighters' own handle(), then hp falls to half and near death, then both die.
// Usage: node wounds-test.mjs <port> <outDir>
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const [port, outDir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let page;
for (let t = 0; t < 4; t++) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
  page = await context.newPage();
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  await page.route(/\/src\/games\/breachline\/scene\.ts(\?.*)?$/, async r => { const resp = await r.fetch(); let b = await resp.text(); b = b.replace(/(const fighters = [^;]+;)/, '$1 window.__pf = fighters;'); await r.fulfill({ response: resp, body: b }); });
  await page.route(/\/src\/games\/breachline\/index\.ts(\?.*)?$/, async r => { const resp = await r.fetch(); const b = (await resp.text()).replace('still: () =>', "teleport: (id, x, z, yaw) => { const p = host.m.players[id]; if (p) { p.x = x; p.z = z; if (yaw !== undefined) p.yaw = yaw; } }, kill: (id, by) => { const p = host.m.players[id]; if (p) { p.alive = false; p.hp = 0; p.deaths++; host.m.events.push({ e: \'kill\', by, on: id, w: \'ar\', head: false }); } }, still: () =>"); await r.fulfill({ response: resp, body: b }); });
  await page.goto(`http://127.0.0.1:${port}/?festive=off&arttier=high#/game/breachline`);
  await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 120000 }).catch(() => {});
  const ok = await page.evaluate(() => { const h = window.__breachlineTest; if (!h) return false; h.start({ seed: 7, quality: 'high', teamSize: 3, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.advance(5); return h.state().phase !== 'lobby' && !!window.__pf; }).catch(() => false);
  await page.waitForTimeout(1500);
  if (ok && await page.evaluate(() => window.__breachlineTest?.state()?.phase !== 'lobby').catch(() => false)) break;
  console.log('start failed, retrying'); await context.close();
}
await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 }).catch(() => console.log('art did not reach env'));
await page.waitForTimeout(2500);
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-hud, .bl-nametag { visibility: hidden !important; }' });
const st = await page.evaluate(() => window.__breachlineTest.state());
const A = st.players.find(p => p.squad === 0 && p.id !== st.self), E = st.players.find(p => p.squad === 1);
const sx = A.x, sz = A.z;
// Both face the camera, which stands 3 m away (south of them).
await page.evaluate(([a, e, x, z]) => { const h = window.__breachlineTest; h.teleport(a, x - 0.55, z, Math.PI); h.teleport(e, x + 0.55, z, Math.PI); h.place(x, z + 3, 0, -0.08); h.advance(0.3); h.draw(); }, [A.id, E.id, sx, sz]);
const self = st.self, eye = [sx, 1.6, sz + 3];
const fire = (on, tx, ty, head, hp) => page.evaluate(([self, on, eye, tx, tz, ty, head, hp]) => {
  const yaw = Math.atan2(-(tx - eye[0]), -(tz - eye[2])), pitch = Math.atan2(ty - eye[1], Math.hypot(tx - eye[0], tz - eye[2]));
  window.__pf.handle([{ e: 'shot', id: self, w: 'ar', x: eye[0], y: eye[1], z: eye[2], yaw, pitch, spread: 0, seed: 1 }, { e: 'hit', by: self, on, dmg: 20, head, hp }], { players: [] }, self);
  const h = window.__breachlineTest; h.advance(0.6); h.draw();
}, [self, on, eye, tx, sz, ty, head, hp]);
const shot = async name => { await page.waitForTimeout(500); await writeFile(path.join(outDir, `${name}.png`), await page.locator('canvas').first().screenshot()); console.log(name); };
for (const [on, dx] of [[A.id, -0.55], [E.id, 0.55]]) {
  const tag = on === A.id ? 'A' : 'B', tx = sx + dx;
  await fire(on, tx + 0.04, 1.28, false, 80); await shot(`${tag}-chest`);
  await fire(on, tx + 0.09, 0.62, false, 66); await shot(`${tag}-leg`);
  await fire(on, tx, 1.66, true, 52); await shot(`${tag}-head`);
  await fire(on, tx - 0.06, 1.05, false, 45); await shot(`${tag}-half`);
  await fire(on, tx + 0.02, 1.2, false, 9); await shot(`${tag}-near-death`);
}
await page.evaluate(([a, e, me]) => { const h = window.__breachlineTest; h.kill(a, me); h.kill(e, me); h.advance(1.8); h.draw(); }, [A.id, E.id, self]);
console.log('alive after', JSON.stringify(await page.evaluate(() => window.__breachlineTest.state().players.map(p => [p.id, p.squad, p.alive]))), await page.evaluate(() => window.__breachlineTest.state().phase));
await shot('bodies');
console.log('bodies', JSON.stringify(await page.evaluate(() => window.__pf.bodies())));
await browser.close();
