import {guestTest as test,expect} from '../fixtures';
import {appSettings} from '../game-menu';
import {studyTopics} from '../../src/study/topics';
import {expectCleanStudy} from '../study-article-assertions';

for(const viewport of [{width:390,height:844},{width:1366,height:768}]){
  for(const style of ['qcc','quanta','aeon','essay']){
    test(`${style}: all twenty articles are free of fake ads and disclaimer labels at ${viewport.width}`,async({page})=>{
      await page.setViewportSize(viewport);
      await page.addInitScript(style=>{
        localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
        sessionStorage.setItem('pocket-arcade:study:v1:topic',style==='qcc'?'close-reading':`${style}:close-reading`);
      },style);
      const forbiddenRequests:string[]=[];
      page.on('request',request=>{if(/fictional-ads|contributors\//.test(request.url()))forbiddenRequests.push(request.url());});
      await page.goto('/#/game/fruit-merge');
      await appSettings(page);await page.getByRole('button',{name:'Study Mode',exact:true}).click();
      const view=page.locator('#study-view');
      for(const topic of studyTopics){
        await page.getByLabel('Study topic',{exact:true}).selectOption(topic.id);
        await expectCleanStudy(view);
        await expect(view.locator('article')).toHaveAttribute('aria-labelledby','study-title');
        await expect(view.locator('h1')).toHaveCount(1);
        const sectionTypes=await view.locator('article h2').evaluateAll(headings=>headings.map(heading=>{const style=getComputedStyle(heading);return [style.fontSize,style.fontWeight,style.lineHeight,style.color].join('/');}));
        expect(new Set(sectionTypes).size,topic.id+' section typography').toBe(1);
        await expect(view.locator('.study-text-section,.variant-text-section')).toHaveCount(style==='qcc'?6:3);
        // Opening, former insertion points and footers all stay within the page.
        await view.locator('details').evaluateAll(items=>items.forEach(item=>(item as HTMLDetailsElement).open=true));
        const outside=await view.locator('article p,article h1,article h2,article img,article select,article button').evaluateAll(elements=>elements.filter(el=>el.checkVisibility()).filter(el=>{const box=el.getBoundingClientRect();return box.left<0||box.right>innerWidth+1;}).map(el=>el.textContent?.slice(0,80)));
        expect(outside,topic.id).toEqual([]);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),topic.id).toBe(true);
        expect((await view.locator('.study-article-body').innerText()).split(/\s+/).length).toBeGreaterThan(350);
      }
      expect(forbiddenRequests).toEqual([]);
      await view.getByRole('link',{name:'Games',exact:true}).first().click();
      await expect(view).toBeHidden();
    });
  }
  test(`the topic picker is clean at ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/');
    await page.getByRole('button',{name:'Reject All',exact:true}).click();
    await expect(page.locator('[data-study-topic]')).toHaveCount(20);
    await expectCleanStudy(page.locator('#study-view'));
  });
}
