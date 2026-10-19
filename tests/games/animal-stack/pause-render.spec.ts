import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    animalPauseProbe: { paints: number; frame: number; perFrame: Record<number, number> };
  }
}
const observeFrames = (page: Page, count: number) => page.evaluate(n => new Promise<void>(resolve => {
  const next = () => { if (--n === 0) resolve(); else requestAnimationFrame(next); };
  requestAnimationFrame(next);
}), count);

test('shared pause stops Canvas rendering and repeated resumes keep one animation loop', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'));
  await page.addInitScript(() => {
    const probe = window.animalPauseProbe = { paints: 0, frame: 0, perFrame: {} as Record<number, number> };
    const observe = () => { probe.frame++; requestAnimationFrame(observe); };
    requestAnimationFrame(observe);
    const original = CanvasRenderingContext2D.prototype.setTransform;
    CanvasRenderingContext2D.prototype.setTransform = function (...args: unknown[]) {
      if (this.canvas.closest('.animal-stack')) {
        probe.paints++;
        probe.perFrame[probe.frame] = (probe.perFrame[probe.frame] || 0) + 1;
      }
      return (original as (...values: unknown[]) => void).apply(this, args);
    };
  });
  await page.goto('/#/game/animal-stack');
  const game = page.locator('.animal-stack');
  await expect(game).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => page.evaluate(() => window.animalPauseProbe.paints)).toBeGreaterThan(0);
  await game.getByRole('button', { name: /^Drop / }).click();
  await expect(game).toHaveAttribute('data-count', '1');

  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const tick = await game.getAttribute('data-tick');
    const paints = await page.evaluate(() => window.animalPauseProbe.paints);
    await observeFrames(page, 12);
    expect(await page.evaluate(() => window.animalPauseProbe.paints)).toBe(paints);
    await expect(game).toHaveAttribute('data-tick', tick!);
    await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
    await expect.poll(async () => Number(await game.getAttribute('data-tick'))).toBeGreaterThan(Number(tick));
    await observeFrames(page, 8);
  }

  await expect(game).toHaveAttribute('data-balanced', '1');
  await expect(game).toHaveAttribute('data-over', 'false');
  const paintsPerFrame = await page.evaluate(() => Object.values(window.animalPauseProbe.perFrame));
  expect(Math.max(...paintsPerFrame)).toBe(1);
  await page.getByRole('link', { name: 'Back to game library', exact: true }).click();
  await expect(page.locator('.animal-stack')).toHaveCount(0);
  const paintsAfterDispose = await page.evaluate(() => window.animalPauseProbe.paints);
  await observeFrames(page, 8);
  expect(await page.evaluate(() => window.animalPauseProbe.paints)).toBe(paintsAfterDispose);
});
