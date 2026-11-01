import {test,expect} from '../fixtures';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

for(const id of ['snake','quadfall','maze-muncher','neon-coil'])test(`${id} glass reads new canvas frames without rebuilding its lens map`,async({page})=>{
  await page.goto(`/#/game/${id}`);
  const control=page.locator('#game-menu');await expect(control).toBeVisible();
  await control.screenshot({animations:'disabled'});
  // The production docks reserve space outside some boards. This optical
  // fixture puts live canvas pixels behind their actual controls without
  // changing board geometry, input, game models, scores or saves.
  await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.id='live-material-source';
    canvas.width=innerWidth;canvas.height=innerHeight;
    canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:20;pointer-events:none';
    document.querySelector('.game-view')!.append(canvas);
  });
  await page.addStyleTag({content:'#game-menu>:not(.ui-glass-lens,.ui-glass-glow){visibility:hidden!important}'});
  const maps=()=>page.locator('filter[id^=ui-glass-] feImage').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
  const before=await maps();
  for(const rgb of [[18,36,54],[226,180,40],[38,178,224],[18,36,54]]){
    // Canvas drawing causes no DOM mutation or ink invalidation. The browser
    // must composite it through the same existing backdrop filter on the frame.
    await page.evaluate(rgb=>new Promise<void>(resolve=>requestAnimationFrame(()=>{
      const ctx=(document.getElementById('live-material-source') as HTMLCanvasElement).getContext('2d')!;
      ctx.fillStyle=`rgb(${rgb.join(' ')})`;ctx.fillRect(0,0,innerWidth,innerHeight);
      requestAnimationFrame(()=>resolve());
    })),rgb);
    const png=(await control.screenshot({scale:'css',animations:'disabled'})).toString('base64');
    const sampled=await page.evaluate(async png=>{
      const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);
      return [...ctx.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data].slice(0,3);
    },png);
    for(let channel=0;channel<3;channel++)expect(Math.abs(sampled[channel]-(rgb[channel]*.98+184*.02)),`${id}: ${sampled} through ${rgb}`).toBeLessThanOrEqual(3);
  }
  expect(await maps()).toEqual(before);
});

test('unchanged game text does not trigger a new backdrop colour scan each frame',async({page})=>{
  await page.addInitScript(()=>{
    const native=document.elementsFromPoint.bind(document);
    const counter={hits:0};Object.assign(window,{inkScanCounter:counter});
    document.elementsFromPoint=(x,y)=>{counter.hits++;return native(x,y);};
  });
  await page.goto('/#/game/snake');await expect(page.locator('.snake-start')).toBeVisible();
  await page.evaluate(()=>{const probe=document.createElement('span');probe.id='unchanged-hud';probe.textContent='Ready';probe.style.cssText='position:fixed;left:-1000px';document.querySelector('#game-stage')!.append(probe);});
  await expect(page.locator('#game-menu')).toHaveAttribute('data-glass',/backdrop|frost/);
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.game-dock').screenshot({animations:'disabled'});
  // Do not count initial font/map decoding and viewport settlement as work
  // caused by a game replacing an unchanged text node during play.
  await page.waitForTimeout(1000);
  const scanned=await page.evaluate(()=>new Promise<{before:number;after:number}>(resolve=>{
    const counter=(window as unknown as {inkScanCounter:{hits:number}}).inkScanCounter;
    const before=counter.hits;let frame=0;
    const repeat=()=>{document.getElementById('unchanged-hud')!.textContent='Ready';if(++frame<20)requestAnimationFrame(repeat);else requestAnimationFrame(()=>resolve({before,after:counter.hits}));};
    requestAnimationFrame(repeat);
  }));
  expect(scanned.after).toBe(scanned.before);
});
