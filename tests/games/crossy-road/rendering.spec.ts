import {test, expect, seedStudyTopic} from '../../fixtures';
import {gameAction, openGameMenu} from '../../game-menu';
import {advance, carDeath, expectDeathCard, hook, openGame} from './helpers';

test('a DSF3 phone fills the viewport with antialiasing and respects the DPR2 budget', async ({browser}) => {
  const context = await browser.newContext({baseURL: test.info().project.use.baseURL, viewport: {width: 390, height: 844}, deviceScaleFactor: 3});
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
    expect(size).toMatchObject({width: 780, height: 1688, x: 0, y: 0, cssWidth: 390, cssHeight: 844, antialias: true, transform: 'none'});
    await expect(page.locator('#game-status')).toHaveCSS('position', 'absolute');
    // Moving to a different-density screen can change DPR without changing CSS size.
    await page.evaluate(()=>{Object.defineProperty(window,'devicePixelRatio',{value:1,configurable:true});dispatchEvent(new Event('resize'));});
    await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement)=>[c.width,c.height])).toEqual([390,844]);
    await page.evaluate(()=>{Object.defineProperty(window,'devicePixelRatio',{value:3,configurable:true});dispatchEvent(new Event('orientationchange'));});
    await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement)=>[c.width,c.height])).toEqual([780,1688]);
    // Resize/orientation must replace the drawing buffer, not stretch the old bitmap.
    await page.setViewportSize({width: 844, height: 390});
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([1688, 780]);
    await hook(page).setQuality('low');
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([1266, 585]);
    await hook(page).setQuality('high');
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([1688, 780]);
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

for (const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}]) {
  test(`main shell controls and rankings stay accessible over the full playfield at ${viewport.width}`, async ({page}) => {
    await openGame(page,{viewport});
    await expect(page.locator('.game-dock')).toBeVisible();
    await expect(page.locator('#game-score strong')).toHaveText('0');
    await expect(page.locator('#game-best strong')).toHaveText('0');
    const canvas=await page.locator('.hw-canvas').boundingBox();
    expect(canvas).toEqual({x:0,y:0,...viewport});
    for(const selector of ['.game-dock a','#game-menu']) {
      expect(await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    }
    await page.evaluate(()=>{window.__crossyRoadTest!.hop('up');window.__crossyRoadTest!.advance(0.2);});
    await openGameMenu(page);
    expect((await hook(page).stats()).looping).toBe(false);
    // Rankings and game actions moved into the shared sheet, which scrolls in short landscape.
    for(const selector of ['#pause-game','#restart-game','#fullscreen-game','#game-rankings']) {
      const control=page.locator(selector);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeVisible();
      expect(await control.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),selector).toBe(true);
    }
    await gameAction(page,'Leaderboards');
    await expect(page.locator('#leaderboard-dialog')).toBeVisible();
    await expect(page.locator('#leaderboard-game')).toHaveValue('crossy-road');
    await page.getByRole('button',{name:'Close leaderboards',exact:true}).click();
    await expect.poll(async()=>(await hook(page).stats()).looping).toBe(true);
    await gameAction(page,'Enter full screen');
    await expect(page.locator('#fullscreen-game')).toHaveAttribute('aria-pressed','true');
    expect(await page.locator('.hw-canvas').boundingBox()).toEqual({x:0,y:0,...viewport});
    await page.mouse.move(viewport.width/2,viewport.height/2);
    await page.mouse.wheel(0,1200);
    await page.keyboard.press('PageDown');
    expect(await page.evaluate(()=>({x:scrollX,y:scrollY,height:document.documentElement.scrollHeight}))).toEqual({x:0,y:0,height:viewport.height});
  });
}
