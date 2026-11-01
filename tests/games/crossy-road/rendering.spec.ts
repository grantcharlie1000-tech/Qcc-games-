import {test, expect, seedStudyTopic} from '../../fixtures';
import {advance, carDeath, expectDeathCard, hook, openGame} from './helpers';

test('a DSF3 phone fills the viewport and renders at native resolution with antialiasing', async ({browser}) => {
  const context = await browser.newContext({baseURL: process.env.ARCADE_URL || 'http://127.0.0.1:4190', viewport: {width: 390, height: 844}, deviceScaleFactor: 3});
  await seedStudyTopic(context);
  const page = await context.newPage();
  try {
    const errors = await openGame(page);
    await hook(page).setQuality('high');
    const canvas = page.locator('.hw-canvas');
    const size = await canvas.evaluate((c: HTMLCanvasElement) => {
      const css = c.getBoundingClientRect();
      return {width: c.width, height: c.height, x: css.x, y: css.y, cssWidth: css.width, cssHeight: css.height,
        antialias: c.getContext('webgl2')?.getContextAttributes()?.antialias, transform: getComputedStyle(c).transform};
    });
    expect(size).toMatchObject({width: 1170, height: 2532, x: 0, y: 0, cssWidth: 390, cssHeight: 844, antialias: true, transform: 'none'});
    await expect(page.locator('#game-status')).toHaveCSS('position', 'absolute');
    // Resize/orientation must replace the drawing buffer, not stretch the old bitmap.
    await page.setViewportSize({width: 844, height: 390});
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([2532, 1170]);
    await hook(page).setQuality('low');
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([1266, 585]);
    await hook(page).setQuality('high');
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([2532, 1170]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('reduced-motion game over keeps its shared card and Play again reachable in short landscape', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const errors = await openGame(page, {viewport: {width: 844, height: 390}});
  await carDeath(page);
  await advance(page, 0.3);
  await expectDeathCard(page, 'car', 'Hit by a car');
  const card = page.locator('.hw-over');
  await expect(card).toHaveClass(/ui-glass-sheet/);
  await expect(card).toHaveCSS('opacity', '1');
  await expect(card).toHaveCSS('scale', '1');
  const again = page.getByRole('button', {name: 'Play again', exact: true});
  expect(await again.evaluate(button => {
    const r = button.getBoundingClientRect();
    return r.y >= 0 && r.bottom <= innerHeight && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
  await again.click();
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-phase', 'ready');
  expect(errors).toEqual([]);
});

for (const viewport of [{width:390,height:844},{width:1366,height:768}]) {
  test(`floating shared glass chrome has no banner and keeps rankings accessible at ${viewport.width}`, async ({page}) => {
    await openGame(page,{viewport});
    const dock=page.locator('.game-dock');
    await expect(dock.locator('.arcade-glass')).toHaveCount(4);
    await expect(page.locator('.game-toolbar')).toHaveCount(0);
    await expect(page.locator('.game-hud')).toHaveText('Score0Row0Best0');
    await expect(dock).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await expect(page.locator('.game-hud')).toHaveAttribute('data-glass',/backdrop|frost/);
    const canvas=await page.locator('.hw-canvas').boundingBox();
    expect(canvas).toEqual({x:0,y:0,...viewport});
    for(const selector of ['.game-dock a','#game-menu','#game-quick-rankings']) {
      expect(await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    }
    await page.getByRole('button',{name:'Top scores',exact:true}).click();
    await expect(page.locator('#leaderboard-dialog')).toBeVisible();
    await expect(page.locator('#leaderboard-dialog')).toHaveClass(/arcade-sheet/);
    await page.getByRole('button',{name:'Close leaderboards',exact:true}).click();
    await page.locator('#game-menu').click();
    await expect(page.locator('#game-options')).toHaveClass(/arcade-sheet/);
  });
}
