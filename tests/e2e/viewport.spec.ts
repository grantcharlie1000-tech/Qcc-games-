import {GAME_IDS} from '../../src/core/types';
import {test,expect} from '../fixtures';
import {deal} from '../../src/games/solitaire/model';

const ids=['fruit-merge','water-sort','color-blocks','tower','snake','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','globle','blockcraft','maze-muncher','corn-clicker','slipline','quadfall'];
const referenced=new Set(['water-sort','color-blocks','ball-run','animal-stack','blockcraft']);

for(const size of [{width:390,height:844},{width:844,height:390}]){
  test(`all games fill ${size.width}×${size.height} without scrolling the document`,async({page})=>{
    test.setTimeout(120000);
    await page.setViewportSize(size);
    for(const id of ids){
      await page.goto(`/#/game/${id}`);
      await expect(page.locator('#game-stage > *').first()).toBeVisible();
      await expect(page.locator('.loading')).toHaveCount(0);
      await expect(page.locator('.game-view')).toHaveCSS('position','fixed');
      const bounds=await page.locator('.game-view').boundingBox();
      expect(bounds, id).toEqual({x:0,y:0,...size});
      await expect(page.locator('.topbar')).toBeHidden();
      await page.mouse.move(size.width/2,size.height/2);
      await page.mouse.wheel(0,1200);
      await page.keyboard.press('PageDown');
      await expect.poll(()=>page.evaluate(()=>({x:scrollX,y:scrollY,height:document.documentElement.scrollHeight})),{message:id})
        .toEqual({x:0,y:0,height:size.height});
      if(!referenced.has(id)){
        await expect.poll(async()=>{
          const box=await page.locator('#game-stage > *').first().boundingBox();
          return !!box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1;
        },{message:`${id}: the entire game, including controls, must fit`}).toBe(true);
        const names:Record<string,string|RegExp>={'fruit-merge':'Drop fruit',tower:'Drop block',snake:'Start slithering',minesweeper:'Flag mode',solitaire:/^Draw from stock/,'block-fill':'Hint','color-connect':'Hint','flappy-bird':'Flap',globle:'Guess','maze-muncher':'Start game','corn-clicker':/^Harvest the cob/,slipline:'Use hint',quadfall:'Start'};
        const control=id==='pool'?page.locator('.pool-table'):page.getByRole('button',{name:names[id],exact:typeof names[id]==='string'}).first();
        await expect.poll(()=>control.evaluate(button=>{
          const r=button.getBoundingClientRect(),under=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return !!under&&(under===button||button.contains(under));
        }),{message:`${id}: primary control must receive a real hit`}).toBe(true);
      }
    }
  });
}

test('Study restores normal reading scroll and returns to the retained fixed game',async({page})=>{
  await page.addInitScript(()=>window.addEventListener('keydown',event=>{if(event.key==='PageDown')queueMicrotask(()=>document.documentElement.dataset.studyPageDownPrevented=String(event.defaultPrevented));},{capture:true}));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('link',{name:'Play Pool',exact:true}).scrollIntoViewIfNeeded();
  const libraryY=await page.evaluate(()=>scrollY);
  expect(libraryY).toBeGreaterThan(0);
  await page.getByRole('link',{name:'Play Pool',exact:true}).click();
  await expect(page.locator('.pool-game')).toBeVisible();
  const root=await page.locator('#game-stage > *').elementHandle();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await page.bringToFront();await page.locator('#study-title').focus();
  // Native scrolling uses the compositor scroll tree. DOM visibility can precede
  // its first frame after releasing overflow:hidden; wait for that frame.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.keyboard.press('PageDown');
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  await expect(page.locator('html')).toHaveAttribute('data-study-page-down-prevented','false');
  await page.getByRole('link',{name:'Games',exact:true}).click();
  expect(await root!.evaluate(node=>node===document.querySelector('#game-stage > *'))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await expect(page.locator('.game-view')).toHaveCSS('position','fixed');
  await page.getByRole('link',{name:'Back to game library',exact:true}).click();
  await expect(page.locator('.game-card')).toHaveCount(GAME_IDS.length);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(libraryY);
  await page.mouse.wheel(0,-1600);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(libraryY);
});

test('legacy fit follows a growing Solitaire pile and preserves real card hits',async({page})=>{
  await page.setViewportSize({width:844,height:390});
  const state=deal(33),sequence=Array.from({length:12},(_,i)=>12-i+(i%2?13:0));
  state.tableau=[sequence.map(id=>({id,up:true})),[],[],[],[],[],[]];
  state.waste=[0];state.stock=Array.from({length:52},(_,id)=>id).filter(id=>id!==0&&!sequence.includes(id));
  await page.addInitScript(state=>localStorage.setItem('pocket-arcade:v1:save:solitaire',JSON.stringify({version:1,data:{version:1,state,history:[]}})),state);
  await page.goto('/#/game/solitaire');
  await expect(page.locator('#game-stage')).toHaveAttribute('data-viewport-scale',/./);
  const before=Number(await page.locator('#game-stage').getAttribute('data-viewport-scale'));
  await page.getByRole('button',{name:'Ace of clubs, Waste',exact:true}).click();
  await page.getByRole('button',{name:'2 of hearts, column 1',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ace of clubs, column 1',exact:true})).toBeVisible();
  await expect.poll(async()=>Number(await page.locator('#game-stage').getAttribute('data-viewport-scale'))).toBeLessThan(before);
  const root=(await page.locator('.solitaire').boundingBox())!;
  expect(root.y).toBeGreaterThanOrEqual(0);expect(root.y+root.height).toBeLessThanOrEqual(391);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ace of clubs, Waste',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>scrollY)).toBe(0);
});

test('Minesweeper keeps its intentional board scrolling inside the fitted game',async({page})=>{
  await page.setViewportSize({width:844,height:390});await page.goto('/#/game/minesweeper');
  await page.getByLabel('Difficulty',{exact:true}).selectOption('expert');
  await page.getByLabel('Cell size',{exact:true}).selectOption('54');
  const first=page.locator('.ms-tile[data-index="0"]');await first.click({button:'right'});
  await expect(first).toHaveAttribute('data-state','flagged');
  await page.locator('.ms-scroll').hover();await page.mouse.wheel(2200,0);
  await expect.poll(()=>page.locator('.ms-scroll').evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
  const last=page.locator('.ms-tile[data-index="29"]');await last.click({button:'right'});
  await expect(last).toHaveAttribute('data-state','flagged');
  const root=(await page.locator('.ms').boundingBox())!;
  expect(root.y).toBeGreaterThanOrEqual(0);expect(root.y+root.height).toBeLessThanOrEqual(391);
  expect(await page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual({x:0,y:0});
});

// Toolbar controls are outside the uniformly fitted stage.
test('all legacy toolbar controls remain reachable at the supported 320px width',async({page})=>{
  await page.setViewportSize({width:320,height:568});await page.goto('/#/game/minesweeper');
  await expect(page.locator('.ms')).toBeVisible();
  for(const control of await page.locator('.game-toolbar button,.game-toolbar a').all()){
    const box=(await control.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
    expect(await control.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  }
  await page.getByRole('button',{name:'Open menu',exact:true}).click();await expect(page.locator('#menu')).toBeVisible();
});
