import {test,expect,type Page} from '../../fixtures';

/** Nothing is built during play: once the scene reports it has warmed up, a first firefight with a breach must not
 * compile a shader or upload a texture. Frame times are meaningless under a software rasteriser, so this checks the
 * renderer's counts instead (a new program or texture in play is exactly what freezes a real GPU at first contact). */
interface Stats{programs?:number;textures?:number;geometries?:number;ready?:boolean;art?:string}
interface Hook{state():{phase:string;self:number;players:{id:number;squad:number;alive:boolean;x:number;z:number}[];holes:number};start(p?:Record<string,unknown>):void;freeze(on:boolean):void;advance(s:number):void;hold(patch:Record<string,unknown>,seconds:number,once?:Record<string,unknown>|null):void;place(x:number,z:number,yaw?:number,pitch?:number):void;skip(s:number):void;still():void;stats():Stats;draw():void}
type Win={__breachlineTest?:Hook};

const counts=(page:Page)=>page.evaluate(()=>{const h=(window as unknown as Win).__breachlineTest!;for(let i=0;i<3;i++)h.draw();const s=h.stats();return {programs:s.programs,textures:s.textures};});

test.setTimeout(240_000);
// Known failure, owned by the fighters session: their warm() compiles the baked sets' programs but does not upload
// their textures (2048 + 2 x 1024 for level 0), so the first close contact still uploads them. Remove this line when
// it does; the test then has to pass.
test.fail(true,'fighters level-0 textures upload on first contact');
test('a first firefight with a breach compiles no shader and uploads no texture after the warm-up',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?festive=off#/game/breachline');
 await page.waitForFunction(()=>(window as unknown as Win).__breachlineTest!==undefined,undefined,{timeout:60000});
 await page.waitForFunction(()=>(window as unknown as Win).__breachlineTest!.stats().ready===true,undefined,{timeout:180000,polling:500});
 await page.evaluate(()=>{const h=(window as unknown as Win).__breachlineTest!;h.start({seed:7,teamSize:1,bots:true});h.freeze(true);h.advance(0.2);h.still();h.skip(19.9);h.advance(0.3);});
 expect((await page.evaluate(()=>(window as unknown as Win).__breachlineTest!.state())).phase).toBe('action');
 const before=await counts(page);
 // Gunfire into a soft wall, a breach charge, then point-blank fire at an enemy (muzzle flash, tracers, impacts,
 // the enemy fighter at full detail, its flinch and fall).
 await page.evaluate(()=>{const h=(window as unknown as Win).__breachlineTest!;
  h.place(-4.6,0.2,0,-0.05);h.advance(0.1);h.hold({fire:true,mx:1},0.8);h.draw();
  h.place(1.5,-0.6,0,-0.25);h.advance(0.1);h.hold({},1.4,{breach:true});h.draw();
  h.place(1.5,0.55,0,-0.1);h.advance(0.2);h.hold({},0.2,{breach:true});h.advance(9);h.draw();
  const s=h.state(),me=s.players[s.self],foe=s.players.find(p=>p.squad!==me.squad&&p.alive);
  if(foe){h.place(foe.x,foe.z+3,0,-0.05);h.advance(0.1);h.draw();h.hold({fire:true},0.6);h.draw();}
 });
 const s=await page.evaluate(()=>(window as unknown as Win).__breachlineTest!.state());
 expect(s.holes).toBeGreaterThan(2);
 const after=await counts(page);
 expect(after).toEqual(before);
 expect(errors).toEqual([]);
});
