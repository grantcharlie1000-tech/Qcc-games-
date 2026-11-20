import sharp from 'sharp';
import {expect,originalTheme,test} from '../fixtures';

test.beforeEach(async({context,page})=>{
  await originalTheme(context);
  await page.setViewportSize({width:390,height:844});
});

test('section lens updates the visible Games backdrop as the page scrolls',async({page})=>{
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll<HTMLImageElement>('.game-card img')]
      .filter(image=>image.getBoundingClientRect().top<innerHeight).map(image=>image.decode()));
  });
  const pixels=async()=>{
    // Sample artwork in the main body between the Movies and TV labels.
    const shot=await bar.screenshot({scale:'css'});
    return sharp(shot).extract({left:103,top:18,width:25,height:26}).removeAlpha().raw().toBuffer();
  };
  const rest=await pixels();
  await page.evaluate(()=>scrollTo(0,18));
  await expect.poll(async()=>{
    const scrolled=await pixels();
    return scrolled.reduce((sum,channel,index)=>sum+Math.abs(channel-rest[index]),0)/rest.length;
  }).toBeGreaterThan(1);
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await expect(bar.getByRole('link',{name:'Games'})).toHaveAttribute('aria-current','page');
});

test('section lens falls back on context loss',async({page})=>{
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:unknown[]){
      const context=Reflect.apply(getContext,this,args);
      if(args[0]==='webgl2' && this.classList.contains('section-lens')){
        document.addEventListener('test-section-context-loss',()=>{
          const extension=context?.getExtension('WEBGL_lose_context');
          if(!extension)return;
          this.addEventListener('webglcontextlost',()=>setTimeout(()=>extension.restoreContext(),400),{once:true});
          extension.loseContext();
        },{once:true});
      }
      return context;
    };
  });
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const canvas=bar.locator('canvas.section-lens');
  await expect(canvas).toHaveAttribute('aria-hidden','true');
  await page.evaluate(()=>document.dispatchEvent(new Event('test-section-context-loss')));
  await expect(bar).not.toHaveAttribute('data-section-lens','webgl');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
});

test('section lens keeps Movies art visible through CSS fallback',async({browserName,page})=>{
  // WebKit uses frost even when the separate texture request could succeed.
  const posterOrigin = browserName==='chromium'?'http://127.0.0.1:1':'*';
  let corsRequests=0;
  await page.route('https://image.tmdb.org/**',async route=>{
    const headers=await route.request().allHeaders();
    if(headers.origin || headers['sec-fetch-mode']==='cors')corsRequests++;
    return route.fulfill({contentType:'image/png',
      headers:{'access-control-allow-origin':posterOrigin,'cache-control':'no-store'},
      body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')});
  });
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await page.goto('/#/movies/browse/movie');
  const bar=page.locator('.movies-mobile-nav');
  await expect(bar.getByRole('button',{name:'Movies',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('.movies-view').evaluate(el=>{el.scrollTop=200;});
  await expect(bar).toBeVisible();
  const poster=page.locator('.movies-poster img').first();
  await expect.poll(()=>poster.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(poster).toHaveAttribute('src',/^https:\/\/image\.tmdb\.org\//);
  if (browserName==='chromium') await expect.poll(()=>corsRequests).toBeGreaterThan(0);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(bar.locator('canvas.section-lens')).toBeHidden();
  await expect(bar).not.toHaveAttribute('data-section-lens','webgl');
  await expect.poll(()=>bar.evaluate(el=>[el,el.querySelector('.ui-glass-lens')].some(layer=>{
    if(!layer)return false;
    const style=getComputedStyle(layer);
    const filter = style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter');
    return style.display!=='none' && style.visibility==='visible' && !!filter && filter!=='none';
  }))).toBe(true);
});
