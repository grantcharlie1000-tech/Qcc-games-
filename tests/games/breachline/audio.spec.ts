import { test, expect, type Page } from '../../fixtures';
import { measure } from './audio-harness';
import type { RenderJob, RenderResult } from './audio-page';
import { scenes } from './audio-scenes';

/** Renders a lab job through the game's sound module offline in this page (see audio-page.ts). */
async function render(page: Page, job: RenderJob) {
  const r = await page.evaluate(`import('/tests/games/breachline/audio-page.ts').then(lab => lab.renderInPage(${JSON.stringify(job)}))`) as RenderResult;
  const ch = r.channels.map(b64 => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); });
  return { r, m: measure(ch, r.sampleRate) };
}

test.setTimeout(120_000);

test('the sound lab renders the three scenes through the game sound offline, with no errors or broken samples', async ({ page }) => {
  await page.route('**/__audio-lab', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>audio lab</title>' }));
  for (const job of scenes('/src/games/breachline/audio.ts')) {
    await page.goto('/__audio-lab');
    const { r, m } = await render(page, job);
    expect(r.errors, job.name).toEqual([]);
    expect(m.nan, job.name).toBe(0);
    expect(m.rmsDb, job.name).toBeGreaterThan(-60);
    expect(m.span, job.name).toBeGreaterThan(job.seconds * 0.5);
  }
});
