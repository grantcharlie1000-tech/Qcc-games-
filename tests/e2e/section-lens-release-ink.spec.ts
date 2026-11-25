import sharp from 'sharp';
import {expect,originalTheme,test} from '../fixtures';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,colorScheme:'light'});

test('the crossing Movies label keeps its dark edge as the bright Games artwork clears on release',async({context,page,browserName},info)=>{
  test.skip(browserName!=='chromium','the release is stepped on the Chromium document timeline');
  await originalTheme(context);
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.evaluate(async()=>{
    scrollTo(0,18);
    await document.fonts.ready;
    await Promise.allSettled([...document.querySelectorAll<HTMLImageElement>('.game-card img')]
      .filter(img=>img.getBoundingClientRect().top<950).map(img=>img.decode()));
  });
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(18);
  await page.waitForTimeout(650);
  if(await bar.getAttribute('data-minimized')==='true'){
    await bar.locator('..').locator('.ui-tabbar-mini').click();
    await page.mouse.move(390,420);
    await page.waitForTimeout(500);
  }
  const games=bar.getByRole('link',{name:'Games',exact:true}),movies=bar.getByRole('link',{name:'Movies',exact:true});
  const box=(await games.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.waitForTimeout(480);
  await page.mouse.move(x+138,y,{steps:4});await page.waitForTimeout(400);
  await page.mouse.move(x+20,y,{steps:3});
  await expect(games).toHaveAttribute('data-lens-target','');
  await expect(movies).toHaveAttribute('data-lens-under','');
  await page.waitForTimeout(480);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate',{playbackRate:0});
  const frames=()=>page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));});
  try{
    await page.mouse.up();
    await expect(bar).not.toHaveAttribute('data-pill-dragging','');
    await frames();
    await bar.evaluate(el=>{
      for(const a of el.getAnimations({subtree:true}))if(a.playState==='running'&&typeof a.currentTime==='number')a.currentTime+=1000/60;
    });
    await frames();
    await expect(games).toHaveAttribute('aria-current','page');
    await expect.poll(()=>movies.evaluate(el=>el.style.filter)).toContain('section-lens-warp');
    const label=movies.locator(':scope>span'),r=(await label.boundingBox())!;
    const clip={x:Math.floor(r.x)-2,y:Math.floor(r.y)-2,width:Math.ceil(r.x+r.width)+2-(Math.floor(r.x)-2),height:Math.ceil(r.y+r.height)+2-(Math.floor(r.y)-2)};
    const actual=await page.screenshot({clip,scale:'css',path:info.outputPath('release-label.png')});
    const background=await page.screenshot({clip,scale:'css',style:'.app-tabbar .ui-tab[href="#/movies/browse/movie"]>span{visibility:hidden!important}',path:info.outputPath('release-background.png')});
    const a=await sharp(actual).removeAlpha().raw().toBuffer(),b=await sharp(background).removeAlpha().raw().toBuffer();
    let darkEdge=0,visibleInk=0;
    for(let i=0;i<a.length;i+=3){
      const delta=.2126*(b[i]-a[i])+.7152*(b[i+1]-a[i+1])+.0722*(b[i+2]-a[i+2]);
      darkEdge+=Math.max(0,delta);visibleInk+=Number(Math.abs(delta)>30);
    }
    console.log('release crossing label', {darkEdge,visibleInk});
    // Without the release halo, the mostly white letters leave almost no dark edge
    // against the bright orange poster. The actual rendered pixels must retain separation.
    expect(darkEdge).toBeGreaterThan(1000);
    expect(visibleInk).toBeGreaterThan(65);
  }finally{
    await cdp.send('Animation.setPlaybackRate',{playbackRate:1});
    await cdp.detach();
  }
  await page.waitForTimeout(700);
  await expect.poll(()=>movies.evaluate(el=>getComputedStyle(el.querySelector(':scope>span')!).filter)).toBe('none');
  await expect.poll(()=>movies.evaluate(el=>el.style.filter)).toBe('');
});
