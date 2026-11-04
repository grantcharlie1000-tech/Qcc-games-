import {guestTest as test,expect} from '../fixtures';
import {appSettings} from '../game-menu';
import {articleById} from '../../src/study/articles';

for(const style of ['qcc','quanta','aeon','essay']){
  test(`${style} displays labelled image ads without covering reading text`,async({page})=>{
    await page.setViewportSize({width:1366,height:768});
    await page.addInitScript((style)=>{
      localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
      sessionStorage.setItem('pocket-arcade:study:v1:topic',style==='qcc'?'close-reading':`${style}:close-reading`);
    },style);
    await page.goto('/#/game/fruit-merge');
    await expect(page.locator('.fm-board')).toBeVisible();
    await appSettings(page);
    await page.getByRole('button',{name:'Study Mode',exact:true}).click();
    const view=page.locator('#study-view');
    await expect(view).toBeVisible();
    const ads=view.locator('.fictional-ad');
    await expect(ads).toHaveCount(5);
    await expect(view.locator('.study-inline-ad .fictional-ad')).toHaveCount(1);
    for(const side of ['Left','Right'])await expect(view.getByRole('complementary',{name:`${side} advertisements`,exact:true}).locator('.fictional-ad')).toHaveCount(2);
    await expect(view.locator('.study-ad-placeholder')).toHaveCount(0);
    for(const ad of await ads.all()){
      await expect(ad).toHaveAttribute('aria-label',/^Advertisement: .+/);
      await expect(ad.locator('.fictional-ad-label')).toHaveText('Advertisement');
      await expect(ad.locator('a,button,iframe,script')).toHaveCount(0);
      const image=ad.locator('img');
      if(await ad.isVisible()){await ad.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);}
      const source=new URL(await image.evaluate((img:HTMLImageElement)=>img.src));
      expect(source.origin).toBe(new URL(page.url()).origin);
      expect(source.pathname).toMatch(/\/study\/fictional-ads\/[^/]+\.webp$/);
      await expect(image).toHaveAttribute('loading','lazy');
      await expect(image).toHaveAttribute('alt',/^.+ advertisement\.$/);
    }
    for(const width of [1366,1024,390]){
      await page.setViewportSize({width,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(view.locator('.study-inline-ad .fictional-ad')).toBeVisible();
      await expect(view.locator('.fictional-ad:visible')).toHaveCount(width>=1200?5:1);
      for(const side of ['Left','Right']){
        const rail=view.getByRole('complementary',{name:`${side} advertisements`,exact:true});
        if(width>=1200)await expect(rail).toBeVisible();else await expect(rail).toBeHidden();
      }
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
    await view.getByRole('link',{name:'Return to previous view',exact:true}).first().click();
    await expect(page.locator('.fictional-ad')).toHaveCount(0);
  });
}

test('essay uses the shared heading, hero and one inline ad between intact paragraphs on desktop and mobile',async({page})=>{
  await page.setViewportSize({width:1366,height:900});
  await page.addInitScript(()=>{
    localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
    sessionStorage.setItem('pocket-arcade:study:v1:topic','essay:close-reading');
  });
  await page.goto('/#/game/fruit-merge');
  await appSettings(page);
  await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  const chapter=page.locator('.study-chapter');
  const article=articleById('essay:close-reading')!;
  await expect(chapter).toHaveAttribute('data-article-id',article.id);
  await expect(chapter.locator('.study-text-section > p')).toHaveText(article.paragraphs);
  const inspect=()=>chapter.evaluate(el=>{
    const box=(node:Element)=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom};};
    return {
      heading:box(el.querySelector('.study-article-heading')!),hero:box(el.querySelector('.study-hero')!),
      paragraphs:[...el.querySelectorAll('.study-text-section > p')].map(box),
      ads:[...el.querySelectorAll('.study-inline-ad .fictional-ad')].filter(node=>node.checkVisibility()).map(node=>({...box(node),src:node.querySelector('img')!.src}))
    };
  });
  let source='';
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>scrollTo(0,0));
    const layout=await inspect();expect(layout.paragraphs).toHaveLength(article.paragraphs.length);expect(layout.ads).toHaveLength(1);
    expect(layout.hero.top).toBeGreaterThanOrEqual(layout.heading.bottom);
    expect(layout.paragraphs[0].top).toBeGreaterThanOrEqual(layout.hero.bottom);
    const midpoint=Math.floor(article.paragraphs.length/2);
    expect(layout.ads[0].top).toBeGreaterThanOrEqual(layout.paragraphs[midpoint].bottom);
    expect(layout.ads[0].bottom).toBeLessThanOrEqual(layout.paragraphs[midpoint+1].top);
    if(source)expect(layout.ads[0].src).toBe(source);else source=layout.ads[0].src;
    await expect(chapter.locator('.study-text-section > p')).toHaveText(article.paragraphs);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
