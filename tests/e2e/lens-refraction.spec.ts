import {test,expect} from '../fixtures';
import type {Locator,Page} from '@playwright/test';

// The island's material is Chromium's lens or frost. Chromium bends its backdrop with an SVG filter. Every other engine frosts the bar
// with its own backdrop filter, and draws no copy of the page. The bend tests are for the Chromium lens, so they run in Chromium only.
// The frost tests run in every engine.
test.beforeEach(async({page})=>{
  await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

// Chromium keeps its lens only while it reports the Chromium brand. Hiding userAgentData is the same switch as the Safari look, so
// Chromium takes the frost path, which is the path every other engine takes.
const asFrost=(page:Page)=>page.addInitScript(()=>{Object.defineProperty(navigator,'userAgentData',{get:()=>undefined,configurable:true});});

// Black and white stripes, 16 px each. Vertical stripes show a bend at the left and right ends, and horizontal stripes a bend at the
// top and bottom rims. Both are sharp edges, so any shift of the rim shows as a change in the pixels.
const stripes=(orientation:'v'|'h')=>'data:image/svg+xml,'+encodeURIComponent(orientation==='v'
  ?'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><defs><pattern id="s" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="16" height="32" fill="#000"/><rect x="16" width="16" height="32" fill="#fff"/></pattern></defs><rect width="390" height="844" fill="url(#s)"/></svg>'
  :'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><defs><pattern id="s" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="16" fill="#000"/><rect y="16" width="32" height="16" fill="#fff"/></pattern></defs><rect width="390" height="844" fill="url(#s)"/></svg>');

// Puts the stripes behind the island, and hides the covers and the tabs, so the pixels are the stripes only.
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

// The rim thresholds, from the measured lower side of each rim at the 10 px bend, with no scroll edge under the backdrop lens (scratch probe
// at 390 px): vertical 31.7 at density 1 and 31.8 at density 2, horizontal 7.3 and 7.7. Each threshold sits about half its measured value,
// and well above the zero that a flat bar gives, so a lens with its scale at 0, or a dropped filter, fails clearly.
const RIM={backdropV:15,backdropH:3.5};

// The bend passes when the bar holds still between shots, the rim moves past its threshold, and the centre does not move.
function expectBend(result:{rim:number;centre:number;still:number},threshold:number){
  expect(result.still).toBeLessThan(1);
  expect(result.rim).toBeGreaterThan(threshold);
  expect(result.centre).toBeLessThan(2);
}

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
// stay unbent (0 to 3), while the vertical rims bend fully. The cause is not established: removing the clip-path leaves the profile
// unchanged. The test measures the whole 20 px band, so it checks the part of the rim that this path does bend.
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

// The scroll edge is a frost layer only. In the backdrop it would sit under the lens and blur the page the lens bends.
test('Chromium has no scroll edge, so its lens bends the page itself',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the backdrop lens is Chromium only');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass','backdrop');
  await expect(page.locator('.ui-scroll-edge')).toHaveCount(0);
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

// A screen with two device pixels per CSS px gets a map of twice the lens box, and that is where WebKit misplaced the map under a CSS
// filter on an HTML element. The Chromium lens is checked at that density too, so the density-2 map is exercised in every run.
test.describe('at two device pixels per CSS px',()=>{
  test.use({deviceScaleFactor:2});

  test('the Chromium lens map is twice the lens box, and the lens bends the stripes at the rim',async({page,browserName})=>{
    test.skip(browserName!=='chromium','the backdrop lens is Chromium only');
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toHaveAttribute('data-glass','backdrop');
    await stage(page,'v');
    await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
    const size=await mapSize(page);
    expect(size.dpr).toBe(2);
    expect(size.pixels).toEqual(size.css.map(value=>value*2));
    expectBend(await bend(page,bar,'v'),RIM.backdropV);
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
  await page.addInitScript(densityHook);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass','backdrop');
  const atDensity=async(density:number)=>{
    await page.evaluate(value=>(window as unknown as {__setDensity:(value:number)=>void}).__setDensity(value),density);
    await expect.poll(async()=>{const size=await mapSize(page);return size.dpr===density&&size.pixels.every((value,i)=>value===size.css[i]*density);}).toBe(true);
  };
  await atDensity(3);
  await atDensity(2);
  await atDensity(1);
});

// Frost is the bar's own backdrop filter. It needs no copy of the page, so it cannot lag a scroll, and it runs in every engine.
test.describe('frost, in every browser but Chromium',()=>{
  test('frost blurs the bar itself, with no lens, no SVG filter and no map',async({page})=>{
    await asFrost(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toHaveAttribute('data-glass','frost');
    await expect(bar).not.toHaveClass(/is-refracting/);
    await expect(page.locator('.ui-glass-lens')).toHaveCount(0);
    await expect(page.locator('filter[id^="ui-glass-"]')).toHaveCount(0);
    const frost=await bar.evaluate(el=>getComputedStyle(el).backdropFilter);
    expect(frost).toContain('blur(10px)');
    expect(frost).toContain('saturate(1.8)');
  });

  test('frost has a glow layer on the bar\'s edge, hidden from assistive technology',async({page})=>{
    await asFrost(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const glow=page.locator('.app-tabbar>.ui-glass-glow');
    await expect(glow).toHaveCount(1);
    expect(await glow.getAttribute('aria-hidden')).toBe('true');
    expect(await glow.evaluate(el=>getComputedStyle(el).boxShadow)).toContain('inset');
    expect(await glow.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  });

  test('a phone gets a scroll edge behind the frost bar, and a tap at its centre is not taken by it',async({page})=>{
    await asFrost(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass','frost');
    const edge=page.locator('.ui-scroll-edge');
    await expect(edge).toHaveCount(1);
    expect(await edge.getAttribute('aria-hidden')).toBe('true');
    expect(await edge.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
    const box=(await edge.boundingBox())!;
    const onEdge=(x:number,y:number)=>page.evaluate(([px,py])=>!!document.elementFromPoint(px,py)?.closest('.ui-scroll-edge'),[x,y]);
    expect(await onEdge(box.x+box.width/2,box.y+box.height/2)).toBe(false);
    expect(await onEdge(box.x+box.width/2,box.y+4)).toBe(false);
  });

  test('the scroll edge fades with the island when it hides, and comes back with it',async({page})=>{
    await asFrost(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const bar=page.locator('.app-tabbar');
    const edge=page.locator('.ui-scroll-edge');
    await expect(edge).toHaveCount(1);
    await page.evaluate(()=>window.scrollTo(0,400));
    await expect(bar).toHaveAttribute('data-hidden','true');
    await expect.poll(()=>edge.evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
    await page.evaluate(()=>window.scrollTo(0,380));
    await expect(bar).not.toHaveAttribute('data-hidden');
    await expect.poll(()=>edge.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  });

  test('the frost bar fades its own opacity when it hides, and reduced motion still hides it',async({page})=>{
    await asFrost(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const bar=page.locator('.app-tabbar');
    await page.evaluate(()=>window.scrollTo(0,400));
    await expect(bar).toHaveAttribute('data-hidden','true');
    await expect.poll(()=>bar.evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>window.scrollTo(0,380));
    await expect(bar).not.toHaveAttribute('data-hidden');
    await page.evaluate(()=>window.scrollTo(0,400));
    await expect(bar).toHaveAttribute('data-hidden','true');
    await expect.poll(()=>bar.evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
    expect(await bar.evaluate(el=>getComputedStyle(el).translate)).toBe('none');
  });

  test('the scroll edge is phone only: a desktop island has one, and it is not shown',async({page})=>{
    await asFrost(page);
    await page.setViewportSize({width:1440,height:900});
    await page.goto('/');
    await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass','frost');
    await expect(page.locator('.ui-scroll-edge')).toHaveCount(1);
    await expect(page.locator('.ui-scroll-edge')).toBeHidden();
  });

  test('the Movies island keeps its scroll edge right after it, through a re-render',async({page})=>{
    await asFrost(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/#/movies/browse/movie');
    const movies=page.locator('nav.movies-mobile-nav.ui-tabbar');
    await expect(movies).toHaveAttribute('data-glass','frost');
    const edgeAfterIsland=()=>movies.evaluate(el=>el.nextElementSibling?.classList.contains('ui-scroll-edge')??false);
    await expect.poll(edgeAfterIsland).toBe(true);
    await page.locator('#movies-search').fill('in');
    await expect.poll(edgeAfterIsland).toBe(true);
    await expect(page.locator('nav.movies-mobile-nav.ui-tabbar+.ui-scroll-edge')).toHaveCount(1);
  });

  test('leaving Movies removes the Movies scroll edge and keeps the arcade one',async({page})=>{
    await asFrost(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const edges=()=>page.evaluate(()=>document.querySelectorAll('.ui-scroll-edge').length);
    await expect.poll(edges).toBe(1);
    await page.goto('/#/movies');
    await expect(page.locator('nav.movies-mobile-nav.ui-tabbar')).toHaveAttribute('data-glass','frost');
    await expect.poll(edges).toBe(2);
    await page.goto('/#/collection');
    await expect.poll(edges).toBe(1);
  });

  test('reduced transparency takes the frost and the scroll edge out, and puts them back when that ends',async({page,browserName})=>{
    test.skip(browserName!=='chromium','Playwright emulates reduced transparency through the Chromium protocol only');
    await asFrost(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toHaveAttribute('data-glass','frost');
    await expect(page.locator('.ui-scroll-edge')).toHaveCount(1);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await expect(bar).toHaveAttribute('data-glass','off');
    await expect(page.locator('.ui-scroll-edge')).toHaveCount(0);
    expect(await bar.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');
    await cdp.send('Emulation.setEmulatedMedia',{features:[]});
    await expect(bar).toHaveAttribute('data-glass','frost');
    await expect(page.locator('.ui-scroll-edge')).toHaveCount(1);
  });
});
