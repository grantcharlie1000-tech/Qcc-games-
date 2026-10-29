import {guestTest as test,expect} from '../fixtures';

for(const style of ['qcc','quanta','aeon','essay']){
  test(`${style} displays fictional image ads without covering reading text`,async({page})=>{
    await page.setViewportSize({width:1366,height:768});
    await page.addInitScript((style)=>{
      localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
      sessionStorage.setItem('pocket-arcade:study:v1:topic',style==='qcc'?'close-reading':`${style}:close-reading`);
    },style);
    await page.goto('/#/game/fruit-merge');
    await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Open menu',exact:true}).click();
    await page.getByRole('button',{name:'Study Mode',exact:true}).click();
    const view=page.locator('#study-view');
    await expect(view).toBeVisible();
    const ads=view.locator('.fictional-ad');
    expect(await ads.count()).toBeGreaterThanOrEqual(5);
    await expect(view.locator('.study-ad-placeholder')).toHaveCount(0);
    for(const ad of await ads.all()){
      await expect(ad).toHaveAttribute('aria-label',/Fictional advertisement/);
      await expect(ad.locator('a,button,iframe,script')).toHaveCount(0);
      const image=ad.locator('img');
      if(await ad.isVisible()){await ad.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);}
      const source=new URL(await image.evaluate((img:HTMLImageElement)=>img.src));
      expect(source.origin).toBe(new URL(page.url()).origin);
      expect(source.pathname).toMatch(/\/study\/fictional-ads\/[^/]+\.webp$/);
      await expect(image).toHaveAttribute('loading','lazy');
    }
    for(const width of [1366,1024,390]){
      await page.setViewportSize({width,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      // Closed details can report rectangles for text the browser does not paint.
      // Check visible paragraphs both before and after opening the answers.
      for(const open of [false,true]){
        await view.locator('details').evaluateAll((items,open)=>items.forEach(item=>{(item as HTMLDetailsElement).open=open;}),open);
        const paragraphs=view.locator('article p');
        const boxes=await paragraphs.evaluateAll(ps=>ps.filter(p=>p.checkVisibility()&&!p.closest('.fictional-ad')).map(p=>{const r=p.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
        for(const ad of await ads.all()){
          if(!await ad.isVisible())continue;
          const r=await ad.boundingBox();if(!r)continue;
          expect(boxes.some(p=>Math.min(r.x+r.width,p.right)-Math.max(r.x,p.x)>2&&Math.min(r.y+r.height,p.bottom)-Math.max(r.y,p.y)>2)).toBe(false);
        }
      }
    }
    await view.getByRole('link',{name:'Games',exact:true}).first().click();
    await expect(page.locator('.fictional-ad')).toHaveCount(0);
  });
}

test('essay ads preserve a text-first desktop opening and the compact reading layout',async({page})=>{
  await page.setViewportSize({width:1180,height:900});
  await page.addInitScript(()=>{
    localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
    sessionStorage.setItem('pocket-arcade:study:v1:topic','essay:close-reading');
  });
  await page.goto('/#/game/fruit-merge');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  const inspect=()=>page.evaluate(()=>{
    const body=document.querySelector('.essay-article .variant-prose')!;
    const paragraphs=[...body.children].filter(el=>el.tagName==='P'&&!el.classList.contains('study-games-sentence')).map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};});
    const ads=[...body.querySelectorAll('.fictional-ad')].filter(el=>el.checkVisibility()).map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,src:el.querySelector('img')!.src};});
    const rail=document.querySelector('.essay-ad-rail .fictional-ad')!.getBoundingClientRect();
    return {paragraphs,ads,railTop:rail.top,height:innerHeight};
  });
  await page.evaluate(()=>scrollTo(0,0));
  const desktop=await inspect();expect(desktop.paragraphs).toHaveLength(6);expect(desktop.ads).toHaveLength(3);
  expect(desktop.ads[0].top).toBeGreaterThanOrEqual(desktop.paragraphs[5].bottom);
  expect(desktop.ads[0].top).toBeGreaterThanOrEqual(desktop.height);expect(desktop.railTop).toBeGreaterThanOrEqual(desktop.height);
  await page.setViewportSize({width:390,height:844});
  const mobile=await inspect();expect(mobile.ads).toHaveLength(3);
  expect(mobile.ads[0].top).toBeGreaterThanOrEqual(mobile.paragraphs[1].bottom);expect(mobile.ads[0].bottom).toBeLessThanOrEqual(mobile.paragraphs[2].top);
  expect(mobile.ads[1].top).toBeGreaterThanOrEqual(mobile.paragraphs[3].bottom);expect(mobile.ads[1].bottom).toBeLessThanOrEqual(mobile.paragraphs[4].top);
  expect(mobile.ads.map(ad=>ad.src).sort()).toEqual(desktop.ads.map(ad=>ad.src).sort());
});
