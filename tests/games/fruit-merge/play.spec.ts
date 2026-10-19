import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
test.use({hasTouch:true});
test('mouse aim, real drops and merge, pause, keyboard, saved return and restart',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#/game/fruit-merge');const basket=page.getByRole('img',{name:/Fruit basket/});await expect(basket).toBeVisible();
 await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-text')).toContainText('equal');await page.getByRole('button',{name:'Let’s play'}).click();
 const box=await basket.boundingBox();if(!box)throw Error('No basket bounds');
 await page.mouse.move(box.x+box.width*.3,box.y+box.height*.5);await page.mouse.click(box.x+box.width*.3,box.y+box.height*.5);
 await expect(page.locator('.fm-count')).toHaveText('1 fruit in basket');
 const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')!).data.fruits[0]);expect(first.x).toBeCloseTo(108,0);
 await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeEnabled();
 await basket.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');await expect(page.locator('.fm-count')).toHaveText('2 fruits in basket');
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await expect(page.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
 const saved=await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:save:fruit-merge'));expect(saved).toBeTruthy();
 const before=JSON.parse(saved!).data;
 await basket.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
 await page.evaluate(async()=>{await new Promise<void>(resolve=>{let n=0;const frame=()=>{if(++n===20)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});window.dispatchEvent(new Event('pagehide'));});
 expect(JSON.parse((await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:save:fruit-merge')))!).data).toEqual(before);
 await page.getByRole('button',{name:'Keep playing',exact:true}).click();await page.getByRole('link',{name:'Back to game library'}).click();
 await page.getByRole('link',{name:'Play Fruit Merge',exact:true}).click();await expect(basket).toBeVisible();await expect(page.locator('.fm-count')).not.toHaveText('0 fruits in basket');
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(page.locator('.fm-count')).toHaveText('0 fruits in basket');
 await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeEnabled();expect(errors).toEqual([]);
});
test('responsive touch aim, accessible fruit tiers and a real merge',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/#/game/fruit-merge');const basket=page.getByRole('img',{name:/Fruit basket/});await expect(basket).toBeVisible();
 const box=await basket.boundingBox();if(!box)throw Error('No basket');
 for(let n=0;n<8;n++){
  await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeEnabled();
  await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.45);
 }
 await expect.poll(async()=>Number(await page.locator('#game-score strong').textContent())).toBeGreaterThan(0);
 await expect(page.locator('.fm-evolution [title]')).toHaveCount(11);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const sample=await page.evaluate(async()=>{
  const intervals:number[]=[];let previous=performance.now();for(let n=0;n<61;n++)await new Promise<void>(resolve=>requestAnimationFrame(now=>{if(n>0)intervals.push(now-previous);previous=now;resolve();}));
  const sorted=[...intervals].sort((a,b)=>a-b);return {browser:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},frames:intervals.length,meanMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...intervals),note:'Headless Chromium in a shared Linux execution container; not a physical Chromebook measurement.'};
 });
 await writeFile('tests/games/fruit-merge/evidence/performance-chromium.json',JSON.stringify(sample,null,2));
 await page.screenshot({path:'tests/games/fruit-merge/evidence/chromium.png',fullPage:true});
 for(const size of [{width:768,height:1024},{width:1366,height:768}]){await page.setViewportSize(size);await expect(basket).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`tests/games/fruit-merge/evidence/chromium-${size.width}.png`,fullPage:true});}
});
test('invalid saved data is ignored and navigation disposes stale controls',async({page})=>{
 await page.goto('/');await page.evaluate(()=>localStorage.setItem('pocket-arcade:v1:save:fruit-merge',JSON.stringify({version:1,data:{version:1,fruits:'broken'}})));
 await page.goto('/#/game/fruit-merge');await expect(page.locator('.fm-count')).toHaveText('0 fruits in basket');
 for(let n=0;n<3;n++){await page.getByRole('link',{name:'Back to game library'}).click();await page.getByRole('link',{name:'Play Fruit Merge',exact:true}).click();await expect(page.locator('.fm-count')).toHaveText('0 fruits in basket');}
 await page.getByRole('button',{name:'Drop fruit',exact:true}).click();await expect(page.locator('.fm-count')).toHaveText('1 fruit in basket');
});

test('restores a full supported pile, ends after settled grace, and restarts',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{
  const fruits=[{id:1,tier:10,y:404},{id:2,tier:9,y:245},{id:3,tier:8,y:103}].map(f=>({...f,x:180,vx:0,vy:0,angle:0,av:0,age:3000,danger:0,sleeping:true}));
  const data={version:1,seed:42,bag:[0,1,2,3],current:0,next:1,score:123,time:3000,lastDrop:0,lastMerge:0,combo:0,aim:180,nextId:4,lost:false,fruits};
  localStorage.setItem('pocket-arcade:v1:save:fruit-merge',JSON.stringify({version:1,data}));
 });
 await page.goto('/#/game/fruit-merge');await expect(page.locator('#game-score strong')).toHaveText('123');
 await expect(page.locator('.fm-banner')).toContainText('Basket full');await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(page.locator('.fm-count')).toHaveText('0 fruits in basket');await expect(page.locator('#game-score strong')).toHaveText('0');await expect(page.locator('#game-best strong')).toHaveText('123');
});
