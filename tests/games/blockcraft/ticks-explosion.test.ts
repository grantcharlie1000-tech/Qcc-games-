import {describe,expect,test} from 'vitest';
import {createTickGame} from './ticks-helpers';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {exposure} from '../../../src/games/blockcraft/world/explosion';
import type {Entity} from '../../../src/games/blockcraft/engine/contracts';

const Y=60;
const target=(g:ReturnType<typeof createTickGame>,x:number,z:number):Entity=>{
  g.entities.register({kind:'dummy',category:'hostile',width:.6,height:1.8,maxHealth:200});
  return g.entities.spawn('dummy',x,Y,z)!;
};
function countAir(g:ReturnType<typeof createTickGame>,r:number){
  let n=0;for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++)for(let y=Y-r;y<Y;y++)if(g.world.get(x,y,z)===0)n++;return n;
}

describe('explode',()=>{
  test('blasts a crater by blast resistance and drops a share of the blocks',()=>{
    const g=createTickGame({block:B.dirt});
    const volumes:number[]=[],play=g.sounds.play.bind(g.sounds);
    g.sounds.play=(name,at,o)=>{if(name==='explode')volumes.push(o?.volume??1);play(name,at,o);};
    for(let x=-1;x<=1;x++)g.set(x,Y-3,2,'obsidian');
    g.ticks.explode(.5,Y,.5,4,null,false);
    const removed=countAir(g,6);
    expect(removed).toBeGreaterThan(20);
    expect(g.get(0,Y-1,0)).toBe('air');
    expect(g.get(0,Y-3,2)).toBe('obsidian');
    expect(g.dropCalls.every(c=>c.tool===null&&c.cause==='explosion')).toBe(true);
    expect(g.drops.length).toBeGreaterThan(0);
    expect(g.drops.length).toBeLessThan(removed*.5);
    expect(g.sounds.played.some(s=>s.name==='explode')).toBe(true);
    // Vanilla GENERIC_EXPLODE at volume 4 (heard 64 blocks away); blown blocks make no break sounds of their own.
    expect(volumes).toEqual([4]);expect(g.sounds.played.some(s=>s.name.startsWith('break:'))).toBe(false);
  });

  test('TNT drops every block it breaks (vanilla tntExplosionDropDecay false); other blasts drop one in power',()=>{
    const g=createTickGame({block:B.dirt});
    g.entities.spawn('primed_tnt',.5,Y,.5,{data:{fuse:1,byPlayer:false}});
    g.run(1);
    const removed=countAir(g,6);
    expect(removed).toBeGreaterThan(20);
    expect(g.dropCalls.filter(c=>c.id===B.dirt)).toHaveLength(removed);
    // A mob blast (a creeper) keeps the decay.
    const m=createTickGame({block:B.dirt});
    const creeper=target(m,20.5,20.5);
    m.ticks.explode(.5,Y,.5,4,creeper,false);
    expect(m.dropCalls.length).toBeLessThan(countAir(m,6)*.5);
  });

  test('stone resists more than dirt and bedrock never breaks',()=>{
    const stone=createTickGame(),dirt=createTickGame({block:B.dirt});
    stone.ticks.explode(.5,Y,.5,4);dirt.ticks.explode(.5,Y,.5,4);
    expect(countAir(stone,6)).toBeLessThan(countAir(dirt,6));
    const low=createTickGame({height:3});
    low.set(0,0,0,'bedrock');
    low.ticks.explode(.5,1,.5,4);
    expect(low.get(0,0,0)).toBe('bedrock');
  });

  test('an explosion in water breaks no blocks',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'water');
    g.ticks.explode(.5,Y+.06,.5,4);
    expect(g.get(0,Y-1,0)).toBe('stone');
  });

  test('damages entities and the player by distance and exposure, with knockback',()=>{
    const g=createTickGame();
    const open=target(g,3.5,.5),shielded=target(g,-2.5,.5),far=target(g,12.5,.5);
    for(let y=Y;y<Y+3;y++)for(let z=-1;z<=1;z++)g.set(-1,y,z,'obsidian');
    g.player.teleport(.5,Y,2.5);
    g.ticks.explode(.5,Y,.5,4,null,true);
    const hit=(e:Entity)=>g.entityHits.find(h=>h.entity===e);
    expect(hit(open)!.amount).toBeGreaterThan(5);
    expect(hit(open)!.source).toMatchObject({kind:'explosion',byPlayer:true});
    expect(hit(shielded)?.amount??0).toBeLessThan(hit(open)!.amount);
    expect(hit(far)).toBeUndefined();
    expect(open.vx).toBeGreaterThan(0);
    expect(g.playerHits).toHaveLength(1);
    expect(g.playerHits[0].source.kind).toBe('explosion');
    // Vanilla: (int)((d²+d)/2 × 7 × 2r + 1) with d = (1 − distance/2r) × exposure.
    const d=(1-Math.hypot(0,0,2)/8)*1;
    expect(g.playerHits[0].amount).toBe(Math.floor((d*d+d)/2*7*8+1));
    expect(g.pushes[0].z).toBeGreaterThan(0);
  });

  test('exposure is the share of unobstructed rays to the box',()=>{
    const g=createTickGame();
    expect(exposure(g.world,.5,Y+1,.5,3.2,Y,.2,3.8,Y+1.8,.8)).toBe(1);
    for(let y=Y;y<Y+4;y++)for(let z=-2;z<=2;z++)g.set(2,y,z,'stone');
    expect(exposure(g.world,.5,Y+1,.5,3.2,Y,.2,3.8,Y+1.8,.8)).toBe(0);
  });

  test('chain-primes TNT with a short fuse and passes on who lit it',()=>{
    const g=createTickGame();
    g.set(2,Y,0,'tnt');
    g.ticks.explode(.5,Y,.5,4,null,true);
    expect(g.get(2,Y,0)).toBe('air');
    const tnt=g.entities.all().filter(e=>e.kind==='primed_tnt');
    expect(tnt).toHaveLength(1);
    expect(tnt[0].data.fuse).toBeGreaterThanOrEqual(10);
    expect(tnt[0].data.fuse).toBeLessThan(30);
    expect(tnt[0].data.byPlayer).toBe(true);
  });

  test('fire explosions set fire to some cleared blocks',()=>{
    const g=createTickGame({block:B.dirt});
    g.ticks.explode(.5,Y,.5,4,null,false,true);
    let fires=0;for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++)for(let y=Y-6;y<Y+2;y++)if(g.get(x,y,z)==='fire')fires++;
    expect(fires).toBeGreaterThan(0);
  });
});

describe('primed_tnt',()=>{
  test('explodes after an 80-tick fuse at its position, attributed to the igniter',()=>{
    const g=createTickGame();
    const tnt=g.entities.spawn('primed_tnt',.5,Y,.5,{data:{fuse:80,byPlayer:true}})!;
    // The igniter already hissed the fuse (interaction for flint and steel, fire for burning TNT): spawning adds none.
    expect(g.sounds.played.some(s=>s.name==='fuse')).toBe(false);
    expect(g.entities.kind('primed_tnt')!.render).toBe('block');
    expect(g.entities.kind('primed_tnt')!.block!(tnt)).toBe(blockId('tnt'));
    const t=target(g,3.5,.5);
    g.run(79);
    expect(tnt.removed).toBe(false);
    expect(g.get(0,Y-1,0)).toBe('stone');
    g.run(1);
    expect(tnt.removed).toBe(true);
    expect(g.get(0,Y-1,0)).toBe('air');
    expect(g.entityHits.find(h=>h.entity===t)!.source.byPlayer).toBe(true);
  });

  test('a big chain spreads its explosions over several ticks',()=>{
    const g=createTickGame();
    const limit=g.ticks.limits.explosions;
    const tnt=Array.from({length:limit+4},(_,i)=>g.entities.spawn('primed_tnt',(i%5)*3+.5,Y+10,Math.floor(i/5)*3+.5,{data:{fuse:1,byPlayer:false}})!);
    g.run(1);
    expect(tnt.filter(e=>e.removed)).toHaveLength(limit);
    g.run(1);
    expect(tnt.every(e=>e.removed)).toBe(true);
  });

  test('restoreData keeps valid fuses and rejects garbage',()=>{
    const g=createTickGame();
    const k=g.entities.kind('primed_tnt')!,f=g.entities.kind('falling_block')!;
    expect(k.restoreData!({fuse:12,byPlayer:true})).toEqual({fuse:12,byPlayer:true});
    expect(k.restoreData!({fuse:'x'})).toBeNull();
    expect(f.restoreData!({block:B.sand,time:3})).toEqual({block:B.sand,time:3});
    expect(f.restoreData!({block:9999})).toBeNull();
    expect(f.restoreData!({block:0})).toBeNull();
  });
});
