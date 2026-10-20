# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: games/flappy-bird/play.spec.ts >> a real scored flight persists its record and ignores held repeat and dialog keys
- Location: tests/games/flappy-bird/play.spec.ts:36:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('#game-score strong')
Expected pattern: /^[1-9]/
Received string:  "0"
Timeout: 7000ms

Call log:
  - Expect "toHaveText" locator('#game-score strong') with timeout 7000ms
  - waiting for locator('#game-score strong')
    18 × locator resolved to <strong>0</strong>
       - unexpected value "0"

```

```yaml
- strong: "0"
```

# Test source

```ts
  1  | import {test,expect,seedStudyTopic} from '../../fixtures';
  2  | import type {Page} from '../../fixtures';
  3  | async function frames(page:Page,count=10){await page.evaluate(n=>new Promise<void>(resolve=>{let i=0;function next(){if(++i>=n)resolve();else requestAnimationFrame(next);}requestAnimationFrame(next);}),count);}
  4  | async function snapshot(page:Page){await page.getByRole('button',{name:'Pause game',exact:true}).click();return page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:flappy-bird')!).data);}
  5  | async function observePointerFlap(page:Page){
  6  |   // Let gravity change the starting lift so a missing handler cannot pass.
  7  |   await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.flappy-bird')!.dataset.vy)>-200);
  8  |   // This listener is installed after the game's listener, so it observes the
  9  |   // native input response in the same event task, before gravity resumes.
  10 |   await page.locator('.flappy-bird canvas').evaluate(el=>el.addEventListener('pointerdown',event=>{
  11 |     const root=el.closest<HTMLElement>('.flappy-bird')!;
  12 |     el.setAttribute('data-test-flap',JSON.stringify({trusted:event.isTrusted,phase:root.dataset.phase,vy:Number(root.dataset.vy)}));
  13 |   },{once:true}));
  14 | }
  15 | async function expectPointerFlap(page:Page){
  16 |   const flap=JSON.parse((await page.locator('.flappy-bird canvas').getAttribute('data-test-flap'))!);
  17 |   expect(flap).toEqual({trusted:true,phase:'running',vy:-300});
  18 | }
  19 |
  20 | test('keyboard and mouse flap, pause and Study freeze, restore waits, restart and disposal clean up',async({page})=>{
  21 |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#/game/flappy-bird');
  22 |   const root=page.locator('.flappy-bird');await expect(root).toHaveAttribute('data-phase','ready');
  23 |   await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-text')).toContainText('Space');await page.getByRole('button',{name:'Let’s play'}).click();await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
  24 |   await root.locator('canvas').focus();await page.keyboard.press('Space');await expect(root).toHaveAttribute('data-phase','running');
  25 |   await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.flappy-bird')!.dataset.tick)>12);
  26 |   await observePointerFlap(page);await root.locator('canvas').click({position:{x:170,y:240}});await expectPointerFlap(page);const saved=await snapshot(page);
  27 |   await root.locator('canvas').focus();await page.keyboard.press('Space');await frames(page);expect(await root.getAttribute('data-tick')).toBe(String(saved.tick));
  28 |   await page.reload();await expect(page.getByRole('button',{name:'Continue flight',exact:true})).toBeVisible();const tick=await root.getAttribute('data-tick');await frames(page);expect(await root.getAttribute('data-tick')).toBe(tick);
  29 |   await page.getByRole('button',{name:'Continue flight',exact:true}).click();await page.keyboard.press('Escape');const studyTick=await root.getAttribute('data-tick');await page.keyboard.press('Space');await frames(page);expect(await root.getAttribute('data-tick')).toBe(studyTick);
  30 |   await page.getByRole('link',{name:'Games',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(root).toHaveAttribute('data-phase','ready');await expect(root).toHaveAttribute('data-tick','0');
  31 |   await page.getByRole('button',{name:'Flap',exact:true}).click();await expect(root).toHaveAttribute('data-phase','running');await expect(root).toHaveAttribute('data-phase','over');
  32 |   await page.getByRole('button',{name:'Fly again',exact:true}).click();await expect(root).toHaveAttribute('data-phase','running');
  33 |   await page.getByRole('link',{name:'Back to game library',exact:true}).click();await expect(root).toHaveCount(0);await page.keyboard.press('Space');await page.getByRole('link',{name:'Play Flappy Bird',exact:true}).click();await expect(page.getByRole('button',{name:'Continue flight',exact:true})).toBeVisible();expect(errors).toEqual([]);
  34 | });
  35 |
  36 | test('a real scored flight persists its record and ignores held repeat and dialog keys',async({page})=>{
  37 |   await page.clock.install();await page.goto('/#/game/flappy-bird');await expect(page.locator('.flappy-bird')).toHaveAttribute('data-phase','ready');await page.clock.pauseAt(new Date(Date.now()+1000));
  38 |   await page.getByRole('button',{name:'Take flight',exact:true}).click({force:true});
  39 |   for(let i=0;i<80;i++){
  40 |     const state=await page.locator('.flappy-bird').evaluate(el=>({y:Number((el as HTMLElement).dataset.y),vy:Number((el as HTMLElement).dataset.vy),target:Number((el as HTMLElement).dataset.target)}));
  41 |     if(state.y>state.target+15&&state.vy>0)await page.keyboard.press('Space');
  42 |     await page.clock.runFor(50);
  43 |   }
> 44 |   await expect(page.locator('#game-score strong')).toHaveText(/^[1-9]/);const best=await page.locator('#game-best strong').textContent();await page.screenshot({path:'tests/games/flappy-bird/evidence/gameplay.png'});
     |                                                    ^ Error: expect(locator).toHaveText(expected) failed
  45 |   await page.keyboard.down('Space');await page.clock.runFor(200);const velocity=await page.locator('.flappy-bird').getAttribute('data-vy');await page.keyboard.down('Space');expect(await page.locator('.flappy-bird').getAttribute('data-vy')).toBe(velocity);await page.keyboard.up('Space');
  46 |   await page.getByRole('button',{name:'Open menu',exact:true}).click({force:true});const tick=await page.locator('.flappy-bird').getAttribute('data-tick');await page.getByLabel('Reduce motion',{exact:true}).focus();await page.keyboard.press('Space');await page.clock.runFor(200);expect(await page.locator('.flappy-bird').getAttribute('data-tick')).toBe(tick);
  47 |   await page.getByRole('button',{name:'Close menu'}).click({force:true});await page.getByRole('button',{name:'Restart game',exact:true}).click({force:true});await expect(page.locator('#game-score strong')).toHaveText('0');await expect(page.locator('#game-best strong')).toHaveText(best!);
  48 |   await page.reload();await expect(page.locator('#game-best strong')).toHaveText(best!);
  49 | });
  50 |
  51 | test('native phone touch is a single flap and pointer cancellation does not leave input held',async({browser,browserName})=>{
  52 |   test.skip(browserName!=='chromium','Native CDP touch uses Chromium');const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3});await seedStudyTopic(context);const page=await context.newPage();await page.goto('/#/game/flappy-bird');await page.getByRole('button',{name:'Take flight',exact:true}).tap();
  53 |   await expect(page.locator('.flappy-bird canvas')).toHaveAttribute('width','720');await expect(page.locator('.flappy-bird canvas')).toHaveAttribute('height','1080');
  54 |   const canvas=page.locator('.flappy-bird canvas'),box=(await canvas.boundingBox())!,cdp=await context.newCDPSession(page);
  55 |   await observePointerFlap(page);
  56 |   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  57 |   await expectPointerFlap(page);await snapshot(page);await page.getByRole('button',{name:'Keep playing'}).tap();await expect(page.locator('.flappy-bird')).toHaveAttribute('data-phase','over');await context.close();
  58 | });
  59 |
  60 | for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`original scene and controls fit ${size.width}x${size.height}`,async({page})=>{
  61 |   await page.setViewportSize(size);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/#/game/flappy-bird');await expect(page.locator('.flappy-bird canvas')).toBeVisible();await expect(page.locator('#game-stage')).toHaveAttribute('data-viewport-scale',/./);
  62 |   for(const control of await page.locator('.flappy-bird button,.game-toolbar button,.game-toolbar a').all()){
  63 |     if(!await control.isVisible())continue;const box=(await control.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(-1);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width+1);expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);if(await control.evaluate(el=>!!el.closest('.flappy-bird')))expect(box.height).toBeGreaterThanOrEqual(43.9);
  64 |     expect(await control.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  65 |   }
  66 |   await page.screenshot({path:`tests/games/flappy-bird/evidence/${size.width}x${size.height}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  67 | });
  68 |
```
