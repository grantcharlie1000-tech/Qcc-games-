import {describe,expect,test} from 'vitest';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {CHUNK_VOLUME,LAYER,chunkKey} from '../../../src/games/blockcraft/engine/constants';
import {MAX_SAVED,MAX_STORED,type EntityDebug} from '../../../src/games/blockcraft/entity/entities';
import type {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import {harness,monster,walker,type EntityHarness} from './entities-helpers';

// Entities of unloaded chunks (vanilla entity chunks): a saved entity whose chunk is not loaded waits, in its save form,
// until the chunk loads again, instead of staying frozen in the simulation; the save keeps them as `far`.
const sheep=()=>walker({kind:'sheep',restoreData:d=>Number.isInteger(d.colour)?d:null});
const load=(world:VoxelWorld,cx:number,cz:number)=>{
  const blocks=new Uint8Array(CHUNK_VOLUME);blocks.fill(B.stone,0,60*LAYER);world.insert(cx,cz,{blocks,biomes:new Uint8Array(LAYER)});
};
const debug=(h:EntityHarness)=>(h.game.entities as unknown as {debug:EntityDebug}).debug;
type Saved={v:number;list:{k:string;i:number;x:number}[];far:{k:string;i:number;x:number;d:Record<string,unknown>}[]};

describe('entities of unloaded chunks',()=>{
  test('leave the simulation with their chunk and come back with it, same id and state',()=>{
    const h=harness({kinds:[sheep()]}),world=h.game.world as VoxelWorld;
    const removed:number[]=[];h.game.events.on('entityRemoved',p=>removed.push(p!.entity.id));
    const s=h.game.entities.spawn('sheep',40.5,60,.5,{data:{colour:4},baby:true})!;h.game.entities.damage(s,3,{kind:'mob'});
    h.tick(30);
    world.remove(chunkKey(2,0));h.tick(1);
    expect(h.game.entities.all()).toHaveLength(0);expect(debug(h).stored).toBe(1);
    // Unloaded, not gone: no entityRemoved.
    expect(removed).toEqual([]);
    const other=h.game.entities.spawn('sheep',.5,60,.5,{data:{colour:1}})!;expect(other.id).not.toBe(s.id);
    load(world,2,0);
    const back=h.game.entities.all().find(e=>e.id===s.id)!;
    expect(back).toMatchObject({kind:'sheep',baby:true,health:17,data:{colour:4}});
    expect(back.x).toBeCloseTo(s.x,3);expect(debug(h).stored).toBe(0);
  });
  test('hostile and despawning kinds stay frozen instead (the despawn rules remove them)',()=>{
    const h=harness({kinds:[monster(),walker({kind:'fish',category:'water'})]});
    const m=h.game.entities.spawn('monster',140.5,60,.5)!,f=h.game.entities.spawn('fish',20.5,60,100.5)!;
    h.tick(1);
    expect(debug(h).stored).toBe(0);expect(m.removed).toBe(true);// beyond 128 blocks
    expect(f.removed).toBe(false);expect(debug(h).frozen).toBe(1);
  });
  test('the save keeps them as `far`; a restore waits for each chunk to load',()=>{
    const a=harness({kinds:[sheep()]});
    const near=a.game.entities.spawn('sheep',3.5,60,3.5,{data:{colour:2}})!,far=a.game.entities.spawn('sheep',90.5,60,.5,{data:{colour:7}})!;
    a.tick(1);
    const saved=JSON.parse(JSON.stringify(a.game.entities.serialize?.())) as Saved;
    expect(saved.list.map(e=>e.i)).toEqual([near.id]);expect(saved.far.map(e=>e.i)).toEqual([far.id]);
    const b=harness({kinds:[sheep()]});
    b.game.entities.restore?.(saved);
    expect(b.game.entities.all().map(e=>e.id)).toEqual([near.id]);expect(debug(b).stored).toBe(1);
    // New entities never take a waiting entity's id.
    expect(b.game.entities.spawn('sheep',1.5,60,1.5,{data:{colour:0}})!.id).toBeGreaterThan(far.id);
    load(b.game.world as VoxelWorld,5,0);
    expect(b.game.entities.all().find(e=>e.id===far.id)?.data).toEqual({colour:7});
    // A save entry of a chunk that is not loaded yet waits too (the world loads after a restore).
    const c=harness({kinds:[sheep()]});
    c.game.entities.restore?.({v:1,list:[{k:'sheep',i:9,x:90.5,y:60,z:.5,d:{colour:3}}],far:[{k:'sheep',x:'x',z:0},{k:'nope',x:90,y:60,z:0}]});
    expect(c.game.entities.all()).toHaveLength(0);expect(debug(c).stored).toBe(1);
    load(c.game.world as VoxelWorld,5,0);expect(c.game.entities.all().map(e=>e.id)).toEqual([9]);
  });
  test(`a farm of more than ${MAX_SAVED} animals in loaded chunks is saved whole, the player's own first`,()=>{
    const dog=walker({kind:'dog'});
    const a=harness({kinds:[sheep(),dog]});
    // 250 sheep around the player and a tamed dog sitting at the far side of the loaded area.
    const flock=Array.from({length:250},(_,i)=>a.game.entities.spawn('sheep',-8.5+(i%16),60,-8.5+Math.floor(i/16),{data:{colour:i%16}})!);
    const pet=a.game.entities.spawn('dog',40.5,60,40.5,{data:{owner:'player',sitting:true}})!;
    a.tick(1);
    expect(a.game.entities.all()).toHaveLength(251);
    const saved=JSON.parse(JSON.stringify(a.game.entities.serialize?.())) as Saved;
    expect(saved.list).toHaveLength(MAX_SAVED);
    // The player's own animal is never the one cut; the rest wait in `far` instead of being dropped.
    expect(saved.list[0].i).toBe(pet.id);
    expect(saved.list.length+saved.far.length).toBe(251);
    const b=harness({kinds:[sheep(),dog]});
    (b.game.world as VoxelWorld).clear();
    b.game.entities.restore?.(saved);
    for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++)load(b.game.world as VoxelWorld,cx,cz);
    const back=b.game.entities.all();
    expect(back).toHaveLength(251);
    expect(new Set(back.map(e=>e.id))).toEqual(new Set([...flock,pet].map(e=>e.id)));
    expect(back.find(e=>e.id===pet.id)?.data).toEqual({owner:'player',sitting:true});
  });
  test(`at most ${MAX_STORED} are kept: the player's own first, then the nearest to the player or the world spawn`,()=>{
    const h=harness({kinds:[sheep()]});
    const p=h.game.player.state;p.spawn={x:.5,y:60,z:.5};
    const entry=(x:number,d:Record<string,unknown>={colour:1})=>({k:'sheep',x,y:60,z:.5,d});
    // Animals left far east while exploring, then a tamed wolf left at a far-away place and animals nearer home.
    const farAway=MAX_STORED*3/4,nearer=MAX_STORED*7/20;
    h.game.entities.restore?.({v:1,list:[],far:Array.from({length:farAway},(_,i)=>entry(3000.5+i*2))});
    h.game.entities.restore?.({v:1,list:[],far:[entry(5000.5,{colour:0,owner:'player'}),...Array.from({length:nearer},(_,i)=>entry(100.5+i))]});
    expect(debug(h).stored).toBe(farAway+nearer+1);
    const saved=h.game.entities.serialize?.() as Saved;
    expect(saved.far).toHaveLength(MAX_STORED);
    expect(saved.far[0].d.owner).toBe('player');
    expect(saved.far.slice(1,nearer+1).every(e=>e.x<1000)).toBe(true);
    // The farthest of the explored animals are the ones left out.
    expect(Math.max(...saved.far.slice(1).map(e=>e.x))).toBeCloseTo(3000.5+(MAX_STORED-nearer-2)*2,3);
    // In memory too, the store never grows far beyond the cap, and keeps the same ones.
    h.game.entities.restore?.({v:1,list:[],far:Array.from({length:MAX_STORED/4},(_,i)=>entry(1000.5+i))});
    expect(debug(h).stored).toBeLessThanOrEqual(MAX_STORED*1.25);
    expect((h.game.entities.serialize?.() as Saved).far.some(e=>e.d.owner==='player')).toBe(true);
  });
});
