import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';
const ENDPOINT='**/api/movie-popularity';
async function setup(page:Page,ids:string[]=[]){
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.route(ENDPOINT,r=>r.fulfill({json:{titleIds:ids,windowDays:7}}));
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><button>Play fixture</button>'}));
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
}
test('shows only real ranked titles and keeps the preference on by default without a new popup',async({page})=>{
 await setup(page,['movie-157336','movie-329865']);await page.goto('/#/movies');
 const rail=page.locator('[data-rail="popular-marlborough"]');
 await expect(rail.getByRole('heading',{name:'Popular in Marlborough'})).toBeVisible();
 await expect(rail.locator('[data-title]')).toHaveCount(2);
 await expect(rail.locator('[data-title]').first()).toHaveAttribute('data-title','movie-157336');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('.movies-menu').click();
 await expect(page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'})).toBeChecked();
 await page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'}).uncheck();
 await page.reload();await page.locator('.movies-menu').click();
 await expect(page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'})).not.toBeChecked();
});
test('empty and unavailable states never substitute TMDB trending or starter titles',async({page})=>{
 await setup(page);await page.goto('/#/movies');const rail=page.locator('[data-rail="popular-marlborough"]');
 await expect(rail).toContainText('Not enough viewing activity yet.');await expect(rail.locator('[data-title]')).toHaveCount(0);
 await page.route(ENDPOINT,r=>r.fulfill({status:503,json:{error:'not_configured'}}));await page.reload();
 await expect(rail).toContainText('Popular picks are unavailable right now.');await expect(rail.locator('[data-title]')).toHaveCount(0);
});
test('counts advancing playback once, ignores ready messages and seeks, and stops after opt-out',async({page})=>{
 await setup(page);const posts:unknown[]=[];
 await page.route(ENDPOINT,async route=>{if(route.request().method()==='POST')posts.push(route.request().postDataJSON());await route.fulfill({json:{titleIds:[],windowDays:7}});});
 await page.goto('/#/movies/movie-157336/play');await expect(page.locator('.movies-provider-frame')).toBeVisible();
 await page.clock.install();
 const frame=()=>page.frame({url:/framextv/})!;
 const report=async(time:number)=>{await frame().evaluate(time=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:time,duration:6000},'*'),time);await page.waitForTimeout(20);};
 await frame().evaluate(()=>parent.postMessage({event:'frameXTV:ready'},'*'));await report(0);await report(3000);expect(posts).toHaveLength(0);
 for(let i=0;i<=12;i++){await page.clock.runFor(5000);await report(3000+i*5);}
 await expect.poll(()=>posts.length).toBe(1);expect(posts[0]).toMatchObject({titleId:'movie-157336'});expect(Object.keys(posts[0] as object).sort()).toEqual(['titleId','token']);
 await page.locator('.movies-menu').click();await page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'}).uncheck();await page.getByRole('button',{name:'Close menu',exact:true}).click();
 await page.goto('/#/movies/movie-329865/play');await expect(page.locator('.movies-provider-frame')).toBeVisible();
 for(let i=0;i<=12;i++){await page.clock.runFor(5000);await report(i*5);}
 expect(posts).toHaveLength(1);
});

for(const width of [390,1440])test(`popularity toggle shares the settings group at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);await page.goto('/#/movies');await page.locator('.movies-menu').click();
 const layout=await page.locator('#movie-popularity').evaluate(input=>{
  const row=input.closest('label')!,previous=document.querySelector('#festive')!.closest('label')!;
  const switchBox=input.getBoundingClientRect(),previousSwitch=document.querySelector('#festive')!.getBoundingClientRect();
  return {sameGroup:row.parentElement===previous.parentElement,adjacent:row.previousElementSibling===previous,gap:row.getBoundingClientRect().top-previous.getBoundingClientRect().bottom,rightDifference:switchBox.right-previousSwitch.right,border:getComputedStyle(row).borderTopWidth};
 });
 expect(layout.sameGroup).toBe(true);expect(layout.adjacent).toBe(true);expect(Math.abs(layout.gap)).toBeLessThanOrEqual(1);expect(Math.abs(layout.rightDifference)).toBeLessThanOrEqual(1);expect(layout.border).toBe('1px');
});
