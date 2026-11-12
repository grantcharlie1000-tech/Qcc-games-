// Job 12.6 evidence in the real game: four real kills by this player through the test hook (the simulation's own
// fire, grenade and damage code), then frames over time of each body falling under the ragdoll until it rests.
// Test-only injections at page load (files on disk untouched): scene.ts exposes the fighters as window.__pf (its
// handle() is wrapped to log kill events); index.ts gains teleport and arm (choose this player's primary weapon and
// give it grenades). Usage: node ragdoll-test.mjs <port> <outDir>
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const [port, outDir] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ARM = "teleport: (id, x, z, yaw) => { const p = host.m.players[id]; if (p) { p.x = x; p.z = z; if (yaw !== undefined) p.yaw = yaw; } }, arm: (w) => { const s = session(), me = s.m.players[s.self]; const k = KITS[roleOf(s.m, me)].findIndex(x => x.primary === w); if (k >= 0) me.kit = k; me.slot = 0; me.mag[0] = 30; me.reserve[0] = 90; me.grenades = 3; me.reload = 0; return k; }, seen: (ax, az, bx, bz) => obstruction(session().m.world, ax, 1.55, az, bx, 1.2, bz) === 0 && obstruction(session().m.world, ax, 1.55, az, bx, 0.3, bz) === 0, still: () =>";
let page;
for (let t = 0; t < 4; t++) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
  // The game's own frame loop draws with real elapsed time, which would let a body fall while the script waits on a
  // slow software renderer. While __rafHold is set, frame callbacks are queued, so only the script's fixed 0.016 s
  // draws advance the ragdoll.
  await context.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window), q = []; window.requestAnimationFrame = cb => { if (window.__rafHold) { q.push(cb); return 0; } return raf(cb); }; window.__rafRelease = () => { window.__rafHold = false; q.splice(0).forEach(cb => raf(cb)); }; });
  page = await context.newPage();
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  await page.route(/\/src\/games\/breachline\/scene\.ts(\?.*)?$/, async r => { const resp = await r.fetch(); let b = await resp.text(); b = b.replace(/(const fighters = [^;]+;)/, '$1 window.__pf = fighters; { const h0 = fighters.handle.bind(fighters); fighters.handle = (ev, m, s) => { for (const e of ev) if (e.e === "kill") (window.__kills ||= []).push(e); return h0(ev, m, s); }; }'); await r.fulfill({ response: resp, body: b }); });
  await page.route(/\/src\/games\/breachline\/index\.ts(\?.*)?$/, async r => { const resp = await r.fetch(); const b = (await resp.text()).replace('still: () =>', ARM); await r.fulfill({ response: resp, body: b }); });
  await page.goto(`http://127.0.0.1:${port}/?festive=off&arttier=high#/game/breachline`);
  await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 120000 }).catch(() => {});
  const ok = await page.evaluate(() => { const h = window.__breachlineTest; if (!h) return false; h.start({ seed: 7, quality: 'high', teamSize: 5, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.advance(5); return h.state().phase !== 'lobby' && !!window.__pf; }).catch(() => false);
  await page.waitForTimeout(1500);
  if (ok && await page.evaluate(() => window.__breachlineTest?.state()?.phase !== 'lobby').catch(() => false)) break;
  console.log('start failed, retrying'); await context.close();
}
await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 }).catch(() => console.log('art did not reach env'));
await page.waitForTimeout(2500);
await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt, .bl-hud, .bl-nametag, .bl-prep { visibility: hidden !important; }' });
const shot = async name => {
  await page.waitForTimeout(300);
  try { await writeFile(path.join(outDir, `${name}.png`), await page.locator('canvas').first().screenshot({ timeout: 120000 })); }
  catch (e) { console.log('screenshot failed', name, await page.evaluate(() => [location.hash, document.querySelectorAll('canvas').length]).catch(x => String(x))); throw e; }
};

// Each death: the weapon, where on the body to aim, the range, and how the kill is made.
const cases = [
  { tag: 'rifle', w: 'ar', y: 1.2, range: 4, how: 'fire' },
  { tag: 'head', w: 'dmr', y: 1.66, range: 4, how: 'fire' },
  { tag: 'shotgun', w: 'shotgun', y: 1.15, range: 1.8, how: 'fire' },
  { tag: 'blast', w: 'ar', y: 1.15, range: 4.5, how: 'grenade' },
];
const log = [];
for (const c of cases) {
  console.log('arm', c.w, await page.evaluate(w => window.__breachlineTest.arm(w), c.w));
  // Find a foe, and a side to stand on from which a round actually reaches it (the first that costs it hp).
  const r = await page.evaluate(([c]) => {
    const h = window.__breachlineTest, s0 = h.state(), me = s0.players[s0.self], foes = s0.players.filter(p => p.squad !== me.squad && p.alive);
    for (const foe of foes) for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, x = foe.x + Math.sin(a) * c.range, z = foe.z + Math.cos(a) * c.range;
      const aim = y => { const s = h.state(), f = s.players.find(p => p.id === foe.id); return [Math.atan2(-(f.x - x), -(f.z - z)), Math.atan2(y - 1.6, Math.hypot(f.x - x, f.z - z))]; };
      if (!h.seen(x, z, foe.x, foe.z)) continue;
      const hp0 = h.state().players.find(p => p.id === foe.id).hp;
      const [yaw, pitch] = aim(c.how === 'grenade' ? 1.15 : c.y);
      h.place(x, z, yaw, pitch); h.advance(0.05);
      h.hold({ fire: true }, 0.05, { fire: true }); h.advance(0.3);
      const f = h.state().players.find(p => p.id === foe.id);
      if (f.hp < hp0 || !f.alive) return { id: foe.id, x, z, fx: foe.x, fz: foe.z, hp: f.hp, alive: f.alive };
    }
    return null;
  }, [c]);
  if (!r) { console.log(c.tag, 'no line to any foe'); continue; }
  // The kill itself, with the game's own frame loop held.
  await page.evaluate(() => { window.__rafHold = true; });
  const res = await page.evaluate(([c, r]) => {
    const h = window.__breachlineTest, foe = () => h.state().players.find(p => p.id === r.id);
    const aimAt = (y, x = r.x, z = r.z) => { const f = foe(); h.place(x, z, Math.atan2(-(f.x - x), -(f.z - z)), Math.atan2(y - 1.6, Math.hypot(f.x - x, f.z - z))); h.advance(0.02); };
    let n = 0;
    if (c.how === 'grenade') {
      // Wear it down with the rifle first, then a grenade at its feet from a little further back.
      while (foe().alive && foe().hp > 35 && n++ < 30) { aimAt(1.15); h.hold({ fire: true }, 0.05, { fire: true }); h.advance(0.15); }
      const f = foe(), dx = r.x - f.x, dz = r.z - f.z, d = Math.hypot(dx, dz), gx = f.x + dx / d * 5, gz = f.z + dz / d * 5;
      h.place(gx, gz, Math.atan2(-(f.x - gx), -(f.z - gz)), -0.32); h.advance(0.05);
      h.hold({ grenade: true }, 0.05, { grenade: true });
      h.place(f.x + dx / d * 9, f.z + dz / d * 9, Math.atan2(-(f.x - gx), -(f.z - gz)), -0.1);
      for (let i = 0; i < 40 && foe().alive; i++) h.advance(0.1);
    } else {
      while (foe().alive && n++ < 40) { aimAt(c.y); h.hold({ fire: true }, 0.05, { fire: true }); h.advance(c.w === 'dmr' || c.w === 'shotgun' ? 0.9 : 0.12); }
    }
    return { shots: n, alive: foe().alive, kill: (window.__kills || []).filter(k => k.on === r.id).pop() || null };
  }, [c, r]);
  console.log(c.tag, JSON.stringify(res));
  log.push({ tag: c.tag, ...res });
  if (res.alive) { await page.evaluate(() => window.__rafRelease()); continue; }
  // The camera: the side the kill came from, looking down at where the foe stood; frames over time from the kill.
  const times = [0, 0.15, 0.4, 0.9, 3.4];
  let at = 0;
  for (const [i, t] of times.entries()) {
    // Drawn in batches so the page stays responsive; the ragdoll advances 0.016 s per drawn frame.
    for (let left = Math.round((t - at) / 0.016), first = i === 0; left > 0 || first; first = false) {
      const n = Math.min(left, 25); left -= n;
      await page.evaluate(([r, frames, look]) => {
        const h = window.__breachlineTest, dx = r.x - r.fx, dz = r.z - r.fz, d = Math.hypot(dx, dz), x = r.fx + dx / d * 3.4, z = r.fz + dz / d * 3.4;
        if (look) { h.place(x, z, Math.atan2(-(r.fx - x), -(r.fz - z)), -0.36); h.advance(0); }
        for (let k = 0; k < frames; k++) h.draw();
      }, [r, n, first]);
    }
    at = t;
    await shot(`${c.tag}-${i}`);
  }
  await page.evaluate(() => window.__rafRelease());
  log[log.length - 1].body = await page.evaluate(id => window.__pf.bodies().find(b => b.id === id) || null, r.id);
  log[log.length - 1].rest = await page.evaluate(id => window.__pf.pose(id), r.id);
}
await writeFile(path.join(outDir, 'log.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.map(l => ({ tag: l.tag, alive: l.alive, w: l.kill?.w, head: l.kill?.head, body: l.body }))));
await browser.close();
