import {describe,expect,test} from 'vitest';
import {AIR,B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {SNAPSHOT_VERSION} from '../../../src/games/blockcraft/engine/game';
import {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import {CHUNK_VOLUME,LAYER} from '../../../src/games/blockcraft/engine/constants';
import {BLOCKCRAFT_ONLINE_VERSION,packState,unpackState,validFlat,parseSelf} from '../../../src/games/blockcraft/net/protocol';
import {checkEdits,plausibleChange,RateLimit} from '../../../src/games/blockcraft/net/validate';
import {applyDelta} from '../../../src/games/blockcraft/net/host';
import {slotsAfterFirstSnapshot} from '../../../src/games/blockcraft/net/guest';
import {localView,playersOf,nearestPlayer} from '../../../src/games/blockcraft/engine/players';
import type {PlayerView} from '../../../src/games/blockcraft/engine/contracts';
import {harness,walker} from './entities-helpers';

const view=(x:number,y:number,z:number,extra:Partial<PlayerView>={}):PlayerView=>({id:'g',name:'G',local:false,x,y,z,yaw:0,width:.6,height:1.8,eyeHeight:1.62,
  inWater:false,sneaking:false,dead:false,targetable:true,damage:a=>a,push:()=>{},give:()=>0,canTake:()=>true,addXp:()=>{},ignite:()=>{},addEffect:()=>{},teleport:()=>{},...extra});
function flatWorld(){
  const w=new VoxelWorld();
  for(let cz=-1;cz<=1;cz++)for(let cx=-1;cx<=1;cx++){const blocks=new Uint8Array(CHUNK_VOLUME);blocks.fill(B.stone,0,60*LAYER);w.insert(cx,cz,{blocks,biomes:new Uint8Array(LAYER)});}
  return w;
}

describe('online protocol',()=>{
  test('the version names the save format the engine writes',()=>{
    expect(BLOCKCRAFT_ONLINE_VERSION).toContain(`save${SNAPSHOT_VERSION}`);
    expect(BLOCKCRAFT_ONLINE_VERSION).toMatch(/gen\d+/);
  });
  test('entity states round-trip compactly and malformed ones are refused',()=>{
    const s={x:12.345,y:61.5,z:-3.211,yaw:1.2345,headYaw:-.5,pitch:.25,health:7.5,hurtTime:4,deathTime:0,fire:3,baby:true,onGround:true};
    const back=unpackState(JSON.parse(JSON.stringify(packState(42,s))))!;
    expect(back.id).toBe(42);
    expect(back.state.x).toBeCloseTo(12.35,2);expect(back.state.health).toBe(7.5);expect(back.state.baby).toBe(true);expect(back.state.fire).toBeGreaterThan(0);
    expect(unpackState([1,2,3])).toBeNull();
    expect(unpackState([1,'x',0,0,0,0,0,0,0,0,0])).toBeNull();
  });
  test('edit lists and self reports are bounds-checked',()=>{
    expect(validFlat([0,60,0,1,0],5,10)).toBe(true);
    expect(validFlat([0,999,0,1,0],5,10)).toBe(false);
    expect(validFlat([0,60,0,1],5,10)).toBe(false);
    expect(parseSelf({x:1,y:60,z:1,yaw:0,pitch:0,health:20})).toMatchObject({x:1,empty:0,partial:[]});
    expect(parseSelf({x:Infinity,y:60,z:1,yaw:0,pitch:0,health:20})).toBeNull();
  });
});

describe('host edit validation',()=>{
  const stone=B.stone,glass=blockId('glass');
  test('a survival player breaks breakable blocks and places what it holds',()=>{
    expect(plausibleChange(stone,AIR,null,'survival')).toBeNull();
    expect(plausibleChange(B.bedrock,AIR,null,'survival')).toBe('unbreakable');
    expect(plausibleChange(B.bedrock,AIR,null,'creative')).toBeNull();
    expect(plausibleChange(AIR,glass,{id:'glass',count:1},'survival')).toBeNull();
    expect(plausibleChange(AIR,glass,{id:'dirt',count:1},'survival')).toBe('not-allowed');
    expect(plausibleChange(AIR,B.water,{id:'water_bucket',count:1},'survival')).toBeNull();
    expect(plausibleChange(AIR,B.water,null,'survival')).toBe('not-allowed');
  });
  test('stale, far, unloaded and occupied edits are refused; the first of simultaneous edits wins',()=>{
    const w=flatWorld(),me=view(.5,60,.5),other=view(3.5,60,.5,{id:'o'});
    const ctx={world:w,player:me,held:{id:'glass',count:1},mode:'survival' as const,players:[me,other]};
    expect(checkEdits([1,60,1,AIR,glass],ctx)).toBeNull();
    w.set(1,60,1,stone);
    // Someone else put stone there first: the guest's view (air) is out of date.
    expect(checkEdits([1,60,1,AIR,glass],ctx)).toBe('conflict');
    expect(checkEdits([30,60,0,AIR,glass],ctx)).toBe('reach');
    expect(checkEdits([100,60,0,AIR,glass],ctx)).toBe('unloaded');
    expect(checkEdits([3,60,0,AIR,glass],ctx)).toBe('occupied');
  });
  test('one action cannot mine the same cell repeatedly or turn blocks into anything',()=>{
    const w=flatWorld(),me=view(.5,60,.5),ctx={world:w,player:me,held:null,mode:'survival' as const,players:[me]};
    // stone → air, stone → stone, stone → air on one cell would drop loot twice.
    expect(checkEdits([1,59,1,stone,AIR,1,59,1,stone,stone,1,59,1,stone,AIR],ctx)).toBe('not-allowed');
    expect(plausibleChange(B.dirt,blockId('diamond_block'),{id:'bone_meal',count:1},'survival')).toBe('not-allowed');
    expect(plausibleChange(B.dirt,blockId('diamond_block'),{id:'iron_hoe',count:1},'survival')).toBe('not-allowed');
    expect(plausibleChange(AIR,blockId('oak_log'),{id:'bone_meal',count:1},'survival')).toBeNull();
  });
  test('the rate limit refills over time',()=>{
    const r=new RateLimit(10,20,0);
    expect(r.take(20,0)).toBe(true);expect(r.take(1,0)).toBe(false);expect(r.take(5,600)).toBe(true);
  });
});

describe('container snapshot versus a take that already happened',()=>{
  const diamond=JSON.stringify({id:'diamond',count:3});
  const empty=JSON.stringify(null);
  test('a take made after open and before the host snapshot is kept, and the snapshot stays the before-value',()=>{
    const opened=new Map<number,string>([[0,diamond]]);
    const localBefore=new Map<number,string>([[0,empty]]);
    const host=new Map<number,string>([[0,diamond]]);
    const next=slotsAfterFirstSnapshot(opened,localBefore,host);
    expect(next.synced.get(0)).toBe(diamond);
    expect(next.local.get(0)).toBe(empty);
  });
  test('an untouched slot keeps the host snapshot',()=>{
    const opened=new Map<number,string>([[0,diamond]]);
    const next=slotsAfterFirstSnapshot(opened,opened,new Map([[0,diamond]]));
    expect(next.local.get(0)).toBe(diamond);
    expect(next.synced.get(0)).toBe(diamond);
  });
});

describe('container slot deltas',()=>{
  const iron=(n:number)=>({id:'iron_ingot',count:n});
  test('a matching before applies the after',()=>{expect(applyDelta(iron(3),iron(3),null)).toBeNull();});
  test('taking from a furnace that smelted meanwhile leaves the newer items',()=>{expect(applyDelta(iron(5),iron(3),null)).toEqual(iron(2));});
  test('adding fuel the host already partly used keeps the difference',()=>{expect(applyDelta({id:'coal',count:2},{id:'coal',count:3},{id:'coal',count:10})).toEqual({id:'coal',count:9});});
  test('a slot that changed to another item is refused',()=>{expect(applyDelta({id:'coal',count:1},iron(3),null)).toBeUndefined();});
});

describe('remote world edits',()=>{
  test('an edit for a chunk not generated yet waits and applies when it loads',()=>{
    const w=new VoxelWorld();
    expect(w.applyRemote(20,61,3,B.stone)).toBe(true);
    const blocks=new Uint8Array(CHUNK_VOLUME);w.insert(1,0,{blocks,biomes:new Uint8Array(LAYER)});
    expect(w.get(20,61,3)).toBe(B.stone);
    // Loaded chunks change at once.
    expect(w.applyRemote(20,61,3,AIR)).toBe(true);expect(w.get(20,61,3)).toBe(AIR);
  });
});

describe('player views',()=>{
  test('offline there is exactly the local player',()=>{
    const h=harness();
    expect(playersOf(h.game)).toEqual([localView(h.game)]);
    expect(nearestPlayer(h.game,0,60,0)?.local).toBe(true);
  });
});

describe('guest entity mirror',()=>{
  test('copies host entities by id, forwards local spawns, drops and hits, and never simulates',()=>{
    const h=harness({kinds:[walker()]}),mirror=h.game.entities.mirror!;
    const sent:{t:string;[k:string]:unknown}[]=[];
    mirror.start({spawned:e=>sent.push({t:'spawn',kind:e.kind,vx:e.vx}),dropItem:s=>sent.push({t:'drop',id:s.id}),dropXp:p=>sent.push({t:'xp',p}),
      damage:(e,a)=>{sent.push({t:'hit',id:e.id,a});return true;}});
    const state={x:3.5,y:60,z:.5,yaw:0,headYaw:0,pitch:0,health:20,hurtTime:0,deathTime:0,fire:0,baby:false,onGround:true};
    const copy=mirror.upsert(77,'walker',state,{tag:1})!;
    expect(copy.id).toBe(77);expect(h.game.entities.byId(77)?.data).toEqual({tag:1});
    // Ticking the service does not run AI or physics for copies.
    const x=copy.x;copy.moveX=5;h.tick(5);expect(copy.x).toBe(x);
    // A local spawn (a thrown projectile) exists for one tick, then goes to the host with its velocity.
    const ghost=h.game.entities.spawn('walker',0,60,0)!;ghost.vx=9;
    expect(ghost.id).toBeLessThan(0);
    mirror.tick(()=>{});
    expect(sent).toContainEqual({t:'spawn',kind:'walker',vx:9});expect(ghost.removed).toBe(true);
    h.game.entities.dropItem({id:'dirt',count:2},0,60,0);h.game.entities.dropXp(5,0,60,0);
    expect(h.game.entities.damage(copy,4,{kind:'player',byPlayer:true})).toBe(true);
    expect(copy.health).toBe(20);
    expect(sent.map(s=>s.t)).toEqual(['spawn','drop','xp','hit']);
    // Host states move the copy.
    mirror.tick(e=>{if(e.id===77)e.x=5;});
    expect(copy.x).toBe(5);
    mirror.remove(77);mirror.tick(()=>{});expect(h.game.entities.byId(77)).toBeUndefined();
    mirror.stop();expect(mirror.active).toBe(false);
  });
});
