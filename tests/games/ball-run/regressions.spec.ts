import { test, expect, type Page } from '../../fixtures';
import { CONFIG, DIFFICULTIES, RADIUS, STEP, STEER_RESPONSE, lateralSpeed, type Run } from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun } from '../../../src/games/ball-run/model';
import { emptyRecords } from '../../../src/games/ball-run/records';
import { placeRun, spans } from './bot';

type FrameWindow = Window & { ballRunTestFrame(ms: number): void };
const game = (page: Page) => page.locator('.ball-run');
async function frames(page: Page, count: number, ms = 1000 / 120) {
  await page.evaluate(({ count, ms }) => { for (let i = 0; i < count; i++) (window as unknown as FrameWindow).ballRunTestFrame(ms); }, { count, ms });
}
/** Real app and real keyboard events; only RAF timestamps are controlled. This does
 * not claim the software WebGL renderer achieves the simulated frame frequency. */
async function open(page: Page, run: Run) {
  await page.addInitScript(({ run, records }) => {
    localStorage.setItem('pocket-arcade:v1:save:ball-run', JSON.stringify({ version: 1, data: {
      version: 4, difficulty: run.difficulty, records, run,
    } }));
    let now = 10000, next = 0;
    const queue = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = fn => { queue.set(++next, fn); return next; };
    window.cancelAnimationFrame = id => { queue.delete(id); };
    (window as unknown as FrameWindow).ballRunTestFrame = ms => {
      now += ms;
      const pending = [...queue.values()]; queue.clear();
      for (const fn of pending) fn(now);
    };
  }, { run, records: emptyRecords() });
  await page.goto('/#/game/ball-run');
  await expect(game(page)).toBeVisible();
  await frames(page, 20, 1000 / 60);
  await page.getByRole('button', { name: run.phase === 'ready' ? 'Play' : 'Continue', exact: true }).click({ force: true });
  await frames(page, 1, 1);
}

for (const difficulty of DIFFICULTIES) {
  test(`${difficulty}: real steering reversal stays on the visible floor in fullscreen`, async ({ page }) => {
    // Match a near-edge excursion to the current steering authority and the
    // response lag, instead of reusing a frame count from the slower course.
    const course = getCourse(1, difficulty), halfWidth = course.sample(0).width / 2;
    const reverse = Math.floor(((halfWidth - .04) / lateralSpeed(course.speed(0)) + Math.log(2) / STEER_RESPONSE) / STEP);
    const turningFrames = Math.ceil(Math.log(2) / STEER_RESPONSE / STEP);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, createRun(1, 1, difficulty));
    await page.getByRole('button', { name: 'Enter full screen', exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.keyboard.down('ArrowRight'); await frames(page, reverse);
    await page.keyboard.up('ArrowRight'); await page.keyboard.down('ArrowLeft');
    await frames(page, turningFrames);
    const edgeX = Number(await game(page).getAttribute('data-x'));
    expect(edgeX).toBeGreaterThan(halfWidth - .12);
    expect(edgeX).toBeLessThan(halfWidth);
    await expect(game(page)).toHaveAttribute('data-grounded', 'true');
    await frames(page, 132 - reverse - turningFrames);
    await page.keyboard.up('ArrowLeft');
    await expect(game(page)).toHaveAttribute('data-phase', 'running');
    await expect(game(page)).toHaveAttribute('data-grounded', 'true');
    expect(Number(await game(page).getAttribute('data-distance'))).toBeGreaterThan(9);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const before = await game(page).getAttribute('data-distance');
    await frames(page, 60);
    expect(await game(page).getAttribute('data-distance')).toBe(before);
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await frames(page, 12);
    await expect(game(page)).toHaveAttribute('data-grounded', 'true');
    await page.getByRole('button', { name: 'Restart game', exact: true }).click();
    await expect(game(page)).toHaveAttribute('data-phase', 'ready');
    await expect(game(page)).toHaveAttribute('data-grounded', 'true');
  });
}

for (const reduced of [false, true]) {
  test(`boost has a larger cyan speed readout and keeps its gain after feedback; reduced motion=${reduced}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    const course = getCourse(1, 'medium'), list: number[] = [];
    course.forEachGate(0, 2000, g => list.push(g.start));
    await open(page, placeRun(1, 'medium', list[0] - 2));
    const speed = game(page).locator('.br-speed'), before = Number(await game(page).getAttribute('data-speed'));
    const normalFont = await speed.evaluate(e => parseFloat(getComputedStyle(e).fontSize));
    for (let i = 0; i < 60 && await game(page).getAttribute('data-boost') !== 'true'; i++) await frames(page, 1);
    await expect(game(page).locator('.br-boost')).toBeVisible();
    await expect(speed).toHaveCSS('color', 'rgb(0, 231, 239)');
    expect(await speed.evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(normalFont);
    expect(Number(await game(page).getAttribute('data-speed'))).toBeGreaterThanOrEqual(before * 1.18);
    await frames(page, 245);
    await expect(game(page)).toHaveAttribute('data-boost', 'false');
    await expect(game(page).locator('.br-boost')).toBeHidden();
    expect(await speed.evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBe(normalFont);
    expect(Number(await game(page).getAttribute('data-speed'))).toBeGreaterThanOrEqual(before * 1.18);
  });
}

test('bank tile tops retain the same world width as the course and lane edges', async ({ page }) => {
  const course = getCourse(1, 'hard'), bank = spans(course, 4000).find(s => s.kind === 'bank')!;
  const at = (bank.start + bank.end) / 2, run = placeRun(1, 'hard', at);
  // Test-only instrumentation of the served module reads the exact matrices sent
  // to WebGL. No debug surface or dependency injection enters production code.
  await page.route('**/src/games/ball-run/scene.ts*', async route => {
    const response = await route.fetch(), source = await response.text();
    await route.fulfill({ response, body: source.replace('renderer.render(scene, camera);', `
      globalThis.ballRunBankTiles = { origin: builtOrigin, matrices: Array.from({ length: tiles.count }, (_, i) => {
        const matrix = new THREE.Matrix4(); tiles.getMatrixAt(i, matrix); return [...matrix.elements];
      }) };
      renderer.render(scene, camera);`) });
  });
  await open(page, run);
  await frames(page, 1);
  const { origin, matrices } = await page.evaluate(() => (window as unknown as { ballRunBankTiles: { origin: number; matrices: number[][] } }).ballRunBankTiles);
  let checked = 0;
  for (const m of matrices) {
    const sample = course.sample(origin - m[14]);
    if (sample.kind !== 'bank' || Math.abs(sample.bank) < .1) continue;
    expect(Math.abs(m[0])).toBeCloseTo(sample.width, 4);
    checked++;
  }
  expect(checked).toBeGreaterThan(5);
});
