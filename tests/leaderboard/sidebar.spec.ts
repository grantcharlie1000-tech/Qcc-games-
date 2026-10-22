import {test,expect} from '../fixtures';
test('desktop rankings sit left of the game, disappear for Pool, and return after resize',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'a'.repeat(64),name:'Ada',score:42}],player:null}}));
 await page.goto('/#/game/snake');
 const panel=page.getByRole('complementary',{name:'Snake leaderboard'});
 await expect(panel).toBeVisible();await expect(panel).toContainText('Ada');
 const box=await panel.boundingBox(),game=await page.locator('.game-view').boundingBox();
 expect(box!.x+box!.width).toBeLessThanOrEqual(game!.x);
 await page.setViewportSize({width:390,height:844});await expect(panel).toBeHidden();
 await page.setViewportSize({width:1440,height:900});await expect(panel).toBeVisible();
 await page.goto('/#/game/pool');await expect(page.locator('.lb-sidebar')).toHaveCount(0);
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.locator('#leaderboard-game option[value=pool]')).toHaveCount(0);
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
 await page.goto('/#/game/snake');await started;
 await page.evaluate(()=>{location.hash='#/game/tower';});
 await expect(page.locator('.lb-sidebar')).toContainText('New Tower');
 const oldReply=page.waitForResponse(response=>response.url().includes('game=snake'));release();await oldReply;
 await expect(page.locator('.lb-sidebar')).toHaveCount(1);
 await expect(page.locator('.lb-sidebar')).toContainText('New Tower');
 await expect(page.locator('.lb-sidebar')).not.toContainText('Old Snake');
});

for(const id of ['fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','ball-run','animal-stack','flappy-bird','globle','blockcraft'])test(`${id} has an unobstructed desktop panel`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[],player:null}}));
  await page.goto('/#/game/'+id);await expect(page.locator('.lb-sidebar')).toBeVisible();
  await expect(page.locator('#game-stage .loading')).toHaveCount(0);
  const panel=await page.locator('.lb-sidebar').boundingBox(),back=await page.getByRole('link',{name:'Back to game library',exact:true}).boundingBox();
  expect(back!.x,id).toBeGreaterThanOrEqual(panel!.x+panel!.width);
});

test('visible rankings refresh automatically without a manual button',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.clock.install();let reads=0;
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'c'.repeat(64),name:++reads===1?'First player':'New leader',score:99}],player:null}}));
 await page.goto('/#/game/snake');await expect(page.locator('.lb-sidebar')).toContainText('First player');
 await page.clock.fastForward(30001);await expect(page.locator('.lb-sidebar')).toContainText('New leader');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.lb-sidebar')).toHaveAttribute('hidden','');const before=reads;await page.clock.fastForward(60001);expect(reads).toBe(before);
});
test('offline entry shows cached rankings without a network request',async({page,context})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[{rank:1,playerId:'d'.repeat(64),name:'Saved player',score:21}],player:null}}));
 await page.goto('/#/game/snake');await expect(page.locator('.lb-sidebar')).toContainText('Saved player');
 await page.getByRole('link',{name:'Back to game library',exact:true}).click();
 await context.setOffline(true);await page.evaluate(()=>{location.hash='#/game/snake';});
 await expect(page.locator('.lb-sidebar')).toContainText('Saved player');await expect(page.locator('.lb-sidebar .lb-status')).toContainText('Offline');
});
