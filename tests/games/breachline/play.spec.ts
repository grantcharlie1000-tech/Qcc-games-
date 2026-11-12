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
  await page.evaluate(()=>window.__breachlineTest!.place(-1,2,Math.PI,0));
  await expect(page.locator('.bl-marker[data-kind="device"]')).toBeVisible();
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.skip(39.5);h.advance(0.8);});
  s=await state(page);
  expect(s.phase).toBe('end');expect(s.wins).toEqual([1,0]);
  await expect(page.locator('.bl-banner')).toContainText('Round won');
  await expect(page.locator('.bl-marker[data-kind="device"]:visible')).toHaveCount(0);
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.skip(6.9);h.advance(0.4);});
  s=await state(page);
  expect(s.phase).toBe('prep');expect(s.round).toBe(2);expect(s.me!.hp).toBe(100);expect(s.holes).toBe(0);
  expect(errors).toEqual([]);
});

test('under the round-end banner there is no "Go", no objective prompt and no uplink marker',async({page})=>{
  const errors=await open(page);
  await action(page);
  await expect(page.locator('.bl-toast')).toHaveAttribute('data-on','true');
  await expect(page.locator('.bl-toast')).toContainText('Go');
  // The clock runs out at once (no frames between), so the round's "Go" would still be up.
  await page.evaluate(()=>{const h=window.__breachlineTest!;h.skip(999);h.advance(0.3);h.draw();});
  expect((await state(page)).phase).toBe('end');
  await expect(page.locator('.bl-banner')).toContainText('Round lost');
  await expect(page.locator('.bl-toast')).toHaveAttribute('data-on','false');
  await expect(page.locator('.bl-prompt')).toBeHidden();
  await expect(page.locator('.bl-marker[data-kind="device"]:visible, .bl-marker[data-kind="site"]:visible')).toHaveCount(0);
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
  // ...and loads the light art tier.
  if((await readout.innerText()).includes('software')){await expect(readout).toContainText('auto: lowest (software)');await expect(readout).toContainText('art light');}
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

test('room culling draws less in a room than with it off',async({page})=>{
  test.setTimeout(300_000);
  const calls=async(extra:string)=>{
    await page.goto(`/?festive=off${extra}#/game/breachline`);
    await page.waitForFunction(()=>window.__breachlineTest!==undefined,undefined,{timeout:60000});
    await action(page,{seed:7});
    await page.waitForFunction(()=>window.__breachlineTest!.stats().ready,undefined,{timeout:240_000,polling:500});
    // In the Lab, facing its north wall: the rooms behind the other walls are out of sight.
    return page.evaluate(()=>{const h=window.__breachlineTest!;h.place(-1,-4,0,0);h.draw();h.draw();return h.stats().calls;});
  };
  const off=await calls('&cull=off'),on=await calls('');
  expect(on).toBeLessThan(off*0.8);
});

test('room culling: an intact wall hides the room behind it, and a hole shows it in the same frame',async({page})=>{
  test.setTimeout(300_000);
  const errors=watch(page);
  await page.goto('/?festive=off&artdbg=world#/game/breachline');
  await page.waitForFunction(()=>window.__breachlineTest!==undefined,undefined,{timeout:60000});
  await action(page,{seed:7});
  await page.waitForFunction(()=>window.__breachlineTest!.stats().ready,undefined,{timeout:240_000,polling:500});
  // Whether the camera draws the Lab (REGIONS[0], layer 1).
  const drawn=(x:number,z:number,yaw:number,fire=0)=>page.evaluate(([x,z,yaw,fire])=>{
    const h=window.__breachlineTest!;h.place(x,z,yaw,0);
    if(fire)h.hold({fire:true,yaw,pitch:0},fire);else h.draw();
    const mask=(window as unknown as {__blScenes:{camera():{layers:{mask:number}}}}).__blScenes.camera().layers.mask;
    return {lab:!!(mask&(1<<1)),holes:h.state().holes};
  },[x,z,yaw,fire] as const);
  // In the corridor facing the Lab's partition, no doorway in view: the Lab is not drawn until the wall is shot through.
  const before=await drawn(-4.5,-0.6,0);
  expect(before.lab).toBe(false);
  const after=await drawn(-4.5,-0.6,0,1.5);
  expect(after.holes).toBeGreaterThan(0);
  expect(after.lab).toBe(true);
  expect(errors).toEqual([]);
});

test('what changes in a match is drawn where it is now: a wrecked set piece, and what falls from a shot wall',async({page})=>{
  test.setTimeout(300_000);
  const errors=watch(page);
  await page.goto('/?festive=off&artdbg=world#/game/breachline');
  await page.waitForFunction(()=>window.__breachlineTest!==undefined,undefined,{timeout:60000});
  await action(page,{seed:7});
  await page.waitForFunction(()=>window.__breachlineTest!.stats().ready,undefined,{timeout:240_000,polling:500});
  const r=await page.evaluate(()=>{
    type O={visible:boolean;parent:O|null;children:O[];matrix:{elements:number[];compose(p:unknown,q:unknown,s:unknown):{elements:number[]}};matrixWorld:{elements:number[]};matrixAutoUpdate:boolean;position:unknown;quaternion:unknown;scale:unknown;isMesh?:boolean;geometry?:{boundingBox:unknown;computeBoundingBox():void}};
    const w=window as unknown as {__blScenes:{scene:O;artScene:O};__blPieces:{hit(i:number):void;states():number[]};__blPieceDefs:{x0:number;z0:number;x1:number;z1:number;family:string}[];__blFx:{chunk:{rest:boolean;stay:boolean}[];chunks:{getMatrixAt(i:number,m:unknown):void}}};
    const h=window.__breachlineTest!,S=w.__blScenes;
    const all=(root:O,out:O[]=[])=>{out.push(root);for(const c of root.children)all(c,out);return out;};
    // A shelving rack: hit until wrecked; its standing models go and its wrecked ones come.
    const i=w.__blPieceDefs.findIndex(p=>p.family==='shelving'),def=w.__blPieceDefs[i];
    const art=all(S.artScene),shown=new Map(art.map(o=>[o,o.visible]));
    for(let k=0;k<200&&w.__blPieces.states()[i]!==2;k++)w.__blPieces.hit(i);
    const came=art.filter(o=>o.visible&&!shown.get(o));
    // A wall shot through from the corridor: pieces of it come down.
    h.place(-4.6,0.2,0,-0.05);h.advance(0.1);h.hold({fire:true,mx:1},1.2);
    for(let k=0;k<200;k++)h.draw();  // effects move only as frames are drawn (60 a second)
    // Every object is drawn at the place its own position, turn and size (and its parents') give, frozen or not.
    let worst=0;
    const M=(S.scene as unknown as {matrix:{constructor:new()=>O['matrix']}}).matrix.constructor;
    const check=(o:O,parent:number[]|null)=>{
      const m=o.matrixAutoUpdate?new M().compose(o.position,o.quaternion,o.scale):o.matrix,e=m.elements,want=new Array(16).fill(0);
      if(parent)for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)want[c*4+r]+=parent[k*4+r]*e[c*4+k];else want.splice(0,16,...e);
      for(let k=0;k<16;k++)worst=Math.max(worst,Math.abs(want[k]-o.matrixWorld.elements[k]));
      for(const c of o.children)check(c,want);
    };
    check(S.scene,null);check(S.artScene,null);
    // The wrecked models stand in the piece's footprint.
    const inside=came.every(o=>{const mesh=all(o).find(c=>c.isMesh);if(!mesh)return false;const g=mesh.geometry!;if(!g.boundingBox)g.computeBoundingBox();const b=g.boundingBox! as unknown as {min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}},e=mesh.matrixWorld.elements,cx=(b.min.x+b.max.x)/2,cy=(b.min.y+b.max.y)/2,cz=(b.min.z+b.max.z)/2,x=e[0]*cx+e[4]*cy+e[8]*cz+e[12],z=e[2]*cx+e[6]*cy+e[10]*cz+e[14];return Math.abs(x-(def.x0+def.x1)/2)<1.5&&Math.abs(z-(def.z0+def.z1)/2)<1.5;});
    // What fell from the wall lies on the floor near it.
    const m=new M(),down:number[]=[];
    w.__blFx.chunk.forEach((c,k)=>{if(!c.rest||!c.stay)return;w.__blFx.chunks.getMatrixAt(k,m);const e=m.elements;if(Math.abs(e[12]+4.6)<2.5&&e[14]<1&&e[14]>-2.5)down.push(e[13]);});
    return {state:w.__blPieces.states()[i],came:came.length,inside,worst,down:down.length,high:Math.max(0,...down),holes:h.state().holes};
  });
  expect(r.state).toBe(2);
  expect(r.came).toBeGreaterThan(0);
  expect(r.inside).toBe(true);
  expect(r.worst).toBeLessThan(1e-4);
  expect(r.holes).toBeGreaterThan(3);
  expect(r.down).toBeGreaterThan(0);
  expect(r.high).toBeLessThan(0.3);
  expect(errors).toEqual([]);
});
