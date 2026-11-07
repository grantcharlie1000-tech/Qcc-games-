import { test, expect, type Page } from '../../fixtures';
import { devices } from '@playwright/test';
import { gameAction } from '../../game-menu';

/** Real-browser checks through the shell at /#/game/femboy-obby. Movement uses Playwright keyboard and CDP touch input;
 * the dev hook only reads state, except where a test says it sets up a position. */
interface Route { id: number; x0: number; x1: number; z0: number; z1: number; top: number; surface: string }
interface HookState { mode: string; paused: boolean; finished: boolean; checkpoint: number; stage: number; deaths: number; steps: number; x: number; y: number; z: number; grounded: boolean; support: number; yaw: number; progress: { checkpoint: number; stars: string[]; outfit: string; bow: boolean; help: boolean; complete: boolean; bestTrialMs: number | null }; trial: { started: boolean; eligible: boolean; reason: string | null; checkpoint: number } | null; panel: boolean; result: boolean; suggest: boolean; deathAt: number; respawnAt: number; jumps: number; assist: boolean }
interface Hook { state(): HookState; teleport(i: number): void; place(x: number, y: number, z: number, yaw?: number): void; look(yaw: number, pitch?: number): void; stats(): { calls: number; triangles: number; geometries: number; textures: number }; frames(): number; course(): { checkpoints: { index: number; x: number; y: number; z: number }[]; stars: { id: string; x: number; y: number; z: number; stage: number }[]; stages: { index: number; name: string; route: Route[] }[] } }
declare global { interface Window { __frosthopTest?: Hook } }

const SAVE_KEY = 'pocket-arcade:v1:save:femboy-obby';
const EVIDENCE = 'tests/games/femboy-obby/evidence/';

function watch(page: Page) { const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); return errors; }
async function open(page: Page) {
  const errors = watch(page);
  await page.goto('/#/game/femboy-obby');
  await page.waitForFunction(() => window.__frosthopTest !== undefined && window.__frosthopTest.state().steps > 5, null, { timeout: 20000 });
  await page.locator('.fo-canvas').focus();
  return errors;
}
const state = (page: Page) => page.evaluate(() => window.__frosthopTest!.state());
const course = (page: Page) => page.evaluate(() => window.__frosthopTest!.course());

/** Hold W along -z and tap Space before each gap, with real key events, until checkpoint `target` is reached.
 * The hook's route starts with the previous checkpoint pad. */
async function playStraight(page: Page, stage: number, target: number) {
  const route = (await course(page)).stages[stage - 1].route;
  const edges = route.slice(0, -1).map(r => r.z0);
  await page.keyboard.down('KeyW');
  try {
    for (let t = 0; t < 400; t++) {
      const s = await state(page);
      if (s.checkpoint >= target) return;
      const next = edges.find(z => z < s.z + 0.01);
      if (s.grounded && next !== undefined && s.z - next < 0.9 && !route.some(r => r.z0 < s.z - 1.2 && r.z1 > s.z - 1.2 && r.top <= s.y + 0.3 && r.top > s.y - 0.5)) {
        await page.keyboard.down('Space'); await page.waitForTimeout(160); await page.keyboard.up('Space');
      }
      await page.waitForTimeout(15);
    }
  } finally { await page.keyboard.up('KeyW'); }
}

test('keyboard play: the first campaign run is timed and ranked from the start line; jumping the stage 1 gaps reaches checkpoint 1 and the bow', async ({ page }) => {
  const errors = await open(page);
  expect(await state(page)).toMatchObject({ mode: 'campaign', checkpoint: 0, stage: 1, trial: { started: false, eligible: true } });
  await expect(page.locator('.game-hud')).toContainText('1/30');
  await expect(page.locator('.game-hud')).toContainText('Ranked');
  await playStraight(page, 1, 1);
  const s = await state(page);
  expect(s.checkpoint).toBe(1);
  expect(s.trial).toMatchObject({ started: true, eligible: true, checkpoint: 1 });
  await expect(page.locator('.game-hud')).toContainText(/\d:\d{2}\.\d{2}/);
  expect(s.progress).toMatchObject({ checkpoint: 1, bow: true });
  await expect(page.locator('.game-hud')).toContainText('2/30');
  // Saved immediately with the new checkpoint.
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY);
  expect(saved?.data).toMatchObject({ v: 1, mode: 'campaign', at: 1, progress: { checkpoint: 1, bow: true }, trial: { started: true, checkpoint: 1 } });
  expect(errors).toEqual([]);
});

test('a fall returns you to your checkpoint within 0.6 s with control restored', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.down('KeyA');
  await page.waitForFunction(() => window.__frosthopTest!.state().deaths > 0, null, { timeout: 10000 });
  await page.keyboard.up('KeyA');
  await page.waitForFunction(() => { const s = window.__frosthopTest!.state(); return s.respawnAt > s.deathAt; });
  const s = await state(page);
  expect(s.respawnAt - s.deathAt).toBeLessThan(600);
  expect(s).toMatchObject({ x: 0, z: 3, grounded: true, checkpoint: 0 });
  // Control is back: W moves again.
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__frosthopTest!.state().z < 2.5, null, { timeout: 5000 });
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: EVIDENCE + 'checkpoint-and-recovery.png' });
  expect(errors).toEqual([]);
});

test('a star is collected once, survives a reload, and the wardrobe equips unlocked outfits only', async ({ page }) => {
  const errors = await open(page);
  const star = (await course(page)).stars[0];
  await page.evaluate(p => window.__frosthopTest!.place(p.x, p.y - 1.2, p.z), star); // setup: drop onto the star's ledge
  await page.waitForFunction(() => window.__frosthopTest!.state().progress.stars.length === 1);
  expect((await state(page)).progress.stars).toHaveLength(1);
  await page.reload();
  await page.waitForFunction(() => window.__frosthopTest !== undefined && window.__frosthopTest.state().steps > 2, null, { timeout: 20000 });
  expect((await state(page)).progress.stars).toEqual([star.id]);
  await page.getByRole('button', { name: 'Wardrobe, help and modes' }).click();
  const panel = page.locator('.fo-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('radio', { name: /Mint Hoodie/ })).toBeDisabled();
  await expect(panel.getByRole('radio', { name: /Snowdrop Knit/ })).toBeChecked();
  await expect(panel.getByRole('button', { name: 'Start a Time Trial' })).toBeDisabled();
  // Escape closes the panel first; it does not open Study.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('#study-view')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Escape opens Study with progress saved and paused; returning resumes the same game', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__frosthopTest!.state().z < 2);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400); // let the run come to rest
  const before = await state(page);
  expect(before.z).toBeLessThan(2.5);
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  const steps = (await state(page)).steps;
  await page.waitForTimeout(400);
  expect((await state(page)).steps).toBe(steps); // paused: no simulation
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null')?.data?.v, SAVE_KEY)).toBe(1);
  const games = page.getByRole('link', { name: 'Return to previous view', exact: true }).first();
  await expect(async () => { if (await page.locator('#study-view').isVisible()) await games.click({ timeout: 1000 }); await expect(page.locator('#study-view')).toBeHidden({ timeout: 1000 }); }).toPass({ timeout: 7000 });
  await page.waitForFunction(s => window.__frosthopTest!.state().steps > s, steps);
  const after = await state(page);
  expect(after.z).toBeCloseTo(before.z, 1);
  expect(errors).toEqual([]);
});

test('Time Trial: unlocked after the campaign; pausing makes it casual for good; finishing shows a formatted time', async ({ page }) => {
  // Setup: a save with the campaign complete, written before the app starts (the shell saves on page hide).
  await page.addInitScript(k => localStorage.setItem(k, JSON.stringify({ version: 1, data: { v: 1, progress: { checkpoint: 30, complete: true, stars: [] }, mode: 'campaign', at: 30 } })), SAVE_KEY);
  const errors = await open(page);
  expect((await state(page)).progress.complete).toBe(true);
  await page.getByRole('button', { name: 'Wardrobe, help and modes' }).click();
  await page.getByRole('button', { name: 'Start a Time Trial' }).click();
  let s = await state(page);
  expect(s).toMatchObject({ mode: 'trial', checkpoint: 0, trial: { started: false, eligible: true } });
  await expect(page.locator('.game-hud')).toContainText('Ranked');
  // Crossing the start line with real keys starts the clock.
  await page.locator('.fo-canvas').focus();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  s = await state(page);
  expect(s.trial).toMatchObject({ started: true, eligible: true });
  // Pause from the shell menu, then resume: casual for good.
  await page.locator('.game-dock').getByRole('button', { name: /menu/i }).first().click();
  await page.getByRole('button', { name: 'Close game menu' }).click();
  s = await state(page);
  expect(s.trial).toMatchObject({ eligible: false, reason: 'paused' });
  await expect(page.locator('.game-hud')).toContainText('Casual');
  // Setup: jump to the last stage (test hook) and drop the player onto the edge of the finish podium (the stage's
  // obstacles are covered by the course tests), then walk onto it with real keys.
  await page.evaluate(() => window.__frosthopTest!.teleport(29));
  const podium = (await course(page)).stages[29].route.at(-1)!;
  await page.evaluate(p => window.__frosthopTest!.place((p.x0 + p.x1) / 2, p.top + 0.6, p.z1 - 0.8), podium);
  await page.locator('.fo-canvas').focus();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  await expect(page.locator('.fo-result')).toBeVisible();
  await expect(page.locator('.fo-r-time')).toHaveText(/^\d+:\d{2}\.\d{2}$/);
  await expect(page.locator('.fo-r-status')).toHaveText('Casual');
  await page.waitForTimeout(600);
  await page.screenshot({ path: EVIDENCE + 'campaign-and-trial-results.png' });
  // A casual time never reaches the score record.
  expect(await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:femboy-obby'))).toBeNull();
  expect(errors).toEqual([]);
});

test('Restart from the shell menu gives a fresh timed run that is still ranked', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__frosthopTest!.state().trial?.started === true);
  await page.keyboard.up('KeyW');
  await gameAction(page, 'Restart game');
  await page.waitForFunction(() => !window.__frosthopTest!.state().paused);
  const s = await state(page);
  expect(s).toMatchObject({ checkpoint: 0, z: 3, trial: { started: false, eligible: true, reason: null } });
  await expect(page.locator('.game-hud')).toContainText('Ranked');
  expect(errors).toEqual([]);
});

test('leaving and re-entering repeatedly releases the scene without errors or growing resources', async ({ page }) => {
  const errors = await open(page);
  const first = await page.evaluate(() => window.__frosthopTest!.stats());
  for (let i = 0; i < 3; i++) {
    await page.goto('/#/collection');
    await expect(page.locator('.game-card').first()).toBeVisible();
    expect(await page.evaluate(() => window.__frosthopTest === undefined)).toBe(true);
    await page.goto('/#/game/femboy-obby');
    await page.waitForFunction(() => window.__frosthopTest !== undefined && window.__frosthopTest.state().steps > 5, null, { timeout: 20000 });
  }
  await page.waitForTimeout(800);
  const last = await page.evaluate(() => window.__frosthopTest!.stats());
  expect(last.geometries).toBeLessThanOrEqual(first.geometries + 6);
  expect(last.textures).toBeLessThanOrEqual(first.textures + 2);
  expect(await page.locator('.femboy-obby').count()).toBe(1);
  expect(errors).toEqual([]);
});

test('desktop evidence: course, avatar and glass dock at 1440×900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await open(page);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(250); await page.keyboard.up('KeyW');
  await page.waitForTimeout(1200);
  const stats = await page.evaluate(() => window.__frosthopTest!.stats());
  expect(stats.calls).toBeGreaterThan(10);
  expect(stats.calls).toBeLessThan(80);
  expect(stats.triangles).toBeLessThan(80000);
  await page.screenshot({ path: EVIDENCE + 'desktop-1440x900.png' });
  expect(errors).toEqual([]);
});

test('six zones render (evidence capture of each zone start)', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  const errors = await open(page);
  for (const cp of [2, 7, 12, 17, 22, 27]) {
    await page.evaluate(c => window.__frosthopTest!.teleport(c), cp);
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => window.__frosthopTest!.stats());
    expect(st.calls, `checkpoint ${cp}`).toBeLessThan(80);
    expect(st.triangles, `checkpoint ${cp}`).toBeLessThan(80000);
    await page.screenshot({ path: `${EVIDENCE}zone-${Math.floor(cp / 5) + 1}.png` });
  }
  expect(errors).toEqual([]);
});

test.describe('touch', () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  /** Real multi-touch through the DevTools protocol: each finger is its own touch point. */
  async function touches(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    return (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  }

  test('portrait: move stick, look area and jump work at the same time, clear of the dock', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('.fo-jump')).toBeVisible();
    const vp = page.viewportSize()!;
    const jump = (await page.locator('.fo-jump').boundingBox())!;
    const dock = (await page.locator('.game-dock').boundingBox())!;
    expect(jump.y).toBeGreaterThan(dock.y + dock.height);
    expect(jump.x + jump.width).toBeLessThanOrEqual(vp.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const send = await touches(page);
    const before = await state(page);
    const stick = { x: 80, y: vp.height - 200, id: 1 }, look = { x: vp.width - 120, y: vp.height * 0.45, id: 2 };
    await send('touchStart', [stick]);
    await send('touchStart', [stick, look]);
    for (let i = 1; i <= 8; i++) { await send('touchMove', [{ ...stick, y: stick.y - i * 8 }, { ...look, x: look.x - i * 6 }]); await page.waitForTimeout(30); }
    // Third finger on Jump while still moving and looking: a real jump, well before the plaza edge (z = -5.5).
    const jp = { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 3 };
    await send('touchStart', [{ ...stick, y: stick.y - 64 }, { ...look, x: look.x - 48 }, jp]);
    await page.waitForFunction(j => window.__frosthopTest!.state().jumps > j, before.jumps, { timeout: 3000 });
    expect((await state(page)).z).toBeGreaterThan(-5);
    await send('touchEnd', [{ ...stick, y: stick.y - 64 }, { ...look, x: look.x - 48 }]);
    await page.waitForTimeout(500);
    await send('touchEnd', []);
    const after = await state(page);
    expect(after.z).toBeLessThan(before.z - 0.5); // moved forward
    expect(after.yaw).not.toBeCloseTo(before.yaw, 2); // looked around
    await page.waitForTimeout(400);
    await page.screenshot({ path: EVIDENCE + 'phone-390x844.png' });
    expect(errors).toEqual([]);
  });

  test('landscape: controls stay reachable and the course stays visible', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    const errors = await open(page);
    const jump = (await page.locator('.fo-jump').boundingBox())!;
    expect(jump.y + jump.height).toBeLessThanOrEqual(390);
    expect(jump.x + jump.width).toBeLessThanOrEqual(844);
    const tools = (await page.locator('.fo-tools').boundingBox())!;
    expect(tools.y + tools.height).toBeLessThan(jump.y);
    await page.waitForTimeout(800);
    await page.screenshot({ path: EVIDENCE + 'phone-landscape-844x390.png' });
    expect(errors).toEqual([]);
  });
});
