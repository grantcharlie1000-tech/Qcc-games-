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
  // The light theme's bar is Apple Music's pale frost, which lets only a faint tint of the art through. Live
  // sampling is read in the dark theme, whose smoke keeps the patch's own colour.
  await page.emulateMedia({colorScheme:'dark'});
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
  // Apple's dark smoke keeps about .72 of the art's tone over a 30/255 floor, so the bright patch is #ddd: the glass
  // over it reads about 115, past the 110 this test calls bright (#aaa now reads about 102).
  await page.locator('.game-grid').evaluate(grid=>{
    const patch=document.createElement('div');
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:#ddd;pointer-events:none';
    grid.append(patch);
  });
  const canvas=bar.locator('canvas.section-lens');
  await expect.poll(()=>canvas.evaluate(element=>{
    const surface=element as HTMLCanvasElement;
    return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[0];
  })).toBeGreaterThan(110);

  const selected=bar.getByRole('link',{name:'Games',exact:true});
  await expect(selected).toHaveAttribute('aria-current','page');
  // LOOK-10: over bright art the dark pill now sits a little darker than the bar, so the accent keeps 2:1 by its ink, a
  // blue the lens picks against that pill (section-lens.ts selectionAccent): over this patch a deeper one than #0099ff.
  let accent='';
  await expect.poll(async()=>{
    const [label,icon]=await Promise.all([selected.locator(':scope > span'),selected.locator('.ui-icon')].map(part=>part.evaluate(e=>getComputedStyle(e).color)));
    const same=label===icon&&label===accent;accent=label;return same;
  },{intervals:[250]}).toBe(true);
  const [red,green,blue]=accent.match(/\d+/g)!.map(Number);
  expect(blue,accent).toBeGreaterThan(Math.max(red,green));
  await expect(selected.locator('.ui-icon')).toHaveCSS('filter',/drop-shadow\(.*0\.85/);
  await expect(selected.locator(':scope > span')).toHaveCSS('text-shadow',/rgba\(0, 0, 0, 0\.85\)/);
  await expect(selected.locator(':scope > span')).toHaveCSS('font-weight','600');

  // C30 shows every tab's 24px glyph in both themes, drawn at 32.4px (ink about .39 of the 60px bar, as Apple Music's),
  // with its #ff375f light accent at weight 600. Apple's light still (pr-183, 2.6 px a css px) holds 146-307 css px^2 of
  // ink in its unselected glyphs (New 297, Radio 146, Library 307) and 364 in its selected Home. Every tab's filled twin
  // drew 362-534 here (TV 534), solid white slabs on the dark smoke, so the dark theme's unselected tabs draw the line
  // twin, inside Apple's range, and the selected tab the filled one (Games 377). The light theme keeps the filled twins.
  const movies=bar.getByRole('link',{name:'Movies',exact:true});
  await expect(movies.locator('.ui-icon')).toHaveCSS('width','24px');
  await expect(movies.locator('.ui-icon')).toHaveCSS('transform',/^matrix\(1\.35,/);
  await expect(movies.locator('.ui-icon-line')).toHaveCSS('display','inline');
  await expect(movies.locator('.ui-icon-fill')).toHaveCSS('display','none');
  await expect(selected.locator('.ui-icon-fill')).toHaveCSS('display','inline');
  // The ink of each tab's shown glyph at its drawn size in css px^2: that twin alone, rasterised black on clear.
  const ink=await bar.evaluate(async element=>{
    const K=4,found:{selected:number;unselected:Record<string,number>}={selected:0,unselected:{}};
    for (const tab of element.querySelectorAll<HTMLElement>('.ui-tab')) {
      const icon=tab.querySelector<SVGSVGElement>('.ui-icon'),box=icon?.getBoundingClientRect();
      if (!icon||!box||!box.width) continue;
      const copy=icon.cloneNode(true) as SVGSVGElement,shown=[...icon.children],copied=[...copy.children];
      shown.forEach((part,i)=>{if (getComputedStyle(part).display==='none') copied[i].remove();});
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(K*box.width);canvas.height=Math.round(K*box.height);
      copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('color','#000');
      copy.setAttribute('width',String(canvas.width));copy.setAttribute('height',String(canvas.height));
      const image=new Image();
      image.src=`data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
      await image.decode();
      const context=canvas.getContext('2d')!;
      context.drawImage(image,0,0,canvas.width,canvas.height);
      let sum=0;
      for (const [i,alpha] of context.getImageData(0,0,canvas.width,canvas.height).data.entries()) if (i%4===3) sum+=alpha/255;
      if (tab.matches('[aria-current="page"],[aria-pressed="true"]')) found.selected=Math.round(sum/K/K);
      else found.unselected[tab.textContent!.trim()]=Math.round(sum/K/K);
    }
    return found;
  });
  console.log(`tab glyph ink, css px^2: ${JSON.stringify(ink)}`);
  expect(Object.keys(ink.unselected)).toHaveLength(4);
  for (const [name,area] of Object.entries(ink.unselected)) {
    expect(area,name).toBeGreaterThanOrEqual(130);
    expect(area,name).toBeLessThanOrEqual(330);
  }
  expect(ink.selected).toBeGreaterThanOrEqual(330);
  expect(ink.selected).toBeLessThanOrEqual(400);
  await page.emulateMedia({colorScheme:'light'});
  await expect(movies.locator('.ui-icon')).toHaveCSS('width','24px');
  await expect(movies.locator('.ui-icon-fill')).toHaveCSS('display','inline');
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
// Since the light frost lets the art through (133d37f2), black art is the light pill's worst case: the pill followed it
// down to about 166/255 and the #ff375f accent read 1.45:1. The same floors hold over a black patch.
// LOOK-10 (council on aa6359ee): the dark pill was held at .091 so #0099ff kept 2.5:1, which sat it 79 under a 136 bar over
// mid-grey art. It now sits a little darker than the bar over every art (a bar-to-pill luminance contrast of about 1.18,
// Apple's 1.15-1.21), and the selected icon and label keep the 2:1 selected floor by their ink (section-lens.ts
// selectionAccent): checked over white, black and, dark only, a #777 patch, where #0099ff alone would read about 1.4:1.
test('the selected accent keeps its contrast against the WebGL pill over white art and over black art',async({page})=>{
  const floor={dark:{ratio:2,pill:1},light:{ratio:2,pill:1}},milky={dark:0,light:.5};
  for (const scheme of ['dark','light'] as const) {
    await page.emulateMedia({colorScheme:scheme});
    await page.goto('/#/collection');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toHaveAttribute('data-section-lens','webgl');
    await expect(bar.getByRole('link',{name:'Games',exact:true})).toHaveAttribute('aria-current','page');
    await page.locator('.game-grid').evaluate(grid=>{
      const patch=document.createElement('div');
      // The hash route keeps the document, so drop the last scheme's patch.
      document.getElementById('contrast-patch')?.remove();
      patch.id='contrast-patch';
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
    // LOOK-10: the bar body at the canvas centre (no glyph is drawn into the canvas) against the dark pill's luminance.
    const barToPill=(pillLuminance:number)=>canvas.evaluate((element,pillLuminance)=>{
      const surface=element as HTMLCanvasElement,data=surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data;
      const lum=[...data].slice(0,3).reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
      return (lum+.05)/(pillLuminance+.05);
    },pillLuminance);
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
    if (scheme==='dark') {
      const step=await barToPill(pill);
      console.log(`dark bar to pill over white art: ${step.toFixed(2)}`);
      expect(step).toBeGreaterThanOrEqual(1.05);
      expect(step).toBeLessThanOrEqual(1.35);
    }
    // Black art: wait for the bar to darken under it (light frost about 188, dark smoke about 32), then two equal reads.
    await page.locator('#contrast-patch').evaluate(patch=>{(patch as HTMLElement).style.background='#000';});
    await expect.poll(()=>canvas.evaluate(element=>{
      const surface=element as HTMLCanvasElement;
      return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[1];
    })).toBeLessThan(scheme==='light'?225:110);
    previous='';
    await expect.poll(async()=>{const current=await contrast();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
    const [blackRatio,blackPill]=previous.split(' ').map(Number);
    console.log(`selected accent over black art, ${scheme}: ${blackRatio}:1, pill luminance ${blackPill}`);
    expect(blackRatio).toBeGreaterThanOrEqual(floor[scheme].ratio);
    expect(blackPill).toBeLessThanOrEqual(floor[scheme].pill);
    expect(blackPill).toBeGreaterThanOrEqual(milky[scheme]);
    if (scheme==='dark') {
      const blackStep=await barToPill(blackPill);
      console.log(`dark bar to pill over black art: ${blackStep.toFixed(2)}`);
      expect(blackStep).toBeGreaterThanOrEqual(1.05);
      expect(blackStep).toBeLessThanOrEqual(1.35);
      // Mid-grey art, where #0099ff alone would read about 1.4:1 against the lighter pill: its ink keeps the floor.
      await page.locator('#contrast-patch').evaluate(patch=>{(patch as HTMLElement).style.background='#777';});
      await expect.poll(()=>canvas.evaluate(element=>{
        const surface=element as HTMLCanvasElement;
        return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[1];
      })).toBeGreaterThan(110);
      previous='';
      await expect.poll(async()=>{const current=await contrast();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
      const [greyRatio,greyPill]=previous.split(' ').map(Number);
      const greyStep=await barToPill(greyPill);
      console.log(`selected accent over #777 art, dark: ${greyRatio}:1, pill luminance ${greyPill}, bar to pill ${greyStep.toFixed(2)}`);
      expect(greyRatio).toBeGreaterThanOrEqual(floor.dark.ratio);
      expect(greyStep).toBeGreaterThanOrEqual(1.05);
      expect(greyStep).toBeLessThanOrEqual(1.35);
    }
  }
});

// 93a36a80 frosts the dark resting pill soft (softFrost) while the moving selection kept the sparse frost, so letters
// under the pill snapped between streaked and soft on the settle frame and on a press's first frame (17-33/255). The
// last moving frame must be the rest pill: force pillMotion to .001 for one draw over a white title on black and compare
// that draw with the rest draw under the pill.
test('the dark pill\'s last moving frame over a title is its rest frame',async({page})=>{
  await page.addInitScript(()=>{
    const gl=WebGL2RenderingContext.prototype,getLocation=gl.getUniformLocation,uniform1f=gl.uniform1f;
    const names=new WeakMap<WebGLUniformLocation,string>();
    gl.getUniformLocation=function(this:WebGL2RenderingContext,program:WebGLProgram,name:string){
      const location=getLocation.call(this,program,name);
      if(location)names.set(location,name);
      return location;
    };
    gl.uniform1f=function(this:WebGL2RenderingContext,location:WebGLUniformLocation|null,value:number){
      const forced=(window as unknown as {forceMotion?:number}).forceMotion;
      return uniform1f.call(this,location,forced!==undefined&&location&&names.get(location)==='pillMotion'?forced:value);
    };
  });
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await expect(bar.getByRole('link',{name:'Games',exact:true})).toHaveAttribute('aria-current','page');
  await page.locator('.game-grid').evaluate(grid=>{
    const patch=document.createElement('div');
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:#000;color:#fff;pointer-events:none;'
      +'font:700 22px/22px system-ui,sans-serif;padding:44px 0 0 14px;white-space:nowrap';
    patch.textContent='New Releases for You';
    grid.append(patch);
  });
  const canvas=bar.locator('canvas.section-lens');
  // The rows under the selected tab's label and glyph, as the contrast pin reads them.
  const pill=()=>canvas.evaluate(element=>{
    const surface=element as HTMLCanvasElement,rect=surface.getBoundingClientRect();
    const sx=surface.width/rect.width,sy=surface.height/rect.height;
    const tab=surface.closest('.app-tabbar')!.querySelector('[aria-current="page"]')!.getBoundingClientRect();
    const x=Math.round((tab.left+6-rect.left)*sx),y=Math.round((tab.top+8-rect.top)*sy);
    return [...surface.getContext('2d')!.getImageData(x,y,Math.round((tab.width-12)*sx),Math.round((tab.height-16)*sy)).data];
  });
  const steady=async()=>{
    let previous='';
    await expect.poll(async()=>{const current=(await pill()).join();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
    return previous.split(',').map(Number);
  };
  // Redraw by a one px scroll and back, so both reads are taken at the top of the page: the fixed title stays where it
  // is under the bar.
  const redraw=async()=>{
    await page.evaluate(()=>scrollTo(0,1));await page.waitForTimeout(300);
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(400);
  };
  await redraw();
  const rest=await steady();
  await page.evaluate(()=>{(window as unknown as {forceMotion?:number}).forceMotion=.001;});
  await redraw();
  const moving=await steady();
  await page.evaluate(()=>{delete (window as unknown as {forceMotion?:number}).forceMotion;});
  let worst=0,spread=0;
  for (let i=0;i<rest.length;i+=4) for (let c=0;c<3;c++) worst=Math.max(worst,Math.abs(rest[i+c]-moving[i+c]));
  for (let i=4;i<rest.length;i+=4) spread=Math.max(spread,Math.abs(rest[i+1]-rest[i-3]));
  console.log(`dark pill, last moving frame against rest over a title: max ${worst}/255 (title strokes ${spread}/255)`);
  // The title must show under the pill, or the comparison proves nothing.
  expect(spread).toBeGreaterThan(8);
  expect(worst).toBeLessThanOrEqual(2);
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

test('section lens rises above the bar on first press, as Charlie\'s video, and through drag travel',async({page})=>{
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const canvas=bar.locator('canvas.section-lens');
  // The surface grows past the bar only while the raised lens is drawn.
  const raised=()=>canvas.evaluate(element=>(element as HTMLCanvasElement).style.getPropertyValue('--section-lens-pad-x'));
  // The opaque rows of the padded surface above the bar over the lens: Charlie's video holds the lens top
  // about 4 px above the bar (2-6 px) on a press and 2 px above it through a drag.
  const overhang=(lensX:number)=>canvas.evaluate((element,lensX)=>{
    const surface=element as HTMLCanvasElement, rect=surface.getBoundingClientRect();
    const bar=surface.parentElement!.getBoundingClientRect();
    const scale=surface.width/rect.width, column=Math.round((lensX-rect.left)*scale);
    const rows=Math.floor((bar.top-rect.top)*scale)-1;
    const alpha=surface.getContext('2d')!.getImageData(column-4,0,9,rows).data;
    let opaque=0;
    for(let row=0;row<rows;row++){
      let max=0;
      for(let i=row*36+3;i<row*36+36;i+=4)max=Math.max(max,alpha[i]);
      if(max>127)opaque++;
    }
    return {rows,opaque:opaque/scale};
  },lensX);
  const box=(await bar.getByRole('link',{name:'Games',exact:true}).boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await expect.poll(raised).not.toBe('');
  await page.waitForTimeout(300);
  const held=await overhang(x);
  expect(held.rows).toBeGreaterThan(6);
  expect(held.opaque).toBeGreaterThanOrEqual(1.5);expect(held.opaque).toBeLessThanOrEqual(7);
  await page.mouse.move(x+138,y,{steps:4});
  await page.waitForTimeout(400);
  expect(await raised()).not.toBe('');
  const drag=await overhang(x+138);
  expect(drag.opaque).toBeGreaterThanOrEqual(.5);expect(drag.opaque).toBeLessThanOrEqual(6);
  await page.mouse.move(x+4,y,{steps:4});
  await page.mouse.up();
  await expect.poll(raised).toBe('');
  await expect(bar.getByRole('link',{name:'Games',exact:true})).toHaveAttribute('aria-current','page');
});

// MOTION-4 (#24): a release that changes the tab (a tap on Movies while Games is current, or a drag let go over Movies)
// used to start the selection stretch, whose first '1 1' frame beat the release transition: the lens's lift (read from
// the pill's scale, section-lens.ts) fell from 1 to 0 in one frame and the raised bubble vanished. The bubble now falls
// back on the release spring every time. The CSS timeline runs at .1x, so each frame is a small step of the spring; the
// selection is made in place (no route change), so the Games scene and its lens stay up throughout.
for(const gesture of ['tap','drag'] as const) test(`a ${gesture} release that changes the tab lets the raised lens ease down on the release spring`,async({page,browserName})=>{
  test.skip(browserName!=='chromium','the timeline is slowed through the Chromium DevTools protocol');
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const games=bar.getByRole('link',{name:'Games',exact:true}), movies=bar.getByRole('link',{name:'Movies',exact:true});
  await page.evaluate(()=>document.addEventListener('click',event=>{
    const link=event.target instanceof Element?event.target.closest('.app-tabbar a[href="#/movies/browse/movie"]'):null;
    if(!link)return;
    event.preventDefault();event.stopPropagation();
    document.querySelector('.app-tabbar [aria-current="page"]')?.removeAttribute('aria-current');
    link.setAttribute('aria-current','page');
  },true));
  const from=(await (gesture==='tap'?movies:games).boundingBox())!, to=(await movies.boundingBox())!;
  const y=from.y+from.height/2;
  await page.mouse.move(from.x+from.width/2,y);
  await page.mouse.down();
  if(gesture==='drag')await page.mouse.move(to.x+to.width/2,y,{steps:6});
  await expect.poll(()=>bar.locator('canvas.section-lens').evaluate(el=>(el as HTMLCanvasElement).style.getPropertyValue('--section-lens-pad-x'))).not.toBe('');
  await page.waitForTimeout(300);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate',{playbackRate:.1});
  await page.evaluate(()=>{
    const w=window as Window&{__trace?:{t:number;lift:number;pad:string}[];__released?:number};
    const bar=document.querySelector<HTMLElement>('.app-tabbar')!;
    w.__trace=[];
    addEventListener('pointerup',()=>{w.__released??=performance.now();},{capture:true,once:true});
    const end=performance.now()+2600;
    // performance.now(), not the frame's timestamp: a frame that handles the pointer-up starts before the event.
    const sample=()=>{
      const t=performance.now();
      const scale=getComputedStyle(bar,'::after').scale;
      const [sx,sy=sx]=scale==='none'?[1]:scale.split(' ').map(Number);
      const lens=bar.querySelector<HTMLCanvasElement>('canvas.section-lens');
      w.__trace!.push({t,lift:Math.min(1,Math.max(0,(sx*sy-1.07)/.18)),pad:lens?.style.getPropertyValue('--section-lens-pad-x')??''});
      if(t<end)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(2800);
  await cdp.send('Animation.setPlaybackRate',{playbackRate:1});
  await expect(movies).toHaveAttribute('aria-current','page');
  const {trace,released}=await page.evaluate(()=>{const w=window as Window&{__trace?:{t:number;lift:number;pad:string}[];__released?:number};return {trace:w.__trace!,released:w.__released!};});
  const before=trace.filter(sample=>sample.t<released), after=trace.filter(sample=>sample.t>=released);
  expect(before.at(-1)?.lift,'held lift').toBe(1);
  expect(after.length).toBeGreaterThan(8);
  const lifts=after.map(sample=>sample.lift);
  // The first frame after the lift-off still shows the raised bubble, and it never falls by more than a third in a frame.
  expect(lifts[0],JSON.stringify(lifts)).toBeGreaterThan(.6);
  expect(Math.max(...lifts.slice(1).map((lift,i)=>lifts[i]-lift)),JSON.stringify(lifts)).toBeLessThanOrEqual(.3);
  expect(lifts.at(-1)).toBe(0);
  // The lens stays raised (padded past the bar) for several frames of the fall, not one.
  expect(after.filter(sample=>sample.pad!=='').length,JSON.stringify(after.map(sample=>sample.pad))).toBeGreaterThanOrEqual(4);
  void games;
});
