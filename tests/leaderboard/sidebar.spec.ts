import {test,expect} from '../fixtures';
import {backToGames,gameAction,gameOption} from '../game-menu';
import type {Page} from '@playwright/test';
const expand=(page:import('@playwright/test').Page)=>gameAction(page,'Leaderboards');
const close=(page:import('@playwright/test').Page)=>page.getByRole('button',{name:'Close leaderboards',exact:true}).click();
const panel=(page:import('@playwright/test').Page)=>page.locator('#leaderboard-dialog');
const sidebar=(page:Page)=>page.locator('.lb-sidebar');
async function expectCompanionClear(page:Page,board?:string){
 const companion=(await sidebar(page).boundingBox())!,viewport=page.viewportSize()!;
 expect(companion.x).toBeGreaterThanOrEqual(0);expect(companion.y).toBeGreaterThanOrEqual(0);
 expect(companion.x+companion.width).toBeLessThanOrEqual(viewport.width);expect(companion.y+companion.height).toBeLessThanOrEqual(viewport.height);
 for(const selector of ['.game-dock',...(board?[board]:[])]){
  const target=(await page.locator(selector).boundingBox())!;
  expect(companion.x+companion.width<=target.x||target.x+target.width<=companion.x||companion.y+companion.height<=target.y||target.y+target.height<=companion.y,`Top scores overlaps ${selector}`).toBe(true);
 }
 expect(await sidebar(page).evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
}

test('the desktop Top scores companion stays clear of play and the game menu opens rankings on desktop and mobile',async({page})=>{
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'a'.repeat(64),name:'Extraordinarily Longname',score:1234567}],player:null}}));
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto('/#/game/snake');
  await expect(page.locator('.snake-garden')).toBeVisible();await expect(panel(page)).toBeHidden();await expect(sidebar(page)).toHaveCount(1);
  await expect(sidebar(page).locator('.lb-toggle')).toHaveAttribute('aria-expanded','false');await expect(sidebar(page).locator('.lb-panel')).toBeHidden();
  const view=await page.locator('.game-view').boundingBox();expect(view).toEqual({x:0,y:0,...viewport});
  // #93 restored an opt-in desktop companion after #86 removed the old rail; #94 moved it bottom-left.
  if(viewport.width===1440){
   await expect(sidebar(page)).toBeVisible();await expectCompanionClear(page,'.snake-garden');
   await sidebar(page).getByRole('button',{name:'Top scores',exact:true}).click();
   await expect(sidebar(page).locator('.lb-toggle')).toHaveAttribute('aria-expanded','true');await expect(sidebar(page).locator('.lb-panel')).toBeVisible();
   await expect(sidebar(page).locator('tbody tr').first().locator('td')).toHaveText(['1','Extraordinarily Longname','1,234,567']);
   await expectCompanionClear(page,'.snake-garden');expect(await page.locator('.game-view').boundingBox()).toEqual(view);
   await sidebar(page).getByRole('button',{name:'All rankings',exact:true}).click();await expect(panel(page)).toContainText('Extraordinarily Longname');
   await expect(page.locator('#leaderboard-game')).toHaveValue('snake');await close(page);
   await sidebar(page).getByRole('button',{name:'Hide top scores',exact:true}).click();
   await expect(sidebar(page).locator('.lb-toggle')).toHaveAttribute('aria-expanded','false');await expect(sidebar(page).locator('.lb-panel')).toBeHidden();
   await expectCompanionClear(page,'.snake-garden');
  }else await expect(sidebar(page)).toBeHidden();
  await expand(page);await expect(panel(page)).toContainText('Extraordinarily Longname');
  expect(await page.locator('.game-view').boundingBox()).toEqual(view);
  expect(await panel(page).evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await close(page);await expect(page.locator('#pause-overlay')).toBeHidden();
  await page.reload();await expect(panel(page)).toBeHidden();
  await expect(sidebar(page).locator('.lb-toggle')).toHaveAttribute('aria-expanded','false');await expect(sidebar(page).locator('.lb-panel')).toBeHidden();
  if(viewport.width===1440)await expect(sidebar(page)).toBeVisible();else await expect(sidebar(page)).toBeHidden();
 }
 await page.goto('/#/game/pool');await expand(page);await expect(page.locator('#leaderboard-game option[value=pool]')).toHaveCount(0);
});
test('Minecraft has no leaderboard rail and keeps the full width',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/#/game/blockcraft');
 await expect(page.locator('.blockcraft')).toBeAttached();await expect(page.locator('.lb-sidebar')).toHaveCount(0);
 const view=await page.locator('.game-view').boundingBox();expect(view!.x).toBe(0);expect(view!.width).toBe(1440);
});
test('late leaderboard response cannot overwrite the next game',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/.netlify/functions/leaderboard**',async route=>{
  const snake=new URL(route.request().url()).searchParams.get('game')==='snake';if(snake)await gate;
  await route.fulfill({json:{entries:[{rank:1,playerId:'b'.repeat(64),name:snake?'Old Snake':'New Tower',score:10}],player:null}});
 });
 const started=page.waitForRequest(request=>request.url().includes('game=snake'));
 await page.goto('/#/game/snake');await expand(page);await started;
 await page.evaluate(()=>{location.hash='#/game/tower';});await expand(page);await expect(panel(page)).toContainText('New Tower');
 const oldReply=page.waitForResponse(response=>response.url().includes('game=snake'));release();await oldReply;
 await expect(panel(page)).toContainText('New Tower');await expect(panel(page)).not.toContainText('Old Snake');
});
for(const id of ['fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','solitaire','block-fill','color-connect','ball-run','animal-stack','flappy-bird'])test(`${id} keeps its full layout and rankings remain secondary`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[],player:null}}));
 await page.goto('/#/game/'+id);await expect(page.locator('#game-stage .loading')).toHaveCount(0);
 const view=await page.locator('.game-view').boundingBox();expect(view!.x,id).toBe(0);expect(view!.width,id).toBe(1440);
 await expect(sidebar(page)).toBeVisible();await expect(sidebar(page).locator('.lb-toggle')).toHaveAttribute('aria-expanded','false');await expect(sidebar(page).locator('.lb-panel')).toBeHidden();
 await expectCompanionClear(page);
 await expand(page);await expect(page.locator('#leaderboard-game')).toHaveValue(id);expect(await page.locator('.game-view').boundingBox()).toEqual(view);
 await close(page);await expect(sidebar(page).locator('.lb-toggle')).toHaveAttribute('aria-expanded','false');await expect(sidebar(page).locator('.lb-panel')).toBeHidden();
});
test('visible rankings stay idle until manual refresh and reopen with fresh results',async({page})=>{
 await page.clock.install();let reads=0;
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'c'.repeat(64),name:++reads===1?'First player':'New leader',score:99}],player:null}}));
 await page.goto('/#/game/snake');await expand(page);await expect(panel(page)).toContainText('First player');
 await page.clock.fastForward(180001);expect(reads).toBe(1);await expect(panel(page)).toContainText('First player');
 await panel(page).getByRole('button',{name:'Refresh scores'}).click();await expect(panel(page)).toContainText('New leader');
 await close(page);const before=reads;await page.clock.fastForward(180001);expect(reads).toBe(before);
 await expand(page);await expect.poll(()=>reads).toBe(before+1);
});
test('offline entry shows cached rankings when the network is unavailable',async({page,context})=>{
 let reads=0;await page.route('**/.netlify/functions/leaderboard**',route=>{reads++;return route.fulfill({json:{entries:[{rank:1,playerId:'d'.repeat(64),name:'Saved player',score:21}],player:null}});});
 await page.goto('/#/game/snake');await expand(page);await expect(panel(page)).toContainText('Saved player');await close(page);await backToGames(page);
 await page.route('**/.netlify/functions/leaderboard**',route=>route.abort('internetdisconnected'));await context.setOffline(true);await page.evaluate(()=>{location.hash='#/game/snake';});await expand(page);
 await expect(panel(page)).toContainText('Saved player');await expect(panel(page).locator('.lb-status')).toContainText('Offline');expect(reads).toBe(1);
});
test('Corn Clicker ranks lifetime kernels and shows them in the game number format',async({page})=>{
 const posted:any[]=[];await page.route('**/.netlify/functions/leaderboard**',route=>{
  if(route.request().method()==='POST')posted.push(route.request().postDataJSON());
  return route.fulfill({json:{entries:[{rank:1,playerId:'e'.repeat(64),name:'Cob Baron',score:126600}],player:null}});
 });
 await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({token:'acct_'+'f'.repeat(64),username:'Ada'})));
 await page.goto('/#/game/corn-clicker');await expect(page.locator('#game-stage .loading')).toHaveCount(0);
 for(let i=0;i<3;i++)await page.getByRole('button',{name:/^Harvest the cob/}).click();
 await expand(page);await expect(page.locator('#leaderboard-game')).toHaveValue('corn-clicker');
 await expect(panel(page)).toContainText('Cob Baron');await expect(panel(page).locator('tbody')).toContainText('4.571 T');
 await expect.poll(()=>posted.find(p=>p.game==='corn-clicker')?.score??0).toBeGreaterThan(0);
});
test('Minesweeper opens score rankings and retains difficulty options',async({page})=>{
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[],player:null}}));
 await page.goto('/#/game/minesweeper');await gameOption(page,'Difficulty','intermediate');await expand(page);
 await expect(page.locator('#leaderboard-game')).toHaveValue('minesweeper-score');await page.locator('#leaderboard-game').selectOption('minesweeper-medium');
 await expect(page.locator('#leaderboard-game')).toHaveValue('minesweeper-medium');await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');
});
test('Tetris exposes the leaderboard and rankings selector',async({page})=>{
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'a'.repeat(64),name:'Ada',score:1200}],player:null}}));
 await page.goto('/#/game/quadfall');await expand(page);await expect(panel(page)).toContainText('Ada');await expect(panel(page)).toContainText('1,200');
 await expect(page.locator('#leaderboard-game')).toHaveValue('quadfall');
});
