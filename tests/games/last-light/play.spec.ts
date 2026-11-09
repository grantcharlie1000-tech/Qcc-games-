import {test,expect,type Page} from '../../fixtures';
import {createRun,serialize,rankScore} from '../../../src/games/last-light/model';
import {gameAction} from '../../game-menu';
const URL='/#/game/last-light';
const game=(page:Page)=>page.locator('.ll-game');
const number=(page:Page,key:string)=>game(page).getAttribute(`data-${key}`).then(Number);
async function open(page:Page){await page.goto(URL);await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();}
async function play(page:Page){await page.getByRole('button',{name:'Play →',exact:true}).click();await expect(page.locator('.ll-overlay')).toBeHidden();}

test('catalog, keyboard jumping/dashing, checkpoint retry and pause lifecycle',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#/collection');await expect(page.getByRole('link',{name:/Last Light/}).first()).toBeVisible();await open(page);await play(page);
 const x=await number(page,'x');await page.keyboard.down('ArrowRight');await expect.poll(()=>number(page,'x'),{intervals:[16,32,50,100]}).toBeGreaterThan(x+15);await page.keyboard.up('ArrowRight');
 const y=await number(page,'y');await page.keyboard.down('Space');await expect.poll(()=>number(page,'y'),{intervals:[16,32,50,100]}).toBeLessThan(y-20);await page.keyboard.up('Space');
 await page.keyboard.press('x');await expect(game(page)).toHaveAttribute('data-dash','false');
 await page.keyboard.press('p');await expect(game(page)).toHaveAttribute('data-overlay','menu');const time=await number(page,'elapsed');await page.waitForTimeout(250);expect(await number(page,'elapsed')).toBe(time);
 await page.keyboard.press('p');await expect(game(page)).toHaveAttribute('data-overlay','none');
 await page.keyboard.press('r');await expect(page.locator('.ll-deaths')).toHaveText('1');
 await gameAction(page,'Restart game');await expect(page.locator('.ll-deaths')).toHaveText('2');
 await page.keyboard.press('p');await gameAction(page,'Restart game');await expect(page.locator('.ll-deaths')).toHaveText('3');await expect(game(page)).toHaveAttribute('data-overlay','none');
 expect(errors).toEqual([]);
});

test('saved progress resumes safely, help returns to the journey, and new run asks first',async({page})=>{
 const s=createRun();s.stage=8;s.cleared=8;s.time=60000;s.stageTime=0;s.sparks=12;s.deaths=2;s.best=rankScore(8,12,60000,2);s.checkpoint=true;
 await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data,updated:1})),serialize(s));
 await page.goto(URL);await expect(page.getByRole('button',{name:'Continue →'})).toBeVisible();await expect(game(page)).toHaveAttribute('data-stage','9');
 await page.getByRole('button',{name:'Controls',exact:true}).click();await expect(page.getByRole('heading',{name:'Find your footing.'})).toBeVisible();await page.getByRole('button',{name:'Got it →'}).click();
 await page.getByRole('button',{name:'Continue →'}).click();await expect(game(page)).toHaveAttribute('data-overlay','none');
 await page.keyboard.press('p');await page.getByRole('button',{name:'Start a new run',exact:true}).click();await expect(page.getByRole('heading',{name:'Begin again?'})).toBeVisible();await page.getByRole('button',{name:'Keep this journey'}).click();await expect(game(page)).toHaveAttribute('data-stage','9');
 await page.getByRole('button',{name:'Start a new run',exact:true}).click();await page.getByRole('button',{name:'Start new run',exact:true}).click();await expect(game(page)).toHaveAttribute('data-stage','1');await expect(page.locator('.ll-sparks')).toHaveText('0');
});

test('cleared stages unlock only the next stage, and the last stage has a real ending',async({page})=>{
 const s=createRun();s.phase='cleared';s.cleared=1;s.time=12000;s.stageTime=12000;s.sparks=0;s.best=rankScore(1,0,12000,0);
 await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data,updated:1})),serialize(s));
 await page.goto(URL);await expect(page.getByRole('heading',{name:'Level clear.'})).toBeVisible();await page.getByRole('button',{name:'Next level →'}).click();await expect(game(page)).toHaveAttribute('data-stage','2');
 await page.keyboard.press('p');
 const finished={...serialize(s),stage:39,cleared:40,phase:'complete',best:rankScore(40,0,12000,0)};
 await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data,updated:Date.now()+10000})),finished);
 // Navigate away first: the old instance saves on leave. Install the end-state after disposal.
 await page.goto('/#/collection');await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data,updated:Date.now()+10000})),finished);await page.goto(URL);
 await expect(page.getByRole('heading',{name:'All forty cleared.'})).toBeVisible();await page.getByRole('button',{name:'Read the story ending',exact:true}).click();await expect(page.getByRole('heading',{name:'What do we leave alight?'})).toBeVisible();await page.getByRole('button',{name:'Back to results',exact:true}).click();await expect(page.getByRole('heading',{name:'All forty cleared.'})).toBeVisible();await page.getByRole('button',{name:'Read the story ending',exact:true}).click();await page.getByRole('button',{name:'Share the flame →'}).click();await expect(page.getByRole('heading',{name:'All forty cleared.'})).toBeVisible();await expect(page.locator('.ll-card details')).toContainText(['Where your points came from','A thousand little dawns.']);await expect(page.getByRole('button',{name:'View leaderboard'})).toBeVisible();await expect(page.getByRole('button',{name:'Next level →'})).toHaveCount(0);
});

test.describe('touch and responsive layout',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 test('simultaneous touch movement and jumping, cancel cleanup, resize and menu',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Multi-touch is exercised with Chromium’s native touch protocol.');
  await open(page);await play(page);await expect(page.getByRole('button',{name:'Move right',exact:true})).toBeVisible();
  const x=await number(page,'x');
  const client=await page.context().newCDPSession(page),right=(await page.getByRole('button',{name:'Move right',exact:true}).boundingBox())!,jump=(await page.getByRole('button',{name:'Jump',exact:true}).boundingBox())!;
  const a={x:right.x+right.width/2,y:right.y+right.height/2,id:11},b={x:jump.x+jump.width/2,y:jump.y+jump.height/2,id:12};
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});
  await expect.poll(async()=>({moved:(await number(page,'x'))>x+10,airborne:(await number(page,'y'))<355}),{intervals:[16,32,50,100]}).toEqual({moved:true,airborne:true});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[b]});await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await expect(page.locator('.ll-touch [data-held]')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({width:844,height:390});await expect(page.locator('.ll-canvas')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(844);
 });
});
