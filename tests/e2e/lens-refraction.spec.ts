import {test,expect} from '../fixtures';
import type {Locator,Page} from '@playwright/test';

// The lens bends what is behind the island in every browser. Chromium refracts its backdrop; every other engine refracts a mirror
// of the images behind the bar. The pixel tests below are valid in both, so the WebKit project proves the mirror draws the bend.
test.beforeEach(async({page})=>{
  await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

// Chromium refracts its backdrop only when it is not told otherwise. Hiding userAgentData is the same switch as the Safari look,
// so Chromium takes the mirror path, which is the path every other engine takes.
const asOtherBrowser=(page:Page)=>page.addInitScript(()=>{Object.defineProperty(navigator,'userAgentData',{get:()=>undefined,configurable:true});});

// Black and white stripes, 16 px each. Vertical stripes show a bend at the left and right ends, and horizontal stripes a bend at the
// top and bottom rims. Both are sharp edges, so any shift of the rim shows as a change in the pixels.
const stripes=(orientation:'v'|'h')=>'data:image/svg+xml,'+encodeURIComponent(orientation==='v'
  ?'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><defs><pattern id="s" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="16" height="32" fill="#000"/><rect x="16" width="16" height="32" fill="#fff"/></pattern></defs><rect width="390" height="844" fill="url(#s)"/></svg>'
  :'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><defs><pattern id="s" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="16" fill="#000"/><rect y="16" width="32" height="16" fill="#fff"/></pattern></defs><rect width="390" height="844" fill="url(#s)"/></svg>');

// Puts the stripes behind the island, and hides the covers and the tabs, so the lens copies and the pixels are the stripes only.
async function stage(page:Page,orientation:'v'|'h'='v'){
  await page.evaluate(src=>{
    document.getElementById('content')!.style.visibility='hidden';
    const image=document.createElement('img');
    image.dataset.t28='stripes';
    image.alt='';
    image.src=src;
    image.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:cover;z-index:0;pointer-events:none';
    document.body.append(image);
  },stripes(orientation));
  await page.addStyleTag({content:'.app-tabbar .ui-tab{visibility:hidden}.app-tabbar::after{display:none}'});
  await page.waitForFunction(()=>(document.querySelector('img[data-t28]') as HTMLImageElement|null)?.complete===true);
}

// How far the bent island differs from the same island with its bend switched off. Only the bend changes between the shots, because the
// displacement is set to zero for the flat one, so the frost is the same in both. Both shots are PNGs that the page decodes to pixels, so
// the comparison is the same in every engine. Only pixels inside the capsule count: the corners outside it never change and would dilute
// the mean. The rim is the band at each end: 12 px for vertical stripes (left and right) and 20 px for horizontal ones (top and bottom),
// which is where the bend of this 64 px bar falls off. The centre is the median over the band that the bend does not reach. A third shot
// of the same state must match the bent one, so a bar that is still moving between shots cannot pass as a bend.
async function bend(page:Page,bar:Locator,orientation:'v'|'h'){
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const shot=async()=>{await settle();return (await bar.screenshot({animations:'disabled'})).toString('base64');};
  const scale=await page.evaluate(()=>document.querySelector('filter[id^="ui-glass-"] feDisplacementMap')!.getAttribute('scale'));
  // The bands and the centre are in CSS px, so the device pixel ratio scales them to the screenshot's pixels.
  const dpr=await page.evaluate(()=>window.devicePixelRatio);
  const setScale=(value:string)=>page.evaluate(v=>document.querySelector('filter[id^="ui-glass-"] feDisplacementMap')!.setAttribute('scale',v),value);
  const bent=await shot();
  await setScale('0');
  const flat=await shot();
  await setScale(scale??'32');
  const again=await shot();
  return page.evaluate(async({flat,bent,again,orientation,dpr})=>{
    type Pixels={width:number;height:number;data:Uint8ClampedArray};
    const pixels=async(base64:string):Promise<Pixels>=>{
      const image=new Image();
      image.src='data:image/png;base64,'+base64;
      await image.decode();
      const canvas=document.createElement('canvas');
      canvas.width=image.naturalWidth;
      canvas.height=image.naturalHeight;
      const context=canvas.getContext('2d')!;
      context.drawImage(image,0,0);
      return {width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data};
    };
    const [a,b,c]=[await pixels(flat),await pixels(bent),await pixels(again)];
    const w=a.width,h=a.height,radius=h/2,edge=(orientation==='v'?12:20)*dpr;
    const inside=(x:number,y:number)=>{const cx=Math.min(Math.max(x+0.5,radius),Math.max(w-radius,radius));return Math.hypot(x+0.5-cx,y+0.5-radius)<=radius;};
    const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
    // The centre is judged by its median. The 8-bit map cannot hold exactly no shift, so the stripes' edges resample by a fraction
    // of a pixel, and only the median shows that the centre is still. The mean is returned for the record.
    const median=(values:number[])=>{const sorted=[...values].sort((p,q)=>p-q);return sorted.length?sorted[Math.floor(sorted.length/2)]:0;};
    const measure=(p:Pixels,q:Pixels)=>{
      const diff=(x:number,y:number)=>{const i=(y*w+x)*4;return (Math.abs(p.data[i]-q.data[i])+Math.abs(p.data[i+1]-q.data[i+1])+Math.abs(p.data[i+2]-q.data[i+2]))/3;};
      // The values inside a band of the image, along the axis that the stripes vary on.
      const band=(from:number,to:number)=>{const out:number[]=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const pos=orientation==='v'?x:y;if(pos>=from&&pos<to&&inside(x,y))out.push(diff(x,y));}return out;};
      const low=band(0,edge),high=band(orientation==='v'?w-edge:h-edge,orientation==='v'?w:h);
      const centre=orientation==='v'?band(w/2-30*dpr,w/2+30*dpr):band(h/2-8*dpr,h/2+8*dpr);
      const rimLow=mean(low),rimHigh=mean(high);
      return {rimLow,rimHigh,rim:Math.min(rimLow,rimHigh),centre:median(centre),centreMean:mean(centre),whole:mean(band(-Infinity,Infinity))};
    };
    return {...measure(a,b),still:measure(b,c).whole};
  },{flat,bent,again,orientation,dpr});
}

// The rim thresholds, from the measured lower side of each rim (scratch profile at 390 px, dpr 1): mirror vertical 55.9, backdrop vertical
// 35.3, mirror horizontal 74.2 and backdrop horizontal 17.8. Each sits well below its measured value and well above the zero that a flat
// bar gives, so a lens with its scale at 0, or a dropped filter, fails clearly.
const RIM={mirrorV:20,backdropV:20,mirrorH:30,backdropH:8};

// The bend passes when the bar holds still between shots, the rim moves past its threshold, and the centre does not move.
function expectBend(result:{rim:number;centre:number;still:number},threshold:number){
  expect(result.still).toBeLessThan(1);
  expect(result.rim).toBeGreaterThan(threshold);
  expect(result.centre).toBeLessThan(2);
}

test('the mirror lens bends the stripes at the rim and leaves the centre still',async({page})=>{
  await asOtherBrowser(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-glass','mirror');
  await stage(page,'v');
  await expect(page.locator('.ui-glass-scene img')).toHaveCount(1);
  await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('.ui-glass-scene img')].every(img=>img.complete&&img.naturalWidth>0));
  // The mirror has no frost of its own: the scene covers the lens, and the bend is drawn by the scene's filter.
  expect(await page.locator('.ui-glass-lens').evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');
  const scene=page.locator('.ui-glass-scene');
  expect(await scene.evaluate(el=>getComputedStyle(el).visibility)).toBe('visible');
  expect(await scene.evaluate(el=>getComputedStyle(el).filter)).not.toBe('none');
  expectBend(await bend(page,bar,'v'),RIM.mirrorV);
});

test('the mirror lens bends horizontal stripes at the top and bottom rims, and leaves the centre still',async({page})=>{
  await asOtherBrowser(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-glass','mirror');
  await stage(page,'h');
  await expect(page.locator('.ui-glass-scene img')).toHaveCount(1);
  await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('.ui-glass-scene img')].every(img=>img.complete&&img.naturalWidth>0));
  expectBend(await bend(page,bar,'h'),RIM.mirrorH);
});

test('Chromium refracts the backdrop itself, with the same bend at the rim and a still centre',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the backdrop lens is Chromium only');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-glass','backdrop');
  await expect(bar).toHaveClass(/is-refracting/);
  await stage(page,'v');
  await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
  expectBend(await bend(page,bar,'v'),RIM.backdropV);
});

// The backdrop does not bend the outer rows of the top and bottom rims. Rows 3 to 11 of the top rim, and rows 53 to 61 of the bottom,
// stay unbent (0 to 3), where the mirror bends the top rows by up to 144. The vertical rims are bent in both paths. The cause is not
// established: removing the clip-path leaves the profile unchanged. The test measures the whole 20 px band, so it checks the part of the
// rim that this path does bend.
test('Chromium refracts the backdrop along the top and bottom rims, and leaves the centre still',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the backdrop lens is Chromium only');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-glass','backdrop');
  await stage(page,'h');
  await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
  expectBend(await bend(page,bar,'h'),RIM.backdropH);
});

// Each copy is checked against the images on the page, within the tolerance, in both directions: a copy with no image beneath it is
// unmatched, and an image under the island with no copy is missing (the check applies while there are sixteen images or fewer).
async function copies(page:Page,island:string,tolerance=1){
  return page.evaluate(([selector,tolerance])=>{
    const bar=document.querySelector(selector)!;
    const reach=20;
    const box=bar.getBoundingClientRect();
    const seen=(img:HTMLImageElement)=>{const style=getComputedStyle(img);return style.visibility==='visible'&&style.display!=='none'&&Number(style.opacity)>0;};
    const sources=[...document.images].filter(img=>!bar.contains(img)&&img.complete&&img.currentSrc&&seen(img)).map(img=>img.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0);
    const under=sources.filter(rect=>rect.right>box.left-reach&&rect.left<box.right+reach&&rect.bottom>box.top-reach&&rect.top<box.bottom+reach);
    const placed=[...bar.querySelectorAll<HTMLImageElement>('.ui-glass-scene img')].map(img=>img.getBoundingClientRect());
    const near=(a:DOMRect,b:DOMRect)=>Math.abs(a.x-b.x)<=tolerance&&Math.abs(a.y-b.y)<=tolerance&&Math.abs(a.width-b.width)<=tolerance&&Math.abs(a.height-b.height)<=tolerance;
    return {
      count:placed.length,
      unmatched:placed.filter(copy=>!sources.some(source=>near(copy,source))).length,
      missing:under.length<=16?under.filter(source=>!placed.some(copy=>near(copy,source))).length:0
    };
  },[island,tolerance] as const);
}

test('the mirror copies sit on the images behind the island, follow a scroll, and survive a Movies re-render',async({page})=>{
  await asOtherBrowser(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass','mirror');
  await expect.poll(async()=>(await copies(page,'.app-tabbar')).count).toBeGreaterThan(0);
  const first=await copies(page,'.app-tabbar');
  expect(first.unmatched).toBe(0);
  expect(first.missing).toBe(0);
  expect(first.count).toBeLessThanOrEqual(16);
  // A small scroll keeps the island on screen, and the copies have to move with the covers.
  await page.evaluate(()=>window.scrollTo(0,20));
  expect(await page.evaluate(()=>window.scrollY)).toBe(20);
  await expect.poll(async()=>{const c=await copies(page,'.app-tabbar');return c.unmatched+c.missing;}).toBe(0);
  // Movies rewrites the bar's children on every render. The lens comes back as the first child, and its copies match again.
  await page.goto('/#/movies/browse/movie');
  const movies=page.locator('nav.movies-mobile-nav.ui-tabbar');
  await expect(movies).toHaveAttribute('data-glass','mirror');
  await expect.poll(async()=>(await copies(page,'nav.movies-mobile-nav.ui-tabbar')).count).toBeGreaterThan(0);
  await page.locator('#movies-search').fill('in');
  await expect.poll(()=>movies.evaluate(el=>el.firstElementChild?.classList.contains('ui-glass-lens'))).toBe(true);
  await expect.poll(async()=>{const c=await copies(page,'nav.movies-mobile-nav.ui-tabbar');return c.unmatched+c.missing;}).toBe(0);
});

test('keyboard focus holds the island open, and its copies stay on the covers while it is held',async({page})=>{
  await asOtherBrowser(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect.poll(async()=>(await copies(page,'.app-tabbar')).count).toBeGreaterThan(0);
  // Tab into the island, so its focus is visible, and the stylesheet keeps the island on screen even when the page asks it to hide.
  for(let i=0;i<12&&!(await page.evaluate(()=>!!document.activeElement?.closest('.app-tabbar')));i++)await page.keyboard.press('Tab');
  await expect(bar.locator(':focus-visible')).toHaveCount(1);
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-hidden','true');
  expect((await bar.boundingBox())!.y).toBeLessThan(844);
  // A further scroll while the island is held: its copies must follow the covers, and the island is still marked hidden.
  await page.evaluate(()=>window.scrollTo(0,420));
  await expect(bar).toHaveAttribute('data-hidden','true');
  expect(await page.evaluate(()=>window.scrollY)).toBe(420);
  await expect.poll(async()=>{const c=await copies(page,'.app-tabbar');return c.unmatched+c.missing;}).toBe(0);
});

// The island's own transitions are the motion of the bar: its translate and its scale. They are frozen half way through, so the
// copies can be read at a fixed moment of the motion, and the bar's opacity at that moment is read too.
async function freezeIsland(page:Page){
  return page.evaluate(async()=>{
    const bar=document.querySelector<HTMLElement>('.app-tabbar')!;
    const own=()=>bar.getAnimations().filter(animation=>animation instanceof CSSTransition&&!(animation.effect as KeyframeEffect).pseudoElement&&animation.playState!=='finished');
    for(let i=0;i<120&&own().length===0;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
    const frozen=own();
    for(const animation of frozen){const timing=animation.effect!.getTiming();animation.pause();animation.currentTime=Number(timing.delay??0)+Number(timing.duration??0)/2;}
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {frozen:frozen.length,opacity:getComputedStyle(bar).opacity};
  });
}

test('the copies stay on the page while the island slides, and the island itself stays at full opacity',async({page})=>{
  await asOtherBrowser(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect.poll(async()=>(await copies(page,'.app-tabbar')).count).toBeGreaterThan(0);
  const settle=()=>page.evaluate(()=>new Promise<void>(async resolve=>{const bar=document.querySelector('.app-tabbar')!;for(let i=0;i<200&&bar.getAnimations().length;i++)await new Promise(r=>requestAnimationFrame(r));resolve();}));
  const resume=()=>page.evaluate(()=>{for(const animation of document.querySelector<HTMLElement>('.app-tabbar')!.getAnimations())if(animation instanceof CSSTransition)animation.play();});
  // Hide: the island slides and shrinks away. Half way, the copies still sit on the covers within 2 px.
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-hidden','true');
  const hide=await freezeIsland(page);
  expect(hide.frozen).toBeGreaterThan(0);
  expect(hide.opacity).toBe('1');
  await expect.poll(async()=>{const c=await copies(page,'.app-tabbar',2);return c.unmatched+c.missing;}).toBe(0);
  await resume();
  await settle();
  // Show: the island slides back in. Half way, the same holds.
  await page.evaluate(()=>window.scrollTo(0,380));
  await expect(bar).not.toHaveAttribute('data-hidden');
  const show=await freezeIsland(page);
  expect(show.frozen).toBeGreaterThan(0);
  expect(show.opacity).toBe('1');
  await expect.poll(async()=>{const c=await copies(page,'.app-tabbar',2);return c.unmatched+c.missing;}).toBe(0);
  await resume();
  await settle();
});

test('a cover removed from the page takes its copy with it, without a scroll',async({page})=>{
  await asOtherBrowser(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect.poll(async()=>(await copies(page,'.app-tabbar')).count).toBeGreaterThan(0);
  const before=(await copies(page,'.app-tabbar')).count;
  await page.evaluate(()=>{
    const bar=document.querySelector('.app-tabbar')!;
    const copy=bar.querySelector<HTMLImageElement>('.ui-glass-scene img')!;
    const source=[...document.images].find(image=>!bar.contains(image)&&image.currentSrc===copy.getAttribute('src'));
    source!.remove();
  });
  await expect.poll(async()=>(await copies(page,'.app-tabbar')).count).toBe(before-1);
});

test('the frost survives the island\'s fade: with its lens at half opacity, the rim still bends',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the backdrop lens is Chromium only');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-glass','backdrop');
  await stage(page,'v');
  await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
  const full=await bend(page,bar,'v');
  // The fade is on the lens, not on the bar: a bar below full opacity cuts its lens off from the backdrop.
  await page.addStyleTag({content:'.app-tabbar .ui-glass-lens{opacity:.5!important}'});
  const half=await bend(page,bar,'v');
  expect(half.rim).toBeGreaterThan(full.rim*0.3);
});

test('leaving Movies disposes its mirror lens and its filter',async({page})=>{
  await asOtherBrowser(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const lenses=()=>page.evaluate(()=>document.querySelectorAll('.ui-glass-lens').length);
  const filters=()=>page.evaluate(()=>document.querySelectorAll('filter[id^="ui-glass-"]').length);
  await expect.poll(lenses).toBe(1);
  await page.goto('/#/movies');
  await expect(page.locator('nav.movies-mobile-nav.ui-tabbar')).toHaveAttribute('data-glass','mirror');
  await expect.poll(lenses).toBe(2);
  await expect.poll(filters).toBe(2);
  await page.goto('/#/collection');
  await expect.poll(lenses).toBe(1);
  await expect.poll(filters).toBe(1);
});

test('reduced transparency takes the mirror lens out, and puts it back when that ends',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Playwright emulates reduced transparency through the Chromium protocol only');
  await asOtherBrowser(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-glass','mirror');
  await expect(page.locator('.ui-glass-lens')).toHaveCount(1);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  await expect(bar).toHaveAttribute('data-glass','off');
  await expect(page.locator('.ui-glass-lens')).toHaveCount(0);
  expect(await bar.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(18, 18, 20, 0.97)');
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  await expect(bar).toHaveAttribute('data-glass','mirror');
  await expect(page.locator('.ui-glass-lens')).toHaveCount(1);
});

// The lens map, decoded: its pixel size (read through the feImage's href) and the lens box in CSS px. The map is the box at the screen's
// pixel density, so the pixel size is the box times the density.
async function mapSize(page:Page){
  return page.evaluate(async()=>{
    const href=document.querySelector('filter[id^="ui-glass-"] feImage')!.getAttribute('href')!;
    const image=new Image();
    image.src=href;
    await image.decode();
    const lens=document.querySelector('.ui-glass-lens')!.getBoundingClientRect();
    return {pixels:[image.naturalWidth,image.naturalHeight],css:[lens.width,lens.height],dpr:window.devicePixelRatio};
  });
}

// WebKit draws a map at its own pixel size, so a map of CSS size covered only part of the lens on a screen with more than one device
// pixel per CSS px. Chromium stretches its map, so it passes either way. These tests run the density-2 map through the same bend checks,
// so the map that WebKit needed is exercised in every run.
test.describe('at two device pixels per CSS px',()=>{
  test.use({deviceScaleFactor:2});

  test('the mirror lens map is twice the lens box, and the lens bends the stripes at the rim',async({page})=>{
    await asOtherBrowser(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toHaveAttribute('data-glass','mirror');
    await stage(page,'v');
    await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
    const size=await mapSize(page);
    expect(size.dpr).toBe(2);
    expect(size.pixels).toEqual(size.css.map(value=>value*2));
    expectBend(await bend(page,bar,'v'),RIM.mirrorV);
  });

  test('the mirror lens bends horizontal stripes at the top and bottom rims, at two device pixels per CSS px',async({page})=>{
    await asOtherBrowser(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toHaveAttribute('data-glass','mirror');
    await stage(page,'h');
    await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
    expectBend(await bend(page,bar,'h'),RIM.mirrorH);
  });
});

// A change of pixel density rebuilds the map. Chromium's device-metrics emulation changes devicePixelRatio but raises no change event on a
// resolution query, so this script records each such listener, and the test raises the change itself after it sets the ratio. That tests
// the lens's own handling (the rebuild, and the watch moving on to each new density); the browser's own event is not under test.
function densityHook(){
  const realMatchMedia=window.matchMedia.bind(window);
  const realRatio=window.devicePixelRatio;
  const listeners:EventListener[]=[];
  let ratio:number|undefined;
  Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>ratio??realRatio});
  window.matchMedia=(query:string)=>{
    const list=realMatchMedia(query);
    if(!query.includes('resolution'))return list;
    return new Proxy(list,{get:(target,key)=>{
      if(key==='addEventListener')return (type:string,listener:EventListener,options?:AddEventListenerOptions)=>{if(type==='change')listeners.push(listener);target.addEventListener(type,listener,options);};
      const value=Reflect.get(target,key,target);
      return typeof value==='function'?value.bind(target):value;
    }});
  };
  (window as unknown as {__setDensity:(value:number)=>void}).__setDensity=(value:number)=>{ratio=value;for(const listener of [...listeners])listener(new Event('change'));};
}

test('the lens map follows a change of pixel density, and is built again for each new density (Chromium only)',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the density hook records Chromium resolution queries');
  await asOtherBrowser(page);
  await page.addInitScript(densityHook);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass','mirror');
  const atDensity=async(density:number)=>{
    await page.evaluate(value=>(window as unknown as {__setDensity:(value:number)=>void}).__setDensity(value),density);
    await expect.poll(async()=>{const size=await mapSize(page);return size.dpr===density&&size.pixels.every((value,i)=>value===size.css[i]*density);}).toBe(true);
  };
  await atDensity(3);
  await atDensity(2);
  await atDensity(1);
});
