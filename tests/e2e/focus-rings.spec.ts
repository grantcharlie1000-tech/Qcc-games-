import {test,expect,keyboardMode} from '../fixtures';
import type {Locator,Page} from '@playwright/test';

// Focus rings show only after keyboard use. A tap or click draws none, and a text field brightens its border instead of
// taking an outer ring. Each check runs at a phone and a desktop width, because the Movies layout changes between them.
const PHONE={width:390,height:844};
const DESKTOP={width:1440,height:900};
const BRIGHT_BORDER='rgba(255, 255, 255, 0.55)';
const WHITE_RING={style:'solid',width:'2px',colour:'rgb(255, 255, 255)',offset:'2px'};
const INNER_RING='rgba(255, 255, 255, 0.7) 0px 0px 0px 1px inset';
const TITLE='/#/movies/tv-19885/season/1/episode/1/play';

const outline=(locator:Locator)=>locator.evaluate(element=>{const s=getComputedStyle(element);return {style:s.outlineStyle,width:s.outlineWidth,colour:s.outlineColor,offset:s.outlineOffset};});
const borderColour=(locator:Locator)=>locator.evaluate(element=>getComputedStyle(element).borderTopColor);
const boxShadow=(locator:Locator)=>locator.evaluate(element=>getComputedStyle(element).boxShadow);
const inputMode=(page:Page)=>page.evaluate(()=>document.documentElement.dataset.input);
// A press that leaves keyboard focus where it is. A tap can leave the tapped control :focus-visible in Safari, so the ring must follow the page's mode.
const press=(page:Page)=>page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));

// Neither the page's ring nor the browser's own shows: the outline is off, whatever the element is focused by.
async function expectNoOutline(locator:Locator){const o=await outline(locator);expect(o.style==='none'||o.width==='0px',`outline ${JSON.stringify(o)}`).toBe(true);}
async function expectWhiteRing(locator:Locator){expect(await outline(locator)).toEqual(WHITE_RING);}
// A field has no outline and no outer ring, and keyboard use draws its inner ring on the rounded edge.
async function expectInnerRing(locator:Locator){await expectNoOutline(locator);expect(await boxShadow(locator)).toContain(INNER_RING);}
async function expectNoInnerRing(locator:Locator){expect(await boxShadow(locator)).not.toContain(INNER_RING);}

// Presses Tab until the target has focus, so its ring comes from keyboard focus, as it does for a keyboard-only visitor.
async function tabTo(page:Page,target:Locator){
 for(let i=0;i<40;i++){
  if(await target.evaluate(element=>element===document.activeElement))return;
  await page.keyboard.press('Tab');
 }
 throw new Error('Tab never reached the target');
}

// The provider fixture reports the end of playback, which shows Up next. The clock is paused first so the countdown starts after the check.
async function telemetry(page:Page,currentTime=100,duration=100){await page.frame({url:/framextv/})!.evaluate(({currentTime,duration})=>parent.postMessage({event:'frameXTV:timeupdate',currentTime,duration},'*'),{currentTime,duration});}
const upNext=(page:Page)=>page.getByRole('dialog',{name:'Up next'});
// Movies replaces the shell's island with its own, whose tabs are buttons.
const island=(page:Page)=>page.locator('nav.movies-mobile-nav.ui-tabbar');
async function ended(page:Page){await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await telemetry(page);await expect(upNext(page)).toBeVisible();}

test.beforeEach(async({page})=>{
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button><script>parent.postMessage({event:"frameXTV:ready"},"*")</script>'}));
 for(const origin of ['https://framextv.xyz','https://vidlink.pro','https://vixsrc.to','https://vidsrc.to'])await page.route(origin+'/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 await page.route('https://image.tmdb.org/**',r=>r.abort());
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

// A watch page asks before it loads a third-party player. The tests accept that first, with a click, so the mode each test sets up
// afterwards is the only one in play.
async function acceptWarning(page:Page){
 const warning=page.getByRole('dialog',{name:'Before you watch'});
 await warning.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(warning).toBeHidden();
}
async function openWatch(page:Page){await page.goto(TITLE);await acceptWarning(page);}

for(const viewport of [PHONE,DESKTOP])test.describe(`at ${viewport.width} px`,()=>{
 test.beforeEach(async({page})=>{await page.setViewportSize(viewport);});

 test('a mouse click draws no ring on the genre select, and the select brightens its border',async({page})=>{
  await page.goto('/#/movies');
  const genre=page.locator('#movies-genre');
  await genre.click();
  await expect(genre).toBeFocused();
  expect(await inputMode(page)).toBe('pointer');
  await expectNoOutline(genre);
  expect(await borderColour(genre)).toBe(BRIGHT_BORDER);
  await expectNoInnerRing(genre);
 });

 test('a mouse click draws no ring on the search field, which brightens its border, and typing keeps the pointer mode',async({page})=>{
  await page.goto('/#/movies');
  const search=page.locator('#movies-search'),field=page.locator('label.movies-search');
  await search.click();
  await expect(search).toBeFocused();
  await expectNoOutline(search);
  await expectNoOutline(field);
  expect(await borderColour(field)).toBe(BRIGHT_BORDER);
  await expectNoInnerRing(field);
  await page.keyboard.type('dun');
  await expect(search).toHaveValue('dun');
  expect(await inputMode(page)).toBe('pointer');
 });

 test('a mouse click draws no ring on an island tab or a Movies button',async({page})=>{
  await page.goto('/#/movies');
  const tab=island(page).getByRole('button',{name:'TV Shows',exact:true});
  // The click navigates and the island redraws, so the tab that replaces the clicked one must show no ring.
  await tab.click();
  await expect(tab).toHaveAttribute('aria-pressed','true');
  await expectNoOutline(tab);
  await openWatch(page);
  const fullscreen=page.getByRole('button',{name:'Full screen',exact:true});
  await expect(fullscreen).toBeVisible();
  await fullscreen.click();
  await expectNoOutline(fullscreen);
 });

 test('a mouse click draws no ring on the menu button, nor on the menu sheet\'s search field',async({page})=>{
  await page.goto('/');
  const menu=page.locator('.app-tabbar').getByRole('button',{name:'Open menu',exact:true});
  await menu.click();
  await expect(page.locator('#menu')).toBeVisible();
  await expectNoOutline(menu);
  const search=page.getByRole('searchbox');
  await search.click();
  await expect(search).toBeFocused();
  await expectNoOutline(search);
  expect(await borderColour(search)).toBe(BRIGHT_BORDER);
  await expectNoInnerRing(search);
 });

 test('Tab shows the white ring on an island tab and on a Movies button',async({page})=>{
  await page.goto('/#/movies');
  const tab=island(page).getByRole('button',{name:'Movies',exact:true});
  await tabTo(page,tab);
  await expectWhiteRing(tab);
  await openWatch(page);
  const fullscreen=page.getByRole('button',{name:'Full screen',exact:true});
  await tabTo(page,fullscreen);
  await expectWhiteRing(fullscreen);
 });

 test('Tab shows the search field its inner ring with no outline, and the genre select the same ring beside its own highlight',async({page})=>{
  await page.goto('/#/movies');
  const search=page.locator('#movies-search'),field=page.locator('label.movies-search');
  await tabTo(page,search);
  await expectInnerRing(field);
  await expectNoOutline(search);
  const genre=page.locator('#movies-genre');
  await tabTo(page,genre);
  await expectNoOutline(genre);
  expect(await boxShadow(genre)).toContain(INNER_RING);
  expect(await boxShadow(genre)).toContain('rgba(255, 255, 255, 0.18) 0px 1px 0px 0px inset');
 });

 test('a press takes the ring off a control that keeps keyboard focus, and the next key brings it back',async({page})=>{
  await page.goto('/#/movies');
  const tab=island(page).getByRole('button',{name:'Movies',exact:true});
  await tabTo(page,tab);
  await expectWhiteRing(tab);
  await press(page);
  expect(await inputMode(page)).toBe('pointer');
  await expectNoOutline(tab);
  await keyboardMode(page);
  await expectWhiteRing(tab);
 });

 test('a press takes the inner ring off a field that keeps keyboard focus, and the next key brings it back',async({page})=>{
  await page.goto('/#/movies');
  const search=page.locator('#movies-search'),field=page.locator('label.movies-search');
  await tabTo(page,search);
  await expectInnerRing(field);
  await press(page);
  await expectNoInnerRing(field);
  expect(await borderColour(field)).toBe(BRIGHT_BORDER);
  await keyboardMode(page);
  await expectInnerRing(field);
 });

 test('opening the episode drawer by click leaves its current row without a ring, and opening it from the keyboard shows one',async({page})=>{
  await openWatch(page);
  const trigger=page.getByRole('button',{name:'S1 · E1',exact:true});
  await trigger.click();
  const row=page.getByRole('dialog',{name:'Select episode',exact:true}).locator('.movies-drawer-row[aria-current="true"]');
  await expect(row).toBeFocused();
  await expectNoOutline(row);
  // The same address does not reload the page, and the open drawer would keep focus inside itself, so the page is reloaded.
  await page.reload();
  // The reloaded page asks again before its player loads. Tab then puts the page back in keyboard mode.
  await acceptWarning(page);
  await tabTo(page,page.getByRole('button',{name:'S1 · E1',exact:true}));
  await page.keyboard.press('Enter');
  const keyed=page.getByRole('dialog',{name:'Select episode',exact:true}).locator('.movies-drawer-row[aria-current="true"]');
  await expect(keyed).toBeFocused();
  await expectWhiteRing(keyed);
 });

 test('Up next appearing after a click leaves Play now without a ring',async({page})=>{
  await openWatch(page);
  await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
  await page.clock.install();
  await page.locator('.movies-player>h2').click();
  await ended(page);
  const play=upNext(page).getByRole('button',{name:'Play now',exact:true});
  await expect(play).toBeFocused();
  expect(await inputMode(page)).toBe('pointer');
  await expectNoOutline(play);
 });
});

// A tap is a touch press, which keeps the page in pointer mode as a click does.
test.describe('a tap at 390 px',()=>{
 test.use({hasTouch:true,viewport:PHONE});
 test('draws no ring on the genre select, and brightens the select\'s border',async({page})=>{
  await page.goto('/#/movies');
  const genre=page.locator('#movies-genre');
  await genre.tap();
  await expect(genre).toBeFocused();
  expect(await inputMode(page)).toBe('pointer');
  await expectNoOutline(genre);
  expect(await borderColour(genre)).toBe(BRIGHT_BORDER);
 });
});

// Forced colours drop box shadows, so keyboard use keeps a visible ring in an outline, and a field keeps its edge.
test('forced colours keep a visible keyboard ring on an island tab and on a field',async({page})=>{
 await page.setViewportSize(DESKTOP);
 await page.emulateMedia({forcedColors:'active'});
 await page.goto('/#/movies');
 // The system colours, read from a probe, so the expectations do not hard-code a palette.
 const system=await page.evaluate(()=>{const colours:Record<string,string>={};for(const name of ['CanvasText','Highlight']){const probe=document.createElement('span');probe.style.color=name;document.body.append(probe);colours[name]=getComputedStyle(probe).color;probe.remove();}return colours;});
 const tab=island(page).getByRole('button',{name:'Movies',exact:true});
 await tabTo(page,tab);
 const ring=await outline(tab);
 expect(ring.style).toBe('solid');
 expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
 expect([system.CanvasText,system.Highlight]).toContain(ring.colour);
 const search=page.locator('#movies-search'),field=page.locator('label.movies-search');
 await tabTo(page,search);
 const fieldRing=await outline(field);
 expect(fieldRing.style).toBe('solid');
 expect(parseFloat(fieldRing.width)).toBeGreaterThanOrEqual(1);
 expect(fieldRing.colour).toBe(system.CanvasText);
 expect(await field.evaluate(element=>getComputedStyle(element).borderTopStyle)).toBe('solid');
});

// A title that is not found focuses its heading as the page changes. Keyboard use shows the ring on it.
test('the not-found heading shows its ring after keyboard use',async({page})=>{
 await page.setViewportSize(DESKTOP);
 await page.goto('/#/movies');
 await tabTo(page,island(page).getByRole('button',{name:'Movies',exact:true}));
 await page.evaluate(()=>{location.hash='#/movies/tv-404/season/1/episode/1/play';});
 const heading=page.locator('.movies-empty h1');
 await expect(heading).toBeFocused();
 await expectWhiteRing(heading);
});
