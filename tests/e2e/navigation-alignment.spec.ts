import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';

async function boxes(page:Page){
  return page.locator('.app-navigation').evaluate(nav=>{
    const bar=nav.querySelector('.section-tabbar')!.getBoundingClientRect(),menu=nav.querySelector('.section-menu')!.getBoundingClientRect();
    return {bar:bar.toJSON(),menu:menu.toJSON(),parent:nav.getBoundingClientRect().toJSON()};
  });
}
for(const [width,height] of [[320,568],[393,852],[852,393],[1440,1000]])test(`navigation and hamburger share their exact height and anchor at ${width}×${height}`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/#/collection');
  await expect(page.locator('.app-menu')).toBeVisible();
  const {bar,menu,parent}=await boxes(page);
  expect(bar.height).toBe(64);expect(menu.height).toBe(bar.height);expect(menu.width).toBe(bar.height);
  expect(menu.top).toBeCloseTo(bar.top,4);expect(menu.bottom).toBeCloseTo(bar.bottom,4);
  expect(bar.top).toBeCloseTo(parent.top,4);expect(bar.bottom).toBeCloseTo(parent.bottom,4);
});

test('nonzero safe areas inset both companions once, including asymmetric side insets',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','CDP is required to override native CSS safe-area environment variables.');
  await page.setViewportSize({width:393,height:852});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:59,left:24,right:12,bottom:34}});
  await page.goto('/#/collection');await expect(page.locator('.app-menu')).toBeVisible();
  const {bar,menu}=await boxes(page);
  expect(bar.left).toBeGreaterThanOrEqual(36);expect(menu.right).toBeLessThanOrEqual(369);
  expect(bar.height).toBe(64);expect(menu.height).toBe(bar.height);expect(menu.top).toBeCloseTo(bar.top,4);
  expect(bar.bottom).toBeCloseTo(806,4);expect(menu.bottom).toBeCloseTo(806,4);
});

test('minimizing and keyboard restoring keep each painted pill aligned to its control',async({page})=>{
  await page.setViewportSize({width:393,height:852});await page.goto('/#/collection');
  await page.evaluate(()=>scrollTo(0,240));
  const bar=page.locator('.app-tabbar'),mini=page.locator('.app-navigation .ui-tabbar-mini');
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>bar.evaluate(e=>e.getAnimations().length)).toBe(0);
  const painted=(await bar.boundingBox())!,button=(await mini.boundingBox())!;
  expect(painted.height).toBe(48);expect(button.y).toBeCloseTo(painted.y,4);expect(button.x).toBeCloseTo(painted.x,4);
  await page.keyboard.press('Tab');await page.locator('.app-menu').focus();
  await expect.poll(async()=>Math.round((await boxes(page)).bar.height)).toBe(64);
  await expect.poll(()=>page.locator('.app-navigation').evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
  const {bar:full,menu}=await boxes(page);expect(menu.height).toBe(full.height);expect(menu.top).toBeCloseTo(full.top,4);
});
