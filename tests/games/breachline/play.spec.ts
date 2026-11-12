import {test,expect,type Page} from '../../fixtures';

interface Me{x:number;z:number;yaw:number;pitch:number;hp:number;alive:boolean;squad:number;role:number;kit:number;mag:number[];charges:number;grenades:number;reinforcements:number;act:number;kills:number;score:number}
interface HookState{phase:string;t:number;round:number;wins:number[];attackers:number;self:number;watch:number;online:boolean;host:boolean;shown:string|null;paused:boolean;held:boolean;me:Me|null;players:{id:number;name:string;squad:number;bot:boolean;alive:boolean;hp:number;x:number;z:number}[];holes:number;reinforced:number;device:unknown}
interface Hook{state():HookState;start(p?:Record<string,unknown>):void;freeze(on:boolean):void;advance(s:number):void;look(y:number,p:number):void;hold(patch:Record<string,unknown>,seconds:number,once?:Record<string,unknown>|null):void;place(x:number,z:number,yaw?:number,pitch?:number):void;skip(s:number):void;still():void;stats():{calls:number;triangles:number;scale:number;level:number;programs?:number;ready?:boolean};frames():number;draw():void}
declare global{interface Window{__breachlineTest?:Hook}}

// A static build has no server functions, so the site's chat summary request 404s there (the dev server answers it with
// index.html). That one URL is ignored; any other failed load is still an error.
const CHAT_SUMMARY='/.netlify/functions/chat?action=summary';
const chatOnly=(url:string)=>{try{const u=new URL(url);return u.pathname+u.search===CHAT_SUMMARY;}catch{return false;}};
function watch(page:Page){const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!chatOnly(m.location().url))errors.push(m.text());});return errors;}
async function open(page:Page){
  const errors=watch(page);
  await page.goto('/?festive=off#/game/breachline');
  await page.waitForFunction(()=>window.__breachlineTest!==undefined,undefined,{timeout:60000});
  await expect(page.locator('.breachline')).toHaveAttribute('data-layer','menu');
  return errors;
}
const state=(page:Page)=>page.evaluate(()=>window.__breachlineTest!.state());
/** Starts a frozen match (the test steps time itself), parks the bots and opens the action phase. */
async function action(page:Page,p:Record<string,unknown>={seed:7}){
  await page.evaluate(v=>{const h=window.__breachlineTest!;h.start(v);h.freeze(true);h.advance(0.2);h.still();h.skip(19.9);h.advance(0.2);},p);
  expect((await state(page)).phase).toBe('action');
}
test.setTimeout(120_000);

test('the lobby lists both squads, follows the settings, and Play starts a round that draws',async({page})=>{
  const errors=await open(page);
  await expect(page.locator('.bl-squad-list li')).toHaveCount(10);
  await expect(page.locator('.bl-squad-list[data-squad="0"] li').first()).toContainText('(you)');
  await page.locator('.bl-size').selectOption('3');
  await expect(page.locator('.bl-squad-list li')).toHaveCount(6);
  await page.locator('.bl-skill').selectOption('off');
  await expect(page.locator('.bl-squad-list li')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
  await expect(page.locator('.bl-note')).toContainText('Both squads need');
  await page.locator('.bl-skill').selectOption('veteran');
  await page.getByRole('button',{name:'Switch squad'}).click();
  await expect(page.locator('.bl-squad-list[data-squad="1"] li').first()).toContainText('(you)');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  const root=page.locator('.breachline');
  await expect(root).toHaveAttribute('data-phase','prep');
  await expect(root).toHaveAttribute('data-layer','');
  const s=await state(page);
  expect(s.players).toHaveLength(6);expect(s.me?.squad).toBe(1);expect(s.me?.role).toBe(1);expect(s.round).toBe(1);
  await expect(page.locator('.bl-prep')).toBeVisible();
  await expect(page.locator('.bl-prep-role')).toContainText('Defenders');
  await expect(page.locator('.bl-kits button')).toHaveCount(3);
  await expect(page.locator('#game-level')).toContainText('Round 1');
  const stats=await page.evaluate(()=>window.__breachlineTest!.stats());
  expect(stats.calls).toBeGreaterThan(20);expect(stats.triangles).toBeGreaterThan(20000);
  expect(errors).toEqual([]);
});

test('a kit is chosen during preparation with the number keys',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.start({seed:7});h.freeze(true);h.advance(0.2);});
  await page.locator('.bl-canvas').focus();
  await page.keyboard.press('Digit1');
  await page.evaluate(()=>window.__breachlineTest!.advance(0.1));
  let s=await state(page);
  expect(s.me?.kit).toBe(0);expect(s.me?.charges).toBe(3);
  await expect(page.locator('.bl-kits button').nth(0)).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.bl-gun')).toHaveText('Halden 12');
  await page.keyboard.press('Digit3');
  await page.evaluate(()=>window.__breachlineTest!.advance(0.1));
  s=await state(page);
  expect(s.me?.kit).toBe(2);
  await expect(page.locator('.bl-gun')).toHaveText('Corvin DMR');
  expect(errors).toEqual([]);
});

test('gunfire chews holes in a soft wall, a breach charge opens it, and the HUD keeps up',async({page})=>{
  const errors=await open(page);
  await action(page);
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.place(-4.6,0.2,0,-0.05);h.advance(0.1);h.hold({fire:true,mx:1},0.8);});
  let s=await state(page);
  expect(s.holes).toBeGreaterThan(3);expect(s.me!.mag[0]).toBeLessThan(30);
  await expect(page.locator('.bl-ammo b')).toHaveText(String(s.me!.mag[0]));
  const before=s.holes;
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.place(1.5,-0.6,0,-0.25);h.advance(0.1);h.draw();});
  await page.evaluate(()=>new Promise(r=>setTimeout(r,150)));
  await page.evaluate(()=>window.__breachlineTest!.draw());
  await expect(page.locator('.bl-prompt-text')).toContainText('place a breach charge');
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.hold({},1.4,{breach:true});});
  expect((await state(page)).me!.charges).toBe(0);
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.place(1.5,0.55,0,-0.1);h.advance(0.2);h.hold({},0.2,{breach:true});});
  s=await state(page);
  expect(s.holes).toBeGreaterThan(before+40);
  // Walk through the new doorway into the Lab.
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.place(1.2,-0.8,0,0);h.hold({mz:1},1.2);});
  s=await state(page);
  expect(s.me!.z).toBeLessThan(-2.6);
  await expect(page.locator('.bl-room')).toHaveText('Lab');
  await expect(page.locator('.bl-prompt-text')).toContainText('plant the uplink');
  expect(errors).toEqual([]);
});

test('planting arms the uplink and holding it wins the round; the match goes on to the next',async({page})=>{
  const errors=await open(page);
  await action(page);
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.place(-1,-4,0,0);h.hold({use:true},5.3);});
  let s=await state(page);
  expect(s.phase).toBe('planted');expect(s.device).not.toBeNull();
  await expect(page.locator('.bl-objective')).toContainText('Uplink armed in Lab (A)');
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.skip(39.5);h.advance(0.8);});
  s=await state(page);
  expect(s.phase).toBe('end');expect(s.wins).toEqual([1,0]);
  await expect(page.locator('.bl-banner')).toContainText('Round won');
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.skip(6.9);h.advance(0.4);});
  s=await state(page);
  expect(s.phase).toBe('prep');expect(s.round).toBe(2);expect(s.me!.hp).toBe(100);expect(s.holes).toBe(0);
  expect(errors).toEqual([]);
});

test('bots fight a whole match to a result and the result card offers another',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.start({seed:3,teamSize:3,skill:'regular'});h.freeze(true);});
  // Step the match in chunks; the local fighter stands still at spawn.
  for(let i=0;i<70&&(await state(page)).phase!=='over';i++)await page.evaluate(()=>window.__breachlineTest!.advance(20));
  const s=await state(page);
  expect(s.phase).toBe('over');expect(Math.max(...s.wins)).toBe(4);
  await expect(page.locator('.breachline')).toHaveAttribute('data-layer','over');
  await expect(page.locator('.bl-over-title')).toHaveText(/Victory|Defeat/);
  await expect(page.locator('.bl-board tbody tr')).toHaveCount(6);
  await page.getByRole('button',{name:'Play again'}).click();
  await expect(page.locator('.breachline')).toHaveAttribute('data-phase','prep');
  expect((await state(page)).wins).toEqual([0,0]);
  expect(errors).toEqual([]);
});

test('P pauses a solo match through the shell and time stands still',async({page})=>{
  const errors=await open(page);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.breachline')).toHaveAttribute('data-phase','prep');
  await page.waitForFunction(()=>window.__breachlineTest!.state().t<19.5);
  await page.locator('.bl-canvas').focus();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.__breachlineTest!.state().paused);
  const t=(await state(page)).t;
  await page.evaluate(()=>new Promise(r=>setTimeout(r,500)));
  expect((await state(page)).t).toBe(t);
  expect(errors).toEqual([]);
});

test('nothing reads the game canvas back during a live match',async({page})=>{
  // Every drawImage whose source is the game's WebGL canvas, and every getImageData after one, is counted.
  await page.addInitScript(()=>{
    const w=window as unknown as {__readbacks:number};w.__readbacks=0;
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(this:CanvasRenderingContext2D,...a:unknown[]){
      if(a[0] instanceof HTMLCanvasElement&&a[0].closest('.breachline'))w.__readbacks++;
      return (draw as (...b:unknown[])=>void).apply(this,a);
    } as typeof draw;
  });
  const errors=await open(page);
  await action(page);
  await page.evaluate(()=>window.__breachlineTest!.freeze(false));
  await page.waitForTimeout(10_000);
  expect((await state(page)).phase).not.toBe('lobby');
  expect(await page.evaluate(()=>(window as unknown as {__readbacks:number}).__readbacks)).toBe(0);
  expect(errors).toEqual([]);
});

test('?perf=1 shows the performance readout in a match, Auto drops to its lowest step on software WebGL, and F3 hides it',async({page})=>{
  const errors=watch(page);
  await page.goto('/?festive=off&perf=1#/game/breachline');
  await page.waitForFunction(()=>window.__breachlineTest!==undefined,undefined,{timeout:60000});
  await action(page);
  await page.evaluate(()=>window.__breachlineTest!.freeze(false));
  const readout=page.locator('.bl-perf');
  await expect(readout).toContainText(/\d+ fps/,{timeout:15_000});
  await expect(readout).toContainText('draws');
  // On a software rasteriser (as in CI) Auto sits on its lowest step and says so.
  if((await readout.innerText()).includes('software'))await expect(readout).toContainText('auto: lowest (software)');
  await page.keyboard.press('F3');
  await expect(readout).toBeHidden();
  expect(errors).toEqual([]);
});

test('switching to Performance (the cheap shading path) compiles no shader after the warm-up',async({page})=>{
  test.setTimeout(300_000);
  const errors=await open(page);
  await action(page,{seed:7,quality:'high'});
  await page.waitForFunction(()=>window.__breachlineTest!.stats().ready,undefined,{timeout:240_000,polling:500});
  const draw=()=>page.evaluate(()=>{const h=window.__breachlineTest!;for(let i=0;i<3;i++)h.draw();return h.stats().programs;});
  const before=await draw();
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.start({quality:'low'});h.freeze(true);h.advance(0.2);h.still();h.skip(19.9);h.advance(0.2);});
  expect(await draw()).toBe(before);
  expect(errors).toEqual([]);
});
