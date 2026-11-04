import {guestTest as test,expect,seedGuest} from '../fixtures';
import {appSettings} from '../game-menu';
import {mkdir} from 'node:fs/promises';
import {articleById,articleStyles,studyArticles} from '../../src/study/articles';
import {studyTopics} from '../../src/study/topics';
import {readingNotes} from '../../src/study/editorial';

const key='pocket-arcade:study:v1:topic';
const styleOf=(id:string)=>id.includes(':')?id.split(':')[0]:'qcc';

async function seed(page:import('@playwright/test').Page,id='close-reading',remember=true){
  await page.addInitScript(({id,remember,key})=>{
    if(!window.name){localStorage.setItem('pocket-arcade:study:v1:reading-choice',remember?'accept':'reject');if(remember)sessionStorage.setItem(key,id);window.name='expansion-seeded';}
  },{id,remember,key});
}

test('Escape changes articles without changing topic, dismisses privacy and menus first, and preserves a game across reload',async({page})=>{
  await seed(page);await page.goto('/#/game/fruit-merge');
  // Suika drops directly in the basket; the separate drop button was removed.
  await page.locator('.fm-board').click();await expect(page.locator('.fm-count')).toContainText('1 fruit');
  let saved:unknown;
  let previous='qcc';
  for(let i=0;i<16;i++){
    await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
    if(i===0)saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')!).data);
    const selected=await page.evaluate(key=>sessionStorage.getItem(key)!,key);
    expect(styleOf(selected)).not.toBe(previous);expect(selected.endsWith('close-reading')).toBe(true);previous=styleOf(selected);
  }
  await page.getByRole('button',{name:'Reading storage choices',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Reading storage choices'});await expect(dialog).toBeVisible();
  const selected=await page.evaluate(key=>sessionStorage.getItem(key),key);await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe(selected);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')!).data)).toEqual(saved);
  await page.getByRole('link',{name:'Return to previous view',exact:true}).first().click();await expect(page.locator('.fm-count')).toContainText('1 fruit');
  await appSettings(page);await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#menu')).not.toBeVisible();await expect(page.locator('#study-view')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
  let current=await page.evaluate(key=>sessionStorage.getItem(key)!,key);expect(styleOf(current)).not.toBe(previous);previous=styleOf(current);
  await page.reload();await expect(page.locator('.fm-count')).toContainText('1 fruit');
  await page.keyboard.press('Escape');current=await page.evaluate(key=>sessionStorage.getItem(key)!,key);expect(styleOf(current)).not.toBe(previous);
  await page.getByRole('link',{name:'Return to previous view',exact:true}).first().click();await expect(page.locator('.fm-count')).toContainText('1 fruit');
});

test('without consent article choice stays in memory and reload returns to the picker',async({page})=>{
  await seed(page,'close-reading',false);await page.goto('/#/game/fruit-merge');
  await page.locator('[data-study-topic="forces"]').click();await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
  await page.keyboard.press('Escape');expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
  await page.reload();await expect(page.locator('[data-study-topic]')).toHaveCount(20);
});

test('a newly blocked article write is explained on entry and while already reading',async({page})=>{
  await seed(page);await page.goto('/#/game/fruit-merge');await expect(page.locator('.fm-board')).toBeVisible();
  await page.evaluate(()=>{const original=Storage.prototype.setItem;(window as any).restoreStudyWrite=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='pocket-arcade:study:v1:topic')throw new DOMException('Quota','QuotaExceededError');return original.call(this,key,value);};});
  await page.keyboard.press('Escape');const dialog=page.getByRole('dialog',{name:'Reading storage choices'});
  await expect(dialog.getByRole('status')).toContainText('could not be remembered');
  expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe('close-reading');
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>(window as any).restoreStudyWrite());await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='pocket-arcade:study:v1:topic')throw new DOMException('Quota','QuotaExceededError');return original.call(this,key,value);};});
  await page.keyboard.press('Escape');await expect(dialog.getByRole('status')).toContainText('could not be remembered');
});

test('a browser-consumed fullscreen Escape dismisses a menu first and then advances the article',async({page})=>{
  await seed(page);await page.goto('/#/game/fruit-merge');await expect(page.locator('.fm-count')).toBeVisible();
  await appSettings(page);await expect(page.locator('#menu')).toBeVisible();
  await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange')));
  await expect(page.locator('#menu')).not.toBeVisible();await expect(page.locator('#study-view')).toBeHidden();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe('close-reading');
  await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange')));
  await expect(page.locator('#study-view')).toBeVisible();
  const selected=await page.evaluate(key=>sessionStorage.getItem(key)!,key);expect(styleOf(selected)).not.toBe('qcc');expect(selected.endsWith('close-reading')).toBe(true);
});

test('touch readers can advance through each original article in the unified reader without seeding IDs',async({browser})=>{
  const context=await browser.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:390,height:844},isMobile:true,hasTouch:true});await seedGuest(context);
  const page=await context.newPage();
  try{
    await page.goto('/#/game/fruit-merge');await page.getByRole('button',{name:'Reject All',exact:true}).tap();await page.locator('[data-study-topic="forces"]').tap();
    await expect(page.locator('.fm-board')).toBeVisible();
    await page.locator('#game-menu').tap();await page.locator('#game-options').getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'Study Mode',exact:true}).tap();
    await page.evaluate(()=>{let i=0;const values=[0,.5,.99];Math.random=()=>values[i++%values.length];});
    for(const style of ['quanta','aeon','essay']){
      const next=page.getByRole('button',{name:'Next article',exact:true});await next.scrollIntoViewIfNeeded();await next.tap();
      const article=articleById(`${style}:forces`)!;
      await expect(page.locator('.study-chapter')).toHaveAttribute('data-article-id',article.id);
      await expect(page.getByRole('heading',{level:1})).toHaveText(article.title);
      await expect(page.locator('.study-text-section > p')).toHaveText(article.paragraphs);
      await expect(page.locator('#study-topic')).toHaveValue('forces');
      await expect(page.locator('#study-view')).not.toHaveAttribute('data-style',/./);
      await expect(page.locator('#study-title')).toBeFocused();
      expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
    }
  }finally{await context.close();}
});

test('the unified mobile reader keeps original Quanta paragraphs separated and readable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await seed(page,'quanta:close-reading');await page.goto('/#/game/fruit-merge');
  await appSettings(page);await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  const paragraphs=page.locator('.study-text-section > p');
  await expect(paragraphs).toHaveText(articleById('quanta:close-reading')!.paragraphs);
  const spacing=await paragraphs.evaluateAll(ps=>{const first=ps[0],second=ps[1],style=getComputedStyle(first);return {gap:second.getBoundingClientRect().top-first.getBoundingClientRect().bottom,fontSize:parseFloat(style.fontSize),lineHeight:parseFloat(style.lineHeight),margin:parseFloat(style.marginBottom)};});
  expect(spacing.fontSize).toBeGreaterThanOrEqual(16);
  expect(spacing.lineHeight/spacing.fontSize).toBeGreaterThanOrEqual(1.5);
  expect(spacing.gap).toBeGreaterThanOrEqual(spacing.fontSize);
  expect(spacing.gap).toBeCloseTo(spacing.margin,0);
});

test('Study stays usable without worker update controls',async({page})=>{
  await seed(page);await page.goto('/#/game/fruit-merge');
  await expect(page.locator('.fm-board')).toBeVisible();
  await appSettings(page);
  await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  await expect(page.locator('#study-view')).toBeVisible();
  await expect(page.getByRole('button',{name:'Reload to update',exact:true})).toHaveCount(0);
  await page.locator('.study-article-body').getByRole('link',{name:'Return to previous view',exact:true}).click();
  await expect(page.locator('.fm-board')).toBeVisible();
});

for(const viewport of [{name:'desktop',width:1180,height:900},{name:'mobile',width:390,height:844}]){
  for(const style of ['qcc','quanta','aeon','essay'])test(`${style} layout is readable and captured on ${viewport.name}`,async({page})=>{
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await seed(page,style==='qcc'?'close-reading':`${style}:close-reading`);await page.goto('/#/game/fruit-merge');
    await expect(page.locator('.fm-board')).toBeVisible();
    await appSettings(page);await page.getByRole('button',{name:'Study Mode',exact:true}).click();
    await expect(page.locator('#study-title')).toBeVisible();
    const article=articleById(style==='qcc'?'close-reading':`${style}:close-reading`)!;
    const chapter=page.locator('.study-chapter');
    await expect(chapter).toHaveAttribute('data-article-id',article.id);
    await expect(chapter).toHaveAttribute('data-format','long-read');
    await expect(page.locator('#study-view')).not.toHaveAttribute('data-style',/./);
    await expect(chapter.getByRole('article',{name:article.title,exact:true})).toHaveCount(1);
    await expect(chapter.locator('.study-article-heading h1')).toHaveText(article.title);
    await expect(chapter.locator('.study-subtitle')).toHaveText(article.deck);
    await expect(chapter.locator('.study-hero img')).toBeVisible();
    await expect(chapter.locator('.study-hero img')).toHaveAttribute('alt',/\S/);
    await page.evaluate(()=>window.scrollTo(0,0));await page.locator('#study-view img').evaluateAll(images=>Promise.all(images.map(image=>{(image as HTMLImageElement).loading='eager';return (image as HTMLImageElement).decode();})));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const geometry=await chapter.evaluate(el=>{
      const box=(selector:string)=>{const r=el.querySelector(selector)!.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width};};
      const prose=el.querySelector('.study-article-body')!,style=getComputedStyle(prose);
      return {heading:box('.study-article-heading'),hero:box('.study-hero'),body:box('.study-article-body'),fontSize:parseFloat(style.fontSize),lineHeight:parseFloat(style.lineHeight),viewport:innerWidth};
    });
    expect(geometry.hero.top).toBeGreaterThanOrEqual(geometry.heading.bottom);
    expect(geometry.body.top).toBeGreaterThanOrEqual(geometry.hero.bottom);
    expect(geometry.body.left).toBeGreaterThanOrEqual(16);
    expect(geometry.body.right).toBeLessThanOrEqual(geometry.viewport-16);
    expect(geometry.body.width).toBeLessThanOrEqual(920);
    expect(geometry.fontSize).toBeGreaterThanOrEqual(16);
    expect(geometry.lineHeight/geometry.fontSize).toBeGreaterThanOrEqual(1.5);
    await mkdir('docs/evidence/article-expansion',{recursive:true});
    await page.screenshot({path:`docs/evidence/article-expansion/${style}-${viewport.name}-opening.png`});
    const body=page.locator('.study-article-body');await body.evaluate(element=>window.scrollTo(0,Math.max(0,element.getBoundingClientRect().top+window.scrollY-40)));
    await page.screenshot({path:`docs/evidence/article-expansion/${style}-${viewport.name}-reading.png`});
    await expect(body.getByRole('link',{name:'Return to previous view',exact:true})).toBeVisible();
    await body.getByRole('link',{name:'Return to previous view',exact:true}).click();await expect(page.locator('#study-view')).toBeHidden();
  });
}

// The redesign changes the presentation, not the eighty original readings.
// Compare rendered text and links against the source collection, including the
// QCC editorial additions, instead of merely accepting any non-empty article.
for(const style of articleStyles)test(`${style}: all twenty original texts, exercises and sources survive the shared reader`,async({page})=>{
  // Each family checks twenty long articles, including forty real disclosure
  // clicks and the associated scrolling. Give WebKit CI time for the full tour.
  test.setTimeout(120_000);
  expect(studyArticles).toHaveLength(80);expect(new Set(studyArticles.map(article=>article.id)).size).toBe(80);expect(studyTopics).toHaveLength(20);
  const articles=studyArticles.filter(article=>article.style===style);expect(articles).toHaveLength(20);
  expect(articles.map(article=>article.topicId).sort()).toEqual(studyTopics.map(topic=>topic.id).sort());
  await seed(page,articles[0].id);await page.goto('/#/game/fruit-merge');
  await expect(page.locator('.fm-board')).toBeVisible();
  await appSettings(page);await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  for(const article of articles)await test.step(article.id,async()=>{
    const topic=studyTopics.find(topic=>topic.id===article.topicId)!;
    await page.getByLabel('Study topic',{exact:true}).selectOption(topic.id);
    const chapter=page.locator('.study-chapter');
    await expect(chapter).toHaveAttribute('data-article-id',article.id);
    await expect(chapter.getByRole('article',{name:article.title,exact:true})).toHaveCount(1);
    const rendered=await chapter.evaluate(el=>{
      const text=(selector:string)=>el.querySelector(selector)?.textContent?.trim();
      const texts=(selector:string)=>[...el.querySelectorAll(selector)].map(node=>node.textContent!.trim());
      return {
        title:text('#study-title'),deck:text('.study-subtitle'),
        paragraphs:texts('.study-text-section > p'),headings:texts('.study-text-section > h2'),
        objective:text('.study-objective'),
        example:{title:text('.study-example h2'),question:text('.study-example > p:not([class])'),steps:texts('.study-example li'),result:text('.study-result')},
        check:{question:text('.study-check > p'),answer:text('.study-check details p')},
        sources:[...el.querySelectorAll<HTMLAnchorElement>('.study-sources a')].map(a=>({label:a.textContent!.trim(),url:a.getAttribute('href'),target:a.target,rel:a.rel})),
        adCount:el.querySelectorAll('.study-inline-ad .fictional-ad').length
      };
    });
    const paragraphs=style==='qcc'?topic.sections.flatMap((section,index)=>[...section.paragraphs,...(index===1||index===2?[readingNotes[topic.id][index-1]]:[])]):article.paragraphs;
    expect(rendered).toEqual({
      title:article.title,deck:article.deck,paragraphs,
      headings:style==='qcc'?topic.sections.map(section=>section.heading):[],
      objective:style==='qcc'?`Learning focus ${topic.objective}`:undefined,
      example:topic.example,check:topic.check,
      sources:article.sources.map(([label,url])=>({label,url,target:'_blank',rel:'noopener'})),adCount:1
    });
    const explanation=chapter.locator('.study-check details');
    await expect(explanation).not.toHaveAttribute('open','');
    await explanation.locator('summary').click();
    await expect(explanation.locator('p')).toBeVisible();await expect(explanation.locator('p')).toHaveText(topic.check.answer);
    await explanation.locator('summary').click();await expect(explanation.locator('p')).toBeHidden();
    await expect(page.locator('#study-view')).not.toHaveAttribute('data-style',/./);
    await expect(chapter.locator('.study-hero img')).toHaveAttribute('alt',/\S/);
    await expect(chapter.locator('.study-chapter-footer').getByRole('button',{name:'Next article',exact:true})).toBeEnabled();
    expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe(article.id);
  });
});
