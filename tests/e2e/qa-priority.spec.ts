import {test,expect} from '@playwright/test';
test('initial topic opens chapter and Games navigation works',async({page})=>{
 await page.goto('/');
 const close=page.getByRole('button',{name:'Close sign in'});
 if(await close.isVisible())await close.click();
 await page.locator('[data-study-topic="forces"]').click();
 await expect(page.locator('#study-title')).toHaveText('Why motion changes');
 const sections=page.locator('#study-view nav[aria-label="Sections"]');
 await expect(sections).toBeVisible();
 await sections.getByRole('link',{name:'Games',exact:true}).click();
 await expect(page.locator('.game-grid')).toBeVisible();
});
