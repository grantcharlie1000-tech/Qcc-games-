// In-game evidence for the second-build weapons under the real lighting, at 1280×720.
// Usage: QUERY='&heroclay' QUALITY=low node tests/games/breachline/hero-v2-game.mjs <baseUrl> <outDir> [job] [kit]
//   job "fp" (default): hip and aimed in the corridor and the Lab. job "reload": four frames of a tactical reload in
//   each place. Writes PNGs; crops are made afterwards (scripts/breachline-assets/hero/evidence.py).
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
page.on('console', m => { if (m.type() === 'error' || /Breachline (baked|weapon|hand)/.test(m.text())) console.log(`[page] ${m.text()}`); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${base}/?festive=off&arttier=${process.env.ART ?? 'high'}${process.env.QUERY ?? ''}#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
if (process.env.SWAP) await page.click('.bl-swap').catch(e => console.log('no swap button', e.message));
await page.evaluate(q => { const h = window.__breachlineTest; h.start({ seed: 7, quality: q, teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); }, process.env.QUALITY ?? 'high');
await page.locator('.bl-canvas').focus();
await page.keyboard.press(`Digit${Number(kitArg ?? 1)}`);
await page.evaluate(() => { const h = window.__breachlineTest; h.advance(0.1); h.still(); h.skip(30); h.advance(0.3); h.advance(5); });
await page.waitForFunction(() => window.__breachlineTest.stats().ready === true, undefined, { timeout: 180000, polling: 500 }).catch(() => console.log('not ready'));
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '.bl-toast, .bl-prompt { visibility: hidden !important; }' });
if (process.env.WEAPON) await page.evaluate(w => { globalThis.__heroWeapon = w; }, process.env.WEAPON);
const shot = async name => { const f = `${out}/${name}.png`; await page.screenshot({ path: f, timeout: 180000 }); console.log(f); return f; };
const place = (x, z, yaw, pitch) => page.evaluate(([x, z, yaw, pitch]) => { const h = window.__breachlineTest; h.place(x, z, yaw, pitch); h.advance(0.05); h.draw(); h.draw(); }, [x, z, yaw, pitch]);
const hold = (patch, s, once = null) => page.evaluate(([p, s, o]) => window.__breachlineTest.hold(p, s, o), [patch, s, once]);
// The viewmodel's springs advance only on drawn frames (the hook's hold draws once with no time): draw 0.4 s more.
const settle = () => page.evaluate(() => { for (let i = 0; i < 24; i++) window.__breachlineTest.draw(); });
const PLACES = process.env.PLACES ? JSON.parse(process.env.PLACES) : [['corridor', [13.5, -0.5, 1.5708, -0.04]], ['lab', [-0.6, -4.6, 1.2, -0.12]]];
for (const [name, at] of PLACES) {
  await place(...at);
  if (job === 'glove') {
    // The arms' material, and the gun pulled close (dev override) so the glove fills the frame.
    console.log(await page.evaluate(() => { const out = []; window.__heroVM.scene.traverse(o => { if (o.isSkinnedMesh && o.geometry.getAttribute('uv') && o.material.map && o.geometry.attributes.position.count > 5000 && o.geometry.attributes.position.count < 40000) out.push(`${o.material.type} map ${o.material.map.image?.width ?? '?'} verts ${o.geometry.attributes.position.count}`); }); return out.join(' | '); }));
    await page.evaluate(h => { globalThis.__heroHip = h; }, JSON.parse(process.env.HIP ?? '{"p":[0.03,-0.03,-0.17],"r":[0.2,0.5,-0.3]}'));
    await hold({}, 0.6); await settle(); await shot(`${name}-glove`);
    await page.evaluate(() => { delete globalThis.__heroHip; });
    break;
  } else if (job === 'aim') {
    // Aimed with each weapon in turn (WEAPONS=ar,shotgun,carbine,smg), one browser run.
    for (const w of (process.env.WEAPONS ?? 'ar,shotgun,carbine,smg').split(',')) {
      await page.evaluate(w => { globalThis.__heroWeapon = w; }, w);
      if (process.env.HIP) { await hold({}, 0.6); await settle(); await shot(`${name}-${w}-hip`); continue; }
      await hold({}, 0.6); await hold({ ads: true }, Number(process.env.ADS_S ?? 1.4)); await settle();
      await shot(`${name}-${w}-ads`);
    }
  } else if (job === 'fp') {
    await hold({}, 0.6); await settle(); await shot(`${name}-hip`);
    if (process.env.LUM) console.log(name, JSON.stringify(await page.evaluate(() => { const t = window.__heroVM.timing; return { lum: +t.lum.toFixed(3), probe: t.probe }; })));
    await hold({ ads: true }, Number(process.env.ADS_S ?? 1.4));
    await settle();
    await shot(`${name}-ads`);
    if (process.env.DEBUG_VM) console.log(await page.evaluate(() => { const v = window.__heroVM, out = []; v.scene.traverse(o => { if (o.isSkinnedMesh && o.parent.children.length > 8) { const g = o.parent; g.updateMatrixWorld(true); const p = { x: 0, y: 0, z: -0.154 }; const e = g.matrixWorld.elements; const wx = e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12], wy = e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13], wz = e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14]; out.push({ vis: o.visible && g.visible, pos: g.position.toArray().map(x => +x.toFixed(3)), dotCam: [wx, wy, wz].map(x => +x.toFixed(3)), tris: o.geometry.index.count / 3 }); } }); return JSON.stringify({ out, fov: v.camera.fov, aspect: v.camera.aspect, camPos: v.camera.position.toArray(), camRot: v.camera.rotation.toArray().slice(0, 3) }); }));
    if (process.env.DEBUG_VM) console.log(await page.evaluate(() => { const v = window.__heroVM; let g = null; v.scene.traverse(o => { if (o.isSkinnedMesh && o.parent.children.length > 8 && !g) g = o; }); const r = g.parent; return JSON.stringify({ p: r.position.toArray().map(x => +x.toFixed(4)), r: [r.rotation.x, r.rotation.y, r.rotation.z].map(x => +x.toFixed(4)), fov: v.camera.fov, cam: v.camera.position.toArray() }); }));
    await hold({}, 0.5);
  } else if (job === 'film' && name === 'corridor') {
    // Filmstrips of the first-person motion, frame by frame (each drawn frame is 1/60 s of viewmodel time).
    const frames = async (tag, n, step, patch, once = null) => {
      if (once) await hold(patch, 1 / 60, once);
      for (let i = 0; i < n; i++) { await page.evaluate(([p, k]) => { const h = window.__breachlineTest; h.hold(p, k / 60); }, [patch, step]); await shot(`film-${tag}-${i}`); }
    };
    await hold({}, 0.6); await settle();
    await frames('aim', 5, 4, { ads: true });
    await hold({}, 0.8); await settle();
    await frames('recoil', 5, 3, { fire: true });
    await hold({}, 1.2); await settle();
    await frames('swap', 5, 8, {}, { swap: true });
    await hold({}, 1.0, { swap: true }); await hold({}, 1.0); await settle();
    await frames('bob', 5, 6, { mz: 1 });
    await hold({}, 0.8); await settle();
    // Sway: turn by small steps between frames.
    for (let i = 0; i < 5; i++) { await page.evaluate(k => { const h = window.__breachlineTest, s = h.state(), me = s.players[s.self]; h.look((me.yaw ?? 1.57) + 0.06 * (k + 1), -0.04); h.hold({}, 3 / 60); }, i); await shot(`film-sway-${i}`); }
  } else if (job === 'cost') {
    // The viewmodel's cost per frame in each state: script ms (mean over 30 drawn frames), draw calls, triangles.
    const measure = async (label, patch, once = null) => {
      if (once) await hold(patch, 1 / 60, once); else await hold(patch, 0.4);
      const r = await page.evaluate(() => { const t = window.__heroVM.timing; t.update = 0; t.frames = 0; for (let i = 0; i < 30; i++) window.__breachlineTest.draw(); return { ms: +(t.update / t.frames).toFixed(3), calls: t.calls, triangles: t.triangles }; });
      console.log(JSON.stringify({ where: name, state: label, ...r }));
    };
    await measure('hip', {}); await measure('aimed', { ads: true });
    await measure('firing', { fire: true }); await measure('reloading', {}, { reload: true });
  } else if (job === 'fire') {
    // The first frame of a shot: the flash at the hip and aimed (held up for the slow capture).
    await page.evaluate(() => { globalThis.__heroFlashHold = true; });
    await hold({}, 0.6); await settle();
    await hold({ fire: true }, 1 / 60); await shot(`${name}-fire-hip`);
    if (process.env.DEBUG_VM) console.log(await page.evaluate(() => { const out = []; window.__heroVM.scene.traverse(o => { if (o.isSprite) out.push({ vis: o.visible, pos: o.getWorldPosition(new o.position.constructor()).toArray().map(x => +x.toFixed(3)), scale: +o.scale.x.toFixed(3), parent: o.parent?.type, op: o.material.opacity, map: !!o.material.map }); }); return JSON.stringify(out); }));
    await hold({}, 0.5); await hold({ ads: true }, 1.4); await settle();
    await hold({ ads: true, fire: true }, 1 / 60); await shot(`${name}-fire-ads`);
    await hold({}, 0.5);
    if (name === 'lab') {
      // A bot in front of us, firing: several frames, one will catch its flash.
      for (const [dx, dz] of [[0, 3.5], [3.5, 0], [0, -3.5], [-3.5, 0]]) {
        await page.evaluate(([dx, dz]) => { const h = window.__breachlineTest, s = h.state(), me = s.players[s.self], foe = s.players.find(p => p.squad !== me.squad && p.alive); if (foe) h.place(foe.x + dx, foe.z + dz, Math.atan2(dx, dz), -0.08); h.advance(0.05); }, [dx, dz]);
        for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__breachlineTest.advance(0.1)); await page.evaluate(() => window.__breachlineTest.draw()); await shot(`bot-fire-${dx}-${dz}-${i}`); }
      }
    }
  } else if (job === 'roll') {
    const ROLLS = JSON.parse(process.env.ROLLS ?? '[0, 0.35, -0.35, 0.52]');
    for (let i = 0; i < ROLLS.length; i++) {
      await page.evaluate(r => { globalThis.__heroRoll = r; }, ROLLS[i]);
      await hold({}, 0.3); await settle(); await shot(`${name}-roll-${i}`);
    }
    await page.evaluate(() => { delete globalThis.__heroRoll; });
  } else if (job === 'holds') {
    // Candidate hip holds (weapon origin and Euler in camera space), tried by eye.
    const HOLDS = JSON.parse(process.env.HOLDS ?? "[[[0.12, -0.092, -0.22], [0.04, 0.09, -0.26]], [[0.13, -0.11, -0.24], [0.03, 0.04, -0.14]], [[0.14, -0.12, -0.25], [0.05, 0.02, -0.08]], [[0.125, -0.105, -0.23], [0.02, 0.06, -0.2]]]");
    for (let i = 0; i < HOLDS.length; i++) {
      await page.evaluate(h => { globalThis.__heroHip = { p: h[0], r: h[1] }; }, HOLDS[i]);
      await hold({}, 0.3); await settle(); await shot(`${name}-hold-${i}`);
    }
    await page.evaluate(() => { delete globalThis.__heroHip; });
  } else if (job === 'reload') {
    await hold({ fire: true }, 0.25); await hold({}, 0.6);
    await hold({}, 1 / 60, { reload: true });
    for (let i = 0; i < 4; i++) { await hold({}, i === 0 ? 0.3 : 0.5); await settle(); await shot(`${name}-reload-${i}`); }
    await hold({}, 2);
  }
}
await browser.close();
