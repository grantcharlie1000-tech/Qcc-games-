import {test,expect} from '../fixtures';
import {openGameMenu} from '../game-menu';

test('Snake length uses the same labelled bold value and baseline as Score and Best',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/snake');
  await expect(page.locator('.game-hud strong')).toBeVisible();await openGameMenu(page);
  await page.locator('#game-level').evaluate(e=>e.textContent='Length 9');
  const metrics=page.locator('.game-metrics');
  await expect(metrics.locator('strong')).toHaveCount(3);
  await expect(metrics).toContainText('Length');await expect(metrics.locator('strong').nth(1)).toHaveText('9');
  const values=await metrics.locator('strong').evaluateAll(nodes=>nodes.map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {font:s.fontSize,weight:s.fontWeight,line:s.lineHeight,bottom:r.bottom};}));
  expect(new Set(values.map(v=>[v.font,v.weight,v.line].join('|'))).size).toBe(1);
  expect(Math.max(...values.map(v=>v.bottom))-Math.min(...values.map(v=>v.bottom))).toBeLessThanOrEqual(1);
});

test('Leaderboards uses a trophy distinct from Favourite in game and shell menus',async({page})=>{
  await page.goto('/#/game/snake');await expect(page.locator('.game-hud strong')).toBeVisible();await openGameMenu(page);
  const favourite=await page.locator('#favourite-game svg').innerHTML();
  expect(await page.locator('#game-rankings svg').innerHTML()).not.toBe(favourite);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.locator('#open-leaderboards svg')).toHaveCount(1);
  expect(await page.locator('#open-leaderboards svg').innerHTML()).not.toBe(favourite);
});

test('a sheet sees continuous Snake scenery and no residual paused-board filter',async({page})=>{
  await page.goto('/?glass=fallback#/game/snake');await expect(page.locator('.game-hud strong')).toBeVisible();await openGameMenu(page);
  await expect(page.locator('#pause-overlay')).toHaveCSS('backdrop-filter','none');
  const scenery=await page.locator('.game-surface').evaluate(e=>getComputedStyle(e).backgroundImage);
  expect(scenery).toContain('rgb(200, 222, 148)');expect(scenery).toContain('rgb(164, 201, 118)');
  await expect(page.locator('.snake-garden')).toHaveCSS('box-shadow','none');
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('.game-surface')).toHaveCSS('background-image','none');
  await expect(page.locator('.snake-garden')).not.toHaveCSS('box-shadow','none');
});

const games=['fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','globle','blockcraft','maze-muncher','corn-clicker','slipline','quadfall','fivefold'];
for(const id of games)test(`${id} menu uses one value style with complete, unclipped stat pairs`,async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:320,height:844});await page.goto(`/#/game/${id}`);
  if(id==='blockcraft'){await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});await page.getByRole('button',{name:'Play',exact:true}).click();}
  await expect(page.locator('.game-hud strong:visible,.game-hud .game-compact-hud').first()).toBeVisible();await openGameMenu(page);
  const styles=await page.locator('.game-metrics strong').evaluateAll(values=>values.map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),p=e.parentElement!.getBoundingClientRect();return {font:[s.fontSize,s.fontWeight,s.lineHeight,s.color].join('|'),fits:r.left>=p.left-1&&r.right<=p.right+1,value:e.textContent};}));
  expect(new Set(styles.map(s=>s.font)).size).toBe(1);expect(styles.every(s=>s.fits&&s.value?.trim())).toBe(true);
  const box=await page.locator('.game-metrics').evaluate(e=>({width:e.clientWidth,content:e.scrollWidth}));expect(box.content).toBeLessThanOrEqual(box.width+1);
});
