import {describe,expect,test} from 'vitest';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {stack,type ItemStack} from '../../../src/games/blockcraft/data/items';
import {splitXp,xpOrbValue} from '../../../src/games/blockcraft/entity/items';
import {fill,harness} from './entities-helpers';

const items=(h:ReturnType<typeof harness>)=>h.game.entities.all().filter(e=>e.kind==='item'&&!e.removed);
const still={x:0,y:0,z:0};

describe('dropped items',()=>{
  test('nearby equal stacks merge into one entity within a few ticks',()=>{
    const h=harness();h.game.player.state.x=20;
    h.game.entities.dropItem(stack('cobblestone',10),5.5,60.2,5.5,still);
    h.game.entities.dropItem(stack('cobblestone',12),5.7,60.2,5.6,still);
    h.tick(5);
    const list=items(h);expect(list).toHaveLength(1);expect((list[0].data.stack as ItemStack).count).toBe(22);
  });
  test('different items, different wear and totals above the stack size stay apart',()=>{
    const h=harness();h.game.player.state.x=20;
    h.game.entities.dropItem(stack('cobblestone',60),5.5,60.2,5.5,still);
    h.game.entities.dropItem(stack('cobblestone',10),5.6,60.2,5.5,still);
    h.game.entities.dropItem(stack('dirt',1),5.5,60.2,5.6,still);
    h.game.entities.dropItem(stack('iron_pickaxe',1,3),5.4,60.2,5.5,still);
    h.game.entities.dropItem(stack('iron_pickaxe',1),5.5,60.2,5.4,still);
    h.tick(50);
    expect(items(h)).toHaveLength(5);
  });
  test('a stack bigger than the maximum is split; invalid stacks are ignored',()=>{
    const h=harness();h.game.player.state.x=20;
    h.game.entities.dropItem(stack('stone',150),5.5,61,5.5);
    h.game.entities.dropItem({id:'nope',count:1},5.5,61,5.5);
    h.game.entities.dropItem({id:'stone',count:0},5.5,61,5.5);
    expect(items(h).map(e=>(e.data.stack as ItemStack).count).sort()).toEqual([22,64,64]);
  });
  test('is picked up only after its delay, with itemPickedUp and a pop',()=>{
    const h=harness(),picked:ItemStack[]=[];h.game.events.on('itemPickedUp',({stack})=>picked.push(stack));
    h.game.entities.dropItem(stack('stick',3),.9,60.5,.5,still,10);
    h.tick(5);expect(items(h)).toHaveLength(1);expect(h.game.inventory.count('stick')).toBe(0);
    h.tick(8);
    expect(items(h)).toHaveLength(0);expect(h.game.inventory.count('stick')).toBe(3);
    expect(picked).toEqual([stack('stick',3)]);expect(h.sounds()).toContain('pop');
  });
  test('a magnet pull draws ready items toward the player',()=>{
    const h=harness();
    h.game.entities.dropItem(stack('stick'),2.9,60.2,.5,still,0);
    const e=items(h)[0];h.tick(1);
    expect(e.vx).toBeLessThan(0);
    h.tick(40);expect(h.game.inventory.count('stick')).toBe(1);
  });
  test('a full inventory takes what fits and leaves the rest on the ground',()=>{
    const h=harness();
    for(let i=0;i<35;i++)h.game.inventory.setSlot(i,stack('dirt',64));
    h.game.inventory.add=s=>{const free=h.game.inventory.slots.findIndex(x=>!x);if(free<0)return s.count;const n=Math.min(10,s.count);h.game.inventory.setSlot(free,{...s,count:n});return s.count-n;};
    h.game.entities.dropItem(stack('stick',25),.9,60.2,.5,still,0);
    h.tick(2);
    const left=items(h);expect(left).toHaveLength(1);expect((left[0].data.stack as ItemStack).count).toBe(15);
  });
  test('despawns after 5 minutes and burns in lava',()=>{
    const h=harness();h.game.player.state.x=30;
    fill(h.game,8,59,-1,10,59,1,B.lava);
    h.game.entities.dropItem(stack('stick'),5.5,60.2,5.5,still);
    h.game.entities.dropItem(stack('dirt'),9.5,60.5,.5,still);
    h.tick(20);expect(items(h).map(e=>(e.data.stack as ItemStack).id)).toEqual(['stick']);
    h.tick(5980);expect(items(h)).toHaveLength(0);
  });
  test('floats up in water',()=>{
    const h=harness();h.game.player.state.x=30;
    fill(h.game,-4,50,-4,4,59,4,B.water);
    h.game.entities.dropItem(stack('stick'),.5,55,.5,still);
    const e=items(h)[0];h.tick(200);
    expect(e.y).toBeGreaterThan(58);
  });
});

describe('experience orbs',()=>{
  test('rewards split into vanilla orb values',()=>{
    expect(xpOrbValue(25)).toBe(17);expect(splitXp(25)).toEqual([17,7,1]);
    expect(splitXp(100).reduce((a,b)=>a+b,0)).toBe(100);
    const h=harness();h.game.player.state.x=30;
    h.game.entities.dropXp(25,5.5,61,5.5);
    expect(h.game.entities.all().filter(e=>e.kind==='xp_orb').map(e=>e.data.points)).toEqual([17,7,1]);
  });
  test('are attracted to the player within 8 blocks and give their points',()=>{
    const h=harness();
    h.game.entities.dropXp(7,5.5,60.5,.5);
    const orb=h.game.entities.all().find(e=>e.kind==='xp_orb')!;orb.vx=orb.vy=orb.vz=0;
    const far=h.game.entities.spawn('xp_orb',.5,60.5,20.5,{data:{points:3}})!;
    h.tick(10);expect(orb.x).toBeLessThan(5.5);expect(far.z).toBeCloseTo(20.5,1);
    h.tick(80);
    expect(h.xp).toEqual([7]);expect(orb.removed).toBe(true);expect(far.removed).toBe(false);
  });
  test('invalid orb data is rejected',()=>{
    const h=harness();
    expect(h.game.entities.spawn('xp_orb',0,61,0,{data:{points:-2}})).toBeNull();
    expect(h.game.entities.spawn('item',0,61,0,{data:{stack:{id:'nope',count:1}}})).toBeNull();
  });
});
