import {test,expect} from '../../fixtures';

for(const viewport of [{width:320,height:844},{width:390,height:844},{width:1366,height:768}])test(`farm keeps its actions with only the shared restart at ${viewport.width}×${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/corn-clicker');await expect(page.locator('.cc-cob')).toBeVisible();
 if(viewport.width<700)await page.getByRole('tab',{name:'Farm',exact:true}).click();
 await page.getByRole('tab',{name:'Stats',exact:true}).click();
 const spreads=await page.locator('.cc-stats tbody tr').evaluateAll(rows=>rows.map(row=>{const bottoms=[...row.children].map(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().bottom;});return Math.max(...bottoms)-Math.min(...bottoms);}));
 expect(Math.max(...spreads)).toBeLessThanOrEqual(1);
 await page.getByRole('tab',{name:'Options',exact:true}).click();
 await expect(page.locator('[data-act=reset]')).toHaveCount(0);await expect(page.locator('.game-dock')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Show tips again',exact:true})).toBeVisible();
 for(const control of await page.locator('.cc-subtab:visible,.cc-btn:visible,.cc-opt select:visible').all())expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 for(const label of await page.locator('.cc-opt:visible').all())expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 expect(await page.locator('.cc-news').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
