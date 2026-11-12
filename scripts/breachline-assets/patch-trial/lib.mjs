// Driver for the Patch trial page: opens it in the pre-installed Chromium, serves the downloaded GLBs from a scratch
// folder (outside the repository) by intercepting /patch-dl/*, and renders frames to PNG buffers.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function open({ port = 5391, glbDir }) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ bypassCSP: true /* the dev CSP blocks GLTFLoader's blob: texture fetches */, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/patch-dl/*.glb', async route => {
    const name = path.basename(new URL(route.request().url()).pathname);
    if (!/^[a-z0-9_-]+\.glb$/.test(name)) return route.abort();
    await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: await readFile(path.join(glbDir, name)) });
  });
  await page.goto(`http://127.0.0.1:${port}/scripts/breachline-assets/patch-trial/index.html`);
  await page.waitForFunction(() => window.__trialReady === true, null, { timeout: 300000 });
  const call = (fn, ...args) => page.evaluate(([fn, args]) => window.__trial[fn](...args), [fn, args]);
  /** Renders one frame and returns the canvas as a PNG buffer at exactly w x h. */
  async function shot(f) {
    await page.setViewportSize({ width: f.w, height: f.h });
    await call('frame', f);
    return page.locator('#c').screenshot({ type: 'png', timeout: 600000 });
  }
  return { browser, page, call, shot };
}
