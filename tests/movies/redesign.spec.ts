import {test,expect} from '../fixtures';
import type {Locator,Page} from '@playwright/test';

// Same network fixtures as movies.spec.ts. The streaming hosts also answer with the provider fixture page.
test.beforeEach(async({page})=>{
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
 for(const url of ['https://framextv.cc/**','https://framextv.xyz/**','https://vidlink.pro/**','https://vixsrc.to/**','https://vidsrc.to/**'])
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

// Presses Tab until the target has focus, so the focus ring comes from the keyboard as it would for a user.
async function tabTo(page:Page,target:Locator){
 for(let i=0;i<40;i++){
  if(await target.evaluate(e=>e===document.activeElement))return;
  await page.keyboard.press('Tab');
 }
 throw new Error('Tab never reached the target');
}
const outline=(target:Locator)=>target.evaluate(e=>{const s=getComputedStyle(e);return {style:s.outlineStyle,width:parseFloat(s.outlineWidth)};});

test('section buttons change the address and survive reload',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await expect(page).toHaveURL(/#\/movies\/browse\/tv$/);
 await expect(page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();
 await expect(page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.goBack();
 await expect(page).toHaveURL(/#\/movies$/);
 await expect(page.locator('.movies-top').getByRole('button',{name:'Home',exact:true})).toHaveAttribute('aria-pressed','true');
});

for(const width of [320,390])test(`the phone tab bar replaces the section buttons at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 await page.goto('/#/movies');
 await expect(page.locator('.movies-mobile-nav')).toBeVisible();
 await expect(page.locator('.movies-mobile-nav .ui-tab')).toHaveCount(5);
 await expect(page.locator('.movies-top .ui-nav')).toHaveCount(1);
 await expect(page.locator('.movies-top .ui-nav')).toBeHidden();
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 expect(await page.locator('.movies-view').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test('focus is visible on header controls and cards',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const home=page.locator('.movies-top').getByRole('button',{name:'Home',exact:true});
 await tabTo(page,home);
 const header=await outline(home);
 expect(header.style).toBe('solid');
 expect(header.width).toBeGreaterThanOrEqual(2);
 const poster=page.locator('.movies-poster').first();
 await tabTo(page,poster);
 const card=await outline(poster);
 expect(card.style).toBe('solid');
 expect(card.width).toBeGreaterThanOrEqual(2);
});

// WCAG 2.4.11: focus must not leave a field under the sticky header. Focus scrolls it to the top edge, which has to clear the header.
test('keyboard focus scrolls a field clear of the sticky header',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const search=page.locator('#movies-search');
 await expect(page.locator('.movies-catalog-status')).toBeVisible();
 await expect(search).toBeVisible();
 // Scroll until the field sits just above the visible area, as a user scrolling past it would leave it.
 await page.locator('.movies-view').evaluate(v=>{const f=document.querySelector('#movies-search')!;v.scrollTop+=f.getBoundingClientRect().top+12;});
 await search.focus();
 await expect(search).toBeFocused();
 const hit=await page.evaluate(()=>{
  const f=document.querySelector<HTMLInputElement>('#movies-search')!,b=f.getBoundingClientRect();
  const e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
  return {top:Math.round(b.top),hit:e?e.tagName.toLowerCase():'none',clear:!!e&&(e===f||!!f.closest('label')?.contains(e))};
 });
 expect(hit.top,JSON.stringify(hit)).toBeGreaterThanOrEqual(56);
 expect(hit.clear,JSON.stringify(hit)).toBe(true);
});

// Rails: an arrow scrolls its row, the ends update, and focus moves to the arrow that is still there.
test('rail arrows scroll their row, update the ends and keep focus on an arrow',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const rail=page.locator('[data-rail="movies-you-ll-love"]');
 const row=rail.locator('.ui-rail-row');
 await expect(rail).toHaveAttribute('data-can-next','true');
 await rail.locator('.ui-rail-arrow.next').focus();
 await page.keyboard.press('Enter');
 await expect.poll(()=>row.evaluate(r=>r.scrollLeft)).toBeGreaterThan(0);
 await expect(rail).toHaveAttribute('data-can-prev','true');
 await expect(rail).toHaveAttribute('data-can-next','false');
 // The Next arrow hides at the end of the row, so keyboard focus moves to Previous.
 await expect(rail.locator('.ui-rail-arrow.prev')).toBeFocused();
});

// Ruling 4: a heading focused by script shows no ring. The Tab press first makes script focus count as keyboard focus.
test('a heading focused by script shows no ring',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const heading=page.locator('.movies-hero-copy h1[tabindex="-1"]');
 await expect(heading).toBeVisible();
 await page.keyboard.press('Tab');
 await heading.evaluate(e=>(e as HTMLElement).focus());
 await expect(heading).toBeFocused();
 expect((await outline(heading)).style).toBe('none');
});

// Ruling 1: the Movies tab bar is the glass island at every width.
for(const width of [1440,390])test(`the Movies island is visible at ${width}px, with 5 items`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 await expect(bar).toBeVisible();
 await expect(bar.locator('.ui-tab')).toHaveCount(5);
});

// Ruling 2: the island's hide-on-scroll follows the Movies scroller.
for(const width of [390,1440])test(`the Movies island hides on scroll down and returns on scroll up at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 await expect(bar).toBeVisible();
 // The page must be scrollable first: wait for the catalog's rails, which render after the loading state.
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 await view.evaluate(e=>e.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await view.evaluate(e=>e.scrollTo(0,300));
 await expect(bar).not.toHaveAttribute('data-hidden');
});

test('the Movies island is shown again after a section change while it is hidden',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 await view.evaluate(e=>e.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await expect(bar).not.toHaveAttribute('data-hidden');
 await expect(bar.locator('[data-kind="tv"]')).toHaveAttribute('aria-pressed','true');
});

// Ruling 3: content and keyboard focus clear the island at every width.
for(const width of [390,1440])test(`the Movies scroller keeps 88px of bottom clearance at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies');
 const view=page.locator('.movies-view');
 expect(await view.evaluate(e=>getComputedStyle(e).scrollPaddingBottom)).toBe('88px');
 expect(await view.evaluate(e=>getComputedStyle(e).paddingBottom)).toBe('88px');
});

// Ruling 5: the header never clips the wordmark, overflows its row, or lets the brand, nav and actions overlap, from 320 to 1920 px.
test('the Movies header fits from 320 to 1920 px without clipping the wordmark',async({page})=>{
 const widths=[320,360,390,639,640,700,768,900,1023,1024,1280,1920];
 const results:{width:number;wordmark:number;row:number;brand:number;overlap:boolean}[]=[];
 for(const width of widths){
  await page.setViewportSize({width,height:800});
  await page.goto('/#/movies');
  await expect(page.locator('.ui-wordmark')).toBeVisible();
  results.push(await page.evaluate(w=>{
   const shown=(s:string)=>{const e=document.querySelector<HTMLElement>(s);if(!e||getComputedStyle(e).display==='none')return undefined;const b=e.getBoundingClientRect();return {l:b.left,r:b.right};};
   const mark=document.querySelector<HTMLElement>('.ui-wordmark')!,brand=document.querySelector<HTMLElement>('.ui-brand')!,row=document.querySelector<HTMLElement>('.ui-header-inner')!;
   const B=shown('.ui-brand'),W=shown('.ui-wordmark'),N=shown('.ui-header .ui-nav'),A=shown('.ui-header-actions'),after=N??A;
   return {width:w,wordmark:mark.scrollWidth-mark.clientWidth,row:row.scrollWidth-row.clientWidth,brand:brand.scrollWidth-brand.clientWidth,
    overlap:Boolean(W&&B&&W.r>B.r+0.5)||Boolean(B&&after&&B.r>after.l+0.5)||Boolean(N&&A&&N.r>A.l+0.5)};
  },width));
 }
 expect(results.filter(r=>r.wordmark!==0||r.row!==0||r.brand!==0||r.overlap)).toEqual([]);
});
