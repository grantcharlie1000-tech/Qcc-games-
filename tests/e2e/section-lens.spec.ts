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
    // Sample the Games card artwork near the left side of the main body.
    const shot=await bar.screenshot({scale:'css'});
    return sharp(shot).extract({left:64,top:12,width:36,height:40}).removeAlpha().raw().toBuffer();
  };
  const rest=await pixels();
  await page.evaluate(()=>scrollTo(0,18));
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(18);
  await expect.poll(async()=>{
    const scrolled=await pixels();
    return scrolled.reduce((sum,channel,index)=>sum+Math.abs(channel-rest[index]),0)/rest.length;
  }).toBeGreaterThan(1);
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await expect(bar.getByRole('link',{name:'Games'})).toHaveAttribute('aria-current','page');
});

test('section lens ignores game mutations and resumes live sampling at the restored library scroll',async({page})=>{
  await page.addInitScript(()=>{
    let queued=0;
    const request=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>{
      if(callback.name==='drawSectionLens') queued++;
      return request(callback);
    };
    Object.defineProperty(window,'sectionLensFrames',{get:()=>queued});
  });
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.evaluate(()=>scrollTo(0,18));
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(18);
  await page.evaluate(()=>{location.hash='#/game/snake';});
  await expect(page.locator('.snake-start')).toBeVisible();
  await expect(bar).not.toHaveAttribute('data-section-lens','webgl');
  const queued=await page.locator('#game-status').evaluate(async status=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const count=()=>Reflect.get(window,'sectionLensFrames') as number;
    const before=count();
    status.textContent='Playing Snake';
    status.style.opacity='.9';
    await Promise.resolve();
    return count()-before;
  });
  expect(queued).toBe(0);

  await page.goBack();
  await expect(page.locator('.game-grid')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(18);
  await expect(bar).toHaveAttribute('data-section-lens','webgl');

  const patch=page.locator('#lens-test-patch');
  await page.locator('.game-grid').evaluate(grid=>{
    const element=document.createElement('div');
    element.id='lens-test-patch';
    element.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:rgb(255,0,0)';
    grid.append(element);
  });
  const colour=()=>canvas.evaluate(el=>{
    const surface=el as HTMLCanvasElement;
    return [...surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data];
  });
  await expect.poll(async()=>{const [r,g]=await colour();return r-g;}).toBeGreaterThan(80);
  await patch.evaluate(el=>{el.style.backgroundColor='rgb(0,255,0)';});
  await expect.poll(async()=>{const [r,g]=await colour();return g-r;}).toBeGreaterThan(80);
});

test('the selected ink has a thin outline over bright live glass',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.locator('.game-grid').evaluate(grid=>{
    const patch=document.createElement('div');
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:#aaa;pointer-events:none';
    grid.append(patch);
  });
  const canvas=bar.locator('canvas.section-lens');
  await expect.poll(()=>canvas.evaluate(element=>{
    const surface=element as HTMLCanvasElement;
    return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[0];
  })).toBeGreaterThan(110);

  const selected=bar.getByRole('link',{name:'Games',exact:true});
  await expect(selected).toHaveAttribute('aria-current','page');
  await expect(selected.locator('.ui-icon')).toHaveCSS('color','rgb(0, 153, 255)');
  await expect(selected.locator(':scope > span')).toHaveCSS('color','rgb(0, 153, 255)');
  await expect(selected.locator('.ui-icon')).toHaveCSS('filter',/drop-shadow\(.*0\.85/);
  await expect(selected.locator(':scope > span')).toHaveCSS('text-shadow',/rgba\(0, 0, 0, 0\.85\)/);
  await expect(selected.locator(':scope > span')).toHaveCSS('font-weight','600');

  // C30 shows every tab's 24px filled glyph in both themes, with its #ff375f light accent at weight 600.
  const movies=bar.getByRole('link',{name:'Movies',exact:true});
  await expect(movies.locator('.ui-icon')).toHaveCSS('width','24px');
  await expect(movies.locator('.ui-icon-fill')).toHaveCSS('display','inline');
  await expect(movies.locator('.ui-icon-line')).toHaveCSS('display','none');
  await page.emulateMedia({colorScheme:'light'});
  await expect(movies.locator('.ui-icon')).toHaveCSS('width','24px');
  await expect(movies.locator('.ui-icon-line')).toHaveCSS('display','none');
  await expect(selected.locator(':scope > span')).toHaveCSS('color','rgb(255, 55, 95)');
  await expect(selected.locator(':scope > span')).toHaveCSS('font-weight','600');
});

// The clear resting pill must not wash out the selected accent over bright art. Read the
// WebGL pill under the selected glyph and label over a white patch and compare it with the
// accent ink. The smoked pill before the clear pill (900e080c), measured by this same test, gave
// dark 2.52:1 at pill luminance .089 and light 1.25:1 at .188; the unlimited clear pill gave
// dark 1.26:1 (.227) and a light pill brighter than its accent (.451). Pin the dark smoked pill's
// values, with a little room for rasterisation. The light theme's pill is now Apple Music's milky grey,
// well above the accent at about 2.3:1 (the smoked light pill gave 1.25:1): pin that side instead.
test('the selected accent keeps its contrast against the WebGL pill over white art',async({page})=>{
  const floor={dark:{ratio:2.5,pill:.091},light:{ratio:2,pill:1}},milky={dark:0,light:.5};
  for (const scheme of ['dark','light'] as const) {
    await page.emulateMedia({colorScheme:scheme});
    await page.goto('/#/collection');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toHaveAttribute('data-section-lens','webgl');
    await expect(bar.getByRole('link',{name:'Games',exact:true})).toHaveAttribute('aria-current','page');
    await page.locator('.game-grid').evaluate(grid=>{
      const patch=document.createElement('div');
      patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:#fff;pointer-events:none';
      grid.append(patch);
    });
    const canvas=bar.locator('canvas.section-lens');
    const contrast=()=>canvas.evaluate(element=>{
      const surface=element as HTMLCanvasElement,rect=surface.getBoundingClientRect();
      const sx=surface.width/rect.width,sy=surface.height/rect.height;
      const tab=surface.closest('.app-tabbar')!.querySelector('[aria-current="page"]')!;
      const label=tab.querySelector(':scope > span')!,icon=tab.querySelector('.ui-icon')!;
      const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
      const ink=lum(getComputedStyle(label).color.match(/[\d.]+/g)!.slice(0,3).map(Number));
      const context=surface.getContext('2d')!,values:number[]=[],pill:number[]=[];
      for (const box of [label.getBoundingClientRect(),icon.getBoundingClientRect()]) {
        const x=Math.round((box.left-rect.left)*sx),y=Math.round((box.top-rect.top)*sy);
        const w=Math.max(1,Math.round(box.width*sx)),h=Math.max(1,Math.round(box.height*sy));
        const data=context.getImageData(x,y,w,h).data;
        for (let i=0;i<data.length;i+=4) {
          const bg=lum([data[i],data[i+1],data[i+2]]);
          pill.push(bg);
          values.push((Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05));
        }
      }
      values.sort((a,b)=>a-b);
      pill.sort((a,b)=>a-b);
      return `${Math.round(100*values[values.length>>1])/100} ${Math.round(1000*pill[pill.length>>1])/1000}`;
    });
    // Wait for the white patch to reach the lens and for two equal reads.
    await expect.poll(()=>canvas.evaluate(element=>{
      const surface=element as HTMLCanvasElement;
      return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[1];
    })).toBeGreaterThan(110);
    let previous='';
    await expect.poll(async()=>{const current=await contrast();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
    const [ratio,pill]=previous.split(' ').map(Number);
    console.log(`selected accent over white art, ${scheme}: ${ratio}:1, pill luminance ${pill}`);
    // The pill may be no brighter than the smoked pill either, so its contrast cannot recover
    // by crossing over the accent (light theme) while the art still washes it out.
    expect(ratio).toBeGreaterThanOrEqual(floor[scheme].ratio);
    expect(pill).toBeLessThanOrEqual(floor[scheme].pill);
    expect(pill).toBeGreaterThanOrEqual(milky[scheme]);
  }
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

test('section lens stays inside the bar on first press and rises only with drag travel',async({page})=>{
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const canvas=bar.locator('canvas.section-lens');
  // The surface grows past the bar only while the raised lens is drawn.
  const raised=()=>canvas.evaluate(element=>(element as HTMLCanvasElement).style.getPropertyValue('--section-lens-pad-x'));
  const box=(await bar.getByRole('link',{name:'Games',exact:true}).boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await page.waitForTimeout(300);
  expect(await raised()).toBe('');
  await page.mouse.move(x+138,y,{steps:4});
  await expect.poll(raised).not.toBe('');
  await page.waitForTimeout(400);
  // Like the owner's thumb, the raised lens stays inset in the bar: the padded rows above
  // the bar stay clear over the lens, where a lifted lens would overhang.
  const overhang=await canvas.evaluate((element,lensX)=>{
    const surface=element as HTMLCanvasElement, rect=surface.getBoundingClientRect();
    const bar=surface.parentElement!.getBoundingClientRect();
    const scale=surface.width/rect.width, column=Math.round((lensX-rect.left)*scale);
    const rows=Math.floor((bar.top-rect.top)*scale)-1;
    const alpha=surface.getContext('2d')!.getImageData(column-20,0,41,rows).data;
    let max=0;
    for(let i=3;i<alpha.length;i+=4)max=Math.max(max,alpha[i]);
    return {rows,max};
  },x+138);
  expect(overhang.rows).toBeGreaterThan(6);
  expect(overhang.max).toBe(0);
  await page.mouse.move(x+4,y,{steps:4});
  await page.mouse.up();
  await expect.poll(raised).toBe('');
  await expect(bar.getByRole('link',{name:'Games',exact:true})).toHaveAttribute('aria-current','page');
});
