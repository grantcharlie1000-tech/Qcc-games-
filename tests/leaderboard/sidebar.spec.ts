import {test,expect} from '../fixtures';
const expand=(page:import('@playwright/test').Page)=>page.getByRole('button',{name:'Top scores',exact:true}).click();
test('rankings float collapsed over a full-width game, expand on demand and remember the choice',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'a'.repeat(64),name:'Extraordinarily Longname',score:1234567}],player:null}}));
 await page.goto('/#/game/snake');
 const panel=page.getByRole('complementary',{name:'Snake leaderboard'});
 await expect(panel).toBeVisible();await expect(panel.locator('.lb-table')).toBeHidden();
 const view=await page.locator('.game-view').boundingBox();expect(view!.x).toBe(0);expect(view!.width).toBe(1440);
 await expand(page);await expect(panel).toContainText('Extraordinarily Longname');
 expect(await page.locator('.game-view').boundingBox()).toEqual(view);
 // Every cell stays on one line.
 for(const cell of await panel.locator('th,td').all()){const box=await cell.boundingBox();expect(box!.height).toBeLessThan(40);}
 await page.reload();await expect(panel.locator('.lb-table')).toBeVisible();
 await page.getByRole('button',{name:'Hide top scores'}).click();await expect(panel.locator('.lb-table')).toBeHidden();
 await page.reload();await expect(page.getByRole('button',{name:'Top scores',exact:true})).toHaveAttribute('aria-expanded','false');
 await page.setViewportSize({width:390,height:844});await expect(panel).toBeHidden();
 await page.setViewportSize({width:1440,height:900});await expect(panel).toBeVisible();
 await page.goto('/#/game/pool');await expect(page.locator('.lb-sidebar')).toHaveCount(0);
 await page.goto('/#/game/globle');await expect(page.locator('.lb-sidebar')).toHaveCount(0);
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.locator('#leaderboard-game option[value=pool]')).toHaveCount(0);
});
test('Minecraft has no leaderboard rail and keeps the full width',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[],player:null}}));
 await page.goto('/#/game/blockcraft');await expect(page.locator('.blockcraft')).toBeAttached();
 await expect(page.locator('.lb-sidebar')).toHaveCount(0);
 const view=await page.locator('.game-view').boundingBox();
 expect(view!.x).toBe(0);expect(view!.width).toBe(1440);
});
test('late leaderboard response cannot overwrite the next game',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const board=(name:string)=>({entries:[{rank:1,playerId:'b'.repeat(64),name,score:10}],player:null});
 await page.route('**/.netlify/functions/leaderboard**',async route=>{
  const snake=new URL(route.request().url()).searchParams.get('game')==='snake';
  if(snake)await gate;
  await route.fulfill({json:board(snake?'Old Snake':'New Tower')});
 });
 const started=page.waitForRequest(request=>request.url().includes('game=snake'));
 await page.goto('/#/game/snake');await expand(page);await started;
 await page.evaluate(()=>{location.hash='#/game/tower';});
 await expect(page.locator('.lb-sidebar')).toContainText('New Tower');
 const oldReply=page.waitForResponse(response=>response.url().includes('game=snake'));release();await oldReply;
 await expect(page.locator('.lb-sidebar')).toHaveCount(1);
 await expect(page.locator('.lb-sidebar')).toContainText('New Tower');
 await expect(page.locator('.lb-sidebar')).not.toContainText('Old Snake');
});

for(const id of ['fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','solitaire','block-fill','color-connect','ball-run','animal-stack','flappy-bird'])test(`${id} keeps its full layout with a collapsed rankings pill`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[],player:null}}));
 await page.goto('/#/game/'+id);await expect(page.locator('.lb-sidebar')).toBeVisible();
 await expect(page.locator('#game-stage .loading')).toHaveCount(0);
 const view=await page.locator('.game-view').boundingBox();expect(view!.x,id).toBe(0);expect(view!.width,id).toBe(1440);
 const pill=await page.locator('.lb-toggle').boundingBox(),back=await page.getByRole('link',{name:'Back to game library',exact:true}).boundingBox();
 expect(pill!.y,id).toBeGreaterThan(back!.y+back!.height);expect(pill!.width,id).toBeLessThan(200);
});

test('visible rankings refresh automatically without a manual button',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.clock.install();let reads=0;
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'c'.repeat(64),name:++reads===1?'First player':'New leader',score:99}],player:null}}));
 await page.goto('/#/game/snake');await expand(page);await expect(page.locator('.lb-sidebar')).toContainText('First player');
 await page.clock.fastForward(30001);await expect(page.locator('.lb-sidebar')).toContainText('New leader');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.lb-sidebar')).toHaveAttribute('hidden','');const before=reads;await page.clock.fastForward(60001);expect(reads).toBe(before);
});
test('offline entry shows cached rankings without a network request',async({page,context})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'d'.repeat(64),name:'Saved player',score:21}],player:null}}));
 await page.goto('/#/game/snake');await expand(page);await expect(page.locator('.lb-sidebar')).toContainText('Saved player');
 await page.getByRole('link',{name:'Back to game library',exact:true}).click();
 await context.setOffline(true);await page.evaluate(()=>{location.hash='#/game/snake';});
 await expect(page.locator('.lb-sidebar')).toContainText('Saved player');await expect(page.locator('.lb-sidebar .lb-status')).toContainText('Offline');
});
test('Corn Clicker ranks lifetime kernels and shows them in the game number format',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const posted:any[]=[];
 await page.route('**/.netlify/functions/leaderboard**',route=>{
  if(route.request().method()==='POST')posted.push(route.request().postDataJSON());
  return route.fulfill({json:{entries:[{rank:1,playerId:'e'.repeat(64),name:'Cob Baron',score:126600}],player:null}});
 });
 await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({token:'acct_'+'f'.repeat(64),username:'Ada'})));
 await page.goto('/#/game/corn-clicker');await expect(page.locator('#game-stage .loading')).toHaveCount(0);
 // The farm fills the viewport to its bottom edge, so the pill sits in the toolbar rather than over the game.
 const pill=await page.locator('.lb-toggle').boundingBox(),stage=await page.locator('#game-stage').boundingBox();
 expect(pill!.y+pill!.height).toBeLessThanOrEqual(stage!.y);
 await expand(page);
 await expect(page.locator('.lb-sidebar')).toContainText('Cob Baron');await expect(page.locator('.lb-sidebar')).toContainText('4.571 T');
 for(let i=0;i<3;i++)await page.getByRole('button',{name:/^Harvest the cob/}).click();
 await page.getByRole('button',{name:'All rankings'}).click();
 await expect(page.locator('#leaderboard-game')).toHaveValue('corn-clicker');
 await expect(page.locator('#leaderboard-dialog tbody')).toContainText('4.571 T');
 await expect.poll(()=>posted.find(p=>p.game==='corn-clicker')?.score??0).toBeGreaterThan(0);
});

test('Minesweeper opens score rankings and retains difficulty options',async({page})=>{
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[],player:null}}));
 await page.goto('/#/game/minesweeper');await expect(page.locator('.ms-tile').first()).toBeVisible();await page.setViewportSize({width:1440,height:900});await expect(page.locator('.lb-sidebar')).toBeVisible();
 await page.locator('.ms-level').selectOption('intermediate');await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Rankings',exact:true}).click();
 await expect(page.locator('#leaderboard-game')).toHaveValue('minesweeper-score');await page.locator('#leaderboard-game').selectOption('minesweeper-medium');await expect(page.locator('#leaderboard-game')).toHaveValue('minesweeper-medium');await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');
});

test('Tetris exposes the leaderboard and rankings selector',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'a'.repeat(64),name:'Ada',score:1200}],player:null}}));
 await page.goto('/#/game/quadfall');
 const panel=page.getByRole('complementary',{name:'Tetris leaderboard'});await expect(panel).toBeVisible();
 await expand(page);await expect(panel).toContainText('Ada');await expect(panel).toContainText('1,200');
 await panel.getByRole('button',{name:'All rankings'}).click();await expect(page.locator('#leaderboard-game')).toHaveValue('quadfall');
});
