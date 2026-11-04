import {test,expect,type Page} from '../../fixtures';

type HookState={phase:string;held:boolean;paused:boolean;t:number;over:boolean;alive:boolean;x:number;y:number;z:number;yaw:number;pitch:number;health:number;kills:number;deaths:number;score:number;slot:number;mag:number[];reserve:number;grenades:number;weapon:string;teamScores:number[];mode:string;map:string;fighters:{id:number;alive:boolean;x:number;y:number;z:number;team:number;health:number}[]};
interface Hook{state():HookState;start(p:Record<string,unknown>):void;freeze(on:boolean):void;advance(s:number):void;look(y:number,p:number):void;placeBot(id:number,d:number):void;isolate(keep?:number[]):void;skip(s:number):void;hurtYou(n:number,from?:number):void;stats():{calls:number;triangles:number}}
declare global{interface Window{__quadClashTest?:Hook}}

function watch(page:Page){const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return errors;}
async function open(page:Page){
  const errors=watch(page);
  await page.goto('/#/game/quad-clash');
  await page.waitForFunction(()=>window.__quadClashTest!==undefined);
  await expect(page.locator('.quad-clash')).toHaveAttribute('data-phase','menu');
  return errors;
}
const state=(page:Page)=>page.evaluate(()=>window.__quadClashTest!.state());
const advance=(page:Page,s:number)=>page.evaluate(v=>window.__quadClashTest!.advance(v),s);
async function startFrozen(page:Page,p:Record<string,unknown>){await page.evaluate(v=>{const h=window.__quadClashTest!;h.start(v);h.freeze(true);},p);}

test('the setup menu offers every mode, arena, skill and weapon, and Play starts that match',async({page})=>{
  const errors=await open(page);
  const menu=page.locator('.qc-menu');
  await expect(menu.getByRole('radio')).toHaveCount(3+2+3+7);
  await menu.getByText('House Match',{exact:true}).click();
  await menu.getByText('Sports Field',{exact:true}).click();
  await menu.getByText('Hard',{exact:true}).click();
  await menu.getByText('Valedictorian',{exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  const root=page.locator('.quad-clash');
  await expect(root).toHaveAttribute('data-phase','playing');
  await expect(root).toHaveAttribute('data-mode','house');
  await expect(root).toHaveAttribute('data-map','field');
  expect((await state(page)).weapon).toBe('valedictorian');
  await expect(page.locator('.qc-scores')).toContainText('Kōwhai');
  await expect(page.locator('#game-level')).toContainText('House');
  // The arena actually draws.
  const stats=await page.evaluate(()=>window.__quadClashTest!.stats());
  expect(stats.calls).toBeGreaterThan(10);expect(stats.triangles).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('W A S D move, Space jumps, F fires, R reloads and Q swaps, all from the keyboard',async({page})=>{
  const errors=await open(page);
  await startFrozen(page,{mode:'brawl',map:'quad',primary:'bell',seed:5});
  await page.evaluate(()=>window.__quadClashTest!.isolate());
  await advance(page,0.5);
  const s0=await state(page);
  await page.keyboard.down('w');await advance(page,0.6);await page.keyboard.up('w');
  const s1=await state(page);
  expect(Math.hypot(s1.x-s0.x,s1.z-s0.z)).toBeGreaterThan(2);
  await page.keyboard.down('Space');await advance(page,0.15);await page.keyboard.up('Space');
  expect((await state(page)).y).toBeGreaterThan(s1.y+0.3);
  await advance(page,1);
  await page.keyboard.down('f');await advance(page,0.5);await page.keyboard.up('f');
  const s2=await state(page);
  expect(s2.mag[0]).toBeLessThan(30);
  await page.keyboard.press('r');await advance(page,2);
  expect((await state(page)).mag[0]).toBe(30);
  await page.keyboard.press('q');await advance(page,0.1);
  expect((await state(page)).weapon).toBe('pencil');
  await expect(page.locator('.qc-weapon-name')).toHaveText('Pencil Pusher');
  expect(errors).toEqual([]);
});

test('eliminating a bot shows a hit marker, adds to the kill feed and raises the shell score',async({page})=>{
  const errors=await open(page);
  await startFrozen(page,{mode:'brawl',map:'quad',primary:'hallpass',seed:5});
  await page.evaluate(()=>{const h=window.__quadClashTest!;h.isolate([3]);});
  await advance(page,0.4);
  await page.evaluate(()=>window.__quadClashTest!.placeBot(3,7));
  for(let i=0;i<4&&(await state(page)).kills===0;i++){await page.keyboard.down('f');await advance(page,0.05);await page.keyboard.up('f');await advance(page,0.35);}
  const s=await state(page);
  expect(s.kills).toBe(1);expect(s.score).toBeGreaterThanOrEqual(100);
  await expect(page.locator('.qc-feed li').first()).toContainText('You');
  await expect(page.locator('#game-score strong')).toHaveText(String(s.score));
  await page.screenshot({path:'tests/games/quad-clash/evidence/chromium.png'});
  expect(errors).toEqual([]);
});

test('falling in battle shows the respawn panel; a new weapon picked there is carried into the next life',async({page})=>{
  const errors=await open(page);
  await startFrozen(page,{mode:'brawl',map:'quad',primary:'bell',seed:8});
  await page.evaluate(()=>window.__quadClashTest!.isolate([2]));
  await advance(page,2.5);
  await page.evaluate(()=>window.__quadClashTest!.hurtYou(500,2));
  await expect(page.locator('.qc-dead')).toBeVisible();
  await expect(page.locator('.qc-dead-by')).toContainText('by ');
  await page.locator('.qc-dead').getByRole('button',{name:/Detention/}).click();
  await expect(page.locator('.qc-dead').getByRole('button',{name:/Detention/})).toHaveAttribute('aria-pressed','true');
  await advance(page,3.2);
  const s=await state(page);
  expect(s.alive).toBe(true);expect(s.deaths).toBe(1);expect(s.weapon).toBe('detention');
  await expect(page.locator('.qc-dead')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a running match is saved: reopening shows Continue, which resumes the same match',async({page})=>{
  const errors=await open(page);
  await startFrozen(page,{mode:'quad',map:'quad',primary:'recess',seed:11});
  await advance(page,3);
  const before=await state(page);
  // Pausing through the shell saves; reload the page to restore from storage.
  // P pauses through the shell (a captured mouse cannot reach the toolbar), which saves the match.
  await page.keyboard.press('p');
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Resume game');
  await page.reload();
  await page.waitForFunction(()=>window.__quadClashTest!==undefined);
  const resume=page.getByRole('button',{name:'Continue',exact:true});
  if(await page.locator('#pause-game').getAttribute('aria-label')==='Resume game')await page.locator('#pause-game').click();
  await expect(resume).toBeVisible();
  const restored=await state(page);
  expect(restored.held).toBe(true);expect(restored.mode).toBe('quad');expect(restored.t).toBeCloseTo(before.t,1);
  await resume.click();
  await expect(page.locator('.qc-continue')).toBeHidden();
  await page.evaluate(()=>window.__quadClashTest!.freeze(true));
  await advance(page,0.5);
  expect((await state(page)).t).toBeGreaterThan(restored.t);
  expect(errors).toEqual([]);
});

test('the match ends at the time limit with a result card; Play again starts a fresh match',async({page})=>{
  const errors=await open(page);
  await startFrozen(page,{mode:'house',map:'quad',seed:4});
  await page.evaluate(()=>{const h=window.__quadClashTest!;h.skip(1000);});
  await advance(page,0.1);
  await expect(page.locator('.qc-over')).toBeVisible();
  await expect(page.locator('.qc-over-title')).toHaveText(/Victory!|Defeat|Draw!/);
  await expect(page.locator('.qc-board tbody tr')).toHaveCount(8);
  await page.getByRole('button',{name:'Play again'}).click();
  const s=await state(page);
  expect(s.phase).toBe('playing');expect(s.t).toBeLessThan(1);expect(s.kills).toBe(0);
  await page.getByRole('button',{name:'Play again'}).waitFor({state:'hidden'});
  expect(errors).toEqual([]);
});

test.describe('on a phone',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  test('touch buttons drive the fighter and the layout fits the width',async({page})=>{
    const errors=await open(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Play',exact:true}).tap();
    await page.evaluate(()=>{const h=window.__quadClashTest!;h.freeze(true);h.isolate();});
    await advance(page,0.5);
    await expect(page.locator('.qc-touch')).toBeVisible();
    for(const name of ['Fire','Jump','Reload','Swap weapon','Throw grenade','Aim down sights'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
    const y0=(await state(page)).y;
    const jump=page.getByRole('button',{name:'Jump',exact:true});
    const box=(await jump.boundingBox())!;
    await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y)!;el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,pointerType:'touch',clientX:x,clientY:y}));},{x:box.x+box.width/2,y:box.y+box.height/2});
    await advance(page,0.15);
    await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y)!;el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,pointerType:'touch',clientX:x,clientY:y}));},{x:box.x+box.width/2,y:box.y+box.height/2});
    expect((await state(page)).y).toBeGreaterThan(y0+0.3);
    await page.getByRole('button',{name:'Swap weapon',exact:true}).tap();
    await advance(page,0.1);
    expect((await state(page)).weapon).toBe('pencil');
    expect(errors).toEqual([]);
  });
});
