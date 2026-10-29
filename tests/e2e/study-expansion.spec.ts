import {guestTest as test,expect,seedGuest} from '../fixtures';
import {mkdir} from 'node:fs/promises';

const key='pocket-arcade:study:v1:topic';
const styleOf=(id:string)=>id.includes(':')?id.split(':')[0]:'qcc';

async function seed(page:import('@playwright/test').Page,id='close-reading',remember=true){
  await page.addInitScript(({id,remember,key})=>{
    if(!window.name){localStorage.setItem('pocket-arcade:study:v1:reading-choice',remember?'accept':'reject');if(remember)sessionStorage.setItem(key,id);window.name='expansion-seeded';}
  },{id,remember,key});
}

test('Escape changes styles without changing topic, dismisses privacy and menus first, and preserves a game across reload',async({page})=>{
  await seed(page);await page.goto('/#/game/fruit-merge');
  await page.getByRole('button',{name:'Drop fruit',exact:true}).click();await expect(page.locator('.fm-count')).toContainText('1 fruit');
  let saved:unknown;
  let previous='qcc';
  for(let i=0;i<16;i++){
    await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
    if(i===0)saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')!).data);
    const selected=await page.evaluate(key=>sessionStorage.getItem(key)!,key);
    expect(styleOf(selected)).not.toBe(previous);expect(selected.endsWith('close-reading')).toBe(true);previous=styleOf(selected);
  }
  await page.getByRole('button',{name:'Reading storage choices',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Reading storage choices'});await expect(dialog).toBeVisible();
  const selected=await page.evaluate(key=>sessionStorage.getItem(key),key);await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe(selected);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')!).data)).toEqual(saved);
  await page.getByRole('link',{name:'Games',exact:true}).first().click();await expect(page.locator('.fm-count')).toContainText('1 fruit');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#menu')).not.toBeVisible();await expect(page.locator('#study-view')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
  let current=await page.evaluate(key=>sessionStorage.getItem(key)!,key);expect(styleOf(current)).not.toBe(previous);previous=styleOf(current);
  await page.reload();await expect(page.locator('.fm-count')).toContainText('1 fruit');
  await page.keyboard.press('Escape');current=await page.evaluate(key=>sessionStorage.getItem(key)!,key);expect(styleOf(current)).not.toBe(previous);
  await page.getByRole('link',{name:'Games',exact:true}).first().click();await expect(page.locator('.fm-count')).toContainText('1 fruit');
});

test('without consent article choice stays in memory and reload returns to the picker',async({page})=>{
  await seed(page,'close-reading',false);await page.goto('/#/game/fruit-merge');
  await page.locator('[data-study-topic="forces"]').click();await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
  await page.keyboard.press('Escape');expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
  await page.reload();await expect(page.locator('[data-study-topic]')).toHaveCount(20);
});

test('a newly blocked article write is explained on entry and while already reading',async({page})=>{
  await seed(page);await page.goto('/#/game/fruit-merge');await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeVisible();
  await page.evaluate(()=>{const original=Storage.prototype.setItem;(window as any).restoreStudyWrite=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='pocket-arcade:study:v1:topic')throw new DOMException('Quota','QuotaExceededError');return original.call(this,key,value);};});
  await page.keyboard.press('Escape');const dialog=page.getByRole('dialog',{name:'Reading storage choices'});
  await expect(dialog.getByRole('status')).toContainText('could not be remembered');
  expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe('close-reading');
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>(window as any).restoreStudyWrite());await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='pocket-arcade:study:v1:topic')throw new DOMException('Quota','QuotaExceededError');return original.call(this,key,value);};});
  await page.keyboard.press('Escape');await expect(dialog.getByRole('status')).toContainText('could not be remembered');
});

test('a browser-consumed fullscreen Escape dismisses a menu first and then advances the article',async({page})=>{
  await seed(page);await page.goto('/#/game/fruit-merge');await expect(page.locator('.fm-count')).toBeVisible();
  await page.getByRole('button',{name:'Open menu',exact:true}).click();await expect(page.locator('#menu')).toBeVisible();
  await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange')));
  await expect(page.locator('#menu')).not.toBeVisible();await expect(page.locator('#study-view')).toBeHidden();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe('close-reading');
  await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange')));
  await expect(page.locator('#study-view')).toBeVisible();
  const selected=await page.evaluate(key=>sessionStorage.getItem(key)!,key);expect(styleOf(selected)).not.toBe('qcc');expect(selected.endsWith('close-reading')).toBe(true);
});

test('touch readers can advance through each new style without seeding article IDs',async({browser})=>{
  const context=await browser.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:390,height:844},isMobile:true,hasTouch:true});await seedGuest(context);
  const page=await context.newPage();
  try{
    await page.goto('/#/game/fruit-merge');await page.getByRole('button',{name:'Reject All',exact:true}).tap();await page.locator('[data-study-topic="forces"]').tap();
    await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Open menu',exact:true}).tap();await page.getByRole('button',{name:'Study Mode',exact:true}).tap();
    await page.evaluate(()=>{let i=0;const values=[0,.5,.99];Math.random=()=>values[i++%values.length];});
    for(const style of ['quanta','aeon','essay']){
      const next=page.getByRole('button',{name:'Next article',exact:true});await next.scrollIntoViewIfNeeded();await next.tap();
      await expect(page.locator('#study-view')).toHaveAttribute('data-style',style);await expect(page.locator('#study-topic')).toHaveValue('forces');
    }
  }finally{await context.close();}
});

test('Quanta mobile paragraphs retain a clear line of separation',async({page})=>{
  await page.setViewportSize({width:390,height:844});await seed(page,'quanta:close-reading');await page.goto('/#/game/fruit-merge');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  const spacing=await page.locator('.variant-prose > p').evaluateAll(ps=>{const first=ps[0],second=ps[1];return {gap:second.getBoundingClientRect().top-first.getBoundingClientRect().bottom,lineHeight:parseFloat(getComputedStyle(first).lineHeight)};});
  expect(spacing.gap).toBeGreaterThanOrEqual(spacing.lineHeight-1);
});

test('changing article during a delayed update cancels the pending reload even after returning to the original article',async({page})=>{
  await page.route('**/src/core/offline.ts*',route=>route.fulfill({contentType:'text/javascript',body:`
    export function watchUpdates(_entry, notify){notify({available:true,message:'An update is ready.'});}
    export async function checkForUpdates(){}
    export async function cacheAll(){return 0;}
    export function activateUpdate(){return new Promise(resolve=>{window.finishStudyActivation=resolve;});}
  `}));
  await seed(page);await page.goto('/#/game/fruit-merge');await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  await page.evaluate(()=>{(window as any).studyDocumentMarker='original';Math.random=()=>0;});
  await page.getByRole('button',{name:'Reload to update',exact:true}).click();
  await expect(page.locator('[data-study-update]')).toContainText('starting the update');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe('close-reading');
  await page.evaluate(()=>(window as any).finishStudyActivation());
  await expect(page.locator('[data-study-update]')).toContainText('An update is ready');
  expect(await page.evaluate(()=>(window as any).studyDocumentMarker)).toBe('original');
});

for(const viewport of [{name:'desktop',width:1180,height:900},{name:'mobile',width:390,height:844}]){
  for(const style of ['qcc','quanta','aeon','essay'])test(`${style} layout is readable and captured on ${viewport.name}`,async({page})=>{
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await seed(page,style==='qcc'?'close-reading':`${style}:close-reading`);await page.goto('/#/game/fruit-merge');
    await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Study Mode',exact:true}).click();
    await expect(page.locator('#study-title')).toBeVisible();
    if(style==='qcc')await expect(page.locator('#study-view')).not.toHaveAttribute('data-style',/./);else await expect(page.locator('#study-view')).toHaveAttribute('data-style',style);
    await page.evaluate(()=>window.scrollTo(0,0));await page.locator('#study-view img').evaluateAll(images=>Promise.all(images.map(image=>{(image as HTMLImageElement).loading='eager';return (image as HTMLImageElement).decode();})));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await mkdir('docs/evidence/article-expansion',{recursive:true});
    await page.screenshot({path:`docs/evidence/article-expansion/${style}-${viewport.name}-opening.png`});
    const body=page.locator('.study-article-body');await body.evaluate(element=>window.scrollTo(0,Math.max(0,element.getBoundingClientRect().top+window.scrollY-40)));
    await page.screenshot({path:`docs/evidence/article-expansion/${style}-${viewport.name}-reading.png`});
    await expect(body.getByRole('link',{name:'Games',exact:true})).toBeVisible();
    await body.getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('#study-view')).toBeHidden();
  });
}
