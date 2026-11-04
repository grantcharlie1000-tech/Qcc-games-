import {test,expect} from '../fixtures';

for(const app of ['social','chat']){
 test(`Study releases ${app}'s document scroll lock and restores it on return`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(`/#/${app}`);
  await expect(page.locator('body')).toHaveClass(new RegExp(`${app}-active`));
  await expect(page.locator('body')).toHaveCSS('overflow-y','hidden');
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-y','hidden');
  // Use native wheel input: scrollTo also succeeds inside an overflow:hidden page.
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.mouse.move(195,400);
  await page.mouse.wheel(0,600);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);
  await page.locator('#study-view [data-study-return]').first().click();
  await expect(page.locator('#study-view')).toBeHidden();
  await expect(page.locator('body')).toHaveCSS('overflow-y','hidden');
 });
}
