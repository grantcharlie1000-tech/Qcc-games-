import {GAME_IDS} from '../../src/core/types';
import {guestTest as test,expect} from '../fixtures';
import type {Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {directShot} from '../games/pool/helpers';

const studyImagePaths=new Set<string>([
  ...JSON.parse(readFileSync('public/study/image-provenance.json','utf8')).assets.map((asset:{path:string})=>`/study/${asset.path}`),
  ...JSON.parse(readFileSync('public/study/fictional-ads/provenance.json','utf8')).assets.map((asset:{file:string})=>`/study/fictional-ads/${asset.file}`),
]);
const expectOnlyStudyImages=(requests:string[],page:Page)=>{for(const request of requests){const url=new URL(request);expect(url.origin).toBe(new URL(page.url()).origin);expect(studyImagePaths.has(url.pathname)).toBe(true);}};
const topicKey='pocket-arcade:study:v1:topic';
const choose=async(page:import('@playwright/test').Page,id='close-reading')=>{const accept=page.getByRole('button',{name:'Accept All',exact:true});if(await accept.isVisible())await accept.click();await page.locator(`[data-study-topic="${id}"]`).click();};
const returnToGame=async(page:Page)=>{
  const studyView=page.locator('#study-view'),games=page.getByRole('link',{name:'Games',exact:true}).first();
  await expect(async()=>{
    if(await studyView.isVisible())await games.click({timeout:1000});
    await expect(studyView).toBeHidden({timeout:1000});
  }).toPass({timeout:7000});
  await expect(page.locator('#study-view')).toBeHidden();
  await expect(page.locator('#game-stage, .game-card').first()).toBeVisible();
  await expect(page.locator('#app')).toHaveJSProperty('inert',false);
};
const waitForReadingScroll=async(page:Page)=>{
  let lastY:number|undefined,stillSince=0;
  await expect.poll(async()=>{
    const y=await page.evaluate(()=>window.scrollY),now=performance.now();
    if(lastY===undefined||Math.abs(y-lastY)>.5){lastY=y;stillSince=now;}
    return now-stillSince;
  },{message:'Wait for the native reading scroll to settle',timeout:5000,intervals:[50]}).toBeGreaterThanOrEqual(400);
};
const snapshot=(page:Page,id:string)=>page.evaluate(id=>JSON.parse(localStorage.getItem(`pocket-arcade:v1:save:${id}`)!).data,id);

async function gameAction(page:Page,id:string){
  if(id==='fruit-merge')await page.getByRole('button',{name:'Drop fruit',exact:true}).click();
  if(id==='water-sort'){
    await page.getByRole('button',{name:'Hint',exact:true}).click();
    const from=await page.locator('.ws-hint-from').getAttribute('data-tube'),to=await page.locator('.ws-hint-to').getAttribute('data-tube');
    await page.locator(`[data-tube="${from}"]`).click();await page.locator(`[data-tube="${to}"]`).click();
  }
  if(id==='color-blocks'){await page.locator('.cb-cell').first().focus();await page.keyboard.press('1');await page.keyboard.press('Enter');}
  if(id==='tower'){await page.clock.runFor(900);await page.getByRole('button',{name:'Drop block',exact:true}).click();}
  if(id==='snake')await page.getByRole('button',{name:'Start slithering',exact:true}).click();
  if(id==='minesweeper')await page.getByRole('gridcell').first().click();
  if(id==='solitaire')await page.getByRole('button',{name:/^Draw from stock/}).click();
  if(id==='block-fill'){
    await page.getByRole('button',{name:'Hint',exact:true}).click();
    const match=(await page.locator('.bf-message').textContent())!.match(/row (\d+), column (\d+)/)!;
    const board=page.locator('.bf-board');await board.focus();
    const head=(await board.getAttribute('aria-label'))!.match(/Head row (\d+), column (\d+)/)!;
    const dy=Number(match[1])-Number(head[1]),dx=Number(match[2])-Number(head[2]);
    await page.keyboard.press(dy===1?'ArrowDown':dy===-1?'ArrowUp':dx===1?'ArrowRight':'ArrowLeft');
  }
  if(id==='color-connect')await page.getByRole('button',{name:'Hint',exact:true}).click();
  if(id==='ball-run'){await page.getByRole('button',{name:/^(Play|Continue)$/}).click();await page.keyboard.down('ArrowRight');await page.clock.runFor(120);await page.keyboard.up('ArrowRight');}
  if(id==='maze-muncher')await page.getByRole('button',{name:'Start game',exact:true}).click();
  if(id==='slipline'){const p=await page.locator('.sl-board g[data-free="true"] polyline').first().evaluate((node:SVGPolylineElement)=>{const point=node.getPointAtLength(node.getTotalLength()/2),m=node.getScreenCTM()!;return {x:point.x*m.a+point.y*m.c+m.e,y:point.x*m.b+point.y*m.d+m.f}});await page.mouse.click(p.x,p.y);}
  if(id==='quadfall'){await page.getByRole('button',{name:'Start',exact:true}).click();await page.keyboard.press('Space');}
  if(id==='corn-clicker')await page.getByRole('button',{name:/^Harvest the cob/}).click();
  if(id==='flappy-bird'){await page.getByRole('button',{name:'Take flight',exact:true}).click();await page.keyboard.press('Space');}
  if(id==='pool'){
    await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','0');
    await directShot(page);
    await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','1');
    await expect(page.locator('.pool-game')).toHaveAttribute('data-phase','moving');
  }
  if(id==='animal-stack')await page.getByRole('button',{name:/^Drop /}).click();
  if(id==='fivefold')await page.keyboard.type('a');
  if(id==='globle'){await page.getByRole('textbox',{name:'Country name'}).fill('Kenya');await page.keyboard.press('Enter');}
  if(id==='blockcraft'){
    // Chunks stream on animation frames, which the paused clock drives.
    for(let i=0;i<80&&await page.locator('.blockcraft').getAttribute('data-ready')!=='true';i++)await page.clock.runFor(100);
    await page.getByRole('button',{name:'Play',exact:true}).click();
    await page.keyboard.down('KeyW');await page.clock.runFor(300);await page.keyboard.up('KeyW');
  }
  await page.clock.runFor(id==='snake'?220:id==='ball-run'?120:650);
}

test('first visit offers exactly 20 topics and remembers the choice for this tab only',async({page,context})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Choose your study topic'})).toBeVisible();
  await expect(page.locator('[data-study-topic]')).toHaveCount(20);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading',{name:'Choose your study topic'})).toBeVisible();
  await choose(page,'quadratics');
  await expect(page.locator('.game-card')).toHaveCount(GAME_IDS.length);
  expect(await page.evaluate(key=>sessionStorage.getItem(key),topicKey)).toBe('quadratics');
  await page.reload();
  await expect(page.locator('.game-card').first()).toBeVisible();
  await expect(page.locator('#study-view')).toBeHidden();
  const another=await context.newPage();await another.goto('/');
  await expect(another.getByRole('heading',{name:'Choose your study topic'})).toBeVisible();
});

test('reading keeps native Space scrolling and keyboard controls isolated from Tower',async({page})=>{
  await page.addInitScript(()=>window.addEventListener('keydown',event=>{
    if(event.code==='Space')setTimeout(()=>{document.documentElement.dataset.studySpacePrevented=String(event.defaultPrevented);},0);
  },{capture:true}));
  await page.goto('/#/game/tower');await choose(page);
  await expect(page.getByRole('button',{name:'Drop block',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  // Native scrolling needs browser focus, which another parallel page can take.
  // Re-focus and perform the real input; a game preventing Space still fails.
  await expect(async()=>{
    await page.bringToFront();await page.locator('#study-title').focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  }).toPass({timeout:7000});
  await expect(page.locator('html')).toHaveAttribute('data-study-space-prevented','false');
  await page.bringToFront();
  await page.locator('#study-topic').focus();await page.keyboard.press('ArrowDown');
  await expect(page.locator('#study-topic')).toHaveValue('essay-writing');
  await expect(page.locator('#study-title')).not.toBeEmpty();
  await waitForReadingScroll(page);
  await returnToGame(page);
  await expect(page.locator('.tower-height')).toHaveText('0');
});

test('Escape immediately saves and pauses; article changes never load or replace the game',async({page})=>{
  await page.goto('/#/game/fruit-merge');await choose(page);
  await page.getByRole('button',{name:'Drop fruit',exact:true}).click();
  await expect(page.locator('.fm-count')).toContainText('1 fruit');
  await page.evaluate(()=>{(window as unknown as {retainedStage:Element|null}).retainedStage=document.querySelector('#game-stage > *');});
  const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-topic')).toHaveValue('close-reading');
  await expect(page.locator('#game-stage')).toBeHidden();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')!).data);
  expect(before.fruits).toHaveLength(1);
  const topics=await page.locator('#study-topic option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
  expect(topics).toHaveLength(20);
  for(const id of topics){
    await page.getByLabel('Study topic',{exact:true}).selectOption(id);
    await expect(page.locator('#study-title')).not.toBeEmpty();
    await expect(page.locator('.study-diagram, .study-byline svg')).toHaveCount(0);
    expect(await page.locator('.study-article-body p').count()).toBeGreaterThanOrEqual(4);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')!).data);
  expect(after).toEqual(before);
  await waitForReadingScroll(page);
  await returnToGame(page);
  await expect(page.locator('.fm-count')).toContainText('1 fruit');
  expect(await page.evaluate(()=>(window as unknown as {retainedStage:Element|null}).retainedStage===document.querySelector('#game-stage > *'))).toBe(true);
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
  expectOnlyStudyImages(requests,page);
});

test.describe('all retained game instances',()=>{
  for(const id of ['fruit-merge','water-sort','color-blocks','tower','snake','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','globle','blockcraft','maze-muncher','corn-clicker','slipline','quadfall','fivefold']){
    test(`${id}: gameplay, Escape, frozen autosave and exact return`,async({page})=>{
      test.setTimeout(60000);
      const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      await page.clock.install({time:new Date('2026-10-19T12:00:00Z')});
      await page.clock.pauseAt(new Date('2026-10-19T12:00:01Z'));
      await page.goto(`/#/game/${id}`);await choose(page,'forces');
      await expect(page.locator('.loading')).toHaveCount(0);
      await expect(page.locator('.game-error')).toHaveCount(0);
      await gameAction(page,id);
      const root=await page.locator('#game-stage > *').first().elementHandle();
      await page.keyboard.press('Escape');
      await expect(page.locator('#study-topic')).toHaveValue('forces');
      await expect(page.locator('#study-title')).not.toBeEmpty();
      await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Resume game');
      const saved=await snapshot(page,id);expect(saved).toBeTruthy();
      // Advance beyond the 5-second autosave and any AI/animation delays.
      await page.clock.runFor(6100);
      await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
      // Native Space scrolling can continue after keyboard.press resolves, even
      // with the page clock paused. Settle it before changing articles and clicking Games.
      await waitForReadingScroll(page);
      await page.getByLabel('Study topic',{exact:true}).selectOption('probability');
      await page.keyboard.down('Escape');await page.keyboard.down('Escape');await page.keyboard.up('Escape');
      expect(await snapshot(page,id)).toEqual(saved);
      await waitForReadingScroll(page);
      await returnToGame(page);
      expect(await root!.evaluate(node=>node===document.querySelector('#game-stage > *'))).toBe(true);
      await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
      await page.keyboard.press('Escape');
      // Corn Clicker is an idle game: time spent away, reading included, keeps the farm growing
      // once play resumes (its own tests cover those rules), so only the frozen autosave applies.
      if(id!=='corn-clicker')expect(await snapshot(page,id)).toEqual(saved);
      await returnToGame(page);
      expect(errors).toEqual([]);
    });
  }
});

for(const modal of ['menu','rules']){
  test(`Escape dismisses the ${modal} before opening the chapter`,async({page})=>{
    await page.goto('/#/game/fruit-merge');await choose(page);
    await page.getByRole('button',{name:'Drop fruit',exact:true}).click();
    await page.getByRole('button',{name:modal==='menu'?'Open menu':'Game rules',exact:true}).click();
    if(modal==='menu')await page.getByRole('searchbox').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('#study-view')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#study-view')).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Resume game');
    const saved=await snapshot(page,'fruit-merge');
    await page.getByLabel('Study topic',{exact:true}).selectOption('te-tiriti');
    expect(await snapshot(page,'fruit-merge')).toEqual(saved);
    await waitForReadingScroll(page);
    await returnToGame(page);
    await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
    await page.getByRole('button',{name:'Drop fruit',exact:true}).click();
    await expect(page.locator('.fm-count')).toContainText('2 fruits');
  });
}

test('manual pause survives Study and topic navigation keeps the game route intact',async({page})=>{
  await page.goto('/#/game/minesweeper');await choose(page);
  await page.getByRole('gridcell').first().click();
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Study topic',{exact:true}).selectOption('probability');
  expect(new URL(page.url()).hash).toBe('#/collection/10');
  await waitForReadingScroll(page);
  await returnToGame(page);
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.getByRole('button',{name:'Keep playing',exact:true}).click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
});

test('Escape during a delayed import opens instantly and the late game mounts paused',async({page})=>{
  await page.goto('/');await choose(page);
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/src/games/fruit-merge/index.ts*',async route=>{await gate;await route.continue();});
  await page.getByRole('link',{name:'Play Suika Game',exact:true}).click();
  await expect(page.locator('.loading')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-topic')).toHaveValue('close-reading');
  release();
  await expect(page.locator('.fm')).toBeAttached();
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Resume game');
  expect((await snapshot(page,'fruit-merge')).fruits).toHaveLength(0);
  await returnToGame(page);
  await page.getByRole('button',{name:'Drop fruit',exact:true}).click();
  await expect(page.locator('.fm-count')).toContainText('1 fruit');
});

test('Study remains usable when both storage APIs are blocked',async({page})=>{
  await page.addInitScript(()=>{
    for(const key of ['sessionStorage','localStorage'])Object.defineProperty(window,key,{get(){throw new DOMException('Blocked','SecurityError');}});
  });
  await page.goto('/#/game/solitaire');
  await page.getByRole('button',{name:'Play as guest',exact:true}).click();
  await page.getByRole('button',{name:'Customize',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('unavailable');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Accept All',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('This choice applies to this page only');await expect(page.getByRole('dialog').getByRole('status')).toBeInViewport();await page.keyboard.press('Escape');
  await page.locator('[data-study-topic="historical-evidence"]').click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Your reading topic could not be remembered');await expect(page.getByRole('dialog').getByRole('status')).toBeInViewport();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/^Draw from stock/}).click();
  const cards=await page.locator('.sol-card').count();
  await page.keyboard.press('Escape');
  await expect(page.locator('.study-save-error')).toContainText('memory');
  await page.getByLabel('Study topic',{exact:true}).selectOption('hauora');
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Your reading topic could not be remembered');await expect(page.getByRole('dialog').getByRole('status')).toBeInViewport();await page.keyboard.press('Escape');
  await returnToGame(page);
  expect(await page.locator('.sol-card').count()).toBe(cards);
  await page.reload();
  await page.getByRole('button',{name:'Play as guest',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Choose your study topic'})).toBeVisible();
});

test('library menu keeps cards and requests only approved study images',async({page})=>{
  await page.goto('/');await choose(page);
  await page.locator('.game-card img').last().evaluate((image:HTMLImageElement)=>image.decode());
  const card=await page.locator('.game-card').first().elementHandle();
  await page.getByRole('button',{name:'Open menu'}).click();
  const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
  await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  await expect(page.locator('#study-title')).toBeVisible();
  await returnToGame(page);
  expect(await card!.evaluate(node=>node===document.querySelector('.game-card'))).toBe(true);
  expectOnlyStudyImages(requests,page);
});

test('a partially dragged Solitaire card is cleaned up without changing the deal',async({page})=>{
  await page.goto('/#/game/solitaire');await choose(page);
  const card=page.locator('[data-source="tableau"]').first();
  const box=(await card.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+35,{steps:3});
  await expect(page.locator('.sol-drag-ghost')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sol-drag-ghost')).toHaveCount(0);
  const saved=await snapshot(page,'solitaire');
  await page.mouse.up();await returnToGame(page);await page.keyboard.press('Escape');
  expect(await snapshot(page,'solitaire')).toEqual(saved);
});

test('return restores keyboard focus even when a card game re-renders its controls on pause',async({page})=>{
  await page.goto('/#/game/solitaire');await choose(page);
  const card=page.locator('[data-source="tableau"]').last();await card.focus();
  const label=(await card.getAttribute('aria-label'))!;
  await page.keyboard.press('Escape');await returnToGame(page);
  await expect(page.getByRole('button',{name:label,exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
});

test('returning while the page is hidden leaves the game safely paused',async({page})=>{
  await page.goto('/#/game/fruit-merge');await choose(page);
  await page.getByRole('button',{name:'Drop fruit',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await returnToGame(page);
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.evaluate(()=>{Reflect.deleteProperty(document,'hidden');document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.getByRole('button',{name:'Keep playing',exact:true}).click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
});

for(const size of [{width:390,height:844},{width:768,height:1024},{width:1366,height:768}]){
  test(`topic picker and textbook at ${size.width}`,async({page})=>{
    await page.setViewportSize(size);await page.goto('/');
    await page.screenshot({path:`docs/evidence/article-reading-layout/picker-${size.width}.png`,fullPage:true});
    await choose(page,'inheritance');await page.getByRole('button',{name:'Open menu'}).click();
    await page.getByRole('button',{name:'Study Mode',exact:true}).click();
    await expect(page.locator('#study-title')).toHaveText('From DNA to inherited variation');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`docs/evidence/article-reading-layout/article-${size.width}.png`,fullPage:true});
    await page.getByText('Read the explanation',{exact:true}).click();
    await expect(page.locator('details')).toHaveAttribute('open','');
    await returnToGame(page);
    await expect(page.locator('.game-card')).toHaveCount(GAME_IDS.length);
  });
}

test('all twenty articles contain substantial readable prose without sidebar or SVG diagrams',async({page})=>{
  await page.goto('/');await choose(page);await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  const topics=await page.locator('#study-topic option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));expect(topics).toHaveLength(20);
  for(const id of topics){await page.getByLabel('Study topic',{exact:true}).selectOption(id);await expect(page.locator('.study-text-section')).toHaveCount(6);await expect(page.locator('.study-sidebar,.study-diagram,.study-chapter svg')).toHaveCount(0);const words=(await page.locator('.study-article-body').innerText()).trim().split(/\s+/).length;expect(words).toBeGreaterThanOrEqual(900);expect(await page.locator('.study-example ol li').count()).toBeGreaterThanOrEqual(2);}
});
