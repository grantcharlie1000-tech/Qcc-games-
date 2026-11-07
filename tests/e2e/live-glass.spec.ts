import {test,expect} from '../fixtures';

// The dock retains its rgb(8 12 18 / .20) fill over the live backdrop, which
// the SVG-filter material also saturates by 1.08. Its faint white sheen paints
// above that fill, not in place of it. Keep this reference independent of CSS.
const FILL=.2,VEIL=[8,12,18];
test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

for(const id of ['snake','quadfall','maze-muncher','neon-coil'])test(`${id} glass reads new canvas frames without rebuilding its lens map`,async({page})=>{
  await page.goto(`/#/game/${id}`);
  const control=page.locator('#game-menu');await expect(control).toBeVisible();
  await control.screenshot({animations:'disabled'});
  const SATURATE=await control.getAttribute('data-glass-mode')==='svg'?1.08:1;
  if(await control.getAttribute('data-glass')==='backdrop'&&await control.getAttribute('data-glass-mode')==='svg'){
    const bounds=(await control.boundingBox())!,lens=(await control.locator('.ui-glass-lens').boundingBox())!;
    // An inward lens never needs to filter an invisible 14px margin around
    // every live control. Keep the sampled compositor area inside its shape.
    for(const key of ['x','y','width','height'] as const)expect(lens[key],`${id} lens ${key}`).toBeCloseTo(bounds[key],2);
  }
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
      const x=Math.floor(c.width/2),y=Math.floor(c.height/2);
      return {rgb:[...ctx.getImageData(x,y,1,1).data].slice(0,3),x,y,width:c.width,height:c.height};
    },png);
    // For a 135deg gradient, projection onto its full corner-to-corner line
    // is (x+y)/(width+height). Sample pixel centres, including rectangular
    // controls. The specified white alpha stops are .10, .025 at 45%, .065.
    const position=(sampled.x+.5+sampled.y+.5)/(sampled.width+sampled.height);
    const sheen=position<.45?.10+(.025-.10)*position/.45:.025+(.065-.025)*(position-.45)/.55;
    const lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    for(let channel=0;channel<3;channel++){
      const tinted=(lum+SATURATE*(rgb[channel]-lum))*(1-FILL)+VEIL[channel]*FILL;
      const expected=tinted*(1-sheen)+255*sheen;
      expect(Math.abs(sampled.rgb[channel]-expected),`${id}: ${sampled.rgb} through ${rgb}, sheen ${sheen}`).toBeLessThanOrEqual(3);
    }
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
  // Live canvases re-sample ink on a 140ms timer (never per frame), so count the frames that
  // scan: replacing unchanged text on every frame must not add scans beyond that cadence.
  const scanned=await page.evaluate(()=>new Promise<{scanFrames:number;elapsed:number}>(resolve=>{
    const counter=(window as unknown as {inkScanCounter:{hits:number}}).inkScanCounter;
    let last=counter.hits,scanFrames=0,frame=0;const start=performance.now();
    const repeat=()=>{
      if(counter.hits!==last)scanFrames++;last=counter.hits;
      document.getElementById('unchanged-hud')!.textContent='Ready';
      if(++frame<30)requestAnimationFrame(repeat);else requestAnimationFrame(()=>{if(counter.hits!==last)scanFrames++;resolve({scanFrames,elapsed:performance.now()-start});});
    };
    requestAnimationFrame(repeat);
  }));
  expect(scanned.scanFrames).toBeLessThanOrEqual(Math.ceil(scanned.elapsed/140)+1);
});
