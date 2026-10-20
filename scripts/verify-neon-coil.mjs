// Local Chromium evidence. Uses the installed system encoder; no downloads or publishing.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const base = process.env.ARCADE_URL || 'http://127.0.0.1:4173/';
const folder = resolve(process.env.ARCADE_EVIDENCE_DIR || 'docs/evidence/neon-coil');
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
const errors = [], external = [], failed = [], results = [], interaction = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'));
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('request', r => { if (r.url().startsWith('http') && new URL(r.url()).origin !== new URL(base).origin) external.push(r.url()); });
page.on('response', r => { if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() }); });
const state = () => page.locator('.nc-game').evaluate(el => ({ ...el.dataset }));
async function fresh() {
  await page.goto(new URL('#/game/neon-coil', base).href); await page.locator('.nc-game').waitFor();
  await page.getByRole('button', { name: 'Restart game', exact: true }).click();
  await page.getByRole('button', { name: 'Enter arena', exact: true }).click();
}
const temporary = await mkdtemp(join(tmpdir(), 'neon-coil-evidence-'));
try {
  // Measure without screencasting so the recorder does not contaminate frame timings.
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await fresh();
    await page.mouse.move(viewport.width * .8, viewport.height * .5);
    const samples = await page.evaluate(() => new Promise(resolve => {
      const values = []; let previous;
      const tick = now => { if (previous !== undefined) values.push(now - previous); previous = now; if (values.length >= 120) resolve(values); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    samples.sort((a, b) => a - b);
    assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [viewport.width, viewport.height]);
    const current = await state(); assert.equal(current.phase, 'running'); assert.ok(Number(current.tick) > 20);
    results.push({ viewport, rafSamples: samples.length, rafMedianMs: samples[60], rafP95Ms: samples[114], gameCpuP95Ms: Number(current.cpuP95), ...current });
    await page.screenshot({ path: join(folder, `play-${viewport.width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await fresh();
  await page.getByRole('button', { name: 'Restart game', exact: true }).click();
  await page.screenshot({ path: join(folder, 'intro-1440.png') });
  const cdp = await context.newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', event => { frames.push({ data: event.data, timestamp: event.metadata.timestamp }); void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 72, maxWidth: 1280, maxHeight: 800, everyNthFrame: 3 });
  await page.locator('.nc-start').click();
  for (let n = 0; n < 28; n++) {
    const angle = Math.max(0, n - 4) * .28;
    await page.mouse.move(720 + Math.cos(angle) * 310, 450 + Math.sin(angle) * 310);
    if (n === 7) await page.keyboard.down('Space'); if (n === 9) await page.keyboard.up('Space');
    await page.waitForTimeout(250); interaction.push(await state());
    if (n === 12) {
      await page.screenshot({ path: join(folder, 'curved-play-1440.png') });
      await page.keyboard.press('p'); await page.waitForTimeout(350);
      await page.screenshot({ path: join(folder, 'paused-1440.png') });
      await page.keyboard.press('p'); await page.waitForTimeout(350);
    }
  }
  await page.screenshot({ path: join(folder, 'interaction-end-1440.png') });
  await cdp.send('Page.stopScreencast');
  const concat = [];
  for (let i = 0; i < frames.length; i++) {
    const name = `frame-${String(i).padStart(5, '0')}.jpg`;
    await writeFile(join(temporary, name), Buffer.from(frames[i].data, 'base64'));
    concat.push(`file '${name}'`);
    if (i + 1 < frames.length) concat.push(`duration ${Math.max(.01, Math.min(1, frames[i + 1].timestamp - frames[i].timestamp)).toFixed(6)}`);
  }
  await writeFile(join(temporary, 'frames.txt'), concat.join('\n') + '\n');
  let video = { recorded: false, reason: 'System ffmpeg unavailable', capturedFrames: frames.length };
  if (existsSync('/usr/bin/ffmpeg') && frames.length > 1) {
    const output = spawnSync('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(temporary, 'frames.txt'), '-fps_mode', 'vfr', '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-pix_fmt', 'yuv420p', join(folder, 'mouse-boost-pause.webm')], { encoding: 'utf8' });
    assert.equal(output.status, 0, output.stderr);
    video = { recorded: true, capturedFrames: frames.length, encoder: 'Installed system ffmpeg', file: 'mouse-boost-pause.webm' };
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(failed, []);
  const report = { recordedAt: new Date().toISOString(), browser: browser.version(), viewportRenderer: 'Chromium default Canvas 2D in a container', physicalHardware: false, syntheticMouse: true, physicalTrackpadTested: false, errors, externalRequests: external, failedAssets: failed, results, interaction, video };
  await writeFile(join(folder, 'interaction-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ results: results.map(({ viewport, rafMedianMs, rafP95Ms, gameCpuP95Ms }) => ({ viewport, rafMedianMs, rafP95Ms, gameCpuP95Ms })), video, errors, externalRequests: external, interactionFinal: interaction.at(-1) }, null, 2));
} finally { await context.close(); await browser.close(); await rm(temporary, { recursive: true, force: true }); }
