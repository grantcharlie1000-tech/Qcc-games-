import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { test, expect } from '/workspace/Qcc-games-/tests/fixtures';
const rate = Number(process.env.NEON_CPU_RATE || 1);
const timings: { name: string; ms: number; complete: boolean }[] = [];
const report = process.env.NEON_TIMING_REPORT!;
async function timed(name: string, action: () => Promise<void>) {
  const start = performance.now(); let complete = false;
  try { await action(); complete = true; }
  finally { timings.push({ name, ms: performance.now() - start, complete }); writeFileSync(report, JSON.stringify({ rate, timings, totalMs: timings.reduce((sum, step) => sum + step.ms, 0) }, null, 2)); }
}
test('unchanged pointer gameplay flow with per-step wall timing', async ({ page, context }) => {
  if (rate !== 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const game = page.locator('.nc-game');
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:v1:save:neon-coil')!).data);
  await timed('load and begin', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install({ time: new Date('2026-10-20T10:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
    await page.goto('/#/game/neon-coil'); await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Enter arena', exact: true }).click();
  });
  await timed('900ms forward growth', async () => {
    await page.mouse.move(1050, 450); await page.clock.runFor(900);
    expect(Number(await game.getAttribute('data-x'))).toBeGreaterThan(100); expect(Number(await game.getAttribute('data-mass'))).toBeGreaterThan(30);
  });
  await timed('450ms turn', async () => { await page.mouse.move(720, 170); await page.clock.runFor(450); expect(Number(await game.getAttribute('data-angle'))).toBeLessThan(-1); });
  let before: any;
  await timed('250ms boost and pause', async () => {
    await page.keyboard.down('Space'); await page.clock.runFor(250); await expect(game).toHaveAttribute('data-boosting', 'true');
    await page.keyboard.press('p'); await expect(page.locator('#pause-overlay')).toBeVisible(); before = await saved();
    expect(before.snakes[0].boosting).toBe(false); expect(before.snakes[0].pathLength).toBeGreaterThan(220);
  });
  await timed('1000ms paused input and exact frozen save', async () => {
    await page.clock.runFor(1000); await page.mouse.move(100, 200); await page.keyboard.press('ArrowDown'); expect(await saved()).toEqual(before);
  });
  await timed('200ms resume', async () => {
    await page.keyboard.up('Space'); await page.keyboard.press('p'); await page.clock.runFor(200); await expect(game).toHaveAttribute('data-boosting', 'false');
  });
  await timed('700ms keyboard right', async () => {
    await page.keyboard.down('ArrowRight'); await page.clock.runFor(700); await page.keyboard.up('ArrowRight'); expect(Math.abs(Number(await game.getAttribute('data-angle')))).toBeLessThan(.1);
  });
  await timed('450ms quick tap down', async () => {
    await page.keyboard.press('ArrowDown'); await page.clock.runFor(450); expect(Number(await game.getAttribute('data-angle'))).toBeGreaterThan(1);
  });
  await timed('restart and final assertions', async () => {
    await page.getByRole('button', { name: 'Restart game', exact: true }).click(); await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
    await expect(game).toHaveAttribute('data-tick', '0'); expect(errors).toEqual([]);
  });
});
