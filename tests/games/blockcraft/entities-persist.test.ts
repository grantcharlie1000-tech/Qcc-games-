import {describe,expect,test} from 'vitest';
import {stack,type ItemStack} from '../../../src/games/blockcraft/data/items';
import {MAX_SAVED} from '../../../src/games/blockcraft/entity/entities';
import type {SpawnReason} from '../../../src/games/blockcraft/engine/contracts';
import {harness,monster,walker} from './entities-helpers';

const sheep=(reasons:SpawnReason[]=[])=>walker({kind:'sheep',init:(e,_g,reason)=>{reasons.push(reason);if(typeof e.data.colour!=='number')e.data.colour=0;},
  restoreData:d=>Number.isInteger(d.colour)&&(d.colour as number)>=0&&(d.colour as number)<16?{colour:d.colour}:null});
const roundTrip=(v:unknown)=>JSON.parse(JSON.stringify(v));

describe('persistence',()=>{
  test('retains dropped items above the terrain during creative flight',()=>{
    const a=harness();a.game.entities.dropItem(stack('diamond',1),.5,210,.5);
    const saved=roundTrip(a.game.entities.serialize?.());
    const b=harness();b.game.entities.restore?.(saved);
    expect(b.game.entities.all()).toHaveLength(1);
    expect(b.game.entities.all()[0]).toMatchObject({kind:'item',y:210,data:{stack:{id:'diamond',count:1}}});
  });

  test('round trip keeps animals and items; hostiles and persist:false kinds are not saved',()=>{
    const a=harness({kinds:[sheep(),monster(),walker({kind:'arrowish',category:'projectile',persist:false})]});
    const s=a.game.entities.spawn('sheep',3.25,60,4.75,{data:{colour:5},baby:true,yaw:1.25})!;
    a.game.entities.spawn('monster',6.5,60,.5);a.game.entities.spawn('arrowish',1,62,1);
    a.game.entities.dropItem(stack('iron_pickaxe',1,17),8.5,60.2,8.5,{x:0,y:0,z:0},30);
    a.tick(5);a.game.entities.damage(s,3,{kind:'mob'});
    const saved=roundTrip(a.game.entities.serialize?.());
    expect(JSON.stringify(saved).length).toBeLessThan(2000);
    const reasons:SpawnReason[]=[];
    const b=harness({kinds:[sheep(reasons),monster(),walker({kind:'arrowish',category:'projectile',persist:false})]});
    b.game.entities.restore?.(saved);
    const list=b.game.entities.all();
    expect(list.map(e=>e.kind).sort()).toEqual(['item','sheep']);
    const r=list.find(e=>e.kind==='sheep')!;
    expect(r).toMatchObject({id:s.id,baby:true,health:17,data:{colour:5}});
    expect(r.x).toBeCloseTo(s.x,3);expect(r.z).toBeCloseTo(s.z,3);expect(r.yaw).toBeCloseTo(s.yaw,3);expect(r.age).toBe(s.age);
    expect(reasons).toEqual(['restore']);
    const item=list.find(e=>e.kind==='item')!;
    expect(item.data.stack).toEqual(stack('iron_pickaxe',1,17));expect(item.data.pickup).toBe(25);
    // New ids continue after restored ones.
    const maxId=Math.max(...list.map(e=>e.id));
    expect(b.game.entities.spawn('sheep',0,60,0)!.id).toBeGreaterThan(maxId);
  });
  test('at most 200 entities are saved, nearest to the player first',()=>{
    const h=harness({kinds:[walker()],r:4});
    for(let i=0;i<250;i++)h.game.entities.spawn('walker',.5+(i%50)-25,60,.5+Math.floor(i/50)*8-20);
    const saved=h.game.entities.serialize?.() as {list:{x:number;z:number}[]};
    expect(saved.list).toHaveLength(MAX_SAVED);
    const p=h.game.player.state,d=(e:{x:number;z:number})=>Math.hypot(e.x-p.x,e.z-p.z);
    const kept=Math.max(...saved.list.map(d)),all=h.game.entities.all().map(d).sort((a,b)=>a-b);
    expect(kept).toBeLessThanOrEqual(all[MAX_SAVED-1]+1e-6);
  });
  test('the player\'s own animals (tamed wolves) are saved first however far away, and restore before the cut',()=>{
    const h=harness({kinds:[walker()],r:4});
    const pet=h.game.entities.spawn('walker',60.5,60,60.5,{data:{owner:'player',sitting:true}})!;
    const wild=h.game.entities.spawn('walker',59.5,60,60.5,{data:{owner:'mob'}})!;
    for(let i=0;i<250;i++)h.game.entities.spawn('walker',.5+(i%50)-25,60,.5+Math.floor(i/50)*8-20);
    const saved=roundTrip(h.game.entities.serialize?.()) as {list:{i:number;d:Record<string,unknown>}[]};
    expect(saved.list).toHaveLength(MAX_SAVED);
    expect(saved.list[0]).toMatchObject({i:pet.id,d:{owner:'player',sitting:true}});
    expect(saved.list.some(r=>r.i===wild.id)).toBe(false);
    const b=harness({kinds:[walker()],r:4});
    b.game.entities.restore?.({...saved,list:[...saved.list,...saved.list.slice(1,60)]});
    expect(b.game.entities.all()).toHaveLength(MAX_SAVED);expect(b.game.entities.byId(pet.id)?.data.owner).toBe('player');
  });
  test('invalid saves are ignored without throwing',()=>{
    const h=harness({kinds:[sheep()]});
    const bad:unknown[]=[null,5,'x',[],{v:2,list:[]},{v:1,list:'x'},{v:1,list:[null,1,'a',
      {k:'nope',x:0,y:60,z:0},{k:'sheep',x:NaN,y:60,z:0},{k:'sheep',x:0,y:1e9,z:0},{k:'sheep',x:'1',y:60,z:0},
      {k:'sheep',x:0,y:60,z:0,d:{colour:99}},
      {k:'item',x:0,y:60,z:0,d:{stack:{id:'nope',count:1}}},{k:'item',x:0,y:60,z:0,d:{stack:{id:'stone',count:999}}},
      {k:'xp_orb',x:0,y:60,z:0,d:{points:0}}]}];
    for(const v of bad)expect(()=>h.game.entities.restore?.(v)).not.toThrow();
    expect(h.game.entities.all()).toHaveLength(0);
  });
  test('restored fields are clamped and data is sanitised before restoreData',()=>{
    let got:Record<string,unknown>|null=null;
    const h=harness({kinds:[walker({restoreData:d=>{got=d;return d;}})]});
    const evil=JSON.parse('{"__proto__":{"polluted":1},"ok":2,"deep":[1,{"a":"b"}]}');
    h.game.entities.restore?.({v:1,list:[{k:'walker',i:-5,x:1.5,y:60,z:1.5,vx:1e9,vy:'x',vz:2,yw:1e30,h:500,a:-4,f:1e9,b:7,d:evil}]});
    const e=h.game.entities.all()[0];
    expect(e).toBeDefined();
    expect(e).toMatchObject({health:20,age:0,fire:0,baby:false,vx:0,vy:0,vz:2,yaw:0});
    expect(e.id).toBeGreaterThan(0);
    expect(got).toEqual({ok:2,deep:[1,{a:'b'}]});expect(({} as Record<string,unknown>).polluted).toBeUndefined();
  });
  test('stacks on restored items are validated',()=>{
    const h=harness();
    h.game.entities.restore?.({v:1,list:[{k:'item',x:0,y:60,z:0,d:{stack:{id:'stick',count:3},pickup:5}}]});
    const e=h.game.entities.all()[0];expect((e.data.stack as ItemStack).count).toBe(3);expect(e.data.pickup).toBe(5);
  });
});
