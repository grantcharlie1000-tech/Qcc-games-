import {test,expect,seedStudyTopic,type Page} from '../../fixtures';
import {devices} from '@playwright/test';

const iphoneLandscape={...devices['iPhone 13 landscape'],viewport:{width:844,height:390},deviceScaleFactor:3};

async function ready(page:Page){
 await page.goto('/?quality=potato&test&seed=42#/game/strongroom',{waitUntil:'commit'});
 await expect(page.locator('.strongroom-game')).toHaveAttribute('data-models','true',{timeout:120000});
 expect(await page.evaluate(()=>[innerWidth,innerHeight,devicePixelRatio])).toEqual([844,390,3]);
}

async function coversViewport(page:Page){
 const value=await page.evaluate(()=>{
  const g=(window as any).__game,c=g.canvas,b=c.getBoundingClientRect(),root=g.root.getBoundingClientRect();
  return {
   rect:{x:b.x,y:b.y,width:b.width,height:b.height},root:{width:root.width,height:root.height},
   viewport:{width:innerWidth,height:innerHeight},buffer:[c.width,c.height],
   ratio:Math.min(devicePixelRatio,1)*g.quality.scale,aspect:g.view.camera.aspect,
  };
 });
 expect(value.rect.x).toBeCloseTo(0,0);
 expect(value.rect.y).toBeCloseTo(0,0);
 expect(value.rect.width).toBeCloseTo(value.viewport.width,0);
 expect(value.rect.height).toBeCloseTo(value.viewport.height,0);
 expect(value.buffer).toEqual([Math.floor(value.root.width*value.ratio),Math.floor(value.root.height*value.ratio)]);
 expect(value.aspect).toBeCloseTo(value.root.width/value.root.height,5);
}

for(const notch of [false,true])test(`landscape viewport and toolbar/orientation resizing${notch?' with notch safe areas':''}`,async({browser,browserName})=>{
 test.skip(notch&&browserName!=='chromium','CDP injects physical safe-area values; WebKit separately tests mobile geometry.');
 test.setTimeout(180000);
 const context=await browser.newContext({...iphoneLandscape});
 await seedStudyTopic(context);
 const page=await context.newPage();
 try{
  if(notch){
   const cdp=await context.newCDPSession(page);
   await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,left:47,right:47,bottom:21}});
  }
  await ready(page);
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content',/viewport-fit=cover/);
  await coversViewport(page);
  await page.evaluate(()=>{
   const g=(window as any).__game;
   g.start({teamSize:3,difficulty:'easy',quick:false});
   g.state.phase='action';g.state.paused=true;g.quality.sample=()=>false;g.input.locked=true;
   for(const e of g.state.entities){e.bot=false;Object.assign(e,{x:25,y:0,z:20+e.seat});}
   Object.assign(g.player,{x:-12,y:0,z:-.5,yaw:-Math.PI/2,pitch:0});
   Object.assign(g.state.entities[3],{x:-3,y:0,z:-.5,yaw:Math.PI/2,pitch:0});
  });
  // Toolbar expansion/collapse and a portrait round trip must resize both CSS and the drawing buffer.
  for(const size of [{width:844,height:330},{width:844,height:390},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);
   await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));
   await expect.poll(async()=>page.locator('.strongroom-game>canvas').evaluate(c=>Math.round(c.getBoundingClientRect().height))).toBe(size.height);
   await coversViewport(page);
  }
  const outside=await page.locator('.sr-match-hud').evaluate((hud,notch)=>{
   const left=notch?47:0,right=innerWidth-left,bottom=innerHeight-(notch?21:0);
   return [...hud.querySelectorAll<HTMLElement>('.menu-button,.vitals,.weapon,.objective,.round-bar,.phase-banner,.touch-button,.move-zone')].filter(n=>{
    const b=n.getBoundingClientRect();
    return b.width>0&&b.height>0&&(b.left<left-.5||b.right>right+.5||b.top<-.5||b.bottom>bottom+.5);
   }).map(n=>n.className);
  },notch);
  expect(outside).toEqual([]);
  if(notch)await page.screenshot({path:test.info().outputPath('notched-mobile-landscape-after.png')});
 }finally{await context.close();}
});

test('dynamic CSS viewport is not inset by stale visualViewport toolbar geometry',async({browser})=>{
 test.setTimeout(180000);
 const context=await browser.newContext({...iphoneLandscape});
 await seedStudyTopic(context);
 const page=await context.newPage();
 try{
  await ready(page);
  // Reproduce a stale, inset toolbar rectangle without changing the real CSS viewport.
  await page.evaluate(()=>{
   const vv=visualViewport!;
   for(const [key,value]of Object.entries({width:748,height:320,offsetLeft:48,offsetTop:35}))Object.defineProperty(vv,key,{configurable:true,value});
   vv.dispatchEvent(new Event('resize'));
   vv.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);
  await page.screenshot({path:test.info().outputPath('stale-viewport.png')});
  await coversViewport(page);
 }finally{await context.close();}
});
