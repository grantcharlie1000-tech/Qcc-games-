import {expect,test} from '@playwright/test';

test('download Snake, reload offline and render the game without a redirected response',async({page,context})=>{
 await page.goto('/');
 const guest=page.getByRole('button',{name:'Play as guest',exact:true});
 if(await guest.isVisible())await guest.click();
 await page.locator('.app-navigation').getByRole('button',{name:'Open menu'}).click();
 const menu=page.locator('#menu');
 await menu.locator('details.offline-downloads summary').click();
 const snake=menu.locator('.offline-game-row').filter({hasText:'Snake'});
 await expect(snake).toBeVisible();
 await snake.getByRole('button',{name:'Download Snake'}).click();
 await expect(menu.locator('.offline-download-status')).toContainText('Snake is ready to play offline.',{timeout:70000});
 await expect(snake.getByRole('button',{name:'Remove offline download for Snake'})).toBeVisible();
 // CacheStorage must hold a nonredirected copy of the app entry page.
 const stored=await page.evaluate(async()=>{
  const names=await caches.keys();
  const shell=names.find(name=>name.startsWith('qcc-offline-shell:'));
  const response=shell&&await(await caches.open(shell)).match(new URL('./',location.href).href);
  return {shell:!!shell,entry:!!response,redirected:response?.redirected};
 });
 expect(stored).toEqual({shell:true,entry:true,redirected:false});
 await context.setOffline(true);
 await page.goto('/#/game/snake');
 await expect(page.locator('.snake-canvas')).toBeVisible({timeout:15000});
 await expect(page.locator('.game-error')).toHaveCount(0);
});

test('removing a download clears only that game pack',async({page})=>{
 await page.goto('/');
 const guest=page.getByRole('button',{name:'Play as guest',exact:true});
 if(await guest.isVisible())await guest.click();
 await page.locator('.app-navigation').getByRole('button',{name:'Open menu'}).click();
 const menu=page.locator('#menu');
 await menu.locator('details.offline-downloads summary').click();
 const snake=menu.locator('.offline-game-row').filter({hasText:'Snake'});
 await snake.getByRole('button',{name:'Download Snake'}).click();
 await expect(menu.locator('.offline-download-status')).toContainText('Snake is ready to play offline.',{timeout:70000});
 await snake.getByRole('button',{name:'Remove offline download for Snake'}).click();
 await expect(snake.getByRole('button',{name:'Download Snake'})).toBeVisible();
 const cachesLeft=await page.evaluate(()=>caches.keys());
 expect(cachesLeft.some(name=>name.includes('qcc-offline-game:')&&name.endsWith(':snake'))).toBe(false);
 expect(cachesLeft.some(name=>name.startsWith('qcc-offline-shell:'))).toBe(true);
});
