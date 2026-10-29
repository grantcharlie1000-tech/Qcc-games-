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
      const paragraphs=view.locator('article p');
      const boxes=await paragraphs.evaluateAll(ps=>ps.filter(p=>!p.closest('.fictional-ad')).map(p=>{const r=p.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
      for(const ad of await ads.all()){
        if(!await ad.isVisible())continue;
        const r=await ad.boundingBox();if(!r)continue;
        expect(boxes.some(p=>Math.min(r.x+r.width,p.right)-Math.max(r.x,p.x)>2&&Math.min(r.y+r.height,p.bottom)-Math.max(r.y,p.y)>2)).toBe(false);
      }
    }
    await view.getByRole('link',{name:'Games',exact:true}).first().click();
    await expect(page.locator('.fictional-ad')).toHaveCount(0);
  });
}
