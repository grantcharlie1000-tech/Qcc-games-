import {expect,test} from '../../fixtures';

test('production hint uses its worker chunk',async({page})=>{
  test.skip(process.env.QCC_PRODUCTION_TEST !== '1','Requires a production preview server.');
  await page.goto('/#/game/water-sort');
  await expect(page.locator('.ws-game')).toHaveAttribute('data-phase','ready');
  const worker=page.waitForEvent('worker');
  await page.getByRole('button',{name:'Hint',exact:true}).click();
  expect((await worker).url()).toMatch(/\/assets\/hint\.worker-[^/]+\.js/);
  await expect(page.locator('.ws-hint-from')).toHaveCount(1);
});

test('a failed production hint worker asset falls back to a usable hint',async({page})=>{
  test.skip(process.env.QCC_PRODUCTION_TEST !== '1','Requires a production preview server.');
  let blocked=0;
  await page.route('**/assets/hint.worker-*.js',async route=>{blocked++;await route.abort('failed');});
  await page.goto('/#/game/water-sort');
  await expect(page.locator('.ws-game')).toHaveAttribute('data-phase','ready');
  await page.getByRole('button',{name:'Hint',exact:true}).click();
  await expect(page.locator('.ws-hint-from')).toHaveCount(1);
  expect(blocked).toBe(1);
});
