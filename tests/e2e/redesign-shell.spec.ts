import {test,expect} from '../fixtures';

test('desktop header has brand, sections and actions',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await page.goto('/');
 await expect(page.locator('.site-brand')).toHaveText('Mauri Study Notes');
 await expect(page.locator('.ui-nav').getByRole('link',{name:'Movies',exact:true})).toHaveAttribute('href','#/movies/browse/movie');
 await expect(page.locator('.ui-nav').getByRole('link',{name:'TV Shows',exact:true})).toHaveAttribute('href','#/movies/browse/tv');
 await expect(page.locator('.count-pill')).toHaveAttribute('aria-label','21 games');
 await expect(page.locator('.app-tabbar')).toBeHidden();
 await page.getByRole('button',{name:'Search games',exact:true}).click();
 await expect(page.locator('#menu')).toBeVisible();
 await expect(page.locator('#search')).toBeFocused();
});

test('pressing / on the library opens search',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.game-card').first()).toBeVisible();
 await page.keyboard.press('/');
 await expect(page.locator('#menu')).toBeVisible();
 await expect(page.locator('#search')).toBeFocused();
 await expect(page.locator('#search')).toHaveValue('');
});

test('slash does not open search in a game or in Movies & TV',async({page})=>{
 await page.goto('/#/collection/1');
 await expect(page.locator('.game-view')).toBeVisible();
 await page.keyboard.press('/');
 await expect(page.locator('#menu')).toBeHidden();
 await page.goto('/#/movies');
 await expect(page.locator('.movies-view')).toBeVisible();
 await page.keyboard.press('/');
 await expect(page.locator('#menu')).toBeHidden();
});

for(const width of [320,390]) test(`phone tab bar replaces the section links at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/');
 await expect(page.locator('.app-tabbar')).toBeVisible();
 const heights=await page.locator('.app-tabbar > *').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));
 expect(heights).toHaveLength(5);
 for(const height of heights)expect(height).toBeGreaterThanOrEqual(44);
 await expect(page.locator('.ui-nav')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeVisible();
});

test('tab bar hides during games and Movies & TV',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/collection/1');
 await expect(page.locator('.game-view')).toBeVisible();
 await expect(page.locator('.app-tabbar')).toBeHidden();
 await page.goto('/#/movies');
 await expect(page.locator('.movies-view')).toBeVisible();
 await expect(page.locator('.app-tabbar')).toBeHidden();
 await page.goto('/#/collection');
 await expect(page.locator('.app-tabbar')).toBeVisible();
});

test('Study tab opens Study Mode',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('.app-tabbar').getByRole('button',{name:'Study',exact:true}).click();
 await expect(page.locator('#study-view')).toBeVisible();
});
